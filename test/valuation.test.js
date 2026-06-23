// Run with:  npm test   (node --test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  valuate,
  valuateFund,
  unitShares,
  guessFundCategory,
  fundCategoryLabel,
  parseLocaleNumber,
  validateFund,
} from '../src/lib/valuation.js'

// Tolerant float compare for currency math.
function close(actual, expected, eps = 1) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${actual} to be within ${eps} of ${expected}`,
  )
}

// ---------------------------------------------------------------------------
// The bug that started it all: Bahana Likuid Syariah (money-market fund).
// Bibit shows this position as +1.63% profitable. The old generic stock
// formula reported -Rp313,958,988. These tests lock in the correct behavior.
// ---------------------------------------------------------------------------
test('Bahana Likuid Syariah — profitable money-market fund, not -313M', () => {
  const holding = {
    asset_class: 'fund',
    category: 'money_market',
    quantity: 16236.8891, // units
    invested_amount: 20627194, // Rp invested (stored, source of truth for P&L)
    entry_nav: 1270.39, // stored entry NAV (NOT derived from invested ÷ units)
    current_nav: 1291.04, // latest NAV per unit
    entry_price: 99999, // legacy column — must be IGNORED when entry_nav exists
    currency: 'IDR',
  }
  const v = valuate(holding)

  close(v.value, 20962473, 50) // units × current NAV ≈ Rp20,962,473
  assert.ok(v.pnl > 0, `expected positive P&L, got ${v.pnl}`)
  close(v.pnlPct, 1.63, 0.05) // ≈ +1.63%  (= pnl ÷ invested, independent of entryNav)
  close(v.entryNav, 1270.39, 0.01) // STORED, not derived; legacy entry_price ignored
  close(v.invested, 20627194, 1)
  assert.deepEqual(v.warnings, []) // clean, realistic data → no warnings

  // The cardinal sin guard: invested amount must never be read as the NAV.
  assert.notEqual(Math.round(v.pnl), -313958988)
})

test('Entry NAV is the stored field, never derived from invested ÷ units', () => {
  // invested ÷ units would give 1000, but the stored entry NAV is 1050.
  const v = valuateFund({
    asset_class: 'fund', quantity: 1000,
    invested_amount: 1_000_000, entry_nav: 1050, current_nav: 1100,
  })
  close(v.entryNav, 1050) // honours the stored value
  close(v.pnlPct, 10) // P&L % still from invested, unaffected by entry NAV
})

test('fund P&L percent uses invested amount, not NAV', () => {
  const v = valuateFund({
    asset_class: 'fund',
    quantity: 1000,
    invested_amount: 1_000_000,
    entry_nav: 1000,
    current_nav: 1100,
  })
  close(v.value, 1_100_000)
  close(v.pnl, 100_000)
  close(v.pnlPct, 10)
  close(v.entryNav, 1000)
})

test('fund with no current NAV yet reports flat 0 P&L, never NaN', () => {
  // Freshly added: current NAV unknown, falls back to the stored entry NAV.
  const v = valuateFund({
    asset_class: 'fund',
    quantity: 500,
    invested_amount: 5_000_000,
    entry_nav: 10_000, // 5,000,000 ÷ 500
    current_nav: null,
  })
  assert.equal(v.pnl, 0)
  assert.equal(v.pnlPct, 0)
  assert.ok(Number.isFinite(v.value))
})

// ---------------------------------------------------------------------------
// Stocks / ETFs / gold — the market model (price × shares, lot-aware).
// ---------------------------------------------------------------------------
test('IDX stock priced in lots multiplies by 100 shares/lot', () => {
  assert.equal(unitShares('lot'), 100)
  // ANTM.JK: 30 lots @ entry 3822, live price 4000.
  const v = valuate(
    { asset_class: 'stock', quantity: 30, entry_price: 3822, unit: 'lot', currency: 'IDR' },
    { price: 4000 },
  )
  close(v.shares, 3000)
  close(v.cost, 3822 * 3000)
  close(v.value, 4000 * 3000)
  close(v.pnl, (4000 - 3822) * 3000)
})

test('US fractional shares value correctly', () => {
  const v = valuate(
    { asset_class: 'etf', quantity: 0.514184839, entry_price: 731.58, unit: 'shares', currency: 'USD' },
    { price: 800 },
  )
  close(v.shares, 0.514184839, 1e-6)
  close(v.value, 800 * 0.514184839, 1e-4)
  assert.ok(v.pnl > 0)
})

test('gold (per gram) uses manual NAV when no live price', () => {
  const v = valuate({
    asset_class: 'gold',
    quantity: 10,
    entry_price: 3_100_000,
    current_nav: 3_300_000,
    unit: 'gram',
    currency: 'IDR',
  })
  close(v.value, 33_000_000)
  close(v.pnl, 2_000_000)
})

test('direct bond uses per-unit price model', () => {
  const v = valuate({
    asset_class: 'bond',
    quantity: 100,
    entry_price: 1_000_000,
    current_nav: 1_020_000,
    unit: 'lembar',
    currency: 'IDR',
  })
  close(v.value, 102_000_000)
  close(v.pnl, 2_000_000)
})

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------
test('category inference fixes the Bahana mislabel', () => {
  assert.equal(guessFundCategory('Bahana Likuid Syariah Kelas G'), 'money_market')
  assert.equal(guessFundCategory('Sucorinvest Money Market Fund'), 'money_market')
  assert.equal(guessFundCategory('Batavia Dana Kas Maxima'), 'money_market')
  assert.equal(guessFundCategory('Sucorinvest Saham Syariah'), 'equity')
  assert.equal(guessFundCategory('ABF Indonesia Bond Index Fund'), 'fixed_income')
  assert.equal(fundCategoryLabel('money_market'), 'Money Market Fund')
})

// ---------------------------------------------------------------------------
// Locale-aware number parsing — the actual root cause of the corruption.
// ---------------------------------------------------------------------------
test('parseLocaleNumber handles id-ID and en-US without dropping digits', () => {
  // Indonesian: "." thousands, "," decimal
  close(parseLocaleNumber('1.291,04'), 1291.04, 1e-9)
  close(parseLocaleNumber('20.627.194'), 20627194, 1e-9)
  close(parseLocaleNumber('16.236,8891'), 16236.8891, 1e-9)
  close(parseLocaleNumber('Rp 20.627.194'), 20627194, 1e-9)
  // US: "," thousands, "." decimal
  close(parseLocaleNumber('1,291.04'), 1291.04, 1e-9)
  close(parseLocaleNumber('20,627,194'), 20627194, 1e-9)
  // Plain
  close(parseLocaleNumber('1291.04'), 1291.04, 1e-9)
  close(parseLocaleNumber(1291.04), 1291.04, 1e-9)
})

test('valuation parses locale-formatted strings (no significant-digit loss)', () => {
  const v = valuateFund({
    asset_class: 'fund', category: 'money_market',
    quantity: '16.236,8891', invested_amount: '20.627.194',
    entry_nav: '1.270,39', current_nav: '1.291,04',
  })
  close(v.value, 20962473, 50)
  close(v.pnlPct, 1.63, 0.05)
  assert.deepEqual(v.warnings, [])
})

// ---------------------------------------------------------------------------
// Safeguards — impossible / implausible values
// ---------------------------------------------------------------------------
test('safeguard flags NAV scale mismatch from bad locale parsing', () => {
  // The ORIGINAL bug shape: current NAV stored as 1.27 against entry NAV 1270.
  const w = validateFund({ units: 16236, entryNav: 1270, currentNav: 1.27, invested: 20627194, pnlPct: -99.9, category: 'money_market' })
  assert.ok(w.some(m => /locale parsing|separators/i.test(m)), w.join(' | '))
})

test('safeguard flags unrealistic money-market return', () => {
  const w = validateFund({ units: 1000, entryNav: 1000, currentNav: 1500, invested: 1_000_000, pnlPct: 50, category: 'money_market' })
  assert.ok(w.some(m => /unrealistic/i.test(m)), w.join(' | '))
})

test('safeguard flags invested ≠ entryNAV × units drift', () => {
  const w = validateFund({ units: 1000, entryNav: 1000, currentNav: 1100, invested: 5_000_000, pnlPct: -78, category: 'equity' })
  assert.ok(w.some(m => /Entry NAV × Units/i.test(m)), w.join(' | '))
})

test('clean realistic fund produces no warnings', () => {
  const w = validateFund({ units: 1000, entryNav: 1000, currentNav: 1030, invested: 1_000_000, pnlPct: 3, category: 'money_market' })
  assert.deepEqual(w, [])
})
