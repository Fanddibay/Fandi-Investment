<template>
  <RouterLink
    :to="`/asset/${holding.id}`"
    class="block bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-5
           hover:border-sky-500/40 hover:bg-[#1e2233] hover:-translate-y-0.5
           transition-all duration-300 cursor-pointer group"
  >
    <!-- Header: icon + name | Today badge -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
          :style="{ background: assetColor + '22', color: assetColor }"
        >
          {{ holding.symbol.slice(0, 2).toUpperCase() }}
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-white text-sm leading-tight truncate">{{ holding.symbol }}</p>
          <p class="text-xs text-slate-500 mt-0.5 leading-tight truncate">{{ holding.name }}</p>
        </div>
      </div>

      <!-- Today badge — labeled clearly so it's not confused with total return -->
      <div class="text-right shrink-0 ml-3">
        <p class="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wide">Today</p>
        <span
          class="text-xs px-2 py-0.5 rounded-full font-medium"
          :class="holding.dayChange >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'"
        >
          {{ holding.dayChange >= 0 ? '+' : '' }}{{ holding.dayChange.toFixed(2) }}%
        </span>
      </div>
    </div>

    <!-- Primary: current value — the number investors care about most -->
    <div class="mb-1.5">
      <p class="text-2xl font-bold text-white tracking-tight">
        {{ formatPrice(holding.value, holding.currency) }}
      </p>
      <p class="text-xs text-slate-500 mt-0.5">Current Value</p>
    </div>

    <!-- Secondary: total return — colored so it's readable in a scan -->
    <div class="mb-4">
      <p
        class="text-sm font-semibold transition-colors duration-200"
        :class="holding.pnl >= 0 ? 'text-green-400' : 'text-red-400'"
      >
        {{ holding.pnl >= 0 ? '+' : '' }}{{ formatPrice(holding.pnl, holding.currency) }}
        <span class="text-xs opacity-70 ml-0.5">
          ({{ holding.pnlPct >= 0 ? '+' : '' }}{{ holding.pnlPct.toFixed(1) }}%)
        </span>
      </p>
    </div>

    <!-- Footer: position detail line + allocation — tertiary info -->
    <div class="border-t border-[#2e3348] pt-3 flex items-center justify-between gap-2">
      <p class="text-xs text-slate-500 truncate">{{ positionDetail }}</p>
      <span class="text-xs text-slate-600 shrink-0 whitespace-nowrap">
        {{ allocation.toFixed(1) }}% of portfolio
      </span>
    </div>
  </RouterLink>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { computed } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'

const props = defineProps({
  holding: { type: Object, required: true },
})

const store = usePortfolioStore()
const allocation = computed(() => store.allocations[props.holding.id] ?? 0)

const assetColors = {
  QQQ: '#0ea5e9',
  SPY: '#8b5cf6',
  'ANTM.JK': '#f59e0b',
  'GOLD-ANTAM': '#d97706',
  REKSADANA: '#10b981',
  OBLIGASI: '#06b6d4',
}

const assetColor = computed(() => assetColors[props.holding.symbol] ?? '#94a3b8')

// Build the tertiary position detail line per asset class.
// Shows ownership quantity + per-unit price, not a generic "shares" label.
const positionDetail = computed(() => {
  const h = props.holding

  if (h.kind === 'gold') {
    const grams = h.gramsOwned ?? h.quantity ?? 0
    const pricePerGram = h.currentGoldPrice ?? h.currentPrice ?? 0
    return `${formatNumber(grams)} Gram • ${formatPrice(pricePerGram, h.currency)} / gram`
  }

  if (h.kind === 'fund') {
    const units = h.units ?? h.quantity ?? 0
    const nav = h.currentNav ?? h.currentPrice ?? 0
    return `${formatNumber(units)} Units • NAV ${formatPrice(nav, h.currency)}`
  }

  // Market assets (stock, ETF, manual) — differentiate lots vs shares
  const qty = h.quantity ?? 0
  const price = h.currentPrice ?? 0
  const unit = (h.unit ?? '').toLowerCase()

  if (unit === 'lot') {
    return `${formatNumber(qty)} Lots • ${formatPrice(price, h.currency)}`
  }

  const label = qty === 1 ? 'Share' : 'Shares'
  return `${formatNumber(qty)} ${label} • ${formatPrice(price, h.currency)}`
})

function formatPrice(value, currency = 'USD') {
  if (currency === 'IDR') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(value)
}
</script>
