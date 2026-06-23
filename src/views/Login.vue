<template>
  <div class="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <!-- Logo / Brand -->
      <div class="mb-8 text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 mb-4">
          <svg class="w-6 h-6 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <h1 class="text-white text-xl font-semibold tracking-tight">PortfolioHQ</h1>
        <p class="text-slate-500 text-sm mt-1">Personal investment dashboard</p>
      </div>

      <!-- Card -->
      <div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-6">
        <!-- Sent state -->
        <Transition name="fade-slide" mode="out-in">
          <div v-if="sent" key="sent" class="text-center py-2">
            <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 mb-4">
              <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 class="text-white font-medium mb-1">Check your email</h2>
            <p class="text-slate-400 text-sm leading-relaxed">
              Magic link sent to<br />
              <span class="text-sky-400">{{ email }}</span>
            </p>
            <button
              @click="reset"
              class="mt-5 text-xs text-slate-500 hover:text-slate-300 transition-colors duration-150 underline underline-offset-2"
            >
              Use a different email
            </button>
          </div>

          <!-- Form state -->
          <div v-else key="form">
            <h2 class="text-white font-medium mb-1">Sign in</h2>
            <p class="text-slate-400 text-sm mb-5">We'll send a magic link to your email.</p>

            <form @submit.prevent="handleSubmit" class="space-y-4">
              <div>
                <label class="block text-xs text-slate-400 mb-1.5 font-medium">Email address</label>
                <input
                  v-model="email"
                  type="email"
                  required
                  autocomplete="email"
                  placeholder="you@example.com"
                  class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-600
                         focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30
                         transition-colors duration-150"
                />
              </div>

              <button
                type="submit"
                :disabled="loading"
                class="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed
                       text-white text-sm font-medium rounded-lg px-4 py-2.5
                       transition-all duration-150 active:scale-[0.98]
                       flex items-center justify-center gap-2"
              >
                <svg v-if="loading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ loading ? 'Sending…' : 'Send magic link' }}
              </button>

              <p v-if="errorMsg" class="text-red-400 text-xs text-center">{{ errorMsg }}</p>
            </form>
          </div>
        </Transition>
      </div>

      <p class="text-center text-slate-600 text-xs mt-6">Private access only</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const errorMsg = ref('')

async function handleSubmit() {
  errorMsg.value = ''
  loading.value = true
  try {
    await auth.sendMagicLink(email.value)
    sent.value = true
  } catch (err) {
    errorMsg.value = err.message ?? 'Something went wrong. Try again.'
  } finally {
    loading.value = false
  }
}

function reset() {
  sent.value = false
  email.value = ''
  errorMsg.value = ''
}
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
