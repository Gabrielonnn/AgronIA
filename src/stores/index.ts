import { defineStore } from 'pinia'
import { supabase } from '../services/supabase'

export const useMainStore = defineStore('main', {
  state: () => ({
    user: null as any | null,
    loading: true,
  }),
  actions: {
    setUser(user: any) {
      this.user = user
    },
    async checkAuth() {
      this.loading = true
      const { data: { session } } = await supabase.auth.getSession()
      this.user = session?.user || null
      this.loading = false
      
      supabase.auth.onAuthStateChange((_event, session) => {
        this.user = session?.user || null
      })
    },
    async signOut() {
      await supabase.auth.signOut()
      this.user = null
    }
  }
})
