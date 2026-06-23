<template>
  <div class="space-y-4">
    <!-- Grand total + currency toggle -->
    <div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-5">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs text-slate-500 mb-2">Total Portfolio Value</p>
          <Transition name="value" mode="out-in">
            <p :key="store.displayCurrency" class="text-3xl font-bold text-white">
              {{ format(grand.value, grand.currency) }}
            </p>
          </Transition>
          <p class="text-xs mt-2" :class="grand.pnl >= 0 ? 'text-green-400' : 'text-red-400'">
            {{ grand.pnl >= 0 ? '+' : '' }}{{ format(grand.pnl, grand.currency) }}
            <span class="opacity-70">({{ grand.pnl >= 0 ? '+' : '' }}{{ grand.pnlPct.toFixed(2) }}% all time)</span>
          </p>
        </div>

        <!-- Currency switch -->
        <div class="flex bg-[#0f1117] border border-[#2e3348] rounded-lg p-0.5">
          <button
            v-for="cur in ['IDR', 'USD']"
            :key="cur"
            @click="store.setDisplayCurrency(cur)"
            class="px-3 py-1 rounded-md text-xs font-medium transition-all duration-200"
            :class="store.displayCurrency === cur
              ? 'bg-sky-500 text-white'
              : 'text-slate-400 hover:text-white'"
          >
            {{ cur }}
          </button>
        </div>
      </div>

      <!-- FX note -->
      <p class="text-xs text-slate-600 mt-3">
        Converted at 1 USD = {{ formatIDR(store.fxRate) }}
      </p>
    </div>

    <!-- Per-currency breakdown -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div
        v-for="bucket in currencyCards"
        :key="bucket.currency"
        class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-4"
      >
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs text-slate-500">{{ bucket.currency }} Assets</p>
          <span class="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 font-mono">
            {{ bucket.currency }}
          </span>
        </div>
        <p class="text-xl font-bold text-white">{{ format(bucket.value, bucket.currency) }}</p>
        <p class="text-xs mt-1" :class="bucket.pnl >= 0 ? 'text-green-500/80' : 'text-red-500/80'">
          {{ bucket.pnl >= 0 ? '+' : '' }}{{ format(bucket.pnl, bucket.currency) }} P&L
        </p>
      </div>

      <!-- Empty hint when no holdings -->
      <div v-if="currencyCards.length === 0"
        class="sm:col-span-2 bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-4 text-center">
        <p class="text-xs text-slate-500">Add an asset to see your breakdown</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'

const store = usePortfolioStore()

const grand = computed(() => store.grandTotal)

const currencyCards = computed(() =>
  Object.entries(store.totalsByCurrency).map(([currency, b]) => ({
    currency,
    ...b,
  }))
)

function format(value, currency = 'USD') {
  if (currency === 'IDR') return formatIDR(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value)
}

function formatIDR(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(value)
}
</script>

<style scoped>
/* Total fades + slides when switching currency — signals the value changed */
.value-enter-active, .value-leave-active { transition: opacity .2s ease, transform .2s ease; }
.value-enter-from { opacity: 0; transform: translateY(6px); }
.value-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
