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
  ExternalLink,
  Eye,
  Flame,
  ImagePlus,
  Layers,
  Leaf,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sprout,
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
import { analyzeMultispectralBackend, type PlantDiagnosis } from '../../services/plantDiagnosis'
import {
  identifyPlantSpecies,
  searchBotanicalTaxonOnline,
  submitImageToGoogleLens,
  type BotanicalCandidate,
  type PlantSpeciesIdentificationResult
} from '../../services/plantSpeciesIdentification'

export interface MultispectralCapturePayload {
  file: File
  previewUrl: string
  analysis: MultispectralFrameAnalysis
  preset: SimulationPresetId
  spectrumMode: SpectrumMode
  species?: BotanicalCandidate
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
const endpoint = import.meta.env.VITE_PLANT_DIAGNOSIS_API_URL?.trim() ?? ''
const hasEndpoint = computed(() => endpoint.length > 0)

// Media & DOM refs
const fileInput = ref<HTMLInputElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const outputCanvas = ref<HTMLCanvasElement | null>(null)
const loadedImage = shallowRef<HTMLImageElement | null>(null)
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
const sourceMode = ref<'camera' | 'image' | 'synthetic'>('synthetic')

// Multispectral & Preset controls
const spectrumMode = ref<SpectrumMode>('rgb')
const activePreset = ref<SimulationPresetId>('live_raw')
const presetIntensity = ref(0.85)
const detectionMode = ref<DetectionMode>('auto_vegetation')
const sensitivity = ref(0.55)
const isolatePlantBackground = ref(true)
const showContours = ref(true)
const showHotspots = ref(true)
const ambientTempC = ref(25.0)
const pointerNorm = ref<{ x: number; y: number } | null>(null)

// Live analysis & backend state
const liveAnalysis = ref<MultispectralFrameAnalysis | null>(null)
const backendDiagnosis = ref<PlantDiagnosis | null>(null)
const isAnalyzing = ref(false)
const hasAnalyzedImage = ref(true)
const statusMessage = ref('')
const errorMessage = ref('')
const fpsCount = ref(30)

// Botanical Species & Google Lens identification state
const speciesResult = ref<PlantSpeciesIdentificationResult | null>(null)
const isIdentifyingSpecies = ref(false)
const autoConnectGoogleLens = ref(true)
const customSpeciesQuery = ref('')
const isSearchingTaxon = ref(false)

let rafId = 0
let cameraSpeciesTimer: number | null = null
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
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        : {
            facingMode: { ideal: cameraFacingMode.value },
            width: { ideal: 1280 },
            height: { ideal: 720 }
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
    sourceMode.value = 'camera'
    hasAnalyzedImage.value = true
    if (detectionMode.value === 'synthetic_plant') {
      detectionMode.value = 'auto_vegetation'
    }

    // Automatically identify the plant species once the camera stream warms up
    window.setTimeout(() => {
      if (cameraActive.value && videoElement.value) {
        renderSinglePass(performance.now(), true)
        void runSpeciesIdentification(videoElement.value, activeTrack?.label || 'camara_en_vivo')
        if (autoConnectGoogleLens.value) {
          void connectAndUploadToGoogleLens()
        }
      }
    }, 650)

    // Periodically refresh in-app botanical species identification while camera is active
    if (cameraSpeciesTimer !== null) {
      window.clearInterval(cameraSpeciesTimer)
    }
    cameraSpeciesTimer = window.setInterval(() => {
      if (cameraActive.value && videoElement.value && !isIdentifyingSpecies.value) {
        void runSpeciesIdentification(videoElement.value, activeTrack?.label || 'camara_en_vivo')
      }
    }, 5500)

    statusMessage.value = `Cámara conectada (${activeTrack?.label || 'dispositivo activo'}). Identificando tipo y nombre de planta en tiempo real.`
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

function stopCamera() {
  if (cameraSpeciesTimer !== null) {
    window.clearInterval(cameraSpeciesTimer)
    cameraSpeciesTimer = null
  }
  cameraStream.value?.getTracks().forEach(track => {
    track.onended = null
    track.stop()
  })
  cameraStream.value = null
  cameraActive.value = false
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
  sourceMode.value = 'synthetic'
  detectionMode.value = 'synthetic_plant'
  hasAnalyzedImage.value = true
  errorMessage.value = ''
  renderSinglePass(performance.now(), true)
  void runSpeciesIdentification(outputCanvas.value, 'solanum_lycopersicum_demo')
  statusMessage.value =
    'Modo Planta Interactiva activo: simulando captura óptica y espectros RGB, NDVI y Térmico a 30 FPS.'
}

async function runSpeciesIdentification(
  src?: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null,
  hintName = ''
) {
  isIdentifyingSpecies.value = true
  try {
    const activeSrc =
      src ??
      (sourceMode.value === 'camera' && cameraActive.value
        ? videoElement.value
        : sourceMode.value === 'image'
          ? loadedImage.value
          : outputCanvas.value)

    const result = await identifyPlantSpecies({
      source: activeSrc,
      fileName: hintName || uploadedFileName.value,
      backendDiseaseLabel: backendDiagnosis.value?.disease || '',
      boundingBox: liveAnalysis.value?.boundingBox ?? null,
      polygonContour: liveAnalysis.value?.polygonContour ?? [],
      plantCoveragePercent: liveAnalysis.value?.plantCoveragePercent ?? 35
    })
    speciesResult.value = result
  } finally {
    isIdentifyingSpecies.value = false
  }
}

async function connectAndUploadToGoogleLens() {
  errorMessage.value = ''
  let sourceToSend: File | HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null = null

  if (sourceMode.value === 'image' && selectedFile.value) {
    sourceToSend = selectedFile.value
  } else if (sourceMode.value === 'camera' && cameraActive.value && videoElement.value) {
    sourceToSend = videoElement.value
  } else if (loadedImage.value) {
    sourceToSend = loadedImage.value
  } else if (outputCanvas.value) {
    sourceToSend = outputCanvas.value
  }

  if (!sourceToSend) {
    errorMessage.value = 'Sube una imagen o enciende la cámara para enviarla a Google Lens.'
    return
  }

  const submitted = await submitImageToGoogleLens(sourceToSend)
  if (submitted) {
    statusMessage.value =
      'Imagen enviada a Google Lens para identificación visual de especie y nombre botánico.'
  }
}

function selectSpeciesCandidate(candidate: BotanicalCandidate) {
  if (!speciesResult.value) return
  const currentPrimary = speciesResult.value.primary
  const remaining = speciesResult.value.alternatives.filter(alt => alt.id !== candidate.id)
  if (currentPrimary.id !== candidate.id) {
    remaining.unshift(currentPrimary)
  }
  speciesResult.value = {
    ...speciesResult.value,
    primary: candidate,
    alternatives: remaining.slice(0, 3)
  }
  statusMessage.value = `Planta seleccionada: ${candidate.commonName} (${candidate.scientificName}) · ${candidate.plantType}.`
}

async function handleCustomTaxonSearch() {
  const query = customSpeciesQuery.value.trim()
  if (!query) return
  isSearchingTaxon.value = true
  try {
    const found = await searchBotanicalTaxonOnline(query)
    if (found && speciesResult.value) {
      speciesResult.value = {
        ...speciesResult.value,
        identifiedAt: new Date().toLocaleTimeString(),
        source: 'google-lens-sync',
        primary: found,
        alternatives: [
          speciesResult.value.primary,
          ...speciesResult.value.alternatives.filter(a => a.id !== found.id)
        ].slice(0, 3)
      }
      customSpeciesQuery.value = ''
      statusMessage.value = `Especie sincronizada: ${found.commonName} (${found.scientificName}) · ${found.plantType}.`
    } else {
      errorMessage.value = `No se encontró el taxón "${query}". Prueba con el nombre común o científico (ej. Tomate, Monstera, Rosa, Maíz).`
    }
  } finally {
    isSearchingTaxon.value = false
  }
}

function loadFileImage(file: File) {
  errorMessage.value = ''
  statusMessage.value = ''
  backendDiagnosis.value = null

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
  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    URL.revokeObjectURL(objectUrl)
    loadedImage.value = img
    uploadedFileName.value = file.name
    sourceMode.value = 'image'
    if (detectionMode.value === 'synthetic_plant') {
      detectionMode.value = 'auto_vegetation'
    }
    hasAnalyzedImage.value = true
    renderSinglePass(performance.now(), true)
    void runSpeciesIdentification(img, file.name)
    if (autoConnectGoogleLens.value) {
      void submitImageToGoogleLens(file)
      statusMessage.value = `Foto "${file.name}" cargada y enviada a Google Lens. Tipo y nombre de planta identificados automáticamente.`
    } else {
      statusMessage.value = `Foto "${file.name}" cargada. Tipo y nombre de planta identificados. Haz clic en "Subir a Google Lens" o "Analizar imagen".`
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

function onCanvasPointerMove(event: PointerEvent) {
  const canvas = outputCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  pointerNorm.value = {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  }
}

function onCanvasPointerLeave() {
  pointerNorm.value = null
}

function renderSinglePass(now: number, forceUpdate = false) {
  const canvas = outputCanvas.value
  if (!canvas) return

  let activeSource: HTMLVideoElement | HTMLImageElement | null = null
  let effectiveDetectionMode: DetectionMode = detectionMode.value

  if (sourceMode.value === 'camera' && cameraActive.value && videoElement.value && videoElement.value.readyState >= 2) {
    activeSource = videoElement.value
  } else if (sourceMode.value === 'image' && loadedImage.value) {
    activeSource = loadedImage.value
  } else {
    effectiveDetectionMode = 'synthetic_plant'
  }

  const hudLabel = speciesResult.value
    ? `${speciesResult.value.primary.commonName} (${speciesResult.value.primary.scientificName}) · ${speciesResult.value.primary.plantType}`
    : undefined

  const analysis = processMultispectralFrame(activeSource, canvas, {
    spectrumMode: spectrumMode.value,
    preset: activePreset.value,
    presetIntensity: presetIntensity.value,
    detectionMode: effectiveDetectionMode,
    sensitivity: sensitivity.value,
    isolatePlantBackground: isolatePlantBackground.value,
    showContours: showContours.value,
    showHotspots: showHotspots.value,
    ambientTempC: ambientTempC.value,
    pointerNorm: pointerNorm.value,
    timeSec: now * 0.001,
    plantLabelHud: hudLabel
  })

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
      fpsCount.value = Math.min(60, Math.max(1, Math.round((frameCounter * 1000) / (now - fpsTimer))))
      frameCounter = 0
      fpsTimer = now
    }
    if (now - lastFrameTime >= 30) {
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

async function analyzeImage() {
  if (!canAnalyze.value) return
  errorMessage.value = ''
  isAnalyzing.value = true

  try {
    // If camera is active, capture current video frame as static image or analyze current frame
    renderSinglePass(performance.now(), true)
    hasAnalyzedImage.value = true

    const imageToSend = selectedFile.value ?? (await canvasToFile('agronia-scan')).file

    if (hasEndpoint.value) {
      try {
        backendDiagnosis.value = await analyzeMultispectralBackend(
          endpoint,
          imageToSend,
          activePreset.value,
          presetIntensity.value,
          ambientTempC.value
        )
        await runSpeciesIdentification(undefined, uploadedFileName.value)
        statusMessage.value =
          'Análisis completado: especie identificada, área total segmentada y datos multiespectrales (RGB, NDVI, Térmico) generados.'
        return
      } catch {
        // Fallback seamlessly to local AI + Multispectral engine when backend is unreachable
      }
    }

    await runSpeciesIdentification(undefined, uploadedFileName.value)

    if (liveAnalysis.value) {
      backendDiagnosis.value = {
        disease: liveAnalysis.value.aiClassification.label,
        confidence: liveAnalysis.value.aiClassification.confidence,
        cause: liveAnalysis.value.aiClassification.cause,
        recommendation: liveAnalysis.value.aiClassification.recommendation,
        engineMode: 'local-multispectral-ai',
        ndviMean: liveAnalysis.value.ndvi.mean,
        tempMeanC: liveAnalysis.value.thermal.meanTempC,
        cwsi: liveAnalysis.value.thermal.cwsi,
        plantCoveragePercent: liveAnalysis.value.plantCoveragePercent
      }
      statusMessage.value =
        'Análisis completado: tipo y nombre de planta identificados junto con datos RGB, NDVI, Térmicos y presets.'
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
  if (liveAnalysis.value) {
    backendDiagnosis.value = {
      disease: liveAnalysis.value.aiClassification.label,
      confidence: liveAnalysis.value.aiClassification.confidence,
      cause: liveAnalysis.value.aiClassification.cause,
      recommendation: liveAnalysis.value.aiClassification.recommendation,
      engineMode: 'local-multispectral-ai',
      ndviMean: liveAnalysis.value.ndvi.mean,
      tempMeanC: liveAnalysis.value.thermal.meanTempC,
      cwsi: liveAnalysis.value.thermal.cwsi,
      plantCoveragePercent: liveAnalysis.value.plantCoveragePercent
    }
  }
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
  const sp = speciesResult.value?.primary
  const rows = [
    [
      'Timestamp',
      'Nombre Planta',
      'Nombre Cientifico',
      'Tipo de Planta',
      'Familia Botanica',
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
      'Diagnostico IA',
      'Recomendacion'
    ],
    [
      new Date().toISOString(),
      sp?.commonName || 'En identificacion',
      sp?.scientificName || 'Plantae',
      sp?.plantType || 'Cultivo Vegetal',
      sp?.family || 'Angiospermae',
      spectrumMode.value.toUpperCase(),
      currentPresetConfig.value.name,
      Math.round(presetIntensity.value * 100),
      a.plantDetected ? 'SI' : 'NO',
      a.plantCoveragePercent,
      Math.round(a.detectionConfidence * 100),
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
      a.aiClassification.label,
      a.aiClassification.recommendation
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
  statusMessage.value = 'Reporte CSV de telemetría multiespectral y especie botánica exportado.'
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
      species: speciesResult.value?.primary
    })
    statusMessage.value =
      'Captura multiespectral, especie botánica y diagnóstico transferidos al formulario de Registro de Campo.'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'No se pudo transferir la captura.'
  }
}

onMounted(() => {
  void refreshCameraDevices()
  startRenderLoop()
  window.setTimeout(() => {
    void runSpeciesIdentification(outputCanvas.value, 'solanum_lycopersicum_demo')
  }, 150)
})

onBeforeUnmount(() => {
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
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-300">
                VISIÓN ARTIFICIAL · SEGMENTACIÓN DE DOSEL COMPLETO
              </span>
              <span
                class="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200"
              >
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"></span>
                {{ fpsCount }} FPS
              </span>
            </div>
            <h2 class="mt-0.5 text-lg font-semibold text-white">
              Imagen de la planta y Cámara Multiespectral (RGB · NDVI · Térmico)
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

          <!-- ANALIZAR IMAGEN BUTTON (Always enabled when photo/camera/demo is active!) -->
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

          <!-- GOOGLE LENS DIRECT UPLOAD BUTTON -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/15 px-3.5 py-2 text-xs font-bold text-sky-200 shadow transition hover:bg-sky-500/25"
            title="Subir imagen o fotograma actual de la cámara a Google Lens para identificar el tipo y nombre de la planta"
            @click="connectAndUploadToGoogleLens"
          >
            <ExternalLink class="h-4 w-4 text-sky-300" />
            Identificar en Google Lens
          </button>

          <label
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] font-medium text-stone-300"
            title="Al subir una imagen o encender la cámara, conectarse y subir automáticamente a Google Lens"
          >
            <input
              v-model="autoConnectGoogleLens"
              type="checkbox"
              class="h-3.5 w-3.5 rounded accent-sky-400"
            />
            <span>Auto Google Lens</span>
          </label>

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
                Área y Contorno
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
              aria-label="Visor multiespectral de área completa de la planta"
              @pointermove="onCanvasPointerMove"
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
                  :class="liveAnalysis?.plantDetected ? 'bg-emerald-400' : 'bg-amber-400'"
                ></span>
                {{
                  liveAnalysis?.plantDetected
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
                  GOOGLE LENS · TAXONOMÍA Y RECONOCIMIENTO BOTÁNICO
                </span>
                <h3 class="text-base font-semibold text-white">
                  Tipo de Planta y Nombre de la Especie
                </h3>
              </div>
            </div>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 py-1.5 text-xs font-bold text-sky-100 transition hover:bg-sky-500/30"
              @click="connectAndUploadToGoogleLens"
            >
              <ExternalLink class="h-3.5 w-3.5 text-sky-300" />
              {{ cameraActive ? 'Subir cámara a Google Lens' : 'Abrir en Google Lens' }}
            </button>
          </div>

          <div v-if="speciesResult" class="mt-3.5 space-y-3">
            <!-- Primary Identified Plant Banner -->
            <div
              class="flex flex-col justify-between gap-3 rounded-xl border border-sky-300/25 bg-black/35 p-3.5 sm:flex-row sm:items-center"
            >
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-md bg-sky-400/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-200"
                  >
                    {{ speciesResult.primary.plantType }}
                  </span>
                  <span
                    class="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-stone-300"
                  >
                    Familia: {{ speciesResult.primary.family }}
                  </span>
                  <span
                    class="rounded-md bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
                  >
                    Coincidencia {{ Math.round(speciesResult.primary.confidence * 100) }}%
                  </span>
                </div>

                <h4 class="text-xl font-extrabold text-white">
                  {{ speciesResult.primary.commonName }}
                </h4>
                <p class="text-xs italic text-sky-200/90">
                  Nombre científico: <strong class="font-semibold">{{ speciesResult.primary.scientificName }}</strong>
                </p>
              </div>

              <img
                v-if="speciesResult.primary.thumbnailUrl"
                :src="speciesResult.primary.thumbnailUrl"
                :alt="speciesResult.primary.commonName"
                class="h-16 w-16 shrink-0 rounded-xl border border-white/15 object-cover shadow"
              />
            </div>

            <!-- Morphological & Botanical Summary -->
            <div class="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-stone-300 space-y-1.5">
              <p class="leading-relaxed">
                {{ speciesResult.primary.summary }}
              </p>
              <div class="grid gap-1.5 pt-1 text-[11px] sm:grid-cols-2">
                <div class="rounded-lg bg-white/5 px-2.5 py-1.5">
                  <span class="block text-[10px] uppercase text-stone-400">Morfología Foliar Detectada</span>
                  <strong class="text-stone-100">{{ speciesResult.primary.leafMorphology }}</strong>
                </div>
                <div class="rounded-lg bg-white/5 px-2.5 py-1.5">
                  <span class="block text-[10px] uppercase text-stone-400">Parámetros Ideales de Especie</span>
                  <strong class="text-emerald-300">
                    NDVI {{ speciesResult.primary.idealNdviRange[0] }}–{{ speciesResult.primary.idealNdviRange[1] }}
                    · {{ speciesResult.primary.idealTempRangeC[0] }}–{{ speciesResult.primary.idealTempRangeC[1] }}°C
                    · Riego {{ speciesResult.primary.waterDemand }}
                  </strong>
                </div>
              </div>
            </div>

            <!-- Alternative Species Candidates -->
            <div v-if="speciesResult.alternatives.length > 0" class="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span class="text-stone-400">Otras posibles especies:</span>
              <button
                v-for="alt in speciesResult.alternatives"
                :key="alt.id"
                type="button"
                class="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-medium text-stone-200 transition hover:border-sky-300/40 hover:bg-sky-400/15 hover:text-white"
                @click="selectSpeciesCandidate(alt)"
              >
                {{ alt.commonName }} ({{ Math.round(alt.confidence * 100) }}%)
              </button>
            </div>

            <!-- Live Taxon Search / Sync with Google Lens Result -->
            <form
              class="flex items-center gap-2 pt-1"
              @submit.prevent="handleCustomTaxonSearch"
            >
              <div class="relative flex-1">
                <Search class="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
                <input
                  v-model="customSpeciesQuery"
                  type="text"
                  placeholder="¿Google Lens indicó otra especie? Escríbela aquí (ej. Monstera, Maíz, Bugambilia)…"
                  class="w-full rounded-xl border border-white/15 bg-black/40 py-1.5 pl-8 pr-3 text-xs text-white placeholder-stone-400 focus:border-sky-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                :disabled="isSearchingTaxon || !customSpeciesQuery.trim()"
                class="inline-flex items-center gap-1 rounded-xl border border-sky-400/40 bg-sky-400/15 px-3 py-1.5 text-xs font-bold text-sky-200 transition hover:bg-sky-400/25 disabled:opacity-50"
              >
                <LoaderCircle v-if="isSearchingTaxon" class="h-3.5 w-3.5 animate-spin" />
                <span>Fijar planta</span>
              </button>
            </form>
          </div>
        </div>

        <!-- Card 1: AI Recognition & Physiological Classification -->
        <div class="rounded-2xl border border-white/10 bg-[#141d16]/95 p-4 shadow-xl sm:p-5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="rounded-xl bg-emerald-400/15 p-2 text-emerald-300">
                <Activity class="h-5 w-5" />
              </div>
              <div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                  RESULTADO DEL ANÁLISIS IA Y MULTIESPECTRAL
                </span>
                <h3 class="text-base font-semibold text-white">Diagnóstico del Área Total de la Planta</h3>
              </div>
            </div>
            <span
              v-if="liveAnalysis"
              class="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-200"
            >
              Confianza {{ (liveAnalysis.detectionConfidence * 100).toFixed(0) }}%
            </span>
          </div>

          <div v-if="liveAnalysis && hasAnalyzedImage" class="mt-4 space-y-3">
            <div
              class="rounded-xl border p-3.5"
              :style="{
                borderColor: `${currentPresetConfig.accentColor}44`,
                backgroundColor: `${currentPresetConfig.accentColor}12`
              }"
            >
              <div class="flex items-center justify-between gap-2">
                <span
                  class="text-[10px] font-extrabold uppercase tracking-wider"
                  :style="{ color: currentPresetConfig.accentColor }"
                >
                  {{ currentPresetConfig.badge }}
                </span>
                <span class="text-xs text-stone-300">
                  Área afectada:
                  <strong class="text-white">{{ liveAnalysis.aiClassification.affectedAreaPct }}%</strong>
                </span>
              </div>
              <h4 class="mt-1 text-lg font-bold text-white">
                {{
                  backendDiagnosis
                    ? formatDiseaseName(backendDiagnosis.disease)
                    : liveAnalysis.aiClassification.label
                }}
              </h4>
              <p class="mt-1.5 text-xs leading-relaxed text-stone-300">
                {{ backendDiagnosis?.cause || liveAnalysis.aiClassification.cause }}
              </p>
              <div class="mt-2.5 rounded-lg bg-black/30 p-2.5 text-xs text-emerald-200">
                <strong class="block text-[10px] uppercase tracking-wider text-emerald-300">
                  Recomendación agronómica:
                </strong>
                {{ backendDiagnosis?.recommendation || liveAnalysis.aiClassification.recommendation }}
              </div>
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
