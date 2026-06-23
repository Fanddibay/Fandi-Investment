<template>
  <!-- Single root element — required by the <Transition mode="out-in"> in App.vue -->
  <div>
    <div v-if="holding" class="space-y-6">
    <!-- Back + Header -->
    <div>
      <RouterLink to="/" class="text-sm text-slate-500 hover:text-sky-400 transition-colors flex items-center gap-1 mb-4">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Dashboard
      </RouterLink>
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold"
          :style="{ background: '#0ea5e922', color: '#0ea5e9' }">
          {{ holding.symbol.slice(0, 2) }}
        </div>
        <div>
          <h1 class="text-2xl font-bold text-white">{{ holding.symbol }}</h1>
          <p class="text-slate-400 text-sm">{{ holding.name }}</p>
          <span v-if="isFund"
            class="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 font-medium">
            {{ categoryLabel }}<template v-if="holding.manager"> · {{ holding.manager }}</template>
          </span>
        </div>
        <div class="ml-auto flex items-center gap-4">
          <span class="text-lg font-bold"
            :class="holding.dayChange >= 0 ? 'text-green-400' : 'text-red-400'">
            {{ holding.dayChange >= 0 ? '+' : '' }}{{ holding.dayChange.toFixed(2) }}% today
          </span>
          <button @click="showEdit = true"
            class="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2e3348] text-slate-300 text-sm hover:border-sky-500 hover:text-sky-400 transition-all active:scale-95">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Edit
          </button>
        </div>
      </div>

      <!-- Holding breakdown -->
      <p v-if="isFund" class="text-xs text-slate-500 mt-3">
        {{ holding.units.toLocaleString('id-ID', { maximumFractionDigits: 4 }) }} units
        · invested {{ formatPrice(holding.invested, holding.currency) }}
        · avg NAV {{ formatNav(holding.avgCostPerUnit, holding.currency) }}
      </p>
      <p v-else-if="isGold" class="text-xs text-slate-500 mt-3">
        {{ holding.gramsOwned.toLocaleString('id-ID', { maximumFractionDigits: 4 }) }} gram
        · avg buy {{ formatPrice(holding.averageBuyPrice, holding.currency) }} / gram
        <span v-if="holding.lastUpdated" class="text-slate-600">· ANTAM as of {{ formatAsOf(holding.lastUpdated) }}</span>
      </p>
      <p v-else class="text-xs text-slate-500 mt-3">
        {{ holding.quantity.toLocaleString('id-ID', { maximumFractionDigits: 4 }) }} {{ holding.unit ?? 'shares' }}
        <template v-if="holding.shares !== holding.quantity">
          = {{ holding.shares.toLocaleString('id-ID') }} shares
        </template>
        · avg cost {{ formatPrice(holding.avgCostPerUnit, holding.currency) }} / {{ holding.unit ?? 'share' }}
      </p>
    </div>

    <!-- Data-integrity safeguards for funds -->
    <div v-if="isFund && holding.warnings && holding.warnings.length"
      class="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-1.5">
      <p class="text-xs font-semibold text-yellow-400 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        Data looks off — verify against Bibit / Bareksa
      </p>
      <p v-for="(w, i) in holding.warnings" :key="i" class="text-xs text-yellow-400/90 pl-6">{{ w }}</p>
    </div>

    <!-- Tab bar -->
    <div class="flex items-center gap-2 border-b border-[#2e3348]">
      <button v-for="t in tabs" :key="t.id" @click="activeTab = t.id"
        class="relative px-4 py-2.5 text-sm font-medium transition-colors duration-200"
        :class="activeTab === t.id ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'">
        {{ t.label }}
        <span v-if="t.id === 'transactions' && holding.txnCount"
          class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[#22263a] text-slate-400">{{ holding.txnCount }}</span>
        <span class="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-sky-400 transition-all duration-300"
          :class="activeTab === t.id ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'" />
      </button>
    </div>

    <!-- ============================ OVERVIEW ============================ -->
    <div v-show="activeTab === 'overview'" class="space-y-6">
      <!-- FUND model -->
      <div v-if="isFund" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Invested Amount" :value="formatPrice(holding.invested, holding.currency)" muted />
        <Stat label="Units Owned" :value="holding.units.toLocaleString('id-ID', { maximumFractionDigits: 4 })" />
        <Stat label="Average NAV" :value="formatNav(holding.avgCostPerUnit, holding.currency)" muted />
        <Stat label="Current NAV" :value="formatNav(holding.currentNav, holding.currency)" />
        <Stat label="Current Value" :value="formatPrice(holding.value, holding.currency)" />
        <Stat label="Profit / Loss" :value="signed(holding.pnl)" :tone="holding.pnl >= 0 ? 'pos' : 'neg'" />
        <Stat label="Profit %" :value="`${holding.pnlPct >= 0 ? '+' : ''}${holding.pnlPct.toFixed(2)}%`" :tone="holding.pnl >= 0 ? 'pos' : 'neg'" />
        <Stat v-if="holding.sellCount" label="Realized P&L" :value="signed(holding.realizedPnl)" :tone="holding.realizedPnl >= 0 ? 'pos' : 'neg'" />
      </div>

      <!-- GOLD model -->
      <div v-else-if="isGold" class="space-y-3">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="ANTAM Buy Price / g" :value="holding.buyPrice ? formatPrice(holding.buyPrice, holding.currency) : '—'" muted />
          <Stat label="Buyback Price / g" :value="formatPrice(holding.currentGoldPrice, holding.currency)" />
          <Stat label="Grams Owned" :value="`${holding.gramsOwned.toLocaleString('id-ID', { maximumFractionDigits: 4 })} g`" />
          <Stat label="Average Buy Price / g" :value="formatPrice(holding.averageBuyPrice, holding.currency)" muted />
          <Stat label="Invested Amount" :value="formatPrice(holding.invested, holding.currency)" muted />
          <Stat label="Current Value" :value="formatPrice(holding.value, holding.currency)" />
          <Stat label="Profit / Loss" :value="signed(holding.pnl)" :tone="holding.pnl >= 0 ? 'pos' : 'neg'" />
          <Stat label="Profit %" :value="`${holding.pnlPct >= 0 ? '+' : ''}${holding.pnlPct.toFixed(2)}%`" :tone="holding.pnl >= 0 ? 'pos' : 'neg'" />
        </div>
        <p class="text-xs text-slate-500 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full" :class="holding.lastUpdated ? 'bg-green-400' : 'bg-yellow-400'"></span>
          <template v-if="holding.lastUpdated">{{ holding.provider }} price · last updated {{ formatAsOf(holding.lastUpdated) }}</template>
          <template v-else>Using manual/entry price — live ANTAM price not yet synced</template>
        </p>
      </div>

      <!-- MARKET model -->
      <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Current Price" :value="formatPrice(holding.currentPrice, holding.currency)" />
        <Stat label="Average Cost" :value="formatPrice(holding.avgCostPerUnit, holding.currency)" muted />
        <Stat label="Current Value" :value="formatPrice(holding.value, holding.currency)" />
        <Stat label="Unrealized P&L" :value="`${signed(holding.pnl)} (${holding.pnlPct >= 0 ? '+' : ''}${holding.pnlPct.toFixed(2)}%)`" :tone="holding.pnl >= 0 ? 'pos' : 'neg'" />
        <Stat v-if="holding.sellCount" label="Realized P&L" :value="signed(holding.realizedPnl)" :tone="holding.realizedPnl >= 0 ? 'pos' : 'neg'" />
      </div>
    </div>

    <!-- ========================== TRANSACTIONS ========================== -->
    <div v-show="activeTab === 'transactions'" class="space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-slate-400">{{ holding.txnCount }} transaction{{ holding.txnCount === 1 ? '' : 's' }}</p>
        <button @click="openAddTx"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-400 transition-all active:scale-95">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Add Transaction
        </button>
      </div>

      <div v-if="sortedTransactions.length" class="space-y-2">
        <div v-for="t in sortedTransactions" :key="t.id"
          class="group bg-[#1a1d27] border border-[#2e3348] rounded-xl px-4 py-3 flex items-center gap-3 hover:border-sky-500/30 transition-colors">
          <span class="text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
            :class="t.type === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'">
            {{ t.type }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-white">
              {{ Number(t.quantity).toLocaleString('id-ID', { maximumFractionDigits: 4 }) }} {{ unitWord }}
              <span class="text-slate-500">@ {{ formatPrice(Number(t.unit_price), holding.currency) }}</span>
            </p>
            <p class="text-xs text-slate-500">
              {{ formatDate(t.transaction_date) }}
              <span v-if="t.notes" class="text-slate-600">· {{ t.notes }}</span>
            </p>
          </div>
          <p class="text-sm font-semibold text-white shrink-0">{{ formatPrice(Number(t.total_amount), holding.currency) }}</p>
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button @click="openEditTx(t)" title="Edit"
              class="p-1.5 rounded-md text-slate-500 hover:text-sky-400 hover:bg-[#22263a] transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
            <button @click="confirmDeleteTx(t)" title="Delete"
              class="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-[#22263a] transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-12 border border-dashed border-[#2e3348] rounded-2xl">
        <p class="text-slate-500 text-sm mb-3">No transactions recorded yet.</p>
        <button @click="openAddTx" class="text-sky-400 hover:text-sky-300 text-sm transition-colors">Add the first one →</button>
      </div>
    </div>

    <!-- =========================== PERFORMANCE ========================== -->
    <div v-show="activeTab === 'performance'" class="space-y-4">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Invested" :value="formatPrice(holding.invested, holding.currency)" muted />
        <Stat label="Current Value" :value="formatPrice(holding.value, holding.currency)" />
        <Stat label="Growth" :value="`${holding.pnlPct >= 0 ? '+' : ''}${holding.pnlPct.toFixed(2)}%`" :tone="holding.pnl >= 0 ? 'pos' : 'neg'" />
        <Stat label="Total P&L" :value="signed(holding.pnl)" :tone="holding.pnl >= 0 ? 'pos' : 'neg'" />
      </div>

      <div v-if="chart" class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="text-sm font-semibold text-white">Contributions vs Value</p>
            <p class="text-xs text-slate-500">Cumulative invested over time vs current value<template v-if="holding.firstDate"> · since {{ formatDate(holding.firstDate) }}</template></p>
          </div>
          <div class="flex items-center gap-3 text-[10px]">
            <span class="flex items-center gap-1.5 text-slate-400"><span class="w-2.5 h-2.5 rounded-sm bg-sky-500/40 border border-sky-400"></span> Invested</span>
            <span class="flex items-center gap-1.5 text-slate-400"><span class="w-2.5 h-2.5 rounded-full" :class="holding.pnl >= 0 ? 'bg-green-400' : 'bg-red-400'"></span> Value</span>
          </div>
        </div>

        <svg :viewBox="`0 0 ${chart.W} ${chart.H}`" class="w-full" :style="{ height: chart.H + 'px' }" preserveAspectRatio="none">
          <!-- invested area + stepped line -->
          <path :d="chart.area" :fill="'url(#investedFill)'" />
          <path ref="line" :d="chart.line" fill="none" stroke="#38bdf8" stroke-width="2" class="draw" />
          <!-- connector from invested-end to current value -->
          <line :x1="chart.lastX" :y1="chart.investedEndY" :x2="chart.lastX" :y2="chart.valueY"
            :stroke="holding.pnl >= 0 ? '#4ade80' : '#f87171'" stroke-width="1.5" stroke-dasharray="3 3" />
          <!-- current value dot -->
          <circle :cx="chart.lastX" :cy="chart.valueY" r="4" :fill="holding.pnl >= 0 ? '#4ade80' : '#f87171'" />
          <defs>
            <linearGradient id="investedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div class="flex justify-between text-[10px] text-slate-600 mt-2">
          <span>{{ formatDate(holding.firstDate) }}</span>
          <span>Today · {{ formatPrice(holding.value, holding.currency) }}</span>
        </div>
      </div>

      <div v-else class="text-center py-12 border border-dashed border-[#2e3348] rounded-2xl">
        <p class="text-slate-500 text-sm">No transaction history to chart yet.</p>
      </div>
    </div>

    <!-- Asset-specific news -->
    <div>
      <h2 class="text-lg font-semibold text-white mb-4">Related News</h2>
      <NewsFeed :items="assetNews" />
      <p v-if="assetNews.length === 0" class="text-slate-500 text-sm">No news yet for {{ holding.symbol }}.</p>
    </div>

    <!-- Delete asset -->
    <div class="border-t border-[#2e3348] pt-6">
      <button @click="showDeleteModal = true"
        class="text-sm text-red-400 hover:text-red-300 transition-colors flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        Remove this asset
      </button>
    </div>
  </div>

    <div v-else class="text-center py-20 text-slate-500">Asset not found.</div>

    <AddHoldingModal :show="showEdit" :holding="holding" @close="showEdit = false" />
    <TransactionModal v-if="holding" :show="showTxModal" :asset="holding" :transaction="editingTx" @close="closeTxModal" />

    <!-- Delete transaction confirm -->
    <Transition name="modal">
      <div v-if="txToDelete" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="txToDelete = null" />
        <div class="relative bg-[#1a1d27] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 class="text-white font-semibold mb-1">Delete transaction?</h3>
          <p class="text-slate-400 text-sm mb-5">
            Remove the <span class="font-medium" :class="txToDelete.type === 'BUY' ? 'text-green-400' : 'text-red-400'">{{ txToDelete.type }}</span>
            of {{ Number(txToDelete.quantity).toLocaleString('id-ID') }} {{ unitWord }} on {{ formatDate(txToDelete.transaction_date) }}. Position metrics recalculate immediately.
          </p>
          <div class="flex gap-3">
            <button @click="txToDelete = null" class="flex-1 py-2.5 rounded-lg border border-[#2e3348] text-slate-400 text-sm hover:border-slate-500 transition-colors">Cancel</button>
            <button @click="executeDeleteTx" :disabled="deletingTx"
              class="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400 disabled:opacity-40 transition-all active:scale-95">
              {{ deletingTx ? 'Removing…' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Delete asset confirmation modal -->
    <Transition name="modal">
      <div v-if="showDeleteModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeDeleteModal" />
        <div class="relative bg-[#1a1d27] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </div>
          <h3 class="text-white font-semibold text-center mb-1">Remove Asset</h3>
          <p class="text-slate-400 text-sm text-center mb-5">
            This permanently deletes <span class="text-white font-medium">{{ holding?.symbol }}</span> and all its transactions. This cannot be undone.
          </p>
          <div class="mb-5">
            <label class="text-xs text-slate-400 mb-2 block">
              Type <span class="text-white font-mono font-medium">{{ holding?.symbol }}</span> to confirm
            </label>
            <input v-model="deleteConfirmInput" type="text" :placeholder="holding?.symbol"
              @keydown.enter="deleteConfirmInput === holding?.symbol && executeDelete()"
              class="w-full bg-[#0f1117] border rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors"
              :class="deleteConfirmInput && deleteConfirmInput !== holding?.symbol ? 'border-red-500/50 focus:border-red-500' : 'border-[#2e3348] focus:border-red-500/60'" />
            <p v-if="deleteConfirmInput && deleteConfirmInput !== holding?.symbol" class="text-xs text-red-400 mt-1.5">Doesn't match — check the symbol and try again</p>
          </div>
          <div class="flex gap-3">
            <button @click="closeDeleteModal" class="flex-1 py-2.5 rounded-lg border border-[#2e3348] text-slate-400 text-sm hover:border-slate-500 transition-colors">Cancel</button>
            <button @click="executeDelete" :disabled="deleteConfirmInput !== holding?.symbol || deleting"
              class="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95">
              {{ deleting ? 'Removing…' : 'Remove' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { usePortfolioStore } from '@/stores/portfolio'
import NewsFeed from '@/components/NewsFeed.vue'
import AddHoldingModal from '@/components/AddHoldingModal.vue'
import TransactionModal from '@/components/TransactionModal.vue'
import { fundCategoryLabel } from '@/lib/valuation'

// Tiny presentational stat-card (keeps the template DRY across the three grids).
const Stat = (props) =>
  h('div', { class: 'bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-4' }, [
    h('p', { class: 'text-xs text-slate-500 mb-2' }, props.label),
    h('p', {
      class: ['text-xl font-bold',
        props.tone === 'pos' ? 'text-green-400' : props.tone === 'neg' ? 'text-red-400' : props.muted ? 'text-slate-300' : 'text-white'],
    }, props.value),
  ])
Stat.props = ['label', 'value', 'tone', 'muted']

const route = useRoute()
const router = useRouter()
const store = usePortfolioStore()

const showEdit = ref(false)
const showDeleteModal = ref(false)
const deleteConfirmInput = ref('')
const deleting = ref(false)

const activeTab = ref('overview')
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'performance', label: 'Performance' },
]

// Transaction modal + delete state
const showTxModal = ref(false)
const editingTx = ref(null)
const txToDelete = ref(null)
const deletingTx = ref(false)

onMounted(() => {
  if (store.holdings.length === 0) store.init()
})

const holding = computed(() => store.holdingsWithSnapshot.find((h) => h.id === route.params.id))

const isFund = computed(() => holding.value?.kind === 'fund')
const isGold = computed(() => holding.value?.kind === 'gold')
const categoryLabel = computed(() => fundCategoryLabel(holding.value?.category))
const unitWord = computed(() =>
  isFund.value ? 'units' : isGold.value ? 'gram' : (holding.value?.unit ?? 'shares')
)

const sortedTransactions = computed(() =>
  [...(holding.value?.transactions ?? [])].sort((a, b) => {
    const da = a.transaction_date ? Date.parse(a.transaction_date) : 0
    const db = b.transaction_date ? Date.parse(b.transaction_date) : 0
    return db - da // newest first
  })
)

// Contribution-vs-value chart geometry from the aggregation timeline.
const chart = computed(() => {
  const tl = holding.value?.timeline ?? []
  if (!tl.length) return null
  const W = 600, H = 180, pad = 10
  const curVal = holding.value.value || 0
  const maxY = Math.max(...tl.map((p) => p.cumulativeInvested), curVal, 1)
  const n = tl.length
  const x = (i) => (n === 1 ? W - pad : pad + (i / (n - 1)) * (W - 2 * pad))
  const y = (v) => H - pad - (v / maxY) * (H - 2 * pad)

  // Stepped line: invested holds flat then jumps at each transaction.
  let line = ''
  tl.forEach((p, i) => {
    const px = x(i), py = y(p.cumulativeInvested)
    if (i === 0) line += `M ${px} ${py}`
    else line += ` L ${x(i)} ${y(tl[i - 1].cumulativeInvested)} L ${px} ${py}`
  })
  const lastX = x(n - 1)
  const investedEndY = y(tl[n - 1].cumulativeInvested)
  const area = `${line} L ${lastX} ${H - pad} L ${x(0)} ${H - pad} Z`
  return { W, H, line, area, lastX, investedEndY, valueY: y(curVal) }
})

const assetNews = computed(() =>
  holding.value ? store.news.filter((n) => n.symbol === holding.value.symbol) : []
)

function openAddTx() { editingTx.value = null; showTxModal.value = true }
function openEditTx(t) { editingTx.value = t; showTxModal.value = true }
function closeTxModal() { showTxModal.value = false; editingTx.value = null }
function confirmDeleteTx(t) { txToDelete.value = t }
async function executeDeleteTx() {
  if (!txToDelete.value) return
  deletingTx.value = true
  await store.deleteTransaction(txToDelete.value.id)
  deletingTx.value = false
  txToDelete.value = null
}

function signed(v) {
  return `${v >= 0 ? '+' : ''}${formatPrice(v, holding.value?.currency)}`
}
function formatPrice(value, currency = 'USD') {
  if (currency === 'IDR') {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value ?? 0)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0)
}
function formatNav(value, currency = 'USD') {
  const opts = { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }
  return new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', opts).format(value ?? 0)
}
function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatAsOf(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function closeDeleteModal() { showDeleteModal.value = false; deleteConfirmInput.value = '' }
async function executeDelete() {
  if (deleteConfirmInput.value !== holding.value?.symbol || deleting.value) return
  deleting.value = true
  await store.deleteHolding(holding.value.id)
  deleting.value = false
  router.push('/')
}
</script>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .relative, .modal-leave-active .relative { transition: transform 0.2s ease, opacity 0.2s ease; }
.modal-enter-from .relative { transform: scale(0.95) translateY(8px); opacity: 0; }

/* Performance line draws itself in. */
.draw { stroke-dasharray: 1400; stroke-dashoffset: 1400; animation: draw 0.9s ease forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
</style>
