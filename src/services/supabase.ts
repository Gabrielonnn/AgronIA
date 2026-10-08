import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController()
  const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const abortRequest = () => controller.abort()
  const timeoutId = setTimeout(abortRequest, 15000)

  requestSignal?.addEventListener('abort', abortRequest, { once: true })
  if (requestSignal?.aborted) abortRequest()

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
    requestSignal?.removeEventListener('abort', abortRequest)
  }
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchWithTimeout } })
  : null
