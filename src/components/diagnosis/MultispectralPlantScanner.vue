<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  Activity,
  AlertCircle,
  Bug,
  Camera,
  CameraOff,
  CheckCircle2,
  Crosshair,
  Download,
  Droplets,
  Eye,
  Flame,
  ImagePlus,
  Layers,
  Leaf,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sprout,
  Sun,
  Thermometer,
  Video
} from 'lucide-vue-next'
import {
  processMultispectralFrame,
  SIMULATION_PRESETS,
  type DetectionMode,
  type MultispectralFrameAnalysis,
  type SimulationPresetId,
  type SpectrumMode
} from '../../services/multispectralPlantEngine'
import {
  analyzeAgroVisionBackend,
  checkAgroVisionHealth,
  resolveDiagnosisBaseUrl,
  type AgroVisionAnalysis,
  type AgroVisionHealthStatus,
  type DetectedPlantBox
} from '../../services/plantDiagnosis'
import {
  browserAgroVisionEngine,
  type BrowserEngineStatus
} from '../../services/browserAgroVisionEngine'

export interface MultispectralCapturePayload {
  file: File
  previewUrl: string
  analysis: MultispectralFrameAnalysis
  preset: SimulationPresetId
  spectrumMode: SpectrumMode
  agrovision?: AgroVisionAnalysis | null
}

const props = withDefaults(
  defineProps<{
    compact?: boolean
    showFieldScoutingAction?: boolean
  }>(),
  {
    compact: false,
    showFieldScoutingAction: false
  }
)

const emit = defineEmits<{
  (e: 'capture', payload: MultispectralCapturePayload): void
}>()

const maxImageSize = 10 * 1024 * 1024
const configuredEndpoint = import.meta.env.VITE_PLANT_DIAGNOSIS_API_URL?.trim() ?? ''
const agrovisionBaseUrl = resolveDiagnosisBaseUrl(configuredEndpoint)
const backendOnline = ref(false)
const backendCapabilities = ref<AgroVisionHealthStatus | null>(null)

// Media & DOM refs
const fileInput = ref<HTMLInputElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const outputCanvas = ref<HTMLCanvasElement | null>(null)
const loadedImage = shallowRef<HTMLImageElement | null>(null)
const frozenImage = shallowRef<HTMLImageElement | null>(null)
const frozenFile = shallowRef<File | null>(null)
const selectedFile = shallowRef<File | null>(null)
const uploadedFileName = ref('')

// Camera device selection state
interface VideoDeviceOption {
  deviceId: string
  label: string
}
const videoDevices = ref<VideoDeviceOption[]>([])
const selectedDeviceId = ref<string>('')
const cameraFacingMode = ref<'environment' | 'user'>('environment')
const cameraStream = shallowRef<MediaStream | null>(null)
const cameraStarting = ref(false)
const cameraActive = ref(false)
const isCameraFrozen = ref(false)
const realTimeMode = ref(false) // Botón opcional de inferencia continua en tiempo real
const sourceMode = ref<'camera' | 'image' | 'synthetic'>('synthetic')

// Multispectral & Preset controls
const spectrumMode = ref<SpectrumMode>('rgb')
const activePreset = ref<SimulationPresetId>('live_raw')
const presetIntensity = ref(0.85)
const detectionMode = ref<DetectionMode>('auto_vegetation')
const sensitivity = ref(0.55)
const isolatePlantBackground = ref(false)
const showContours = ref(true)
const showHotspots = ref(false)
const ambientTempC = ref(25.0)
const pointerNorm = ref<{ x: number; y: number } | null>(null)

// Multi-plant selection & custom crop box state
const agrovisionResult = ref<AgroVisionAnalysis | null>(null)
const detectedPlants = ref<DetectedPlantBox[]>([])
const selectedPlantId = ref<number | null>(null)
const customCropBox = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const isDraggingBox = ref(false)
const dragStartNorm = ref<{ x: number; y: number } | null>(null)
const dragCurrentNorm = ref<{ x: number; y: number } | null>(null)

// Live analysis & AgroVision ONNX engine state
const liveAnalysis = ref<MultispectralFrameAnalysis | null>(null)
const browserEngineStatus = ref<BrowserEngineStatus>(browserAgroVisionEngine.status)
const isAnalyzing = ref(false)
let unsubscribeEngineStatus: (() => void) | null = null
const hasAnalyzedImage = ref(true)
const statusMessage = ref('')
const errorMessage = ref('')
const fpsCount = ref(30)

let rafId = 0
let realTimeLoopTimer: number | null = null
let agrovisionInFlight = false
let lastFrameTime = performance.now()
let frameCounter = 0
let fpsTimer = performance.now()
let lastAnalysisUpdate = 0

const canAnalyze = computed(() => {
  return (
    !isAnalyzing.value &&
    (sourceMode.value === 'image' || cameraActive.value || sourceMode.value === 'synthetic')
  )
})

const spectrumTabs: Array<{
  id: SpectrumMode
  label: string
  shortLabel: string
  badgeColor: string
}> = [
  { id: 'rgb', label: 'RGB · Reconocimiento IA', shortLabel: 'RGB + IA', badgeColor: 'bg-emerald-400' },
  { id: 'ndvi', label: 'NDVI · Vigor Multiespectral', shortLabel: 'NDVI', badgeColor: 'bg-lime-400' },
  { id: 'thermal', label: 'Térmico · Infrarrojo (°C)', shortLabel: 'Térmico', badgeColor: 'bg-orange-400' },
  { id: 'split', label: 'Cuádruple · 4 Espectros', shortLabel: '4 Espectros', badgeColor: 'bg-sky-400' }
]

const presetList = computed(() => [
  SIMULATION_PRESETS.live_raw,
  SIMULATION_PRESETS.sin_plagas,
  SIMULATION_PRESETS.estres_hidrico,
  SIMULATION_PRESETS.sobre_hidratacion,
  SIMULATION_PRESETS.con_plagas
])

const currentPresetConfig = computed(() => SIMULATION_PRESETS[activePreset.value])

function formatDiseaseName(disease: string) {
  return disease
    .replace('___', ' · ')
    .replaceAll('_', ' ')
    .replaceAll(',', '')
}

async function refreshCameraDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cameras = devices
      .filter(d => d.kind === 'videoinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Cámara ${idx + 1} (${d.deviceId.slice(0, 6) || 'local'})`
      }))
    videoDevices.value = cameras
    if (cameras.length > 0 && !selectedDeviceId.value) {
      selectedDeviceId.value = cameras[0].deviceId
    }
  } catch {
    // Ignore enumeration errors before permission is granted
  }
}

async function startCamera(useSpecificDevice = false) {
  errorMessage.value = ''
  statusMessage.value = ''

  if (!window.isSecureContext) {
    errorMessage.value =
      'El navegador requiere HTTPS o localhost para conectar la cámara del dispositivo.'
    return
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value =
      'Este navegador no ofrece acceso a cámaras WebRTC. Usa el modo Planta Demo o sube una imagen.'
    return
  }

  stopCamera()
  cameraStarting.value = true

  try {
    const videoConstraints: MediaTrackConstraints =
      useSpecificDevice && selectedDeviceId.value
        ? {
            deviceId: { exact: selectedDeviceId.value },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 }
          }
        : {
            facingMode: { ideal: cameraFacingMode.value },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 }
          }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false
    })

    cameraStream.value = stream
    await refreshCameraDevices()

    const activeTrack = stream.getVideoTracks()[0]
    const trackDeviceId = activeTrack?.getSettings().deviceId
    if (trackDeviceId) {
      selectedDeviceId.value = trackDeviceId
    }

    await nextTick()
    if (videoElement.value) {
      videoElement.value.srcObject = stream
      await videoElement.value.play()
    }

    cameraActive.value = true
    isCameraFrozen.value = false
    frozenImage.value = null
    frozenFile.value = null
    detectedPlants.value = []
    selectedPlantId.value = null
    customCropBox.value = null
    agrovisionResult.value = null
    sourceMode.value = 'camera'
    hasAnalyzedImage.value = true
    if (detectionMode.value === 'synthetic_plant') {
      detectionMode.value = 'auto_vegetation'
    }

    // Automatically identify on warm-up (single shot) and optionally start real-time loop if enabled
    window.setTimeout(() => {
      if (cameraActive.value && videoElement.value) {
        renderSinglePass(performance.now(), true)
        if (realTimeMode.value) {
          startRealTimeLoop()
        } else {
          void runAgroVisionAnalysis({ silent: true })
        }
      }
    }, 650)

    statusMessage.value = realTimeMode.value
      ? `Cámara conectada (${activeTrack?.label || 'dispositivo activo'}) en Tiempo Real.`
      : `Cámara conectada (${activeTrack?.label || 'dispositivo activo'}). Pulsa "Capturar / Congelar" o activa "Tiempo Real" cuando lo desees.`
  } catch (error) {
    stopCamera()
    errorMessage.value =
      error instanceof Error
        ? `No se pudo conectar la cámara seleccionada: ${error.message}`
        : 'No se pudo iniciar la cámara. Revisa los permisos del navegador.'
  } finally {
    cameraStarting.value = false
  }
}

function stopRealTimeLoop() {
  if (realTimeLoopTimer !== null) {
    window.clearInterval(realTimeLoopTimer)
    realTimeLoopTimer = null
  }
}

function startRealTimeLoop() {
  stopRealTimeLoop()
  if (!cameraActive.value || isCameraFrozen.value || !realTimeMode.value) return
  void runAgroVisionAnalysis({ silent: true, realTimeTick: true })
  const intervalMs = backendOnline.value ? 180 : 800
  realTimeLoopTimer = window.setInterval(() => {
    if (cameraActive.value && !isCameraFrozen.value && realTimeMode.value && !agrovisionInFlight) {
      void runAgroVisionAnalysis({ silent: true, realTimeTick: true })
    }
  }, intervalMs)
}

function toggleRealTimeMode() {
  realTimeMode.value = !realTimeMode.value
  if (realTimeMode.value) {
    if (isCameraFrozen.value) {
      resumeLiveCamera()
    }
    if (cameraActive.value) {
      startRealTimeLoop()
      statusMessage.value = 'Modo Tiempo Real ACTIVADO: analizando plantas continuamente en vivo.'
    } else {
      statusMessage.value = 'Tiempo Real activado. Se iniciará automáticamente al abrir la cámara.'
    }
  } else {
    stopRealTimeLoop()
    statusMessage.value = 'Modo Tiempo Real PAUSADO (opcional). Usa "Capturar / Congelar" o "Analizar imagen" bajo demanda.'
  }
}

async function freezeCameraCapture() {
  if (!cameraActive.value || !videoElement.value) return
  stopRealTimeLoop()
  const video = videoElement.value
  const w = video.videoWidth || 1280
  const h = video.videoHeight || 720
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = w
  tempCanvas.height = h
  const ctx = tempCanvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(video, 0, 0, w, h)

  const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/jpeg', 0.94))
  if (!blob) return
  const file = new File([blob], `agronia-captura-${Date.now()}.jpg`, { type: 'image/jpeg' })
  const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.94)

  const img = new Image()
  img.onload = async () => {
    frozenImage.value = img
    frozenFile.value = file
    isCameraFrozen.value = true
    customCropBox.value = null
    renderSinglePass(performance.now(), true)
    await runAgroVisionAnalysis({ fileOverride: file })
    statusMessage.value =
      'Imagen capturada y congelada. Haz clic sobre cualquier planta detectada para consultar su estado de salud y recomendaciones.'
  }
  img.src = dataUrl
}

function resumeLiveCamera() {
  isCameraFrozen.value = false
  frozenImage.value = null
  frozenFile.value = null
  customCropBox.value = null
  if (cameraActive.value && realTimeMode.value) {
    startRealTimeLoop()
  }
  statusMessage.value = 'Vista previa de cámara en vivo reanudada.'
}

function stopCamera() {
  stopRealTimeLoop()
  cameraStream.value?.getTracks().forEach(track => {
    track.onended = null
    track.stop()
  })
  cameraStream.value = null
  cameraActive.value = false
  isCameraFrozen.value = false
  frozenImage.value = null
  frozenFile.value = null
  if (videoElement.value) {
    videoElement.value.srcObject = null
  }
}

async function switchCameraFacing() {
  cameraFacingMode.value = cameraFacingMode.value === 'environment' ? 'user' : 'environment'
  selectedDeviceId.value = ''
  if (cameraActive.value) {
    await startCamera(false)
  }
}

async function onCameraDeviceChange() {
  if (selectedDeviceId.value) {
    await startCamera(true)
  }
}

function activateSyntheticDemo() {
  stopCamera()
  loadedImage.value = null
  selectedFile.value = null
  uploadedFileName.value = ''
  detectedPlants.value = []
  selectedPlantId.value = null
  customCropBox.value = null
  agrovisionResult.value = null
  sourceMode.value = 'synthetic'
  detectionMode.value = 'synthetic_plant'
  hasAnalyzedImage.value = true
  errorMessage.value = ''
  renderSinglePass(performance.now(), true)
  void runAgroVisionAnalysis({ silent: true })
  statusMessage.value =
    'Modo Planta Interactiva activo: simulando captura óptica y espectros RGB, NDVI y Térmico a 30 FPS.'
}

function loadFileImage(file: File) {
  errorMessage.value = ''
  statusMessage.value = ''

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    errorMessage.value = 'Selecciona una imagen en formato JPG, PNG o WebP.'
    return
  }
  if (file.size > maxImageSize) {
    errorMessage.value = 'La imagen supera el límite de 10 MB.'
    return
  }

  stopCamera()
  selectedFile.value = file
  detectedPlants.value = []
  selectedPlantId.value = null
  customCropBox.value = null
  agrovisionResult.value = null

  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  img.onload = async () => {
    URL.revokeObjectURL(objectUrl)
    loadedImage.value = img
    uploadedFileName.value = file.name
    sourceMode.value = 'image'
    if (detectionMode.value === 'synthetic_plant') {
      detectionMode.value = 'auto_vegetation'
    }
    hasAnalyzedImage.value = true
    renderSinglePass(performance.now(), true)
    await runAgroVisionAnalysis({ fileOverride: file })
    if (agrovisionResult.value) {
      statusMessage.value = `Foto "${file.name}" analizada con AgroVision ONNX: ${agrovisionResult.value.crop} · ${agrovisionResult.value.health_status}.`
    } else {
      statusMessage.value = `Foto "${file.name}" cargada y analizada.`
    }
  }
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl)
    errorMessage.value = 'No se pudo decodificar el archivo de imagen seleccionado.'
  }
  img.src = objectUrl
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) loadFileImage(file)
  input.value = ''
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files[0]
  if (file) loadFileImage(file)
}

function getCanvasNormPoint(event: PointerEvent): { x: number; y: number } | null {
  const canvas = outputCanvas.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  }
}

function onCanvasPointerDown(event: PointerEvent) {
  const pt = getCanvasNormPoint(event)
  if (!pt) return

  // 1. Verificar si el usuario hizo clic dentro de una planta ya detectada
  const hit = detectedPlants.value.find(
    p => pt.x >= p.x && pt.x <= p.x + p.width && pt.y >= p.y && pt.y <= p.y + p.height
  )
  if (hit && !event.shiftKey) {
    selectDetectedPlant(hit)
    return
  }

  // 2. Iniciar arrastre para seleccionar un área manual de planta
  isDraggingBox.value = true
  dragStartNorm.value = pt
  dragCurrentNorm.value = pt
}

function onCanvasPointerMove(event: PointerEvent) {
  const pt = getCanvasNormPoint(event)
  if (!pt) return
  pointerNorm.value = pt
  if (isDraggingBox.value) {
    dragCurrentNorm.value = pt
  }
}

function onCanvasPointerUp() {
  if (!isDraggingBox.value || !dragStartNorm.value || !dragCurrentNorm.value) {
    isDraggingBox.value = false
    return
  }
  isDraggingBox.value = false
  const x1 = Math.min(dragStartNorm.value.x, dragCurrentNorm.value.x)
  const y1 = Math.min(dragStartNorm.value.y, dragCurrentNorm.value.y)
  const x2 = Math.max(dragStartNorm.value.x, dragCurrentNorm.value.x)
  const y2 = Math.max(dragStartNorm.value.y, dragCurrentNorm.value.y)
  dragStartNorm.value = null
  dragCurrentNorm.value = null

  if (x2 - x1 > 0.04 && y2 - y1 > 0.04) {
    customCropBox.value = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
    selectedPlantId.value = null
    void runAgroVisionAnalysis({ cropBox: customCropBox.value })
    statusMessage.value = 'Área personalizada seleccionada y analizada con AgroVision AI + PlantLens.'
  }
}

function onCanvasPointerLeave() {
  pointerNorm.value = null
  if (isDraggingBox.value) {
    onCanvasPointerUp()
  }
}

async function selectDetectedPlant(plant: DetectedPlantBox) {
  selectedPlantId.value = plant.id
  customCropBox.value = null
  renderSinglePass(performance.now(), true)
  await runAgroVisionAnalysis({ selectedPlantId: plant.id })
  statusMessage.value = `Planta #${plant.id} seleccionada para diagnóstico de salud y cuidados.`
}

function clearCustomCropSelection() {
  customCropBox.value = null
  void runAgroVisionAnalysis()
}

function drawMultiPlantOverlays(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height

  // 1. Dibujar todas las áreas de plantas detectadas (estilo recuadro amarillo seleccionable)
  for (const plant of detectedPlants.value) {
    const px = plant.x * w
    const py = plant.y * h
    const pw = plant.width * w
    const ph = plant.height * h
    const isSelected = plant.id === selectedPlantId.value && !customCropBox.value

    ctx.save()
    ctx.strokeStyle = isSelected ? '#FACC15' : 'rgba(52, 211, 153, 0.85)'
    ctx.lineWidth = isSelected ? 3.5 : 2
    ctx.setLineDash(isSelected ? [] : [6, 4])
    ctx.strokeRect(px, py, pw, ph)

    if (isSelected) {
      // Esquinas blancas reforzadas para resaltar la selección activa
      const cLen = Math.min(20, pw * 0.22, ph * 0.22)
      ctx.setLineDash([])
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(px, py + cLen)
      ctx.lineTo(px, py)
      ctx.lineTo(px + cLen, py)
      ctx.moveTo(px + pw - cLen, py)
      ctx.lineTo(px + pw, py)
      ctx.lineTo(px + pw, py + cLen)
      ctx.stroke()
    }

    // Etiqueta superior del recuadro
    const tagText = isSelected ? `Planta #${plant.id} · SELECCIONADA` : `Planta #${plant.id} · Clic`
    ctx.font = 'bold 12px Inter, system-ui, sans-serif'
    const textW = ctx.measureText(tagText).width + 14
    const tagY = Math.max(4, py - 24)
    ctx.fillStyle = isSelected ? '#FACC15' : 'rgba(15, 23, 19, 0.88)'
    ctx.fillRect(px, tagY, textW, 20)
    ctx.fillStyle = isSelected ? '#141d16' : '#A7F3D0'
    ctx.fillText(tagText, px + 7, tagY + 14)
    ctx.restore()
  }

  // 2. Dibujar recuadro manual personalizado si existe
  if (customCropBox.value) {
    const bx = customCropBox.value.x * w
    const by = customCropBox.value.y * h
    const bw = customCropBox.value.width * w
    const bh = customCropBox.value.height * h
    ctx.save()
    ctx.strokeStyle = '#38BDF8'
    ctx.lineWidth = 3
    ctx.strokeRect(bx, by, bw, bh)
    ctx.fillStyle = '#38BDF8'
    ctx.fillRect(bx, Math.max(4, by - 22), 148, 20)
    ctx.fillStyle = '#082F49'
    ctx.font = 'bold 12px Inter, system-ui, sans-serif'
    ctx.fillText('Área Seleccionada', bx + 7, Math.max(18, by - 8))
    ctx.restore()
  }

  // 3. Dibujar recuadro en tiempo real mientras se arrastra el ratón
  if (isDraggingBox.value && dragStartNorm.value && dragCurrentNorm.value) {
    const x1 = Math.min(dragStartNorm.value.x, dragCurrentNorm.value.x) * w
    const y1 = Math.min(dragStartNorm.value.y, dragCurrentNorm.value.y) * h
    const bw = Math.abs(dragCurrentNorm.value.x - dragStartNorm.value.x) * w
    const bh = Math.abs(dragCurrentNorm.value.y - dragStartNorm.value.y) * h
    ctx.save()
    ctx.strokeStyle = '#FACC15'
    ctx.lineWidth = 2.5
    ctx.setLineDash([5, 4])
    ctx.strokeRect(x1, y1, bw, bh)
    ctx.restore()
  }
}

function renderSinglePass(now: number, forceUpdate = false) {
  const canvas = outputCanvas.value
  if (!canvas) return

  let activeSource: HTMLVideoElement | HTMLImageElement | null = null
  let effectiveDetectionMode: DetectionMode = detectionMode.value

  if (sourceMode.value === 'camera' && isCameraFrozen.value && frozenImage.value) {
    activeSource = frozenImage.value
  } else if (sourceMode.value === 'camera' && cameraActive.value && videoElement.value && videoElement.value.readyState >= 2) {
    activeSource = videoElement.value
  } else if (sourceMode.value === 'image' && loadedImage.value) {
    activeSource = loadedImage.value
  } else {
    effectiveDetectionMode = 'synthetic_plant'
  }

  const hudLabel = agrovisionResult.value
    ? `${agrovisionResult.value.crop} · ${agrovisionResult.value.health_status}`
    : undefined

  const hasAiBoxes = detectedPlants.value.length > 0 || customCropBox.value !== null

  const analysis = processMultispectralFrame(activeSource, canvas, {
    spectrumMode: spectrumMode.value,
    preset: activePreset.value,
    presetIntensity: presetIntensity.value,
    detectionMode: effectiveDetectionMode,
    sensitivity: sensitivity.value,
    isolatePlantBackground: isolatePlantBackground.value,
    showContours: showContours.value,
    showBoxOverlay: showContours.value && !hasAiBoxes,
    showHotspots: showHotspots.value,
    ambientTempC: ambientTempC.value,
    pointerNorm: pointerNorm.value,
    timeSec: now * 0.001,
    plantLabelHud: hudLabel
  })

  if ((showContours.value && (detectedPlants.value.length > 0 || customCropBox.value)) || isDraggingBox.value) {
    drawMultiPlantOverlays(canvas)
  }

  if (forceUpdate || now - lastAnalysisUpdate > 90 || !liveAnalysis.value) {
    liveAnalysis.value = analysis
    lastAnalysisUpdate = now
  }
}

function startRenderLoop() {
  const loop = (now: number) => {
    rafId = requestAnimationFrame(loop)
    frameCounter++
    if (now - fpsTimer >= 1000) {
      fpsCount.value = Math.min(120, Math.max(1, Math.round((frameCounter * 1000) / (now - fpsTimer))))
      frameCounter = 0
      fpsTimer = now
    }
    // En modo cámara en vivo o planta interactiva corremos a 60 FPS; en imagen estática a intervalos ligeros
    const targetIntervalMs = sourceMode.value === 'image' ? 45 : 15
    if (now - lastFrameTime >= targetIntervalMs) {
      lastFrameTime = now
      renderSinglePass(now)
    }
  }
  rafId = requestAnimationFrame(loop)
}

async function canvasToFile(filenamePrefix = 'agronia-multiespectral'): Promise<{ file: File; blob: Blob }> {
  const canvas = outputCanvas.value
  if (!canvas) throw new Error('El lienzo multiespectral no está listo.')
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('No se pudo exportar el cuadro actual.')
  const file = new File([blob], `${filenamePrefix}-${Date.now()}.jpg`, { type: 'image/jpeg' })
  return { file, blob }
}

async function getRawSourceFileForAI(): Promise<File> {
  if (sourceMode.value === 'image' && selectedFile.value) {
    return selectedFile.value
  }
  if (sourceMode.value === 'camera' && isCameraFrozen.value && frozenFile.value) {
    return frozenFile.value
  }
  if (sourceMode.value === 'camera' && cameraActive.value && videoElement.value && videoElement.value.readyState >= 2) {
    const v = videoElement.value
    const tmp = document.createElement('canvas')
    tmp.width = v.videoWidth || 1280
    tmp.height = v.videoHeight || 720
    const ctx = tmp.getContext('2d')
    if (ctx) {
      ctx.drawImage(v, 0, 0, tmp.width, tmp.height)
      const blob = await new Promise<Blob | null>(resolve => tmp.toBlob(resolve, 'image/jpeg', 0.92))
      if (blob) {
        return new File([blob], `agronia-live-${Date.now()}.jpg`, { type: 'image/jpeg' })
      }
    }
  }
  return (await canvasToFile('agronia-scan')).file
}

let rawAiScratchCanvas: HTMLCanvasElement | null = null

function getRawSourceCanvasForAI(): HTMLCanvasElement | null {
  if (!rawAiScratchCanvas) {
    rawAiScratchCanvas = document.createElement('canvas')
  }
  const tmp = rawAiScratchCanvas
  if (sourceMode.value === 'camera' && isCameraFrozen.value && frozenImage.value) {
    const sw = frozenImage.value.naturalWidth || 1280
    const sh = frozenImage.value.naturalHeight || 720
    const s = Math.min(1, 640 / Math.max(sw, sh))
    tmp.width = Math.max(128, Math.round(sw * s))
    tmp.height = Math.max(128, Math.round(sh * s))
    tmp.getContext('2d')?.drawImage(frozenImage.value, 0, 0, tmp.width, tmp.height)
    return tmp
  }
  if (sourceMode.value === 'camera' && cameraActive.value && videoElement.value && videoElement.value.readyState >= 2) {
    const v = videoElement.value
    const sw = v.videoWidth || 1280
    const sh = v.videoHeight || 720
    const s = Math.min(1, 640 / Math.max(sw, sh))
    tmp.width = Math.max(128, Math.round(sw * s))
    tmp.height = Math.max(128, Math.round(sh * s))
    tmp.getContext('2d')?.drawImage(v, 0, 0, tmp.width, tmp.height)
    return tmp
  }
  if (sourceMode.value === 'image' && loadedImage.value) {
    const sw = loadedImage.value.naturalWidth || 720
    const sh = loadedImage.value.naturalHeight || 540
    const s = Math.min(1, 640 / Math.max(sw, sh))
    tmp.width = Math.max(128, Math.round(sw * s))
    tmp.height = Math.max(128, Math.round(sh * s))
    tmp.getContext('2d')?.drawImage(loadedImage.value, 0, 0, tmp.width, tmp.height)
    return tmp
  }
  return outputCanvas.value
}

function applyAgroVisionResult(res: AgroVisionAnalysis) {
  agrovisionResult.value = res
  detectedPlants.value = res.detected_plants || []
  if (!customCropBox.value) {
    selectedPlantId.value = res.selected_plant_id || (detectedPlants.value[0]?.id ?? null)
  }
}

async function runAgroVisionAnalysis(opts?: {
  fileOverride?: File
  selectedPlantId?: number | null
  cropBox?: { x: number; y: number; width: number; height: number } | null
  forceLens?: boolean
  silent?: boolean
  realTimeTick?: boolean
}) {
  if (agrovisionInFlight && opts?.silent) return
  agrovisionInFlight = true
  try {
    // 1. Si hay un backend completo en línea (localhost/GPU con YOLO-World + OpenCLIP + ONNX), usarlo primero
    const useFullServer =
      Boolean(agrovisionBaseUrl) &&
      backendOnline.value &&
      Boolean(backendCapabilities.value?.onnx_ready) &&
      Boolean(backendCapabilities.value?.yolo_ready) &&
      Boolean(backendCapabilities.value?.clip_ready)

    if (useFullServer) {
      try {
        const file = opts?.fileOverride ?? (await getRawSourceFileForAI())
        const res = await analyzeAgroVisionBackend(agrovisionBaseUrl, file, {
          selectedPlantId: opts?.selectedPlantId ?? selectedPlantId.value,
          cropBox: opts?.cropBox !== undefined ? opts.cropBox : customCropBox.value,
          detectPlants: true,
          forceLens: opts?.forceLens ?? false,
          preset: activePreset.value,
          intensity: presetIntensity.value,
          ambientTempC: ambientTempC.value
        })
        applyAgroVisionResult(res)
        return
      } catch {
        backendOnline.value = false
      }
    }

    // 2. Motor Completo en el Navegador (ONNX Runtime Web + CLIP PlantLens + YOLOS Multi-Planta)
    // Funciona al 100% directamente en GitHub Pages sin depender de servidor externo!
    const rawCanvas = getRawSourceCanvasForAI()
    if (rawCanvas) {
      const res = await browserAgroVisionEngine.analyzeSource(rawCanvas, {
        selectedPlantId: opts?.selectedPlantId ?? selectedPlantId.value,
        cropBox: opts?.cropBox !== undefined ? opts.cropBox : customCropBox.value,
        detectPlants: true,
        forceLens: opts?.forceLens ?? false,
        realTimeTick: opts?.realTimeTick ?? false,
        ndviMean: liveAnalysis.value?.ndvi.mean,
        tempMeanC: liveAnalysis.value?.thermal.meanTempC,
        cwsi: liveAnalysis.value?.thermal.cwsi,
        plantCoveragePercent: liveAnalysis.value?.plantCoveragePercent
      })
      applyAgroVisionResult(res)
    }
  } finally {
    agrovisionInFlight = false
  }
}

async function analyzeImage() {
  if (!canAnalyze.value) return
  errorMessage.value = ''
  isAnalyzing.value = true

  try {
    renderSinglePass(performance.now(), true)
    hasAnalyzedImage.value = true

    const imageToSend = await getRawSourceFileForAI()
    await runAgroVisionAnalysis({ fileOverride: imageToSend })

    if (agrovisionResult.value) {
      statusMessage.value = agrovisionResult.value.in_trained_dataset
        ? `Diagnóstico AgroVision ONNX completado: ${agrovisionResult.value.crop} — ${agrovisionResult.value.health_status} (${agrovisionResult.value.inference_time_ms} ms).`
        : `Análisis PlantLens completado: ${agrovisionResult.value.crop} — ${agrovisionResult.value.health_status}.`
    } else {
      errorMessage.value = 'No se pudo obtener una imagen válida del lienzo para AgroVision ONNX.'
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo completar el análisis.'
  } finally {
    isAnalyzing.value = false
  }
}

function selectPresetFromTable(presetId: SimulationPresetId) {
  activePreset.value = presetId
  renderSinglePass(performance.now(), true)
  statusMessage.value = `Preset espectral "${SIMULATION_PRESETS[presetId].name}" aplicado sobre la vista multiespectral.`
}

async function downloadSnapshotPng() {
  const canvas = outputCanvas.value
  if (!canvas) return
  const dataUrl = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `agronia-${spectrumMode.value}-${activePreset.value}-${Date.now()}.png`
  link.click()
  statusMessage.value = `Captura ${spectrumMode.value.toUpperCase()} descargada.`
}

function exportTelemetryCsv() {
  const a = liveAnalysis.value
  if (!a) return
  const ag = agrovisionResult.value
  const rows = [
    [
      'Timestamp',
      'Nombre Planta',
      'Nombre Cientifico',
      'Origen Deteccion',
      'Modo Espectral',
      'Preset Simulado',
      'Intensidad Preset (%)',
      'Planta Detectada',
      'Cobertura Planta (%)',
      'Confianza IA (%)',
      'NDVI Promedio',
      'NDVI Min',
      'NDVI Max',
      'Alto Vigor (%)',
      'Vigor Moderado (%)',
      'Bajo Vigor (%)',
      'Tejido Critico (%)',
      'Temp Foliar Prom (°C)',
      'Temp Min (°C)',
      'Temp Max (°C)',
      'Temp Ambiente (°C)',
      'Indice CWSI',
      'Transpiracion (%)',
      'Humedad Foliar (%)',
      'Clorosis (%)',
      'Necrosis (%)',
      'Diagnostico AgroVision',
      'Recomendacion'
    ],
    [
      new Date().toISOString(),
      ag?.lens?.plant_name || ag?.crop || 'Pendiente de analisis',
      ag?.lens?.scientific_name || (ag?.in_trained_dataset ? ag.crop : 'Plantae'),
      ag ? ag.engine_mode : 'Multiespectral',
      spectrumMode.value.toUpperCase(),
      currentPresetConfig.value.name,
      Math.round(presetIntensity.value * 100),
      a.plantDetected ? 'SI' : 'NO',
      a.plantCoveragePercent,
      ag ? Math.round(ag.confidence * 100) : Math.round(a.detectionConfidence * 100),
      a.ndvi.mean,
      a.ndvi.min,
      a.ndvi.max,
      a.ndvi.highVigorPct,
      a.ndvi.moderateVigorPct,
      a.ndvi.lowVigorPct,
      a.ndvi.criticalPct,
      a.thermal.meanTempC,
      a.thermal.minTempC,
      a.thermal.maxTempC,
      a.thermal.ambientTempC,
      a.thermal.cwsi,
      a.thermal.transpirationPct,
      a.rgbMetrics.foliarMoisturePct,
      a.rgbMetrics.chlorosisPct,
      a.rgbMetrics.necrosisPct,
      ag?.disease_es || 'Pendiente de analisis AgroVision',
      ag?.recommendation || 'Analizar muestra con AgroVision ONNX + PlantLens'
    ]
  ]

  const csv = rows
    .map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `agronia-telemetria-multiespectral-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  statusMessage.value = 'Reporte CSV de telemetría multiespectral y diagnóstico AgroVision exportado.'
}

async function sendToFieldScouting() {
  if (!liveAnalysis.value) return
  try {
    const { file, blob } = await canvasToFile('agronia-campo')
    const previewUrl = URL.createObjectURL(blob)
    emit('capture', {
      file,
      previewUrl,
      analysis: liveAnalysis.value,
      preset: activePreset.value,
      spectrumMode: spectrumMode.value,
      agrovision: agrovisionResult.value
    })
    statusMessage.value =
      'Captura multiespectral y diagnóstico AgroVision transferidos al formulario de Registro de Campo.'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo transferir la captura.'
  }
}

onMounted(() => {
  unsubscribeEngineStatus = browserAgroVisionEngine.onStatusChange(status => {
    browserEngineStatus.value = status
  })
  void refreshCameraDevices()
  startRenderLoop()
  void browserAgroVisionEngine.warmUpAll()
  void checkAgroVisionHealth(agrovisionBaseUrl).then(health => {
    if (health) {
      backendOnline.value = true
      backendCapabilities.value = health
    }
  })
  window.setTimeout(() => {
    void runAgroVisionAnalysis({ silent: true })
  }, 250)
})

onBeforeUnmount(() => {
  unsubscribeEngineStatus?.()
  cancelAnimationFrame(rafId)
  stopCamera()
})
</script>

<template>
  <div class="multispectral-scanner space-y-5">
    <!-- Top Control Bar: Upload Photo, Camera Device Selection & Analizar Imagen Button -->
    <div
      class="rounded-2xl border border-emerald-300/15 bg-[#141d16]/95 p-4 shadow-xl backdrop-blur-md sm:p-5"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div class="flex items-center gap-3">
          <div class="rounded-xl bg-emerald-400/15 p-2.5 text-emerald-300">
            <ScanSearch class="h-5 w-5" />
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-300">
                VISIÓN ARTIFICIAL · AGROVISION ONNX + PLANTLENS
              </span>
              <span
                class="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200"
              >
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"></span>
                {{ fpsCount }} FPS
              </span>
              <span
                v-if="agrovisionResult"
                class="rounded-full border border-sky-300/30 bg-sky-400/15 px-2 py-0.5 text-[10px] font-bold text-sky-200"
              >
                IA: {{ agrovisionResult.inference_time_ms }} ms
              </span>
              <span
                class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
                :class="
                  browserEngineStatus.onnxReady
                    ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-200'
                    : 'border-amber-300/30 bg-amber-400/15 text-amber-200'
                "
              >
                <LoaderCircle v-if="browserEngineStatus.stage === 'loading'" class="h-3 w-3 animate-spin" />
                {{
                  browserEngineStatus.onnxReady && browserEngineStatus.clipReady
                    ? 'ONNX + CLIP Web Activo'
                    : browserEngineStatus.onnxReady
                      ? 'ONNX Web Activo'
                      : 'Cargando Modelos IA…'
                }}
              </span>
            </div>
            <h2 class="mt-0.5 text-lg font-semibold text-white">
              Diagnóstico de Plantas, Detección Multi-Planta y Cámara Multiespectral
            </h2>
          </div>
        </div>

        <!-- Source & Device Controls -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Upload Photo Button -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/40 bg-emerald-400/15 px-3.5 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-400/25"
            @click="fileInput?.click()"
          >
            <ImagePlus class="h-4 w-4 text-emerald-300" />
            {{ sourceMode === 'image' ? 'Cambiar imagen' : 'Seleccionar imagen' }}
          </button>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="sr-only"
            aria-label="Seleccionar imagen para diagnóstico"
            @change="onFileChange"
          />

          <!-- ANALIZAR IMAGEN BUTTON -->
          <button
            type="button"
            :disabled="!canAnalyze"
            class="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2 text-xs font-extrabold text-emerald-950 shadow-lg transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            @click="analyzeImage"
          >
            <LoaderCircle v-if="isAnalyzing" class="h-4 w-4 animate-spin" />
            <ScanSearch v-else class="h-4 w-4" />
            {{ isAnalyzing ? 'Analizando…' : 'Analizar imagen' }}
          </button>

          <!-- CAPTURAR / CONGELAR (Cuando la cámara está abierta) -->
          <button
            v-if="cameraActive && !isCameraFrozen"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/60 bg-amber-400/20 px-3.5 py-2 text-xs font-extrabold text-amber-200 shadow transition hover:bg-amber-400/30"
            title="Congela la toma actual para seleccionar y diagnosticar cada planta con calma"
            @click="freezeCameraCapture"
          >
            <Pause class="h-4 w-4 text-amber-300" />
            Capturar / Congelar
          </button>
          <button
            v-else-if="cameraActive && isCameraFrozen"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/60 bg-emerald-400/20 px-3.5 py-2 text-xs font-extrabold text-emerald-200 shadow transition hover:bg-emerald-400/30"
            @click="resumeLiveCamera"
          >
            <Play class="h-4 w-4 text-emerald-300" />
            Reanudar cámara
          </button>

          <!-- BOTÓN OPCIONAL DE TIEMPO REAL -->
          <button
            type="button"
            :aria-pressed="realTimeMode"
            class="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition"
            :class="
              realTimeMode
                ? 'border-emerald-300/60 bg-emerald-400/20 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.2)]'
                : 'border-white/15 bg-white/5 text-stone-300 hover:border-emerald-300/40 hover:bg-white/10'
            "
            title="Activa o desactiva el análisis continuo en tiempo real mientras la cámara está encendida (opcional)"
            @click="toggleRealTimeMode"
          >
            <Activity
              class="h-4 w-4"
              :class="realTimeMode && cameraActive && !isCameraFrozen ? 'animate-pulse text-emerald-300' : 'text-stone-400'"
            />
            <span>{{ realTimeMode ? 'Tiempo Real: ON' : 'Tiempo Real (Opcional)' }}</span>
          </button>

          <!-- Camera Device Selector -->
          <div class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5">
            <Video class="h-4 w-4 text-emerald-300" />
            <select
              v-model="selectedDeviceId"
              aria-label="Seleccionar cámara del dispositivo"
              class="max-w-[195px] truncate bg-transparent text-xs text-stone-200 focus:outline-none"
              @change="onCameraDeviceChange"
            >
              <option value="">Cámara ({{ cameraFacingMode === 'environment' ? 'Trasera' : 'Frontal' }})</option>
              <option v-for="cam in videoDevices" :key="cam.deviceId" :value="cam.deviceId">
                {{ cam.label }}
              </option>
            </select>
            <button
              type="button"
              class="rounded p-1 text-stone-400 transition hover:bg-white/10 hover:text-white"
              title="Actualizar lista de cámaras conectadas"
              aria-label="Actualizar lista de cámaras conectadas"
              @click="refreshCameraDevices"
            >
              <RefreshCw class="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            v-if="!cameraActive"
            type="button"
            :disabled="cameraStarting"
            class="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-200 transition hover:border-emerald-300/40 hover:bg-white/10 disabled:opacity-50"
            @click="startCamera(Boolean(selectedDeviceId))"
          >
            <Camera class="h-4 w-4 text-emerald-300" />
            {{ cameraStarting ? 'Conectando…' : 'Abrir cámara' }}
          </button>
          <button
            v-else
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/25"
            @click="stopCamera"
          >
            <CameraOff class="h-4 w-4" />
            Cerrar cámara
          </button>

          <button
            v-if="cameraActive"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-stone-200 transition hover:bg-white/10"
            @click="switchCameraFacing"
          >
            {{ cameraFacingMode === 'environment' ? 'Cámara frontal' : 'Cámara trasera' }}
          </button>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition"
            :class="
              sourceMode === 'synthetic' && !cameraActive
                ? 'border-amber-300/50 bg-amber-300/15 text-amber-200'
                : 'border-white/15 bg-white/5 text-stone-300 hover:bg-white/10'
            "
            @click="activateSyntheticDemo"
          >
            <Sparkles class="h-4 w-4 text-amber-300" />
            Planta Demo
          </button>
        </div>
      </div>

      <!-- Preset Selector Strip: Estrés Hídrico, Sobrehidratación, Con Plagas, Sin Plagas, Real -->
      <div class="mt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-bold uppercase tracking-wider text-stone-300">
            Simular Presets en los Diferentes Espectros (Haz clic para simular sobre la planta)
          </span>
          <div class="flex items-center gap-4 text-xs text-stone-300">
            <label class="flex items-center gap-2">
              <span class="text-stone-400">Intensidad del preset:</span>
              <input
                v-model.number="presetIntensity"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                :disabled="activePreset === 'live_raw'"
                class="h-1.5 w-24 accent-emerald-400"
              />
              <span class="w-9 font-mono font-bold text-emerald-300">
                {{ Math.round(presetIntensity * 100) }}%
              </span>
            </label>
            <label class="hidden items-center gap-2 sm:flex">
              <Thermometer class="h-3.5 w-3.5 text-orange-300" />
              <span class="text-stone-400">T° Ambiente:</span>
              <input
                v-model.number="ambientTempC"
                type="range"
                min="18"
                max="36"
                step="0.5"
                class="h-1.5 w-20 accent-orange-400"
              />
              <span class="w-12 font-mono font-bold text-orange-300">{{ ambientTempC.toFixed(1) }}°C</span>
            </label>
          </div>
        </div>

        <div class="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <button
            v-for="preset in presetList"
            :key="preset.id"
            type="button"
            :aria-pressed="activePreset === preset.id"
            class="group flex flex-col justify-between rounded-xl border p-3 text-left transition"
            :class="
              activePreset === preset.id
                ? 'border-emerald-300/60 bg-emerald-400/10 shadow-lg ring-1 ring-emerald-300/30'
                : 'border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/5'
            "
            @click="selectPresetFromTable(preset.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="inline-flex items-center gap-1.5 text-xs font-bold text-white">
                <Leaf v-if="preset.id === 'sin_plagas'" class="h-3.5 w-3.5 text-emerald-400" />
                <Flame v-else-if="preset.id === 'estres_hidrico'" class="h-3.5 w-3.5 text-orange-400" />
                <Droplets v-else-if="preset.id === 'sobre_hidratacion'" class="h-3.5 w-3.5 text-cyan-400" />
                <Bug v-else-if="preset.id === 'con_plagas'" class="h-3.5 w-3.5 text-red-400" />
                <Eye v-else class="h-3.5 w-3.5 text-sky-400" />
                {{ preset.shortLabel }}
              </span>
              <span
                class="rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider"
                :style="{
                  backgroundColor: `${preset.accentColor}22`,
                  color: preset.accentColor
                }"
              >
                {{ preset.badge }}
              </span>
            </div>
            <p class="mt-1.5 line-clamp-2 text-[11px] leading-snug text-stone-400">
              {{ preset.description }}
            </p>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Interactive Workspace: Multispectral Viewport + Telemetry & Interpretation -->
    <div
      class="grid gap-5"
      :class="props.compact ? 'lg:grid-cols-[1.25fr_0.95fr]' : 'lg:grid-cols-[1.3fr_0.9fr]'"
    >
      <!-- Left Column: Live Multispectral Viewport + Dropzone -->
      <section
        class="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#141d16]/95 p-4 shadow-xl sm:p-5"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <div>
          <!-- Spectrum Mode Switcher -->
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div
              class="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/40 p-1"
              role="group"
              aria-label="Espectro de visualización"
            >
              <button
                v-for="tab in spectrumTabs"
                :key="tab.id"
                type="button"
                :aria-pressed="spectrumMode === tab.id"
                class="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  spectrumMode === tab.id
                    ? 'bg-emerald-300 text-emerald-950 shadow'
                    : 'text-stone-300 hover:bg-white/5 hover:text-white'
                "
                @click="spectrumMode = tab.id"
              >
                <span class="h-2 w-2 rounded-full" :class="tab.badgeColor"></span>
                <span>{{ tab.label }}</span>
              </button>
            </div>

            <!-- Detection & Overlay Toggles -->
            <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
              <button
                type="button"
                :aria-pressed="showContours"
                class="rounded-lg border px-2.5 py-1 font-medium transition"
                :class="
                  showContours
                    ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200'
                    : 'border-white/10 bg-white/5 text-stone-400'
                "
                @click="showContours = !showContours"
              >
                Recuadro de Planta
              </button>
              <button
                type="button"
                :aria-pressed="isolatePlantBackground"
                class="rounded-lg border px-2.5 py-1 font-medium transition"
                :class="
                  isolatePlantBackground
                    ? 'border-sky-300/40 bg-sky-400/15 text-sky-200'
                    : 'border-white/10 bg-white/5 text-stone-400'
                "
                @click="isolatePlantBackground = !isolatePlantBackground"
              >
                Aislar Planta
              </button>
              <button
                type="button"
                :aria-pressed="showHotspots"
                class="rounded-lg border px-2.5 py-1 font-medium transition"
                :class="
                  showHotspots
                    ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
                    : 'border-white/10 bg-white/5 text-stone-400'
                "
                @click="showHotspots = !showHotspots"
              >
                Focos / Isotermas
              </button>
            </div>
          </div>

          <!-- Hidden raw video element feeding the real-time multispectral processor -->
          <video ref="videoElement" class="hidden" autoplay playsinline muted></video>

          <!-- Output Multispectral Canvas -->
          <div
            class="relative mt-3 overflow-hidden rounded-xl border border-white/15 bg-black shadow-inner"
          >
            <canvas
              ref="outputCanvas"
              width="720"
              height="540"
              class="block aspect-[4/3] w-full cursor-crosshair object-contain"
              aria-label="Visor multiespectral y detector multi-planta"
              @pointerdown="onCanvasPointerDown"
              @pointermove="onCanvasPointerMove"
              @pointerup="onCanvasPointerUp"
              @pointerleave="onCanvasPointerLeave"
            ></canvas>

            <!-- Top-left status pill -->
            <div
              class="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2"
            >
              <span
                class="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md"
              >
                <span
                  class="h-2 w-2 rounded-full"
                  :class="
                    isCameraFrozen
                      ? 'bg-amber-400'
                      : realTimeMode && cameraActive
                        ? 'animate-pulse bg-emerald-400'
                        : liveAnalysis?.plantDetected
                          ? 'bg-emerald-400'
                          : 'bg-amber-400'
                  "
                ></span>
                {{
                  isCameraFrozen
                    ? 'Imagen capturada (congelada)'
                    : realTimeMode && cameraActive
                      ? 'Tiempo Real activo'
                      : liveAnalysis?.plantDetected
                        ? `Área de planta detectada · ${liveAnalysis.plantCoveragePercent}% del cuadro`
                        : 'Detectando área de planta…'
                }}
              </span>
              <span
                v-if="sourceMode === 'image' && uploadedFileName"
                class="rounded-full border border-emerald-300/30 bg-black/80 px-2.5 py-1 text-[11px] font-medium text-emerald-200"
              >
                Foto: {{ uploadedFileName }}
              </span>
              <span
                class="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                :style="{ color: currentPresetConfig.accentColor }"
              >
                {{ currentPresetConfig.shortLabel }}
              </span>
            </div>

            <!-- Interactive Spot-Meter Overlay at bottom-left -->
            <div
              v-if="liveAnalysis?.spotReading"
              class="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-black/80 px-3 py-1.5 text-xs text-stone-200 backdrop-blur-md"
            >
              <span class="inline-flex items-center gap-1 font-semibold text-amber-300">
                <Crosshair class="h-3.5 w-3.5" />
                {{ liveAnalysis.spotReading.tissueState }}
              </span>
              <span>
                NDVI:
                <strong class="text-emerald-300">{{ liveAnalysis.spotReading.ndvi.toFixed(2) }}</strong>
              </span>
              <span>
                T°:
                <strong class="text-orange-300">{{ liveAnalysis.spotReading.tempC.toFixed(1) }} °C</strong>
              </span>
              <span v-if="liveAnalysis.spotReading.inPlant">
                Salud puntual:
                <strong class="text-white">{{ liveAnalysis.spotReading.healthPct }}%</strong>
              </span>
            </div>
          </div>

          <!-- Selector interactivo de plantas detectadas en el campo de visión -->
          <div
            v-if="detectedPlants.length > 0 || customCropBox"
            class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3.5 py-2.5 text-xs"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-bold text-amber-200">
                Plantas detectadas ({{ detectedPlants.length }}):
              </span>
              <button
                v-for="plant in detectedPlants"
                :key="plant.id"
                type="button"
                class="rounded-lg border px-2.5 py-1 text-xs font-bold transition"
                :class="
                  selectedPlantId === plant.id && !customCropBox
                    ? 'border-amber-300 bg-amber-300 text-amber-950 shadow'
                    : 'border-white/15 bg-black/30 text-stone-200 hover:border-amber-300/50 hover:text-white'
                "
                @click="selectDetectedPlant(plant)"
              >
                Planta #{{ plant.id }}
              </button>
              <button
                v-if="customCropBox"
                type="button"
                class="rounded-lg border border-sky-300/50 bg-sky-400/20 px-2.5 py-1 text-xs font-bold text-sky-200 hover:bg-sky-400/30"
                @click="clearCustomCropSelection"
              >
                Limpiar selección manual
              </button>
            </div>
            <span class="text-[11px] text-amber-100/80">
              Haz clic en un recuadro o arrastra el cursor sobre cualquier planta
            </span>
          </div>

          <!-- Quick Upload / Drag-and-Drop Banner under canvas -->
          <div
            class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-emerald-300/30 bg-emerald-400/5 px-4 py-2.5 text-xs text-stone-300"
          >
            <div class="flex items-center gap-2">
              <ImagePlus class="h-4 w-4 text-emerald-300" />
              <span>
                Arrastra aquí cualquier foto de una planta (JPG, PNG o WebP) o usa el botón
                <strong>Seleccionar imagen</strong>.
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-stone-200 transition hover:bg-white/10"
                @click="fileInput?.click()"
              >
                {{ sourceMode === 'image' ? 'Subir otra foto' : 'Subir foto' }}
              </button>
              <button
                type="button"
                :disabled="!canAnalyze"
                class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-300 px-3.5 py-1.5 text-xs font-bold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-50"
                @click="analyzeImage"
              >
                <ScanSearch class="h-3.5 w-3.5" />
                Analizar imagen
              </button>
            </div>
          </div>

          <!-- False-Color Scale Legend Bar & Segmentation Sensitivity -->
          <div
            class="mt-3 grid gap-3 rounded-xl border border-white/10 bg-black/25 p-3 sm:grid-cols-2"
          >
            <!-- Dynamic Colorbar Legend -->
            <div>
              <div class="flex items-center justify-between text-[11px] font-semibold text-stone-300">
                <span v-if="spectrumMode === 'ndvi'">Escala Multiespectral NDVI (-0.1 a +1.0)</span>
                <span v-else-if="spectrumMode === 'thermal'">
                  Escala Termográfica LWIR (17 °C a 39 °C)
                </span>
                <span v-else>Índice de Vigor y Segmentación IA</span>
                <span class="text-stone-400">Pasa el cursor sobre la planta</span>
              </div>
              <div
                v-if="spectrumMode === 'ndvi' || spectrumMode === 'split'"
                class="mt-1.5 h-2.5 w-full rounded-full bg-gradient-to-r from-[#b91c1c] via-[#f97316] via-[#facc15] to-[#15803d]"
              ></div>
              <div
                v-else-if="spectrumMode === 'thermal'"
                class="mt-1.5 h-2.5 w-full rounded-full bg-gradient-to-r from-[#1e3a8a] via-[#06b6d4] via-[#facc15] via-[#ef4444] to-[#ffffff]"
              ></div>
              <div
                v-else
                class="mt-1.5 h-2.5 w-full rounded-full bg-gradient-to-r from-[#dc2626] via-[#eab308] to-[#10b981]"
              ></div>
              <div class="mt-1 flex justify-between text-[10px] text-stone-400">
                <template v-if="spectrumMode === 'thermal'">
                  <span>18°C (Sobreenfriado)</span>
                  <span>25°C (Óptimo)</span>
                  <span>32°C (Alerta)</span>
                  <span>38°C+ (Sequía)</span>
                </template>
                <template v-else>
                  <span>0.10 (Necrosis/Suelo)</span>
                  <span>0.35 (Estrés)</span>
                  <span>0.60 (Moderado)</span>
                  <span>0.85+ (Alto Vigor)</span>
                </template>
              </div>
            </div>

            <!-- Whole-plant Detection Mode & Threshold -->
            <div class="flex flex-col justify-between gap-1.5">
              <div class="flex items-center justify-between gap-2 text-[11px]">
                <span class="flex items-center gap-1 font-semibold text-stone-300">
                  <Sliders class="h-3.5 w-3.5 text-emerald-300" />
                  Modo de Detección de Área:
                </span>
                <select
                  v-model="detectionMode"
                  aria-label="Modo de detección del área de la planta"
                  class="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-stone-200"
                >
                  <option value="auto_vegetation">IA Follaje Completo (ExG + VARI)</option>
                  <option value="assisted_center">Foco Central Asistido (Todo color)</option>
                  <option value="synthetic_plant">Planta Virtual de Calibración</option>
                </select>
              </div>
              <label class="flex items-center justify-between gap-2 text-[11px] text-stone-400">
                <span>Sensibilidad de bordes foliares:</span>
                <input
                  v-model.number="sensitivity"
                  type="range"
                  min="0.2"
                  max="0.85"
                  step="0.05"
                  class="h-1.5 w-28 accent-emerald-400"
                />
                <span class="font-mono text-stone-200">{{ Math.round(sensitivity * 100) }}%</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Bottom Action Bar -->
        <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              :disabled="!canAnalyze"
              class="inline-flex items-center gap-1.5 rounded-xl bg-emerald-300 px-4 py-2 text-xs font-bold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-50"
              @click="analyzeImage"
            >
              <LoaderCircle v-if="isAnalyzing" class="h-4 w-4 animate-spin" />
              <ShieldCheck v-else class="h-4 w-4" />
              {{ isAnalyzing ? 'Analizando imagen…' : 'Analizar imagen y actualizar datos' }}
            </button>

            <button
              v-if="props.showFieldScoutingAction"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/40 bg-amber-300/15 px-3.5 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-300/25"
              @click="sendToFieldScouting"
            >
              <Camera class="h-4 w-4" />
              Usar captura en Registro de Campo
            </button>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-stone-200 transition hover:bg-white/10"
              @click="downloadSnapshotPng"
            >
              <Download class="h-3.5 w-3.5 text-emerald-300" />
              Descargar PNG
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-stone-200 transition hover:bg-white/10"
              @click="exportTelemetryCsv"
            >
              <Download class="h-3.5 w-3.5 text-sky-300" />
              Exportar CSV
            </button>
          </div>
        </div>

        <p v-if="statusMessage" class="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-300" role="status">
          <CheckCircle2 class="h-4 w-4 shrink-0" />
          {{ statusMessage }}
        </p>
        <p v-if="errorMessage" class="mt-2.5 flex items-center gap-1.5 text-xs text-red-300" role="alert">
          <AlertCircle class="h-4 w-4 shrink-0" />
          {{ errorMessage }}
        </p>
      </section>

      <!-- Right Column: Real-Time Multispectral Interpretation & Preset Simulation Table -->
      <section class="flex flex-col gap-4">
        <!-- Card 0: Botanical Species & Google Lens Identification Card -->
        <div
          class="rounded-2xl border border-sky-400/25 bg-[#131d19]/95 p-4 shadow-xl sm:p-5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="rounded-xl bg-sky-400/15 p-2 text-sky-300">
                <Sprout class="h-5 w-5" />
              </div>
              <div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-sky-300">
                  PLANTLENS AI · IDENTIFICACIÓN BOTÁNICA Y CUIDADOS
                </span>
                <h3 class="text-base font-semibold text-white">
                  Especie, Ficha Botánica y Recomendaciones
                </h3>
              </div>
            </div>

            <button
              type="button"
              :disabled="!canAnalyze"
              class="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 py-1.5 text-xs font-bold text-sky-100 transition hover:bg-sky-500/30 disabled:opacity-50"
              @click="runAgroVisionAnalysis({ forceLens: true })"
            >
              <Sparkles class="h-3.5 w-3.5 text-sky-300" />
              Consultar PlantLens AI
            </button>
          </div>

          <div v-if="agrovisionResult" class="mt-3.5 space-y-3">
            <!-- Primary Identified Plant Banner (AgroVision ONNX + PlantLens AI) -->
            <div
              class="flex flex-col justify-between gap-3 rounded-xl border border-sky-300/25 bg-black/35 p-3.5 sm:flex-row sm:items-center"
            >
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-md bg-sky-400/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-200"
                  >
                    {{
                      agrovisionResult.lens
                        ? 'PlantLens AI Integrado (CLIP + Wikipedia)'
                        : agrovisionResult.in_trained_dataset
                          ? 'Cultivo del Dataset Entrenado'
                          : 'Evaluación AgroVision AI'
                    }}
                  </span>
                  <span
                    class="rounded-md bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
                  >
                    Coincidencia
                    {{
                      agrovisionResult.lens
                        ? `${agrovisionResult.lens.confidence_pct}%`
                        : `${Math.round(agrovisionResult.confidence * 100)}%`
                    }}
                  </span>
                </div>

                <h4 class="text-xl font-extrabold text-white">
                  {{ agrovisionResult.lens ? agrovisionResult.lens.plant_name : agrovisionResult.crop }}
                </h4>
                <p v-if="agrovisionResult.lens?.scientific_name" class="text-xs italic text-sky-200/90">
                  Nombre científico:
                  <strong class="font-semibold">{{ agrovisionResult.lens.scientific_name }}</strong>
                </p>
              </div>
            </div>

            <!-- Cuidados específicos de PlantLens (Luz, Riego, Sustrato) -->
            <div
              v-if="agrovisionResult.lens"
              class="space-y-2 rounded-xl border border-sky-300/20 bg-black/30 p-3 text-xs text-stone-200"
            >
              <div class="grid gap-2 sm:grid-cols-2">
                <div class="rounded-lg bg-white/5 p-2.5">
                  <span class="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-300">
                    <Sun class="h-3.5 w-3.5" /> Luz Solar
                  </span>
                  <p class="mt-1 text-[11px] leading-snug text-stone-200">
                    {{ agrovisionResult.lens.light }}
                  </p>
                </div>
                <div class="rounded-lg bg-white/5 p-2.5">
                  <span class="flex items-center gap-1 text-[10px] font-bold uppercase text-cyan-300">
                    <Droplets class="h-3.5 w-3.5" /> Riego
                  </span>
                  <p class="mt-1 text-[11px] leading-snug text-stone-200">
                    {{ agrovisionResult.lens.water }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg bg-white/5 p-2.5">
                <span class="block text-[10px] font-bold uppercase text-emerald-300">
                  Sustrato y Clima Recomendado
                </span>
                <p class="mt-1 text-[11px] leading-snug text-stone-200">
                  {{ agrovisionResult.lens.soil_temp }}
                </p>
              </div>
              <p v-if="agrovisionResult.lens.wiki_summary" class="text-[11px] leading-relaxed text-sky-200/90">
                <strong class="text-sky-300">Ficha Botánica:</strong> {{ agrovisionResult.lens.wiki_summary }}
              </p>
            </div>

            <div
              v-else
              class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-stone-300"
            >
              <span>
                Cultivo clasificado directamente por el modelo fitosanitario entrenado (15 clases). Puedes consultar
                PlantLens AI para obtener su ficha botánica y cuidados generales.
              </span>
              <button
                type="button"
                class="shrink-0 rounded-lg border border-sky-400/40 bg-sky-500/20 px-2.5 py-1.5 text-[11px] font-bold text-sky-100 transition hover:bg-sky-500/30"
                @click="runAgroVisionAnalysis({ forceLens: true })"
              >
                Abrir PlantLens AI
              </button>
            </div>
          </div>

          <div
            v-else
            class="mt-3.5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-stone-300"
          >
            <LoaderCircle v-if="browserEngineStatus.stage === 'loading'" class="h-4 w-4 animate-spin text-sky-300" />
            <span>
              {{
                browserEngineStatus.stage === 'loading'
                  ? 'Inicializando modelo AgroVision ONNX y PlantLens AI…'
                  : 'Captura un cuadro, sube una foto o presiona "Analizar imagen" para identificar la especie con PlantLens AI.'
              }}
            </span>
          </div>
        </div>

        <!-- Card 1: AI Recognition & Physiological Classification (AgroVision ONNX + PlantLens) -->
        <div class="rounded-2xl border border-white/10 bg-[#141d16]/95 p-4 shadow-xl sm:p-5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="rounded-xl bg-emerald-400/15 p-2 text-emerald-300">
                <Activity class="h-5 w-5" />
              </div>
              <div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                  AGROVISION AI · EFFICIENTNET-B2 ONNX + PLANTLENS
                </span>
                <h3 class="text-base font-semibold text-white">
                  {{
                    agrovisionResult && selectedPlantId
                      ? `Diagnóstico de Planta #${selectedPlantId}`
                      : 'Diagnóstico Fitosanitario IA (ONNX + PlantLens)'
                  }}
                </h3>
              </div>
            </div>
            <span
              v-if="agrovisionResult"
              class="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-200"
            >
              Confianza {{ Math.round(agrovisionResult.confidence * 100) }}%
            </span>
          </div>

          <div v-if="liveAnalysis && hasAnalyzedImage" class="mt-4 space-y-3">
            <!-- Aviso explícito cuando la planta NO está en el dataset entrenado -->
            <div
              v-if="agrovisionResult?.detection_mode === 'OUT_OF_DATASET'"
              class="flex items-start gap-2.5 rounded-xl border border-amber-300/40 bg-amber-400/10 p-3 text-xs text-amber-100"
            >
              <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <strong class="block text-amber-200">Especie fuera del dataset fitosanitario entrenado</strong>
                <span>
                  Le hace falta información de esta planta en el dataset base para determinar su estado de salud
                  patológica exacta; se muestra evaluación visual multimodal con PlantLens AI.
                </span>
              </div>
            </div>

            <div
              v-if="agrovisionResult"
              class="rounded-xl border p-3.5"
              :class="
                agrovisionResult.health_status.includes('SALUDABLE')
                  ? 'border-emerald-400/40 bg-emerald-500/10'
                  : agrovisionResult.detection_mode === 'OUT_OF_DATASET'
                    ? 'border-sky-400/40 bg-sky-500/10'
                    : 'border-red-400/40 bg-red-500/10'
              "
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span
                  class="rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
                  :class="
                    agrovisionResult.health_status.includes('SALUDABLE')
                      ? 'bg-emerald-400/20 text-emerald-200'
                      : 'bg-amber-400/20 text-amber-200'
                  "
                >
                  ESTADO: {{ agrovisionResult.health_status }}
                </span>
                <span class="text-xs text-stone-300">
                  Severidad: <strong class="text-white">{{ agrovisionResult.severity }}</strong>
                </span>
              </div>

              <h4 class="mt-1.5 text-lg font-bold text-white">
                {{ agrovisionResult.crop }}
              </h4>

              <p class="mt-1 text-xs font-medium text-stone-200">
                {{ agrovisionResult.disease_es }}
              </p>

              <p class="mt-1.5 text-xs leading-relaxed text-stone-300">
                {{ agrovisionResult.cause }}
              </p>

              <div class="mt-2.5 rounded-lg bg-black/30 p-2.5 text-xs text-emerald-200">
                <strong class="block text-[10px] uppercase tracking-wider text-emerald-300">
                  Recomendación y cuidados:
                </strong>
                {{ agrovisionResult.recommendation }}
              </div>

              <!-- Top-3 Predicciones del modelo entrenado cuando aplica -->
              <div
                v-if="agrovisionResult.in_trained_dataset && agrovisionResult.top_k?.length"
                class="mt-3 space-y-1.5 border-t border-white/10 pt-2.5"
              >
                <span class="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Top-3 Predicciones (EfficientNet-B2 ONNX)
                </span>
                <div
                  v-for="pred in agrovisionResult.top_k"
                  :key="pred.class_name"
                  class="space-y-0.5 text-[11px]"
                >
                  <div class="flex justify-between text-stone-200">
                    <span class="truncate pr-2">{{ formatDiseaseName(pred.class_name) }}</span>
                    <span class="font-mono font-bold text-emerald-300">{{ pred.confidence_pct }}%</span>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                    <div
                      class="h-full rounded-full bg-emerald-400 transition-all duration-300"
                      :style="{ width: `${pred.confidence_pct}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else
              class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-3.5 text-xs text-stone-300"
            >
              <div class="flex items-center gap-2">
                <LoaderCircle class="h-4 w-4 animate-spin text-emerald-300" />
                <span>Ejecutando modelo AgroVision EfficientNet-B2 ONNX…</span>
              </div>
              <button
                type="button"
                class="rounded-lg bg-emerald-400/20 px-2.5 py-1 text-[11px] font-bold text-emerald-200 transition hover:bg-emerald-400/30"
                @click="analyzeImage"
              >
                Analizar ahora
              </button>
            </div>

            <!-- Whole-plant geometry summary -->
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
              <div class="rounded-xl border border-white/10 bg-black/25 p-2.5">
                <span class="block text-[10px] uppercase text-stone-400">Área Planta</span>
                <strong class="mt-0.5 block text-base text-white">
                  {{ liveAnalysis.plantCoveragePercent }}%
                </strong>
                <span class="text-[10px] text-emerald-300">Dosel total</span>
              </div>
              <div class="rounded-xl border border-white/10 bg-black/25 p-2.5">
                <span class="block text-[10px] uppercase text-stone-400">Humedad Foliar</span>
                <strong class="mt-0.5 block text-base text-cyan-300">
                  {{ liveAnalysis.rgbMetrics.foliarMoisturePct }}%
                </strong>
                <span class="text-[10px] text-stone-400">Turgencia {{ liveAnalysis.rgbMetrics.turgorPct }}%</span>
              </div>
              <div class="rounded-xl border border-white/10 bg-black/25 p-2.5">
                <span class="block text-[10px] uppercase text-stone-400">Índice CWSI</span>
                <strong
                  class="mt-0.5 block text-base"
                  :class="liveAnalysis.thermal.cwsi > 0.5 ? 'text-orange-300' : 'text-emerald-300'"
                >
                  {{ liveAnalysis.thermal.cwsi.toFixed(2) }}
                </strong>
                <span class="text-[10px] text-stone-400">Estrés hídrico</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Card 2: Multiespectral NDVI & Thermal Data -->
        <div
          v-if="liveAnalysis"
          class="rounded-2xl border border-white/10 bg-[#141d16]/95 p-4 shadow-xl sm:p-5"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Layers class="h-4 w-4 text-lime-300" />
              <h4 class="text-sm font-bold text-white">Datos Espectrales: NDVI, Térmico y RGB</h4>
            </div>
            <div class="flex items-center gap-2 font-mono text-xs font-bold">
              <span class="rounded bg-lime-400/15 px-2 py-0.5 text-lime-300">
                NDVI {{ liveAnalysis.ndvi.mean.toFixed(2) }}
              </span>
              <span class="rounded bg-orange-400/15 px-2 py-0.5 text-orange-300">
                {{ liveAnalysis.thermal.meanTempC.toFixed(1) }} °C
              </span>
            </div>
          </div>

          <!-- Stacked Vigor Distribution Bar -->
          <div class="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-black/40 p-0.5">
            <div
              class="h-full bg-emerald-500 transition-all duration-300"
              :style="{ width: `${liveAnalysis.ndvi.highVigorPct}%` }"
              title="Alto Vigor"
            ></div>
            <div
              class="h-full bg-yellow-400 transition-all duration-300"
              :style="{ width: `${liveAnalysis.ndvi.moderateVigorPct}%` }"
              title="Vigor Moderado"
            ></div>
            <div
              class="h-full bg-orange-500 transition-all duration-300"
              :style="{ width: `${liveAnalysis.ndvi.lowVigorPct}%` }"
              title="Bajo Vigor / Clorosis"
            ></div>
            <div
              class="h-full bg-red-600 transition-all duration-300"
              :style="{ width: `${liveAnalysis.ndvi.criticalPct}%` }"
              title="Necrosis / Daño Severo"
            ></div>
          </div>

          <div class="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
            <div class="flex items-center justify-between rounded-lg bg-black/20 px-2.5 py-1.5">
              <span class="flex items-center gap-1.5 text-stone-300">
                <span class="h-2 w-2 rounded-full bg-emerald-500"></span>Alto vigor (NDVI)
              </span>
              <strong class="text-white">{{ liveAnalysis.ndvi.highVigorPct }}%</strong>
            </div>
            <div class="flex items-center justify-between rounded-lg bg-black/20 px-2.5 py-1.5">
              <span class="flex items-center gap-1.5 text-stone-300">
                <span class="h-2 w-2 rounded-full bg-yellow-400"></span>Vigor moderado
              </span>
              <strong class="text-white">{{ liveAnalysis.ndvi.moderateVigorPct }}%</strong>
            </div>
            <div class="flex items-center justify-between rounded-lg bg-black/20 px-2.5 py-1.5">
              <span class="flex items-center gap-1.5 text-stone-300">
                <span class="h-2 w-2 rounded-full bg-orange-500"></span>Clorosis (RGB/NDVI)
              </span>
              <strong class="text-white">{{ liveAnalysis.ndvi.lowVigorPct }}%</strong>
            </div>
            <div class="flex items-center justify-between rounded-lg bg-black/20 px-2.5 py-1.5">
              <span class="flex items-center gap-1.5 text-stone-300">
                <span class="h-2 w-2 rounded-full bg-red-600"></span>Necrosis / Plaga
              </span>
              <strong class="text-white">{{ liveAnalysis.ndvi.criticalPct }}%</strong>
            </div>
          </div>

          <div class="mt-3 space-y-2 text-xs">
            <div class="flex items-center justify-between rounded-lg bg-black/25 px-3 py-1.5">
              <span class="text-stone-400">Rango Térmico Foliar (Mín / Máx)</span>
              <strong class="text-stone-100">
                {{ liveAnalysis.thermal.minTempC.toFixed(1) }} °C —
                {{ liveAnalysis.thermal.maxTempC.toFixed(1) }} °C
              </strong>
            </div>
            <div class="flex items-center justify-between rounded-lg bg-black/25 px-3 py-1.5">
              <span class="text-stone-400">Transpiración Estomática / Conductancia</span>
              <strong class="text-emerald-300">{{ liveAnalysis.thermal.transpirationPct }}%</strong>
            </div>
          </div>
        </div>

        <!-- Card 3: Comparative Preset Simulation Table (Sin Plagas, Estrés Hídrico, Sobrehidratación, Con Plagas) -->
        <div
          v-if="liveAnalysis"
          class="rounded-2xl border border-white/10 bg-[#141d16]/95 p-4 shadow-xl sm:p-5"
        >
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                SIMULACIÓN MULTIESPECTRAL POR ESCENARIO
              </span>
              <h4 class="text-sm font-bold text-white">
                Comparativa de Presets sobre la Planta Detectada
              </h4>
            </div>
            <span class="text-[10px] text-stone-400">Haz clic para aplicar</span>
          </div>

          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-white/10 text-[10px] uppercase text-stone-400">
                  <th class="pb-2 pr-2">Preset</th>
                  <th class="pb-2 px-1.5">NDVI</th>
                  <th class="pb-2 px-1.5">Térmico</th>
                  <th class="pb-2 px-1.5">Humedad</th>
                  <th class="pb-2 pl-1.5 text-right">Daño</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                <tr
                  v-for="row in liveAnalysis.presetComparison"
                  :key="row.id"
                  class="cursor-pointer transition hover:bg-white/5"
                  :class="activePreset === row.id ? 'bg-emerald-400/10 font-semibold' : ''"
                  @click="selectPresetFromTable(row.id)"
                >
                  <td class="py-2 pr-2">
                    <div class="flex items-center gap-1.5">
                      <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        :style="{ backgroundColor: row.accentColor }"
                      ></span>
                      <span class="text-white">{{ row.shortLabel }}</span>
                    </div>
                  </td>
                  <td class="py-2 px-1.5 font-mono text-lime-300">{{ row.ndviMean.toFixed(2) }}</td>
                  <td class="py-2 px-1.5 font-mono text-orange-300">{{ row.tempMeanC.toFixed(1) }}°C</td>
                  <td class="py-2 px-1.5 font-mono text-cyan-300">{{ row.foliarMoisturePct }}%</td>
                  <td class="py-2 pl-1.5 text-right font-mono text-stone-200">
                    {{ row.affectedAreaPct }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
