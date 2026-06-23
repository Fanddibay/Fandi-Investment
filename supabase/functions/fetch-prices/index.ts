import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allow the browser to invoke this function (preflight + actual request).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Spot-gold inputs — kept only as the LAST-resort fallback for ANTAM pricing.
const GOLD_FUTURES = "GC=F";
const USD_IDR = "USDIDR=X";

// Real Indonesian ANTAM gold price source (cacing69/logam-mulia-api, listed in
// farizdotid/DAFTAR-API-LOKAL-INDONESIA). No API key. Primary carries ANTAM
// Logam Mulia lines; fallback is a single 1g gold line if the primary is down.
const GOLD_API_PRIMARY =
  "https://logam-mulia-api.iamutaki.workers.dev/api/prices/anekalogam";
const GOLD_API_FALLBACK =
  "https://logam-mulia-api.iamutaki.workers.dev/api/prices/lakuemas";

// ANTAM prices update ~daily — don't re-fetch more often than this.
const GOLD_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface GoldPrice {
  buyPrice: number; // what you pay to buy (dealer sell price)
  sellPrice: number; // buyback price you get when selling (used for valuation)
  recordedDate: string | null;
  source: string | null;
}

// Pick the canonical 1-gram ANTAM Logam Mulia price from a provider payload.
function pickAntamGramPrice(payload: any): GoldPrice | null {
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  const grams = rows.filter(
    (r) =>
      r && r.material === "gold" && Number(r.weight) === 1 &&
      (r.weightUnit ?? "gr") === "gr" && Number(r.buybackPrice) > 0,
  );
  if (grams.length === 0) return null;
  const preferred = grams.find(
    (r) =>
      /lm antam|logam mulia antam/i.test(r.materialType || "") &&
      !/certicard/i.test(r.materialType || ""),
  ) || grams[0];
  return {
    buyPrice: Number(preferred.sellPrice) || 0,
    sellPrice: Number(preferred.buybackPrice) || 0,
    recordedDate: preferred.recordedDate ?? null,
    source: preferred.source ?? null,
  };
}

// Fetch ANTAM gold with primary → fallback. Returns null if both fail (caller
// then uses the spot-gold approximation). Errors are logged for debugging.
async function fetchAntamGold(): Promise<GoldPrice | null> {
  for (const url of [GOLD_API_PRIMARY, GOLD_API_FALLBACK]) {
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) {
        console.error(`[gold] ${url} → HTTP ${res.status}`);
        continue;
      }
      const price = pickAntamGramPrice(await res.json());
      if (price && price.sellPrice > 0) {
        console.log(`[gold] using ${price.source ?? url} buyback=${price.sellPrice}`);
        return price;
      }
      console.error(`[gold] ${url} → no usable 1g price`);
    } catch (e) {
      console.error(`[gold] ${url} failed:`, (e as Error).message);
    }
  }
  return null;
}

// Yahoo's old v7/quote endpoint now requires a session crumb (returns 401).
// The v8/chart endpoint is still public and needs no auth — one call per symbol.
async function fetchQuote(symbol: string): Promise<Quote | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${
      encodeURIComponent(symbol)
    }?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    return {
      price,
      prevClose,
      change_px: price - prevClose,
      change_pct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      open: meta.regularMarketOpen ?? null,
      high: meta.regularMarketDayHigh ?? null,
      low: meta.regularMarketDayLow ?? null,
      volume: meta.regularMarketVolume ?? null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Browsers send an OPTIONS preflight before the real call — answer it.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Dynamically price every market-traded asset the user actually holds.
  // The symbol IS the Yahoo ticker (the search picker assigns real tickers),
  // so adding any US/IDX stock makes it priced automatically — no code change.
  const { data: heldRows } = await supabase
    .from("holdings")
    .select("symbol, asset_class");
  const marketSymbols = [
    ...new Set(
      (heldRows ?? [])
        .filter((h) => h.asset_class === "stock" || h.asset_class === "etf")
        .map((h) => h.symbol),
    ),
  ];

  // Fetch every symbol (market holdings + gold inputs + FX) in parallel.
  const allSymbols = [...marketSymbols, GOLD_FUTURES, USD_IDR];
  const results = await Promise.all(allSymbols.map((s) => fetchQuote(s)));
  const quoteMap: Record<string, Quote> = {};
  allSymbols.forEach((s, i) => {
    const q = results[i];
    if (q) quoteMap[s] = q;
  });

  const now = new Date().toISOString();
  const rows: PriceRow[] = [];

  // Standard equities / ETFs
  for (const sym of marketSymbols) {
    const q = quoteMap[sym];
    if (!q) continue;
    rows.push({
      symbol: sym,
      price: q.price,
      change_px: q.change_px,
      change_pct: Number(q.change_pct.toFixed(4)),
      open: q.open,
      high: q.high,
      low: q.low,
      volume: q.volume,
      fetched_at: now,
    });
  }

  const usdidr = quoteMap[USD_IDR];

  // Gold Antam — only refresh if the cached price is stale (prices move daily).
  const { data: lastGold } = await supabase
    .from("price_snapshots")
    .select("price, fetched_at")
    .eq("symbol", "GOLD-ANTAM")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const goldAgeMs = lastGold?.fetched_at
    ? Date.now() - new Date(lastGold.fetched_at).getTime()
    : Infinity;
  const prevGoldPrice = Number(lastGold?.price) || 0;

  if (goldAgeMs >= GOLD_MAX_AGE_MS) {
    // Primary: real ANTAM buyback price from the Indonesian gold API.
    const antam = await fetchAntamGold();
    if (antam) {
      const price = antam.sellPrice; // realizable (buyback) value per gram
      const changePx = prevGoldPrice > 0 ? price - prevGoldPrice : 0;
      rows.push({
        symbol: "GOLD-ANTAM",
        price,
        change_px: Math.round(changePx),
        change_pct: prevGoldPrice > 0
          ? Number(((changePx / prevGoldPrice) * 100).toFixed(4))
          : 0,
        open: null,
        high: null,
        low: null,
        volume: null,
        buy_price: antam.buyPrice,
        sell_price: antam.sellPrice,
        fetched_at: now,
      });
    } else {
      // Last-resort fallback: approximate IDR/gram from spot gold × USD/IDR.
      const gold = quoteMap[GOLD_FUTURES];
      if (gold && usdidr) {
        const rate = usdidr.price || 16000;
        const idrPerGram = (gold.price * rate) / 31.1035;
        const changePx = prevGoldPrice > 0 ? idrPerGram - prevGoldPrice : 0;
        console.error("[gold] ANTAM API unavailable — using spot approximation");
        rows.push({
          symbol: "GOLD-ANTAM",
          price: Math.round(idrPerGram),
          change_px: Math.round(changePx),
          change_pct: prevGoldPrice > 0
            ? Number(((changePx / prevGoldPrice) * 100).toFixed(4))
            : 0,
          open: null,
          high: null,
          low: null,
          volume: null,
          buy_price: null,
          sell_price: null,
          fetched_at: now,
        });
      }
    }
  }

  // Store the USD→IDR rate so the frontend can convert mixed-currency totals.
  if (usdidr) {
    rows.push({
      symbol: "USD-IDR",
      price: usdidr.price,
      change_px: usdidr.change_px,
      change_pct: Number(usdidr.change_pct.toFixed(4)),
      open: usdidr.open,
      high: usdidr.high,
      low: usdidr.low,
      volume: usdidr.volume,
      fetched_at: now,
    });
  }

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "No price data returned from Yahoo Finance" }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const { error } = await supabase.from("price_snapshots").insert(rows);

  return new Response(
    JSON.stringify({
      success: !error,
      count: rows.length,
      symbols: rows.map((r) => r.symbol),
      error: error?.message ?? null,
    }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});

// --- Types ---

interface Quote {
  price: number;
  prevClose: number;
  change_px: number;
  change_pct: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
}

interface PriceRow {
  symbol: string;
  price: number;
  change_px: number;
  change_pct: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  buy_price?: number | null;
  sell_price?: number | null;
  fetched_at: string;
}
