import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!session.value)
  // Role lives in Supabase user_metadata ({ "role": "admin" | "user" }).
  // Defaults to 'user' so role checks are safe before metadata is set.
  const role = computed(() => session.value?.user?.user_metadata?.role ?? 'user')
  const isAdmin = computed(() => role.value === 'admin')

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
    })

    loading.value = false
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
  }

  return { session, loading, isAuthenticated, role, isAdmin, init, signIn, signOut }
})
