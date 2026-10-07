import { defineStore } from 'pinia'
import { isSupabaseConfigured, supabase } from '../services/supabase'

export const useMainStore = defineStore('main', {
  state: () => ({
    user: null as any | null,
    loading: true,
    initialized: false,
  }),
  actions: {
    setUser(user: any) {
      this.user = user
    },

    async init() {
      if (this.initialized) return

      if (!isSupabaseConfigured || !supabase) {
        this.user = null
        this.loading = false
        this.initialized = true
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      this.user = session?.user || null
      this.loading = false
      this.initialized = true

      supabase.auth.onAuthStateChange((_event, session) => {
        this.user = session?.user || null
      })
    },

    async checkAuth() {
      if (!isSupabaseConfigured || !supabase) {
        this.user = null
        this.loading = false
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      this.user = session?.user || null
      this.loading = false
    },

    async signOut() {
      if (!isSupabaseConfigured || !supabase) {
        this.user = null
        return
      }

      await supabase.auth.signOut()
      this.user = null
    }
  }
})