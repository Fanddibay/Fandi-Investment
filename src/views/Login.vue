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
        <h2 class="text-white font-medium mb-1">Sign in</h2>
        <p class="text-slate-400 text-sm mb-5">Enter your email and password to continue.</p>

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

          <div>
            <label class="block text-xs text-slate-400 mb-1.5 font-medium">Password</label>
            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="••••••••"
                class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3.5 py-2.5 pr-10 text-sm text-white placeholder-slate-600
                       focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30
                       transition-colors duration-150"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 transition-colors duration-150"
              >
                <svg v-if="showPassword" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </div>
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
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>

          <Transition name="fade">
            <p v-if="errorMsg" class="text-red-400 text-xs text-center">{{ errorMsg }}</p>
          </Transition>
        </form>
      </div>

      <p class="text-center text-slate-600 text-xs mt-6">Private access only</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMsg = ref('')

async function handleSubmit() {
  errorMsg.value = ''
  loading.value = true
  try {
    await auth.signIn(email.value, password.value)
    router.push('/')
  } catch (err) {
    errorMsg.value = friendlyError(err)
  } finally {
    loading.value = false
  }
}

// Map Supabase auth errors to clear, recoverable messages (error-clarity).
function friendlyError(err) {
  const msg = err?.message ?? ''
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.'
  if (/email not confirmed/i.test(msg)) return 'This account needs to be confirmed in Supabase first.'
  return msg || 'Something went wrong. Try again.'
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
