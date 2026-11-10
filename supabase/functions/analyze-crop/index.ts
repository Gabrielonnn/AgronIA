import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseModelContent, validateModelResult } from './validation.ts'

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

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const supportedCrops = new Set(['sin especificar', 'maíz', 'frijol', 'aguacate', 'jitomate', 'otro'])
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization || !supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Se requiere una sesión válida de AgronIA.' }, 401)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'La sesión expiró. Inicia sesión de nuevo.' }, 401)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('active')
    .eq('id', user.id)
    .single()
  if (profileError || !profile?.active) {
    return jsonResponse({ error: 'La cuenta no tiene acceso activo al análisis.' }, 403)
  }

  const apiUrl = Deno.env.get('AGRONIA_AI_API_URL')
  const apiKey = Deno.env.get('AGRONIA_AI_API_KEY')
  const model = Deno.env.get('AGRONIA_AI_MODEL')
  if (!apiUrl || !apiKey || !model) {
    return jsonResponse({ error: 'La función de IA aún no está configurada por el administrador.' }, 503)
  }
  try {
    if (new URL(apiUrl).protocol !== 'https:') throw new Error('HTTPS requerido')
  } catch {
    return jsonResponse({ error: 'La URL del proveedor debe ser HTTPS y válida.' }, 503)
  }

  let body: { image?: unknown; crop?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'La solicitud debe contener JSON válido.' }, 400)
  }
  if (typeof body.image !== 'string' || typeof body.crop !== 'string' || !supportedCrops.has(body.crop)) {
    return jsonResponse({ error: 'La imagen o el tipo de cultivo no son válidos.' }, 400)
  }

  const imageMatch = body.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!imageMatch || !imageMimeTypes.has(imageMatch[1])) {
    return jsonResponse({ error: 'La imagen debe ser JPG, PNG o WebP.' }, 400)
  }
  const imageBytes = Math.floor(imageMatch[2].length * 3 / 4)
  if (imageBytes === 0 || imageBytes > 3 * 1024 * 1024) {
    return jsonResponse({ error: 'La imagen optimizada excede el límite de 3 MB.' }, 413)
  }

  const { data: quotaReserved, error: quotaError } = await supabase.rpc('reserve_crop_analysis_request')
  if (quotaError) {
    console.error('No se pudo validar el límite de análisis:', quotaError.message)
    return jsonResponse({ error: 'No se pudo validar el límite de uso del análisis. Contacta al administrador.' }, 503)
  }
  if (!quotaReserved) {
    return jsonResponse({ error: 'Alcanzaste el límite de 20 análisis por día. Inténtalo mañana.' }, 429)
  }

  const prompt = `Analiza esta imagen de ${body.crop} para asistencia de observación agrícola. Responde exclusivamente con JSON válido, sin markdown, con este esquema: {"summary":"resumen prudente","imageQuality":"buena|limitada|insuficiente","detections":[{"category":"plaga|enfermedad|estres_hidrico|deficiencia_nutricional|otro","label":"posible señal","severity":"baja|media|alta|incierta","confidence":0.0,"evidence":"rasgo visible concreto","recommendation":"siguiente paso verificable y seguro"}]}. No inventes organismos, patógenos, causas, coordenadas ni mediciones. Separa observación de hipótesis, usa severidad incierta y baja confianza si la imagen no permite distinguir. Si no hay señal visible, devuelve detections vacío. Recomienda inspección y confirmación con especialista; no prescribas pesticidas, dosis ni tratamientos químicos.`

  let providerResponse: Response
  try {
    providerResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: ['Bearer', apiKey].join(' '),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: body.image } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(45_000),
    })
  } catch {
    return jsonResponse({ error: 'No se pudo conectar con el proveedor de visión. Inténtalo más tarde.' }, 502)
  }

  if (!providerResponse.ok) {
    console.error(`Proveedor de IA respondió HTTP ${providerResponse.status}.`)
    return jsonResponse({ error: 'El servicio de visión rechazó el análisis. Revisa la configuración del proveedor.' }, 502)
  }

  try {
    const providerBody = await providerResponse.json()
    const content = providerBody?.choices?.[0]?.message?.content
    return jsonResponse(validateModelResult(parseModelContent(content)))
  } catch (error) {
    console.error('Respuesta inválida del proveedor de visión:', error)
    return jsonResponse({ error: 'El servicio de visión devolvió una respuesta que no se pudo validar.' }, 502)
  }
})
