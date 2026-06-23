-- ---------------------------------------------------------------------------
-- Transaction-based portfolio architecture
-- ---------------------------------------------------------------------------
-- A holding is now an ASSET (identity only). Its position — quantity, invested
-- amount, average cost — is DERIVED from a ledger of BUY/SELL transactions.
-- This unlocks multiple buys (DCA), top-ups, and partial sells without ever
-- overwriting cost basis or losing history.
--
-- The holdings table keeps its position columns (quantity, entry_price,
-- entry_nav, invested_amount, current_nav) as a legacy fallback the app reads
-- only when an asset has no transactions yet — so nothing breaks pre-backfill.

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references holdings(id) on delete cascade,
  type text not null default 'BUY' check (type in ('BUY', 'SELL')),
  -- quantity is in the asset's DISPLAY unit (lots / units / grams / shares),
  -- matching holdings.quantity. unit_price is per share / per unit / per gram
  -- (same basis as entry_price / NAV). total_amount is the actual money moved.
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null default 0,
  total_amount numeric not null default 0,
  transaction_date date,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_tx_asset on transactions(asset_id);
create index if not exists idx_tx_date on transactions(transaction_date);

-- RLS: single-user personal dashboard, mirror the holdings "allow all" policy.
alter table transactions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'transactions' and policyname = 'allow all') then
    create policy "allow all" on transactions for all using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Backfill: convert each existing holding into one initial BUY transaction.
-- ---------------------------------------------------------------------------
-- Idempotent (skips assets that already have a transaction), so it is safe to
-- re-run. total_amount prefers the stored invested_amount; otherwise it is
-- reconstructed from entry_price × quantity, honoring the IDX lot multiplier
-- (1 lot = 100 shares) so a stock position's cost basis is in actual money.
insert into transactions (asset_id, type, quantity, unit_price, total_amount, transaction_date)
select
  id,
  'BUY',
  quantity,
  coalesce(entry_nav, entry_price, 0),
  coalesce(
    invested_amount,
    case when unit = 'lot' then entry_price * quantity * 100
         else entry_price * quantity end,
    0
  ),
  purchase_date
from holdings
where quantity > 0
  and not exists (select 1 from transactions t where t.asset_id = holdings.id);
