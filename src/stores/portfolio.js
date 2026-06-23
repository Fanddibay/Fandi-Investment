import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { valuate } from '@/lib/valuation'
import { aggregate } from '@/lib/transactions'
import { fetchAntamGoldPrice } from '@/lib/gold'
import { fetchLiveNews, dedupeNews } from '@/lib/news'
import { deriveHoldingColumns, txnSignature } from '@/lib/portfolioData'

// Prices are considered "fresh" for this many minutes. Inside the window we
// serve cached snapshots from the DB and never call the (heavy) Yahoo sync.
// Outside it, a load or auto-poll will trigger one sync. A manual refresh
// always forces a sync regardless. This is what keeps the app off real-time.
const PRICE_MAX_AGE_MIN = 10

// ANTAM gold updates ~daily — cache the live price this long before re-fetching.
const GOLD_MAX_AGE_MIN = 6 * 60

const FX_FALLBACK = 16000 // USD→IDR fallback if Yahoo rate is unavailable

// Newer columns (invested_amount, entry_nav) are added by migrations. If a DB
// hasn't run them yet, a write including those columns fails with a PostgREST
// schema error naming the missing column. We strip it and retry so the app
// never hard-breaks. Funds stay correct meanwhile because entry_price carries
// the per-unit entry NAV that the engine falls back to.
function missingColumn(error, row) {
  if (!error) return null
  const m = /'([a-z_]+)' column/.exec(error.message || '')
  const col = m?.[1]
  return col && col in row ? col : null
}

async function writeResilient(run, row) {
  let payload = { ...row }
  let res = await run(payload)
  // Retry up to a couple of times in case multiple new columns are missing.
  for (let i = 0; i < 3; i++) {
    const col = missingColumn(res.error, payload)
    if (!col) break
    console.warn(`[portfolio] "${col}" column missing — run the latest migration. Retrying without it.`)
    const { [col]: _omit, ...rest } = payload
    payload = rest
    res = await run(payload)
  }
  return res
}

function insertResilient(row) {
  return writeResilient((p) => supabase.from('holdings').insert(p).select().single(), row)
}

function updateResilient(id, patch) {
  return writeResilient((p) => supabase.from('holdings').update(p).eq('id', id).select().single(), patch)
}

// ---------------------------------------------------------------------------
// Local transaction ledger (browser fallback)
// ---------------------------------------------------------------------------
// The `transactions` table is created by a migration. Until `supabase db push`
// runs, the table doesn't exist and every insert fails — which made Add/Sell
// appear broken. So when the table is unavailable we keep a fully-working
// ledger in localStorage: seeded once from each existing holding's position,
// then mutated by add/edit/delete. The moment the real table exists, the DB
// becomes authoritative and this fallback is ignored.
const TXN_LS_KEY = 'portfolioTxns'

function loadLocalTxns() {
  try {
    return JSON.parse(localStorage.getItem(TXN_LS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveLocalTxns(txns) {
  localStorage.setItem(TXN_LS_KEY, JSON.stringify(txns))
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const lotMult = (unit) => (unit === 'lot' ? 100 : 1)

// Build one opening BUY from a holding's stored position — mirrors the SQL
// backfill so the local ledger reproduces today's numbers exactly.
function seedTxnFromHolding(h) {
  const qty = Number(h.quantity) || 0
  const unitPrice = Number(h.entry_nav ?? h.entry_price) || 0
  const total =
    Number(h.invested_amount) ||
    (Number(h.entry_price) || 0) * qty * lotMult(h.unit) ||
    0
  return {
    id: newId(),
    asset_id: h.id,
    type: 'BUY',
    quantity: qty,
    unit_price: unitPrice,
    total_amount: total,
    transaction_date: h.purchase_date ?? null,
    created_at: h.created_at ?? new Date().toISOString(),
    notes: null,
    _local: true,
  }
}

export const usePortfolioStore = defineStore('portfolio', {
  state: () => ({
    holdings: [],
    transactions: [],
    // Whether the Supabase `transactions` table exists. false → use the
    // localStorage ledger (set in fetchTransactions).
    transactionsAvailable: false,
    snapshots: {},
    news: [],
    loading: false,
    syncing: false,
    lastUpdated: null, // timestamp of the newest snapshot we have
    displayCurrency: localStorage.getItem('displayCurrency') || 'IDR',
    // Live ANTAM gold price (client-fetched via proxy), cached across reloads.
    goldPrice: JSON.parse(localStorage.getItem('goldPrice') || 'null'),
  }),

  getters: {
    // Live USD→IDR rate, fetched alongside prices. Falls back if missing.
    fxRate: (state) => state.snapshots['USD-IDR']?.price || FX_FALLBACK,

    // Sentiment tally across the current news set — powers the pulse bar.
    newsSentiment: (state) => {
      const counts = { positive: 0, neutral: 0, negative: 0, total: state.news.length }
      for (const n of state.news) counts[n.sentiment ?? 'neutral']++
      return counts
    },

    // Transactions grouped by the asset they belong to.
    transactionsByAsset: (state) => {
      const map = {}
      for (const t of state.transactions) {
        ;(map[t.asset_id] ??= []).push(t)
      }
      return map
    },

    // Each holding enriched by the per-asset-class valuation engine. The engine
    // picks the right model (stock price×shares vs fund units×NAV−invested), so
    // funds are no longer valued with the stock formula. `shares` already
    // accounts for the lot→share multiplier.
    //
    // Position fields (quantity, invested, average cost) are DERIVED from the
    // asset's transaction ledger via aggregate(), then fed into the unchanged
    // valuation engine as a synthesized "effective" holding. Assets with no
    // transactions yet fall back to their stored columns (legacy / pre-migration
    // safety), so the app never hard-breaks before the backfill runs.
    holdingsWithSnapshot() {
      const state = this
      const byAsset = this.transactionsByAsset
      return state.holdings.map((h) => {
        let snap = state.snapshots[h.symbol] ?? {}
        // Gold uses the live ANTAM price (client-fetched) when available,
        // overriding any spot-derived DB snapshot.
        if (h.asset_class === 'gold') {
          // The GOLD-ANTAM price snapshot (written by fetch-prices) carries the
          // authoritative change_pct — pull it in regardless of the holding's
          // own symbol, which may differ (e.g. 'ANTM' vs 'GOLD-ANTAM').
          const goldSnap = state.snapshots['GOLD-ANTAM'] ?? {}
          snap = { ...goldSnap, ...snap }
          if (state.goldPrice) {
            const g = state.goldPrice
            snap = {
              ...snap,
              price: g.sellPrice, // buyback = realizable valuation price
              buy_price: g.buyPrice,
              sell_price: g.sellPrice,
              fetched_at: g.asOf,
            }
          }
        }

        // Derive the position from transactions when the asset has any.
        const txns = byAsset[h.id] ?? []
        let effective = h
        let agg = null
        if (txns.length) {
          agg = aggregate(txns, { unit: h.unit })
          const perUnitClass = h.asset_class === 'fund' || h.asset_class === 'gold'
          effective = {
            ...h,
            quantity: agg.totalQuantity,
            invested_amount: agg.investedAmount,
            entry_nav: agg.avgCostPerUnit,
            entry_price: perUnitClass ? agg.avgCostPerUnit : agg.avgCostPerShare,
          }
        }

        // Live snapshot price only applies to market-fed assets; funds/bonds
        // priced manually pass null and the engine uses their current NAV.
        const v = valuate(effective, { price: snap.price ?? null, snapshot: snap })
        return {
          ...h,
          ...v,
          dayChange: snap.change_pct ?? 0,
          dayChangePx: snap.change_px ?? 0,
          // Transaction-derived extras for the detail page.
          realizedPnl: agg?.realizedPnl ?? 0,
          txnCount: agg?.txnCount ?? 0,
          buyCount: agg?.buyCount ?? 0,
          sellCount: agg?.sellCount ?? 0,
          avgCostPerUnit: agg?.avgCostPerUnit ?? v.entryPrice ?? 0,
          firstDate: agg?.firstDate ?? h.purchase_date ?? null,
          timeline: agg?.timeline ?? [],
          transactions: txns,
        }
      })
    },

    // Subtotals split by the asset's native currency (USD vs IDR).
    totalsByCurrency() {
      const buckets = {}
      for (const h of this.holdingsWithSnapshot) {
        const cur = h.currency || 'USD'
        if (!buckets[cur]) buckets[cur] = { value: 0, cost: 0, pnl: 0 }
        buckets[cur].value += h.value
        buckets[cur].cost += h.cost
        buckets[cur].pnl += h.pnl
      }
      return buckets
    },

    // Combined totals converted into the chosen display currency.
    grandTotal() {
      const to = this.displayCurrency
      const rate = this.fxRate
      const convert = (amount, from) => {
        if (from === to) return amount
        if (from === 'USD' && to === 'IDR') return amount * rate
        if (from === 'IDR' && to === 'USD') return amount / rate
        return amount
      }
      let value = 0, cost = 0
      for (const [cur, b] of Object.entries(this.totalsByCurrency)) {
        value += convert(b.value, cur)
        cost += convert(b.cost, cur)
      }
      const pnl = value - cost
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
      return { value, cost, pnl, pnlPct, currency: to }
    },

    // Each holding's share of total portfolio value (in display currency).
    allocations() {
      const to = this.displayCurrency
      const rate = this.fxRate
      const conv = (a, from) =>
        from === to ? a : (from === 'USD' ? a * rate : a / rate)
      const total = this.grandTotal.value || 1
      const map = {}
      for (const h of this.holdingsWithSnapshot) {
        map[h.id] = (conv(h.value, h.currency) / total) * 100
      }
      return map
    },
  },

  actions: {
    setDisplayCurrency(cur) {
      this.displayCurrency = cur
      localStorage.setItem('displayCurrency', cur)
    },

    async fetchHoldings() {
      this.loading = true
      const { data, error } = await supabase
        .from('holdings')
        .select('*')
        .order('created_at', { ascending: true })
      if (!error) this.holdings = data ?? []
      this.loading = false
    },

    async fetchSnapshots() {
      const { data, error } = await supabase
        .from('price_snapshots')
        .select('*')
        .order('fetched_at', { ascending: false })

      if (!error && data) {
        const latest = {}
        for (const row of data) {
          if (!latest[row.symbol]) latest[row.symbol] = row
        }
        this.snapshots = latest
        // Reflect the *actual* price time, not "now" — so staleness is honest.
        const newest = data[0]?.fetched_at
        this.lastUpdated = newest ? new Date(newest) : null
      }
    },

    // Full price-snapshot history for the value-over-time chart. Unlike
    // fetchSnapshots (which keeps only the latest per symbol), this returns the
    // raw ascending series. Optionally bounded by `sinceMs` to limit payload.
    async fetchPriceHistory({ sinceMs = null } = {}) {
      let q = supabase
        .from('price_snapshots')
        .select('symbol, price, fetched_at')
        .order('fetched_at', { ascending: true })
      if (sinceMs) q = q.gte('fetched_at', new Date(sinceMs).toISOString())
      const { data, error } = await q
      if (error) {
        console.warn('[portfolio] price history fetch failed:', error.message)
        return []
      }
      return data ?? []
    },

    // News is read from two places and merged: the `news_items` table (written
    // server-side by the `fetch-news` function) plus a live client pull of the
    // CNBC/Yahoo/MarketWatch RSS feeds through the dev proxy. The DB gives us
    // history that survives reloads; the live pull keeps dev fresh without
    // deploying the function. Either source failing still renders the other.
    async fetchNews() {
      const { data } = await supabase
        .from('news_items')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(40)
      const dbRows = data ?? []

      // Held symbols drive the per-symbol Yahoo feeds + general-feed tagging.
      const symbols = [...new Set(this.holdings.map((h) => h.symbol).filter(Boolean))]
      let live = []
      try {
        live = await fetchLiveNews(symbols)
      } catch (e) {
        console.warn('[news] live fetch unavailable:', e?.message ?? e)
      }

      this.news = dedupeNews([...dbRows, ...live])
    },

    // Transaction ledger. Prefers the Supabase `transactions` table; if it
    // doesn't exist yet (migration not pushed), falls back to a localStorage
    // ledger seeded from current holdings so Add/Sell still work end-to-end.
    async fetchTransactions() {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('transaction_date', { ascending: true })

      if (!error) {
        this.transactionsAvailable = true
        this.transactions = data ?? []
        return
      }

      // Table missing → local ledger.
      this.transactionsAvailable = false
      if (!this._txWarned) {
        console.warn('[portfolio] transactions table not found — using a browser-local ledger. Run `supabase db push` to persist transactions to Supabase.', error.message)
        this._txWarned = true
      }
      let local = loadLocalTxns()
      // Seed once from existing holdings so every position has an opening BUY.
      if (!local.length && this.holdings.length) {
        local = this.holdings.filter((h) => Number(h.quantity) > 0).map(seedTxnFromHolding)
        saveLocalTxns(local)
      }
      this.transactions = local
    },

    async addHolding(holding) {
      const { data, error } = await insertResilient(holding)
      if (!error && data) this.holdings.push(data)
      return { data, error }
    },

    async updateHolding(id, patch) {
      const { data, error } = await updateResilient(id, patch)
      if (!error && data) {
        const i = this.holdings.findIndex((h) => h.id === id)
        if (i !== -1) this.holdings[i] = data
      }
      return { data, error }
    },

    async deleteHolding(id) {
      const { error } = await supabase.from('holdings').delete().eq('id', id)
      if (!error) {
        this.holdings = this.holdings.filter((h) => h.id !== id)
        // The DB cascades transactions on asset delete; mirror that locally.
        this.transactions = this.transactions.filter((t) => t.asset_id !== id)
        if (!this.transactionsAvailable) saveLocalTxns(this.transactions)
      }
      return { error }
    },

    // --- Transactions -------------------------------------------------------

    async addTransaction(tx) {
      if (this.transactionsAvailable) {
        const { data, error } = await supabase.from('transactions').insert(tx).select().single()
        if (!error && data) this.transactions.push(data)
        return { data, error }
      }
      // Local ledger.
      const row = { id: newId(), created_at: new Date().toISOString(), _local: true, ...tx }
      this.transactions = [...this.transactions, row]
      saveLocalTxns(this.transactions)
      return { data: row, error: null }
    },

    async updateTransaction(id, patch) {
      if (this.transactionsAvailable) {
        const { data, error } = await supabase
          .from('transactions')
          .update(patch)
          .eq('id', id)
          .select()
          .single()
        if (!error && data) {
          const i = this.transactions.findIndex((t) => t.id === id)
          if (i !== -1) this.transactions[i] = data
        }
        return { data, error }
      }
      // Local ledger.
      const i = this.transactions.findIndex((t) => t.id === id)
      if (i === -1) return { data: null, error: { message: 'Transaction not found' } }
      const updated = { ...this.transactions[i], ...patch }
      this.transactions = this.transactions.map((t) => (t.id === id ? updated : t))
      saveLocalTxns(this.transactions)
      return { data: updated, error: null }
    },

    async deleteTransaction(id) {
      if (this.transactionsAvailable) {
        const { error } = await supabase.from('transactions').delete().eq('id', id)
        if (!error) this.transactions = this.transactions.filter((t) => t.id !== id)
        return { error }
      }
      // Local ledger.
      this.transactions = this.transactions.filter((t) => t.id !== id)
      saveLocalTxns(this.transactions)
      return { error: null }
    },

    // Create a new asset and its first transaction together. The asset row
    // holds identity only; the transaction carries the opening position.
    async addAssetWithTransaction(asset, firstTx) {
      const { data: created, error } = await this.addHolding(asset)
      if (error || !created) return { data: null, error }
      const { error: txError } = await this.addTransaction({ ...firstTx, asset_id: created.id })
      // If the transaction couldn't be written (e.g. table missing), keep the
      // asset but surface the error so the UI can warn.
      return { data: created, error: txError ?? null }
    },

    // --- Import / restore ---------------------------------------------------
    // Restore a validated export payload (see lib/portfolioData.js). Two modes:
    //   'replace' — wipe the current portfolio, then import everything fresh.
    //   'merge'   — keep existing assets; add new ones; for assets matched by
    //               symbol, append only transactions not already present.
    // Reuses the resilient holding/transaction writers, so it works the same
    // against Supabase or the localStorage ledger. Returns a result summary.
    async importPortfolio(payload, { mode = 'merge' } = {}) {
      const result = { mode, assetsAdded: 0, assetsMatched: 0, txnsAdded: 0, txnsSkipped: 0, errors: [] }

      if (mode === 'replace') {
        // Deleting a holding cascades its transactions (DB) / mirrors locally.
        for (const h of [...this.holdings]) {
          const { error } = await this.deleteHolding(h.id)
          if (error) result.errors.push(`Could not remove ${h.symbol}: ${error.message}`)
        }
      }

      // Index existing assets by symbol for merge matching.
      const bySymbol = new Map()
      for (const h of this.holdings) bySymbol.set(String(h.symbol ?? '').trim().toLowerCase(), h)

      for (const asset of payload.assets) {
        const sym = String(asset.meta.symbol ?? '').trim().toLowerCase()
        const match = mode === 'merge' ? bySymbol.get(sym) : null

        if (match) {
          // Append only non-duplicate transactions to the existing asset.
          result.assetsMatched++
          const seen = new Set((this.transactionsByAsset[match.id] ?? []).map(txnSignature))
          for (const t of asset.transactions) {
            if (seen.has(txnSignature(t))) { result.txnsSkipped++; continue }
            const { error } = await this.addTransaction({ ...t, asset_id: match.id })
            if (error) result.errors.push(`${match.symbol}: ${error.message}`)
            else { result.txnsAdded++; seen.add(txnSignature(t)) }
          }
          continue
        }

        // New asset — create identity + legacy position columns, then its ledger.
        const row = deriveHoldingColumns(asset)
        const { data: created, error } = await this.addHolding(row)
        if (error || !created) {
          result.errors.push(`Could not add ${asset.meta.symbol}: ${error?.message ?? 'unknown error'}`)
          continue
        }
        result.assetsAdded++
        bySymbol.set(sym, created)
        for (const t of asset.transactions) {
          const { error: txErr } = await this.addTransaction({ ...t, asset_id: created.id })
          if (txErr) result.errors.push(`${asset.meta.symbol}: ${txErr.message}`)
          else result.txnsAdded++
        }
      }

      // Reload so derived getters (valuation, allocations) reflect the import.
      await Promise.all([this.fetchHoldings(), this.fetchTransactions()])
      return result
    },

    // Heavy: calls the edge function that hits Yahoo Finance.
    async syncPrices() {
      const { error } = await supabase.functions.invoke('fetch-prices')
      if (error) console.error('Price sync failed:', error)
      return !error
    },

    // Cheap: read everything we already have cached in the DB. No Yahoo call.
    async loadCached() {
      await this.fetchHoldings()
      await Promise.all([this.fetchSnapshots(), this.fetchNews(), this.fetchTransactions()])
    },

    // Live ANTAM gold price. Cached GOLD_MAX_AGE_MIN (ANTAM moves daily); a
    // forced refresh ignores the cache. Falls back silently to the DB snapshot.
    async refreshGoldPrice({ force = false } = {}) {
      const holdsGold = this.holdings.some((h) => h.asset_class === 'gold')
      if (!holdsGold) return
      const asOf = this.goldPrice?.asOf ? new Date(this.goldPrice.asOf).getTime() : 0
      const ageMin = asOf ? (Date.now() - asOf) / 60000 : Infinity
      if (!force && ageMin < GOLD_MAX_AGE_MIN) return
      const price = await fetchAntamGoldPrice()
      if (price) {
        this.goldPrice = price
        localStorage.setItem('goldPrice', JSON.stringify(price))
      }
    },

    // Age of the freshest price we hold, in minutes. null = no prices yet.
    priceAgeMinutes() {
      if (!this.lastUpdated) return null
      return (Date.now() - this.lastUpdated.getTime()) / 60000
    },

    // Pull fresh prices — but only if stale, unless forced. `force: true` is
    // the manual Refresh button; `force: false` is the background auto-poll.
    async refreshPrices({ force = false } = {}) {
      if (this.syncing) return
      const age = this.priceAgeMinutes()
      const stale = age === null || age >= PRICE_MAX_AGE_MIN
      if (!force && !stale) return
      this.syncing = true
      try {
        await this.syncPrices()
        await this.fetchSnapshots()
      } finally {
        this.syncing = false
      }
    },

    // First load of the app: show cached data instantly, then top up if stale.
    async init() {
      await this.loadCached()
      await Promise.all([
        this.refreshPrices({ force: false }),
        this.refreshGoldPrice({ force: false }),
      ])
    },

    // Manual refresh (sidebar button) — always forces a live sync.
    async refreshAll({ force = true } = {}) {
      await Promise.all([this.fetchHoldings(), this.fetchTransactions()])
      await Promise.all([
        this.refreshPrices({ force }),
        this.refreshGoldPrice({ force }),
      ])
      await this.fetchNews()
    },
  },
})
