import type { SimulationPresetId } from './multispectralPlantEngine'

export interface DetectedPlantBox {
  id: number
  label: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
  foliage_box?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface AgroVisionTopPrediction {
  class_name: string
  confidence: number
  confidence_pct: number
}

export interface AgroVisionLensInfo {
  plant_name: string
  scientific_name: string
  confidence_pct: number
  light: string
  water: string
  soil_temp: string
  care: string
  wiki_summary: string
  visual_health_status: string
  visual_severity: string
  visual_diagnosis_es: string
  visual_action_es: string
  source: string
}

export interface AgroVisionAnalysis {
  detection_mode: 'IN_DATASET' | 'OUT_OF_DATASET' | 'NO_PLANT'
  in_trained_dataset: boolean
  disease: string
  confidence: number
  health_status: string
  crop: string
  disease_es: string
  cause: string
  recommendation: string
  severity: string
  top_k: AgroVisionTopPrediction[]
  detected_plants: DetectedPlantBox[]
  selected_plant_id: number
  lens: AgroVisionLensInfo | null
  inference_time_ms: number
  fps_equivalent: number
  engine_mode: string
  ndvi_mean: number
  temp_mean_c: number
  cwsi: number
  plant_coverage_percent: number
}

export interface AgroVisionHealthStatus {
  status: string
  onnx_ready?: boolean
  yolo_ready?: boolean
  clip_ready?: boolean
  classes?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function resolveDiagnosisBaseUrl(configuredEndpoint?: string): string {
  const trimmed = (configuredEndpoint || '').trim()
  if (trimmed) {
    return trimmed.replace(/\/(predict|analyze-multispectral|analyze-agrovision|health)\/?$/, '')
  }
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:8000'
  }
  return ''
}

export async function checkAgroVisionHealth(baseUrl: string): Promise<AgroVisionHealthStatus | null> {
  if (!baseUrl) return null
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 2500)
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal })
    window.clearTimeout(timer)
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (isRecord(data) && typeof data.status === 'string') {
      return data as unknown as AgroVisionHealthStatus
    }
    return null
  } catch {
    return null
  }
}

export interface AnalyzeAgroVisionOptions {
  selectedPlantId?: number | null
  cropBox?: { x: number; y: number; width: number; height: number } | null
  detectPlants?: boolean
  forceLens?: boolean
  preset?: SimulationPresetId
  intensity?: number
  ambientTempC?: number
}

export async function analyzeAgroVisionBackend(
  baseUrl: string,
  image: File,
  options: AnalyzeAgroVisionOptions = {}
): Promise<AgroVisionAnalysis> {
  if (!baseUrl) {
    throw new Error('URL del servidor AgroVision AI no configurada.')
  }

  const formData = new FormData()
  formData.append('file', image)
  if (options.selectedPlantId !== undefined && options.selectedPlantId !== null) {
    formData.append('selected_plant_id', String(options.selectedPlantId))
  }
  if (options.cropBox) {
    formData.append('crop_x', String(options.cropBox.x))
    formData.append('crop_y', String(options.cropBox.y))
    formData.append('crop_w', String(options.cropBox.width))
    formData.append('crop_h', String(options.cropBox.height))
  }
  formData.append('detect_plants', String(options.detectPlants ?? true))
  formData.append('force_lens', String(options.forceLens ?? false))
  formData.append('preset', options.preset ?? 'live_raw')
  formData.append('intensity', String(options.intensity ?? 0.85))
  formData.append('ambient_temp_c', String(options.ambientTempC ?? 25.0))

  const response = await fetch(`${baseUrl}/analyze-agrovision`, {
    method: 'POST',
    body: formData
  })
  if (!response.ok) {
    throw new Error(`El motor AgroVision AI respondió con el estado ${response.status}.`)
  }
  const payload = (await response.json()) as AgroVisionAnalysis
  return payload
}
