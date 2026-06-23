<template>
  <Transition name="modal">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')" />
      <div class="relative bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 class="text-white font-semibold text-lg mb-5">
          {{ isEdit ? 'Edit Transaction' : 'Add Transaction' }}
          <span class="text-slate-500 font-normal text-sm">· {{ asset?.symbol }}</span>
        </h2>

        <form @submit.prevent="submit" class="space-y-4">
          <!-- BUY / SELL toggle -->
          <div class="flex bg-[#0f1117] border border-[#2e3348] rounded-lg p-0.5">
            <button
              v-for="t in ['BUY', 'SELL']" :key="t" type="button" @click="form.type = t"
              class="flex-1 py-2 rounded-md text-xs font-semibold transition-all duration-200"
              :class="form.type === t
                ? (t === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')
                : 'text-slate-400 hover:text-white'"
            >
              {{ t }}
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-400 mb-1 block">{{ qtyLabel }}</label>
              <input v-model.number="form.quantity" type="number" step="any" required
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label class="text-xs text-slate-400 mb-1 block">{{ priceLabel }}</label>
              <input v-model.number="form.unit_price" type="number" step="any" required
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-400 mb-1 block">Total Amount</label>
              <input v-model.number="form.total_amount" type="number" step="any" required
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
              <button v-if="suggestedTotal && Number(form.total_amount) !== suggestedTotal" type="button"
                @click="form.total_amount = suggestedTotal"
                class="text-xs text-sky-400 hover:text-sky-300 mt-1 transition-colors">
                Use {{ formatMoney(suggestedTotal) }}
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
            <input v-model="form.notes" type="text" placeholder="e.g. DCA, top-up"
              class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
          </div>

          <Transition name="modal">
            <p v-if="formError" class="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {{ formError }}
            </p>
          </Transition>

          <div class="flex gap-3 pt-1">
            <button type="button" @click="$emit('close')"
              class="flex-1 py-2.5 rounded-lg border border-[#2e3348] text-slate-400 text-sm hover:border-slate-500 transition-colors">
              Cancel
            </button>
            <button type="submit" :disabled="loading || !canSubmit"
              class="flex-1 py-2.5 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95">
              {{ loading ? 'Saving…' : (isEdit ? 'Save' : 'Add') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import { parseLocaleNumber, unitShares } from '@/lib/valuation'

const props = defineProps({
  show: Boolean,
  asset: { type: Object, required: true },      // the holding this tx belongs to
  transaction: { type: Object, default: null }, // present = edit
})
const emit = defineEmits(['close'])

const store = usePortfolioStore()
const loading = ref(false)
const formError = ref('')
const isEdit = computed(() => !!props.transaction)

const defaultForm = () => ({
  type: 'BUY', quantity: null, unit_price: null, total_amount: null,
  transaction_date: null, notes: '',
})
const form = reactive(defaultForm())

const cls = computed(() => props.asset?.asset_class)
const unit = computed(() => props.asset?.unit ?? 'shares')
const qtyLabel = computed(() =>
  cls.value === 'fund' ? 'Units' : cls.value === 'gold' ? 'Grams' : (unit.value === 'lot' ? 'Quantity (lots)' : 'Quantity')
)
const priceLabel = computed(() =>
  cls.value === 'fund' ? 'NAV / unit' : cls.value === 'gold' ? 'Price / gram' : 'Price / share'
)

const suggestedTotal = computed(() => {
  const qty = Number(form.quantity) || 0
  const price = Number(form.unit_price) || 0
  return qty > 0 && price > 0 ? Math.round(qty * price * unitShares(unit.value)) : 0
})

const canSubmit = computed(() =>
  Number(form.quantity) > 0 && Number(form.unit_price) > 0 && Number(form.total_amount) > 0
)

watch(
  () => props.show,
  (open) => {
    if (!open) return
    formError.value = ''
    if (props.transaction) {
      Object.assign(form, { ...defaultForm(), ...props.transaction })
    } else {
      Object.assign(form, defaultForm())
    }
  },
  { immediate: true },
)

const pn = (v) => { const n = parseLocaleNumber(v); return Number.isFinite(n) ? n : null }

async function submit() {
  loading.value = true
  formError.value = ''
  const payload = {
    type: form.type,
    quantity: pn(form.quantity),
    unit_price: pn(form.unit_price),
    total_amount: pn(form.total_amount),
    transaction_date: form.transaction_date || null,
    notes: form.notes || null,
  }
  const { error } = isEdit.value
    ? await store.updateTransaction(props.transaction.id, payload)
    : await store.addTransaction({ ...payload, asset_id: props.asset.id })
  loading.value = false
  if (error) {
    formError.value = error.message || 'Could not save the transaction. Please try again.'
    return
  }
  emit('close')
}

function formatMoney(v) {
  const cur = props.asset?.currency ?? 'IDR'
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
</style>
