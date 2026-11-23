import { createClient } from '@supabase/supabase-js'

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://njakkhbrjkpraqubzviw.supabase.co'
const DEFAULT_PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qYWtraGJyamtwcmFxdWJ6dml3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNzg0NzksImV4cCI6MjEwNDc1NDQ3OX0.c0eyoBPgQ1ktN1wofAyn1GPzrDLFEGasYV3dacK9wLw'

const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const envKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim()

const supabaseUrl =
  envUrl && !envUrl.includes('your-project.supabase.co')
    ? envUrl
    : DEFAULT_PUBLIC_SUPABASE_URL

const supabaseAnonKey =
  envKey && !envKey.includes('your-supabase-publishable')
    ? envKey
    : DEFAULT_PUBLIC_SUPABASE_ANON_KEY

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
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'agronia-desktop-supabase-auth',
      },
      global: { fetch: fetchWithTimeout },
    })
  : null

