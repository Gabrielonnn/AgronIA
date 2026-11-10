import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCropAnalysis } from '../../src/services/cropAnalysisValidation.ts'
import {
  parseModelContent,
  validateModelResult,
} from '../../supabase/functions/analyze-crop/validation.ts'

const validResult = {
  summary: 'Se observa una zona con amarillamiento en algunas hojas.',
  imageQuality: 'buena',
  detections: [{
    category: 'estres_hidrico',
    label: 'Posible estrés hídrico',
    severity: 'media',
    confidence: 0.74,
    evidence: 'Hojas con curvatura y pérdida de turgencia.',
    recommendation: 'Revisa la humedad del suelo y compara plantas cercanas.',
  }],
}

test('accepts a valid crop analysis and retains its findings', () => {
  assert.deepEqual(parseCropAnalysis(validResult), validResult)
})

test('accepts an empty detection list without inventing a diagnosis', () => {
  const result = parseCropAnalysis({
    summary: 'No se aprecian señales concluyentes en esta toma.',
    imageQuality: 'limitada',
    detections: [],
  })
  assert.equal(result.detections.length, 0)
  assert.equal(result.imageQuality, 'limitada')
})

test('rejects unknown categories, invalid confidence, and malformed payloads', () => {
  assert.throws(() => parseCropAnalysis({ ...validResult, detections: [{ ...validResult.detections[0], category: 'certeza' }] }), /categoría desconocida/)
  assert.throws(() => parseCropAnalysis({ ...validResult, detections: [{ ...validResult.detections[0], confidence: 1.1 }] }), /confianza fuera de rango/)
  assert.throws(() => parseCropAnalysis({ ...validResult, detections: 'none' }), /lista de hallazgos inválida/)
})

test('parses valid JSON returned by a vision model, including fenced JSON', () => {
  const parsed = parseModelContent(`\`\`\`json\n${JSON.stringify(validResult)}\n\`\`\``)
  assert.deepEqual(validateModelResult(parsed), validResult)
})

test('rejects malformed or unsafe vision model responses', () => {
  assert.throws(() => parseModelContent('not JSON'), /JSON válido/)
  assert.throws(() => validateModelResult(parseModelContent('[{}]')), /resultado incompleto/)
  assert.throws(() => validateModelResult({
    ...validResult,
    detections: [{ ...validResult.detections[0], recommendation: ' ' }],
  }), /incompleto o fuera de formato/)
  assert.throws(() => validateModelResult({
    ...validResult,
    detections: Array.from({ length: 21 }, () => validResult.detections[0]),
  }), /resultado incompleto o fuera de formato/)
})
