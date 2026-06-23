// ---------------------------------------------------------------------------
// Indonesian gold (ANTAM) price source
// ---------------------------------------------------------------------------
// Source: cacing69/logam-mulia-api (listed in farizdotid/DAFTAR-API-LOKAL-
// INDONESIA), served via Cloudflare Worker. No API key. Returns ANTAM Logam
// Mulia buy/buyback prices in IDR per gram with a recorded date.
//
// The actual HTTP fetch happens server-side in the `fetch-prices` edge function
// (the worker doesn't send CORS headers, so the browser can't call it directly).
// This module holds the pure, testable picking logic shared in spirit with the
// function, plus the provider config so endpoints live in one place.

// Endpoints are reached through the Vite dev proxy (`/lm-api`, see
// vite.config.js) so the browser can read the worker despite its missing CORS
// headers. In a deployed build without the proxy the fetch fails gracefully and
// the app falls back to the DB price snapshot written by the edge function.
const GOLD_BASE = '/lm-api/api/prices'
export const GOLD_PROVIDERS = {
  primary: `${GOLD_BASE}/anekalogam`, // Aneka Logam — ANTAM Logam Mulia lines
  fallback: `${GOLD_BASE}/lakuemas`, // Laku Emas — single 1g gold line
}

// Fetch the current ANTAM 1g price (primary → fallback). Returns
// { buyPrice, sellPrice, recordedDate, source, asOf } or null on total failure.
export async function fetchAntamGoldPrice() {
  for (const url of [GOLD_PROVIDERS.primary, GOLD_PROVIDERS.fallback]) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        console.error(`[gold] ${url} → HTTP ${res.status}`)
        continue
      }
      const payload = await res.json()
      const picked = pickAntamGramPrice(payload)
      if (picked && picked.sellPrice > 0) {
        return { ...picked, asOf: payload?.timestamp ?? new Date().toISOString() }
      }
      console.error(`[gold] ${url} → no usable 1g price`)
    } catch (e) {
      console.error(`[gold] ${url} failed:`, e?.message ?? e)
    }
  }
  return null
}

// Pick the canonical 1-gram ANTAM Logam Mulia price from a provider payload.
// Returns { buyPrice, sellPrice, recordedDate, source } or null if unusable.
//   buyPrice  = price you pay to BUY (the dealer's sell price)
//   sellPrice = buyback price you GET when selling (used for realizable value)
export function pickAntamGramPrice(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : []
  const grams = rows.filter(
    (r) =>
      r &&
      r.material === 'gold' &&
      Number(r.weight) === 1 &&
      (r.weightUnit ?? 'gr') === 'gr' &&
      Number(r.buybackPrice) > 0,
  )
  if (grams.length === 0) return null

  // Prefer a plain 1g "LM Antam" line over certicard / bulk-gramasi variants,
  // which can carry per-piece pricing that distorts the per-gram figure.
  const preferred =
    grams.find(
      (r) =>
        /lm antam|logam mulia antam/i.test(r.materialType || '') &&
        !/certicard/i.test(r.materialType || ''),
    ) || grams[0]

  const buyPrice = Number(preferred.sellPrice) || 0
  const sellPrice = Number(preferred.buybackPrice) || 0
  return {
    buyPrice,
    sellPrice,
    recordedDate: preferred.recordedDate ?? null,
    source: preferred.source ?? null,
  }
}
