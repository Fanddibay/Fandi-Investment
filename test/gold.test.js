// Run with:  npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickAntamGramPrice } from '../src/lib/gold.js'
import { valuate, valuateGold } from '../src/lib/valuation.js'

function close(actual, expected, eps = 1) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} within ${eps} of ${expected}`)
}

// Representative anekalogam payload (shape captured from the live API).
const anekalogam = {
  success: true,
  data: [
    { source: 'anekalogam', material: 'gold', materialType: 'Logam Mulia ANTAM Certicard gramasi 100 gram produksi tahun terbaru', weight: 1, weightUnit: 'gr', sellPrice: 2598000, buybackPrice: 2580000, currency: 'IDR', recordedDate: '2026-06-22' },
    { source: 'anekalogam', material: 'gold', materialType: 'LM Antam produksi tahun 2026', weight: 0.5, weightUnit: 'gr', sellPrice: 1410000, buybackPrice: 1200000, currency: 'IDR', recordedDate: '2026-06-22' },
    { source: 'anekalogam', material: 'gold', materialType: 'LM Antam produksi tahun 2026', weight: 1, weightUnit: 'gr', sellPrice: 2710000, buybackPrice: 2580000, currency: 'IDR', recordedDate: '2026-06-22' },
  ],
}

test('pickAntamGramPrice selects the plain 1g LM Antam line', () => {
  const p = pickAntamGramPrice(anekalogam)
  assert.equal(p.buyPrice, 2710000) // dealer sell price = what you pay
  assert.equal(p.sellPrice, 2580000) // buyback = what you get
  assert.equal(p.recordedDate, '2026-06-22')
  assert.equal(p.source, 'anekalogam')
})

test('pickAntamGramPrice returns null on empty / zero-price payloads', () => {
  assert.equal(pickAntamGramPrice({ data: [] }), null)
  assert.equal(pickAntamGramPrice({ data: [{ material: 'gold', weight: 1, buybackPrice: 0 }] }), null)
  assert.equal(pickAntamGramPrice(null), null)
})

test('valuateGold values grams at the ANTAM buyback price', () => {
  const v = valuateGold(
    { asset_class: 'gold', quantity: 10, unit: 'gram', entry_price: 3_100_000, invested_amount: 31_000_000, currency: 'IDR' },
    { price: 2_580_000, buyPrice: 2_710_000, sellPrice: 2_580_000, asOf: '2026-06-22T12:00:00Z' },
  )
  assert.equal(v.kind, 'gold')
  assert.equal(v.provider, 'ANTAM')
  close(v.gramsOwned, 10)
  close(v.value, 25_800_000) // 10g × 2,580,000
  close(v.invested, 31_000_000)
  close(v.pnl, -5_200_000)
  close(v.pnlPct, -16.77, 0.01)
  close(v.averageBuyPrice, 3_100_000)
  assert.equal(v.buyPrice, 2_710_000)
  assert.equal(v.lastUpdated, '2026-06-22T12:00:00Z')
})

test('gold is routed to the gold engine, not the stock engine', () => {
  const v = valuate(
    { asset_class: 'gold', quantity: 5, unit: 'gram', entry_price: 2_000_000, currency: 'IDR' },
    { snapshot: { price: 2_580_000, buy_price: 2_710_000, sell_price: 2_580_000, fetched_at: '2026-06-22T12:00:00Z' } },
  )
  assert.equal(v.kind, 'gold')
  close(v.value, 12_900_000) // 5g × buyback
})

test('gold never breaks when the live price is missing (entry fallback)', () => {
  const v = valuateGold(
    { asset_class: 'gold', quantity: 10, unit: 'gram', entry_price: 3_100_000, currency: 'IDR' },
    {},
  )
  close(v.currentGoldPrice, 3_100_000) // falls back to entry price
  close(v.value, 31_000_000)
  close(v.pnl, 0)
  assert.equal(v.lastUpdated, null)
})
