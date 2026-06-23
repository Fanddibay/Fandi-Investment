<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Portfolio</h1>
        <p class="text-slate-500 text-sm mt-1">
          {{ today }} · {{ store.holdings.length }} assets tracked
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

    <!-- Summary stats — overall portfolio value -->
    <SummaryBar />

    <!-- Empty state -->
    <div v-if="!store.loading && store.holdings.length === 0"
      class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-16 h-16 rounded-2xl bg-[#1a1d27] border border-[#2e3348] flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
        </svg>
      </div>
      <h3 class="text-white font-semibold mb-2">No holdings yet</h3>
      <p class="text-slate-500 text-sm mb-6">Add your first asset to start tracking your portfolio</p>
      <button @click="showModal = true"
        class="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium rounded-xl transition-all active:scale-95">
        Add First Asset
      </button>
    </div>

    <!-- Portfolio value over time -->
    <PortfolioChart v-else-if="!store.loading" />

    <!-- Entry point to the full holdings list (now lives on its own page) -->
    <RouterLink
      v-if="!store.loading && store.holdings.length > 0"
      to="/assets"
      class="flex items-center justify-between bg-[#1a1d27] border border-[#2e3348] rounded-2xl px-5 py-4
             hover:border-sky-500/40 hover:bg-[#1e2233] transition-all duration-300 group"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
          <svg class="w-4.5 h-4.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10m0-10L4 7"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-white">Your assets</p>
          <p class="text-xs text-slate-500">{{ store.holdings.length }} holdings · filter, sort & details</p>
        </div>
      </div>
      <span class="text-sm text-slate-500 group-hover:text-sky-400 transition-colors shrink-0 ml-3">View all →</span>
    </RouterLink>

    <!-- Latest news preview -->
    <div v-if="store.news.length > 0">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-white">Latest News</h2>
        <RouterLink to="/news" class="text-sm text-sky-400 hover:text-sky-300 transition-colors">
          View all →
        </RouterLink>
      </div>
      <NewsFeed :items="store.news.slice(0, 5)" />
    </div>

    <AddHoldingModal :show="showModal" @close="showModal = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { usePortfolioStore } from '@/stores/portfolio'
import SummaryBar from '@/components/SummaryBar.vue'
import PortfolioChart from '@/components/PortfolioChart.vue'
import NewsFeed from '@/components/NewsFeed.vue'
import AddHoldingModal from '@/components/AddHoldingModal.vue'

const store = usePortfolioStore()
const showModal = ref(false)

const today = computed(() => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
}))

// Cached-first: show what we have instantly, then sync only if prices are
// stale (>10 min). Avoids hitting Yahoo on every navigation back to Dashboard.
onMounted(() => store.init())
</script>
