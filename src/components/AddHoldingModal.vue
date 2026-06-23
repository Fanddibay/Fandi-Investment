<template>
  <Transition name="modal">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')" />
      <div class="relative bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 class="text-white font-semibold text-lg mb-5">
          {{ isEdit ? 'Edit Asset' : (existingAsset ? `Buy / Sell ${existingAsset.symbol}` : 'Add Asset') }}
        </h2>

        <!-- Mode toggle (add only, and only while no existing asset is matched) -->
        <div v-if="!isEdit && !existingAsset" class="flex bg-[#0f1117] border border-[#2e3348] rounded-lg p-0.5 mb-5">
          <button
            v-for="m in modes" :key="m.id" type="button" @click="setMode(m.id)"
            class="flex-1 py-2 rounded-md text-xs font-medium transition-all duration-200"
            :class="mode === m.id ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'"
          >
            {{ m.label }}
          </button>
        </div>

        <form @submit.prevent="submit" class="space-y-4">
          <!-- SEARCH MODE: find a real stock/ETF ticker -->
          <div v-if="mode === 'search' && !isEdit && !existingAsset" class="relative">
            <label class="text-xs text-slate-400 mb-1.5 block">Search stock or ETF</label>
            <input
              v-model="query" @input="onSearch" type="text"
              placeholder="e.g. Apple, AAPL, BBRI, Telkom…"
              class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors"
            />
            <p class="text-xs text-slate-600 mt-1">US (NYSE/NASDAQ) + Indonesia (IDX) — real tickers</p>

            <Transition name="results">
              <div v-if="results.length || searching" class="absolute z-10 left-0 right-0 mt-1 bg-[#0f1117] border border-[#2e3348] rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                <div v-if="searching" class="px-3 py-3 text-xs text-slate-500">Searching…</div>
                <button
                  v-for="r in results" :key="r.symbol" type="button" @click="selectResult(r)"
                  class="w-full text-left px-3 py-2.5 hover:bg-[#22263a] transition-colors border-b border-[#2e3348] last:border-0"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm text-white font-medium font-mono">{{ r.symbol }}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">{{ r.currency }}</span>
                  </div>
                  <p class="text-xs text-slate-500 truncate">{{ r.name }} · {{ r.exchange }}</p>
                </button>
              </div>
            </Transition>
          </div>

          <!-- MANUAL MODE: mutual fund / bond / other -->
          <div v-if="mode === 'manual' && !isEdit && !existingAsset">
            <label class="text-xs text-slate-400 mb-1.5 block">Asset type</label>
            <select v-model="form.asset_class" @change="onManualType"
              class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none transition-colors">
              <option value="fund">Mutual Fund (Reksa Dana)</option>
              <option value="bond">Bond (Obligasi)</option>
              <option value="gold">Gold</option>
              <option value="manual">Other</option>
            </select>
          </div>

          <!-- Selected market asset chip -->
          <div v-if="mode === 'search' && form.symbol && !isEdit && !existingAsset"
            class="flex items-center gap-2 bg-[#0f1117] border border-sky-500/40 rounded-lg px-3 py-2">
            <span class="text-sm text-white font-mono">{{ form.symbol }}</span>
            <span class="text-xs text-slate-500 truncate flex-1">{{ form.name }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">{{ form.currency }}</span>
          </div>

          <!-- Existing-asset notice: this becomes an "add transaction" flow -->
          <div v-if="existingAsset && !isEdit"
            class="flex items-start gap-2 bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2.5">
            <svg class="w-4 h-4 text-sky-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="text-xs text-sky-300">
              You already hold <span class="font-medium text-white">{{ existingAsset.symbol }}</span> — this records a new
              transaction against it instead of creating a duplicate.
            </p>
          </div>

          <!-- Identity fields (manual add + edit only) -->
          <div v-if="(mode === 'manual' || isEdit) && !existingAsset" class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Name</label>
              <input v-model="form.name" @blur="maybeGuessCategory" required placeholder="Fund / asset name"
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Symbol / code</label>
              <input v-model="form.symbol" @blur="maybeDetectExisting" required placeholder="e.g. RD-BNI"
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
            </div>
          </div>

          <!-- Fund metadata -->
          <div v-if="form.asset_class === 'fund' && (mode === 'manual' || isEdit) && !existingAsset" class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Category</label>
              <select v-model="form.category"
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none transition-colors">
                <option value="money_market">Money Market</option>
                <option value="fixed_income">Bond / Fixed Income</option>
                <option value="equity">Equity</option>
                <option value="balanced">Balanced</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Asset Manager</label>
              <input v-model="form.manager" placeholder="e.g. Bahana, Sucorinvest"
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
            </div>
          </div>

          <!-- Current price / NAV — a property of the ASSET (manual-priced only) -->
          <div v-if="needsCurrentNav && !existingAsset">
            <label class="text-xs text-slate-400 mb-1 block">{{ currentNavLabel }}</label>
            <input v-model.number="form.current_nav" type="number" step="any" :placeholder="isFundForm ? '1291.04' : 'latest price'"
              class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
          </div>

          <!-- ============ TRANSACTION fields (add + add-to-existing) ============ -->
          <template v-if="!isEdit">
            <div class="border-t border-[#2e3348] pt-4 space-y-4">
              <!-- BUY / SELL toggle -->
              <div class="flex bg-[#0f1117] border border-[#2e3348] rounded-lg p-0.5">
                <button
                  v-for="t in ['BUY', 'SELL']" :key="t" type="button" @click="form.tx_type = t"
                  class="flex-1 py-2 rounded-md text-xs font-semibold transition-all duration-200"
                  :class="form.tx_type === t
                    ? (t === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')
                    : 'text-slate-400 hover:text-white'"
                >
                  {{ t }}
                </button>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-slate-400 mb-1 block">{{ qtyLabel }}</label>
                  <input v-model.number="form.quantity" type="number" step="any" required :placeholder="qtyPlaceholder"
                    class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
                </div>
                <div>
                  <label class="text-xs text-slate-400 mb-1 block">{{ priceLabel }}</label>
                  <input v-model.number="form.unit_price" type="number" step="any" required :placeholder="pricePlaceholder"
                    class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-slate-400 mb-1 block">Total Amount</label>
                  <input v-model.number="form.total_amount" type="number" step="any" required :placeholder="suggestedTotal || '0'"
                    class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
                  <button v-if="suggestedTotal && Number(form.total_amount) !== suggestedTotal" type="button"
                    @click="form.total_amount = suggestedTotal"
                    class="text-xs text-sky-400 hover:text-sky-300 mt-1 transition-colors">
                    Use {{ priceLabel.toLowerCase() }} × {{ qtyLabel.toLowerCase() }} = {{ formatMoney(suggestedTotal) }}
                  </button>
                </div>
                <div>
                  <label class="text-xs text-slate-400 mb-1 block">Date</label>
                  <input v-model="form.transaction_date" type="date"
                    class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none transition-colors" />
                </div>
              </div>

              <div>
                <label class="text-xs text-slate-400 mb-1 block">Notes <span class="text-slate-600">(optional)</span></label>
                <input v-model="form.notes" type="text" placeholder="e.g. DCA, top-up, rebalance"
                  class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
              </div>

              <!-- Live fund safeguards -->
              <Transition name="results">
                <div v-if="fundWarnings.length" class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 space-y-1">
                  <p v-for="(w, i) in fundWarnings" :key="i" class="text-xs text-yellow-400 flex gap-1.5">
                    <span>⚠</span><span>{{ w }}</span>
                  </p>
                </div>
              </Transition>
            </div>
          </template>

          <!-- Currency + Unit (identity; hidden when adding to an existing asset) -->
          <div v-if="!existingAsset" class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Currency</label>
              <select v-model="form.currency"
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none transition-colors">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Unit</label>
              <select v-model="form.unit"
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none transition-colors">
                <option value="shares">shares</option>
                <option value="lot">lot (×100)</option>
                <option value="gram">gram</option>
                <option value="unit">unit</option>
                <option value="lembar">lembar</option>
              </select>
            </div>
          </div>

          <Transition name="results">
            <p v-if="formError" class="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {{ formError }}
            </p>
          </Transition>

          <div class="flex gap-3 pt-2">
            <button type="button" @click="$emit('close')"
              class="flex-1 py-2.5 rounded-lg border border-[#2e3348] text-slate-400 text-sm hover:border-slate-500 transition-colors">
              Cancel
            </button>
            <button type="submit" :disabled="loading || !canSubmit"
              class="flex-1 py-2.5 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95">
              {{ submitLabel }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import { searchSymbols, classify } from '@/lib/search'
import { guessFundCategory, validateFund, parseLocaleNumber, unitShares } from '@/lib/valuation'

const props = defineProps({
  show: Boolean,
  holding: { type: Object, default: null }, // present = edit mode
})
const emit = defineEmits(['close'])

const store = usePortfolioStore()
const loading = ref(false)
const formError = ref('')
const isEdit = computed(() => !!props.holding)

const modes = [
  { id: 'search', label: 'Search Stock / ETF' },
  { id: 'manual', label: 'Fund / Bond / Other' },
]
const mode = ref('search')

// --- search state ---
const query = ref('')
const results = ref([])
const searching = ref(false)
let debounce = null

function onSearch() {
  clearTimeout(debounce)
  const q = query.value
  if (!q.trim()) { results.value = []; searching.value = false; return }
  searching.value = true
  debounce = setTimeout(async () => {
    results.value = await searchSymbols(q)
    searching.value = false
  }, 280)
}

function selectResult(r) {
  const { asset_class, unit } = classify(r.type, r.symbol)
  Object.assign(form, {
    symbol: r.symbol, name: r.name, currency: r.currency, asset_class, unit,
  })
  results.value = []
  query.value = `${r.symbol} — ${r.name}`
  maybeDetectExisting()
}

function setMode(m) {
  mode.value = m
  if (m === 'manual') {
    Object.assign(form, { asset_class: 'fund', unit: 'unit', currency: 'IDR', symbol: '', name: '' })
  } else {
    Object.assign(form, defaultForm())
    query.value = ''; results.value = []
  }
}

function onManualType() {
  const map = { fund: 'unit', bond: 'lembar', gold: 'gram', manual: 'unit' }
  form.unit = map[form.asset_class] ?? 'unit'
}

const defaultForm = () => ({
  // identity
  symbol: '', name: '', currency: 'USD', unit: 'shares', asset_class: 'stock',
  category: 'money_market', manager: '', current_nav: null,
  // first transaction
  tx_type: 'BUY', quantity: null, unit_price: null, total_amount: null,
  transaction_date: null, notes: '',
})
const form = reactive(defaultForm())

// An existing asset with the same symbol → record a transaction against it
// rather than duplicating the asset. Cleared in edit mode.
const existingAsset = computed(() => {
  if (isEdit.value || !form.symbol) return null
  const sym = form.symbol.trim().toLowerCase()
  return store.holdings.find((h) => (h.symbol || '').trim().toLowerCase() === sym) ?? null
})
function maybeDetectExisting() { /* existingAsset is reactive; hook kept for @blur clarity */ }

// The effective asset_class drives labels: an existing asset's class wins.
const effClass = computed(() => existingAsset.value?.asset_class ?? form.asset_class)
const effUnit = computed(() => existingAsset.value?.unit ?? form.unit)
const isFundForm = computed(() => effClass.value === 'fund')
const isGoldForm = computed(() => effClass.value === 'gold')

// Manual-priced assets carry a Current NAV/price on the asset itself.
const needsCurrentNav = computed(() =>
  !isEdit.value && ['fund', 'bond', 'manual'].includes(form.asset_class)
)

const qtyLabel = computed(() =>
  isFundForm.value ? 'Units' : isGoldForm.value ? 'Grams' : (effUnit.value === 'lot' ? 'Quantity (lots)' : 'Quantity')
)
const priceLabel = computed(() =>
  isFundForm.value ? 'NAV / unit' : isGoldForm.value ? 'Price / gram' : 'Price / share'
)
const currentNavLabel = computed(() => isFundForm.value ? 'Current NAV / unit' : 'Current price')
const qtyPlaceholder = computed(() => isFundForm.value ? '16236.8891' : (effUnit.value === 'lot' ? '30' : '10'))
const pricePlaceholder = computed(() => isFundForm.value ? '1270.39' : '420.00')

// Total = price × quantity × shares-per-unit (lots → ×100). Tap-to-fill only;
// the user can override to match their statement exactly. Never auto-applied.
const suggestedTotal = computed(() => {
  const qty = Number(form.quantity) || 0
  const price = Number(form.unit_price) || 0
  const mult = unitShares(effUnit.value)
  return qty > 0 && price > 0 ? Math.round(qty * price * mult) : 0
})

// Live fund safeguards before saving (treats this BUY as the entry).
const fundWarnings = computed(() => {
  if (!isFundForm.value || form.tx_type !== 'BUY') return []
  const units = parseLocaleNumber(form.quantity)
  const entryNav = parseLocaleNumber(form.unit_price)
  const currentNav = parseLocaleNumber(existingAsset.value?.current_nav ?? form.current_nav)
  const invested = parseLocaleNumber(form.total_amount)
  if (![units, entryNav, invested].every(Number.isFinite)) return []
  const pnlPct = invested > 0 ? ((units * currentNav - invested) / invested) * 100 : 0
  return validateFund({ units, entryNav, currentNav, invested, pnlPct, category: existingAsset.value?.category ?? form.category })
})

function maybeGuessCategory() {
  if (form.asset_class !== 'fund' || !form.name) return
  const guess = guessFundCategory(form.name)
  if (guess) form.category = guess
}

const canSubmit = computed(() => {
  if (isEdit.value) return !!form.symbol && !!form.name
  // Add (new or existing): need a valid transaction.
  const txOk = Number(form.quantity) > 0 && Number(form.unit_price) > 0 && Number(form.total_amount) > 0
  if (existingAsset.value) return txOk
  return !!form.symbol && !!form.name && txOk
})

const submitLabel = computed(() => {
  if (loading.value) return isEdit.value ? 'Saving…' : 'Adding…'
  if (isEdit.value) return 'Save Changes'
  if (existingAsset.value) return `Add ${form.tx_type}`
  return 'Add Asset'
})

watch(
  () => props.show,
  (open) => {
    if (!open) return
    formError.value = ''
    if (props.holding) {
      Object.assign(form, { ...defaultForm(), ...props.holding })
    } else {
      mode.value = 'search'
      Object.assign(form, defaultForm())
      query.value = ''; results.value = []
    }
  },
  { immediate: true },
)

const pn = (v) => { const n = parseLocaleNumber(v); return Number.isFinite(n) ? n : null }

async function submit() {
  loading.value = true
  formError.value = ''

  // EDIT: asset identity / metadata only — position lives in transactions.
  if (isEdit.value) {
    const patch = {
      symbol: form.symbol, name: form.name, currency: form.currency, unit: form.unit,
      asset_class: form.asset_class, category: form.category, manager: form.manager || null,
      current_nav: pn(form.current_nav),
    }
    const { error } = await store.updateHolding(props.holding.id, patch)
    loading.value = false
    if (error) { formError.value = error.message || 'Could not save changes.'; return }
    emit('close')
    return
  }

  // Build the transaction payload (shared by new-asset and add-to-existing).
  const tx = {
    type: form.tx_type,
    quantity: pn(form.quantity),
    unit_price: pn(form.unit_price),
    total_amount: pn(form.total_amount),
    transaction_date: form.transaction_date || null,
    notes: form.notes || null,
  }

  let error = null
  if (existingAsset.value) {
    // Record against the existing asset — no duplicate.
    ;({ error } = await store.addTransaction({ ...tx, asset_id: existingAsset.value.id }))
  } else {
    // New asset. Also mirror the opening position onto the holding's legacy
    // columns so valuation still works if the transactions table isn't there
    // yet (pre-migration). When it IS there, the ledger wins.
    const mult = unitShares(form.unit)
    const asset = {
      symbol: form.symbol, name: form.name, currency: form.currency, unit: form.unit,
      asset_class: form.asset_class, category: form.category, manager: form.manager || null,
      current_nav: pn(form.current_nav),
      quantity: tx.quantity,
      entry_price: form.asset_class === 'fund' ? tx.unit_price : tx.unit_price,
      entry_nav: form.asset_class === 'fund' ? tx.unit_price : null,
      invested_amount: tx.total_amount ?? (tx.unit_price * tx.quantity * mult),
      purchase_date: tx.transaction_date,
    }
    ;({ error } = await store.addAssetWithTransaction(asset, tx))
  }

  loading.value = false
  if (error) {
    formError.value = error.message || 'Could not save. Please try again.'
    return
  }
  Object.assign(form, defaultForm())
  emit('close')
  // A freshly added market asset has no price yet — pull one.
  if (['stock', 'etf'].includes(effClass.value)) store.refreshPrices({ force: true })
}

function formatMoney(v) {
  const cur = existingAsset.value?.currency ?? form.currency
  return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : 'en-US', {
    style: 'currency', currency: cur, maximumFractionDigits: 0,
  }).format(v)
}
</script>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .relative, .modal-leave-active .relative { transition: transform 0.2s; }
.modal-enter-from .relative { transform: scale(0.95) translateY(10px); }

.results-enter-active, .results-leave-active { transition: opacity .15s ease, transform .15s ease; }
.results-enter-from, .results-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
