<template>
  <div v-if="total > 1" class="mt-8 space-y-3">
    <!-- Page controls -->
    <div class="flex items-center justify-center gap-1.5 flex-wrap">
      <button
        @click="emit('change', page - 1)"
        :disabled="page === 1"
        class="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#2e3348] text-slate-400
               text-xs font-medium hover:border-slate-500 transition-all duration-200
               disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Prev
      </button>

      <template v-for="(p, i) in displayedPages" :key="i">
        <span v-if="p === '...'" class="w-8 text-center text-slate-600 text-xs select-none">…</span>
        <button
          v-else
          @click="emit('change', p)"
          class="w-8 h-8 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 border"
          :class="
            p === page
              ? 'border-sky-500 bg-sky-500/10 text-sky-400'
              : 'border-[#2e3348] text-slate-400 hover:border-slate-500'
          "
        >
          {{ p }}
        </button>
      </template>

      <button
        @click="emit('change', page + 1)"
        :disabled="page === total"
        class="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#2e3348] text-slate-400
               text-xs font-medium hover:border-slate-500 transition-all duration-200
               disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
      >
        Next
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <!-- Range info + page size selector -->
    <div class="flex items-center justify-center gap-4">
      <p class="text-xs text-slate-500">
        {{ rangeStart }}–{{ rangeEnd }} of {{ totalItems }} articles
      </p>
      <select
        :value="pageSize"
        @change="emit('pageSizeChange', Number($event.target.value))"
        class="bg-[#0f1117] border border-[#2e3348] rounded-lg px-2 py-1 text-xs text-slate-400
               focus:border-sky-500 focus:outline-none transition-colors cursor-pointer"
      >
        <option v-for="s in PAGE_SIZES" :key="s" :value="s">{{ s }} / page</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const PAGE_SIZES = [10, 15, 20, 30]

const props = defineProps({
  page: { type: Number, required: true },
  total: { type: Number, required: true },
  totalItems: { type: Number, required: true },
  pageSize: { type: Number, required: true },
})

const emit = defineEmits(['change', 'pageSizeChange'])

const rangeStart = computed(() => Math.min((props.page - 1) * props.pageSize + 1, props.totalItems))
const rangeEnd = computed(() => Math.min(props.page * props.pageSize, props.totalItems))

// Show first 2, last 2, and ±1 around current page. Gaps become '...'.
const displayedPages = computed(() => {
  const { total, page } = props
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const visible = new Set([1, 2, page - 1, page, page + 1, total - 1, total])
  const sorted = [...visible].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)

  const result = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) result.push('...')
    result.push(p)
    prev = p
  }
  return result
})
</script>
