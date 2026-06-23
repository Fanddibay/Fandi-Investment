<template>
  <div class="space-y-3">
    <!-- Empty state -->
    <div v-if="items.length === 0" class="py-16 text-center">
      <div class="w-12 h-12 rounded-2xl bg-[#1a1d27] border border-[#2e3348] flex items-center justify-center mx-auto mb-4">
        <svg class="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l6 6v8a2 2 0 0 1-2 2z" stroke-linecap="round"/>
          <path d="M14 4v6h6M8 12h8M8 16h5" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="text-sm text-slate-500 font-medium">{{ emptyMessage }}</p>
      <p class="text-xs text-slate-600 mt-1">{{ emptySubtext }}</p>
    </div>

    <!-- News cards -->
    <div
      v-for="(item, i) in items"
      :key="item.id"
      class="news-card group flex gap-3 p-4 bg-[#1a1d27] border border-[#2e3348] rounded-xl
             hover:border-sky-500/30 hover:bg-[#1e2233] transition-all duration-200"
      :style="{ animationDelay: `${Math.min(i, 10) * 35}ms` }"
    >
      <!-- Thumbnail -->
      <div class="shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden bg-[#22263a] flex items-center justify-center">
        <img
          v-if="item.thumbnail && !thumbErrors.has(item.id)"
          :src="item.thumbnail"
          :alt="item.source"
          loading="lazy"
          class="w-full h-full object-cover"
          @error="thumbErrors.add(item.id)"
        />
        <!-- Fallback: source initial with category-tinted bg -->
        <div
          v-else
          class="w-full h-full flex items-center justify-center"
          :style="{ background: fallbackGradient(item) }"
        >
          <span class="text-xl font-bold" :style="{ color: sourceColor(item) }">
            {{ (item.source || '?')[0].toUpperCase() }}
          </span>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0 flex flex-col gap-1.5">

        <!-- Meta row: tags + source + time + sentiment -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <span
            v-if="item.symbol"
            class="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold"
            :style="symbolChipStyle(item.symbol)"
          >
            {{ item.symbol }}
          </span>
          <span
            v-if="item.category"
            class="text-[10px] px-1.5 py-0.5 rounded bg-[#22263a] text-slate-400"
          >
            {{ item.category }}
          </span>
          <span class="text-[11px] text-slate-500">{{ item.source }}</span>
          <span class="text-slate-600 text-xs">·</span>
          <span class="text-[11px] text-slate-500">{{ formatDate(item.published_at) }}</span>
          <!-- Sentiment pill — right-aligned -->
          <span
            class="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            :class="sentimentClass(item.sentiment)"
          >
            {{ item.sentiment ?? 'neutral' }}
          </span>
        </div>

        <!-- Headline -->
        <a
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          class="block"
        >
          <p class="text-sm text-white font-semibold leading-snug line-clamp-2
                     group-hover:text-sky-300 transition-colors duration-200">
            {{ item.title }}
          </p>
        </a>

        <!-- Summary -->
        <p
          v-if="item.summary"
          class="text-[11px] text-slate-500 line-clamp-2 leading-relaxed"
        >
          {{ item.summary }}
        </p>

        <!-- Actions -->
        <div class="flex items-center gap-3 mt-0.5">
          <a
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors font-medium"
          >
            Read article
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>

          <!-- Read Later toggle -->
          <button
            @click.prevent="toggle(item.url)"
            :aria-pressed="isSaved(item.url)"
            :title="isSaved(item.url) ? 'Remove from saved' : 'Save for later'"
            class="ml-auto text-base leading-none transition-all duration-200 active:scale-125"
            :class="isSaved(item.url) ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'"
          >
            {{ isSaved(item.url) ? '★' : '☆' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { useReadLater } from '@/composables/useReadLater'

const props = defineProps({
  items: { type: Array, default: () => [] },
  emptyMessage: { type: String, default: 'No news matches this filter yet.' },
  emptySubtext: { type: String, default: 'Try adjusting your filters or check back later.' },
})

const { isSaved, toggle } = useReadLater()

// Track per-card thumbnail load failures reactively.
const thumbErrors = reactive(new Set())

// --- Formatters -------------------------------------------------------------

function sentimentClass(sentiment) {
  const map = {
    positive: 'bg-green-500/10 text-green-400',
    negative: 'bg-red-500/10 text-red-400',
    neutral: 'bg-slate-500/10 text-slate-400',
  }
  return map[sentiment] ?? map.neutral
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000 / 60)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// --- Visual helpers --------------------------------------------------------

// Asset color palette from DESIGN.md
const ASSET_COLORS = {
  QQQ: '#0ea5e9',
  SPY: '#8b5cf6',
  NVDA: '#06b6d4',
  AAPL: '#64748b',
  TSLA: '#e11d48',
  MSFT: '#0284c7',
  GOOGL: '#16a34a',
  META: '#2563eb',
  AMZN: '#f59e0b',
  'ANTM.JK': '#f59e0b',
  'GOLD-ANTAM': '#d97706',
  'BBCA.JK': '#10b981',
  'BBRI.JK': '#0891b2',
  'BBNI.JK': '#7c3aed',
  'BMRI.JK': '#059669',
  'TLKM.JK': '#0369a1',
}

const SOURCE_COLORS = {
  CNBC: '#0ea5e9',
  Reuters: '#f97316',
  MarketWatch: '#10b981',
  'Yahoo Finance': '#7c3aed',
  'CNBC Indonesia': '#ef4444',
  Kontan: '#3b82f6',
  'Bisnis Indonesia': '#14b8a6',
}

function symbolChipStyle(symbol) {
  const color = ASSET_COLORS[symbol] || '#94a3b8'
  return {
    backgroundColor: color + '22',
    color,
  }
}

function sourceColor(item) {
  if (item.symbol && ASSET_COLORS[item.symbol]) return ASSET_COLORS[item.symbol]
  return SOURCE_COLORS[item.source] || '#475569'
}

function fallbackGradient(item) {
  const c = sourceColor(item)
  return `linear-gradient(135deg, #1a1d27 0%, ${c}18 100%)`
}
</script>

<style scoped>
.news-card {
  animation: news-in 0.28s ease both;
}
@keyframes news-in {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .news-card { animation: none; }
}
</style>
