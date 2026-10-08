<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Activity, Battery, Cable, Crosshair, MapPin, Radio, Unplug } from 'lucide-vue-next'
import { MavLinkTelemetryParser, type MavLinkTelemetryMessage } from '../../services/mavlinkTelemetry'

type LinkState = 'disconnected' | 'connecting' | 'connected' | 'error'

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

const baudRate = ref(57600)
const linkState = ref<LinkState>('disconnected')
const errorMessage = ref('')
const telemetry = ref<DroneTelemetry>({
  systemId: null,
  autopilot: null,
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

let port: SerialPortLike | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
let readTask: Promise<void> | null = null
let disconnectRequested = false
let clockInterval: ReturnType<typeof setInterval> | undefined

const serial = computed(() => (navigator as Navigator & { serial?: WebSerialLike }).serial)
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
  if (telemetry.value.autopilot === 3) return 'ArduPilot'
  if (telemetry.value.autopilot === 12) return 'PX4'
  return telemetry.value.autopilot === null
    ? 'Sin heartbeat'
    : `Autopiloto ${telemetry.value.autopilot}`
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
  if (!serial.value) {
    linkState.value = 'error'
    errorMessage.value = 'Este navegador no admite Web Serial. Usa Chrome o Edge en escritorio y abre AgronIA mediante HTTPS o localhost.'
    return
  }

  linkState.value = 'connecting'
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

const disconnect = async () => {
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
})

onBeforeUnmount(() => {
  if (clockInterval) clearInterval(clockInterval)
  if (reader) void disconnect()
})
</script>

<template>
  <section class="drone-link-panel" aria-labelledby="drone-link-title">
    <header class="drone-link-header">
      <div class="drone-link-title">
        <span class="drone-link-icon"><Radio :size="18" /></span>
        <div>
          <span class="drone-link-eyebrow">ENLACE MAVLINK · SOLO LECTURA</span>
          <h2 id="drone-link-title">Conexión con dron</h2>
        </div>
      </div>
      <span class="drone-link-status" :class="`is-${linkState}`">
        <span></span>{{ linkLabel }}
      </span>
    </header>

    <div class="drone-link-body">
      <div class="drone-link-connect">
        <p>Conecta por USB el controlador ArduPilot o PX4 para visualizar telemetría en vivo.</p>
        <div class="drone-link-controls">
          <label class="drone-link-baud">
            <span>Velocidad</span>
            <select v-model.number="baudRate" :disabled="linkState === 'connected' || linkState === 'connecting'">
              <option :value="57600">57 600 baud</option>
              <option :value="115200">115 200 baud</option>
              <option :value="921600">921 600 baud</option>
            </select>
          </label>
          <button
            v-if="linkState !== 'connected'"
            class="drone-link-button"
            type="button"
            :disabled="linkState === 'connecting'"
            @click="connect"
          >
            <Cable :size="16" /> {{ linkState === 'connecting' ? 'Conectando…' : 'Conectar por USB' }}
          </button>
          <button v-else class="drone-link-button drone-link-disconnect" type="button" @click="disconnect">
            <Unplug :size="16" /> Desconectar
          </button>
        </div>
        <p v-if="!serial" class="drone-link-support">
          Web Serial no está disponible en este navegador. Prueba con Chrome o Edge en escritorio, usando HTTPS o localhost.
        </p>
        <p v-if="errorMessage" class="drone-link-error" role="alert">{{ errorMessage }}</p>
        <p class="drone-link-safety">
          <ShieldCheck :size="14" />
          Solo lectura: no arma ni controla el dron. Las misiones de arriba solo animan el simulador 3D.
        </p>
      </div>

      <div class="drone-link-telemetry" :class="{ 'telemetry-online': hasHeartbeat }">
        <div class="drone-telemetry-item">
          <span class="drone-telemetry-label"><Activity :size="14" /> Vehículo</span>
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

    <footer class="drone-link-footer">
      <span :class="{ 'telemetry-dot-online': hasHeartbeat }"></span>
      <span>{{ telemetry.messagesReceived }} mensajes MAVLink recibidos</span>
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
.drone-link-controls { align-items: flex-end; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.85rem; }
.drone-link-baud { display: grid; gap: 0.32rem; color: #8f9986; font-size: 0.6rem; font-weight: 650; }
.drone-link-baud select { min-height: 36px; padding: 0.45rem 1.4rem 0.45rem 0.6rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 8px; outline: none; color: #dce3d3; background: #1a241b; font-size: 0.65rem; }
.drone-link-baud select:focus { border-color: rgba(211, 189, 103, 0.5); }
.drone-link-button { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: 0.45rem; padding: 0.5rem 0.7rem; border: 1px solid rgba(126, 221, 170, 0.24); border-radius: 9px; color: #e3f0e3; background: linear-gradient(120deg, #12845e, #0e6d50); font-size: 0.66rem; font-weight: 700; transition: transform 0.18s ease, filter 0.18s ease; }
.drone-link-button:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.12); }
.drone-link-button:disabled { cursor: wait; opacity: 0.7; }
.drone-link-disconnect { border-color: rgba(231, 127, 105, 0.22); color: #f0b1a5; background: rgba(231, 127, 105, 0.1); }
.drone-link-support, .drone-link-error { margin-top: 0.6rem; font-size: 0.64rem; line-height: 1.5; }
.drone-link-support { color: #e2c777; }
.drone-link-error { color: #f0a293; }
.drone-link-safety { gap: 0.4rem; margin-top: 0.8rem; color: #909a87; font-size: 0.59rem; line-height: 1.45; }
.drone-link-safety svg { flex: 0 0 auto; color: #8fc99d; }

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
}

@media (max-width: 520px) {
  .drone-link-header { align-items: flex-start; flex-direction: column; }
  .drone-link-telemetry { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .drone-telemetry-item:nth-child(3) { border-right: 1px solid rgba(196, 218, 147, 0.08); }
  .drone-telemetry-item:nth-child(even) { border-right: 0; }
  .drone-telemetry-item:nth-child(n + 3) { border-top: 1px solid rgba(196, 218, 147, 0.08); }
}

@media (prefers-reduced-motion: reduce) {
  .drone-link-panel, .drone-link-status > span, .drone-link-footer .telemetry-dot-online { animation: none; }
  .drone-link-button, .drone-telemetry-item { transition: none; }
}
</style>
