// Run with:  npm test
// Covers the pure news logic. parseRssXml/fetchLiveNews need a DOM + network,
// so they're exercised in the browser, not here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreSentiment, categorize, tagSymbol, dedupeNews } from '../src/lib/news.js'

test('scoreSentiment reads the headline tilt', () => {
  assert.equal(scoreSentiment('Stocks surge as earnings beat estimates'), 'positive')
  assert.equal(scoreSentiment('Shares plunge on profit warning'), 'negative')
  assert.equal(scoreSentiment('Fed holds rates steady this week'), 'neutral')
})

test('scoreSentiment nets opposing words to neutral', () => {
  // one positive (gain) + one negative (fall) → tie → neutral
  assert.equal(scoreSentiment('Gains fade as banks fall'), 'neutral')
})

test('categorize refines from keywords, else falls back', () => {
  assert.equal(categorize('Apple Q3 revenue tops forecasts'), 'Earnings')
  assert.equal(categorize('Bitcoin rallies past resistance'), 'Crypto')
  assert.equal(categorize('Fed signals on inflation path'), 'Macro')
  assert.equal(categorize('Markets open mixed', 'Markets'), 'Markets')
})

test('tagSymbol maps aliases back to held tickers', () => {
  const held = ['QQQ', 'ANTM.JK']
  assert.equal(tagSymbol('Nasdaq hits new high', held), 'QQQ')
  assert.equal(tagSymbol('Antam reports record gold output', held), 'ANTM.JK')
  assert.equal(tagSymbol('Oil prices steady', held), null)
})

test('dedupeNews removes url dups, ignoring trailing slash + fragment', () => {
  const rows = [
    { url: 'https://x.com/a', title: 'A', published_at: '2026-06-22T10:00:00Z' },
    { url: 'https://x.com/a/', title: 'A dup', published_at: '2026-06-22T09:00:00Z' },
    { url: 'https://x.com/b#top', title: 'B', published_at: '2026-06-22T11:00:00Z' },
  ]
  const out = dedupeNews(rows)
  assert.equal(out.length, 2)
  // newest first
  assert.equal(out[0].title, 'B')
})
