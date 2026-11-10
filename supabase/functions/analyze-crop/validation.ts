const categories = new Set([
  'plaga',
  'enfermedad',
  'estres_hidrico',
  'deficiencia_nutricional',
  'otro',
])
const severities = new Set(['baja', 'media', 'alta', 'incierta'])

export const parseModelContent = (content: unknown): Record<string, unknown> => {
  if (typeof content !== 'string') throw new Error('El modelo devolvió una respuesta vacía.')
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('El modelo no devolvió un resultado JSON válido.')
  const result: unknown = JSON.parse(cleaned.slice(start, end + 1))
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('El modelo no devolvió un objeto JSON.')
  }
  return result as Record<string, unknown>
}

export const validateModelResult = (result: Record<string, unknown>) => {
  if (
    typeof result.summary !== 'string'
    || result.summary.trim().length === 0
    || result.summary.length > 1000
    || !['buena', 'limitada', 'insuficiente'].includes(String(result.imageQuality))
    || !Array.isArray(result.detections)
    || result.detections.length > 20
  ) {
    throw new Error('El modelo devolvió un resultado incompleto o fuera de formato.')
  }

  const detections = result.detections.map(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('El modelo devolvió un hallazgo inválido.')
    }

    const detection = item as Record<string, unknown>
    if (
      typeof detection.category !== 'string'
      || !categories.has(detection.category)
      || typeof detection.severity !== 'string'
      || !severities.has(detection.severity)
      || typeof detection.label !== 'string'
      || detection.label.trim().length === 0
      || detection.label.length > 100
      || typeof detection.evidence !== 'string'
      || detection.evidence.trim().length === 0
      || detection.evidence.length > 500
      || typeof detection.recommendation !== 'string'
      || detection.recommendation.trim().length === 0
      || detection.recommendation.length > 500
      || typeof detection.confidence !== 'number'
      || !Number.isFinite(detection.confidence)
      || detection.confidence < 0
      || detection.confidence > 1
    ) {
      throw new Error('El modelo devolvió un hallazgo incompleto o fuera de formato.')
    }

    return {
      category: detection.category,
      label: detection.label.trim(),
      severity: detection.severity,
      confidence: detection.confidence,
      evidence: detection.evidence.trim(),
      recommendation: detection.recommendation.trim(),
    }
  })

  return {
    summary: result.summary.trim(),
    imageQuality: result.imageQuality,
    detections,
  }
}
