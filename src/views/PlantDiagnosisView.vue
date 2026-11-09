<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  ScanSearch,
  ShieldCheck,
  Video,
  VideoOff
} from 'lucide-vue-next'
import { diagnosePlantImage, type PlantDiagnosis } from '../services/plantDiagnosis'

const maxImageSize = 10 * 1024 * 1024
const endpoint = import.meta.env.VITE_PLANT_DIAGNOSIS_API_URL?.trim() ?? ''

const fileInput = ref<HTMLInputElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const cameraStream = ref<MediaStream | null>(null)
const cameraActive = computed(() => cameraStream.value !== null)
const isAnalyzing = ref(false)
const errorMessage = ref('')
const cameraMessage = ref('')
const diagnosis = ref<PlantDiagnosis | null>(null)
const hasEndpoint = computed(() => endpoint.length > 0)

function formatDiseaseName(disease: string) {
  return disease
    .replace('___', ' · ')
    .replaceAll('_', ' ')
    .replaceAll(',', '')
}

function clearPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function setImage(file: File) {
  errorMessage.value = ''
  diagnosis.value = null

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    errorMessage.value = 'Selecciona una imagen JPG, PNG o WebP.'
    return
  }
  if (file.size > maxImageSize) {
    errorMessage.value = 'La imagen supera el límite de 10 MB.'
    return
  }

  stopCamera()
  clearPreview()
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) setImage(file)
  input.value = ''
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files[0]
  if (file) setImage(file)
}

async function startCamera() {
  errorMessage.value = ''
  cameraMessage.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraMessage.value = 'Este navegador no permite acceder a la cámara. Usa HTTPS o localhost y selecciona una imagen.'
    return
  }

  try {
    cameraStream.value = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    })
    await nextTick()
    if (videoElement.value) {
      videoElement.value.srcObject = cameraStream.value
      await videoElement.value.play()
    }
  } catch (error) {
    stopCamera()
    cameraMessage.value = error instanceof Error
      ? `No se pudo iniciar la cámara: ${error.message}`
      : 'No se pudo iniciar la cámara. Revisa los permisos del navegador.'
  }
}

function stopCamera() {
  cameraStream.value?.getTracks().forEach(track => track.stop())
  cameraStream.value = null
  if (videoElement.value) videoElement.value.srcObject = null
}

async function capturePhoto() {
  const video = videoElement.value
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    cameraMessage.value = 'Espera a que la cámara muestre la imagen antes de tomar la foto.'
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) {
    cameraMessage.value = 'No se pudo procesar la imagen de la cámara.'
    return
  }
  context.drawImage(video, 0, 0)

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) {
    cameraMessage.value = 'No se pudo capturar la imagen. Inténtalo de nuevo.'
    return
  }

  setImage(new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' }))
  cameraMessage.value = ''
}

async function analyzeImage() {
  if (!selectedFile.value || !hasEndpoint.value || isAnalyzing.value) return

  isAnalyzing.value = true
  errorMessage.value = ''
  diagnosis.value = null
  try {
    diagnosis.value = await diagnosePlantImage(endpoint, selectedFile.value)
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudo completar el diagnóstico. Verifica la conexión e inténtalo de nuevo.'
  } finally {
    isAnalyzing.value = false
  }
}

function chooseAnotherImage() {
  selectedFile.value = null
  diagnosis.value = null
  errorMessage.value = ''
  clearPreview()
}

onBeforeUnmount(() => {
  stopCamera()
  clearPreview()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Exploración fitosanitaria</p>
        <h1 class="mt-2 text-3xl font-semibold text-white">Diagnóstico de cultivos</h1>
        <p class="mt-2 max-w-2xl text-sm text-stone-300">
          Sube una foto o captura una hoja para analizarla con el modelo de enfermedades conectado a AgronIA.
        </p>
      </div>
      <div class="flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-stone-300 sm:self-auto">
        <span class="h-2 w-2 rounded-full" :class="hasEndpoint ? 'bg-emerald-400' : 'bg-amber-400'"></span>
        {{ hasEndpoint ? 'Servicio configurado' : 'Servicio no configurado' }}
      </div>
    </header>

    <div
      v-if="!hasEndpoint"
      class="flex gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100"
      role="status"
    >
      <AlertCircle class="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
      <div>
        <p class="font-semibold">Falta conectar el modelo de IA</p>
        <p class="mt-1 text-amber-100/75">
          Configura <code class="rounded bg-black/20 px-1.5 py-0.5">VITE_PLANT_DIAGNOSIS_API_URL</code>
          con la dirección de un servicio compatible y reinicia AgronIA. No se mostrarán predicciones simuladas.
        </p>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <section class="rounded-2xl border border-white/10 bg-[#172019]/90 p-5 shadow-xl sm:p-6">
        <div class="flex items-center gap-3">
          <div class="rounded-xl bg-emerald-400/10 p-2.5 text-emerald-300"><ScanSearch class="h-5 w-5" /></div>
          <div>
            <h2 class="font-semibold text-white">Imagen de la planta</h2>
            <p class="text-xs text-stone-400">JPG, PNG o WebP · máximo 10 MB</p>
          </div>
        </div>

        <div
          v-if="!previewUrl"
          class="mt-5 flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-black/10 px-6 py-10 text-center transition hover:border-emerald-300/50"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <div class="rounded-full bg-white/5 p-4 text-emerald-200"><ImagePlus class="h-7 w-7" /></div>
          <p class="mt-4 font-medium text-stone-100">Arrastra una imagen de una hoja</p>
          <p class="mt-1 text-sm text-stone-400">o selecciónala desde tu dispositivo</p>
          <button
            type="button"
            class="mt-5 rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200"
            @click="fileInput?.click()"
          >
            Seleccionar imagen
          </button>
          <input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Seleccionar imagen para diagnóstico"
            @change="onFileChange"
          />
        </div>

        <div v-else class="mt-5">
          <div class="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <img :src="previewUrl" :alt="selectedFile?.name || 'Imagen seleccionada para diagnóstico'" class="max-h-[420px] w-full object-contain" />
            <span class="absolute bottom-3 left-3 max-w-[80%] truncate rounded-md bg-black/65 px-2.5 py-1.5 text-xs text-white">
              {{ selectedFile?.name }}
            </span>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="rounded-lg border border-white/15 px-3 py-2 text-sm text-stone-200 hover:bg-white/5" @click="chooseAnotherImage">
              Cambiar imagen
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!hasEndpoint || isAnalyzing"
              @click="analyzeImage"
            >
              <LoaderCircle v-if="isAnalyzing" class="h-4 w-4 animate-spin" />
              <ScanSearch v-else class="h-4 w-4" />
              {{ isAnalyzing ? 'Analizando…' : 'Analizar imagen' }}
            </button>
          </div>
        </div>

        <div class="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-stone-500">
          <span class="h-px flex-1 bg-white/10"></span> O usa la cámara <span class="h-px flex-1 bg-white/10"></span>
        </div>

        <div v-if="cameraActive" class="overflow-hidden rounded-xl border border-white/10 bg-black">
          <video ref="videoElement" class="max-h-80 w-full object-contain" autoplay playsinline muted></video>
          <div class="flex flex-wrap gap-2 p-3">
            <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-950" @click="capturePhoto">
              <Camera class="h-4 w-4" /> Capturar foto
            </button>
            <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-stone-200 hover:bg-white/5" @click="stopCamera">
              <VideoOff class="h-4 w-4" /> Cerrar cámara
            </button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-stone-200 transition hover:border-emerald-300/40 hover:bg-white/5"
          @click="startCamera"
        >
          <Video class="h-4 w-4 text-emerald-300" /> Abrir cámara
        </button>
        <p v-if="cameraMessage" class="mt-3 text-sm text-amber-200" role="status">{{ cameraMessage }}</p>
        <p v-if="errorMessage" class="mt-3 flex items-start gap-2 text-sm text-red-300" role="alert">
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />{{ errorMessage }}
        </p>
      </section>

      <section class="rounded-2xl border border-white/10 bg-[#172019]/90 p-5 shadow-xl sm:p-6">
        <div class="flex items-center gap-3">
          <div class="rounded-xl bg-sky-300/10 p-2.5 text-sky-200"><ShieldCheck class="h-5 w-5" /></div>
          <div>
            <h2 class="font-semibold text-white">Resultado del análisis</h2>
            <p class="text-xs text-stone-400">Diagnóstico generado por el servicio conectado</p>
          </div>
        </div>

        <div v-if="isAnalyzing" class="flex min-h-72 flex-col items-center justify-center text-center">
          <LoaderCircle class="h-9 w-9 animate-spin text-emerald-300" />
          <p class="mt-4 font-medium text-stone-100">Analizando imagen</p>
          <p class="mt-1 text-sm text-stone-400">Esto puede tardar unos segundos.</p>
        </div>
        <div v-else-if="diagnosis" class="mt-6 space-y-5">
          <div class="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4">
            <div class="flex items-center gap-2 text-emerald-200">
              <CheckCircle2 class="h-5 w-5" />
              <span class="text-xs font-bold uppercase tracking-wider">Clasificación recibida</span>
            </div>
            <h3 class="mt-3 text-2xl font-semibold text-white">{{ formatDiseaseName(diagnosis.disease) }}</h3>
            <div class="mt-4 flex items-center justify-between text-sm">
              <span class="text-stone-300">Confianza del modelo</span>
              <span class="font-semibold text-emerald-200">{{ (diagnosis.confidence * 100).toFixed(1) }}%</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full bg-emerald-300" :style="{ width: `${diagnosis.confidence * 100}%` }"></div>
            </div>
          </div>
          <div v-if="diagnosis.cause" class="rounded-xl bg-black/15 p-4">
            <p class="text-xs font-bold uppercase tracking-wider text-stone-400">Causa reportada</p>
            <p class="mt-2 text-sm leading-relaxed text-stone-200">{{ diagnosis.cause }}</p>
          </div>
          <div v-if="diagnosis.recommendation" class="rounded-xl bg-black/15 p-4">
            <p class="text-xs font-bold uppercase tracking-wider text-stone-400">Recomendación del servicio</p>
            <p class="mt-2 text-sm leading-relaxed text-stone-200">{{ diagnosis.recommendation }}</p>
          </div>
          <p class="text-xs leading-relaxed text-stone-500">
            Usa este resultado como orientación inicial; confirma el diagnóstico y el tratamiento con un especialista agrónomo.
          </p>
        </div>
        <div v-else class="flex min-h-72 flex-col items-center justify-center text-center">
          <div class="rounded-full border border-white/10 bg-white/5 p-4 text-stone-400"><ScanSearch class="h-7 w-7" /></div>
          <p class="mt-4 font-medium text-stone-200">Aún no hay resultados</p>
          <p class="mt-1 max-w-xs text-sm text-stone-400">
            Selecciona una imagen y ejecútala contra el servicio de diagnóstico configurado.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
