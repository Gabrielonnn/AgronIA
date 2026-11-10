<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  AlertTriangle, Camera, Check, ChevronRight, CircleHelp, CloudUpload,
  FileImage, Leaf, LoaderCircle, ScanSearch, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-vue-next'
import Card from '../components/ui/Card.vue'
import {
  analyzeCropImage,
  prepareCropImage,
} from '../services/cropAnalysis'
import type { CropAnalysisResult, CropIssueCategory } from '../services/cropAnalysisValidation'
import {
  listCropAnalysisHistory,
  saveCropAnalysis,
  type CropAnalysisHistoryRecord,
} from '../services/agronomyData'

const cropOptions = [
  { value: 'sin especificar', label: 'Sin especificar' },
  { value: 'maíz', label: 'Maíz' },
  { value: 'frijol', label: 'Frijol' },
  { value: 'aguacate', label: 'Aguacate' },
  { value: 'jitomate', label: 'Jitomate' },
  { value: 'otro', label: 'Otro cultivo' },
]

const categoryLabels: Record<CropIssueCategory, string> = {
  plaga: 'Posible plaga',
  enfermedad: 'Posible enfermedad',
  estres_hidrico: 'Estrés hídrico',
  deficiencia_nutricional: 'Posible deficiencia nutricional',
  otro: 'Otra observación',
}

const imageFile = ref<File | null>(null)
const imageFileName = ref('')
const previewUrl = ref('')
const crop = ref('sin especificar')
const result = ref<CropAnalysisResult | null>(null)
const isAnalyzing = ref(false)
const isCameraOpen = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const historyError = ref('')
const analysisHistory = ref<CropAnalysisHistoryRecord[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const cameraStream = shallowRef<MediaStream | null>(null)
const isDragging = ref(false)
const findingsCount = computed(() => result.value?.detections.length ?? 0)
const droneBridgeUrl = ref('ws://127.0.0.1:8767')
const droneBridgeState = ref<'disconnected' | 'connecting' | 'connected'>('disconnected')
let droneBridgeSocket: WebSocket | null = null
let lastDroneFrameAt = 0
let processingDroneFrame = false

const setImage = (file: File) => {
  errorMessage.value = ''
  successMessage.value = ''
  result.value = null
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    errorMessage.value = 'Formato no compatible. Selecciona una imagen JPG, PNG o WebP.'
    return
  }
  if (!file.size || file.size > 15 * 1024 * 1024) {
    errorMessage.value = 'La imagen debe pesar menos de 15 MB.'
    return
  }

  const previousPreviewUrl = previewUrl.value
  imageFile.value = file
  imageFileName.value = file.name
  previewUrl.value = URL.createObjectURL(file)
  if (previousPreviewUrl) void nextTick(() => URL.revokeObjectURL(previousPreviewUrl))
}

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) setImage(file)
  input.value = ''
}

const onDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) setImage(file)
}

const startCamera = async () => {
  errorMessage.value = ''
  disconnectDroneCamera()
  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value = 'Este navegador no permite acceder a la cámara. Usa HTTPS o carga una imagen.'
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    cameraStream.value = stream
    isCameraOpen.value = true
    await nextTick()
    if (videoElement.value) {
      videoElement.value.srcObject = stream
      await videoElement.value.play()
    }
  } catch (error) {
    closeCamera()
    errorMessage.value = error instanceof Error
      ? `No se pudo abrir la cámara: ${error.message}`
      : 'No se pudo abrir la cámara. Revisa los permisos del navegador.'
  }
}

const closeCamera = () => {
  cameraStream.value?.getTracks().forEach(track => track.stop())
  cameraStream.value = null
  isCameraOpen.value = false
}

const captureImage = () => {
  const video = videoElement.value
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    errorMessage.value = 'La cámara todavía no entrega una imagen. Espera un momento e inténtalo de nuevo.'
    return
  }

  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight))
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const context = canvas.getContext('2d')
  if (!context) {
    errorMessage.value = 'No se pudo capturar la imagen de la cámara.'
    return
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  canvas.toBlob(blob => {
    if (!blob) {
      errorMessage.value = 'No se pudo crear la imagen capturada.'
      return
    }
    setImage(new File([blob], `captura-agronia-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    closeCamera()
  }, 'image/jpeg', 0.86)
}

const connectDroneCamera = () => {
  errorMessage.value = ''
  let url: URL
  try {
    url = new URL(droneBridgeUrl.value.trim())
  } catch {
    errorMessage.value = 'Escribe una URL WebSocket válida para el puente de cámara.'
    return
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    errorMessage.value = 'El puente de cámara debe usar ws:// o wss://.'
    return
  }
  if (window.location.protocol === 'https:' && url.protocol === 'ws:') {
    errorMessage.value = 'La página usa HTTPS. Para conectar una cámara remota, el puente debe usar wss://.'
    return
  }

  closeCamera()
  droneBridgeState.value = 'connecting'
  const socket = new WebSocket(url.toString())
  socket.binaryType = 'blob'
  droneBridgeSocket = socket

  socket.onopen = () => {
    if (droneBridgeSocket === socket) droneBridgeState.value = 'connected'
  }
  socket.onmessage = async event => {
    if (
      droneBridgeSocket !== socket
      || isAnalyzing.value
      || processingDroneFrame
      || Date.now() - lastDroneFrameAt < 900
    ) return
    processingDroneFrame = true
    const blob = event.data instanceof Blob
      ? event.data
      : event.data instanceof ArrayBuffer
        ? new Blob([event.data])
        : null
    if (!blob) {
      errorMessage.value = 'El puente de cámara debe transmitir imágenes binarias JPEG, PNG o WebP.'
      processingDroneFrame = false
      socket.close(1003, 'Solo se aceptan tramas binarias de imagen')
      return
    }

    try {
      if (!blob.size || blob.size > 3 * 1024 * 1024) {
        throw new Error('El puente envió una imagen vacía o mayor de 3 MB.')
      }
      const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
      const type = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : ''
      if (!type) throw new Error('El puente envió una trama que no es JPEG, PNG o WebP.')

      const bitmap = await createImageBitmap(blob)
      bitmap.close()
      if (droneBridgeSocket !== socket) return
      lastDroneFrameAt = Date.now()
      setImage(new File([blob], `imagen-dron-${lastDroneFrameAt}.${type.split('/')[1]}`, { type }))
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'No se pudo procesar la imagen del puente.'
      socket.close(1003, 'Trama de imagen inválida')
    } finally {
      processingDroneFrame = false
    }
  }
  socket.onerror = () => {
    if (droneBridgeSocket !== socket) return
    errorMessage.value = 'No se pudo recibir imágenes del puente. Verifica la URL y el formato de las tramas.'
  }
  socket.onclose = () => {
    if (droneBridgeSocket !== socket) return
    droneBridgeSocket = null
    droneBridgeState.value = 'disconnected'
  }
}

const disconnectDroneCamera = () => {
  const socket = droneBridgeSocket
  droneBridgeSocket = null
  droneBridgeState.value = 'disconnected'
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    socket.close(1000, 'Desconexión solicitada desde AgronIA')
  }
}

const runAnalysis = async () => {
  if (!imageFile.value) {
    errorMessage.value = 'Selecciona o captura una imagen antes de analizar.'
    return
  }
  errorMessage.value = ''
  successMessage.value = ''
  result.value = null
  isAnalyzing.value = true
  const analyzedFile = imageFile.value
  const analyzedCrop = crop.value

  try {
    const image = await prepareCropImage(analyzedFile)
    const analysis = await analyzeCropImage(image, analyzedCrop)
    if (imageFile.value !== analyzedFile) return
    result.value = analysis
    successMessage.value = 'Análisis completado. Valida los hallazgos en campo antes de intervenir.'
    try {
      const saved = await saveCropAnalysis(analyzedCrop, analyzedFile.name, analysis)
      if (imageFile.value === analyzedFile) {
        analysisHistory.value = [saved, ...analysisHistory.value.filter(item => item.id !== saved.id)].slice(0, 10)
      }
    } catch (error) {
      historyError.value = error instanceof Error ? error.message : 'El análisis se completó, pero no se pudo guardar.'
    }
  } catch (error) {
    if (imageFile.value === analyzedFile) {
      errorMessage.value = error instanceof Error ? error.message : 'Ocurrió un error durante el análisis.'
    }
  } finally {
    isAnalyzing.value = false
  }
}

const refreshHistory = async () => {
  historyError.value = ''
  try {
    analysisHistory.value = await listCropAnalysisHistory()
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : 'No se pudo cargar el historial.'
  }
}

const showHistoricalResult = (record: CropAnalysisHistoryRecord) => {
  result.value = {
    summary: record.summary,
    imageQuality: record.imageQuality,
    detections: record.detections,
  }
  crop.value = record.crop
  imageFile.value = null
  imageFileName.value = record.source_image_name
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  errorMessage.value = ''
  successMessage.value = `Informe guardado el ${new Date(record.created_at).toLocaleString('es-MX')}. La imagen no se almacena.`
}

const exportResult = () => {
  if (!result.value) return
  const report = {
    generatedAt: new Date().toISOString(),
    image: imageFileName.value || 'captura',
    crop: crop.value,
    ...result.value,
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'reporte-agronia.json'
  link.click()
  URL.revokeObjectURL(url)
}

const clearImage = () => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  imageFile.value = null
  imageFileName.value = ''
  result.value = null
  errorMessage.value = ''
  successMessage.value = ''
}

onBeforeUnmount(() => {
  closeCamera()
  disconnectDroneCamera()
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

onMounted(refreshHistory)
</script>

<template>
  <div class="analysis-page">
    <header class="analysis-heading">
      <div>
        <span class="analysis-eyebrow"><Sparkles :size="13" /> VISIÓN AGRÍCOLA</span>
        <h1>Analiza tu cultivo</h1>
        <p>Revisa imágenes de campo con un modelo de visión configurado para AgronIA.</p>
      </div>
      <span class="analysis-live-badge"><span></span> Análisis bajo demanda</span>
    </header>

    <section class="analysis-notice" aria-label="Alcance del análisis">
      <ShieldCheck :size="19" />
      <p><strong>Asistencia, no diagnóstico definitivo.</strong> El modelo describe señales visibles; confirma en campo con un especialista. No aplica tratamientos automáticamente.</p>
    </section>

    <div class="analysis-grid">
      <Card class="analysis-card">
        <template #header>
          <div class="analysis-card-title">
            <span class="analysis-icon"><FileImage :size="18" /></span>
            <div><h2>Imagen de la parcela</h2><p>JPG, PNG o WebP · máximo 15 MB</p></div>
          </div>
        </template>

        <div
          v-if="!previewUrl"
          class="analysis-dropzone"
          :class="{ 'is-dragging': isDragging }"
          role="button"
          tabindex="0"
          @click="fileInput?.click()"
          @keydown.enter.prevent="fileInput?.click()"
          @keydown.space.prevent="fileInput?.click()"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop="onDrop"
        >
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="onFileChange">
          <span class="analysis-upload-icon"><CloudUpload :size="25" /></span>
          <strong>Arrastra una imagen o selecciónala</strong>
          <span>El archivo se envía al servicio de IA configurado para este proyecto.</span>
          <span class="analysis-choose-button"><Upload :size="15" /> Elegir imagen</span>
        </div>

        <div v-else class="analysis-preview">
          <img :src="previewUrl" :alt="`Vista previa de ${imageFile?.name ?? 'imagen del cultivo'}`">
          <div class="analysis-image-meta">
            <span><FileImage :size="15" /> {{ imageFile?.name }}</span>
            <button type="button" aria-label="Quitar imagen" :disabled="isAnalyzing" @click="clearImage"><X :size="16" /></button>
          </div>
        </div>

        <div class="analysis-camera-actions">
          <button v-if="!isCameraOpen" type="button" class="analysis-secondary-button" @click="startCamera">
            <Camera :size="16" /> Abrir cámara
          </button>
          <div v-else class="analysis-camera">
            <video ref="videoElement" autoplay playsinline muted aria-label="Vista en vivo de la cámara"></video>
            <div class="analysis-camera-buttons">
              <button type="button" class="analysis-primary-button" @click="captureImage"><Camera :size="16" /> Capturar imagen</button>
              <button type="button" class="analysis-secondary-button" @click="closeCamera">Cerrar cámara</button>
            </div>
          </div>
          <p><CircleHelp :size="14" /> Usa una cámara disponible para el navegador. El video de drones requiere un puente compatible con el modelo.</p>
        </div>

        <details class="analysis-drone-bridge">
          <summary><Camera :size="15" /> Conectar cámara del dron por puente</summary>
          <p>El puente del fabricante debe enviar imágenes binarias JPEG, PNG o WebP por WebSocket, hasta 3 MB por trama.</p>
          <div class="analysis-bridge-controls">
            <label for="drone-camera-url">URL del puente de imágenes</label>
            <input id="drone-camera-url" v-model="droneBridgeUrl" type="url" inputmode="url" placeholder="ws://127.0.0.1:8767" :disabled="droneBridgeState !== 'disconnected'">
            <button v-if="droneBridgeState === 'disconnected'" type="button" class="analysis-secondary-button" @click="connectDroneCamera"><Camera :size="15" /> Conectar imágenes</button>
            <button v-else type="button" class="analysis-secondary-button" :disabled="droneBridgeState === 'connecting'" @click="disconnectDroneCamera">
              <X :size="15" /> {{ droneBridgeState === 'connecting' ? 'Conectando…' : 'Desconectar cámara' }}
            </button>
            <span class="analysis-bridge-state" :class="{ 'is-connected': droneBridgeState === 'connected' }">
              {{ droneBridgeState === 'connected' ? 'Esperando imágenes' : droneBridgeState === 'connecting' ? 'Conectando al puente' : 'Sin conexión' }}
            </span>
          </div>
        </details>

        <label class="analysis-crop-label" for="analysis-crop">Cultivo (opcional)</label>
        <select id="analysis-crop" v-model="crop" class="analysis-crop-select">
          <option v-for="option in cropOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>

        <button type="button" class="analysis-run-button" :disabled="!imageFile || isAnalyzing" @click="runAnalysis">
          <LoaderCircle v-if="isAnalyzing" :size="17" class="analysis-spinner" />
          <ScanSearch v-else :size="17" />
          {{ isAnalyzing ? 'Analizando imagen…' : 'Analizar cultivo' }}
          <ChevronRight v-if="!isAnalyzing" :size="16" />
        </button>
        <p v-if="errorMessage" class="analysis-feedback is-error" role="alert"><AlertTriangle :size="16" /> {{ errorMessage }}</p>
        <p v-if="successMessage" class="analysis-feedback is-success" role="status"><Check :size="16" /> {{ successMessage }}</p>
      </Card>

      <Card class="analysis-card analysis-results-card">
        <template #header>
          <div class="analysis-card-title">
            <span class="analysis-icon is-result"><ScanSearch :size="18" /></span>
            <div><h2>Hallazgos y recomendaciones</h2><p>Observaciones generadas a partir de esta imagen</p></div>
          </div>
          <button v-if="result" type="button" class="analysis-export" @click="exportResult">Exportar JSON</button>
        </template>

        <div v-if="!result && !isAnalyzing" class="analysis-empty">
          <span><Leaf :size="24" /></span>
          <strong>El resultado aparecerá aquí</strong>
          <p>Carga una imagen y solicita un análisis para ver señales visibles y sugerencias de verificación.</p>
        </div>
        <div v-else-if="isAnalyzing" class="analysis-loading" role="status">
          <LoaderCircle :size="27" class="analysis-spinner" />
          <strong>Revisando la imagen</strong>
          <p>La respuesta depende del modelo de visión configurado.</p>
        </div>
        <div v-else-if="result" class="analysis-result">
          <div class="analysis-summary">
            <div><span>RESUMEN</span><p>{{ result.summary }}</p></div>
            <span class="analysis-quality" :class="`quality-${result.imageQuality}`">Imagen {{ result.imageQuality }}</span>
          </div>

          <div class="analysis-count"><strong>{{ findingsCount }}</strong><span>{{ findingsCount === 1 ? 'hallazgo' : 'hallazgos' }} reportados</span></div>
          <div v-if="result.detections.length" class="analysis-findings">
            <article v-for="(finding, index) in result.detections" :key="`${finding.category}-${index}`" class="analysis-finding">
              <div class="finding-heading">
                <div><span class="finding-category">{{ categoryLabels[finding.category] }}</span><h3>{{ finding.label }}</h3></div>
                <span class="finding-severity" :class="`severity-${finding.severity}`">{{ finding.severity }}</span>
              </div>
              <div class="finding-confidence"><span>Confianza estimada</span><strong>{{ Math.round(finding.confidence * 100) }}%</strong></div>
              <div class="finding-meter"><span :style="{ width: `${finding.confidence * 100}%` }"></span></div>
              <p><strong>Señal visible:</strong> {{ finding.evidence }}</p>
              <p><strong>Siguiente paso:</strong> {{ finding.recommendation }}</p>
            </article>
          </div>
          <div v-else class="analysis-no-findings"><Check :size="16" /> El modelo no reportó hallazgos visibles. Esto no descarta problemas que no aparezcan en la imagen.</div>
          <p class="analysis-disclaimer"><AlertTriangle :size="14" /> La confianza no es una probabilidad clínica. Verifica los hallazgos presencialmente antes de decidir.</p>
        </div>
      </Card>
    </div>

    <Card class="analysis-card analysis-history">
      <template #header>
        <div class="analysis-card-title">
          <span class="analysis-icon"><FileImage :size="18" /></span>
          <div><h2>Historial de análisis</h2><p>Últimos 10 informes de esta cuenta</p></div>
        </div>
        <button type="button" class="analysis-export" @click="refreshHistory">Actualizar</button>
      </template>
      <p v-if="historyError" class="analysis-feedback is-error" role="alert"><AlertTriangle :size="16" /> {{ historyError }}</p>
      <div v-if="analysisHistory.length" class="analysis-history-list">
        <button
          v-for="record in analysisHistory"
          :key="record.id"
          type="button"
          class="analysis-history-item"
          @click="showHistoricalResult(record)"
        >
          <span class="analysis-history-icon"><ScanSearch :size="16" /></span>
          <span class="analysis-history-copy">
            <strong>{{ record.crop }} · {{ record.source_image_name }}</strong>
            <small>{{ new Date(record.created_at).toLocaleString('es-MX') }} · {{ record.detections.length }} hallazgo(s)</small>
          </span>
          <ChevronRight :size="16" />
        </button>
      </div>
      <p v-else-if="!historyError" class="analysis-history-empty">No hay informes guardados todavía.</p>
    </Card>

    <footer class="analysis-footer"><ShieldCheck :size="15" /> La imagen no se guarda en AgronIA; se conserva el informe y sus hallazgos. El proveedor de visión puede procesar la imagen según sus propias condiciones.</footer>
  </div>
</template>

<style scoped>
.analysis-page { display: grid; gap: 1.15rem; max-width: 1440px; margin: 0 auto; color: #e8eddf; animation: analysis-enter .4s ease both; }
.analysis-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
.analysis-eyebrow { display: inline-flex; align-items: center; gap: .4rem; color: #dfc574; font-size: .6rem; font-weight: 850; letter-spacing: .15em; }
.analysis-heading h1 { margin-top: .35rem; color: #f0f1e9; font-size: clamp(1.7rem, 3vw, 2.3rem); font-weight: 760; letter-spacing: -.05em; }
.analysis-heading p { margin-top: .35rem; color: #a2aa97; font-size: .85rem; }
.analysis-live-badge { display: inline-flex; align-items: center; gap: .45rem; padding: .5rem .75rem; border: 1px solid rgba(133, 201, 145, .2); border-radius: 999px; color: #a6d7a8; background: rgba(57, 119, 68, .1); font-size: .66rem; font-weight: 700; white-space: nowrap; }
.analysis-live-badge span { width: 7px; height: 7px; border-radius: 50%; background: #75c986; box-shadow: 0 0 10px #75c986; }
.analysis-notice { display: flex; align-items: flex-start; gap: .7rem; padding: .8rem 1rem; border: 1px solid rgba(223, 197, 116, .2); border-radius: 12px; color: #ddca91; background: rgba(165, 126, 46, .08); }
.analysis-notice svg { flex: 0 0 auto; margin-top: .08rem; }
.analysis-notice p { color: #b7b29b; font-size: .72rem; line-height: 1.55; }
.analysis-notice strong { color: #e6d28b; }
.analysis-grid { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); align-items: start; gap: 1rem; }
.analysis-card { min-width: 0; border-color: rgba(196, 218, 147, .13) !important; color: #e8eddf; background: linear-gradient(145deg, rgba(26, 34, 25, .97), rgba(17, 23, 18, .98)) !important; box-shadow: 0 14px 36px rgba(0, 0, 0, .17) !important; }
.analysis-card :deep(.app-card-header) { display: flex; align-items: center; justify-content: space-between; gap: .75rem; border-color: rgba(196, 218, 147, .1); }
.analysis-card :deep(.app-card-body) { display: grid; gap: .9rem; }
.analysis-card-title { display: flex; min-width: 0; align-items: center; gap: .65rem; }
.analysis-icon { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 1px solid rgba(114, 213, 159, .2); border-radius: 11px; color: #8bd4a5; background: rgba(114, 213, 159, .08); }
.analysis-icon.is-result { color: #dfc574; border-color: rgba(223, 197, 116, .2); background: rgba(223, 197, 116, .08); }
.analysis-card-title h2 { color: #edf0e5; font-size: .83rem; font-weight: 720; }
.analysis-card-title p { margin-top: .15rem; color: #939c89; font-size: .65rem; }
.analysis-dropzone { display: grid; min-height: 250px; place-items: center; align-content: center; gap: .65rem; padding: 1.4rem; border: 1px dashed rgba(196, 218, 147, .28); border-radius: 14px; text-align: center; background: rgba(5, 10, 7, .24); cursor: pointer; transition: border-color .2s, background .2s; }
.analysis-dropzone:hover, .analysis-dropzone.is-dragging { border-color: #83c996; background: rgba(56, 117, 74, .11); }
.analysis-upload-icon { display: grid; width: 50px; height: 50px; place-items: center; border: 1px solid rgba(114, 213, 159, .2); border-radius: 16px; color: #8bd4a5; background: rgba(114, 213, 159, .08); }
.analysis-dropzone strong { color: #e8eddf; font-size: .8rem; }
.analysis-dropzone > span:not(.analysis-upload-icon):not(.analysis-choose-button) { max-width: 320px; color: #8f9986; font-size: .68rem; line-height: 1.5; }
.analysis-choose-button, .analysis-secondary-button, .analysis-primary-button { display: inline-flex; align-items: center; justify-content: center; gap: .45rem; min-height: 36px; padding: .45rem .75rem; border: 1px solid rgba(196, 218, 147, .18); border-radius: 9px; color: #d7ddcb; background: rgba(32, 43, 31, .75); font-size: .68rem; font-weight: 700; }
.analysis-choose-button { margin-top: .2rem; color: #e2d18e; }
.analysis-preview { overflow: hidden; border: 1px solid rgba(196, 218, 147, .14); border-radius: 12px; background: #080d09; }
.analysis-preview img { display: block; width: 100%; max-height: 350px; object-fit: contain; }
.analysis-image-meta { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .55rem .7rem; border-top: 1px solid rgba(196, 218, 147, .12); color: #aab29e; font-size: .66rem; }
.analysis-image-meta span { display: inline-flex; min-width: 0; align-items: center; gap: .4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analysis-image-meta button { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border-radius: 7px; color: #bd988e; }
.analysis-camera-actions { display: grid; gap: .5rem; }
.analysis-camera-actions > p { display: flex; align-items: flex-start; gap: .4rem; color: #899384; font-size: .62rem; line-height: 1.5; }
.analysis-camera-actions > p svg { flex: 0 0 auto; }
.analysis-drone-bridge { padding: .7rem; border: 1px solid rgba(196, 218, 147, .13); border-radius: 10px; background: rgba(5, 10, 7, .2); }
.analysis-drone-bridge summary { display: flex; align-items: center; gap: .45rem; color: #d7ddcb; font-size: .68rem; font-weight: 700; cursor: pointer; }
.analysis-drone-bridge summary svg { color: #cbb96f; }
.analysis-drone-bridge > p { margin-top: .55rem; color: #929b8a; font-size: .62rem; line-height: 1.5; }
.analysis-bridge-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .5rem; margin-top: .6rem; }
.analysis-bridge-controls label { grid-column: 1 / -1; color: #aab29e; font-size: .62rem; }
.analysis-bridge-controls input { min-width: 0; min-height: 36px; padding: .45rem .6rem; border: 1px solid rgba(196, 218, 147, .15); border-radius: 8px; color: #e1e6d8; background: #101810; font-size: .65rem; }
.analysis-bridge-state { color: #929b8a; font-size: .59rem; text-align: right; }
.analysis-bridge-state.is-connected { color: #a8d7a8; }
.analysis-camera { display: grid; gap: .55rem; }
.analysis-camera video { width: 100%; max-height: 280px; border-radius: 11px; background: #050805; object-fit: contain; }
.analysis-camera-buttons { display: flex; flex-wrap: wrap; gap: .5rem; }
.analysis-primary-button { color: #f3edda; border-color: rgba(223, 197, 116, .35); background: rgba(144, 116, 46, .2); }
.analysis-crop-label { margin-bottom: -.55rem; color: #aab29e; font-size: .67rem; font-weight: 650; }
.analysis-crop-select { width: 100%; min-height: 40px; padding: .5rem .65rem; border: 1px solid rgba(196, 218, 147, .16); border-radius: 9px; color: #e1e6d8; background: #182118; font-size: .72rem; }
.analysis-run-button { display: inline-flex; min-height: 43px; align-items: center; justify-content: center; gap: .5rem; padding: .65rem .85rem; border: 1px solid rgba(223, 197, 116, .35); border-radius: 10px; color: #f1e8c9; background: linear-gradient(135deg, rgba(115, 98, 45, .55), rgba(49, 85, 51, .65)); font-size: .74rem; font-weight: 750; transition: opacity .2s, transform .2s; }
.analysis-run-button:not(:disabled):hover { transform: translateY(-1px); }
.analysis-run-button:disabled { opacity: .45; cursor: not-allowed; }
.analysis-spinner { animation: analysis-spin .9s linear infinite; }
.analysis-feedback { display: flex; align-items: flex-start; gap: .45rem; font-size: .67rem; line-height: 1.45; }
.analysis-feedback svg { flex: 0 0 auto; }
.analysis-feedback.is-error { color: #f0a08d; }
.analysis-feedback.is-success { color: #a8d7a8; }
.analysis-empty, .analysis-loading { display: grid; min-height: 385px; place-content: center; justify-items: center; gap: .65rem; padding: 1.5rem; text-align: center; }
.analysis-empty > span { display: grid; width: 55px; height: 55px; place-items: center; border: 1px solid rgba(196, 218, 147, .15); border-radius: 17px; color: #b8b07b; background: rgba(196, 218, 147, .06); }
.analysis-empty strong, .analysis-loading strong { color: #dde4d4; font-size: .78rem; }
.analysis-empty p, .analysis-loading p { max-width: 310px; color: #8e9885; font-size: .68rem; line-height: 1.55; }
.analysis-loading { color: #dfc574; }
.analysis-export { padding: .4rem .55rem; border: 1px solid rgba(196, 218, 147, .17); border-radius: 7px; color: #d6cb9d; font-size: .62rem; }
.analysis-history-list { display: grid; gap: .45rem; }
.analysis-history-item { display: flex; min-width: 0; align-items: center; gap: .65rem; padding: .65rem; border: 1px solid rgba(196, 218, 147, .1); border-radius: 9px; color: #aab29e; text-align: left; background: rgba(5, 10, 7, .18); }
.analysis-history-item:hover { border-color: rgba(196, 218, 147, .3); background: rgba(5, 10, 7, .35); }
.analysis-history-icon { display: grid; width: 32px; height: 32px; flex: 0 0 32px; place-items: center; border-radius: 9px; color: #dfc574; background: rgba(223, 197, 116, .08); }
.analysis-history-copy { display: grid; min-width: 0; flex: 1; gap: .2rem; }
.analysis-history-copy strong, .analysis-history-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analysis-history-copy strong { color: #d7ddcb; font-size: .67rem; font-weight: 650; }
.analysis-history-copy small { color: #909987; font-size: .59rem; }
.analysis-history-empty { color: #909987; font-size: .68rem; }
.analysis-result { display: grid; gap: .85rem; }
.analysis-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: .7rem; padding: .8rem; border: 1px solid rgba(196, 218, 147, .12); border-radius: 10px; background: rgba(5, 10, 7, .22); }
.analysis-summary > div > span { color: #c1a95f; font-size: .54rem; font-weight: 850; letter-spacing: .13em; }
.analysis-summary p { margin-top: .35rem; color: #c6cdbd; font-size: .7rem; line-height: 1.55; }
.analysis-quality { padding: .3rem .45rem; border-radius: 6px; color: #bad8b0; background: rgba(87, 136, 76, .13); font-size: .57rem; font-weight: 700; white-space: nowrap; }
.quality-limitada { color: #e6d28b; background: rgba(163, 128, 51, .14); }
.quality-insuficiente { color: #e6a692; background: rgba(164, 81, 64, .14); }
.analysis-count { display: flex; align-items: baseline; gap: .4rem; color: #9ea895; font-size: .66rem; }
.analysis-count strong { color: #e5d28f; font-size: 1.1rem; }
.analysis-findings { display: grid; gap: .65rem; }
.analysis-finding { display: grid; gap: .55rem; padding: .8rem; border: 1px solid rgba(196, 218, 147, .12); border-radius: 10px; background: rgba(5, 10, 7, .2); }
.finding-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }
.finding-category { color: #b8af7d; font-size: .57rem; font-weight: 720; }
.finding-heading h3 { margin-top: .18rem; color: #e5e9dd; font-size: .78rem; font-weight: 700; }
.finding-severity { padding: .25rem .4rem; border-radius: 6px; color: #a9d8a8; background: rgba(74, 128, 69, .14); font-size: .56rem; font-weight: 750; text-transform: capitalize; }
.severity-media { color: #e6d28b; background: rgba(163, 128, 51, .14); }
.severity-alta { color: #f0a08d; background: rgba(164, 81, 64, .15); }
.severity-incierta { color: #aeb8c2; background: rgba(92, 111, 130, .16); }
.finding-confidence { display: flex; justify-content: space-between; color: #929b8a; font-size: .59rem; }
.finding-confidence strong { color: #c9d6b7; }
.finding-meter { height: 4px; overflow: hidden; border-radius: 99px; background: rgba(196, 218, 147, .12); }
.finding-meter span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #879a58, #d8c278); }
.analysis-finding > p { color: #aeb6a5; font-size: .65rem; line-height: 1.5; }
.analysis-finding > p strong { color: #d5dacd; }
.analysis-no-findings { display: flex; gap: .5rem; padding: .8rem; border: 1px solid rgba(114, 213, 159, .15); border-radius: 9px; color: #b5c9ad; background: rgba(57, 119, 68, .08); font-size: .67rem; line-height: 1.5; }
.analysis-no-findings svg { flex: 0 0 auto; }
.analysis-disclaimer { display: flex; align-items: flex-start; gap: .4rem; color: #9f997b; font-size: .6rem; line-height: 1.45; }
.analysis-disclaimer svg { flex: 0 0 auto; }
.analysis-footer { display: flex; align-items: center; gap: .45rem; color: #858e7c; font-size: .63rem; }
.analysis-footer svg { flex: 0 0 auto; color: #a8bd87; }
@keyframes analysis-spin { to { transform: rotate(360deg); } }
@keyframes analysis-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 900px) { .analysis-grid { grid-template-columns: 1fr; } .analysis-empty, .analysis-loading { min-height: 240px; } }
@media (max-width: 600px) { .analysis-heading { align-items: flex-start; flex-direction: column; } .analysis-card :deep(.app-card-body) { padding: 1rem; } .analysis-summary { flex-direction: column; } .analysis-bridge-controls { grid-template-columns: 1fr; } .analysis-bridge-controls label { grid-column: auto; } .analysis-bridge-state { text-align: left; } }
@media (prefers-reduced-motion: reduce) { .analysis-page { animation: none; } .analysis-spinner { animation-duration: 2s; } }
</style>
