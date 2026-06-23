// ---------------------------------------------------------------------------
// Portfolio valuation engine
// ---------------------------------------------------------------------------
// Each asset class has its OWN valuation rules. We deliberately avoid a single
// generic "price × quantity" formula, because it breaks for mutual funds: a
// fund's `entry_price` is NOT a per-unit cost, it's a total invested amount,
// so the stock formula produced wildly wrong P&L (e.g. -Rp313M on a profitable
// position). See valuateFund below.
//
// This module is intentionally pure (no Vue / Supabase imports) so it can be
// unit-tested directly under `node --test`.
// ---------------------------------------------------------------------------

// How many shares one "unit" represents. On IDX, 1 lot = 100 shares, so a
// per-share price must be multiplied by 100 × lots. Everything else is 1:1.
const UNIT_SHARES = { lot: 100 }
export function unitShares(unit) {
  return UNIT_SHARES[unit] ?? 1
}

// Human labels for the four mutual-fund categories we support.
export const FUND_CATEGORY_LABELS = {
  money_market: 'Money Market Fund',
  fixed_income: 'Bond Fund',
  equity: 'Equity Fund',
  balanced: 'Balanced Fund',
}

export function fundCategoryLabel(category) {
  return FUND_CATEGORY_LABELS[category] ?? 'Mutual Fund'
}

// Best-effort category inference from an Indonesian fund's name. Used to flag /
// pre-fill the category so a Bahana Likuid (a money-market fund) is never left
// mislabelled as Equity. Returns null when we can't tell — caller keeps the
// user's choice in that case.
export function guessFundCategory(name = '') {
  const n = name.toLowerCase()
  // Money market: "pasar uang", "likuid", "dana kas", "money market", "kas".
  if (/(pasar uang|money\s*market|likuid|dana kas|\bkas\b|maxima)/.test(n)) {
    return 'money_market'
  }
  // Bond / fixed income.
  if (/(obligasi|pendapatan tetap|fixed income|bond|sukuk|dana tetap)/.test(n)) {
    return 'fixed_income'
  }
  // Balanced / mixed allocation.
  if (/(campuran|balanced|mixed|alokasi)/.test(n)) {
    return 'balanced'
  }
  // Equity.
  if (/(saham|equity|ekuitas|growth|dividend)/.test(n)) {
    return 'equity'
  }
  return null
}

// Which asset classes are "funds" (NAV + invested-amount model).
export function isFund(holding) {
  return holding.asset_class === 'fund'
}

// Which asset classes price from a manually-entered NAV rather than a live feed.
export function isManualPriced(holding) {
  return ['fund', 'bond', 'manual'].includes(holding.asset_class)
}

// ---------------------------------------------------------------------------
// Calculators — one per asset model. Each returns a normalized shape:
//   { kind, shares, units, currentPrice, entryPrice, currentNav, entryNav,
//     value, cost, invested, pnl, pnlPct }
// `value`, `cost`, `pnl` are always in the holding's NATIVE currency.
// ---------------------------------------------------------------------------

// Stocks (IDX + US), ETFs, gold — anything priced per share/unit/gram.
// Cost basis = entry price per share × shares. Fractional shares supported.
function valuateMarket(holding, price) {
  const shares = Number(holding.quantity) * unitShares(holding.unit)
  // Live snapshot wins; otherwise a manual NAV, otherwise fall back to entry.
  const currentPrice = price ?? holding.current_nav ?? holding.entry_price ?? 0
  const entryPrice = Number(holding.entry_price) || 0
  const value = currentPrice * shares
  const cost = entryPrice * shares
  const pnl = value - cost
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
  return {
    kind: 'market',
    shares,
    units: shares,
    currentPrice,
    entryPrice,
    currentNav: currentPrice,
    entryNav: entryPrice,
    value,
    cost,
    invested: cost,
    pnl,
    pnlPct,
  }
}

// Mutual funds (money market / bond / equity / balanced).
//
// Every input is a STORED field — nothing is derived from another. In
// particular Entry NAV is NOT computed as invested ÷ units; that circular
// derivation is fragile and is what this refactor removes.
//   Current Value = units × current NAV
//   P&L           = current value − invested amount
//   P&L %         = P&L ÷ invested amount × 100
// Entry NAV is stored independently and used only for display + sanity checks.
export function valuateFund(holding) {
  const units = num(holding.quantity) ?? 0
  // Entry NAV: dedicated column first, then legacy entry_price (where funds
  // used to keep their per-unit NAV) — but never invested ÷ units.
  const entryNav = num(holding.entry_nav) ?? num(holding.entry_price) ?? 0
  // Current NAV: stored separately. No live feed for funds.
  const currentNav = num(holding.current_nav) ?? entryNav
  // Invested amount: stored cost basis (source of truth for P&L). Legacy rows
  // without the column fall back to entry NAV × units.
  const invested = num(holding.invested_amount) ?? (entryNav * units)
  const value = units * currentNav
  const pnl = value - invested
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
  return {
    kind: 'fund',
    shares: units,
    units,
    currentPrice: currentNav,
    entryPrice: entryNav,
    currentNav,
    entryNav,
    value,
    cost: invested,
    invested,
    pnl,
    pnlPct,
    warnings: validateFund({ units, entryNav, currentNav, invested, pnlPct, category: holding.category }),
  }
}

// Gold (ANTAM / gold savings / physical) — its own engine, NOT the stock one.
//   Current Value = grams owned × current gold price (ANTAM buyback / gram)
//   P&L           = current value − invested amount
//   P&L %         = P&L ÷ invested amount × 100
// `meta` carries the live ANTAM figures from the price snapshot: the buyback
// price used for valuation, the buy price, and when it was last updated.
export function valuateGold(holding, meta = {}) {
  const grams = (num(holding.quantity) ?? 0) * unitShares(holding.unit)
  // Valuation uses the realizable (buyback) price from the snapshot; fall back
  // to a manually-entered current_nav, then entry price — never breaks.
  const currentGoldPrice = num(meta.price) ?? num(holding.current_nav) ?? num(holding.entry_price) ?? 0
  // Invested amount is the stored cost; fall back to avg buy price × grams.
  const invested = num(holding.invested_amount) ?? ((num(holding.entry_price) ?? 0) * grams)
  const averageBuyPrice = grams > 0 ? invested / grams : (num(holding.entry_price) ?? 0)
  const value = grams * currentGoldPrice
  const pnl = value - invested
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
  return {
    kind: 'gold',
    provider: holding.provider || 'ANTAM',
    shares: grams,
    units: grams,
    gramsOwned: grams,
    currentPrice: currentGoldPrice,
    currentGoldPrice,
    entryPrice: averageBuyPrice,
    averageBuyPrice,
    buyPrice: num(meta.buyPrice),
    sellPrice: num(meta.sellPrice),
    lastUpdated: meta.asOf ?? null,
    value,
    cost: invested,
    invested,
    pnl,
    pnlPct,
  }
}

// Direct bonds (asset_class 'bond') — priced per lembar via a manual NAV/price.
// This is the market model: value = price × quantity, cost = entry × quantity.
function valuateBond(holding, price) {
  return valuateMarket(holding, price)
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------
// `price` is the live snapshot price for market assets (null for manual ones).
// `snapshot` is the full price row — gold uses its buy/sell/timestamp fields.
export function valuate(holding, { price = null, snapshot = null } = {}) {
  switch (holding.asset_class) {
    case 'fund':
      return valuateFund(holding)
    case 'gold':
      return valuateGold(holding, {
        price: snapshot?.price ?? price,
        buyPrice: snapshot?.buy_price,
        sellPrice: snapshot?.sell_price,
        asOf: snapshot?.fetched_at ?? null,
      })
    case 'bond':
      return valuateBond(holding, price)
    case 'stock':
    case 'etf':
    case 'manual':
    default:
      return valuateMarket(holding, price)
  }
}

// Small helper: coerce to number, but treat null/undefined/'' as "absent".
function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? parseLocaleNumber(v) : Number(v)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Locale-aware number parsing
// ---------------------------------------------------------------------------
// The original corruption (NAV "1.291,04" stored as 1.27, invested
// "20.627.194" stored as 20627.194) came from parsing Indonesian-formatted
// numbers with a US parser. This handles both id-ID ("1.291,04", thousands ".",
// decimal ",") and en-US ("1,291.04") plus plain numbers, without ever dropping
// significant digits.
export function parseLocaleNumber(input) {
  if (typeof input === 'number') return input
  if (input === null || input === undefined) return NaN
  let s = String(input).trim().replace(/[^\d.,-]/g, '') // strip currency symbols, spaces, NBSP
  if (!s) return NaN

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  const dots = (s.match(/\./g) || []).length
  const commas = (s.match(/,/g) || []).length

  let decimalSep = null
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present → the rightmost one is the decimal separator.
    decimalSep = lastDot > lastComma ? '.' : ','
  } else if (commas === 1 && (s.length - lastComma - 1) !== 3) {
    // A single comma not acting as a thousands group → decimal.
    decimalSep = ','
  } else if (dots === 1 && (s.length - lastDot - 1) !== 3) {
    // A single dot not acting as a thousands group → decimal.
    decimalSep = '.'
  }

  if (decimalSep) {
    const thousands = decimalSep === '.' ? ',' : '.'
    s = s.split(thousands).join('').replace(decimalSep, '.')
  } else {
    // No decimal separator → every dot/comma is a thousands group.
    s = s.replace(/[.,]/g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

// ---------------------------------------------------------------------------
// Fund data safeguards — detect impossible/implausible values
// ---------------------------------------------------------------------------
// A generous ceiling: a money-market fund returning more than this almost
// certainly signals bad data, not a real return.
export const MONEY_MARKET_MAX_PCT = 25

export function validateFund({ units, entryNav, currentNav, invested, pnlPct, category }) {
  const w = []
  if (!(units > 0)) w.push('Units must be greater than zero.')
  if (!(invested > 0)) w.push('Invested amount must be greater than zero.')

  // Scale mismatch — the classic locale-parsing bug (NAV stored as 1.27).
  if (entryNav > 0 && currentNav > 0) {
    const ratio = currentNav / entryNav
    if (ratio > 100 || ratio < 0.01) {
      w.push('Entry and Current NAV differ ~100×+ — likely a locale parsing error (e.g. "1.291,04" read as 1.29).')
    }
  }
  if (entryNav > 0 && entryNav < 10 && currentNav > 1000) {
    w.push('Entry NAV looks too small (<10) next to Current NAV (>1000) — check decimal/thousands separators.')
  }

  // Implausible return for a money-market fund.
  if (category === 'money_market' && Number.isFinite(pnlPct) && Math.abs(pnlPct) > MONEY_MARKET_MAX_PCT) {
    w.push(`Profit ${pnlPct.toFixed(1)}% is unrealistic for a money-market fund — verify invested amount and NAVs.`)
  }

  // Invested amount should roughly equal Entry NAV × Units (independent fields,
  // so a large drift means one was entered or parsed wrong).
  if (units > 0 && entryNav > 0 && invested > 0) {
    const implied = entryNav * units
    if (Math.abs(implied - invested) / invested > 0.05) {
      w.push(`Invested (${Math.round(invested).toLocaleString('id-ID')}) ≠ Entry NAV × Units (${Math.round(implied).toLocaleString('id-ID')}).`)
    }
  }
  return w
}
