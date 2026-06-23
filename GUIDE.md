# GUIDE.md — PortfolioHQ Developer Guide

Personal portfolio dashboard tracking US ETFs (QQQ, SPY), IDX stocks (ANTM.JK), and Indonesian gold (GOLD-ANTAM). Prices fetched from Yahoo Finance via Supabase Edge Functions. Telegram alerts for big moves and daily briefings.

**Stack:** Vue 3 + Pinia · Tailwind CSS v4 · Supabase (DB + Edge Functions) · Vite

---

## Table of Contents

1. [Local Setup](#1-local-setup)
2. [Environment Variables](#2-environment-variables)
3. [Supabase Setup](#3-supabase-setup)
4. [Architecture](#4-architecture)
5. [How Prices Work](#5-how-prices-work)
6. [Adding a New Asset / Symbol](#6-adding-a-new-asset--symbol)
7. [Edge Functions](#7-edge-functions)
8. [Telegram Notifications](#8-telegram-notifications)
9. [Deploying](#9-deploying)
10. [Known Limits & Next Steps](#10-known-limits--next-steps)

---

## 1. Local Setup

```bash
# Clone and install
npm install

# Copy env and fill in your Supabase values (see section 2)
cp .env.example .env.local

# Start the dev server
npm run dev
# → http://localhost:5173
```

---

## 2. Environment Variables

Only two env vars are needed for the frontend. Both go in `.env.local` (never commit this file).

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase dashboard → Settings → API → `anon` public key |

The **service role key** and **Telegram bot token** are server-side secrets only. They never touch the frontend. See section 3 and 8.

---

## 3. Supabase Setup

### 3a. Run the schema

Paste the full contents of `supabase/schema.sql` into the Supabase SQL Editor and run it. This creates:

- `holdings` — your assets
- `price_snapshots` — fetched prices (one row per fetch, per symbol)
- `news_items` — market news
- `notif_log` — Telegram send audit log
- `app_settings` — a single-row config table (chat id, alert threshold, briefing time)

Run it once. It's safe to re-run (all statements use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

### 3b. Deploy the edge functions

```bash
# Install Supabase CLI if you haven't
brew install supabase/tap/supabase

# Link to your project (get project ref from Supabase dashboard URL)
supabase link --project-ref <your-project-ref>

# Deploy both functions
supabase functions deploy fetch-prices
supabase functions deploy send-telegram
```

### 3c. Set secrets

The Telegram bot token must live as a Supabase secret — it is never stored in the database or the frontend.

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=123456789:your-token-here
```

To verify it's set:
```bash
supabase secrets list
```

### 3d. Enable the server-side price cron (optional but recommended)

This keeps the database fresh every 10 minutes even when nobody has the app open, so the first page load always shows recent prices.

1. In the Supabase SQL Editor, enable the extensions:
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

2. Schedule the job (replace the two placeholders):
```sql
select cron.schedule(
  'refresh-prices-10min',
  '*/10 * * * *',
  $$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/fetch-prices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
      )
    );
  $$
);
```

To stop the cron: `select cron.unschedule('refresh-prices-10min');`

**Tip:** narrow it to market hours to save API calls:
`'*/10 13-21 * * 1-5'` → Mon–Fri, 1–9 PM UTC (covers IDX + US market hours).

---

## 4. Architecture

```
src/
├── App.vue               Shell: sidebar + router-view + auto-poll
├── router/index.js       4 routes
├── stores/portfolio.js   All data logic (Pinia)
├── lib/
│   ├── supabase.js       Supabase client (anon key, safe for browser)
│   └── telegram.js       Helper that calls send-telegram function
├── components/
│   ├── AppSidebar.vue    Fixed nav + refresh button
│   ├── SummaryBar.vue    4-stat summary row
│   ├── PortfolioCard.vue Clickable asset card
│   ├── NewsFeed.vue      News list
│   └── AddHoldingModal.vue  Add asset form
└── views/
    ├── Dashboard.vue     Holdings grid + summary
    ├── AssetDetail.vue   Single asset stats + news + delete
    ├── News.vue          Filtered news feed
    └── Settings.vue      Telegram config + data sources

supabase/
├── schema.sql            All tables, RLS, indexes, cron comment
└── functions/
    ├── fetch-prices/     Fetches Yahoo Finance → writes price_snapshots
    └── send-telegram/    Sends a Telegram message → writes notif_log
```

### Data flow

```
Browser (Vue)
  ↓ on load         store.init()
  ↓                   → loadCached()  (DB reads: fast, free)
  ↓                   → refreshPrices() if stale (calls fetch-prices edge fn)
  ↓ every 10 min    store.refreshPrices({ force: false })  [tab visible only]
  ↓ manual refresh  store.refreshAll({ force: true })

fetch-prices edge fn
  → Yahoo Finance API (quotes)
  → INSERT into price_snapshots

send-telegram edge fn
  → reads TELEGRAM_BOT_TOKEN secret
  → reads telegram_chat_id from app_settings
  → POST to Telegram Bot API
  → INSERT into notif_log
```

---

## 5. How Prices Work

Prices are **not real-time**. The app serves cached data from `price_snapshots` and only calls Yahoo Finance when data is genuinely stale.

| Scenario | What happens |
|---|---|
| App loads / navigate to Dashboard | Shows cached prices instantly. Triggers Yahoo sync only if prices are >10 min old. |
| Prices are fresh (<10 min old) | Zero Yahoo calls. Existing DB data shown immediately. |
| Manual Refresh button | Always forces a Yahoo sync, regardless of age. |
| Auto-poll every 10 min (tab visible) | Same staleness gate — sync only if >10 min old. |
| Tab hidden | No polls at all. Resumes when tab becomes visible. |
| Server-side cron (pg_cron) | Keeps DB fresh every 10 min even when nobody is on the page. |

**Staleness window:** 10 minutes. Defined as `PRICE_MAX_AGE_MIN` in `src/stores/portfolio.js`. Adjust to taste.

The `lastUpdated` timestamp in the store reflects the `fetched_at` of the newest snapshot row — not the current time — so staleness is honest even after a page reload.

---

## 6. Adding a New Asset / Symbol

**Step 1 — Register the Yahoo symbol** in `supabase/functions/fetch-prices/index.ts`:
```typescript
const YAHOO_SYMBOLS: Record<string, string> = {
  "QQQ": "QQQ",
  "SPY": "SPY",
  "ANTM.JK": "ANTM.JK",
  "BBRI.JK": "BBRI.JK",  // ← add here
}
```

**Step 2 — Add an asset color** in `src/components/PortfolioCard.vue`:
```javascript
const assetColors = {
  // ...existing...
  'BBRI.JK': '#ef4444',  // ← add here
}
```

**Step 3 — Add a preset** (optional) in `src/components/AddHoldingModal.vue`:
```javascript
const presets = [
  // ...existing...
  { symbol: 'BBRI.JK', name: 'Bank Rakyat Indonesia Tbk', currency: 'IDR', unit: 'lot' },
]
```

**Step 4 — Redeploy the function:**
```bash
supabase functions deploy fetch-prices
```

That's it. The next price sync will populate `price_snapshots` for the new symbol, and the card will show up with the correct color.

**Special case — non-Yahoo assets (e.g. reksa dana, ORI):** These have no public API. Add them with a fixed `entry_price` as the effective current price, and mark `currency: IDR`. The dashboard will track cost basis and let you manually update the entry price. The `YAHOO_SYMBOLS` map must not include them (or the sync will silently skip them, which is fine).

---

## 7. Edge Functions

Both functions are in `supabase/functions/`. They are Deno-based TypeScript deployed to Supabase's edge runtime.

### fetch-prices

- **URL:** `https://<project>.supabase.co/functions/v1/fetch-prices`
- **Auth:** requires `Authorization: Bearer <service-role-key>` (the cron and pg_net handle this automatically)
- **What it does:** fetches Yahoo Finance quote data for all registered symbols, computes Gold Antam price (spot gold × USD/IDR ÷ 31.1035), inserts rows into `price_snapshots`
- **Returns:** `{ success: bool, count: number, symbols: string[], error: string | null }`

To test manually:
```bash
supabase functions serve fetch-prices --env-file .env.local
# then in another terminal:
curl http://localhost:54321/functions/v1/fetch-prices
```

### send-telegram

- **URL:** `https://<project>.supabase.co/functions/v1/send-telegram`
- **Auth:** anon key is fine (called from the browser via `supabase.functions.invoke`)
- **What it does:** reads `TELEGRAM_BOT_TOKEN` secret, sends a message to the configured chat, logs to `notif_log`
- **Body:** `{ message: string, chat_id?: string, type?: string }`
  - `chat_id` is optional — falls back to the saved `app_settings.telegram_chat_id`
  - `type` is just a label for the log (`"manual"`, `"test"`, `"alert"`, `"briefing"`)
- **Returns:** `{ success: bool, error: string | null }`

---

## 8. Telegram Notifications

### Initial setup

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram → copy the token
2. Start a chat with your new bot, then get your chat ID via [@userinfobot](https://t.me/userinfobot)
3. In the app: Settings → paste Chat ID → Save Settings
4. In the terminal: `supabase secrets set TELEGRAM_BOT_TOKEN=<your-token>`
5. Click **Send Test** in the app to verify

### Sending alerts from code

```javascript
import { sendTelegramAlert } from '@/lib/telegram'

await sendTelegramAlert('🔴 QQQ dropped -3.2% today')
```

HTML formatting is supported (the function passes `parse_mode: "HTML"`):
```javascript
await sendTelegramAlert('<b>Daily Briefing</b>\n\nQQQ: <code>$480.20</code> (+1.2%)')
```

### Alert threshold

The `alert_threshold` field in `app_settings` stores the percentage move that should trigger an alert. The UI lets you set it (1–10%). The actual alert-checking logic is not yet implemented — it needs a cron that reads `price_snapshots`, compares `change_pct` against the threshold, and calls `send-telegram`.

---

## 9. Deploying

### Build

```bash
npm run build
# Output is in dist/
```

### Deploy to Netlify / Vercel

Both work out of the box — it's a static SPA.

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Env vars to set in the host:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

For Netlify, add a `_redirects` file in `public/`:
```
/*  /index.html  200
```
This ensures client-side routing works on direct URL access.

### After deploy

1. Re-deploy edge functions if you changed them: `supabase functions deploy fetch-prices send-telegram`
2. Verify secrets are set: `supabase secrets list`
3. Check the cron is running: in Supabase SQL editor → `select * from cron.job;`

---

## 10. Known Limits & Next Steps

### Current limits

| Area | Limit |
|---|---|
| Yahoo Finance | Unofficial API — can break or rate-limit without warning. No SLA. |
| Gold Antam price | Approximated from spot gold futures × USD/IDR, not the actual Antam retail price. |
| News | `news_items` table exists but nothing populates it yet. Needs an edge function (e.g. NewsAPI, RSS). |
| Alert firing | `alert_threshold` is saved but the alert-check cron is not implemented yet. |
| Daily briefing | `briefing_time` is saved but the scheduled briefing send is not implemented yet. |
| Multi-user | RLS is `allow all` — single user only. Fine for a personal dashboard. |

### Suggested next steps

- **Alert cron:** add a `check-alerts` edge function that queries the latest `price_snapshots`, compares `change_pct` against `alert_threshold`, and calls `send-telegram` for any movers. Schedule it via pg_cron every 10 min during market hours.
- **Daily briefing cron:** add a `send-briefing` edge function that builds a formatted summary of all holdings (value, P&L, day change) and sends it at `briefing_time` (WIB = UTC+7).
- **News feed:** add a `fetch-news` edge function using NewsAPI or a Yahoo Finance headlines endpoint. Schedule daily.
- **Price history chart:** `price_snapshots` already accumulates rows — add a chart to `AssetDetail.vue` using something like Chart.js or unovis.
- **Manual price override:** for reksa dana / obligasi, add an "Update Price" button on AssetDetail that writes directly to `price_snapshots`.
