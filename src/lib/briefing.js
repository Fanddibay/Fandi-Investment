// ---------------------------------------------------------------------------
// Portfolio briefing message builder
// ---------------------------------------------------------------------------
// Turns the live portfolio state into a clean, professional Telegram message.
// Pure and framework-free so it can run client-side (the Settings "Send Test"
// button, which sends the REAL briefing) and is mirrored by the `send-briefing`
// edge function for the scheduled daily send. Keep the two output formats in
// sync — the test you see is exactly what the cron delivers.
//
// Output uses Telegram HTML (parse_mode: "HTML"): <b>, <i>, <code> only — no
// tables, so it renders identically on mobile and desktop.

// --- Formatting -----------------------------------------------------------

// Money without sign. IDR shows whole rupiah (id-ID grouping), USD two decimals.
export function fmtMoney(amount, currency) {
  const abs = Math.abs(Number(amount) || 0)
  if (currency === 'IDR') {
    return 'Rp' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(abs)
  }
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs)
}

// Money with an explicit +/- so gains and losses read at a glance.
export function fmtSignedMoney(amount, currency) {
  const sign = Number(amount) < 0 ? '-' : '+'
  return sign + fmtMoney(amount, currency)
}

// Percent with sign, one decimal. Used for daily moves and total return.
export function fmtPct(pct) {
  const n = Number(pct) || 0
  return (n < 0 ? '-' : '+') + Math.abs(n).toFixed(2) + '%'
}

// Coloured circle conveys direction without relying on red/green text (Telegram
// won't colour body text). Tiny moves under 0.05% read as flat.
export function moveDot(pct) {
  const n = Number(pct) || 0
  if (n > 0.05) return '🟢'
  if (n < -0.05) return '🔴'
  return '⚪️'
}

// "Mon, 23 Jun 2026 · 08:00 WIB" in Jakarta time, regardless of server tz.
export function fmtBriefingDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')} · ${get('hour')}:${get('minute')} WIB`
}

// --- Day P&L --------------------------------------------------------------
// A holding's money change today, in its native currency, derived from the
// day's percent move applied to its current value. 0% move → 0.
export function holdingDayPnl(h) {
  const pct = Number(h.dayChange) || 0
  const value = Number(h.value) || 0
  if (pct === 0) return 0
  const prev = value / (1 + pct / 100)
  return value - prev
}

// --- Message --------------------------------------------------------------
// `holdings`  : array of { symbol, name?, currency, value, dayChange }
// `total`     : { value, cost, pnl, pnlPct, currency } (grandTotal, display ccy)
// `fxRate`    : USD→IDR, to convert each holding's native day P&L into display
export function buildBriefingMessage({ holdings = [], total = {}, displayCurrency = 'IDR', fxRate = 16000, now = new Date() } = {}) {
  const lines = []
  lines.push('📊 <b>Portfolio Briefing</b>')
  lines.push(`<i>${fmtBriefingDate(now)}</i>`)

  if (holdings.length === 0) {
    lines.push('')
    lines.push('No holdings yet. Add positions to start receiving daily updates.')
    return lines.join('\n')
  }

  // Split movers from flat holdings. Manually-priced funds/bonds don't move
  // intraday, so repeating "+0.00% (+Rp0)" for each is noise — they collapse
  // into one "unchanged" line. All holdings still appear; the movers lead.
  const movers = holdings
    .filter((h) => Math.abs(Number(h.dayChange) || 0) > 0.05)
    .sort((a, b) => Math.abs(Number(b.dayChange) || 0) - Math.abs(Number(a.dayChange) || 0))
  const flat = holdings.filter((h) => Math.abs(Number(h.dayChange) || 0) <= 0.05)

  lines.push('')
  lines.push('<b>Holdings today</b>')
  if (movers.length === 0) {
    lines.push('<i>No market moves today.</i>')
  }
  for (const h of movers) {
    // Gold gets an extra Rp/gram line so you know the buyback price at a glance.
    const isGold = h.kind === 'gold' || h.asset_class === 'gold'
    const dayPnl = holdingDayPnl(h)
    if (isGold) {
      const gramsOwned = Number(h.gramsOwned ?? h.units ?? h.quantity) || 0
      const pricePerGram = gramsOwned > 0 ? Number(h.value) / gramsOwned : Number(h.sellPrice ?? 0)
      lines.push(
        `${moveDot(h.dayChange)} <b>${h.symbol}</b>  ${fmtPct(h.dayChange)}  ` +
          `<i>(${fmtSignedMoney(dayPnl, h.currency)})</i>\n` +
          `   <i>Gold: ${fmtMoney(pricePerGram, 'IDR')}/g · ${gramsOwned.toLocaleString('id-ID', { maximumFractionDigits: 2 })}g owned</i>`,
      )
    } else {
      lines.push(
        `${moveDot(h.dayChange)} <b>${h.symbol}</b>  ${fmtPct(h.dayChange)}  ` +
          `<i>(${fmtSignedMoney(dayPnl, h.currency)})</i>`,
      )
    }
  }
  if (flat.length) {
    // Separate gold from other flat assets — gold gets its buyback price even
    // on unchanged days, so you always know the current rate.
    const flatGold = flat.filter((h) => h.kind === 'gold' || h.asset_class === 'gold')
    const flatOther = flat.filter((h) => h.kind !== 'gold' && h.asset_class !== 'gold')
    for (const h of flatGold) {
      const gramsOwned = Number(h.gramsOwned ?? h.units ?? h.quantity) || 0
      const pricePerGram = gramsOwned > 0 ? Number(h.value) / gramsOwned : Number(h.sellPrice ?? 0)
      lines.push(
        `⚪️ <b>${h.symbol}</b>  ${fmtPct(0)}  ` +
          `<i>(${fmtMoney(pricePerGram, 'IDR')}/g · ${gramsOwned.toLocaleString('id-ID', { maximumFractionDigits: 2 })}g)</i>`,
      )
    }
    if (flatOther.length) {
      lines.push(`⚪️ <i>Unchanged:</i> ${flatOther.map((h) => h.symbol).join(', ')}`)
    }
  }

  // Portfolio roll-up in the display currency. Day P&L is the sum of each
  // holding's native day P&L converted to the display currency.
  let dayPnlDisplay = 0
  for (const h of holdings) {
    const native = holdingDayPnl(h)
    dayPnlDisplay +=
      h.currency === displayCurrency
        ? native
        : h.currency === 'USD'
          ? native * fxRate
          : native / fxRate
  }
  const value = Number(total.value) || 0
  const prevValue = value - dayPnlDisplay
  const dayPct = prevValue > 0 ? (dayPnlDisplay / prevValue) * 100 : 0

  lines.push('')
  lines.push('<b>Portfolio</b>')
  lines.push(`💼 Value  <b>${fmtMoney(value, displayCurrency)}</b>`)
  lines.push(`📈 Today  <b>${fmtSignedMoney(dayPnlDisplay, displayCurrency)}</b> (${fmtPct(dayPct)})`)
  lines.push(`📦 Total P&amp;L  <b>${fmtSignedMoney(total.pnl, displayCurrency)}</b> (${fmtPct(total.pnlPct)})`)

  return lines.join('\n')
}
