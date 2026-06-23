// Proxies Yahoo Finance's symbol search so the browser can search real
// tickers (US: NYSE/NASDAQ, Indonesia: .JK / IDX) without CORS issues.
// Returns a trimmed list of { symbol, name, exchange, type, currency }.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return json({ results: [] });

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${
        encodeURIComponent(q)
      }&quotesCount=15&newsCount=0`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
      },
    );
    if (!res.ok) return json({ results: [], error: `Yahoo ${res.status}` }, 502);
    const data = await res.json();

    const results = (data?.quotes ?? [])
      .filter((it: YahooHit) => it.symbol && (it.shortname || it.longname))
      .map((it: YahooHit) => ({
        symbol: it.symbol,
        name: it.longname ?? it.shortname ?? it.symbol,
        exchange: it.exchDisp ?? it.exchange ?? "",
        type: (it.quoteType ?? "").toLowerCase(), // equity | etf | mutualfund …
        // .JK tickers trade in IDR, everything else default to USD.
        currency: it.symbol.endsWith(".JK") ? "IDR" : "USD",
      }));

    return json({ results });
  } catch (err) {
    return json({ results: [], error: String(err) }, 500);
  }
});

interface YahooHit {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
}
