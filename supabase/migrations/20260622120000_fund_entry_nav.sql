-- ---------------------------------------------------------------------------
-- Store Entry NAV as a first-class field (stop deriving it)
-- ---------------------------------------------------------------------------
-- Entry NAV was being derived as invested ÷ units, a fragile circular
-- dependency. It is now stored independently at creation, alongside the
-- separately-stored invested_amount and current_nav. The valuation engine
-- reads all three; it derives nothing.

alter table holdings add column if not exists entry_nav numeric;

-- Backfill: funds previously kept their per-unit entry NAV in entry_price.
update holdings
   set entry_nav = entry_price
 where asset_class = 'fund'
   and entry_nav is null;

-- Bahana Likuid Syariah Kelas G — realistic, Bibit-accurate values.
--   entry_nav    = Rp 1,270.39  (invested 20,627,194 ÷ 16,236.8891 units)
--   current_nav  = Rp 1,291.04
--   invested     = Rp 20,627,194
--   → value 20,962,473 · P&L +335,279 · +1.63%
update holdings
   set entry_nav   = 1270.39,
       current_nav = 1291.04,
       invested_amount = coalesce(invested_amount, 20627194),
       category    = 'money_market'
 where symbol = 'Bahana Likuid Syariah Kelas G';
