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
      
      if (session?.user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        if (profile && profile.active) {
          this.user = { ...session.user, profile }
        } else {
          await supabase.auth.signOut()
          this.user = null
        }
      } else {
        this.user = null
      }
      this.loading = false
      this.initialized = true
      
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
          if (profile && !profile.active) {
            await supabase.auth.signOut()
            this.user = null
            return
          }
          this.user = { ...session.user, profile }
          await supabase.from('user_logs').insert([{ user_id: this.user.id, action: 'LOGIN' }])
        } else if (event === 'SIGNED_OUT') {
          this.user = null
        }
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

      if (this.user) {
        await supabase.from('user_logs').insert([{ user_id: this.user.id, action: 'LOGOUT' }])
      }
      await supabase.auth.signOut()
      this.user = null
    }
  }
})