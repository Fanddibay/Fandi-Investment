// Live symbol search via the search-symbols edge function (Yahoo proxy).
// Covers US (NYSE/NASDAQ) and Indonesian (.JK / IDX) tickers.

const BASE = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export async function searchSymbols(query) {
  const q = query.trim()
  if (!q) return []
  try {
    const res = await fetch(
      `${BASE}/functions/v1/search-symbols?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${KEY}`, apikey: KEY } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

// Map a Yahoo quote type + ticker to our internal asset_class and default unit.
export function classify(type, symbol) {
  const isIDX = symbol.endsWith('.JK')
  if (type === 'etf') return { asset_class: 'etf', unit: isIDX ? 'lot' : 'shares' }
  if (type === 'mutualfund') return { asset_class: 'fund', unit: 'unit' }
  return { asset_class: 'stock', unit: isIDX ? 'lot' : 'shares' }
}
