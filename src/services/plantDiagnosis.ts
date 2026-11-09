export interface PlantDiagnosis {
  disease: string
  confidence: number
  cause?: string
  recommendation?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export async function diagnosePlantImage(endpoint: string, image: File): Promise<PlantDiagnosis> {
  const formData = new FormData()
  formData.append('file', image)

  const response = await fetch(endpoint, { method: 'POST', body: formData })
  if (!response.ok) {
    throw new Error(`El servicio de diagnóstico respondió con el estado ${response.status}.`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('El servicio de diagnóstico devolvió una respuesta que no es JSON válido.')
  }

  if (!isRecord(payload)) {
    throw new Error('La respuesta del servicio de diagnóstico no tiene el formato esperado.')
  }

  const { disease, confidence, cause, recommendation } = payload
  if (
    typeof disease !== 'string'
    || disease.trim().length === 0
    || typeof confidence !== 'number'
    || !Number.isFinite(confidence)
    || confidence < 0
    || confidence > 1
  ) {
    throw new Error('La respuesta debe incluir disease y confidence entre 0 y 1.')
  }

  if (cause !== undefined && typeof cause !== 'string') {
    throw new Error('El campo cause de la respuesta debe ser texto.')
  }
  if (recommendation !== undefined && typeof recommendation !== 'string') {
    throw new Error('El campo recommendation de la respuesta debe ser texto.')
  }

  return {
    disease: disease.trim(),
    confidence,
    ...(typeof cause === 'string' ? { cause } : {}),
    ...(typeof recommendation === 'string' ? { recommendation } : {})
  }
}
