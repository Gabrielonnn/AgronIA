import { supabase } from './supabase'
import { parseCropAnalysis, type CropAnalysisResult } from './cropAnalysisValidation'

export { parseCropAnalysis }
export type { CropAnalysisResult } from './cropAnalysisValidation'

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxUploadBytes = 15 * 1024 * 1024

export const prepareCropImage = async (file: File): Promise<string> => {
  if (!imageTypes.has(file.type)) {
    throw new Error('Elige una imagen JPG, PNG o WebP.')
  }
  if (file.size === 0 || file.size > maxUploadBytes) {
    throw new Error('La imagen debe pesar menos de 15 MB.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con otro archivo.')
  }

  try {
    const maxDimension = 1600
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la imagen para el análisis.')

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const image = canvas.toDataURL('image/jpeg', 0.82)
    if (image.length > 4_200_000) {
      throw new Error('La imagen optimizada excede el límite de 3 MB. Elige otra imagen.')
    }
    return image
  } finally {
    bitmap.close()
  }
}

export const analyzeCropImage = async (
  image: string,
  crop: string,
): Promise<CropAnalysisResult> => {
  if (!supabase) {
    throw new Error('Configura Supabase y despliega la función de análisis antes de solicitar un diagnóstico.')
  }

  const { data, error } = await supabase.functions.invoke('analyze-crop', {
    body: { image, crop },
  })

  if (error) {
    const context = error.context
    if (context instanceof Response) {
      const body = await context.json().catch(() => null) as { error?: unknown } | null
      if (typeof body?.error === 'string') throw new Error(body.error)
    }
    throw new Error(error.message || 'No se pudo completar el análisis de imagen.')
  }

  return parseCropAnalysis(data)
}
