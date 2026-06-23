// ---------------------------------------------------------------------------
// Market news sources
// ---------------------------------------------------------------------------
// RSS feeds run through Vite dev proxies (no CORS headers). In production the
// `fetch-news` Supabase edge function pulls + parses server-side and writes
// rows into `news_items`. This module is the shared source of truth for the
// feed list and the pure parsing / sentiment / tagging logic.

export const NEWS_SOURCES = [
  // Global – English
  { name: 'CNBC', category: 'Markets', url: '/cnbc-rss?partnerId=wrss01&id=20910258' },
  { name: 'CNBC', category: 'Macro', url: '/cnbc-rss?partnerId=wrss01&id=10000664' },
  { name: 'MarketWatch', category: 'Markets', url: '/mw-rss/marketwatch/topstories/' },
  { name: 'Reuters', category: 'Markets', url: '/reuters-rss/reuters/businessNews' },
  { name: 'Reuters', category: 'Macro', url: '/reuters-rss/reuters/topNews' },
  // Indonesian
  { name: 'CNBC Indonesia', category: 'Indonesia', url: '/cnbcid-rss/market' },
  { name: 'CNBC Indonesia', category: 'Indonesia', url: '/cnbcid-rss/investment' },
  { name: 'Kontan', category: 'Indonesia', url: '/kontan-rss/investasi' },
]

// Per-symbol Yahoo Finance headline feed.
export function yahooSymbolFeed(symbol) {
  return `/yahoo-rss?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
}

// --- Sentiment ---------------------------------------------------------------
const POSITIVE = [
  'surge', 'surges', 'jump', 'jumps', 'gain', 'gains', 'rally', 'rallies', 'beat',
  'beats', 'record', 'soar', 'soars', 'rise', 'rises', 'climb', 'climbs', 'high',
  'higher', 'growth', 'profit', 'upgrade', 'boost', 'rebound', 'outperform', 'top',
  'tops', 'strong', 'bullish', 'win', 'wins', 'up',
]
const NEGATIVE = [
  'fall', 'falls', 'drop', 'drops', 'plunge', 'plunges', 'slump', 'slumps', 'miss',
  'misses', 'loss', 'losses', 'cut', 'cuts', 'downgrade', 'fear', 'fears', 'crash',
  'sink', 'sinks', 'low', 'lower', 'warn', 'warns', 'warning', 'decline', 'declines',
  'slip', 'slips', 'tumble', 'tumbles', 'weak', 'bearish', 'risk', 'selloff', 'down',
]

export function scoreSentiment(text) {
  const words = String(text || '').toLowerCase().match(/[a-z']+/g) || []
  let score = 0
  for (const w of words) {
    if (POSITIVE.includes(w)) score += 1
    else if (NEGATIVE.includes(w)) score -= 1
  }
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return 'neutral'
}

// --- Categorisation ----------------------------------------------------------
// Rules run in order — first match wins. Keep higher-precision rules first.
const CATEGORY_RULES = [
  { category: 'Earnings', re: /earnings|revenue|quarter|q[1-4]\b|profit|guidance|eps/i },
  { category: 'Crypto', re: /bitcoin|crypto|ethereum|btc|blockchain|coin/i },
  { category: 'Gold', re: /\bgold\b|emas|bullion|precious metal|\bsilver\b|\bxau\b/i },
  { category: 'Macro', re: /fed|federal reserve|inflation|interest rate|gdp|jobs|economy|treasury|dollar|cpi|fomc/i },
  { category: 'Technology', re: /nvidia|artificial intelligence|\bai\b|semiconductor|chip|microsoft|apple|google|meta|amazon|tech/i },
  { category: 'Banking', re: /\bbank\b|banking|bbca|bbri|bri|bca|mandiri|kredit|credit|pinjaman/i },
  { category: 'Indonesia', re: /indonesia|\bidx\b|bursa|rupiah|bi rate|\bojk\b|ihsg|jakarta|emiten/i },
]

export function categorize(text, fallback = 'Markets') {
  for (const rule of CATEGORY_RULES) if (rule.re.test(text || '')) return rule.category
  return fallback
}

// --- Symbol tagging ----------------------------------------------------------
// Maps natural-language company/asset mentions back to portfolio tickers.
const SYMBOL_ALIASES = {
  // US ETFs
  QQQ: ['qqq', 'nasdaq', 'invesco qqq', 'nasdaq 100'],
  SPY: ['spy', 's&p 500', 's&p500', 'sp 500', 'spdr'],
  // US Tech
  NVDA: ['nvidia', 'nvda', 'h100', 'a100', 'blackwell'],
  AAPL: ['apple', 'aapl', 'iphone', 'ipad', 'mac', 'tim cook'],
  TSLA: ['tesla', 'tsla', 'elon musk', 'cybertruck'],
  MSFT: ['microsoft', 'msft', 'azure', 'windows', 'copilot'],
  GOOGL: ['google', 'googl', 'alphabet', 'gemini', 'waymo'],
  META: ['meta', 'facebook', 'instagram', 'zuckerberg', 'whatsapp'],
  AMZN: ['amazon', 'amzn', 'aws', 'bezos'],
  // Indonesian Banks
  'BBCA.JK': ['bbca', 'bca', 'bank central asia'],
  'BBRI.JK': ['bbri', 'bri', 'bank rakyat indonesia', 'bank bri'],
  'BBNI.JK': ['bbni', 'bni', 'bank negara indonesia', 'bank bni'],
  'BMRI.JK': ['bmri', 'mandiri', 'bank mandiri'],
  // Indonesian Other
  'ANTM.JK': ['antam', 'aneka tambang', 'antm'],
  'TLKM.JK': ['tlkm', 'telkom', 'telekomunikasi indonesia'],
  // Gold
  'GOLD-ANTAM': ['gold', 'emas', 'bullion', 'gold price', 'harga emas', 'logam mulia', 'lm antam'],
}

export function tagSymbol(text, knownSymbols = []) {
  const hay = String(text || '').toLowerCase()
  for (const sym of knownSymbols) {
    const aliases = SYMBOL_ALIASES[sym] || [sym.toLowerCase()]
    if (aliases.some((a) => hay.includes(a))) return sym
  }
  return null
}

// --- Tab classification ------------------------------------------------------
// Determines which news tabs an article belongs to. Returns an array of tab ids
// so one article can show in multiple tabs (e.g. Reuters NVDA article → "global"
// AND "foryou" when the user holds NVDA).
const IDX_SYMBOLS = new Set([
  'BBCA.JK', 'BBRI.JK', 'ANTM.JK', 'TLKM.JK', 'BBNI.JK', 'BMRI.JK',
])
const INDO_SOURCES = new Set([
  'CNBC Indonesia', 'Kontan', 'Bisnis Indonesia', 'IDX News', 'Bareksa',
])

export function getNewsTabs(item, heldSymbols = []) {
  const tabs = new Set(['market']) // every item appears in Market
  const title = (item.title || '').toLowerCase()

  // For You: symbol tagged and user holds that asset
  if (item.symbol && heldSymbols.includes(item.symbol)) tabs.add('foryou')

  // Indonesia: Indonesian source OR IDX-listed symbol
  if (INDO_SOURCES.has(item.source) || IDX_SYMBOLS.has(item.symbol)) tabs.add('indonesia')

  // Global: Reuters/Bloomberg or Macro category
  if (['Reuters', 'Bloomberg'].includes(item.source) || item.category === 'Macro') tabs.add('global')

  // Gold: gold symbol, Gold category, or gold in title
  if (
    item.symbol === 'GOLD-ANTAM' ||
    item.category === 'Gold' ||
    /\bgold\b|\bemas\b|\bbullion\b|\bprecious metal/i.test(title)
  ) tabs.add('gold')

  return [...tabs]
}

// --- Thumbnail extraction ---------------------------------------------------
// Tries common RSS Media extension patterns; falls back to parsing description HTML.
function extractThumbnail(node) {
  // media:thumbnail (Media RSS extension)
  for (const el of node.getElementsByTagName('media:thumbnail')) {
    const url = el.getAttribute('url')
    if (url) return url
  }
  // media:content with an image medium
  for (const el of node.getElementsByTagName('media:content')) {
    const url = el.getAttribute('url')
    const type = el.getAttribute('type') || ''
    const medium = el.getAttribute('medium') || ''
    if (url && (medium === 'image' || type.startsWith('image/'))) return url
  }
  // enclosure (some feeds use this for images)
  const enc = node.querySelector('enclosure')
  if (enc) {
    const url = enc.getAttribute('url')
    const type = enc.getAttribute('type') || ''
    if (url && type.startsWith('image/')) return url
  }
  // First <img> inside the description CDATA
  const descText = node.querySelector('description')?.textContent || ''
  const imgMatch = descText.match(/<img[^>]+src=["']([^"']+)["']/i)
  return imgMatch?.[1] || null
}

// --- Summary extraction -----------------------------------------------------
// Strips HTML tags and common "read more" footers from the description field.
function extractSummary(node) {
  const raw = node.querySelector('description')?.textContent || ''
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\[\s*(?:continue reading|read more|more)\s*\]/gi, '')
    .replace(/(?:continue reading|read more)\s*[….]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 20 ? text.slice(0, 280) : null
}

// --- RSS parsing (browser) --------------------------------------------------
export function parseRssXml(xmlText, { source, category, symbol = null, knownSymbols = [] } = {}) {
  let doc
  try {
    doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  } catch {
    return []
  }
  if (doc.querySelector('parsererror')) return []

  const items = []
  for (const node of doc.querySelectorAll('item')) {
    const title = node.querySelector('title')?.textContent?.trim()
    const url = node.querySelector('link')?.textContent?.trim()
    if (!title || !url) continue
    const pub = node.querySelector('pubDate')?.textContent?.trim()
    const published_at = pub ? new Date(pub).toISOString() : null
    items.push({
      id: url,
      title,
      url,
      source,
      published_at,
      sentiment: scoreSentiment(title),
      category: categorize(title, category),
      symbol: symbol ?? tagSymbol(title, knownSymbols),
      thumbnail: extractThumbnail(node),
      summary: extractSummary(node),
    })
  }
  return items
}

// Dedupe by normalised url, newest first, capped.
export function dedupeNews(rows, cap = 80) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const key = (r.url || r.title || '').split('#')[0].replace(/\/$/, '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  out.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
  return out.slice(0, cap)
}

// --- Live client fetch (dev, via proxy) -------------------------------------
export async function fetchLiveNews(knownSymbols = []) {
  const feeds = [
    ...NEWS_SOURCES.filter((s) => s.url).map((s) => ({ ...s })),
    ...knownSymbols.map((sym) => ({
      name: 'Yahoo Finance',
      category: 'Markets',
      url: yahooSymbolFeed(sym),
      symbol: sym,
    })),
  ]

  const settled = await Promise.allSettled(
    feeds.map(async (feed) => {
      const res = await fetch(feed.url, { headers: { Accept: 'application/xml, text/xml' } })
      if (!res.ok) throw new Error(`${feed.name} → HTTP ${res.status}`)
      const xml = await res.text()
      return parseRssXml(xml, {
        source: feed.name,
        category: feed.category,
        symbol: feed.symbol ?? null,
        knownSymbols,
      })
    }),
  )

  const rows = []
  for (const r of settled) {
    if (r.status === 'fulfilled') rows.push(...r.value)
    else console.warn('[news] feed failed:', r.reason?.message ?? r.reason)
  }
  return dedupeNews(rows)
}
