// ---------------------------------------------------------------------------
// Transaction aggregation engine
// ---------------------------------------------------------------------------
// Derives a position (quantity, invested amount, average cost, realized P&L)
// from a ledger of BUY/SELL transactions. This is the single source of truth
// for "how much do I own and what did it cost" — the valuation engine
// (valuation.js) then turns that into current value / unrealized P&L.
//
// Cost basis uses the MOVING-AVERAGE method: a SELL removes shares at the
// running average cost, so invested = avgCost × remaining quantity. When you
// never sell, this is identical to the naive sum-of-all-BUYs.
//
// Pure module — no Vue / Supabase imports — so it runs directly under
// `node --test`. Quantities are in the asset's DISPLAY unit (lots / units /
// grams / shares); unitShares() converts a lot to its 100 underlying shares.
// ---------------------------------------------------------------------------

import { unitShares, parseLocaleNumber } from './valuation.js'

// Coerce to a finite number; treat null/undefined/'' as 0 (a transaction field
// should never be "absent" the way an optional holding field can be).
function n(v) {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'string' ? parseLocaleNumber(v) : Number(v)
  return Number.isFinite(x) ? x : 0
}

// Order transactions chronologically. transaction_date is day-granular, so
// created_at breaks ties for multiple trades on the same day. Missing dates
// sort last (treated as "now") but keep insertion order via created_at.
function chronological(txns) {
  return [...txns].sort((a, b) => {
    const da = a.transaction_date ? Date.parse(a.transaction_date) : Infinity
    const db = b.transaction_date ? Date.parse(b.transaction_date) : Infinity
    if (da !== db) return da - db
    const ca = a.created_at ? Date.parse(a.created_at) : 0
    const cb = b.created_at ? Date.parse(b.created_at) : 0
    return ca - cb
  })
}

// Aggregate a list of transactions for ONE asset into a position summary.
//   unit — the asset's display unit ('lot' | 'gram' | 'unit' | 'shares' …),
//          used to convert the per-display-unit average cost into a
//          per-underlying-share cost the market valuation engine expects.
export function aggregate(txns = [], { unit = 'shares' } = {}) {
  const list = chronological(txns)
  const mult = unitShares(unit)

  let qty = 0 // running quantity in display units
  let costBasis = 0 // running cost of the shares still held (money)
  let realizedPnl = 0
  let buyCount = 0
  let sellCount = 0
  const timeline = [] // cumulative invested / qty after each event

  for (const t of list) {
    const tQty = n(t.quantity)
    const isSell = String(t.type).toUpperCase() === 'SELL'

    if (isSell) {
      sellCount++
      // Average unit cost of the position right before the sale.
      const avgUnitCost = qty > 0 ? costBasis / qty : 0
      const soldQty = Math.min(tQty, qty) // can't sell more than held
      const proceeds = n(t.total_amount) || n(t.unit_price) * tQty * mult
      realizedPnl += proceeds - avgUnitCost * soldQty
      costBasis -= avgUnitCost * soldQty
      qty -= soldQty
      if (qty < 1e-9) {
        qty = 0
        costBasis = 0
      } // clear FP dust on a full exit
    } else {
      buyCount++
      const amount = n(t.total_amount) || n(t.unit_price) * tQty * mult
      qty += tQty
      costBasis += amount
    }

    timeline.push({
      date: t.transaction_date ?? null,
      type: isSell ? 'SELL' : 'BUY',
      cumulativeInvested: round(costBasis),
      cumulativeQty: round(qty),
    })
  }

  const totalQuantity = round(qty)
  const investedAmount = round(costBasis)
  const avgCostPerUnit = totalQuantity > 0 ? investedAmount / totalQuantity : 0
  const avgCostPerShare =
    totalQuantity * mult > 0 ? investedAmount / (totalQuantity * mult) : 0

  const dated = list.filter((t) => t.transaction_date)
  return {
    totalQuantity,
    investedAmount,
    avgCostPerUnit,
    avgCostPerShare,
    realizedPnl: round(realizedPnl),
    buyCount,
    sellCount,
    txnCount: list.length,
    firstDate: dated[0]?.transaction_date ?? null,
    lastDate: dated[dated.length - 1]?.transaction_date ?? null,
    timeline,
  }
}

// Round to 6 dp to keep fund unit fractions exact while killing FP noise.
function round(v) {
  return Math.round((v + Number.EPSILON) * 1e6) / 1e6
}
