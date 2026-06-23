// Reconstructs a portfolio-value time series from raw price snapshots.
//
// We don't store a historical "total portfolio value" anywhere yet, so we
// rebuild it: each holding's CURRENT value is scaled by the price ratio
// price(t) / price(now) for market-fed assets, then converted into the display
// currency using the USD→IDR rate at time t. Manually-priced assets (funds,
// bonds, manual) have no market snapshots and stay flat — which is truthful,
// since their value only moves when their NAV is updated by hand.
//
// This reflects *today's* holdings applied to past prices; it does not replay
// historical buys/sells. Over the short windows this chart covers that's an
// accurate, honest reconstruction of how the current book moved.

// Asset classes whose value tracks a live market price snapshot.
//
// Gold is intentionally excluded: its valuation uses the ANTAM buyback price,
// but the GOLD-ANTAM snapshot series is spot-derived — a different price basis.
// Scaling by it produces a false curve. Since ANTAM moves ~daily anyway, gold
// is held flat at its current value across the (sub-daily) windows we chart,
// which is the truthful reconstruction.
const MARKET_CLASSES = new Set(['stock', 'etf'])

// The snapshot symbol that prices a holding.
function snapSymbol(h) {
  return h.symbol
}

const isMarketFed = (h) => MARKET_CLASSES.has(h.asset_class)

// Carry-forward (last-known) price lookup via binary search over a symbol's
// ascending [{ t, price }] points. Returns null if t precedes the first point.
function priceAt(points, t) {
  if (!points) return null
  let lo = 0, hi = points.length - 1, res = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= t) { res = points[mid].price; lo = mid + 1 }
    else hi = mid - 1
  }
  return res
}

/**
 * @param {Array} holdings  store.holdingsWithSnapshot (needs value, currency, symbol, asset_class)
 * @param {Array} rows      raw price_snapshots [{ symbol, price, fetched_at }] ascending
 * @param {Object} opts     { displayCurrency, sinceMs, fxFallback, targetPoints }
 * @returns {Array<{ t:number, value:number }>}
 */
export function buildPortfolioSeries(holdings, rows, opts = {}) {
  const {
    displayCurrency = 'IDR',
    sinceMs = null,
    fxFallback = 16000,
    targetPoints = 60,
  } = opts

  if (!rows?.length || !holdings?.length) return []

  // Group snapshots by symbol into ascending price points.
  const bySymbol = {}
  for (const r of rows) {
    const t = new Date(r.fetched_at).getTime()
    ;(bySymbol[r.symbol] ??= []).push({ t, price: Number(r.price) })
  }
  for (const s in bySymbol) bySymbol[s].sort((a, b) => a.t - b.t)

  // Latest price per symbol = the "now" reference for the ratio.
  const priceNow = {}
  for (const s in bySymbol) priceNow[s] = bySymbol[s].at(-1).price
  const fxNow = priceNow['USD-IDR'] ?? fxFallback

  // Window bounds.
  const firstT = bySymbol[Object.keys(bySymbol)[0]][0].t
  const dataMin = Math.min(...Object.values(bySymbol).map((p) => p[0].t))
  const dataMax = Math.max(...Object.values(bySymbol).map((p) => p.at(-1).t))
  const tMin = sinceMs ? Math.max(sinceMs, dataMin) : dataMin
  const tMax = dataMax
  if (tMax <= tMin) return []

  // Even buckets across the window, capped to ~targetPoints for a clean line.
  const step = Math.max(60000, Math.ceil((tMax - tMin) / targetPoints))
  const buckets = []
  for (let t = tMin; t < tMax; t += step) buckets.push(t)
  buckets.push(tMax)

  const series = []
  for (const t of buckets) {
    const fxT = priceAt(bySymbol['USD-IDR'], t) ?? fxNow
    let total = 0
    for (const h of holdings) {
      const cur = h.currency || 'USD'
      let nativeVal = h.value || 0

      if (isMarketFed(h)) {
        const sym = snapSymbol(h)
        const pNow = priceNow[sym]
        const pT = priceAt(bySymbol[sym], t)
        if (pNow && pT) nativeVal = (h.value || 0) * (pT / pNow)
      }

      let v = nativeVal
      if (cur !== displayCurrency) {
        if (cur === 'USD' && displayCurrency === 'IDR') v = nativeVal * fxT
        else if (cur === 'IDR' && displayCurrency === 'USD') v = nativeVal / fxT
      }
      total += v
    }
    series.push({ t, value: total })
  }
  return series
}
