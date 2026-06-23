<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Assets</h1>
        <p class="text-slate-500 text-sm mt-1">
          {{ store.holdings.length }} {{ store.holdings.length === 1 ? 'asset' : 'assets' }} tracked
          <span class="text-slate-600">·</span>
          <span :class="grand.pnl >= 0 ? 'text-green-400' : 'text-red-400'">
            {{ grand.pnl >= 0 ? '+' : '' }}{{ format(grand.pnl, grand.currency) }} all time
          </span>
        </p>
      </div>
      <button
        @click="showModal = true"
        class="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium rounded-xl transition-all duration-200 active:scale-95"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Add Asset
      </button>
    </div>

    <!-- Allocation overview bar — the "where is my money" signature.
         Each segment is a class, width = its share of portfolio value, and
         clicking a segment filters the grid to that class. Structure = info. -->
    <div
      v-if="!store.loading && store.holdings.length > 0"
      class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-5"
    >
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs text-slate-500">Allocation by class</p>
        <p class="text-xs text-slate-600">
          Total <span class="text-slate-400 font-medium">{{ format(grand.value, grand.currency) }}</span>
        </p>
      </div>

      <!-- Stacked bar -->
      <div class="flex h-2.5 rounded-full overflow-hidden bg-[#0f1117] gap-0.5">
        <button
          v-for="seg in allocationSegments"
          :key="seg.class"
          @click="toggleClass(seg.class)"
          :title="`${seg.label} · ${seg.pct.toFixed(1)}%`"
          :aria-label="`Filter ${seg.label}, ${seg.pct.toFixed(1)} percent of portfolio`"
          class="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full hover:brightness-125"
          :style="{ width: seg.pct + '%', background: seg.color, opacity: dimSegment(seg.class) ? 0.3 : 1 }"
        />
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        <button
          v-for="seg in allocationSegments"
          :key="seg.class"
          @click="toggleClass(seg.class)"
          class="flex items-center gap-1.5 group"
        >
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: seg.color }" />
          <span
            class="text-xs transition-colors"
            :class="activeClass === seg.class ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'"
          >
            {{ seg.label }} <span class="text-slate-600">{{ seg.pct.toFixed(0) }}%</span>
          </span>
        </button>
      </div>
    </div>

    <!-- Toolbar: class filter chips + sort -->
    <div
      v-if="!store.loading && store.holdings.length > 0"
      class="flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <!-- Class filter chips (scrollable on mobile) -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-none">
        <button
          v-for="chip in classChips"
          :key="chip.value"
          @click="activeClass = chip.value"
          class="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-200"
          :class="activeClass === chip.value
            ? 'border-sky-500 bg-sky-500/10 text-sky-400'
            : 'border-[#2e3348] text-slate-400 hover:text-white hover:border-slate-600'"
        >
          {{ chip.label }}
          <span
            class="ml-1.5 tabular-nums"
            :class="activeClass === chip.value ? 'text-sky-400/70' : 'text-slate-600'"
          >{{ chip.count }}</span>
        </button>
      </div>

      <!-- Sort control -->
      <div class="sm:ml-auto flex items-center gap-2 shrink-0">
        <label for="sort" class="text-xs text-slate-600">Sort</label>
        <select
          id="sort"
          v-model="sortKey"
          class="bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-1.5 text-xs text-white
                 focus:border-sky-500 focus:outline-none transition-colors cursor-pointer"
        >
          <option value="value">Value (high → low)</option>
          <option value="pnl">Total P&L</option>
          <option value="day">Today's change</option>
          <option value="alloc">Allocation</option>
          <option value="name">Name (A → Z)</option>
        </select>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="store.loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="h-44 bg-[#1a1d27] border border-[#2e3348] rounded-2xl animate-pulse" />
    </div>

    <!-- Empty state (no holdings at all) -->
    <div
      v-else-if="store.holdings.length === 0"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <div class="w-16 h-16 rounded-2xl bg-[#1a1d27] border border-[#2e3348] flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
        </svg>
      </div>
      <h3 class="text-white font-semibold mb-2">No assets yet</h3>
      <p class="text-slate-500 text-sm mb-6">Add your first asset to start tracking your portfolio</p>
      <button
        @click="showModal = true"
        class="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium rounded-xl transition-all active:scale-95"
      >
        Add First Asset
      </button>
    </div>

    <!-- No results for the active filter -->
    <div
      v-else-if="filteredSorted.length === 0"
      class="flex flex-col items-center justify-center py-16 text-center"
    >
      <p class="text-white font-medium mb-1">No {{ activeChipLabel.toLowerCase() }} held</p>
      <p class="text-slate-500 text-sm mb-4">Try a different filter or add one.</p>
      <button
        @click="activeClass = 'all'"
        class="px-4 py-2 rounded-lg border border-[#2e3348] text-slate-400 text-sm hover:border-slate-500 transition-colors"
      >
        Show all assets
      </button>
    </div>

    <!-- Holdings grid -->
    <TransitionGroup
      v-else
      tag="div"
      name="grid"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <PortfolioCard
        v-for="holding in filteredSorted"
        :key="holding.id"
        :holding="holding"
      />
    </TransitionGroup>

    <AddHoldingModal :show="showModal" @close="showModal = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import PortfolioCard from '@/components/PortfolioCard.vue'
import AddHoldingModal from '@/components/AddHoldingModal.vue'

const store = usePortfolioStore()
const showModal = ref(false)
const activeClass = ref('all')
const sortKey = ref('value')

const grand = computed(() => store.grandTotal)

// Asset-class identity colors — derived from DESIGN.md "Asset Color Palette"
// personalities (tech blue, growth green, gold amber, fixed cyan, slate).
// Keyed by asset_class so it's robust to symbol variation.
const classColors = {
  stock: '#0ea5e9',
  etf: '#8b5cf6',
  fund: '#10b981',
  gold: '#d97706',
  bond: '#06b6d4',
  manual: '#94a3b8',
}
const classLabels = {
  stock: 'Stocks',
  etf: 'ETFs',
  fund: 'Funds',
  gold: 'Gold',
  bond: 'Bonds',
  manual: 'Other',
}
const colorFor = (c) => classColors[c] ?? '#94a3b8'
const labelFor = (c) => classLabels[c] ?? 'Other'

// Convert any native-currency amount into the chosen display currency so the
// allocation segments are comparable (mirrors the store's grandTotal logic).
function toDisplay(amount, from) {
  const to = store.displayCurrency
  if (from === to) return amount
  return from === 'USD' ? amount * store.fxRate : amount / store.fxRate
}

const enriched = computed(() => store.holdingsWithSnapshot)

// Counts per class for the filter chips.
const classCounts = computed(() => {
  const map = {}
  for (const h of enriched.value) {
    map[h.asset_class] = (map[h.asset_class] ?? 0) + 1
  }
  return map
})

// Chips: "All" first, then each class that actually exists, in palette order.
const classOrder = ['stock', 'etf', 'fund', 'gold', 'bond', 'manual']
const classChips = computed(() => {
  const chips = [{ value: 'all', label: 'All', count: enriched.value.length }]
  for (const c of classOrder) {
    if (classCounts.value[c]) {
      chips.push({ value: c, label: labelFor(c), count: classCounts.value[c] })
    }
  }
  return chips
})

const activeChipLabel = computed(
  () => classChips.value.find((c) => c.value === activeClass.value)?.label ?? 'assets'
)

// Allocation segments by class (display-currency value share).
const allocationSegments = computed(() => {
  const totals = {}
  for (const h of enriched.value) {
    totals[h.asset_class] = (totals[h.asset_class] ?? 0) + toDisplay(h.value, h.currency)
  }
  const grandValue = grand.value.value || 1
  return classOrder
    .filter((c) => totals[c])
    .map((c) => ({
      class: c,
      label: labelFor(c),
      color: colorFor(c),
      pct: (totals[c] / grandValue) * 100,
    }))
})

// Dim a segment when a *different* class is selected, to focus the active one.
const dimSegment = (c) => activeClass.value !== 'all' && activeClass.value !== c

function toggleClass(c) {
  activeClass.value = activeClass.value === c ? 'all' : c
}

// Filter + sort the grid.
const filteredSorted = computed(() => {
  let rows = enriched.value
  if (activeClass.value !== 'all') {
    rows = rows.filter((h) => h.asset_class === activeClass.value)
  }
  const alloc = store.allocations
  const byDisplayValue = (h) => toDisplay(h.value, h.currency)
  const sorted = [...rows]
  switch (sortKey.value) {
    case 'value': sorted.sort((a, b) => byDisplayValue(b) - byDisplayValue(a)); break
    case 'pnl': sorted.sort((a, b) => toDisplay(b.pnl, b.currency) - toDisplay(a.pnl, a.currency)); break
    case 'day': sorted.sort((a, b) => (b.dayChange ?? 0) - (a.dayChange ?? 0)); break
    case 'alloc': sorted.sort((a, b) => (alloc[b.id] ?? 0) - (alloc[a.id] ?? 0)); break
    case 'name': sorted.sort((a, b) => (a.symbol || '').localeCompare(b.symbol || '')); break
  }
  return sorted
})

function format(value, currency = 'USD') {
  if (currency === 'IDR') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value)
}

onMounted(() => store.init())
</script>

<style scoped>
/* Grid items fade + lift on filter/sort change; the move transition keeps
   reflow smooth instead of snapping. Respects reduced-motion. */
.grid-move,
.grid-enter-active,
.grid-leave-active { transition: all 0.3s ease; }
.grid-enter-from { opacity: 0; transform: translateY(8px); }
.grid-leave-active { position: absolute; }
.grid-leave-to { opacity: 0; transform: scale(0.96); }

/* Hide the horizontal scrollbar on the chip row without disabling scroll. */
.scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }

@media (prefers-reduced-motion: reduce) {
  .grid-move,
  .grid-enter-active,
  .grid-leave-active { transition: none; }
}
</style>
