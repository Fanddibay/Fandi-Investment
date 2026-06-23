-- Holdings: user's assets
create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  name text not null,
  quantity numeric not null default 0,
  entry_price numeric not null default 0,
  currency text not null default 'USD',
  unit text default 'shares',
  created_at timestamptz default now()
);

-- Price snapshots: daily fetched prices
create table if not exists price_snapshots (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  price numeric not null,
  change_px numeric default 0,
  change_pct numeric default 0,
  open numeric,
  high numeric,
  low numeric,
  volume bigint,
  fetched_at timestamptz default now()
);

-- News items: fetched from APIs
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  symbol text,
  title text not null,
  url text,
  source text,
  sentiment text check (sentiment in ('positive', 'negative', 'neutral')),
  published_at timestamptz,
  created_at timestamptz default now()
);

-- App settings: single-row config (Telegram prefs, etc.)
-- Bot token is NOT stored here — it lives in Supabase secrets. Only the
-- non-secret config the UI needs to read/write lives in this table.
create table if not exists app_settings (
  id int primary key default 1 check (id = 1), -- enforce a single row
  telegram_chat_id text,
  alert_threshold numeric not null default 2,
  briefing_time text not null default '08:00',
  telegram_enabled boolean not null default false,
  updated_at timestamptz default now()
);

-- Seed the single settings row so the UI always has something to read.
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- Notification log: sent Telegram messages
create table if not exists notif_log (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message text not null,
  sent_at timestamptz default now(),
  success boolean default true
);

-- Indexes for fast lookups
create index if not exists idx_snapshots_symbol on price_snapshots(symbol);
create index if not exists idx_snapshots_fetched on price_snapshots(fetched_at desc);
create index if not exists idx_news_symbol on news_items(symbol);
create index if not exists idx_news_published on news_items(published_at desc);

-- RLS: enable row-level security (single user, anon key is fine for now)
alter table holdings enable row level security;
alter table price_snapshots enable row level security;
alter table news_items enable row level security;
alter table notif_log enable row level security;
alter table app_settings enable row level security;

-- Allow all for anon (single-user personal dashboard)
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'holdings' and policyname = 'allow all') then
    create policy "allow all" on holdings for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'price_snapshots' and policyname = 'allow all') then
    create policy "allow all" on price_snapshots for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'news_items' and policyname = 'allow all') then
    create policy "allow all" on news_items for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'notif_log' and policyname = 'allow all') then
    create policy "allow all" on notif_log for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'app_settings' and policyname = 'allow all') then
    create policy "allow all" on app_settings for all using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduled price refresh (server-side, runs even when nobody is on the page)
-- ---------------------------------------------------------------------------
-- Keeps price_snapshots fresh every 10 minutes so the frontend almost always
-- has recent data to show without calling Yahoo itself. Run this block ONCE
-- in the Supabase SQL editor, replacing <PROJECT_REF> and <SERVICE_ROLE_KEY>.
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule(
--     'refresh-prices-10min',
--     '*/10 * * * *',
--     $$
--       select net.http_post(
--         url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/fetch-prices',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--         )
--       );
--     $$
--   );
--
-- To stop it later:  select cron.unschedule('refresh-prices-10min');
-- Tip: narrow the cron to market hours to save calls, e.g. '*/10 13-21 * * 1-5'.
