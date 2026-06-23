-- ---------------------------------------------------------------------------
-- Gold (ANTAM) buy / sell prices on price snapshots
-- ---------------------------------------------------------------------------
-- ANTAM gold has two daily prices: the buy price (what you pay) and the
-- buyback price (what you get when selling). Portfolio value uses the buyback
-- (realizable) price, stored in the existing `price` column; these columns
-- carry both figures for display. Nullable — only gold rows populate them.

alter table price_snapshots add column if not exists buy_price numeric;
alter table price_snapshots add column if not exists sell_price numeric;
