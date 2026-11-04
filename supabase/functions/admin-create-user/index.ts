import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authorization || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'No se pudo validar la configuración segura de Supabase.' }, 503)
  }

  const sessionClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'La sesión expiró. Inicia sesión de nuevo.' }, 401)

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles')
    .select('role,active')
    .eq('id', user.id)
    .single()
  if (profileError || profile?.role !== 'administrador' || !profile.active) {
    return jsonResponse({ error: 'Solo un administrador activo puede invitar usuarios.' }, 403)
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return jsonResponse({ error: 'La solicitud excede el tamaño permitido.' }, 413)
  }

  let body: { email?: unknown; fullName?: unknown; role?: unknown }
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 8192) {
      return jsonResponse({ error: 'La solicitud excede el tamaño permitido.' }, 413)
    }
    body = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'La solicitud debe contener JSON válido.' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const role = body.role
  if (
    email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || fullName.length < 2
    || fullName.length > 120
    || (role !== 'cliente' && role !== 'tecnico')
  ) {
    return jsonResponse({ error: 'Revisa el correo, nombre y rol del usuario invitado.' }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { name: fullName },
  })
  if (inviteError) {
    return jsonResponse({
      error: inviteError.message.includes('already been registered')
        ? 'Este correo ya está registrado en AgronIA.'
        : 'No se pudo enviar la invitación. Verifica la configuración de correo de Supabase.',
    }, 400)
  }
  if (!invited.user) {
    return jsonResponse({ error: 'Supabase no devolvió el usuario invitado.' }, 502)
  }

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ full_name: fullName, role, status: 'pendiente', active: false })
    .eq('id', invited.user.id)
  if (updateError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(invited.user.id)
    console.error('No se pudo guardar el perfil de la invitación:', updateError.message)
    if (cleanupError) {
      console.error('Tampoco se pudo cancelar la invitación incompleta:', cleanupError.message)
    }
    return jsonResponse({ error: 'Se envió la invitación, pero no se pudo preparar el perfil. Contacta al administrador.' }, 500)
  }

  return jsonResponse({ invited: true })
})
