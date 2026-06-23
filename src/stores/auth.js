import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!session.value)

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
    })

    loading.value = false
  }

  async function sendMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
  }

  return { session, loading, isAuthenticated, init, sendMagicLink, signOut }
})
