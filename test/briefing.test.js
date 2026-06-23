// Run with:  npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fmtMoney, fmtSignedMoney, fmtPct, moveDot, holdingDayPnl, buildBriefingMessage,
} from '../src/lib/briefing.js'

test('fmtMoney formats by currency', () => {
  assert.equal(fmtMoney(2713000, 'IDR'), 'Rp2.713.000')
  assert.equal(fmtMoney(489.1, 'USD'), '$489.10')
})

test('fmtSignedMoney prefixes sign on the magnitude', () => {
  assert.equal(fmtSignedMoney(-78.6, 'USD'), '-$78.60')
  assert.equal(fmtSignedMoney(420000, 'IDR'), '+Rp420.000')
})

test('fmtPct always shows sign + 2dp', () => {
  assert.equal(fmtPct(1.83), '+1.83%')
  assert.equal(fmtPct(-0.41), '-0.41%')
  assert.equal(fmtPct(0), '+0.00%')
})

test('moveDot reflects direction with a flat dead-zone', () => {
  assert.equal(moveDot(1.2), '🟢')
  assert.equal(moveDot(-2), '🔴')
  assert.equal(moveDot(0.01), '⚪️')
})

test('holdingDayPnl derives money move from percent', () => {
  // +1% on a 101 value implies +1 from a prev of 100
  const pnl = holdingDayPnl({ value: 101, dayChange: 1 })
  assert.ok(Math.abs(pnl - 1) < 1e-9)
  assert.equal(holdingDayPnl({ value: 500, dayChange: 0 }), 0)
})

test('buildBriefingMessage includes movers, totals, and is HTML-safe', () => {
  const msg = buildBriefingMessage({
    holdings: [
      { symbol: 'QQQ', currency: 'USD', value: 2445.6, dayChange: 1.83 },
      { symbol: 'SPY', currency: 'USD', value: 2706, dayChange: -0.41 },
    ],
    total: { value: 100000000, cost: 88000000, pnl: 12000000, pnlPct: 13.6, currency: 'IDR' },
    displayCurrency: 'IDR',
    fxRate: 16000,
    now: new Date('2026-06-23T01:00:00Z'),
  })
  assert.match(msg, /Portfolio Briefing/)
  assert.match(msg, /QQQ/)
  assert.match(msg, /\+1\.83%/)
  assert.match(msg, /-0\.41%/)
  assert.match(msg, /Total P&amp;L/) // & is escaped for Telegram HTML
  // Biggest mover first: QQQ (1.83) ranks above SPY (0.41)
  assert.ok(msg.indexOf('QQQ') < msg.indexOf('SPY'))
})

test('buildBriefingMessage handles an empty portfolio', () => {
  const msg = buildBriefingMessage({ holdings: [], total: {}, displayCurrency: 'IDR' })
  assert.match(msg, /No holdings yet/)
})
