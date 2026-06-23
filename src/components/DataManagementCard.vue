<template>
  <div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-6">
    <!-- Section header (DESIGN.md: icon chip + title + subtitle) -->
    <div class="flex items-center gap-3 mb-5">
      <div class="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
        <svg class="w-5 h-5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
          <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
        </svg>
      </div>
      <div>
        <h2 class="font-semibold text-white text-sm">Data Management</h2>
        <p class="text-xs text-slate-500">Back up, restore or migrate your portfolio</p>
      </div>
      <div class="ml-auto text-right">
        <p class="text-sm font-semibold text-white tabular-nums">{{ assetCount }}</p>
        <p class="text-xs text-slate-500">{{ assetCount === 1 ? 'asset' : 'assets' }}</p>
      </div>
    </div>

    <!-- EXPORT -->
    <div class="space-y-3">
      <p class="text-xs text-slate-400">
        Export a full backup as JSON, or a flat summary as CSV for spreadsheets.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" @click="exportJson" :disabled="!assetCount"
          class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-medium hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
          </svg>
          Export JSON
        </button>
        <button type="button" @click="exportCsv" :disabled="!assetCount"
          class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#2e3348] text-slate-300 text-sm hover:border-slate-500 hover:bg-[#1e2233] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
            <path d="M8 13h2M8 17h2M14 13h2M14 17h2" />
          </svg>
          Export CSV
        </button>
      </div>
      <p class="text-xs text-slate-600">
        Includes holdings, transaction history, categories and settings — never your bot token.
      </p>
    </div>

    <div class="h-px bg-[#2e3348] my-5" />

    <!-- IMPORT -->
    <div class="space-y-3">
      <p class="text-xs text-slate-400">Restore from a JSON backup. You’ll review a summary before anything changes.</p>

      <!-- Drop zone doubles as the file picker trigger -->
      <button type="button"
        @click="pickFile" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
        class="w-full flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border border-dashed text-center transition-all duration-200"
        :class="dragging ? 'border-sky-500 bg-sky-500/10' : 'border-[#2e3348] hover:border-slate-500 hover:bg-[#1e2233]'">
        <svg class="w-5 h-5 transition-colors duration-200" :class="dragging ? 'text-sky-400' : 'text-slate-500'"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
        </svg>
        <span class="text-sm text-white font-medium">Import JSON</span>
        <span class="text-xs text-slate-500">Click to choose a file or drop it here</span>
      </button>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onFileChange" />

      <!-- Validation errors -->
      <Transition name="status">
        <div v-if="parseErrors.length"
          class="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-1">
          <p class="text-xs font-medium text-red-400 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-red-400" />
            File can’t be imported
          </p>
          <p v-for="(e, i) in parseErrors.slice(0, 6)" :key="i" class="text-xs text-red-300/90 pl-3">{{ e }}</p>
          <p v-if="parseErrors.length > 6" class="text-xs text-red-300/70 pl-3">
            …and {{ parseErrors.length - 6 }} more issue(s).
          </p>
        </div>
      </Transition>
    </div>

    <!-- Status pill (success / error after an action) -->
    <Transition name="status">
      <p v-if="status.text" class="text-xs flex items-center gap-1.5 mt-4"
        :class="status.ok ? 'text-green-400' : 'text-red-400'">
        <span class="w-1.5 h-1.5 rounded-full" :class="status.ok ? 'bg-green-400' : 'bg-red-400'" />
        {{ status.text }}
      </p>
    </Transition>

    <!-- ===================== IMPORT REVIEW MODAL ===================== -->
    <Transition name="modal">
      <div v-if="review" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeReview" />
        <div class="relative bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
          <h2 class="text-white font-semibold text-lg mb-1">Review import</h2>
          <p class="text-xs text-slate-500 mb-5 truncate">
            {{ fileName }} · {{ review.assets.length }} assets ·
            {{ review.assets.reduce((n, a) => n + a.transactions.length, 0) }} transactions
          </p>

          <!-- Warnings -->
          <div v-if="parseWarnings.length" class="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 mb-5 space-y-1">
            <p v-for="(w, i) in parseWarnings.slice(0, 4)" :key="i" class="text-xs text-yellow-400 flex gap-1.5">
              <span>⚠</span><span>{{ w }}</span>
            </p>
          </div>

          <!-- Mode selector -->
          <div class="grid grid-cols-2 gap-3 mb-5">
            <button v-for="m in modes" :key="m.id" type="button" @click="mode = m.id"
              class="text-left px-3 py-3 rounded-xl border transition-all duration-200 active:scale-95"
              :class="mode === m.id
                ? (m.id === 'replace' ? 'border-red-500 bg-red-500/10' : 'border-sky-500 bg-sky-500/10')
                : 'border-[#2e3348] hover:border-slate-500'">
              <span class="text-sm font-medium block"
                :class="mode === m.id ? (m.id === 'replace' ? 'text-red-400' : 'text-sky-400') : 'text-white'">
                {{ m.label }}
              </span>
              <span class="text-xs text-slate-500 block mt-0.5">{{ m.desc }}</span>
            </button>
          </div>

          <!-- Summary -->
          <div class="rounded-xl bg-[#0f1117] border border-[#2e3348] p-4 mb-5">
            <Transition name="status" mode="out-in">
              <ul :key="mode" class="space-y-2">
                <li class="flex items-center justify-between text-sm">
                  <span class="text-slate-400">New assets added</span>
                  <span class="text-white font-medium tabular-nums">+{{ summary.newAssets }}</span>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-slate-400">New transactions added</span>
                  <span class="text-white font-medium tabular-nums">+{{ summary.newTxns }}</span>
                </li>
                <li v-if="mode === 'merge'" class="flex items-center justify-between text-sm">
                  <span class="text-slate-400">Existing assets matched</span>
                  <span class="text-slate-300 font-medium tabular-nums">{{ summary.matchedAssets }}</span>
                </li>
                <li v-if="mode === 'merge' && summary.duplicateTxns" class="flex items-center justify-between text-sm">
                  <span class="text-slate-400">Duplicate transactions skipped</span>
                  <span class="text-slate-400 font-medium tabular-nums">{{ summary.duplicateTxns }}</span>
                </li>
                <li v-if="mode === 'replace'" class="flex items-center justify-between text-sm pt-2 border-t border-[#2e3348]">
                  <span class="text-red-400">Current data removed</span>
                  <span class="text-red-400 font-medium tabular-nums">
                    −{{ summary.removedAssets }} assets, −{{ summary.removedTxns }} txns
                  </span>
                </li>
              </ul>
            </Transition>
          </div>

          <!-- Destructive warning for Replace -->
          <Transition name="status">
            <div v-if="mode === 'replace'" class="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 mb-5">
              <p class="text-xs text-red-300">
                This permanently deletes your current portfolio and replaces it with the file’s contents. This can’t be undone.
              </p>
            </div>
          </Transition>

          <div class="flex gap-3">
            <button type="button" @click="closeReview" :disabled="importing"
              class="flex-1 py-2.5 rounded-lg border border-[#2e3348] text-slate-400 text-sm hover:border-slate-500 disabled:opacity-40 transition-colors">
              Cancel
            </button>
            <button type="button" @click="runImport" :disabled="importing"
              class="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60 transition-all duration-200 active:scale-95"
              :class="mode === 'replace' ? 'bg-red-500 hover:bg-red-400' : 'bg-sky-500 hover:bg-sky-400'">
              {{ importing ? 'Importing…' : (mode === 'replace' ? 'Replace portfolio' : 'Merge import') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import { supabase } from '@/lib/supabase'
import {
  buildExportPayload, serializeExport, buildCsv,
  parsePortfolioFile, summarizeImport,
} from '@/lib/portfolioData'

const store = usePortfolioStore()

const assetCount = computed(() => store.holdings.length)

const status = ref({ text: '', ok: true })
function flash(text, ok = true) {
  status.value = { text, ok }
  setTimeout(() => (status.value = { text: '', ok }), 4500)
}

// --- File download helper ---------------------------------------------------
function download(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const stamp = () => new Date().toISOString().slice(0, 10)

// --- Export -----------------------------------------------------------------
async function exportJson() {
  // Pull the non-secret settings so a restore carries alert/briefing prefs too.
  let settings = null
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('telegram_chat_id, alert_threshold, briefing_time')
      .eq('id', 1).single()
    settings = data ?? null
  } catch { /* settings are optional in the backup */ }

  const payload = buildExportPayload({
    holdings: store.holdings,
    transactions: store.transactions,
    displayCurrency: store.displayCurrency,
    settings,
  })
  download(`portfoliohq-backup-${stamp()}.json`, serializeExport(payload), 'application/json')
  flash(`Exported ${payload.asset_count} assets and ${payload.transaction_count} transactions.`)
}

function exportCsv() {
  const csv = buildCsv(store.holdingsWithSnapshot)
  download(`portfoliohq-holdings-${stamp()}.csv`, csv, 'text/csv;charset=utf-8')
  flash(`Exported ${store.holdings.length} holdings to CSV.`)
}

// --- Import: pick + parse ---------------------------------------------------
const fileInput = ref(null)
const dragging = ref(false)
const parseErrors = ref([])
const parseWarnings = ref([])
const fileName = ref('')
const review = ref(null) // validated payload or null
const mode = ref('merge')
const importing = ref(false)

const modes = [
  { id: 'merge', label: 'Merge', desc: 'Keep current data, add new' },
  { id: 'replace', label: 'Replace', desc: 'Wipe, then import file' },
]

function pickFile() { fileInput.value?.click() }

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (file) readFile(file)
  e.target.value = '' // allow re-picking the same file
}

function onDrop(e) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) readFile(file)
}

function readFile(file) {
  parseErrors.value = []
  parseWarnings.value = []
  fileName.value = file.name
  if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
    parseErrors.value = ['Only .json backups can be imported. Use Export JSON to create one.']
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const { payload, errors, warnings } = parsePortfolioFile(String(reader.result ?? ''))
    if (errors.length || !payload) {
      parseErrors.value = errors.length ? errors : ['The backup couldn’t be read.']
      return
    }
    parseWarnings.value = warnings
    mode.value = 'merge'
    review.value = payload
  }
  reader.onerror = () => { parseErrors.value = ['Could not read the file. Please try again.'] }
  reader.readAsText(file)
}

// --- Import: live summary + execute ----------------------------------------
const summary = computed(() =>
  review.value
    ? summarizeImport(review.value, {
        existingHoldings: store.holdings,
        transactionsByAsset: store.transactionsByAsset,
        mode: mode.value,
      })
    : { newAssets: 0, newTxns: 0, matchedAssets: 0, duplicateTxns: 0, removedAssets: 0, removedTxns: 0 },
)

function closeReview() {
  if (importing.value) return
  review.value = null
}

async function runImport() {
  importing.value = true
  try {
    const res = await store.importPortfolio(review.value, { mode: mode.value })
    review.value = null
    if (res.errors.length) {
      flash(`Imported with ${res.errors.length} issue(s): ${res.errors[0]}`, false)
    } else if (res.mode === 'replace') {
      flash(`Replaced portfolio — ${res.assetsAdded} assets, ${res.txnsAdded} transactions restored.`)
    } else {
      const skipped = res.txnsSkipped ? `, ${res.txnsSkipped} duplicate(s) skipped` : ''
      flash(`Merged — +${res.assetsAdded} assets, +${res.txnsAdded} transactions${skipped}.`)
    }
  } catch (err) {
    flash(`Import failed: ${err?.message ?? 'unexpected error'}`, false)
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
/* Modal entry — matches AddHoldingModal (DESIGN.md modal transition) */
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .relative, .modal-leave-active .relative { transition: transform 0.2s; }
.modal-enter-from .relative { transform: scale(0.95) translateY(10px); }

/* Status / panel fade + slide (DESIGN.md status transition) */
.status-enter-active, .status-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.status-enter-from, .status-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
