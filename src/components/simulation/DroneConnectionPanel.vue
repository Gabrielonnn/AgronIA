<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { Activity, Battery, Bug, Cable, Camera, CameraOff, Check, Crosshair, LocateFixed, MapPin, Radio, Save, ShieldCheck, Unplug, Wifi } from 'lucide-vue-next'
import { MavLinkTelemetryParser, type MavLinkTelemetryMessage } from '../../services/mavlinkTelemetry'
import { supabase } from '../../services/supabase'
import { useMainStore } from '../../stores'

type LinkState = 'disconnected' | 'connecting' | 'connected' | 'error'
type ConnectionMode = 'usb' | 'mavlink-bridge' | 'dji-bridge'

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  getInfo(): { usbVendorId?: number; usbProductId?: number }
  readable: ReadableStream<Uint8Array> | null
}

interface WebSerialLike {
  requestPort(): Promise<SerialPortLike>
}

interface DroneTelemetry {
  systemId: number | null
  autopilot: number | null
  vehicleName: string | null
  armed: boolean | null
  latitude: number | null
  longitude: number | null
  altitude: number | null
  groundSpeed: number | null
  heading: number | null
  gpsFix: number | null
  satellites: number | null
  batteryPercent: number | null
  batteryVoltage: number | null
  lastMessageAt: number | null
  messagesReceived: number
  crcErrors: number
  signedPacketsSkipped: number
  incompatibleFramesSkipped: number
}

interface PhoneLocation {
  latitude: number
  longitude: number
  accuracy: number
  capturedAt: number
}

interface SavedObservation {
  id: string
  issue_type: string
  severity: string | null
  notes: string | null
  image_path: string
  latitude: number | null
  longitude: number | null
  location_source: 'drone' | 'phone' | 'none'
  created_at: string
  imageUrl: string
}

const baudRate = ref(57600)
const connectionMode = ref<ConnectionMode>('usb')
const mavlinkBridgeUrl = ref('ws://127.0.0.1:8765')
const djiBridgeUrl = ref('ws://127.0.0.1:8766')
const linkState = ref<LinkState>('disconnected')
const errorMessage = ref('')
const telemetry = ref<DroneTelemetry>({
  systemId: null,
  autopilot: null,
  vehicleName: null,
  armed: null,
  latitude: null,
  longitude: null,
  altitude: null,
  groundSpeed: null,
  heading: null,
  gpsFix: null,
  satellites: null,
  batteryPercent: null,
  batteryVoltage: null,
  lastMessageAt: null,
  messagesReceived: 0,
  crcErrors: 0,
  signedPacketsSkipped: 0,
  incompatibleFramesSkipped: 0,
})
const clock = ref(Date.now())
const cameraVideo = ref<HTMLVideoElement | null>(null)
const cameraStream = shallowRef<MediaStream | null>(null)
const cameraFacingMode = ref<'environment' | 'user'>('environment')
const cameraStarting = ref(false)
const cameraActive = ref(false)
const cameraError = ref('')
let cameraRequestId = 0
const store = useMainStore()
const capturedPhoto = shallowRef<File | null>(null)
const capturedPhotoUrl = ref('')
const photoError = ref('')
const issueType = ref('plaga')
const issueSeverity = ref('media')
const observationNotes = ref('')
const locationSourcePreference = ref<'auto' | 'drone' | 'phone'>('auto')
const phoneLocation = ref<PhoneLocation | null>(null)
const locatingPhone = ref(false)
const locationError = ref('')
const savingObservation = ref(false)
const observationMessage = ref('')
const observationError = ref('')
const loadingObservations = ref(false)
const observationListError = ref('')
const recentObservations = ref<SavedObservation[]>([])

let port: SerialPortLike | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
let readTask: Promise<void> | null = null
let webSocket: WebSocket | null = null
let disconnectRequested = false
let clockInterval: ReturnType<typeof setInterval> | undefined

const serial = computed(() => (navigator as Navigator & { serial?: WebSerialLike }).serial)
const cameraSupported = computed(() =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
)
const phoneLocationFresh = computed(() =>
  phoneLocation.value !== null && clock.value - phoneLocation.value.capturedAt < 5 * 60_000
)
const droneLocationFresh = computed(() =>
  telemetry.value.latitude !== null
  && telemetry.value.longitude !== null
  && telemetry.value.lastMessageAt !== null
  && clock.value - telemetry.value.lastMessageAt < 15_000
)
const observationLocation = computed(() => {
  const preference = locationSourcePreference.value
  if ((preference === 'auto' || preference === 'drone') && droneLocationFresh.value) {
    return {
      latitude: telemetry.value.latitude!,
      longitude: telemetry.value.longitude!,
      source: 'drone' as const,
      accuracy: null,
    }
  }
  if ((preference === 'auto' || preference === 'phone') && phoneLocationFresh.value && phoneLocation.value) {
    return {
      latitude: phoneLocation.value.latitude,
      longitude: phoneLocation.value.longitude,
      source: 'phone' as const,
      accuracy: phoneLocation.value.accuracy,
    }
  }
  return null
})
const hasHeartbeat = computed(() =>
  telemetry.value.lastMessageAt !== null
  && clock.value - telemetry.value.lastMessageAt < 5000
)
const linkLabel = computed(() => {
  if (linkState.value === 'connecting') return 'Conectando'
  if (linkState.value === 'error') return 'Error de conexión'
  if (linkState.value === 'disconnected') return 'Sin conexión'
  return hasHeartbeat.value ? 'Autopiloto en línea' : 'Esperando telemetría'
})
const locationUrl = computed(() => {
  const { latitude, longitude } = telemetry.value
  return latitude === null || longitude === null
    ? ''
    : `https://www.google.com/maps?q=${latitude},${longitude}`
})
const autopilotLabel = computed(() => {
  if (connectionMode.value === 'dji-bridge') return telemetry.value.vehicleName ?? 'DJI · puente'
  if (telemetry.value.autopilot === 3) return 'ArduPilot'
  if (telemetry.value.autopilot === 12) return 'PX4'
  return telemetry.value.autopilot === null
    ? 'Sin heartbeat'
    : `Autopiloto ${telemetry.value.autopilot}`
})

const connectionLabel = computed(() => {
  if (connectionMode.value === 'usb') return 'MAVLink · USB/serial'
  if (connectionMode.value === 'mavlink-bridge') return 'MAVLink · Wi‑Fi/radio'
  return 'DJI · puente'
})

const readNumber = (message: MavLinkTelemetryMessage, field: string) => {
  const value = message.fields[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const updateTelemetry = (message: MavLinkTelemetryMessage) => {
  const next = {
    ...telemetry.value,
    systemId: message.systemId,
    lastMessageAt: Date.now(),
  }
  const name = message.name

  if (name === 'HEARTBEAT') {
    const baseMode = readNumber(message, 'baseMode')
    const autopilot = readNumber(message, 'autopilot')
    if (baseMode !== null) next.armed = (baseMode & 128) !== 0
    if (autopilot !== null) next.autopilot = autopilot
  } else if (name === 'GPS_RAW_INT') {
    const latitude = readNumber(message, 'latitude')
    const longitude = readNumber(message, 'longitude')
    const altitude = readNumber(message, 'altitude')
    const fix = readNumber(message, 'fixType')
    const satellites = readNumber(message, 'satellites')
    if (latitude !== null && longitude !== null && (latitude !== 0 || longitude !== 0)) {
      next.latitude = latitude / 10_000_000
      next.longitude = longitude / 10_000_000
    }
    if (altitude !== null) next.altitude = altitude / 1000
    if (fix !== null) next.gpsFix = fix
    if (satellites !== null && satellites !== 255) next.satellites = satellites
  } else if (name === 'GLOBAL_POSITION_INT') {
    const latitude = readNumber(message, 'latitude')
    const longitude = readNumber(message, 'longitude')
    const altitude = readNumber(message, 'altitude')
    const vx = readNumber(message, 'velocityX')
    const vy = readNumber(message, 'velocityY')
    const heading = readNumber(message, 'heading')
    if (latitude !== null && longitude !== null && (latitude !== 0 || longitude !== 0)) {
      next.latitude = latitude / 10_000_000
      next.longitude = longitude / 10_000_000
    }
    if (altitude !== null) next.altitude = altitude / 1000
    if (vx !== null && vy !== null) next.groundSpeed = Math.hypot(vx, vy) / 100
    if (heading !== null && heading !== 65535) next.heading = heading / 100
  } else if (name === 'VFR_HUD') {
    const speed = readNumber(message, 'groundSpeed')
    const heading = readNumber(message, 'heading')
    const altitude = readNumber(message, 'alt')
    if (speed !== null) next.groundSpeed = speed
    if (heading !== null) next.heading = ((heading % 360) + 360) % 360
    if (altitude !== null && next.altitude === null) next.altitude = altitude
  } else if (name === 'SYS_STATUS') {
    const voltage = readNumber(message, 'batteryVoltage')
    const battery = readNumber(message, 'batteryPercent')
    if (voltage !== null) next.batteryVoltage = voltage
    if (battery !== null && battery >= 0) next.batteryPercent = battery
  } else if (name === 'BATTERY_STATUS') {
    const battery = readNumber(message, 'batteryPercent')
    const voltage = readNumber(message, 'batteryVoltage')
    if (battery !== null && battery >= 0) next.batteryPercent = battery
    if (voltage !== null) next.batteryVoltage = voltage
  }

  next.messagesReceived += 1
  telemetry.value = next
}

const updateDjiTelemetry = (data: unknown) => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('El puente DJI envió un mensaje que no es un objeto JSON.')
  }

  const payload = data as Record<string, unknown>
  if (payload.type !== 'telemetry') {
    throw new Error('El puente DJI debe enviar mensajes con type: "telemetry".')
  }

  const readNumber = (field: string, min: number, max: number) => {
    const value = payload[field]
    if (value === undefined || value === null) return null
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`El campo "${field}" recibido del puente DJI no es válido.`)
    }
    return value
  }

  const vehicleName = payload.vehicleName
  const armed = payload.armed
  if (payload.armed !== undefined && payload.armed !== null && typeof payload.armed !== 'boolean') {
    throw new Error('El campo "armed" recibido del puente DJI debe ser booleano.')
  }
  if (payload.vehicleName !== undefined && payload.vehicleName !== null && typeof payload.vehicleName !== 'string') {
    throw new Error('El campo "vehicleName" recibido del puente DJI debe ser texto.')
  }

  const next = { ...telemetry.value }
  const systemId = readNumber('systemId', 0, 255)
  const latitude = readNumber('latitude', -90, 90)
  const longitude = readNumber('longitude', -180, 180)
  const altitude = readNumber('altitude', -1000, 100000)
  const groundSpeed = readNumber('groundSpeed', 0, 1000)
  const heading = readNumber('heading', 0, 360)
  const gpsFix = readNumber('gpsFix', 0, 10)
  const satellites = readNumber('satellites', 0, 255)
  const batteryPercent = readNumber('batteryPercent', 0, 100)
  const batteryVoltage = readNumber('batteryVoltage', 0, 1000)

  if (systemId !== null) next.systemId = systemId
  if (typeof vehicleName === 'string' || vehicleName === null) next.vehicleName = vehicleName
  if (typeof armed === 'boolean' || armed === null) next.armed = armed
  if (latitude !== null) next.latitude = latitude
  if (longitude !== null) next.longitude = longitude
  if (altitude !== null) next.altitude = altitude
  if (groundSpeed !== null) next.groundSpeed = groundSpeed
  if (heading !== null) next.heading = heading === 360 ? 0 : heading
  if (gpsFix !== null) next.gpsFix = gpsFix
  if (satellites !== null) next.satellites = satellites
  if (batteryPercent !== null) next.batteryPercent = batteryPercent
  if (batteryVoltage !== null) next.batteryVoltage = batteryVoltage
  next.lastMessageAt = Date.now()
  next.messagesReceived += 1
  telemetry.value = next
}

const closePort = async (activePort: SerialPortLike) => {
  if (!activePort.readable) return
  await activePort.close()
}

const readMavlink = async (
  activePort: SerialPortLike,
  activeReader: ReadableStreamDefaultReader<Uint8Array>,
  activeParser: MavLinkTelemetryParser,
) => {
  try {
    while (true) {
      const { value, done } = await activeReader.read()
      if (done) break
      if (value) {
        const messages = activeParser.feed(value)
        for (const message of messages) updateTelemetry(message)
        telemetry.value = {
          ...telemetry.value,
          crcErrors: activeParser.crcErrors,
          signedPacketsSkipped: activeParser.signedPacketsSkipped,
          incompatibleFramesSkipped: activeParser.incompatibleFramesSkipped,
        }
      }
    }
  } catch (error) {
    if (!disconnectRequested) {
      linkState.value = 'error'
      errorMessage.value = error instanceof Error
        ? `Se interrumpió la lectura MAVLink: ${error.message}`
        : 'Se interrumpió la lectura del puerto serie.'
    }
  } finally {
    activeReader.releaseLock()
    reader = null
    readTask = null
    if (port === activePort) {
      port = null
      try {
        await closePort(activePort)
      } catch (error) {
        if (!disconnectRequested) {
          linkState.value = 'error'
          errorMessage.value = error instanceof Error
            ? `No se pudo cerrar el puerto serie: ${error.message}`
            : 'No se pudo cerrar el puerto serie.'
        }
      }
    }
    if (disconnectRequested) {
      linkState.value = 'disconnected'
      disconnectRequested = false
    } else if (linkState.value === 'connected') {
      linkState.value = 'disconnected'
      if (!errorMessage.value) errorMessage.value = 'El puerto serie se cerró antes de terminar la lectura.'
    }
  }
}

const connect = async () => {
  errorMessage.value = ''
  if (connectionMode.value !== 'usb') {
    await connectBridge()
    return
  }

  if (!serial.value) {
    linkState.value = 'error'
    errorMessage.value = 'Este navegador no admite Web Serial. Usa Chrome o Edge en escritorio y abre AgronIA mediante HTTPS o localhost.'
    return
  }

  linkState.value = 'connecting'
  telemetry.value.lastMessageAt = null
  try {
    const selectedPort = await serial.value.requestPort()
    port = selectedPort
    disconnectRequested = false
    const parser = new MavLinkTelemetryParser()
    await selectedPort.open({ baudRate: baudRate.value })
    if (!selectedPort.readable) throw new Error('El puerto se abrió, pero no está disponible para lectura.')
    const selectedReader = selectedPort.readable.getReader()
    reader = selectedReader
    linkState.value = 'connected'
    readTask = readMavlink(selectedPort, selectedReader, parser)
  } catch (error) {
    linkState.value = 'disconnected'
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      errorMessage.value = 'No se seleccionó ningún puerto serie.'
      return
    }
    linkState.value = 'error'
    errorMessage.value = error instanceof Error
      ? `No se pudo conectar al controlador: ${error.message}`
      : 'No se pudo conectar al controlador del dron.'
    if (port && !reader) {
      const failedPort = port
      port = null
      await closePort(failedPort).catch((closeError: unknown) => {
        const detail = closeError instanceof Error ? closeError.message : 'error desconocido'
        errorMessage.value += ` Además, falló el cierre del puerto: ${detail}`
      })
    }
  }
}

const connectBridge = async () => {
  const urlValue = connectionMode.value === 'mavlink-bridge'
    ? mavlinkBridgeUrl.value.trim()
    : djiBridgeUrl.value.trim()
  let url: URL
  try {
    url = new URL(urlValue)
  } catch {
    linkState.value = 'error'
    errorMessage.value = 'Escribe una URL WebSocket válida (ws:// o wss://).'
    return
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    linkState.value = 'error'
    errorMessage.value = 'La dirección del puente debe usar ws:// o wss://.'
    return
  }
  if (window.location.protocol === 'https:' && url.protocol === 'ws:') {
    linkState.value = 'error'
    errorMessage.value = 'Esta página usa HTTPS y el navegador bloquea ws://. Configura el puente con wss://.'
    return
  }

  errorMessage.value = ''
  linkState.value = 'connecting'
  disconnectRequested = false
  telemetry.value.lastMessageAt = null
  const parser = connectionMode.value === 'mavlink-bridge' ? new MavLinkTelemetryParser() : null
  const socket = new WebSocket(url.toString())
  socket.binaryType = 'arraybuffer'
  webSocket = socket

  try {
    let transportError = false
    await new Promise<void>((resolve, reject) => {
      let opened = false
      const timeout = window.setTimeout(() => {
        if (opened) return
        socket.close()
        reject(new Error('El puente no respondió al abrir WebSocket (10 s).'))
      }, 10_000)

      socket.onopen = () => {
        opened = true
        window.clearTimeout(timeout)
        resolve()
      }
      socket.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('No se pudo abrir WebSocket con el puente. Verifica la URL y que acepte conexiones del navegador.'))
      }
      socket.onclose = event => {
        window.clearTimeout(timeout)
        if (!opened) {
          reject(new Error(`El puente cerró la conexión antes de iniciarla (código ${event.code}).`))
          return
        }
        if (webSocket !== socket) return
        webSocket = null
        linkState.value = disconnectRequested ? 'disconnected' : 'error'
        if (!disconnectRequested && !transportError) {
          errorMessage.value = `Se cerró la conexión con el puente (código ${event.code}).`
        }
        disconnectRequested = false
      }
    })

    linkState.value = 'connected'
    socket.onerror = () => {
      transportError = true
      linkState.value = 'error'
      errorMessage.value = 'Se perdió la comunicación WebSocket con el puente.'
      socket.close()
    }
    socket.onmessage = event => {
      void (async () => {
        try {
          if (connectionMode.value === 'mavlink-bridge' && parser) {
            let bytes: Uint8Array
            if (event.data instanceof ArrayBuffer) {
              bytes = new Uint8Array(event.data)
            } else if (event.data instanceof Blob) {
              bytes = new Uint8Array(await event.data.arrayBuffer())
            } else {
              throw new Error('El puente MAVLink debe enviar tramas MAVLink como mensajes WebSocket binarios.')
            }
            for (const message of parser.feed(bytes)) updateTelemetry(message)
            telemetry.value = {
              ...telemetry.value,
              crcErrors: parser.crcErrors,
              signedPacketsSkipped: parser.signedPacketsSkipped,
              incompatibleFramesSkipped: parser.incompatibleFramesSkipped,
            }
          } else {
            if (typeof event.data !== 'string') {
              throw new Error('El puente DJI debe enviar objetos JSON como texto WebSocket.')
            }
            updateDjiTelemetry(JSON.parse(event.data))
          }
        } catch (error) {
          transportError = true
          linkState.value = 'error'
          errorMessage.value = error instanceof Error
            ? error.message
            : 'El puente envió telemetría que no se pudo procesar.'
          socket.close()
        }
      })()
    }
  } catch (error) {
    if (webSocket === socket) webSocket = null
    linkState.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo conectar con el puente.'
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
  }
}

const disconnect = async () => {
  if (webSocket) {
    disconnectRequested = true
    webSocket.close(1000, 'Desconexión solicitada desde AgronIA')
    webSocket = null
    linkState.value = 'disconnected'
    return
  }

  if (!reader) {
    if (port) {
      const activePort = port
      port = null
      try {
        await closePort(activePort)
        linkState.value = 'disconnected'
      } catch (error) {
        linkState.value = 'error'
        errorMessage.value = error instanceof Error
          ? `No se pudo cerrar el puerto serie: ${error.message}`
          : 'No se pudo cerrar el puerto serie.'
      }
    }
    return
  }

  disconnectRequested = true
  linkState.value = 'connecting'
  const activeReader = reader
  try {
    await activeReader.cancel()
    await readTask
  } catch (error) {
    linkState.value = 'error'
    errorMessage.value = error instanceof Error
      ? `No se pudo desconectar limpiamente: ${error.message}`
      : 'No se pudo desconectar limpiamente.'
  }
}

const releaseCapturedPhoto = () => {
  if (capturedPhotoUrl.value) URL.revokeObjectURL(capturedPhotoUrl.value)
  capturedPhotoUrl.value = ''
  capturedPhoto.value = null
}

const stopCamera = () => {
  cameraRequestId += 1
  const activeStream = cameraStream.value
  cameraStream.value = null
  cameraActive.value = false
  if (cameraVideo.value) cameraVideo.value.srcObject = null
  activeStream?.getTracks().forEach(track => {
    track.onended = null
    track.stop()
  })
}

const startCamera = async () => {
  if (cameraStarting.value || cameraActive.value) return
  cameraError.value = ''

  if (!window.isSecureContext) {
    cameraError.value = 'El navegador solo permite usar la cámara en HTTPS o localhost. Abre la versión segura de AgronIA.'
    return
  }
  if (!cameraSupported.value) {
    cameraError.value = 'Este navegador no ofrece acceso a la cámara. Usa una versión reciente de Chrome, Edge o Safari.'
    return
  }

  const requestId = ++cameraRequestId
  cameraStarting.value = true
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: cameraFacingMode.value },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
    if (requestId !== cameraRequestId) {
      stream.getTracks().forEach(track => track.stop())
      return
    }

    cameraStream.value = stream
    stream.getVideoTracks().forEach(track => {
      track.onended = () => {
        if (cameraStream.value !== stream) return
        cameraStream.value = null
        cameraActive.value = false
        if (cameraVideo.value) cameraVideo.value.srcObject = null
        cameraError.value = 'La cámara se desconectó o se revocó el permiso.'
      }
    })
    await nextTick()
    if (requestId !== cameraRequestId) {
      stream.getTracks().forEach(track => track.stop())
      return
    }
    if (!cameraVideo.value) throw new Error('No se encontró el reproductor de cámara.')

    cameraVideo.value.srcObject = stream
    await cameraVideo.value.play()
    cameraActive.value = true
  } catch (error) {
    if (stream) stream.getTracks().forEach(track => {
      track.onended = null
      track.stop()
    })
    if (cameraStream.value === stream) cameraStream.value = null
    cameraActive.value = false
    if (cameraVideo.value) cameraVideo.value.srcObject = null

    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      cameraError.value = 'No se concedió permiso para la cámara. Permítelo en el navegador y vuelve a intentar.'
    } else if (error instanceof DOMException && error.name === 'NotFoundError') {
      cameraError.value = 'No se encontró una cámara disponible en este dispositivo.'
    } else if (error instanceof DOMException && error.name === 'NotReadableError') {
      cameraError.value = 'La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentar.'
    } else {
      cameraError.value = error instanceof Error
        ? `No se pudo iniciar la cámara: ${error.message}`
        : 'No se pudo iniciar la cámara por un error inesperado.'
    }
  } finally {
    cameraStarting.value = false
  }
}

const switchCamera = async () => {
  const restart = cameraActive.value
  stopCamera()
  cameraError.value = ''
  cameraFacingMode.value = cameraFacingMode.value === 'environment' ? 'user' : 'environment'
  if (restart) await startCamera()
}

const capturePhoto = async () => {
  const video = cameraVideo.value
  if (!cameraActive.value || !video || !video.videoWidth || !video.videoHeight) {
    photoError.value = 'Inicia la cámara y espera a que aparezca la imagen antes de tomar la foto.'
    return
  }

  photoError.value = ''
  observationMessage.value = ''
  const maxDimension = 1920
  const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const context = canvas.getContext('2d')
  if (!context) {
    photoError.value = 'El navegador no pudo preparar la foto. Inténtalo de nuevo.'
    return
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height)

  try {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('El navegador no pudo generar la imagen.')
    if (blob.size > 5 * 1024 * 1024) {
      photoError.value = 'La foto supera el límite de 5 MB. Prueba con menor resolución.'
      return
    }

    releaseCapturedPhoto()
    capturedPhoto.value = new File([blob], `agronia-${Date.now()}.jpg`, { type: 'image/jpeg' })
    capturedPhotoUrl.value = URL.createObjectURL(blob)
  } catch (error) {
    photoError.value = error instanceof Error
      ? `No se pudo capturar la foto: ${error.message}`
      : 'No se pudo capturar la foto.'
  }
}

const locatePhone = () => {
  locationError.value = ''
  if (!navigator.geolocation) {
    locationError.value = 'Este navegador no ofrece geolocalización.'
    return
  }

  locatingPhone.value = true
  navigator.geolocation.getCurrentPosition(
    position => {
      phoneLocation.value = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: Date.now(),
      }
      locatingPhone.value = false
      locationError.value = ''
    },
    error => {
      locatingPhone.value = false
      if (error.code === error.PERMISSION_DENIED) {
        locationError.value = 'No se concedió permiso para la ubicación. Permítelo en el navegador y vuelve a intentar.'
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        locationError.value = 'El teléfono no pudo determinar su ubicación. Comprueba el GPS y la señal.'
      } else {
        locationError.value = 'La ubicación tardó demasiado. Inténtalo de nuevo.'
      }
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
  )
}

const loadRecentObservations = async () => {
  const client = supabase
  const userId = store.user?.id
  if (!client || !userId) {
    observationListError.value = 'Inicia sesión y configura Supabase para consultar registros.'
    return
  }

  loadingObservations.value = true
  observationListError.value = ''
  try {
    const { data, error } = await client
      .from('field_observations')
      .select('id, issue_type, severity, notes, image_path, latitude, longitude, location_source, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(6)

    if (error) {
      observationListError.value = `No se pudieron cargar los registros: ${error.message}. Comprueba que ejecutaste supabase_field_scouting_setup.sql.`
      recentObservations.value = []
      return
    }

    const observations = await Promise.all((data ?? []).map(async (row): Promise<SavedObservation> => {
      const { data: signedImage, error: signedImageError } = await client.storage
        .from('field-observations')
        .createSignedUrl(row.image_path, 3600)
      if (signedImageError) {
        throw new Error(`No se pudo abrir la foto de un registro: ${signedImageError.message}`)
      }
      return { ...row, imageUrl: signedImage.signedUrl } as SavedObservation
    }))
    recentObservations.value = observations
  } catch (error) {
    observationListError.value = error instanceof Error
      ? error.message
      : 'No se pudieron abrir las fotos de los registros.'
    recentObservations.value = []
  } finally {
    loadingObservations.value = false
  }
}

const saveObservation = async () => {
  const userId = store.user?.id
  const photo = capturedPhoto.value
  if (!supabase) {
    observationError.value = 'Supabase no está configurado. No se guardó el registro.'
    return
  }
  if (!userId) {
    observationError.value = 'Inicia sesión para guardar una observación.'
    return
  }
  if (!photo) {
    observationError.value = 'Toma una foto antes de guardar el registro.'
    return
  }
  if ((issueType.value === 'sin_hallazgo') !== (issueSeverity.value === 'ninguna')) {
    observationError.value = 'Selecciona un nivel de severidad para el hallazgo, o “Sin severidad” si no se observó un problema.'
    return
  }

  savingObservation.value = true
  observationError.value = ''
  observationMessage.value = ''
  const imagePath = `${userId}/${crypto.randomUUID()}.jpg`
  const location = observationLocation.value
  const droneIsFresh = droneLocationFresh.value

  try {
    const { error: uploadError } = await supabase.storage
      .from('field-observations')
      .upload(imagePath, photo, { cacheControl: '3600', contentType: 'image/jpeg', upsert: false })

    if (uploadError) {
      observationError.value = `No se pudo subir la foto: ${uploadError.message}. Comprueba el bucket ejecutando supabase_field_scouting_setup.sql.`
      return
    }

    const { error: insertError } = await supabase.from('field_observations').insert({
      user_id: userId,
      issue_type: issueType.value,
      severity: issueSeverity.value === 'ninguna' ? null : issueSeverity.value,
      notes: observationNotes.value.trim() || null,
      image_path: imagePath,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_source: location?.source ?? 'none',
      location_accuracy_m: location?.accuracy ?? null,
      drone_system_id: droneIsFresh ? telemetry.value.systemId : null,
      drone_altitude_m: droneIsFresh ? telemetry.value.altitude : null,
      drone_heading_deg: droneIsFresh ? telemetry.value.heading : null,
    })

    if (insertError) {
      const { error: cleanupError } = await supabase.storage.from('field-observations').remove([imagePath])
      observationError.value = `La foto se subió, pero no se pudo guardar el registro: ${insertError.message}${cleanupError ? ` No se pudo borrar la foto temporal: ${cleanupError.message}` : ''}`
      return
    }

    releaseCapturedPhoto()
    observationNotes.value = ''
    observationMessage.value = 'Observación guardada con su foto.'
    await loadRecentObservations()
  } catch (error) {
    observationError.value = error instanceof Error
      ? `No se pudo guardar la observación: ${error.message}`
      : 'No se pudo guardar la observación por un error inesperado.'
  } finally {
    savingObservation.value = false
  }
}

const handleIssueTypeChange = () => {
  issueSeverity.value = issueType.value === 'sin_hallazgo' ? 'ninguna' : 'media'
}

const issueLabels: Record<string, string> = {
  plaga: 'Posible plaga',
  enfermedad: 'Posible enfermedad',
  estres_hidrico: 'Estrés hídrico',
  deficiencia_nutricional: 'Deficiencia nutricional',
  otro: 'Otro hallazgo',
  sin_hallazgo: 'Sin hallazgo',
}
const severityLabels: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

const formatValue = (value: number | null, digits = 1) =>
  value === null ? '—' : value.toFixed(digits)
const formatCoordinate = (value: number | null) =>
  value === null ? 'Sin posición GPS' : value.toFixed(6)
const gpsFixLabel = (fix: number | null) => {
  if (fix === null) return 'Sin datos GPS'
  if (fix <= 1) return 'Sin señal GPS'
  if (fix === 2) return 'GPS 2D'
  if (fix === 3) return 'GPS 3D'
  return `GPS tipo ${fix}`
}

onMounted(() => {
  clockInterval = setInterval(() => { clock.value = Date.now() }, 1000)
  void loadRecentObservations()
})

onBeforeUnmount(() => {
  stopCamera()
  releaseCapturedPhoto()
  if (clockInterval) clearInterval(clockInterval)
  if (webSocket) {
    disconnectRequested = true
    webSocket.close(1000, 'Vista cerrada')
  }
  if (reader) void disconnect()
})
</script>

<template>
  <section class="drone-link-panel" aria-labelledby="drone-link-title">
    <header class="drone-link-header">
      <div class="drone-link-title">
        <span class="drone-link-icon"><Radio :size="18" /></span>
        <div>
          <span class="drone-link-eyebrow">TELEMETRÍA REAL · SOLO LECTURA</span>
          <h2 id="drone-link-title">Conexión con dron</h2>
        </div>
      </div>
      <span class="drone-link-status" :class="`is-${linkState}`">
        <span></span>{{ linkLabel }}
      </span>
    </header>

    <div class="drone-link-body">
      <div class="drone-link-connect">
        <div class="connection-modes" role="group" aria-label="Método de conexión">
          <button type="button" :aria-pressed="connectionMode === 'usb'" :disabled="linkState === 'connected' || linkState === 'connecting'" @click="connectionMode = 'usb'">
            <Cable :size="14" /> USB
          </button>
          <button type="button" :aria-pressed="connectionMode === 'mavlink-bridge'" :disabled="linkState === 'connected' || linkState === 'connecting'" @click="connectionMode = 'mavlink-bridge'">
            <Wifi :size="14" /> MAVLink
          </button>
          <button type="button" :aria-pressed="connectionMode === 'dji-bridge'" :disabled="linkState === 'connected' || linkState === 'connecting'" @click="connectionMode = 'dji-bridge'">
            <Radio :size="14" /> DJI
          </button>
        </div>
        <p v-if="connectionMode === 'usb'">
          Controlador ArduPilot o PX4 por USB. El navegador debe admitir Web Serial y usar HTTPS o localhost.
        </p>
        <p v-else-if="connectionMode === 'mavlink-bridge'">
          Conecta la radio o Wi‑Fi a un puente de computadora que retransmita tramas MAVLink binarias por WebSocket.
        </p>
        <p v-else>
          Para DJI se requiere un puente local basado en DJI SDK/Cloud API que convierta la telemetría a JSON WebSocket.
        </p>
        <div class="drone-link-controls">
          <label v-if="connectionMode === 'usb'" class="drone-link-baud">
            <span>Velocidad</span>
            <select v-model.number="baudRate" :disabled="linkState === 'connected' || linkState === 'connecting'">
              <option :value="57600">57 600 baud</option>
              <option :value="115200">115 200 baud</option>
              <option :value="921600">921 600 baud</option>
            </select>
          </label>
          <label v-else class="drone-link-url">
            <span>URL del puente WebSocket</span>
            <input
              v-if="connectionMode === 'mavlink-bridge'"
              v-model="mavlinkBridgeUrl"
              type="url"
              inputmode="url"
              autocomplete="url"
              placeholder="ws://127.0.0.1:8765"
              :disabled="linkState === 'connected' || linkState === 'connecting'"
            />
            <input
              v-else
              v-model="djiBridgeUrl"
              type="url"
              inputmode="url"
              autocomplete="url"
              placeholder="ws://127.0.0.1:8766"
              :disabled="linkState === 'connected' || linkState === 'connecting'"
            />
          </label>
          <button
            v-if="linkState !== 'connected'"
            class="drone-link-button"
            type="button"
            :disabled="linkState === 'connecting' || (connectionMode === 'usb' && !serial)"
            @click="connect"
          >
            <Cable v-if="connectionMode === 'usb'" :size="16" />
            <Wifi v-else :size="16" />
            {{ linkState === 'connecting' ? 'Conectando…' : `Conectar · ${connectionLabel}` }}
          </button>
          <button v-else class="drone-link-button drone-link-disconnect" type="button" @click="disconnect">
            <Unplug :size="16" /> Desconectar
          </button>
        </div>
        <p v-if="connectionMode === 'usb' && !serial" class="drone-link-support">
          Web Serial no está disponible en este navegador. Prueba con Chrome o Edge en escritorio, usando HTTPS o localhost.
        </p>
        <details v-if="connectionMode === 'dji-bridge'" class="dji-bridge-contract">
          <summary>Formato JSON esperado del puente</summary>
          <pre>{"type":"telemetry","vehicleName":"DJI","latitude":19.43,"longitude":-99.13,"altitude":42.5,"groundSpeed":3.2,"heading":180,"gpsFix":3,"satellites":12,"batteryPercent":86,"batteryVoltage":15.4,"armed":false}</pre>
        </details>
        <p v-if="errorMessage" class="drone-link-error" role="alert">{{ errorMessage }}</p>
        <p class="drone-link-safety">
          <ShieldCheck :size="14" />
          Solo lectura en las tres conexiones: no arma ni controla el dron. Las misiones de arriba solo animan el simulador 3D.
        </p>
      </div>

      <div class="drone-link-telemetry" :class="{ 'telemetry-online': hasHeartbeat }">
        <div class="drone-telemetry-item">
          <span class="drone-telemetry-label"><Activity :size="14" /> {{ connectionLabel }}</span>
          <strong>{{ telemetry.systemId === null ? '—' : `Sistema ${telemetry.systemId}` }}</strong>
          <small>{{ autopilotLabel }}</small>
        </div>
        <div class="drone-telemetry-item">
          <span class="drone-telemetry-label"><Crosshair :size="14" /> GPS</span>
          <strong>{{ gpsFixLabel(telemetry.gpsFix) }}</strong>
          <small>{{ telemetry.satellites === null ? '— satélites' : `${telemetry.satellites} satélites` }}</small>
        </div>
        <div class="drone-telemetry-item">
          <span class="drone-telemetry-label"><MapPin :size="14" /> Posición</span>
          <a v-if="locationUrl" :href="locationUrl" target="_blank" rel="noopener noreferrer">
            {{ formatCoordinate(telemetry.latitude) }}, {{ formatCoordinate(telemetry.longitude) }}
          </a>
          <strong v-else>Esperando GPS</strong>
          <small>          {{ telemetry.altitude === null ? 'Altitud —' : `${formatValue(telemetry.altitude)} m altitud` }}</small>
        </div>
        <div class="drone-telemetry-item">
          <span class="drone-telemetry-label"><Activity :size="14" /> Movimiento</span>
          <strong>{{ telemetry.groundSpeed === null ? '—' : `${formatValue(telemetry.groundSpeed, 2)} m/s` }}</strong>
          <small>{{ telemetry.heading === null ? 'Rumbo —' : `Rumbo ${formatValue(telemetry.heading, 0)}°` }}</small>
        </div>
        <div class="drone-telemetry-item">
          <span class="drone-telemetry-label"><Battery :size="14" /> Batería</span>
          <strong>{{ telemetry.batteryPercent === null ? '—' : `${telemetry.batteryPercent}%` }}</strong>
          <small>{{ telemetry.batteryVoltage === null ? 'Voltaje —' : `${formatValue(telemetry.batteryVoltage, 2)} V` }}</small>
        </div>
      </div>
    </div>

    <section class="drone-link-camera" aria-labelledby="drone-camera-title">
      <div class="drone-camera-heading">
        <div>
          <span class="drone-camera-eyebrow">CÁMARA LOCAL</span>
          <h3 id="drone-camera-title">Vista de cámara</h3>
          <p>Usa la cámara de este teléfono o dispositivo; todavía no es el video del dron.</p>
        </div>
        <span v-if="cameraActive" class="drone-camera-live"><span></span>En vivo</span>
      </div>
      <div class="drone-camera-preview">
        <img
          v-if="capturedPhotoUrl"
          :src="capturedPhotoUrl"
          alt="Foto tomada para registrar una observación"
          class="drone-camera-video"
        />
        <video
          v-else
          ref="cameraVideo"
          v-show="cameraActive"
          class="drone-camera-video"
          autoplay
          muted
          playsinline
          aria-label="Vista en vivo de la cámara local"
        ></video>
        <div v-if="!cameraActive && !capturedPhotoUrl" class="drone-camera-placeholder">
          <Camera :size="26" />
          <span>{{ cameraStarting ? 'Iniciando cámara…' : 'La cámara está apagada' }}</span>
        </div>
      </div>
      <div class="drone-camera-controls">
        <button
          v-if="!cameraActive"
          class="drone-link-button"
          type="button"
          :disabled="cameraStarting || !cameraSupported"
          @click="startCamera"
        >
          <Camera :size="16" /> {{ cameraStarting ? 'Solicitando permiso…' : 'Iniciar cámara' }}
        </button>
        <button v-else class="drone-link-button drone-link-disconnect" type="button" @click="stopCamera">
          <CameraOff :size="16" /> Detener cámara
        </button>
        <button
          class="drone-camera-switch"
          type="button"
          :disabled="cameraStarting || !cameraActive"
          @click="switchCamera"
        >
          {{ cameraFacingMode === 'environment' ? 'Usar cámara frontal' : 'Usar cámara trasera' }}
        </button>
        <button
          v-if="cameraActive"
          class="drone-link-button"
          type="button"
          @click="capturePhoto"
        >
          <Camera :size="16" /> {{ capturedPhoto ? 'Tomar otra foto' : 'Tomar foto' }}
        </button>
      </div>
      <p v-if="cameraError" class="drone-link-error" role="alert">{{ cameraError }}</p>
      <p v-if="photoError" class="drone-link-error" role="alert">{{ photoError }}</p>
      <p class="drone-camera-privacy">
        El navegador te pedirá permiso. Para usar la cámara del teléfono, abre AgronIA desde el teléfono.
        La cámara no controla ni representa el video del dron.
      </p>
      <div class="drone-observation-form">
        <div class="drone-observation-heading">
          <Bug :size="17" />
          <div>
            <h4>Registro de campo</h4>
            <p>Clasificación manual; no es una detección automática de IA.</p>
          </div>
        </div>

        <div class="drone-observation-location">
          <label>
            <span>Ubicación del registro</span>
            <select v-model="locationSourcePreference">
              <option value="auto">Automática (dron y luego teléfono)</option>
              <option value="drone">Telemetría del dron</option>
              <option value="phone">GPS del teléfono</option>
            </select>
          </label>
          <button
            class="drone-camera-switch"
            type="button"
            :disabled="locatingPhone"
            @click="locatePhone"
          >
            <LocateFixed :size="14" /> {{ locatingPhone ? 'Buscando…' : 'Actualizar GPS del teléfono' }}
          </button>
          <p v-if="observationLocation" class="drone-location-status">
            <Check :size="14" />
            {{ observationLocation.source === 'drone' ? 'Dron' : 'Teléfono' }}:
            {{ formatCoordinate(observationLocation.latitude) }}, {{ formatCoordinate(observationLocation.longitude) }}
            <template v-if="observationLocation.accuracy !== null">
              · precisión aprox. {{ Math.round(observationLocation.accuracy) }} m
            </template>
          </p>
          <p v-else class="drone-location-status is-missing">
            <MapPin :size="14" /> Sin ubicación reciente; puedes registrar la foto sin coordenadas.
          </p>
          <p v-if="locationError" class="drone-link-error" role="alert">{{ locationError }}</p>
        </div>

        <div class="drone-observation-fields">
          <label>
            <span>Observación</span>
            <select v-model="issueType" @change="handleIssueTypeChange">
              <option value="plaga">Posible plaga</option>
              <option value="enfermedad">Posible enfermedad</option>
              <option value="estres_hidrico">Estrés hídrico</option>
              <option value="deficiencia_nutricional">Deficiencia nutricional</option>
              <option value="otro">Otro hallazgo</option>
              <option value="sin_hallazgo">Sin hallazgo</option>
            </select>
          </label>
          <label>
            <span>Severidad</span>
            <select v-model="issueSeverity">
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="ninguna">Sin severidad</option>
            </select>
          </label>
          <label class="drone-observation-notes">
            <span>Notas (opcional)</span>
            <textarea v-model="observationNotes" maxlength="1000" rows="2" placeholder="Describe lo observado para revisarlo después"></textarea>
          </label>
        </div>
        <button
          class="drone-link-button"
          type="button"
          :disabled="savingObservation || !capturedPhoto"
          @click="saveObservation"
        >
          <Save :size="16" /> {{ savingObservation ? 'Guardando…' : 'Guardar foto y observación' }}
        </button>
        <p v-if="observationError" class="drone-link-error" role="alert">{{ observationError }}</p>
        <p v-if="observationMessage" class="drone-observation-success" role="status">
          <Check :size="14" /> {{ observationMessage }}
        </p>
        <p v-if="observationListError" class="drone-link-error" role="alert">{{ observationListError }}</p>
      </div>

      <div v-if="loadingObservations" class="drone-observation-list-status">Cargando registros guardados…</div>
      <div v-else-if="recentObservations.length" class="drone-observation-history">
        <h4>Registros recientes</h4>
        <article v-for="observation in recentObservations" :key="observation.id" class="drone-observation-card">
          <img :src="observation.imageUrl" alt="Foto de la observación guardada" loading="lazy" />
          <div>
            <strong>{{ issueLabels[observation.issue_type] ?? 'Observación' }}</strong>
            <span v-if="observation.severity">Severidad {{ severityLabels[observation.severity] ?? observation.severity }}</span>
            <span>
              {{ observation.location_source === 'drone' ? 'GPS del dron' : observation.location_source === 'phone' ? 'GPS del teléfono' : 'Sin ubicación' }}
              <template v-if="observation.latitude !== null && observation.longitude !== null">
                · {{ formatCoordinate(observation.latitude) }}, {{ formatCoordinate(observation.longitude) }}
              </template>
            </span>
            <small>{{ new Date(observation.created_at).toLocaleString('es-MX') }}</small>
            <p v-if="observation.notes">{{ observation.notes }}</p>
          </div>
        </article>
      </div>
    </section>

    <footer class="drone-link-footer">
      <span :class="{ 'telemetry-dot-online': hasHeartbeat }"></span>
      <span>{{ telemetry.messagesReceived }} {{ connectionMode === 'dji-bridge' ? 'lecturas del puente recibidas' : 'mensajes MAVLink recibidos' }}</span>
      <span v-if="telemetry.crcErrors > 0" class="drone-crc-warning">{{ telemetry.crcErrors }} tramas con CRC inválido</span>
      <span v-if="telemetry.signedPacketsSkipped > 0" class="drone-crc-warning">Telemetría firmada omitida</span>
      <span v-if="telemetry.incompatibleFramesSkipped > 0" class="drone-crc-warning">Tramas incompatibles omitidas</span>
      <span v-if="telemetry.armed !== null" class="drone-armed-state" :class="{ 'is-armed': telemetry.armed }">
        {{ telemetry.armed ? 'Armado · solo lectura' : 'Desarmado' }}
      </span>
    </footer>
  </section>
</template>

<style scoped>
.drone-link-panel {
  overflow: hidden;
  border: 1px solid rgba(196, 218, 147, 0.15);
  border-radius: 16px;
  color: #e8eddf;
  background:
    radial-gradient(ellipse at 0 0, rgba(57, 102, 76, 0.15), transparent 43%),
    linear-gradient(145deg, rgba(26, 34, 25, 0.98), rgba(17, 23, 18, 0.98));
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.2);
  animation: drone-panel-enter 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.drone-link-header,
.drone-link-title,
.drone-link-controls,
.drone-link-status,
.drone-link-safety,
.drone-link-footer,
.drone-telemetry-label {
  display: flex;
  align-items: center;
}

.drone-link-header {
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid rgba(196, 218, 147, 0.1);
}

.drone-link-title { min-width: 0; gap: 0.75rem; }
.drone-link-icon { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 1px solid rgba(114, 213, 159, 0.2); border-radius: 11px; color: #8bd4a5; background: rgba(114, 213, 159, 0.08); }
.drone-link-eyebrow { color: #c1a95f; font-size: 0.55rem; font-weight: 800; letter-spacing: 0.14em; }
.drone-link-title h2 { margin-top: 0.2rem; color: #edf0e5; font-size: 0.92rem; font-weight: 700; }
.drone-link-status { flex: 0 0 auto; gap: 0.45rem; color: #a7af9c; font-size: 0.67rem; font-weight: 650; }
.drone-link-status > span,
.drone-link-footer > span:first-child { width: 7px; height: 7px; border-radius: 50%; background: #7e8877; }
.drone-link-status.is-connecting > span { background: #e1c575; animation: drone-pulse 1s infinite; }
.drone-link-status.is-connected > span { background: #d8ad56; }
.drone-link-status.is-error > span { background: #e77f69; }
.drone-link-status.is-connected { color: #e6d28b; }

.drone-link-body { display: grid; grid-template-columns: minmax(225px, 0.8fr) minmax(0, 2fr); }
.drone-link-connect { padding: 1rem 1.15rem; border-right: 1px solid rgba(196, 218, 147, 0.1); }
.drone-link-connect > p:first-child { color: #a8b09e; font-size: 0.7rem; line-height: 1.55; }
.connection-modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.3rem; margin-bottom: 0.8rem; padding: 0.25rem; border: 1px solid rgba(196, 218, 147, 0.1); border-radius: 10px; background: rgba(5, 10, 7, 0.28); }
.connection-modes button { display: inline-flex; min-width: 0; min-height: 32px; align-items: center; justify-content: center; gap: 0.35rem; padding: 0 0.4rem; border: 1px solid transparent; border-radius: 7px; color: #9ba693; font-size: 0.62rem; font-weight: 700; transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease; }
.connection-modes button[aria-pressed="true"] { border-color: rgba(196, 218, 147, 0.15); color: #e9efdf; background: rgba(196, 218, 147, 0.1); }
.connection-modes button:disabled { cursor: not-allowed; opacity: 0.55; }
.connection-modes button:focus-visible, .drone-link-url input:focus-visible { outline: 2px solid #d7c16e; outline-offset: 2px; }
.drone-link-controls { align-items: flex-end; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.85rem; }
.drone-link-baud { display: grid; gap: 0.32rem; color: #8f9986; font-size: 0.6rem; font-weight: 650; }
.drone-link-baud select { min-height: 36px; padding: 0.45rem 1.4rem 0.45rem 0.6rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 8px; outline: none; color: #dce3d3; background: #1a241b; font-size: 0.65rem; }
.drone-link-baud select:focus { border-color: rgba(211, 189, 103, 0.5); }
.drone-link-url { display: grid; min-width: 170px; flex: 1 1 170px; gap: 0.32rem; color: #8f9986; font-size: 0.6rem; font-weight: 650; }
.drone-link-url input { width: 100%; min-height: 36px; padding: 0.45rem 0.6rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 8px; outline: none; color: #dce3d3; background: #1a241b; font-size: 0.65rem; }
.drone-link-url input:focus { border-color: rgba(211, 189, 103, 0.5); }
.drone-link-url input:disabled { cursor: not-allowed; opacity: 0.65; }
.drone-link-button { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: 0.45rem; padding: 0.5rem 0.7rem; border: 1px solid rgba(126, 221, 170, 0.24); border-radius: 9px; color: #e3f0e3; background: linear-gradient(120deg, #12845e, #0e6d50); font-size: 0.66rem; font-weight: 700; transition: transform 0.18s ease, filter 0.18s ease; }
.drone-link-button:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.12); }
.drone-link-button:disabled { cursor: wait; opacity: 0.7; }
.drone-link-disconnect { border-color: rgba(231, 127, 105, 0.22); color: #f0b1a5; background: rgba(231, 127, 105, 0.1); }
.drone-link-support, .drone-link-error { margin-top: 0.6rem; font-size: 0.64rem; line-height: 1.5; }
.drone-link-support { color: #e2c777; }
.drone-link-error { color: #f0a293; }
.dji-bridge-contract { margin-top: 0.65rem; color: #bdc7b6; font-size: 0.61rem; }
.dji-bridge-contract summary { width: fit-content; color: #d7c16e; cursor: pointer; }
.dji-bridge-contract pre { max-width: 100%; margin-top: 0.45rem; padding: 0.55rem; overflow-x: auto; border: 1px solid rgba(196, 218, 147, 0.1); border-radius: 7px; color: #cbd8c3; background: rgba(5, 10, 7, 0.38); font-size: 0.55rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.drone-link-safety { gap: 0.4rem; margin-top: 0.8rem; color: #909a87; font-size: 0.59rem; line-height: 1.45; }
.drone-link-safety svg { flex: 0 0 auto; color: #8fc99d; }

.drone-link-camera { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.8fr); gap: 0.8rem 1rem; padding: 1rem 1.15rem; border-top: 1px solid rgba(196, 218, 147, 0.09); }
.drone-camera-heading { display: flex; grid-column: 1 / -1; align-items: center; justify-content: space-between; gap: 0.8rem; }
.drone-camera-eyebrow { color: #c1a95f; font-size: 0.55rem; font-weight: 800; letter-spacing: 0.14em; }
.drone-camera-heading h3 { margin-top: 0.2rem; color: #edf0e5; font-size: 0.82rem; font-weight: 700; }
.drone-camera-heading p, .drone-camera-privacy { color: #929b88; font-size: 0.62rem; line-height: 1.5; }
.drone-camera-live { display: inline-flex; align-items: center; gap: 0.4rem; color: #a9dfb5; font-size: 0.62rem; font-weight: 700; }
.drone-camera-live > span { width: 7px; height: 7px; border-radius: 50%; background: #77ce96; box-shadow: 0 0 9px rgba(119, 206, 150, 0.45); }
.drone-camera-preview { position: relative; grid-column: 1; overflow: hidden; min-width: 0; aspect-ratio: 16 / 9; border: 1px solid rgba(196, 218, 147, 0.12); border-radius: 10px; background: #070b08; }
.drone-camera-video { display: block; width: 100%; height: 100%; object-fit: contain; }
.drone-camera-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 0.5rem; color: #89927f; font-size: 0.68rem; }
.drone-camera-placeholder svg { color: #c1a95f; }
.drone-camera-controls { display: flex; grid-column: 2; align-content: start; align-items: center; flex-wrap: wrap; gap: 0.55rem; }
.drone-camera-switch { min-height: 36px; padding: 0.45rem 0.65rem; border: 1px solid rgba(196, 218, 147, 0.15); border-radius: 9px; color: #c5cfbd; background: rgba(196, 218, 147, 0.06); font-size: 0.63rem; font-weight: 650; }
.drone-camera-switch:hover:not(:disabled) { color: #f0e5bd; background: rgba(211, 189, 103, 0.1); }
.drone-camera-switch:disabled { cursor: wait; opacity: 0.6; }
.drone-camera-controls .drone-link-button { min-height: 36px; }
.drone-camera-privacy { grid-column: 2; align-self: start; }
.drone-link-camera > .drone-link-error { grid-column: 2; margin-top: 0; }
.drone-camera-switch:focus-visible { outline: 2px solid #d7c16e; outline-offset: 2px; }
.drone-observation-form, .drone-observation-history, .drone-observation-list-status { grid-column: 1 / -1; }
.drone-observation-form { display: grid; gap: 0.75rem; padding: 0.85rem; border: 1px solid rgba(196, 218, 147, 0.1); border-radius: 11px; background: rgba(5, 10, 7, 0.2); }
.drone-observation-heading { display: flex; align-items: flex-start; gap: 0.55rem; color: #d7c16e; }
.drone-observation-heading h4, .drone-observation-history h4 { color: #e7ecdf; font-size: 0.7rem; font-weight: 700; }
.drone-observation-heading p { margin-top: 0.2rem; color: #929b88; font-size: 0.59rem; }
.drone-observation-location { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 0.55rem; }
.drone-observation-location label, .drone-observation-fields label { display: grid; min-width: 0; gap: 0.32rem; color: #a9b29f; font-size: 0.6rem; font-weight: 650; }
.drone-observation-location select, .drone-observation-fields select, .drone-observation-fields textarea { width: 100%; min-height: 36px; padding: 0.45rem 0.6rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 8px; outline: none; color: #dce3d3; background: #1a241b; font-size: 0.65rem; }
.drone-observation-location select:focus, .drone-observation-fields select:focus, .drone-observation-fields textarea:focus { border-color: rgba(211, 189, 103, 0.5); }
.drone-location-status { display: flex; grid-column: 1 / -1; align-items: center; gap: 0.35rem; color: #9ed5a9; font-size: 0.59rem; line-height: 1.4; overflow-wrap: anywhere; }
.drone-location-status.is-missing { color: #9a9f91; }
.drone-observation-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
.drone-observation-fields textarea { min-height: 58px; resize: vertical; }
.drone-observation-fields textarea::placeholder { color: #788273; }
.drone-observation-notes { grid-column: 1 / -1; }
.drone-observation-success { display: flex; align-items: center; gap: 0.35rem; color: #9ed5a9; font-size: 0.64rem; }
.drone-observation-history { display: grid; gap: 0.5rem; }
.drone-observation-history h4 { margin-bottom: 0.1rem; }
.drone-observation-card { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 0.65rem; padding: 0.55rem; border: 1px solid rgba(196, 218, 147, 0.09); border-radius: 9px; background: rgba(5, 10, 7, 0.16); }
.drone-observation-card img { width: 76px; height: 76px; border-radius: 6px; object-fit: cover; background: #070b08; }
.drone-observation-card > div { display: grid; align-content: start; gap: 0.18rem; min-width: 0; }
.drone-observation-card strong { color: #e7ecdf; font-size: 0.63rem; }
.drone-observation-card span, .drone-observation-card small, .drone-observation-card p, .drone-observation-list-status { color: #929b88; font-size: 0.56rem; line-height: 1.4; overflow-wrap: anywhere; }
.drone-observation-card p { margin-top: 0.12rem; color: #bcc6b4; }
.drone-observation-list-status { padding: 0.25rem 0; }

.drone-link-telemetry { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-content: center; }
.drone-telemetry-item { min-width: 0; padding: 0.8rem 0.75rem; border-right: 1px solid rgba(196, 218, 147, 0.08); transition: background 0.2s ease; }
.drone-telemetry-item:last-child { border-right: 0; }
.drone-telemetry-item:hover { background: rgba(255, 255, 255, 0.025); }
.drone-telemetry-label { gap: 0.38rem; color: #929b88; font-size: 0.59rem; font-weight: 650; }
.drone-telemetry-label svg { color: #b9aa70; }
.drone-telemetry-item strong,
.drone-telemetry-item a { display: block; overflow: hidden; margin-top: 0.5rem; color: #e7ecdf; font-size: 0.71rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.drone-telemetry-item a { color: #93d2a6; text-decoration: underline; text-decoration-color: rgba(147, 210, 166, 0.35); text-underline-offset: 3px; }
.drone-telemetry-item small { display: block; overflow: hidden; margin-top: 0.24rem; color: #89927f; font-size: 0.58rem; text-overflow: ellipsis; white-space: nowrap; }

.drone-link-footer { min-height: 34px; gap: 0.45rem; padding: 0.5rem 1.15rem; border-top: 1px solid rgba(196, 218, 147, 0.09); color: #89927f; font-size: 0.59rem; }
.drone-link-footer .telemetry-dot-online { background: #77ce96; box-shadow: 0 0 9px rgba(119, 206, 150, 0.45); animation: drone-pulse 2s infinite; }
.drone-armed-state { margin-left: auto; color: #98d3a8; }
.drone-armed-state.is-armed { color: #e5a261; }
.drone-crc-warning { color: #e5a261; }

@keyframes drone-panel-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes drone-pulse { 50% { opacity: 0.45; } }

@media (max-width: 900px) {
  .drone-link-body { grid-template-columns: 1fr; }
  .drone-link-connect { border-right: 0; border-bottom: 1px solid rgba(196, 218, 147, 0.1); }
  .drone-link-telemetry { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .drone-telemetry-item:nth-child(3) { border-right: 0; }
  .drone-telemetry-item:nth-child(n + 4) { border-top: 1px solid rgba(196, 218, 147, 0.08); }
  .drone-link-camera { grid-template-columns: minmax(0, 1fr); }
  .drone-camera-preview, .drone-camera-controls, .drone-camera-privacy, .drone-link-camera > .drone-link-error { grid-column: 1; }
}

@media (max-width: 520px) {
  .drone-link-header { align-items: flex-start; flex-direction: column; }
  .drone-link-telemetry { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .drone-telemetry-item:nth-child(3) { border-right: 1px solid rgba(196, 218, 147, 0.08); }
  .drone-telemetry-item:nth-child(even) { border-right: 0; }
  .drone-telemetry-item:nth-child(n + 3) { border-top: 1px solid rgba(196, 218, 147, 0.08); }
  .drone-camera-heading { align-items: flex-start; }
  .drone-camera-controls { align-items: stretch; flex-direction: column; }
  .drone-camera-controls > * { width: 100%; }
  .drone-observation-location, .drone-observation-fields { grid-template-columns: minmax(0, 1fr); }
  .drone-observation-location > button, .drone-location-status, .drone-observation-notes { grid-column: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .drone-link-panel, .drone-link-status > span, .drone-link-footer .telemetry-dot-online { animation: none; }
  .drone-link-button, .connection-modes button { transition: none; }button, .drone-telemetry-item { transition: none; }
}
</style>
