import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// send-briefing — the scheduled daily portfolio briefing (Option B)
// ---------------------------------------------------------------------------
// Runs on its own pg_cron schedule (see schema.sql), independent of price
// fetching. It reads the freshest price_snapshots that fetch-prices already
// wrote, values each holding, builds the briefing, and hands the message to the
// send-telegram function so delivery + notif_log stay in one place.
//
// The message format mirrors src/lib/briefing.js exactly — the Settings "Send
// Test" button uses that client copy, so what you test is what cron delivers.
//
// Valuation note: day moves come straight from each symbol's snapshot
// change_pct (exact). Position value is price × quantity for market assets
// (stock/etf/gold); manually-priced funds/bonds use their stored NAV/invested
// and a 0% daily move (they don't move intraday in this app's model).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- Formatting (ported from src/lib/briefing.js) -------------------------
function fmtMoney(amount: number, currency: string): string {
  const abs = Math.abs(Number(amount) || 0);
  if (currency === "IDR") {
    return "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(abs);
  }
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
}
function fmtSignedMoney(amount: number, currency: string): string {
  return (Number(amount) < 0 ? "-" : "+") + fmtMoney(amount, currency);
}
function fmtPct(pct: number): string {
  const n = Number(pct) || 0;
  return (n < 0 ? "-" : "+") + Math.abs(n).toFixed(2) + "%";
}
function moveDot(pct: number): string {
  const n = Number(pct) || 0;
  if (n > 0.05) return "🟢";
  if (n < -0.05) return "🔴";
  return "⚪️";
}
function fmtBriefingDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")} · ${get("hour")}:${get("minute")} WIB`;
}

interface Holding { symbol: string; currency: string; value: number; dayChange: number; isGold?: boolean; gramsOwned?: number; }

function holdingDayPnl(h: Holding): number {
  const pct = Number(h.dayChange) || 0;
  const value = Number(h.value) || 0;
  if (pct === 0) return 0;
  return value - value / (1 + pct / 100);
}

function buildBriefingMessage(
  holdings: Holding[],
  total: { value: number; pnl: number; pnlPct: number },
  displayCurrency: string,
  fxRate: number,
  now = new Date(),
): string {
  const lines: string[] = [];
  lines.push("📊 <b>Portfolio Briefing</b>");
  lines.push(`<i>${fmtBriefingDate(now)}</i>`);

  if (holdings.length === 0) {
    lines.push("");
    lines.push("No holdings yet. Add positions to start receiving daily updates.");
    return lines.join("\n");
  }

  const movers = holdings
    .filter((h) => Math.abs(Number(h.dayChange) || 0) > 0.05)
    .sort((a, b) => Math.abs(Number(b.dayChange) || 0) - Math.abs(Number(a.dayChange) || 0));
  const flat = holdings.filter((h) => Math.abs(Number(h.dayChange) || 0) <= 0.05);

  lines.push("");
  lines.push("<b>Holdings today</b>");
  if (movers.length === 0) lines.push("<i>No market moves today.</i>");
  for (const h of movers) {
    const isGold = (h as any).isGold;
    const dayPnl = holdingDayPnl(h);
    if (isGold) {
      const gramsOwned = (h as any).gramsOwned || 0;
      const pricePerGram = gramsOwned > 0 ? h.value / gramsOwned : 0;
      lines.push(
        `${moveDot(h.dayChange)} <b>${h.symbol}</b>  ${fmtPct(h.dayChange)}  ` +
          `<i>(${fmtSignedMoney(dayPnl, h.currency)})</i>\n` +
          `   <i>Gold: ${fmtMoney(pricePerGram, "IDR")}/g · ${Number(gramsOwned).toLocaleString("id-ID", { maximumFractionDigits: 2 })}g owned</i>`,
      );
    } else {
      lines.push(
        `${moveDot(h.dayChange)} <b>${h.symbol}</b>  ${fmtPct(h.dayChange)}  ` +
          `<i>(${fmtSignedMoney(dayPnl, h.currency)})</i>`,
      );
    }
  }
  const flatGold = flat.filter((h) => (h as any).isGold);
  const flatOther = flat.filter((h) => !(h as any).isGold);
  for (const h of flatGold) {
    const gramsOwned = (h as any).gramsOwned || 0;
    const pricePerGram = gramsOwned > 0 ? h.value / gramsOwned : 0;
    lines.push(
      `⚪️ <b>${h.symbol}</b>  ${fmtPct(0)}  ` +
        `<i>(${fmtMoney(pricePerGram, "IDR")}/g · ${Number(gramsOwned).toLocaleString("id-ID", { maximumFractionDigits: 2 })}g)</i>`,
    );
  }
  if (flatOther.length) {
    lines.push(`⚪️ <i>Unchanged:</i> ${flatOther.map((h) => h.symbol).join(", ")}`);
  }

  let dayPnlDisplay = 0;
  for (const h of holdings) {
    const native = holdingDayPnl(h);
    dayPnlDisplay += h.currency === displayCurrency
      ? native
      : h.currency === "USD"
        ? native * fxRate
        : native / fxRate;
  }
  const value = Number(total.value) || 0;
  const prevValue = value - dayPnlDisplay;
  const dayPct = prevValue > 0 ? (dayPnlDisplay / prevValue) * 100 : 0;

  lines.push("");
  lines.push("<b>Portfolio</b>");
  lines.push(`💼 Value  <b>${fmtMoney(value, displayCurrency)}</b>`);
  lines.push(`📈 Today  <b>${fmtSignedMoney(dayPnlDisplay, displayCurrency)}</b> (${fmtPct(dayPct)})`);
  lines.push(`📦 Total P&amp;L  <b>${fmtSignedMoney(total.pnl, displayCurrency)}</b> (${fmtPct(total.pnlPct)})`);

  return lines.join("\n");
}

// --- Time gating (WIB) ----------------------------------------------------
// Current minute-of-day in Jakarta time (0..1439).
function wibMinutesNow(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}
// "06:10" / "06:10:00" -> minutes since midnight.
function parseHHMM(s: string): number {
  const [h, m] = String(s ?? "08:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
// Today's date in WIB as "YYYY-MM-DD".
function wibDateStr(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
// "6:5" / "06:05:00" -> "06:05".
function normalizeHHMM(s: string): string {
  const [h, m] = String(s ?? "08:00").split(":");
  return `${String(h ?? "08").padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
}

// --- Handler --------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // `force: true` (manual test / "send now") bypasses the time gate + dedup so
  // a send happens immediately. The scheduled heartbeat sends no body, so force
  // defaults to false and the gating below applies.
  const { force = false } = await req.json().catch(() => ({ force: false }));

  const skip = (reason: string, extra: Record<string, unknown> = {}) =>
    new Response(
      JSON.stringify({ success: false, skipped: true, reason, ...extra }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  // Respect the enabled flag — a scheduled run does nothing if notifications
  // are off, so the user can pause without unscheduling the cron.
  const { data: settings } = await supabase
    .from("app_settings")
    .select("telegram_enabled, telegram_chat_id, briefing_time, last_daily_slot")
    .eq("id", 1)
    .single();
  if (!settings?.telegram_enabled || !settings?.telegram_chat_id) {
    return skip("notifications disabled");
  }

  // Time gate + per-SLOT dedup: the heartbeat runs every few minutes, and the
  // briefing fires on the first tick at/after the configured WIB time. Dedup is
  // keyed on the schedule SLOT (date + briefing_time), NOT the calendar day —
  // so changing briefing_time later the same day produces a new slot and the
  // brief fires again at the new time, while repeated heartbeats for the same
  // slot are skipped.
  let slot: string | null = null;
  if (!force) {
    const now = new Date();
    const nowMin = wibMinutesNow(now);
    const targetMin = parseHHMM(settings.briefing_time);
    if (nowMin < targetMin) {
      return skip("before briefing time", { nowMin, targetMin });
    }
    slot = `${wibDateStr(now)}T${normalizeHHMM(settings.briefing_time)}`;
    if (settings.last_daily_slot === slot) {
      return skip("already sent for this schedule slot", { slot });
    }
  }

  const { data: holdings } = await supabase
    .from("holdings")
    .select("symbol, currency, quantity, entry_price, entry_nav, current_nav, invested_amount, asset_class");

  // Latest snapshot per symbol.
  const { data: snaps } = await supabase
    .from("price_snapshots")
    .select("symbol, price, change_pct, fetched_at")
    .order("fetched_at", { ascending: false });
  const latest: Record<string, { price: number; change_pct: number }> = {};
  for (const s of snaps ?? []) {
    if (!(s.symbol in latest)) latest[s.symbol] = { price: Number(s.price), change_pct: Number(s.change_pct) };
  }
  const fxRate = latest["USD-IDR"]?.price || 16000;
  const displayCurrency = "IDR"; // app default; display ccy is a client-only pref

  const rows: Holding[] = [];
  let totalValue = 0, totalCost = 0;
  for (const h of holdings ?? []) {
    const snap = latest[h.symbol];
    const qty = Number(h.quantity) || 0;
    let value = 0, cost = 0, dayChange = 0;

    const isGold = h.asset_class === "gold";
    if (h.asset_class === "stock" || h.asset_class === "etf" || isGold) {
      // Gold: prefer GOLD-ANTAM snapshot for price + change (the canonical key
      // written by fetch-prices), regardless of the holding's own symbol.
      const goldSnap = isGold ? (latest["GOLD-ANTAM"] ?? snap) : null;
      const effectiveSnap = goldSnap ?? snap;
      const price = effectiveSnap?.price ?? Number(h.current_nav) ?? Number(h.entry_price) ?? 0;
      value = price * qty;
      cost = (Number(h.invested_amount) || Number(h.entry_price) * qty) || 0;
      dayChange = effectiveSnap?.change_pct ?? 0;
    } else {
      // Manually-priced fund / bond — static intraday.
      const nav = Number(h.current_nav) || Number(h.entry_nav) || 0;
      value = nav > 0 ? nav * qty : Number(h.invested_amount) || 0;
      cost = Number(h.invested_amount) || Number(h.entry_nav) * qty || 0;
      dayChange = 0;
    }

    rows.push({
      symbol: h.symbol,
      currency: h.currency || "USD",
      value,
      dayChange,
      isGold,
      gramsOwned: isGold ? qty : undefined,
    });

    // Convert into display currency for the roll-up.
    const conv = (a: number) =>
      h.currency === displayCurrency ? a : h.currency === "USD" ? a * fxRate : a / fxRate;
    totalValue += conv(value);
    totalCost += conv(cost);
  }

  const pnl = totalValue - totalCost;
  const total = {
    value: totalValue,
    pnl,
    pnlPct: totalCost > 0 ? (pnl / totalCost) * 100 : 0,
  };

  const message = buildBriefingMessage(rows, total, displayCurrency, fxRate);

  // Deliver through send-telegram (handles chat-id + notif_log).
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-telegram`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    // Scheduled sends log as "daily" (the dedup key); manual/forced sends log
    // as "manual" so a test never blocks the day's real briefing.
    body: JSON.stringify({ message, type: force ? "manual" : "daily" }),
  });
  const out = await res.json().catch(() => ({}));

  // Mark this schedule slot as fulfilled so the same slot isn't re-sent by the
  // next heartbeat. Only on a successful scheduled send — manual/forced sends
  // never touch the slot, so they don't affect the daily schedule.
  if (out?.success && !force && slot) {
    await supabase.from("app_settings").update({ last_daily_slot: slot }).eq("id", 1);
  }

  return new Response(
    JSON.stringify({ success: !!out?.success, holdings: rows.length, slot, error: out?.error ?? null }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
