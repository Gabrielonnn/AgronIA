import type { SimulationPresetId } from './multispectralPlantEngine'

export interface PlantDiagnosis {
  disease: string
  confidence: number
  cause?: string
  recommendation?: string
  engineMode?: string
  ndviMean?: number
  tempMeanC?: number
  cwsi?: number
  plantCoveragePercent?: number
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
    typeof disease !== 'string' ||
    disease.trim().length === 0 ||
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error('La respuesta debe incluir disease y confidence entre 0 y 1.')
  }

  if (cause !== undefined && cause !== null && typeof cause !== 'string') {
    throw new Error('El campo cause de la respuesta debe ser texto.')
  }
  if (recommendation !== undefined && recommendation !== null && typeof recommendation !== 'string') {
    throw new Error('El campo recommendation de la respuesta debe ser texto.')
  }

  return {
    disease: disease.trim(),
    confidence,
    ...(typeof cause === 'string' ? { cause } : {}),
    ...(typeof recommendation === 'string' ? { recommendation } : {})
  }
}

export async function analyzeMultispectralBackend(
  baseEndpoint: string,
  image: File,
  preset: SimulationPresetId,
  intensity: number,
  ambientTempC = 25.0
): Promise<PlantDiagnosis> {
  const multispectralUrl = baseEndpoint.replace(/\/predict\/?$/, '/analyze-multispectral')

  const formData = new FormData()
  formData.append('file', image)
  formData.append('preset', preset)
  formData.append('intensity', String(intensity))
  formData.append('ambient_temp_c', String(ambientTempC))

  try {
    const response = await fetch(multispectralUrl, { method: 'POST', body: formData })
    if (response.ok) {
      const payload: unknown = await response.json()
      if (
        isRecord(payload) &&
        typeof payload.disease === 'string' &&
        typeof payload.confidence === 'number'
      ) {
        return {
          disease: payload.disease.trim(),
          confidence: payload.confidence,
          ...(typeof payload.cause === 'string' ? { cause: payload.cause } : {}),
          ...(typeof payload.recommendation === 'string' ? { recommendation: payload.recommendation } : {}),
          ...(typeof payload.engine_mode === 'string' ? { engineMode: payload.engine_mode } : {}),
          ...(typeof payload.ndvi_mean === 'number' ? { ndviMean: payload.ndvi_mean } : {}),
          ...(typeof payload.temp_mean_c === 'number' ? { tempMeanC: payload.temp_mean_c } : {}),
          ...(typeof payload.cwsi === 'number' ? { cwsi: payload.cwsi } : {}),
          ...(typeof payload.plant_coverage_percent === 'number'
            ? { plantCoveragePercent: payload.plant_coverage_percent }
            : {})
        }
      }
    }
  } catch {
    // Fallback to standard /predict if /analyze-multispectral is not reachable
  }

  return diagnosePlantImage(baseEndpoint, image)
}
