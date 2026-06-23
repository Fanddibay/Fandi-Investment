import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4";

// Allow the browser / scheduler to invoke this function.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Public RSS feeds (no key, no CORS). Pulled server-side and written into
// `news_items`. Mirrors src/lib/news.js — keep the two in sync.
const CNBC = "https://search.cnbc.com/rs/search/combinedcms/view.xml";
const GENERAL_FEEDS = [
  { name: "CNBC", category: "Markets", url: `${CNBC}?partnerId=wrss01&id=20910258` },
  { name: "CNBC", category: "Macro", url: `${CNBC}?partnerId=wrss01&id=10000664` },
  { name: "MarketWatch", category: "Markets", url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
];
const yahooFeed = (symbol: string) =>
  `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;

// --- Pure logic (ported from src/lib/news.js) ----------------------------
const POSITIVE = new Set([
  "surge","surges","jump","jumps","gain","gains","rally","rallies","beat","beats",
  "record","soar","soars","rise","rises","climb","climbs","high","higher","growth",
  "profit","upgrade","boost","rebound","outperform","top","tops","strong","bullish",
  "win","wins","up",
]);
const NEGATIVE = new Set([
  "fall","falls","drop","drops","plunge","plunges","slump","slumps","miss","misses",
  "loss","losses","cut","cuts","downgrade","fear","fears","crash","sink","sinks","low",
  "lower","warn","warns","warning","decline","declines","slip","slips","tumble",
  "tumbles","weak","bearish","risk","selloff","down",
]);

function scoreSentiment(text: string): "positive" | "negative" | "neutral" {
  const words = (text || "").toLowerCase().match(/[a-z']+/g) || [];
  let score = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) score += 1;
    else if (NEGATIVE.has(w)) score -= 1;
  }
  return score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
}

const CATEGORY_RULES: [string, RegExp][] = [
  ["Earnings", /earnings|revenue|quarter|q[1-4]\b|profit|guidance|eps/i],
  ["Crypto", /bitcoin|crypto|ethereum|btc|blockchain|coin/i],
  ["Macro", /fed|inflation|rate|gdp|jobs|economy|treasury|dollar|cpi/i],
];
function categorize(text: string, fallback = "Markets"): string {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text || "")) return cat;
  return fallback;
}

const SYMBOL_ALIASES: Record<string, string[]> = {
  QQQ: ["qqq", "nasdaq", "invesco qqq"],
  SPY: ["spy", "s&p 500", "s&p500", "sp 500", "spdr"],
  "ANTM.JK": ["antam", "aneka tambang", "antm"],
  "GOLD-ANTAM": ["gold", "emas", "bullion"],
};
function tagSymbol(text: string, known: string[]): string | null {
  const hay = (text || "").toLowerCase();
  for (const sym of known) {
    const aliases = SYMBOL_ALIASES[sym] || [sym.toLowerCase()];
    if (aliases.some((a) => hay.includes(a))) return sym;
  }
  return null;
}

const parser = new XMLParser({ ignoreAttributes: true });

interface NewsRow {
  symbol: string | null;
  title: string;
  url: string;
  source: string;
  category: string;
  sentiment: string;
  published_at: string | null;
}

async function fetchFeed(
  feed: { name: string; category: string; url: string; symbol?: string },
  known: string[],
): Promise<NewsRow[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/xml, text/xml, application/rss+xml",
      },
    });
    if (!res.ok) {
      console.error(`[news] ${feed.name} → HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
    const list = Array.isArray(items) ? items : [items];

    return list.flatMap((it: any): NewsRow[] => {
      const title = String(it?.title ?? "").trim();
      const url = String(it?.link?.["@_href"] ?? it?.link ?? it?.guid ?? "").trim();
      if (!title || !url) return [];
      const pub = it?.pubDate ?? it?.published ?? it?.updated;
      let published_at: string | null = null;
      if (pub) {
        const d = new Date(pub);
        published_at = isNaN(d.getTime()) ? null : d.toISOString();
      }
      return [{
        title,
        url,
        source: feed.name,
        category: categorize(title, feed.category),
        sentiment: scoreSentiment(title),
        symbol: feed.symbol ?? tagSymbol(title, known),
        published_at,
      }];
    });
  } catch (e) {
    console.error(`[news] ${feed.name} failed:`, (e as Error).message);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Held market symbols drive the per-symbol Yahoo feeds + general-feed tagging.
  const { data: heldRows } = await supabase
    .from("holdings")
    .select("symbol, asset_class");
  const symbols = [
    ...new Set(
      (heldRows ?? [])
        .filter((h) => h.asset_class === "stock" || h.asset_class === "etf")
        .map((h) => h.symbol),
    ),
  ];

  const feeds = [
    ...GENERAL_FEEDS,
    ...symbols.map((s) => ({ name: "Yahoo Finance", category: "Markets", url: yahooFeed(s), symbol: s })),
  ];

  const results = await Promise.all(feeds.map((f) => fetchFeed(f, symbols)));

  // Dedupe by normalised url, newest first, cap.
  const seen = new Set<string>();
  const rows: NewsRow[] = [];
  for (const r of results.flat()) {
    const key = r.url.split("#")[0].replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  rows.sort((a, b) =>
    new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime()
  );
  const capped = rows.slice(0, 80);

  if (capped.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "No news returned from feeds" }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // Upsert on url so re-runs never duplicate the same article.
  const { error } = await supabase
    .from("news_items")
    .upsert(capped, { onConflict: "url", ignoreDuplicates: true });

  return new Response(
    JSON.stringify({ success: !error, count: capped.length, error: error?.message ?? null }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
