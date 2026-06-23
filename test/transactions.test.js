// Run with:  npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate } from '../src/lib/transactions.js'

function close(actual, expected, eps = 1) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} within ${eps} of ${expected}`)
}

test('single BUY passes quantity / invested / avg cost through', () => {
  const a = aggregate(
    [{ type: 'BUY', quantity: 10, unit_price: 420, total_amount: 4200, transaction_date: '2026-01-10' }],
    { unit: 'shares' },
  )
  close(a.totalQuantity, 10)
  close(a.investedAmount, 4200)
  close(a.avgCostPerUnit, 420)
  close(a.avgCostPerShare, 420)
  assert.equal(a.buyCount, 1)
  assert.equal(a.realizedPnl, 0)
})

test('ANTM: 100 lot @3000 + 50 lot @2500 → 150 lot, avg cost 2833/lot', () => {
  // total_amount honors the lot multiplier (×100 shares): 100×3000×100, 50×2500×100
  const a = aggregate(
    [
      { type: 'BUY', quantity: 100, unit_price: 3000, total_amount: 30_000_000, transaction_date: '2026-01-10' },
      { type: 'BUY', quantity: 50, unit_price: 2500, total_amount: 12_500_000, transaction_date: '2026-03-15' },
    ],
    { unit: 'lot' },
  )
  close(a.totalQuantity, 150)
  close(a.investedAmount, 42_500_000)
  close(a.avgCostPerUnit, 283_333, 1) // per lot
  close(a.avgCostPerShare, 2833.33, 0.01) // per share — the figure the spec shows
})

test('mutual fund: Rp10M @NAV1200 + Rp5M @NAV1250 → ~12,333.33 units, avg NAV ~1216', () => {
  const a = aggregate(
    [
      { type: 'BUY', quantity: 8333.3333, unit_price: 1200, total_amount: 10_000_000, transaction_date: '2026-01-01' },
      { type: 'BUY', quantity: 4000, unit_price: 1250, total_amount: 5_000_000, transaction_date: '2026-02-01' },
    ],
    { unit: 'unit' },
  )
  close(a.totalQuantity, 12_333.33, 0.01)
  close(a.investedAmount, 15_000_000)
  close(a.avgCostPerUnit, 1216.22, 0.5)
})

test('partial SELL reduces invested at moving-average cost, books realized P&L', () => {
  const a = aggregate(
    [
      { type: 'BUY', quantity: 100, unit_price: 3000, total_amount: 30_000_000, transaction_date: '2026-01-10' },
      { type: 'BUY', quantity: 50, unit_price: 2500, total_amount: 12_500_000, transaction_date: '2026-03-15' },
      // sell 30 lot at 3500/share → proceeds 30×3500×100 = 10,500,000
      { type: 'SELL', quantity: 30, unit_price: 3500, total_amount: 10_500_000, transaction_date: '2026-04-01' },
    ],
    { unit: 'lot' },
  )
  close(a.totalQuantity, 120) // 150 − 30
  // avg cost before sale = 42.5M / 150 = 283,333/lot → sold 30 → cost removed 8.5M
  close(a.investedAmount, 34_000_000, 1)
  close(a.avgCostPerUnit, 283_333, 1) // unchanged by a sale
  // realized = 10.5M proceeds − 8.5M cost = 2.0M
  close(a.realizedPnl, 2_000_000, 1)
  assert.equal(a.sellCount, 1)
})

test('full SELL empties the position to zero', () => {
  const a = aggregate(
    [
      { type: 'BUY', quantity: 10, unit_price: 1000, total_amount: 10_000, transaction_date: '2026-01-01' },
      { type: 'SELL', quantity: 10, unit_price: 1500, total_amount: 15_000, transaction_date: '2026-02-01' },
    ],
    { unit: 'shares' },
  )
  close(a.totalQuantity, 0)
  close(a.investedAmount, 0)
  close(a.avgCostPerUnit, 0)
  close(a.realizedPnl, 5_000)
})

test('empty ledger returns zeros without throwing', () => {
  const a = aggregate([], { unit: 'shares' })
  assert.equal(a.totalQuantity, 0)
  assert.equal(a.investedAmount, 0)
  assert.equal(a.avgCostPerUnit, 0)
  assert.equal(a.txnCount, 0)
  assert.deepEqual(a.timeline, [])
})

test('timeline accumulates invested across events in date order', () => {
  const a = aggregate(
    [
      { type: 'BUY', quantity: 5, unit_price: 100, total_amount: 500, transaction_date: '2026-02-01' },
      { type: 'BUY', quantity: 5, unit_price: 100, total_amount: 500, transaction_date: '2026-01-01' },
    ],
    { unit: 'shares' },
  )
  // Re-sorted chronologically: Jan then Feb.
  assert.equal(a.timeline.length, 2)
  close(a.timeline[0].cumulativeInvested, 500)
  close(a.timeline[1].cumulativeInvested, 1000)
  assert.equal(a.firstDate, '2026-01-01')
  assert.equal(a.lastDate, '2026-02-01')
})
