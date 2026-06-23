<template>
  <div class="space-y-6">

    <!-- ── Page header ─────────────────────────────────────────────────────── -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-white">Market News</h1>
        <p class="text-slate-500 text-sm mt-1">
          Aggregated from CNBC, Reuters, Yahoo Finance &amp; Indonesian sources
        </p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <!-- Saved toggle -->
        <button
          @click="toggleSaved"
          class="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-medium
                 transition-all duration-200 active:scale-95"
          :class="
            savedOnly
              ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
              : 'border-[#2e3348] text-slate-400 hover:border-slate-500'
          "
        >
          {{ savedOnly ? '★' : '☆' }}
          <span>Saved<span v-if="savedCount > 0" class="ml-0.5 opacity-70">({{ savedCount }})</span></span>
        </button>

        <!-- Sync -->
        <button
          @click="refresh"
          :disabled="loading"
          class="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-[#2e3348]
                 text-slate-400 text-xs font-medium hover:border-slate-500 transition-colors
                 disabled:opacity-40 active:scale-95"
        >
          <svg
            class="w-3.5 h-3.5"
            :class="loading ? 'animate-spin' : ''"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Sync
        </button>
      </div>
    </div>

    <!-- ── Sentiment pulse ─────────────────────────────────────────────────── -->
    <div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-5">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h4l3 8 4-16 3 8h4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="min-w-0">
          <h2 class="font-semibold text-white text-sm">Sentiment Pulse</h2>
          <p class="text-xs text-slate-500">{{ pulseLabel }}</p>
        </div>
        <span class="ml-auto text-xs text-slate-500 shrink-0">{{ sentiment.total }} articles</span>
      </div>

      <div class="h-2 rounded-full bg-[#0f1117] overflow-hidden flex">
        <div class="h-full bg-green-500/70 transition-all duration-700" :style="{ width: pct.positive + '%' }" />
        <div class="h-full bg-slate-600/60 transition-all duration-700" :style="{ width: pct.neutral + '%' }" />
        <div class="h-full bg-red-500/70 transition-all duration-700" :style="{ width: pct.negative + '%' }" />
      </div>

      <div class="grid grid-cols-3 gap-3 mt-4">
        <div class="text-center">
          <p class="text-lg font-bold text-green-400">{{ sentiment.positive }}</p>
          <p class="text-xs text-slate-500">Positive</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold text-slate-400">{{ sentiment.neutral }}</p>
          <p class="text-xs text-slate-500">Neutral</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold text-red-400">{{ sentiment.negative }}</p>
          <p class="text-xs text-slate-500">Negative</p>
        </div>
      </div>
    </div>

    <!-- ── Tab navigation ─────────────────────────────────────────────────── -->
    <div class="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none -mx-1 px-1">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        @click="setTab(tab.id)"
        class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium
               transition-all duration-200 active:scale-95 border whitespace-nowrap"
        :class="
          activeTab === tab.id
            ? 'border-sky-500 bg-sky-500/10 text-sky-400'
            : 'border-[#2e3348] text-slate-400 hover:border-slate-500 hover:text-slate-300'
        "
      >
        <component :is="tab.icon" class="w-3.5 h-3.5 shrink-0" />
        {{ tab.label }}
        <span
          v-if="tabCounts[tab.id] > 0"
          class="ml-0.5 text-[10px] font-normal"
          :class="activeTab === tab.id ? 'text-sky-400/70' : 'text-slate-600'"
        >
          {{ tabCounts[tab.id] }}
        </span>
      </button>
    </div>

    <!-- ── Search ─────────────────────────────────────────────────────────── -->
    <div class="relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none"
           viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" stroke-linecap="round"/>
      </svg>
      <input
        v-model="query"
        type="text"
        placeholder="Search headlines…"
        class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg pl-9 pr-4 py-2.5 text-sm
               text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors"
      />
    </div>

    <!-- ── Pinned highlight (For You tab, no search, no saved filter) ─────── -->
    <Transition name="pinned-fade">
      <a
        v-if="pinned"
        :href="pinned.url"
        target="_blank"
        rel="noopener"
        class="block bg-sky-500/[0.06] border border-sky-500/20 rounded-2xl p-4
               hover:border-sky-500/40 transition-all duration-300 group"
      >
        <div class="flex items-center gap-2 mb-1.5 flex-wrap">
          <span class="text-xs text-sky-400 font-semibold tracking-wide uppercase">★ Pinned</span>
          <span
            v-if="pinned.symbol"
            class="text-xs px-1.5 py-0.5 rounded bg-[#22263a] text-sky-400 font-mono"
          >{{ pinned.symbol }}</span>
          <span class="text-xs text-slate-500 ml-auto">{{ pinned.source }}</span>
        </div>
        <p class="text-sm text-white font-semibold leading-snug group-hover:text-sky-300 transition-colors">
          {{ pinned.title }}
        </p>
      </a>
    </Transition>

    <!-- ── Loading skeleton ───────────────────────────────────────────────── -->
    <div v-if="loading && store.news.length === 0" class="space-y-3">
      <div
        v-for="n in 5"
        :key="n"
        class="h-24 bg-[#1a1d27] border border-[#2e3348] rounded-xl animate-pulse"
      />
    </div>

    <!-- ── News feed with page transition ─────────────────────────────────── -->
    <div v-else ref="newsList">
      <Transition name="page-fade" mode="out-in">
        <div :key="`${activeTab}-${currentPage}`">
          <NewsFeed
            :items="pagedItems"
            :empty-message="activeTabMeta.emptyMsg"
            :empty-subtext="activeTabMeta.emptySub"
          />
        </div>
      </Transition>

      <!-- Pagination -->
      <NewsPagination
        :page="currentPage"
        :total="totalPages"
        :total-items="filteredNews.length"
        :page-size="pageSize"
        @change="changePage"
        @page-size-change="changePageSize"
      />
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, defineComponent, h } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import { useReadLater } from '@/composables/useReadLater'
import { getNewsTabs } from '@/lib/news'
import NewsFeed from '@/components/NewsFeed.vue'
import NewsPagination from '@/components/NewsPagination.vue'

const store = usePortfolioStore()
const { savedSet, count: savedCount, isSaved } = useReadLater()

// ── State -------------------------------------------------------------------

const activeTab = ref('foryou')
const savedOnly = ref(false)
const query = ref('')
const currentPage = ref(1)
const pageSize = ref(15)
const loading = ref(false)
const newsList = ref(null)

// ── Tab definitions ---------------------------------------------------------

// Tiny inline SVG components so we can use <component :is="tab.icon" />.
const IconUser = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'stroke-linecap': 'round' }),
    h('circle', { cx: '12', cy: '7', r: '4' }),
  ]),
})
const IconBarChart = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M3 3v18h18', 'stroke-linecap': 'round' }),
    h('path', { d: 'M7 16l4-4 4 4 4-4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ]),
})
const IconMapPin = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z', 'stroke-linecap': 'round' }),
    h('circle', { cx: '12', cy: '9', r: '2.5' }),
  ]),
})
const IconGlobe = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('path', { d: 'M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20', 'stroke-linecap': 'round' }),
  ]),
})
const IconGold = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('circle', { cx: '12', cy: '12', r: '8' }),
    h('path', { d: 'M12 8v8M9 11l3-3 3 3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ]),
})

const TABS = [
  {
    id: 'foryou',
    label: 'For You',
    icon: IconUser,
    emptyMsg: 'No personalized news yet.',
    emptySub: 'Holdings in your portfolio drive this feed — add assets to see targeted news.',
  },
  {
    id: 'market',
    label: 'Market',
    icon: IconBarChart,
    emptyMsg: 'No market news available.',
    emptySub: 'Refresh to pull the latest from CNBC, MarketWatch, and Yahoo Finance.',
  },
  {
    id: 'indonesia',
    label: 'Indonesia',
    icon: IconMapPin,
    emptyMsg: 'No Indonesian market news.',
    emptySub: 'Indonesian sources are loading or temporarily unavailable.',
  },
  {
    id: 'global',
    label: 'Global',
    icon: IconGlobe,
    emptyMsg: 'No global news available.',
    emptySub: 'Reuters and international macroeconomic news appears here.',
  },
  {
    id: 'gold',
    label: 'Gold',
    icon: IconGold,
    emptyMsg: 'No gold or commodities news.',
    emptySub: 'Gold price, precious metals, and ANTAM updates appear here.',
  },
]

const activeTabMeta = computed(() => TABS.find((t) => t.id === activeTab.value) ?? TABS[0])

// ── Derived data ------------------------------------------------------------

const heldSymbols = computed(() =>
  store.holdings.map((h) => h.symbol).filter(Boolean),
)

const sentiment = computed(() => store.newsSentiment)

const pct = computed(() => {
  const t = sentiment.value.total || 1
  return {
    positive: (sentiment.value.positive / t) * 100,
    neutral: (sentiment.value.neutral / t) * 100,
    negative: (sentiment.value.negative / t) * 100,
  }
})

const pulseLabel = computed(() => {
  const { positive, negative, total } = sentiment.value
  if (!total) return 'Awaiting headlines'
  if (positive > negative * 1.3) return 'Portfolio leaning positive'
  if (negative > positive * 1.3) return 'Caution — negative tilt'
  return 'Mixed sentiment'
})

// Count per tab without any search/saved overlay, so labels show stable numbers.
const tabCounts = computed(() => {
  const out = {}
  for (const tab of TABS) {
    if (tab.id === 'market') {
      out[tab.id] = store.news.length
    } else {
      out[tab.id] = store.news.filter((n) =>
        getNewsTabs(n, heldSymbols.value).includes(tab.id),
      ).length
    }
  }
  return out
})

const filteredNews = computed(() => {
  let list = store.news

  // Tab filter
  if (activeTab.value !== 'market') {
    list = list.filter((n) =>
      getNewsTabs(n, heldSymbols.value).includes(activeTab.value),
    )
  }

  // Saved filter
  if (savedOnly.value) {
    list = list.filter((n) => savedSet.value.has(n.url))
  }

  // Search
  const q = query.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (n) =>
        n.title?.toLowerCase().includes(q) ||
        n.source?.toLowerCase().includes(q) ||
        n.summary?.toLowerCase().includes(q),
    )
  }

  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredNews.value.length / pageSize.value)))

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredNews.value.slice(start, start + pageSize.value)
})

// Pinned: most relevant non-neutral holding-specific headline on "For You".
const pinned = computed(() => {
  if (activeTab.value !== 'foryou' || query.value.trim() || savedOnly.value || currentPage.value > 1) {
    return null
  }
  return (
    store.news.find(
      (n) => n.symbol && heldSymbols.value.includes(n.symbol) && n.sentiment !== 'neutral',
    ) ?? null
  )
})

// ── Watchers ----------------------------------------------------------------

// Reset to page 1 when tab, search, or saved filter changes.
watch([activeTab, savedOnly], () => { currentPage.value = 1 })
watch(query, () => { currentPage.value = 1 })

// Clamp current page when total shrinks (e.g. after search narrows results).
watch(totalPages, (t) => {
  if (currentPage.value > t) currentPage.value = t
})

// ── Actions ----------------------------------------------------------------

function setTab(id) {
  activeTab.value = id
  currentPage.value = 1
}

function toggleSaved() {
  savedOnly.value = !savedOnly.value
  currentPage.value = 1
}

function changePage(n) {
  currentPage.value = n
  // Scroll to news list after DOM updates.
  nextTick(() => {
    newsList.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function changePageSize(size) {
  pageSize.value = size
  currentPage.value = 1
}

async function refresh() {
  loading.value = true
  await store.fetchNews()
  loading.value = false
}

onMounted(refresh)
</script>

<style scoped>
/* Tab content fade — quicker exit than entry so navigation feels snappy. */
.page-fade-enter-active { transition: opacity 0.18s ease; }
.page-fade-enter-from  { opacity: 0; }
.page-fade-leave-active { transition: opacity 0.1s ease; }
.page-fade-leave-to    { opacity: 0; }

/* Pinned card fade */
.pinned-fade-enter-active, .pinned-fade-leave-active { transition: opacity 0.2s ease; }
.pinned-fade-enter-from, .pinned-fade-leave-to { opacity: 0; }

/* Hide scrollbar on the tab strip while keeping scroll functional. */
.scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
