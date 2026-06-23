// ---------------------------------------------------------------------------
// Portfolio export / import — pure data layer
// ---------------------------------------------------------------------------
// Backup, migration and recovery for the whole portfolio. This module is
// deliberately framework-free (no Vue / Supabase) so it can be unit-tested
// under `node --test` and reused anywhere. The store orchestrates the actual
// DB writes; everything here just shapes, validates and diffs data.
//
// SCHEMA DESIGN — future-proof on purpose:
//   • `asset_class` is an open string ('stock' | 'etf' | 'fund' | 'gold' |
//     'bond' | 'crypto' | …). Adding US stocks, ETFs, crypto or bonds later
//     needs NO schema change — they're just new asset_class values.
//   • Every asset nests its OWN transaction ledger, so history travels with the
//     asset and merges cleanly.
//   • A `position` block carries the derived cost basis as a fallback for any
//     asset that arrives without transactions (legacy / partial exports).
// ---------------------------------------------------------------------------

import { aggregate } from './transactions.js'

export const EXPORT_SCHEMA = 'portfoliohq.portfolio'
export const EXPORT_VERSION = 1

// Identity / metadata copied verbatim per asset. Unknown future columns are
// preserved too (see buildExportPayload), so the schema never has to change.
const ASSET_FIELDS = [
  'symbol', 'name', 'asset_class', 'currency', 'unit',
  'category', 'manager', 'current_nav', 'purchase_date',
]
const TXN_FIELDS = ['type', 'quantity', 'unit_price', 'total_amount', 'transaction_date', 'notes']

const VALID_TXN_TYPES = new Set(['BUY', 'SELL'])

// Position columns mirrored onto the holding so valuation works even before a
// transaction backfill runs (and for assets exported without a ledger).
const POSITION_FIELDS = ['quantity', 'entry_price', 'entry_nav', 'invested_amount']

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k]
  return out
}

const symbolKey = (s) => String(s ?? '').trim().toLowerCase()

// A transaction's identity for dedup on merge: same trade if type + size +
// price + money + date all match. Rounded to kill floating-point dust.
export function txnSignature(t) {
  const r = (v) => Math.round((Number(v) || 0) * 1e6) / 1e6
  return [
    String(t.type ?? 'BUY').toUpperCase(),
    r(t.quantity),
    r(t.unit_price),
    r(t.total_amount),
    t.transaction_date ?? '',
  ].join('|')
}

// ---------------------------------------------------------------------------
// EXPORT — JSON
// ---------------------------------------------------------------------------

// Build the full export payload from store state. `transactions` is the flat
// ledger; we group it by asset here so each asset owns its history.
export function buildExportPayload({ holdings = [], transactions = [], displayCurrency = 'IDR', settings = null } = {}) {
  const byAsset = {}
  for (const t of transactions) (byAsset[t.asset_id] ??= []).push(t)

  const assets = holdings.map((h) => {
    const txns = (byAsset[h.id] ?? []).map((t) => pick(t, TXN_FIELDS))
    return {
      ...pick(h, ASSET_FIELDS),
      position: pick(h, POSITION_FIELDS),
      transactions: txns,
    }
  })

  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    app: 'PortfolioHQ',
    display_currency: displayCurrency,
    // Non-secret settings only — the Telegram bot token never lives client-side.
    settings: settings ? pick(settings, ['telegram_chat_id', 'alert_threshold', 'briefing_time']) : null,
    asset_count: assets.length,
    transaction_count: assets.reduce((n, a) => n + a.transactions.length, 0),
    assets,
  }
}

export function serializeExport(payload) {
  return JSON.stringify(payload, null, 2)
}

// ---------------------------------------------------------------------------
// EXPORT — CSV (one row per holding, for spreadsheet analysis)
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'Asset Name', 'Symbol', 'Asset Type', 'Currency', 'Quantity',
  'Average Cost', 'Current Price', 'Current Value', 'Profit/Loss',
  'Profit %', 'First Transaction Date',
]

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v)
  // Quote anything containing a comma, quote or newline; escape inner quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const num = (v, dp = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(dp) : '')

// `rows` are the valuated holdings (store.holdingsWithSnapshot): they already
// carry value / cost / pnl / pnlPct / entryPrice / currentPrice / firstDate.
export function buildCsv(rows = []) {
  const lines = [CSV_COLUMNS.map(csvCell).join(',')]
  for (const h of rows) {
    lines.push([
      h.name,
      h.symbol,
      h.asset_class,
      h.currency,
      num(h.quantity, 6),
      num(h.entryPrice ?? h.entry_price),
      num(h.currentPrice ?? h.current_nav),
      num(h.value),
      num(h.pnl),
      num(h.pnlPct),
      h.firstDate ?? h.purchase_date ?? '',
    ].map(csvCell).join(','))
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// IMPORT — parse + validate
// ---------------------------------------------------------------------------

// Parse raw file text and validate structure + asset/transaction data. Returns
// { payload, errors, warnings }. A corrupted or wrong-shaped file yields errors
// and a null payload so the caller can block the import.
export function parsePortfolioFile(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return { payload: null, errors: ['This file isn’t valid JSON. Export a fresh backup and try again.'], warnings: [] }
  }
  return validatePayload(raw)
}

export function validatePayload(raw) {
  const errors = []
  const warnings = []

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { payload: null, errors: ['Unrecognised file — expected a PortfolioHQ JSON backup.'], warnings }
  }
  if (raw.schema && raw.schema !== EXPORT_SCHEMA) {
    warnings.push(`File schema "${raw.schema}" differs from "${EXPORT_SCHEMA}". Importing anyway.`)
  }
  if (raw.version && Number(raw.version) > EXPORT_VERSION) {
    warnings.push(`File was made by a newer version (v${raw.version}). Some fields may be ignored.`)
  }
  if (!Array.isArray(raw.assets)) {
    return { payload: null, errors: ['No assets found — the backup is missing its "assets" list.'], warnings }
  }
  if (raw.assets.length === 0) {
    errors.push('The backup contains no assets to import.')
  }

  const cleanAssets = []
  raw.assets.forEach((a, i) => {
    const label = a?.symbol || a?.name || `#${i + 1}`
    if (!a || typeof a !== 'object') {
      errors.push(`Asset ${label}: not a valid object.`)
      return
    }
    if (!a.symbol || !String(a.symbol).trim()) errors.push(`Asset ${label}: missing symbol.`)
    if (!a.name || !String(a.name).trim()) errors.push(`Asset ${label}: missing name.`)

    const txns = Array.isArray(a.transactions) ? a.transactions : []
    const cleanTxns = []
    txns.forEach((t, j) => {
      const tl = `${label} txn #${j + 1}`
      if (!t || typeof t !== 'object') { errors.push(`${tl}: not a valid object.`); return }
      const type = String(t.type ?? 'BUY').toUpperCase()
      if (!VALID_TXN_TYPES.has(type)) { errors.push(`${tl}: type must be BUY or SELL.`); return }
      const qty = Number(t.quantity)
      if (!Number.isFinite(qty) || qty <= 0) { errors.push(`${tl}: quantity must be a positive number.`); return }
      const total = Number(t.total_amount)
      if (t.total_amount != null && !Number.isFinite(total)) { errors.push(`${tl}: total amount isn’t a number.`); return }
      cleanTxns.push({
        type,
        quantity: qty,
        unit_price: Number(t.unit_price) || 0,
        total_amount: Number.isFinite(total) ? total : 0,
        transaction_date: t.transaction_date || null,
        notes: t.notes || null,
      })
    })

    if (!txns.length && !a.position) {
      warnings.push(`Asset ${label}: no transactions or position — it will import with a zero balance.`)
    }

    cleanAssets.push({
      meta: pick(a, ASSET_FIELDS),
      position: a.position && typeof a.position === 'object' ? pick(a.position, POSITION_FIELDS) : null,
      transactions: cleanTxns,
    })
  })

  if (errors.length) return { payload: null, errors, warnings }

  return {
    payload: {
      schema: raw.schema ?? EXPORT_SCHEMA,
      version: Number(raw.version) || EXPORT_VERSION,
      display_currency: raw.display_currency ?? null,
      settings: raw.settings ?? null,
      assets: cleanAssets,
    },
    errors,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// IMPORT — summary / diff (no writes)
// ---------------------------------------------------------------------------

// Compare a validated payload against current state for a given mode and return
// a human summary so the UI can show exactly what will happen before executing.
//   existingHoldings        — store.holdings
//   transactionsByAsset     — store.transactionsByAsset  (keyed by holding id)
export function summarizeImport(payload, { existingHoldings = [], transactionsByAsset = {}, mode = 'merge' } = {}) {
  const bySymbol = new Map()
  for (const h of existingHoldings) bySymbol.set(symbolKey(h.symbol), h)

  const importAssets = payload.assets.length
  const importTxns = payload.assets.reduce((n, a) => n + a.transactions.length, 0)

  if (mode === 'replace') {
    const replacedTxns = existingHoldings.reduce(
      (n, h) => n + (transactionsByAsset[h.id]?.length ?? 0), 0,
    )
    return {
      mode,
      newAssets: importAssets,
      matchedAssets: 0,
      newTxns: importTxns,
      duplicateTxns: 0,
      removedAssets: existingHoldings.length,
      removedTxns: replacedTxns,
      importAssets,
      importTxns,
    }
  }

  // Merge — match by symbol, dedup transactions intelligently.
  let newAssets = 0, matchedAssets = 0, newTxns = 0, duplicateTxns = 0
  for (const a of payload.assets) {
    const match = bySymbol.get(symbolKey(a.meta.symbol))
    if (!match) {
      newAssets++
      newTxns += a.transactions.length
      continue
    }
    matchedAssets++
    const existing = new Set((transactionsByAsset[match.id] ?? []).map(txnSignature))
    for (const t of a.transactions) {
      if (existing.has(txnSignature(t))) duplicateTxns++
      else { newTxns++; existing.add(txnSignature(t)) }
    }
  }

  return {
    mode,
    newAssets,
    matchedAssets,
    newTxns,
    duplicateTxns,
    removedAssets: 0,
    removedTxns: 0,
    importAssets,
    importTxns,
  }
}

// ---------------------------------------------------------------------------
// IMPORT — derive a holding's legacy position columns from its data
// ---------------------------------------------------------------------------
// Mirrors AddHoldingModal: position is derived from the transaction ledger when
// present, otherwise taken from the exported `position` block. Keeps valuation
// correct even if the transactions table isn't available on the target.
export function deriveHoldingColumns(asset) {
  const meta = asset.meta
  const perUnitClass = meta.asset_class === 'fund' || meta.asset_class === 'gold'

  if (asset.transactions.length) {
    const agg = aggregate(asset.transactions, { unit: meta.unit })
    return {
      ...meta,
      quantity: agg.totalQuantity,
      invested_amount: agg.investedAmount,
      entry_nav: agg.avgCostPerUnit,
      entry_price: perUnitClass ? agg.avgCostPerUnit : agg.avgCostPerShare,
      purchase_date: meta.purchase_date ?? agg.firstDate ?? null,
    }
  }

  const pos = asset.position ?? {}
  return {
    ...meta,
    quantity: Number(pos.quantity) || 0,
    invested_amount: Number(pos.invested_amount) || 0,
    entry_nav: Number(pos.entry_nav) || 0,
    entry_price: Number(pos.entry_price) || 0,
  }
}
