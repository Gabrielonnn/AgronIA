export type SpectrumMode = 'rgb' | 'ndvi' | 'thermal' | 'split'

export type SimulationPresetId =
  | 'live_raw'
  | 'sin_plagas'
  | 'estres_hidrico'
  | 'sobre_hidratacion'
  | 'con_plagas'

export type DetectionMode = 'auto_vegetation' | 'assisted_center' | 'synthetic_plant'

export interface SimulationPresetConfig {
  id: SimulationPresetId
  name: string
  shortLabel: string
  badge: string
  accentColor: string
  description: string
  ndviTargetRange: [number, number]
  tempDeltaRange: [number, number]
  defaultIssueType: 'sin_hallazgo' | 'estres_hidrico' | 'plaga' | 'enfermedad' | 'otro'
  defaultSeverity: 'ninguna' | 'baja' | 'media' | 'alta'
  cause: string
  recommendation: string
}

export interface PlantBoundingBox {
  /** Normalized 0..1 coordinates */
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
  /** Pixel coordinates on output canvas */
  px: number
  py: number
  pWidth: number
  pHeight: number
}

export interface PlantLesionCluster {
  x: number
  y: number
  radius: number
  severity: number
  type: 'pest' | 'chlorosis' | 'necrosis' | 'water_stress' | 'overhydration'
  label: string
}

export interface SpotReading {
  normX: number
  normY: number
  inPlant: boolean
  ndvi: number
  tempC: number
  healthPct: number
  tissueState: string
}

export interface PresetComparisonItem {
  id: SimulationPresetId
  shortLabel: string
  accentColor: string
  ndviMean: number
  tempMeanC: number
  foliarMoisturePct: number
  affectedAreaPct: number
}

export interface MultispectralFrameAnalysis {
  plantDetected: boolean
  detectionConfidence: number
  plantCoveragePercent: number
  boundingBox: PlantBoundingBox | null
  polygonContour: Array<{ x: number; y: number }>
  ndvi: {
    mean: number
    min: number
    max: number
    highVigorPct: number
    moderateVigorPct: number
    lowVigorPct: number
    criticalPct: number
  }
  thermal: {
    meanTempC: number
    minTempC: number
    maxTempC: number
    ambientTempC: number
    cwsi: number
    transpirationPct: number
    hottestPoint: { x: number; y: number } | null
    coolestPoint: { x: number; y: number } | null
  }
  rgbMetrics: {
    greennessIndex: number
    chlorosisPct: number
    necrosisPct: number
    turgorPct: number
    foliarMoisturePct: number
  }
  aiClassification: {
    label: string
    category: SimulationPresetId
    confidence: number
    cause: string
    recommendation: string
    affectedAreaPct: number
  }
  hotspots: PlantLesionCluster[]
  spotReading: SpotReading | null
  presetComparison: PresetComparisonItem[]
}

export interface ProcessFrameOptions {
  spectrumMode: SpectrumMode
  preset: SimulationPresetId
  /** 0.0 to 1.0 */
  presetIntensity: number
  detectionMode: DetectionMode
  /** 0.1 to 0.9 */
  sensitivity: number
  isolatePlantBackground: boolean
  showContours: boolean
  showHotspots: boolean
  ambientTempC: number
  pointerNorm: { x: number; y: number } | null
  timeSec: number
  plantLabelHud?: string
}

export const SIMULATION_PRESETS: Record<SimulationPresetId, SimulationPresetConfig> = {
  live_raw: {
    id: 'live_raw',
    name: 'Lectura Óptica Directa',
    shortLabel: 'Óptico Real',
    badge: 'SENSOR EN VIVO',
    accentColor: '#38bdf8',
    description:
      'Interpreta directamente la reflectancia RGB de la cámara para estimar vigor vegetativo (ExG/VARI → NDVI) y firma térmica sin inyectar perturbaciones simuladas.',
    ndviTargetRange: [0.45, 0.82],
    tempDeltaRange: [-1.5, 2.0],
    defaultIssueType: 'sin_hallazgo',
    defaultSeverity: 'ninguna',
    cause: 'Lectura directa de reflectancia foliar captada por el sensor óptico del dispositivo.',
    recommendation:
      'Mantén buena iluminación difusa sobre la planta completa para maximizar la precisión del índice espectral.'
  },
  sin_plagas: {
    id: 'sin_plagas',
    name: 'Sin Plagas · Vigor Óptimo',
    shortLabel: 'Sin Plagas',
    badge: 'SALUDABLE',
    accentColor: '#10b981',
    description:
      'Simula un dosel vegetal sano con alta densidad clorofílica, transpiración estomática activa, turgencia celular completa y ausencia total de patógenos.',
    ndviTargetRange: [0.74, 0.89],
    tempDeltaRange: [-3.2, -1.2],
    defaultIssueType: 'sin_hallazgo',
    defaultSeverity: 'ninguna',
    cause: 'Actividad fotosintética óptima y conductancia estomática equilibrada sin daño fitosanitario.',
    recommendation:
      'Continuar con el régimen actual de fertirriego y monitoreo preventivo semanal.'
  },
  estres_hidrico: {
    id: 'estres_hidrico',
    name: 'Estrés Hídrico · Sequía',
    shortLabel: 'Estrés Hídrico',
    badge: 'DÉFICIT HÍDRICO',
    accentColor: '#f97316',
    description:
      'Simula déficit de agua en suelo: cierre estomático que interrumpe la transpiración, elevación severa de temperatura foliar (+5 a +9 °C) y caída de NDVI desde los bordes.',
    ndviTargetRange: [0.24, 0.51],
    tempDeltaRange: [4.5, 9.2],
    defaultIssueType: 'estres_hidrico',
    defaultSeverity: 'alta',
    cause: 'Déficit de humedad disponible en zona radicular con cierre estomático defensivo y pérdida de turgencia.',
    recommendation:
      'Programar riego correctivo inmediato por goteo y verificar uniformidad de presiones en el sector.'
  },
  sobre_hidratacion: {
    id: 'sobre_hidratacion',
    name: 'Sobrehidratación · Exceso Hídrico',
    shortLabel: 'Sobrehidratación',
    badge: 'ASFIXIA RADICULAR',
    accentColor: '#06b6d4',
    description:
      'Simula saturación hídrica e hipoxia radicular: enfriamiento anómalo basal en el espectro térmico, edema tisular y clorosis progresiva en nervaduras por falta de oxígeno.',
    ndviTargetRange: [0.33, 0.58],
    tempDeltaRange: [-5.8, -2.8],
    defaultIssueType: 'estres_hidrico',
    defaultSeverity: 'media',
    cause: 'Saturación hídrica del sustrato que reduce la aireación radicular e induce clorosis férrica/nitrogenada.',
    recommendation:
      'Suspender riegos temporalmente, mejorar el drenaje del perfil y vigilar aparición de hongos radiculares (Pythium/Phytophthora).'
  },
  con_plagas: {
    id: 'con_plagas',
    name: 'Con Plagas · Infestación Activa',
    shortLabel: 'Con Plagas',
    badge: 'ALERTA FITOSANITARIA',
    accentColor: '#ef4444',
    description:
      'Simula colonización por plagas y patógenos foliares: focos necróticos y halos cloróticos en RGB, caídas abruptas focalizadas de NDVI y micro-anomalías térmicas en lesiones.',
    ndviTargetRange: [0.14, 0.46],
    tempDeltaRange: [1.8, 5.8],
    defaultIssueType: 'plaga',
    defaultSeverity: 'alta',
    cause: 'Daño tisular focalizado compatible con alimentación de artrópodos fitófagos (ácaros/trips) y lesiones necróticas.',
    recommendation:
      'Inspeccionar el envés foliar en los focos marcados y aplicar control biológico o fumigación focalizada.'
  }
}

const ANALYSIS_WIDTH = 240
const ANALYSIS_HEIGHT = 180

let offscreenSourceCanvas: HTMLCanvasElement | null = null
let offscreenSourceCtx: CanvasRenderingContext2D | null = null

let mapRgbCanvas: HTMLCanvasElement | null = null
let mapRgbCtx: CanvasRenderingContext2D | null = null

let mapNdviCanvas: HTMLCanvasElement | null = null
let mapNdviCtx: CanvasRenderingContext2D | null = null

let mapThermalCanvas: HTMLCanvasElement | null = null
let mapThermalCtx: CanvasRenderingContext2D | null = null

let mapMaskCanvas: HTMLCanvasElement | null = null
let mapMaskCtx: CanvasRenderingContext2D | null = null

function ensureBuffers() {
  if (!offscreenSourceCanvas) {
    offscreenSourceCanvas = document.createElement('canvas')
    offscreenSourceCanvas.width = ANALYSIS_WIDTH
    offscreenSourceCanvas.height = ANALYSIS_HEIGHT
    offscreenSourceCtx = offscreenSourceCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (!mapRgbCanvas) {
    mapRgbCanvas = document.createElement('canvas')
    mapRgbCanvas.width = ANALYSIS_WIDTH
    mapRgbCanvas.height = ANALYSIS_HEIGHT
    mapRgbCtx = mapRgbCanvas.getContext('2d')
  }
  if (!mapNdviCanvas) {
    mapNdviCanvas = document.createElement('canvas')
    mapNdviCanvas.width = ANALYSIS_WIDTH
    mapNdviCanvas.height = ANALYSIS_HEIGHT
    mapNdviCtx = mapNdviCanvas.getContext('2d')
  }
  if (!mapThermalCanvas) {
    mapThermalCanvas = document.createElement('canvas')
    mapThermalCanvas.width = ANALYSIS_WIDTH
    mapThermalCanvas.height = ANALYSIS_HEIGHT
    mapThermalCtx = mapThermalCanvas.getContext('2d')
  }
  if (!mapMaskCanvas) {
    mapMaskCanvas = document.createElement('canvas')
    mapMaskCanvas.width = ANALYSIS_WIDTH
    mapMaskCanvas.height = ANALYSIS_HEIGHT
    mapMaskCtx = mapMaskCanvas.getContext('2d')
  }
}

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val
}

/**
 * Color lookup for NDVI (-0.1 to 1.0)
 * Standard agronomic false-color scale:
 * < 0.20: Critical / Necrotic / Soil (#dc2626 -> #ef4444)
 * 0.20 - 0.45: Low Vigor (#f97316 -> #facc15)
 * 0.45 - 0.70: Moderate Vigor (#facc15 -> #4ade80)
 * > 0.70: High Vigor (#22c55e -> #15803d)
 */
export function ndviToRgb(ndvi: number): [number, number, number] {
  const v = clamp(ndvi, 0, 1)
  if (v < 0.22) {
    const t = v / 0.22
    return [
      Math.round(185 + t * 54),
      Math.round(28 + t * 40),
      Math.round(28 + t * 10)
    ]
  }
  if (v < 0.45) {
    const t = (v - 0.22) / 0.23
    return [
      Math.round(239 + t * 11),
      Math.round(68 + t * 136),
      Math.round(38 - t * 17)
    ]
  }
  if (v < 0.68) {
    const t = (v - 0.45) / 0.23
    return [
      Math.round(250 - t * 176),
      Math.round(204 + t * 18),
      Math.round(21 + t * 59)
    ]
  }
  const t = (v - 0.68) / 0.32
  return [
    Math.round(74 - t * 53),
    Math.round(222 - t * 94),
    Math.round(80 - t * 19)
  ]
}

/**
 * Thermal Ironbow/Inferno LUT (16°C to 40°C)
 */
export function tempToThermalRgb(tempC: number): [number, number, number] {
  const norm = clamp((tempC - 17) / 22, 0, 1)
  if (norm < 0.22) {
    const t = norm / 0.22
    return [
      Math.round(18 + t * 12),
      Math.round(24 + t * 158),
      Math.round(145 + t * 75)
    ]
  }
  if (norm < 0.45) {
    const t = (norm - 0.22) / 0.23
    return [
      Math.round(30 + t * 44),
      Math.round(182 + t * 40),
      Math.round(220 - t * 130)
    ]
  }
  if (norm < 0.68) {
    const t = (norm - 0.45) / 0.23
    return [
      Math.round(74 + t * 176),
      Math.round(222 - t * 18),
      Math.round(90 - t * 65)
    ]
  }
  if (norm < 0.88) {
    const t = (norm - 0.68) / 0.20
    return [
      Math.round(250 - t * 10),
      Math.round(204 - t * 145),
      Math.round(25 + t * 15)
    ]
  }
  const t = (norm - 0.88) / 0.12
  return [
    Math.round(240 + t * 15),
    Math.round(59 + t * 175),
    Math.round(40 + t * 195)
  ]
}

/**
 * Renders a realistic animated botanical plant specimen onto a canvas
 * when the user selects 'synthetic_plant' mode or tests without a physical plant.
 */
export function drawSyntheticPlantSpecimen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeSec: number
) {
  // Soil / dark greenhouse background
  const bgGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.52,
    width * 0.05,
    width * 0.5,
    height * 0.5,
    width * 0.65
  )
  bgGrad.addColorStop(0, '#27211c')
  bgGrad.addColorStop(0.6, '#1a1612')
  bgGrad.addColorStop(1, '#100d0b')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  // Subtle soil granules in background
  ctx.fillStyle = 'rgba(120, 95, 70, 0.12)'
  for (let i = 0; i < 45; i++) {
    const sx = ((i * 73) % 97) / 97 * width
    const sy = ((i * 41) % 89) / 89 * height
    ctx.beginPath()
    ctx.arc(sx, sy, 2 + (i % 4), 0, Math.PI * 2)
    ctx.fill()
  }

  const cx = width * 0.5
  const cy = height * 0.54
  const scale = Math.min(width, height) * 0.37

  // Main stem
  ctx.save()
  ctx.strokeStyle = '#4d7c2b'
  ctx.lineWidth = Math.max(3, scale * 0.045)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy + scale * 0.95)
  ctx.quadraticCurveTo(
    cx + Math.sin(timeSec * 1.1) * 4,
    cy + scale * 0.3,
    cx,
    cy - scale * 0.1
  )
  ctx.stroke()
  ctx.restore()

  // Rosette of 8 botanical leaves with veins and natural shading
  const leaves = [
    { angle: -Math.PI * 0.5, len: 1.02, wid: 0.36, green: [46, 148, 52] },
    { angle: -Math.PI * 0.22, len: 0.96, wid: 0.34, green: [54, 158, 56] },
    { angle: Math.PI * 0.06, len: 0.92, wid: 0.35, green: [42, 138, 48] },
    { angle: Math.PI * 0.32, len: 0.85, wid: 0.32, green: [60, 162, 62] },
    { angle: Math.PI * 0.68, len: 0.86, wid: 0.32, green: [48, 144, 50] },
    { angle: Math.PI * 0.94, len: 0.94, wid: 0.35, green: [52, 152, 54] },
    { angle: -Math.PI * 0.78, len: 0.97, wid: 0.34, green: [44, 142, 49] },
    { angle: -Math.PI * 0.36, len: 0.62, wid: 0.25, green: [68, 174, 66] },
    { angle: -Math.PI * 0.64, len: 0.64, wid: 0.25, green: [65, 170, 64] }
  ]

  leaves.forEach((leaf, idx) => {
    const sway = Math.sin(timeSec * 1.4 + idx * 0.9) * 0.025
    const angle = leaf.angle + sway
    const leafLen = scale * leaf.len
    const leafWid = scale * leaf.wid

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)

    // Petiole
    ctx.strokeStyle = '#65a33e'
    ctx.lineWidth = Math.max(2, scale * 0.025)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(leafLen * 0.2, 0)
    ctx.stroke()

    // Leaf lamina gradient
    const grad = ctx.createLinearGradient(leafLen * 0.12, -leafWid, leafLen, leafWid)
    const [r, g, b] = leaf.green
    grad.addColorStop(0, `rgb(${r + 14}, ${g + 18}, ${b + 10})`)
    grad.addColorStop(0.55, `rgb(${r}, ${g}, ${b})`)
    grad.addColorStop(1, `rgb(${Math.max(20, r - 12)}, ${Math.max(60, g - 16)}, ${Math.max(20, b - 10)})`)

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(leafLen * 0.14, 0)
    ctx.bezierCurveTo(
      leafLen * 0.35,
      -leafWid * 1.05,
      leafLen * 0.78,
      -leafWid * 0.85,
      leafLen,
      0
    )
    ctx.bezierCurveTo(
      leafLen * 0.78,
      leafWid * 0.85,
      leafLen * 0.35,
      leafWid * 1.05,
      leafLen * 0.14,
      0
    )
    ctx.closePath()
    ctx.fill()

    // Midrib and lateral veins
    ctx.strokeStyle = 'rgba(165, 225, 125, 0.55)'
    ctx.lineWidth = Math.max(1, scale * 0.014)
    ctx.beginPath()
    ctx.moveTo(leafLen * 0.15, 0)
    ctx.lineTo(leafLen * 0.93, 0)
    ctx.stroke()

    ctx.lineWidth = Math.max(0.8, scale * 0.008)
    for (let v = 1; v <= 4; v++) {
      const vx = leafLen * (0.26 + v * 0.14)
      const vw = leafWid * (0.55 - Math.abs(v - 2.3) * 0.12)
      ctx.beginPath()
      ctx.moveTo(vx, 0)
      ctx.quadraticCurveTo(vx + leafLen * 0.06, -vw * 0.5, vx + leafLen * 0.11, -vw * 0.82)
      ctx.moveTo(vx, 0)
      ctx.quadraticCurveTo(vx + leafLen * 0.06, vw * 0.5, vx + leafLen * 0.11, vw * 0.82)
      ctx.stroke()
    }

    ctx.restore()
  })
}

/**
 * Core real-time segmentation + multispectral simulation & rendering pipeline
 */
export function processMultispectralFrame(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null,
  targetCanvas: HTMLCanvasElement,
  options: ProcessFrameOptions
): MultispectralFrameAnalysis {
  ensureBuffers()

  const sCtx = offscreenSourceCtx!
  const w = ANALYSIS_WIDTH
  const h = ANALYSIS_HEIGHT

  if (options.detectionMode === 'synthetic_plant' || !source) {
    drawSyntheticPlantSpecimen(sCtx, w, h, options.timeSec)
  } else {
    sCtx.drawImage(source, 0, 0, w, h)
  }

  const srcImageData = sCtx.getImageData(0, 0, w, h)
  const srcData = srcImageData.data

  // Step 1: Segment the whole plant area
  const rawMask = new Uint8Array(w * h)
  const thresholdShift = (0.5 - options.sensitivity) * 0.22

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const p = idx * 4
      const r = srcData[p] / 255
      const g = srcData[p + 1] / 255
      const b = srcData[p + 2] / 255

      const maxC = Math.max(r, g, b)
      const minC = Math.min(r, g, b)
      const delta = maxC - minC
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const sat = maxC === 0 ? 0 : delta / maxC

      // Excess Green (ExG) & VARI
      const exg = 2 * g - r - b
      const vari = (g - r) / (g + r - b + 0.001)

      // Hue in degrees (0..360)
      let hue = 0
      if (delta > 0.0001) {
        if (maxC === g) {
          hue = 60 * (((b - r) / delta) + 2)
        } else if (maxC === r) {
          hue = 60 * (((g - b) / delta) % 6)
        } else {
          hue = 60 * (((r - g) / delta) + 4)
        }
        if (hue < 0) hue += 360
      }

      // Plant color criteria:
      // 1) Green foliage (hue 55..170)
      // 2) Chlorotic yellow-green / autumn leaf tissue (hue 28..55 with moderate saturation)
      const isGreenVegetation =
        (exg > 0.045 + thresholdShift || vari > 0.02 + thresholdShift) &&
        lum > 0.05 &&
        lum < 0.96 &&
        sat > 0.08
      const isChloroticLeaf =
        hue >= 26 &&
        hue <= 65 &&
        sat > 0.18 &&
        lum > 0.12 &&
        lum < 0.90 &&
        g >= b * 1.15

      if (isGreenVegetation || isChloroticLeaf) {
        rawMask[idx] = 1
      }
    }
  }

  // Morphological smoothing + hole filling so the whole plant area is unified
  const mask = new Uint8Array(w * h)
  let plantPixelCount = 0

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      let neighbors = 0
      for (let dy = -1; dy <= 1; dy++) {
        const row = (y + dy) * w
        for (let dx = -1; dx <= 1; dx++) {
          neighbors += rawMask[row + x + dx]
        }
      }
      if (neighbors >= 4) {
        mask[idx] = 1
        plantPixelCount++
      }
    }
  }

  // Fallback / Assisted Center Mode when user selects 'assisted_center' or camera sees non-green target
  if (
    options.detectionMode === 'assisted_center' ||
    (plantPixelCount < w * h * 0.015 && options.sensitivity > 0.65)
  ) {
    // Sample central target color and segment connected foreground region
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let count = 0
    const cx0 = Math.floor(w * 0.38)
    const cx1 = Math.floor(w * 0.62)
    const cy0 = Math.floor(h * 0.35)
    const cy1 = Math.floor(h * 0.65)
    for (let y = cy0; y <= cy1; y++) {
      for (let x = cx0; x <= cx1; x++) {
        const p = (y * w + x) * 4
        sumR += srcData[p]
        sumG += srcData[p + 1]
        sumB += srcData[p + 2]
        count++
      }
    }
    const meanR = sumR / Math.max(1, count)
    const meanG = sumG / Math.max(1, count)
    const meanB = sumB / Math.max(1, count)
    const colorTolerance = 68 + options.sensitivity * 45

    plantPixelCount = 0
    for (let y = 2; y < h - 2; y++) {
      const ny = (y / h - 0.5) * 2
      for (let x = 2; x < w - 2; x++) {
        const nx = (x / w - 0.5) * 2
        const radialDist = Math.hypot(nx * 0.85, ny * 0.85)
        if (radialDist > 0.88) continue
        const idx = y * w + x
        const p = idx * 4
        const distColor = Math.hypot(
          srcData[p] - meanR,
          srcData[p + 1] - meanG,
          srcData[p + 2] - meanB
        )
        if (mask[idx] === 1 || distColor < colorTolerance * (1.05 - radialDist * 0.35)) {
          mask[idx] = 1
          plantPixelCount++
        }
      }
    }
  }

  // Compute bounding box & center of mass of the whole plant area
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  let sumX = 0
  let sumY = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 1) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        sumX += x
        sumY += y
      }
    }
  }

  // Second pass: fill internal necrotic/pest holes inside the plant canopy bounding box
  if (plantPixelCount > 30) {
    for (let y = Math.max(2, minY + 1); y < Math.min(h - 2, maxY); y++) {
      for (let x = Math.max(2, minX + 1); x < Math.min(w - 2, maxX); x++) {
        const idx = y * w + x
        if (mask[idx] === 1) continue
        // Check if surrounded in 4 cardinal directions by plant pixels within short distance
        let left = false
        let right = false
        let up = false
        let down = false
        for (let d = 1; d <= 6; d++) {
          if (x - d >= 0 && mask[y * w + (x - d)] === 1) left = true
          if (x + d < w && mask[y * w + (x + d)] === 1) right = true
          if (y - d >= 0 && mask[(y - d) * w + x] === 1) up = true
          if (y + d < h && mask[(y + d) * w + x] === 1) down = true
        }
        if (left && right && up && down) {
          mask[idx] = 1
          plantPixelCount++
        }
      }
    }
  }

  const plantDetected = plantPixelCount >= Math.floor(w * h * 0.008)
  const plantCoveragePercent = Number(((plantPixelCount / (w * h)) * 100).toFixed(1))

  const outWidth = targetCanvas.width || 640
  const outHeight = targetCanvas.height || 480

  let boundingBox: PlantBoundingBox | null = null
  const polygonContour: Array<{ x: number; y: number }> = []

  if (plantDetected) {
    const bw = Math.max(4, maxX - minX + 1)
    const bh = Math.max(4, maxY - minY + 1)
    const cx = sumX / plantPixelCount
    const cy = sumY / plantPixelCount

    boundingBox = {
      x: minX / w,
      y: minY / h,
      width: bw / w,
      height: bh / h,
      centerX: cx / w,
      centerY: cy / h,
      px: Math.round((minX / w) * outWidth),
      py: Math.round((minY / h) * outHeight),
      pWidth: Math.round((bw / w) * outWidth),
      pHeight: Math.round((bh / h) * outHeight)
    }

    // Build 28-ray radial hull around the plant center to outline the entire plant area smoothly
    const numRays = 28
    const maxRayLen = Math.hypot(bw, bh) * 0.75
    for (let i = 0; i < numRays; i++) {
      const angle = (i / numRays) * Math.PI * 2
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      let farthestDist = 4
      for (let r = 2; r <= maxRayLen; r += 1.5) {
        const rx = Math.round(cx + dx * r)
        const ry = Math.round(cy + dy * r)
        if (rx < 0 || rx >= w || ry < 0 || ry >= h) break
        if (mask[ry * w + rx] === 1) {
          farthestDist = r
        }
      }
      polygonContour.push({
        x: clamp((cx + dx * (farthestDist + 2)) / w, 0.01, 0.99),
        y: clamp((cy + dy * (farthestDist + 2)) / h, 0.01, 0.99)
      })
    }
  }

  // Generate deterministic pest/stress focal clusters anchored to the plant bounding box
  const hotspots: PlantLesionCluster[] = []
  const intensity = clamp(options.presetIntensity, 0.05, 1)

  if (plantDetected && boundingBox) {
    const relSeeds = [
      { rx: 0.34, ry: 0.36, rad: 0.09, sev: 0.92 },
      { rx: 0.66, ry: 0.42, rad: 0.08, sev: 0.85 },
      { rx: 0.48, ry: 0.64, rad: 0.10, sev: 0.88 },
      { rx: 0.28, ry: 0.58, rad: 0.07, sev: 0.74 },
      { rx: 0.72, ry: 0.66, rad: 0.075, sev: 0.79 }
    ]

    if (options.preset === 'con_plagas') {
      for (const s of relSeeds) {
        const hx = boundingBox.x + s.rx * boundingBox.width
        const hy = boundingBox.y + s.ry * boundingBox.height
        const mx = clamp(Math.floor(hx * w), 0, w - 1)
        const my = clamp(Math.floor(hy * h), 0, h - 1)
        if (mask[my * w + mx] === 1) {
          hotspots.push({
            x: hx,
            y: hy,
            radius: s.rad * Math.min(boundingBox.width, boundingBox.height) * (0.7 + 0.5 * intensity),
            severity: clamp(s.sev * intensity, 0.25, 0.99),
            type: 'pest',
            label: 'Foco Fitosanitario'
          })
        }
      }
    } else if (options.preset === 'estres_hidrico') {
      hotspots.push(
        {
          x: boundingBox.x + 0.22 * boundingBox.width,
          y: boundingBox.y + 0.28 * boundingBox.height,
          radius: 0.14 * Math.min(boundingBox.width, boundingBox.height),
          severity: clamp(0.88 * intensity, 0.3, 0.98),
          type: 'water_stress',
          label: 'Cierre Estomático Apical'
        },
        {
          x: boundingBox.x + 0.78 * boundingBox.width,
          y: boundingBox.y + 0.32 * boundingBox.height,
          radius: 0.13 * Math.min(boundingBox.width, boundingBox.height),
          severity: clamp(0.84 * intensity, 0.3, 0.98),
          type: 'water_stress',
          label: 'Déficit Hídrico Marginal'
        }
      )
    } else if (options.preset === 'sobre_hidratacion') {
      hotspots.push({
        x: boundingBox.centerX,
        y: boundingBox.y + 0.72 * boundingBox.height,
        radius: 0.18 * Math.min(boundingBox.width, boundingBox.height),
        severity: clamp(0.82 * intensity, 0.3, 0.96),
        type: 'overhydration',
        label: 'Saturación / Edema Basal'
      })
    }
  }

  // Step 2: Compute per-pixel multispectral values (RGB, NDVI, Thermal, Mask)
  const rgbImg = mapRgbCtx!.createImageData(w, h)
  const ndviImg = mapNdviCtx!.createImageData(w, h)
  const thermalImg = mapThermalCtx!.createImageData(w, h)
  const maskImg = mapMaskCtx!.createImageData(w, h)

  const rgbOut = rgbImg.data
  const ndviOut = ndviImg.data
  const thermalOut = thermalImg.data
  const maskOut = maskImg.data

  let sumNdvi = 0
  let minNdvi = 1
  let maxNdvi = 0
  let highVigorCount = 0
  let modVigorCount = 0
  let lowVigorCount = 0
  let critVigorCount = 0

  let sumTemp = 0
  let minTemp = 99
  let maxTemp = -99
  let hottestPoint: { x: number; y: number } | null = null
  let coolestPoint: { x: number; y: number } | null = null

  let sumGreenness = 0
  let chlorosisCount = 0
  let necrosisCount = 0

  const ndviBuffer = new Float32Array(w * h)
  const tempBuffer = new Float32Array(w * h)

  const boxX = boundingBox?.x ?? 0
  const boxY = boundingBox?.y ?? 0
  const boxW = Math.max(0.01, boundingBox?.width ?? 1)
  const boxH = Math.max(0.01, boundingBox?.height ?? 1)
  const boxCx = boundingBox?.centerX ?? 0.5
  const boxCy = boundingBox?.centerY ?? 0.5

  for (let y = 0; y < h; y++) {
    const normY = y / h
    for (let x = 0; x < w; x++) {
      const normX = x / w
      const idx = y * w + x
      const p = idx * 4

      let r = srcData[p]
      let g = srcData[p + 1]
      let b = srcData[p + 2]

      const isPlant = mask[idx] === 1

      if (!isPlant) {
        // Non-plant background rendering
        const bgLum = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        if (options.isolatePlantBackground) {
          rgbOut[p] = Math.round(r * 0.28)
          rgbOut[p + 1] = Math.round(g * 0.28)
          rgbOut[p + 2] = Math.round(b * 0.28)
          rgbOut[p + 3] = 255

          ndviOut[p] = Math.round(bgLum * 0.12 + 10)
          ndviOut[p + 1] = Math.round(bgLum * 0.15 + 16)
          ndviOut[p + 2] = Math.round(bgLum * 0.24 + 32)
          ndviOut[p + 3] = 255

          thermalOut[p] = Math.round(bgLum * 0.14 + 14)
          thermalOut[p + 1] = Math.round(bgLum * 0.10 + 10)
          thermalOut[p + 2] = Math.round(bgLum * 0.22 + 28)
          thermalOut[p + 3] = 255
        } else {
          rgbOut[p] = r
          rgbOut[p + 1] = g
          rgbOut[p + 2] = b
          rgbOut[p + 3] = 255

          ndviOut[p] = Math.round(bgLum * 0.35)
          ndviOut[p + 1] = Math.round(bgLum * 0.38)
          ndviOut[p + 2] = Math.round(bgLum * 0.48)
          ndviOut[p + 3] = 255

          thermalOut[p] = Math.round(bgLum * 0.32)
          thermalOut[p + 1] = Math.round(bgLum * 0.25)
          thermalOut[p + 2] = Math.round(bgLum * 0.42)
          thermalOut[p + 3] = 255
        }

        maskOut[p] = 14
        maskOut[p + 1] = 20
        maskOut[p + 2] = 16
        maskOut[p + 3] = 255

        ndviBuffer[idx] = 0.08
        tempBuffer[idx] = options.ambientTempC
        continue
      }

      // Plant pixel: compute base optical indices
      const rn = r / 255
      const gn = g / 255
      const bn = b / 255
      const exg = clamp(2 * gn - rn - bn, -0.5, 1.0)
      const vari = clamp((gn - rn) / (gn + rn - bn + 0.01), -0.6, 1.0)

      // Relative coordinates inside the detected plant bounding box (0..1)
      const u = (normX - boxX) / boxW
      const v = (normY - boxY) / boxH
      const distFromPlantCenter = clamp(
        Math.hypot((normX - boxCx) / (boxW * 0.55), (normY - boxCy) / (boxH * 0.55)),
        0,
        1.4
      )

      // Deterministic spatial texture inside canopy
      const spatialWave =
        Math.sin(u * 14.0 + v * 9.0) * 0.5 +
        Math.cos(u * 23.0 - v * 17.0) * 0.3 +
        Math.sin((u + v) * 31.0) * 0.2

      // Base optical NDVI & Leaf Temperature
      let pixelNdvi = clamp(0.42 + exg * 0.72 + vari * 0.28, 0.12, 0.92)
      let pixelTemp = options.ambientTempC - (pixelNdvi - 0.5) * 4.2 + spatialWave * 0.45

      // Apply preset spectral simulation
      if (options.preset === 'sin_plagas') {
        const targetNdvi = clamp(0.82 + spatialWave * 0.05 - distFromPlantCenter * 0.04, 0.71, 0.92)
        pixelNdvi = pixelNdvi * (1 - intensity) + targetNdvi * intensity

        const targetTemp =
          options.ambientTempC - 2.4 + distFromPlantCenter * 0.6 + spatialWave * 0.35
        pixelTemp = pixelTemp * (1 - intensity) + targetTemp * intensity

        // Vibrant healthy chlorophyll boost in RGB
        r = clamp(Math.round(r * (1 - 0.18 * intensity)), 0, 255)
        g = clamp(Math.round(g + (210 - g) * 0.22 * intensity), 0, 255)
        b = clamp(Math.round(b * (1 - 0.12 * intensity)), 0, 255)
      } else if (options.preset === 'estres_hidrico') {
        // Water stress hits edges/apexes hardest (high distFromPlantCenter)
        const edgeStress = clamp(0.35 + distFromPlantCenter * 0.65 + spatialWave * 0.15, 0.2, 1.0)
        const targetNdvi = clamp(0.58 - edgeStress * 0.38, 0.16, 0.58)
        pixelNdvi = pixelNdvi * (1 - intensity) + targetNdvi * intensity

        // Stomatal closure causes strong leaf heating (+4.5 to +9.5 °C)
        const targetTemp = options.ambientTempC + 3.8 + edgeStress * 5.8 + spatialWave * 0.6
        pixelTemp = pixelTemp * (1 - intensity) + targetTemp * intensity

        // RGB wilting/yellow-amber marginal scorch
        const scorch = edgeStress * intensity
        r = clamp(Math.round(r + (215 - r) * 0.48 * scorch), 0, 255)
        g = clamp(Math.round(g + (175 - g) * 0.25 * scorch), 0, 255)
        b = clamp(Math.round(b * (1 - 0.42 * scorch)), 0, 255)
      } else if (options.preset === 'sobre_hidratacion') {
        // Overhydration affects basal/inner zones (low distFromPlantCenter & lower v)
        const basalFactor = clamp((1.1 - distFromPlantCenter * 0.75) * (0.5 + v * 0.6), 0.2, 1.0)
        const targetNdvi = clamp(0.64 - basalFactor * 0.34 + spatialWave * 0.06, 0.24, 0.64)
        pixelNdvi = pixelNdvi * (1 - intensity) + targetNdvi * intensity

        // Waterlogged tissue cooling (-3 to -6.2 °C)
        const targetTemp = options.ambientTempC - 2.6 - basalFactor * 3.8 + spatialWave * 0.35
        pixelTemp = pixelTemp * (1 - intensity) + targetTemp * intensity

        // RGB pale yellow-cyan water-soaked appearance
        const soak = basalFactor * intensity
        r = clamp(Math.round(r + (175 - r) * 0.32 * soak), 0, 255)
        g = clamp(Math.round(g + (190 - g) * 0.18 * soak), 0, 255)
        b = clamp(Math.round(b + (145 - b) * 0.35 * soak), 0, 255)
      } else if (options.preset === 'con_plagas') {
        // Pest lesions at hotspot clusters + micro-stippling
        let maxLesionEffect = 0
        for (const spot of hotspots) {
          const d = Math.hypot(normX - spot.x, normY - spot.y)
          if (d < spot.radius * 1.45) {
            const localEffect = clamp(1 - d / (spot.radius * 1.45), 0, 1) * spot.severity
            if (localEffect > maxLesionEffect) maxLesionEffect = localEffect
          }
        }
        // High-frequency stippling pattern
        const stipple =
          Math.sin(u * 65) * Math.cos(v * 65) > 0.72 ? 0.35 * intensity : 0
        const pestImpact = clamp(maxLesionEffect + stipple, 0, 1)

        const baseHealthyNdvi = clamp(0.75 + spatialWave * 0.05, 0.62, 0.85)
        const lesionNdvi = clamp(0.11 + (1 - pestImpact) * 0.28, 0.08, 0.42)
        const targetNdvi = baseHealthyNdvi * (1 - pestImpact) + lesionNdvi * pestImpact
        pixelNdvi = pixelNdvi * (1 - intensity) + targetNdvi * intensity

        // Thermal spike in necrotic/inflamed lesion centers
        const targetTemp =
          options.ambientTempC - 1.2 + pestImpact * 6.8 + spatialWave * 0.45
        pixelTemp = pixelTemp * (1 - intensity) + targetTemp * intensity

        // RGB necrotic brown core + yellow chlorotic halo
        if (pestImpact > 0.15) {
          const isNecroticCore = pestImpact > 0.58
          if (isNecroticCore) {
            r = clamp(Math.round(r * (1 - pestImpact * 0.6) + 115 * pestImpact), 0, 255)
            g = clamp(Math.round(g * (1 - pestImpact * 0.78) + 62 * pestImpact), 0, 255)
            b = clamp(Math.round(b * (1 - pestImpact * 0.82) + 28 * pestImpact), 0, 255)
          } else {
            // Chlorotic yellow halo
            const halo = pestImpact * 1.4
            r = clamp(Math.round(r + (230 - r) * 0.55 * halo), 0, 255)
            g = clamp(Math.round(g + (195 - g) * 0.35 * halo), 0, 255)
            b = clamp(Math.round(b * (1 - 0.55 * halo)), 0, 255)
          }
        }
      }

      pixelNdvi = clamp(pixelNdvi, 0.02, 0.96)
      pixelTemp = clamp(pixelTemp, 15.0, 43.0)

      ndviBuffer[idx] = pixelNdvi
      tempBuffer[idx] = pixelTemp

      // Accumulate plant statistics
      sumNdvi += pixelNdvi
      if (pixelNdvi < minNdvi) minNdvi = pixelNdvi
      if (pixelNdvi > maxNdvi) maxNdvi = pixelNdvi

      if (pixelNdvi >= 0.68) highVigorCount++
      else if (pixelNdvi >= 0.45) modVigorCount++
      else if (pixelNdvi >= 0.25) lowVigorCount++
      else critVigorCount++

      sumTemp += pixelTemp
      if (pixelTemp < minTemp) {
        minTemp = pixelTemp
        coolestPoint = { x: normX, y: normY }
      }
      if (pixelTemp > maxTemp) {
        maxTemp = pixelTemp
        hottestPoint = { x: normX, y: normY }
      }

      const modGreenness = clamp((2 * g - r - b) / 255, 0, 1)
      sumGreenness += modGreenness
      if (pixelNdvi < 0.28) necrosisCount++
      else if (pixelNdvi < 0.48) chlorosisCount++

      // Write RGB output pixel
      rgbOut[p] = r
      rgbOut[p + 1] = g
      rgbOut[p + 2] = b
      rgbOut[p + 3] = 255

      // Write NDVI false-color pixel
      const [nr, ng, nb] = ndviToRgb(pixelNdvi)
      ndviOut[p] = nr
      ndviOut[p + 1] = ng
      ndviOut[p + 2] = nb
      ndviOut[p + 3] = 255

      // Write Thermal false-color pixel
      const [tr, tg, tb] = tempToThermalRgb(pixelTemp)
      thermalOut[p] = tr
      thermalOut[p + 1] = tg
      thermalOut[p + 2] = tb
      thermalOut[p + 3] = 255

      // Write Segmentation + Stress Mask pixel
      if (pixelNdvi < 0.28) {
        maskOut[p] = 239
        maskOut[p + 1] = 68
        maskOut[p + 2] = 68
      } else if (pixelNdvi < 0.48) {
        maskOut[p] = 250
        maskOut[p + 1] = 204
        maskOut[p + 2] = 21
      } else {
        maskOut[p] = 34
        maskOut[p + 1] = 197
        maskOut[p + 2] = 94
      }
      maskOut[p + 3] = 255
    }
  }

  mapRgbCtx!.putImageData(rgbImg, 0, 0)
  mapNdviCtx!.putImageData(ndviImg, 0, 0)
  mapThermalCtx!.putImageData(thermalImg, 0, 0)
  mapMaskCtx!.putImageData(maskImg, 0, 0)

  // Step 3: Render the selected spectrum mode onto targetCanvas with AI HUD overlays
  const outCtx = targetCanvas.getContext('2d')
  if (outCtx) {
    outCtx.clearRect(0, 0, outWidth, outHeight)
    outCtx.imageSmoothingEnabled = true

    if (options.spectrumMode === 'split') {
      const halfW = Math.floor(outWidth / 2)
      const halfH = Math.floor(outHeight / 2)

      // Top-Left: RGB
      outCtx.drawImage(mapRgbCanvas!, 0, 0, halfW, halfH)
      drawSubOverlay(outCtx, 0, 0, halfW, halfH, 'RGB · RECONOCIMIENTO IA', '#10b981', boundingBox, polygonContour, hotspots, options)

      // Top-Right: NDVI
      outCtx.drawImage(mapNdviCanvas!, halfW, 0, halfW, halfH)
      drawSubOverlay(outCtx, halfW, 0, halfW, halfH, 'NDVI · VIGOR CLOROFÍLICO', '#84cc16', boundingBox, polygonContour, hotspots, options)

      // Bottom-Left: Thermal
      outCtx.drawImage(mapThermalCanvas!, 0, halfH, halfW, halfH)
      drawSubOverlay(outCtx, 0, halfH, halfW, halfH, 'TÉRMICO · LWIR (°C)', '#f97316', boundingBox, polygonContour, hotspots, options)

      // Bottom-Right: Mask & Stress Map
      outCtx.drawImage(mapMaskCanvas!, halfW, halfH, halfW, halfH)
      drawSubOverlay(outCtx, halfW, halfH, halfW, halfH, 'MÁSCARA IA · ZONIFICACIÓN', '#38bdf8', boundingBox, polygonContour, hotspots, options)

      // Grid dividers
      outCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
      outCtx.lineWidth = 1.5
      outCtx.beginPath()
      outCtx.moveTo(halfW, 0)
      outCtx.lineTo(halfW, outHeight)
      outCtx.moveTo(0, halfH)
      outCtx.lineTo(outWidth, halfH)
      outCtx.stroke()
    } else {
      const activeCanvas =
        options.spectrumMode === 'rgb'
          ? mapRgbCanvas!
          : options.spectrumMode === 'ndvi'
            ? mapNdviCanvas!
            : mapThermalCanvas!

      outCtx.drawImage(activeCanvas, 0, 0, outWidth, outHeight)
      drawPrimaryHudOverlay(
        outCtx,
        outWidth,
        outHeight,
        boundingBox,
        polygonContour,
        hotspots,
        hottestPoint,
        coolestPoint,
        maxTemp,
        minTemp,
        options
      )
    }
  }

  // Step 4: Compile metrics & spot reading
  const safeCount = Math.max(1, plantPixelCount)
  const meanNdvi = plantDetected ? Number((sumNdvi / safeCount).toFixed(2)) : 0
  const meanTempC = plantDetected
    ? Number((sumTemp / safeCount).toFixed(1))
    : options.ambientTempC

  // Crop Water Stress Index (CWSI) derived from leaf-air temperature differential
  const tempDiff = meanTempC - options.ambientTempC
  const cwsi = plantDetected ? Number(clamp((tempDiff + 3.0) / 10.5, 0.02, 0.98).toFixed(2)) : 0

  const chlorosisPct = plantDetected ? Number(((chlorosisCount / safeCount) * 100).toFixed(1)) : 0
  const necrosisPct = plantDetected ? Number(((necrosisCount / safeCount) * 100).toFixed(1)) : 0
  const affectedAreaPct = Number(clamp(chlorosisPct + necrosisPct, 0, 100).toFixed(1))

  const presetCfg = SIMULATION_PRESETS[options.preset]
  const detectionConfidence = plantDetected
    ? Number(clamp(0.76 + Math.min(0.22, (plantCoveragePercent / 100) * 0.45), 0.65, 0.99).toFixed(2))
    : 0

  // Spot reading at pointer or plant center
  let spotReading: SpotReading | null = null
  const queryNorm = options.pointerNorm ?? (boundingBox ? { x: boundingBox.centerX, y: boundingBox.centerY } : null)
  if (queryNorm) {
    const sx = clamp(Math.floor(queryNorm.x * w), 0, w - 1)
    const sy = clamp(Math.floor(queryNorm.y * h), 0, h - 1)
    const sIdx = sy * w + sx
    const inPlant = mask[sIdx] === 1
    const sNdvi = Number(ndviBuffer[sIdx].toFixed(2))
    const sTemp = Number(tempBuffer[sIdx].toFixed(1))
    const sHealth = inPlant ? Math.round(clamp(sNdvi * 108, 5, 100)) : 0
    const tissueState = !inPlant
      ? 'Fondo / Suelo'
      : sNdvi >= 0.68
        ? 'Tejido Sano (Vigor Alto)'
        : sNdvi >= 0.45
          ? 'Vigor Moderado'
          : sNdvi >= 0.28
            ? 'Clorosis / Estrés'
            : 'Lesión / Necrosis'

    spotReading = {
      normX: queryNorm.x,
      normY: queryNorm.y,
      inPlant,
      ndvi: sNdvi,
      tempC: sTemp,
      healthPct: sHealth,
      tissueState
    }

    // Draw interactive spot reticle if single-view
    if (outCtx && options.spectrumMode !== 'split' && options.pointerNorm) {
      const px = queryNorm.x * outWidth
      const py = queryNorm.y * outHeight
      outCtx.save()
      outCtx.strokeStyle = inPlant ? '#facc15' : 'rgba(255,255,255,0.5)'
      outCtx.lineWidth = 1.5
      outCtx.beginPath()
      outCtx.arc(px, py, 10, 0, Math.PI * 2)
      outCtx.moveTo(px - 15, py)
      outCtx.lineTo(px - 5, py)
      outCtx.moveTo(px + 5, py)
      outCtx.lineTo(px + 15, py)
      outCtx.moveTo(px, py - 15)
      outCtx.lineTo(px, py - 5)
      outCtx.moveTo(px, py + 5)
      outCtx.lineTo(px, py + 15)
      outCtx.stroke()
      outCtx.restore()
    }
  }

  // Determine classification label when in live_raw vs preset
  let aiLabel = presetCfg.name
  let aiCategory: SimulationPresetId = options.preset
  let aiCause = presetCfg.cause
  let aiRec = presetCfg.recommendation

  if (options.preset === 'live_raw') {
    if (meanNdvi >= 0.65 && affectedAreaPct < 15) {
      aiLabel = 'Dosel Vegetal Saludable · Sin Plagas'
      aiCategory = 'sin_plagas'
      aiCause = SIMULATION_PRESETS.sin_plagas.cause
      aiRec = SIMULATION_PRESETS.sin_plagas.recommendation
    } else if (necrosisPct > 12) {
      aiLabel = 'Posible Daño Fitosanitario / Necrosis Foliar'
      aiCategory = 'con_plagas'
      aiCause = SIMULATION_PRESETS.con_plagas.cause
      aiRec = SIMULATION_PRESETS.con_plagas.recommendation
    } else if (meanTempC > options.ambientTempC + 2.2 || meanNdvi < 0.45) {
      aiLabel = 'Estrés Vegetativo / Posible Déficit Hídrico'
      aiCategory = 'estres_hidrico'
      aiCause = SIMULATION_PRESETS.estres_hidrico.cause
      aiRec = SIMULATION_PRESETS.estres_hidrico.recommendation
    }
  }

  const foliarMoisturePct =
    options.preset === 'sobre_hidratacion'
      ? Math.round(clamp(78 + intensity * 18, 50, 98))
      : options.preset === 'estres_hidrico'
        ? Math.round(clamp(62 - intensity * 42, 12, 70))
        : Math.round(clamp(55 + meanNdvi * 32, 20, 92))

  const transpirationPct =
    options.preset === 'estres_hidrico'
      ? Math.round(clamp(75 - intensity * 58, 8, 85))
      : options.preset === 'sobre_hidratacion'
        ? Math.round(clamp(60 - intensity * 25, 25, 80))
        : Math.round(clamp(45 + meanNdvi * 50, 20, 96))

  const baseOpticalNdvi = plantDetected ? clamp(0.45 + (sumGreenness / safeCount) * 0.45, 0.35, 0.84) : 0.62
  const presetComparison: PresetComparisonItem[] = [
    {
      id: 'sin_plagas',
      shortLabel: SIMULATION_PRESETS.sin_plagas.shortLabel,
      accentColor: SIMULATION_PRESETS.sin_plagas.accentColor,
      ndviMean: Number(clamp(baseOpticalNdvi * 0.35 + 0.56, 0.75, 0.89).toFixed(2)),
      tempMeanC: Number((options.ambientTempC - 2.3).toFixed(1)),
      foliarMoisturePct: 82,
      affectedAreaPct: 2.1
    },
    {
      id: 'estres_hidrico',
      shortLabel: SIMULATION_PRESETS.estres_hidrico.shortLabel,
      accentColor: SIMULATION_PRESETS.estres_hidrico.accentColor,
      ndviMean: Number(clamp(baseOpticalNdvi - 0.32 * intensity, 0.22, 0.48).toFixed(2)),
      tempMeanC: Number((options.ambientTempC + 5.6 * intensity + 1.2).toFixed(1)),
      foliarMoisturePct: Math.round(clamp(60 - intensity * 38, 16, 52)),
      affectedAreaPct: Number(clamp(28 + intensity * 44, 18, 78).toFixed(1))
    },
    {
      id: 'sobre_hidratacion',
      shortLabel: SIMULATION_PRESETS.sobre_hidratacion.shortLabel,
      accentColor: SIMULATION_PRESETS.sobre_hidratacion.accentColor,
      ndviMean: Number(clamp(baseOpticalNdvi - 0.21 * intensity, 0.31, 0.56).toFixed(2)),
      tempMeanC: Number((options.ambientTempC - 3.9 * intensity - 0.8).toFixed(1)),
      foliarMoisturePct: Math.round(clamp(80 + intensity * 16, 78, 97)),
      affectedAreaPct: Number(clamp(22 + intensity * 35, 15, 64).toFixed(1))
    },
    {
      id: 'con_plagas',
      shortLabel: SIMULATION_PRESETS.con_plagas.shortLabel,
      accentColor: SIMULATION_PRESETS.con_plagas.accentColor,
      ndviMean: Number(clamp(baseOpticalNdvi - 0.27 * intensity, 0.25, 0.53).toFixed(2)),
      tempMeanC: Number((options.ambientTempC + 3.1 * intensity + 0.7).toFixed(1)),
      foliarMoisturePct: Math.round(clamp(64 - intensity * 22, 34, 66)),
      affectedAreaPct: Number(clamp(24 + intensity * 39, 16, 68).toFixed(1))
    }
  ]

  return {
    plantDetected,
    detectionConfidence,
    plantCoveragePercent,
    boundingBox,
    polygonContour,
    ndvi: {
      mean: meanNdvi,
      min: plantDetected ? Number(minNdvi.toFixed(2)) : 0,
      max: plantDetected ? Number(maxNdvi.toFixed(2)) : 0,
      highVigorPct: plantDetected ? Number(((highVigorCount / safeCount) * 100).toFixed(1)) : 0,
      moderateVigorPct: plantDetected ? Number(((modVigorCount / safeCount) * 100).toFixed(1)) : 0,
      lowVigorPct: plantDetected ? Number(((lowVigorCount / safeCount) * 100).toFixed(1)) : 0,
      criticalPct: plantDetected ? Number(((critVigorCount / safeCount) * 100).toFixed(1)) : 0
    },
    thermal: {
      meanTempC,
      minTempC: plantDetected ? Number(minTemp.toFixed(1)) : options.ambientTempC,
      maxTempC: plantDetected ? Number(maxTemp.toFixed(1)) : options.ambientTempC,
      ambientTempC: options.ambientTempC,
      cwsi,
      transpirationPct,
      hottestPoint,
      coolestPoint
    },
    rgbMetrics: {
      greennessIndex: plantDetected ? Number((sumGreenness / safeCount).toFixed(2)) : 0,
      chlorosisPct,
      necrosisPct,
      turgorPct: plantDetected
        ? Math.round(clamp((1 - cwsi * 0.75) * 100, 15, 99))
        : 0,
      foliarMoisturePct
    },
    aiClassification: {
      label: aiLabel,
      category: aiCategory,
      confidence: detectionConfidence,
      cause: aiCause,
      recommendation: aiRec,
      affectedAreaPct
    },
    hotspots,
    spotReading,
    presetComparison
  }
}

function drawSubOverlay(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  title: string,
  color: string,
  box: PlantBoundingBox | null,
  contour: Array<{ x: number; y: number }>,
  hotspots: PlantLesionCluster[],
  options: ProcessFrameOptions
) {
  ctx.save()

  // Whole-plant contour
  if (options.showContours && contour.length > 2) {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.beginPath()
    contour.forEach((pt, idx) => {
      const px = ox + pt.x * w
      const py = oy + pt.y * h
      if (idx === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.stroke()
  }

  // Bounding box
  if (box) {
    const bx = ox + box.x * w
    const by = oy + box.y * h
    const bw = box.width * w
    const bh = box.height * h
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.strokeRect(bx, by, bw, bh)
    ctx.setLineDash([])
  }

  // Hotspots
  if (options.showHotspots) {
    for (const spot of hotspots) {
      const sx = ox + spot.x * w
      const sy = oy + spot.y * h
      const sr = spot.radius * Math.min(w, h)
      ctx.strokeStyle = spot.type === 'pest' ? '#ef4444' : spot.type === 'water_stress' ? '#f97316' : '#06b6d4'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Label badge
  ctx.fillStyle = 'rgba(10, 15, 12, 0.78)'
  ctx.fillRect(ox + 8, oy + 8, 188, 22)
  ctx.fillStyle = color
  ctx.fillRect(ox + 8, oy + 8, 3, 22)
  ctx.fillStyle = '#f3f4f6'
  ctx.font = 'bold 10px Inter, sans-serif'
  ctx.fillText(title, ox + 17, oy + 22)

  ctx.restore()
}
function drawPrimaryHudOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  box: PlantBoundingBox | null,
  contour: Array<{ x: number; y: number }>,
  hotspots: PlantLesionCluster[],
  hottestPoint: { x: number; y: number } | null,
  coolestPoint: { x: number; y: number } | null,
  maxTemp: number,
  minTemp: number,
  options: ProcessFrameOptions
) {
  ctx.save()

  // 1) Whole-plant polygon contour
  if (options.showContours && contour.length > 2) {
    ctx.strokeStyle =
      options.spectrumMode === 'rgb'
        ? 'rgba(52, 211, 153, 0.9)'
        : options.spectrumMode === 'ndvi'
          ? 'rgba(255, 255, 255, 0.85)'
          : 'rgba(56, 189, 248, 0.85)'
    ctx.lineWidth = 2.2
    ctx.fillStyle =
      options.spectrumMode === 'rgb'
        ? 'rgba(16, 185, 129, 0.08)'
        : 'rgba(255, 255, 255, 0.03)'

    ctx.beginPath()
    for (let i = 0; i < contour.length; i++) {
      const curr = contour[i]
      const next = contour[(i + 1) % contour.length]
      const cx = curr.x * w
      const cy = curr.y * h
      const nx = next.x * w
      const ny = next.y * h
      const midX = (cx + nx) * 0.5
      const midY = (cy + ny) * 0.5
      if (i === 0) {
        ctx.moveTo(midX, midY)
      } else {
        ctx.quadraticCurveTo(cx, cy, midX, midY)
      }
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // 2) Whole-plant corner-bracket bounding box
  if (box) {
    const bx = box.x * w
    const by = box.y * h
    const bw = box.width * w
    const bh = box.height * h
    const corner = Math.min(22, bw * 0.18, bh * 0.18)

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.setLineDash([5, 5])
    ctx.lineWidth = 1
    ctx.strokeRect(bx, by, bw, bh)
    ctx.setLineDash([])

    // Bold corner brackets
    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 2.8
    ctx.beginPath()
    // Top-left
    ctx.moveTo(bx, by + corner)
    ctx.lineTo(bx, by)
    ctx.lineTo(bx + corner, by)
    // Top-right
    ctx.moveTo(bx + bw - corner, by)
    ctx.lineTo(bx + bw, by)
    ctx.lineTo(bx + bw, by + corner)
    // Bottom-left
    ctx.moveTo(bx, by + bh - corner)
    ctx.lineTo(bx, by + bh)
    ctx.lineTo(bx + corner, by + bh)
    // Bottom-right
    ctx.moveTo(bx + bw - corner, by + bh)
    ctx.lineTo(bx + bw, by + bh)
    ctx.lineTo(bx + bw, by + bh - corner)
    ctx.stroke()

    // Top bounding box header tag
    const tagText = options.plantLabelHud
      ? `${options.plantLabelHud.toUpperCase()} · ${(box.width * box.height * 100).toFixed(0)}% DOSEL`
      : `ÁREA TOTAL PLANTA · ${(box.width * box.height * 100).toFixed(0)}% DOSEL`
    ctx.font = 'bold 11px Inter, sans-serif'
    const textWidth = ctx.measureText(tagText).width
    const tagY = Math.max(6, by - 24)
    ctx.fillStyle = 'rgba(12, 20, 15, 0.85)'
    ctx.fillRect(bx, tagY, textWidth + 16, 20)
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx, tagY, textWidth + 16, 20)
    ctx.fillStyle = '#6ee7b7'
    ctx.fillText(tagText, bx + 8, tagY + 14)
  }

  // 3) Hotspot / Lesion rings
  if (options.showHotspots && hotspots.length > 0) {
    for (const spot of hotspots) {
      const sx = spot.x * w
      const sy = spot.y * h
      const sr = Math.max(12, spot.radius * Math.min(w, h))

      ctx.strokeStyle =
        spot.type === 'pest'
          ? '#ef4444'
          : spot.type === 'water_stress'
            ? '#f97316'
            : '#06b6d4'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = 'rgba(10, 14, 12, 0.82)'
      ctx.font = 'bold 10px Inter, sans-serif'
      const lbl = `${spot.label} (${Math.round(spot.severity * 100)}%)`
      const tw = ctx.measureText(lbl).width
      ctx.fillRect(sx - tw * 0.5 - 5, sy + sr + 4, tw + 10, 16)
      ctx.fillStyle = '#fde047'
      ctx.fillText(lbl, sx - tw * 0.5, sy + sr + 15)
    }
  }

  // 4) Thermal Min/Max pins when in thermal mode
  if (options.spectrumMode === 'thermal' && hottestPoint && coolestPoint) {
    const hx = hottestPoint.x * w
    const hy = hottestPoint.y * h
    ctx.fillStyle = 'rgba(127, 29, 29, 0.88)'
    ctx.fillRect(hx + 6, hy - 18, 72, 18)
    ctx.fillStyle = '#fca5a5'
    ctx.font = 'bold 10px Inter, sans-serif'
    ctx.fillText(`▲ ${maxTemp.toFixed(1)} °C`, hx + 11, hy - 5)

    const cx = coolestPoint.x * w
    const cy = coolestPoint.y * h
    ctx.fillStyle = 'rgba(12, 74, 110, 0.88)'
    ctx.fillRect(cx + 6, cy + 4, 72, 18)
    ctx.fillStyle = '#7dd3fc'
    ctx.fillText(`▼ ${minTemp.toFixed(1)} °C`, cx + 11, cy + 16)
  }

  ctx.restore()
}
