<template>
  <div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-5">
    <!-- Header: title + window change KPI, then range toggle -->
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
      <div>
        <p class="text-xs text-slate-500 mb-1.5">Portfolio Value</p>
        <div class="flex items-baseline gap-2">
          <p class="text-2xl font-bold text-white tabular-nums">
            {{ hovered ? fmt(hovered.value) : fmt(lastValue) }}
          </p>
          <span
            v-if="change && Number.isFinite(change.pct)"
            class="text-xs font-medium tabular-nums"
            :class="change.positive ? 'text-green-400' : 'text-red-400'"
          >
            {{ change.positive ? '▲' : '▼' }}
            {{ change.positive ? '+' : '' }}{{ fmt(change.abs) }}
            ({{ change.positive ? '+' : '' }}{{ change.pct.toFixed(2) }}%)
          </span>
        </div>
        <p class="text-[11px] text-slate-600 mt-1">
          {{ hovered ? fmtTime(hovered.t, true) : `${rangeLabel} · tracking since ${sinceLabel}` }}
        </p>
      </div>

      <!-- Range toggle -->
      <div class="flex bg-[#0f1117] border border-[#2e3348] rounded-lg p-0.5 shrink-0 self-start">
        <button
          v-for="r in ranges"
          :key="r.key"
          @click="range = r.key"
          class="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200"
          :class="range === r.key ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'"
        >
          {{ r.key }}
        </button>
      </div>
    </div>

    <!-- Chart canvas -->
    <div
      ref="canvas"
      class="relative w-full select-none"
      :style="{ height: H + 'px' }"
      @pointermove="onMove"
      @pointerleave="hoverIdx = null"
    >
      <!-- Loading skeleton -->
      <div v-if="loading" class="absolute inset-0 rounded-xl bg-[#0f1117] animate-pulse" />

      <!-- Empty / not enough data -->
      <div
        v-else-if="points.length < 2"
        class="absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <p class="text-sm text-slate-400 font-medium">Not enough history yet</p>
        <p class="text-xs text-slate-600 mt-1">Your value chart fills in as prices are recorded.</p>
      </div>

      <!-- The chart -->
      <template v-else>
        <svg
          :width="W" :height="H"
          class="block overflow-visible"
          role="img"
          :aria-label="ariaSummary"
        >
          <defs>
            <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="lineColor" stop-opacity="0.18" />
              <stop offset="100%" :stop-color="lineColor" stop-opacity="0" />
            </linearGradient>
          </defs>

          <!-- Horizontal gridlines -->
          <line
            v-for="(gy, i) in gridY" :key="i"
            x1="0" :x2="W" :y1="gy" :y2="gy"
            stroke="#22263a" stroke-width="1"
          />

          <!-- Area + line -->
          <path :d="areaPath" :fill="`url(#${gradId})`" />
          <path
            ref="lineEl"
            :d="linePath"
            fill="none"
            :stroke="lineColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="{ 'draw-in': animate }"
          />

          <!-- Hover guide + marker -->
          <g v-if="hovered">
            <line
              :x1="hovered.x" :x2="hovered.x" y1="0" :y2="H - PAD_B"
              stroke="#2e3348" stroke-width="1" stroke-dasharray="3 3"
            />
            <circle :cx="hovered.x" :cy="hovered.y" r="6" :fill="lineColor" fill-opacity="0.18" />
            <circle :cx="hovered.x" :cy="hovered.y" r="3.5" :fill="lineColor" />
          </g>
        </svg>

        <!-- X-axis labels (HTML so they never distort) -->
        <div class="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-slate-600 tabular-nums">
          <span v-for="(tick, i) in xTicks" :key="i">{{ tick }}</span>
        </div>

        <!-- Floating tooltip -->
        <div
          v-if="hovered"
          class="absolute -translate-x-1/2 -translate-y-full pointer-events-none
                 bg-[#22263a] border border-[#2e3348] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          :style="{ left: tooltipX + 'px', top: (hovered.y - 12) + 'px' }"
        >
          <p class="text-xs font-semibold text-white tabular-nums">{{ fmt(hovered.value) }}</p>
          <p class="text-[10px] text-slate-500">{{ fmtTime(hovered.t, true) }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import { buildPortfolioSeries } from '@/lib/portfolioSeries'

const store = usePortfolioStore()

// Layout constants (pixel space — no viewBox scaling, so strokes stay crisp).
const H = 220
const PAD_T = 14
const PAD_B = 22
const W = ref(600)

const ranges = [
  { key: '1D', ms: 24 * 3600e3 },
  { key: '1W', ms: 7 * 24 * 3600e3 },
  { key: '1M', ms: 30 * 24 * 3600e3 },
  { key: 'All', ms: null },
]
const range = ref('1D')
const rangeLabel = computed(() => ({ '1D': 'Past 24 hours', '1W': 'Past week', '1M': 'Past month', All: 'All time' }[range.value]))

const rawRows = ref([])
const loading = ref(true)
const hoverIdx = ref(null)

const gradId = `pv-grad-${Math.random().toString(36).slice(2, 7)}`

// Respect reduced-motion for the line-draw animation.
const prefersReduced = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const animate = ref(false)

// --- Data ------------------------------------------------------------------

const series = computed(() => {
  const r = ranges.find((x) => x.key === range.value)
  const sinceMs = r?.ms ? Date.now() - r.ms : null
  return buildPortfolioSeries(store.holdingsWithSnapshot, rawRows.value, {
    displayCurrency: store.displayCurrency,
    sinceMs,
    fxFallback: store.fxRate,
    targetPoints: Math.min(120, Math.max(30, Math.floor(W.value / 9))),
  })
})

const sinceLabel = computed(() => {
  if (!rawRows.value.length) return '—'
  return fmtTime(new Date(rawRows.value[0].fetched_at).getTime(), false)
})

// --- Geometry --------------------------------------------------------------

const bounds = computed(() => {
  const vals = series.value.map((d) => d.value)
  if (!vals.length) return { min: 0, max: 1 }
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) { min -= 1; max += 1 }
  const pad = (max - min) * 0.12
  return { min: min - pad, max: max + pad }
})

const points = computed(() => {
  const s = series.value
  if (s.length < 2) return []
  const { min, max } = bounds.value
  const t0 = s[0].t
  const tN = s.at(-1).t
  const spanT = tN - t0 || 1
  const plotH = H - PAD_T - PAD_B
  return s.map((d) => ({
    t: d.t,
    value: d.value,
    x: ((d.t - t0) / spanT) * W.value,
    y: PAD_T + (1 - (d.value - min) / (max - min)) * plotH,
  }))
})

const linePath = computed(() =>
  points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
)

const areaPath = computed(() => {
  const p = points.value
  if (p.length < 2) return ''
  const base = H - PAD_B
  return `${linePath.value} L${p.at(-1).x.toFixed(1)},${base} L${p[0].x.toFixed(1)},${base} Z`
})

const gridY = computed(() => {
  const plotH = H - PAD_T - PAD_B
  return [0, 0.5, 1].map((f) => PAD_T + f * plotH)
})

const lastValue = computed(() => series.value.at(-1)?.value ?? store.grandTotal.value)

const change = computed(() => {
  const s = series.value
  if (s.length < 2) return null
  const first = s[0].value
  const abs = s.at(-1).value - first
  const pct = first ? (abs / first) * 100 : 0
  return { abs, pct, positive: abs >= 0 }
})

const lineColor = computed(() => (change.value?.positive === false ? '#f87171' : '#0ea5e9'))

const hovered = computed(() => (hoverIdx.value == null ? null : points.value[hoverIdx.value] ?? null))

// Keep the tooltip from spilling past the canvas edges.
const tooltipX = computed(() => {
  if (!hovered.value) return 0
  return Math.min(Math.max(hovered.value.x, 52), W.value - 52)
})

const xTicks = computed(() => {
  const s = series.value
  if (s.length < 2) return []
  const idxs = [0, Math.floor(s.length / 2), s.length - 1]
  return idxs.map((i) => fmtTime(s[i].t, false))
})

const ariaSummary = computed(() => {
  if (!change.value) return 'Portfolio value chart'
  return `Portfolio value ${rangeLabel.value}: ${fmt(lastValue.value)}, ${change.value.positive ? 'up' : 'down'} ${change.value.pct.toFixed(1)} percent.`
})

// --- Interaction -----------------------------------------------------------

function onMove(e) {
  const pts = points.value
  if (pts.length < 2) return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  // Nearest point by x.
  let lo = 0, hi = pts.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].x < x) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(pts[lo - 1].x - x) < Math.abs(pts[lo].x - x)) lo--
  hoverIdx.value = lo
}

// --- Formatting ------------------------------------------------------------

function fmt(value) {
  const cur = store.displayCurrency
  if (cur === 'IDR') {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function fmtTime(ms, withTime) {
  const d = new Date(ms)
  const intraday = range.value === '1D'
  if (withTime) {
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  }
  if (intraday) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// --- Lifecycle -------------------------------------------------------------

let ro = null

function measure(el) {
  W.value = Math.max(240, Math.round(el.clientWidth))
}

const canvas = ref(null)

onMounted(async () => {
  if (canvas.value) {
    measure(canvas.value)
    ro = new ResizeObserver(() => canvas.value && measure(canvas.value))
    ro.observe(canvas.value)
  }
  rawRows.value = await store.fetchPriceHistory()
  loading.value = false
  if (!prefersReduced) {
    requestAnimationFrame(() => { animate.value = true })
  }
})

onUnmounted(() => ro?.disconnect())

// Replay the draw animation when the range changes.
watch(range, () => {
  if (prefersReduced) return
  animate.value = false
  requestAnimationFrame(() => requestAnimationFrame(() => { animate.value = true }))
})
</script>

<style scoped>
/* Line draws itself left→right on mount and range change. */
.draw-in {
  stroke-dasharray: var(--len, 2000);
  stroke-dashoffset: var(--len, 2000);
  animation: draw 0.7s ease forwards;
}
@keyframes draw {
  to { stroke-dashoffset: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .draw-in { animation: none; stroke-dasharray: none; stroke-dashoffset: 0; }
}
</style>
