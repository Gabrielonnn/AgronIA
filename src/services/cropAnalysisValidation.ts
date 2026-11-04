export type CropIssueCategory =
  | 'plaga'
  | 'enfermedad'
  | 'estres_hidrico'
  | 'deficiencia_nutricional'
  | 'otro'

export type CropIssueSeverity = 'baja' | 'media' | 'alta' | 'incierta'

export interface CropDetection {
  category: CropIssueCategory
  label: string
  severity: CropIssueSeverity
  confidence: number
  evidence: string
  recommendation: string
}

export interface CropAnalysisResult {
  summary: string
  imageQuality: 'buena' | 'limitada' | 'insuficiente'
  detections: CropDetection[]
}

const categories = new Set<CropIssueCategory>([
  'plaga',
  'enfermedad',
  'estres_hidrico',
  'deficiencia_nutricional',
  'otro',
])
const severities = new Set<CropIssueSeverity>(['baja', 'media', 'alta', 'incierta'])

const readText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`La respuesta de IA contiene un campo "${field}" inválido.`)
  }
  return value.trim()
}

export const parseCropAnalysis = (value: unknown): CropAnalysisResult => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('La respuesta del análisis no tiene el formato esperado.')
  }

  const result = value as Record<string, unknown>
  if (!['buena', 'limitada', 'insuficiente'].includes(String(result.imageQuality))) {
    throw new Error('La respuesta de IA contiene una calidad de imagen inválida.')
  }
  if (!Array.isArray(result.detections) || result.detections.length > 20) {
    throw new Error('La respuesta de IA contiene una lista de hallazgos inválida.')
  }

  const detections = result.detections.map((item): CropDetection => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('La respuesta de IA contiene un hallazgo inválido.')
    }

    const detection = item as Record<string, unknown>
    if (!categories.has(detection.category as CropIssueCategory)) {
      throw new Error('La respuesta de IA contiene una categoría desconocida.')
    }
    if (!severities.has(detection.severity as CropIssueSeverity)) {
      throw new Error('La respuesta de IA contiene una severidad desconocida.')
    }
    if (
      typeof detection.confidence !== 'number'
      || !Number.isFinite(detection.confidence)
      || detection.confidence < 0
      || detection.confidence > 1
    ) {
      throw new Error('La respuesta de IA contiene una confianza fuera de rango.')
    }

    return {
      category: detection.category as CropIssueCategory,
      label: readText(detection.label, 'label', 100),
      severity: detection.severity as CropIssueSeverity,
      confidence: detection.confidence,
      evidence: readText(detection.evidence, 'evidence', 500),
      recommendation: readText(detection.recommendation, 'recommendation', 500),
    }
  })

  return {
    summary: readText(result.summary, 'summary', 1000),
    imageQuality: result.imageQuality as CropAnalysisResult['imageQuality'],
    detections,
  }
}
