<template>
  <!-- Login layout — fullscreen, no sidebar -->
  <RouterView v-if="route.meta.public" />

  <!-- App layout — sidebar + main -->
  <div v-else class="flex min-h-screen">
    <AppSidebar :refreshing="refreshing" @refresh="handleRefresh" />

    <main class="flex-1 ml-16 lg:ml-56 min-h-screen">
      <div class="max-w-6xl mx-auto px-4 py-8 lg:px-8">
        <RouterView v-slot="{ Component, route: r }">
          <Transition name="fade">
            <component :is="Component" :key="r.path" />
          </Transition>
        </RouterView>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { usePortfolioStore } from '@/stores/portfolio'

const route = useRoute()

const store = usePortfolioStore()
const refreshing = ref(false)

// Manual refresh: always forces a live price sync.
async function handleRefresh() {
  refreshing.value = true
  await store.refreshAll({ force: true })
  refreshing.value = false
}

// Background auto-poll: every 10 min, top up prices *only if stale* and *only
// while the tab is visible*. This is the "every 5–15 min" behaviour without
// the cost of real-time streaming. Hidden tab = no requests.
const POLL_MS = 10 * 60 * 1000
let pollId = null

function tick() {
  if (document.visibilityState === 'visible') {
    store.refreshPrices({ force: false })
  }
}

onMounted(() => {
  pollId = setInterval(tick, POLL_MS)
  // Coming back to the tab after a while should also catch up.
  document.addEventListener('visibilitychange', tick)
})

onUnmounted(() => {
  if (pollId) clearInterval(pollId)
  document.removeEventListener('visibilitychange', tick)
})
</script>

<style>
/* Enter-only fade: the leaving view is removed instantly while the new one
   fades in. No out-in waiting, so the transition can never get stuck on a
   comment node (which previously blanked the page on back-navigation). */
.fade-enter-active { transition: opacity 0.18s ease; }
.fade-enter-from { opacity: 0; }
</style>
