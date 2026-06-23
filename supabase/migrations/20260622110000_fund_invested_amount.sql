-- ---------------------------------------------------------------------------
-- Mutual-fund valuation fix: invested amount as the source of truth
-- ---------------------------------------------------------------------------
-- A fund's cost basis is the total money put in, NOT a per-unit price. Storing
-- only entry_price/quantity forced the stock formula (price × shares) onto
-- funds and produced wildly wrong P&L. This adds an explicit invested_amount
-- column and the engine reads cost from it for funds.

alter table holdings add column if not exists invested_amount numeric;

-- Backfill existing funds. Generic assumption: entry_price held a real per-unit
-- entry NAV, so invested = entry_price × units. (Overridden below for the one
-- row we know was entered with mixed scales.)
update holdings
   set invested_amount = entry_price * quantity
 where asset_class = 'fund'
   and invested_amount is null;

-- Bahana Likuid Syariah Kelas G — a MONEY MARKET fund, profitable per Bibit
-- (+1.63%). Its row was entered with mixed scales (entry_price held the total
-- invested in thousands; current_nav held the entry NAV in thousands) and the
-- category was mislabelled Equity. Restore Bibit-accurate values:
--   invested  = Rp 20,627,194
--   units     = 16,236.8891  (unchanged)
--   curr NAV  = Rp 1,291.04
--   value     = units × NAV ≈ Rp 20,962,473   →  P&L +Rp335,279  (+1.63%)
update holdings
   set invested_amount = 20627194,
       current_nav     = 1291.04,
       entry_price     = 20627194 / nullif(quantity, 0), -- derived entry NAV ≈ 1270.7
       category        = 'money_market'
 where symbol = 'Bahana Likuid Syariah Kelas G';

-- Keep entry_price coherent for any other backfilled funds too: for funds it is
-- now a DERIVED per-unit entry NAV (invested ÷ units), used for display only.
update holdings
   set entry_price = invested_amount / nullif(quantity, 0)
 where asset_class = 'fund'
   and invested_amount is not null
   and quantity > 0
   and symbol <> 'Bahana Likuid Syariah Kelas G';
