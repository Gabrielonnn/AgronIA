import { defineStore } from 'pinia'
import { isSupabaseConfigured, supabase } from '../services/supabase'

export const useMainStore = defineStore('main', {
  state: () => ({
    user: null as any | null,
    loading: true,
    initialized: false,
    authError: '',
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

      const client = supabase
      try {
        const { data: { session }, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError

        if (session?.user) {
          const { data: profile, error: profileError } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          if (profileError) throw profileError
          if (profile?.active) {
            this.user = { ...session.user, profile }
          } else {
            await client.auth.signOut()
            this.user = null
          }
        } else {
          this.user = null
        }
      } catch (error) {
        this.authError = error instanceof Error
          ? `No se pudo validar la sesión con Supabase: ${error.message}`
          : 'No se pudo validar la sesión con Supabase.'
        this.user = null
      } finally {
        this.loading = false
        this.initialized = true
      }
      
      client.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          try {
            const { data: profile, error: profileError } = await client
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            if (profileError) throw profileError
            if (!profile?.active) {
              await client.auth.signOut()
              this.user = null
              return
            }
            this.authError = ''
            this.user = { ...session.user, profile }
            const { error: logError } = await client
              .from('user_logs')
              .insert([{ user_id: this.user.id, action: 'LOGIN' }])
            if (logError) console.error('No se pudo registrar el inicio de sesión:', logError.message)
          } catch (error) {
            this.authError = error instanceof Error
              ? `No se pudo cargar el perfil de Supabase: ${error.message}`
              : 'No se pudo cargar el perfil de Supabase.'
            this.user = null
          }
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

      if (this.initialized && this.user?.profile) {
        this.loading = false
        return
      }

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!session?.user) {
          this.user = null
          return
        }
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        if (profileError) throw profileError
        if (!profile?.active) {
          await supabase.auth.signOut()
          this.user = null
          return
        }
        this.user = { ...session.user, profile }
        this.authError = ''
      } catch (error) {
        this.authError = error instanceof Error
          ? `No se pudo validar la sesión con Supabase: ${error.message}`
          : 'No se pudo validar la sesión con Supabase.'
        this.user = null
      } finally {
        this.loading = false
      }
    },

    async signOut() {
      if (!isSupabaseConfigured || !supabase) {
        this.user = null
        return
      }

      if (this.user) {
        const { error: logError } = await supabase
          .from('user_logs')
          .insert([{ user_id: this.user.id, action: 'LOGOUT' }])
        if (logError) console.error('No se pudo registrar el cierre de sesión:', logError.message)
      }
      const { error } = await supabase.auth.signOut()
      if (error) throw new Error(`No se pudo cerrar la sesión: ${error.message}`)
      this.user = null
    }
  }
})