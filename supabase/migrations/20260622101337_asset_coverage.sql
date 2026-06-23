-- Richer asset metadata for stocks, ETFs and mutual funds.
alter table holdings add column if not exists asset_class text not null default 'stock';
  -- one of: stock | etf | gold | fund | bond | manual
alter table holdings add column if not exists purchase_date date;
alter table holdings add column if not exists manager text;       -- fund asset manager
alter table holdings add column if not exists category text;      -- fund category
alter table holdings add column if not exists current_nav numeric; -- manual price/NAV for non-market assets

-- Backfill asset_class for the assets already in the table.
update holdings set asset_class = 'gold'   where symbol = 'GOLD-ANTAM' and asset_class = 'stock';
update holdings set asset_class = 'fund'   where symbol = 'REKSADANA'  and asset_class = 'stock';
update holdings set asset_class = 'bond'   where symbol = 'OBLIGASI'   and asset_class = 'stock';
update holdings set asset_class = 'etf'    where symbol in ('QQQ','SPY') and asset_class = 'stock';
