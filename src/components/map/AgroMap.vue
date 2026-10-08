<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { Crosshair, LocateFixed, Map as MapIcon, MapPin, Satellite } from 'lucide-vue-next'

// Coordenadas por defecto: Culiacán, Sinaloa
const CULIACAN_COORDS: [number, number] = [24.7994, -107.3939]
const DEFAULT_ZOOM = 13

const mapContainer = ref<HTMLElement | null>(null)
const locationStatus = ref<'idle' | 'requesting' | 'tracking' | 'denied'>('idle')
const userLat = ref<number | null>(null)
const userLng = ref<number | null>(null)
const locationAccuracy = ref<number | null>(null)
const locationError = ref('')
const basemap = ref<'satellite' | 'streets'>('satellite')
const drawnLayers = new Set<L.Layer>()

let map: L.Map | null = null
let userMarker: L.Marker | null = null
let accuracyCircle: L.Circle | null = null
let locationWatchId: number | null = null
let hasCenteredOnLocation = false
let mapResizeObserver: ResizeObserver | null = null
let mapResizeFrame = 0

const satelliteLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const streetsLayerUrl = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const tileOptions: L.TileLayerOptions = { maxZoom: 19, updateWhenIdle: true, keepBuffer: 2 }
let satelliteLayer: L.TileLayer | null = null
let streetsLayer: L.TileLayer | null = null

const emit = defineEmits<{
  (e: 'update:geojson', data: GeoJSON.FeatureCollection): void
  (e: 'update:basemap', basemap: 'satellite' | 'streets'): void
}>()

const centerOnCuliacan = () => {
  stopLocationTracking()
  if (map) {
    map.setView(CULIACAN_COORDS, DEFAULT_ZOOM, { animate: true })
  }
}

const setBasemap = (nextBasemap: 'satellite' | 'streets') => {
  if (!map || basemap.value === nextBasemap) return
  if (nextBasemap === 'satellite') {
    streetsLayer?.remove()
    satelliteLayer?.addTo(map)
  } else {
    satelliteLayer?.remove()
    streetsLayer?.addTo(map)
  }
  basemap.value = nextBasemap
  emit('update:basemap', nextBasemap)
}

const stopLocationTracking = () => {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId)
    locationWatchId = null
  }
  if (locationStatus.value === 'tracking' || locationStatus.value === 'requesting') {
    locationStatus.value = 'idle'
  }
}

const updateLocation = (position: GeolocationPosition) => {
  const { latitude, longitude, accuracy } = position.coords
  userLat.value = Number(latitude.toFixed(5))
  userLng.value = Number(longitude.toFixed(5))
  locationAccuracy.value = Math.round(accuracy)
  locationStatus.value = 'tracking'
  locationError.value = ''

  if (!map) return

  const latLng: L.LatLngExpression = [latitude, longitude]
  if (!userMarker) {
    const userIcon = L.divIcon({
      className: 'agro-location-icon',
      html: '<span class="agro-location-pulse"></span><span class="agro-location-dot"></span>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    })
    userMarker = L.marker(latLng, { icon: userIcon, zIndexOffset: 1000, title: 'Tu ubicación actual' })
      .addTo(map)
      .bindPopup('Tu ubicación actual')
    accuracyCircle = L.circle(latLng, {
      radius: accuracy,
      color: '#70a9ff',
      weight: 1,
      opacity: 0.7,
      fillColor: '#70a9ff',
      fillOpacity: 0.13,
      interactive: false
    }).addTo(map)
  } else {
    userMarker.setLatLng(latLng)
    accuracyCircle?.setLatLng(latLng)
    accuracyCircle?.setRadius(accuracy)
  }

  if (!hasCenteredOnLocation) {
    map.flyTo(latLng, Math.max(map.getZoom(), 16), { duration: 1.2 })
    hasCenteredOnLocation = true
  } else {
    map.panTo(latLng, { animate: true, duration: 0.65 })
  }
}

const handleLocationError = (error: GeolocationPositionError) => {
  locationStatus.value = 'denied'
  locationError.value = error.code === error.PERMISSION_DENIED
    ? 'Permiso de ubicación denegado. Actívalo en los permisos del navegador.'
    : error.code === error.POSITION_UNAVAILABLE
      ? 'No se pudo determinar la ubicación. Comprueba la señal GPS o la conexión.'
      : 'La ubicación tardó demasiado. Inténtalo de nuevo.'
  stopLocationTracking()
}

const toggleLocationTracking = () => {
  if (locationStatus.value === 'tracking') {
    stopLocationTracking()
    return
  }

  if (!navigator.geolocation) {
    locationStatus.value = 'denied'
    locationError.value = 'Este navegador no admite geolocalización.'
    return
  }

  locationStatus.value = 'requesting'
  locationError.value = ''
  hasCenteredOnLocation = false
  locationWatchId = navigator.geolocation.watchPosition(
    updateLocation,
    handleLocationError,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  )
}

onMounted(() => {
  if (!mapContainer.value) return

  // Inicializar mapa centrado en Culiacán, Sinaloa
  map = L.map(mapContainer.value).setView(CULIACAN_COORDS, DEFAULT_ZOOM)
  map.on('resize', scheduleMapResize)
  mapResizeObserver = new ResizeObserver(scheduleMapResize)
  mapResizeObserver.observe(mapContainer.value)
  scheduleMapResize()

  satelliteLayer = L.tileLayer(satelliteLayerUrl, {
    ...tileOptions,
    attribution: 'Imagery &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>'
  }).addTo(map)
  streetsLayer = L.tileLayer(streetsLayerUrl, {
    ...tileOptions,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>'
  })
  L.control.scale({ position: 'bottomleft', metric: true, imperial: false, maxWidth: 120 }).addTo(map)

  // Configurar Geoman para dibujo
  map.pm.addControls({
    position: 'topleft',
    drawCircle: false,
    drawCircleMarker: false,
    drawPolyline: false,
    drawRectangle: true,
    drawPolygon: true,
    drawMarker: true,
    editMode: true,
    dragMode: true,
    cutPolygon: true,
    removalMode: true,
  })

  // Escuchar eventos de dibujo para extraer GeoJSON
  map.on('pm:create', (event: { layer: L.Layer }) => {
    drawnLayers.add(event.layer)
    event.layer.on('pm:edit', updateGeoJson)
    event.layer.on('pm:dragend', updateGeoJson)
    updateGeoJson()
  })
  map.on('pm:remove', (event: { layer: L.Layer }) => {
    drawnLayers.delete(event.layer)
    updateGeoJson()
  })
})

const updateGeoJson = () => {
  if (!map) return
  const featureGroup = L.featureGroup()
  drawnLayers.forEach(layer => featureGroup.addLayer(layer))
  const geojson = featureGroup.toGeoJSON()
  if (geojson.type !== 'FeatureCollection') {
    throw new Error('Leaflet devolvió un formato GeoJSON inesperado.')
  }
  emit('update:geojson', geojson)
}

const scheduleMapResize = () => {
  if (!map || mapResizeFrame) return
  mapResizeFrame = requestAnimationFrame(() => {
    mapResizeFrame = 0
    map?.invalidateSize({ animate: false, pan: false })
  })
}

onUnmounted(() => {
  stopLocationTracking()
  mapResizeObserver?.disconnect()
  if (mapResizeFrame) cancelAnimationFrame(mapResizeFrame)
  if (map) map.remove()
})
</script>

<template>
  <div class="agro-map-shell w-full h-full overflow-hidden z-0 relative">
    <div ref="mapContainer" class="w-full h-full"></div>

    <div class="map-floating-tools">
      <div class="map-layer-switch" role="group" aria-label="Tipo de mapa">
        <button type="button" :aria-pressed="basemap === 'satellite'" @click="setBasemap('satellite')">
          <Satellite :size="15" />
          Satélite
        </button>
        <button type="button" :aria-pressed="basemap === 'streets'" @click="setBasemap('streets')">
          <MapIcon :size="15" />
          Calles
        </button>
      </div>

      <button class="map-tool-button" type="button" @click="centerOnCuliacan" title="Centrar en Culiacán">
        <MapPin :size="16" />
        Culiacán
      </button>

      <button
        class="map-tool-button map-location-button"
        type="button"
        @click="toggleLocationTracking"
        :disabled="locationStatus === 'requesting'"
        :aria-pressed="locationStatus === 'tracking'"
      >
        <LocateFixed :size="16" :class="{ 'map-locate-spin': locationStatus === 'requesting' }" />
        {{ locationStatus === 'requesting' ? 'Buscando GPS…' : locationStatus === 'tracking' ? 'Detener seguimiento' : 'Mi ubicación' }}
      </button>

      <div v-if="userLat !== null && userLng !== null" class="map-location-readout">
        <Crosshair :size="14" />
        <span>{{ userLat }}°, {{ userLng }}°</span>
        <small v-if="locationAccuracy !== null">±{{ locationAccuracy }} m</small>
      </div>

      <div v-if="locationError" class="map-location-error" role="alert">
        {{ locationError }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.agro-map-shell {
  border-radius: 0;
  isolation: isolate;
}

.map-floating-tools {
  position: absolute;
  z-index: 1000;
  top: 14px;
  right: 14px;
  display: flex;
  width: min(228px, calc(100% - 72px));
  flex-direction: column;
  gap: 8px;
}

.map-layer-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(17, 23, 18, 0.86);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.23);
  backdrop-filter: blur(14px);
}

.map-layer-switch button,
.map-tool-button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: #dce5d4;
  background: transparent;
  font-size: 0.72rem;
  font-weight: 700;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.map-layer-switch button[aria-pressed="true"] {
  border-color: rgba(214, 188, 93, 0.25);
  color: #f5df91;
  background: rgba(194, 158, 55, 0.16);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.06);
}

.map-tool-button {
  min-height: 40px;
  justify-content: flex-start;
  padding: 0 12px;
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(17, 23, 18, 0.86);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(14px);
}

.map-location-button > svg { color: #83b7ff; }
.map-location-button[aria-pressed="true"] { border-color: rgba(112, 169, 255, 0.38); }
.map-tool-button:disabled { cursor: wait; opacity: 0.72; }

.map-layer-switch button:hover,
.map-tool-button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(224, 202, 130, 0.4);
  color: #fff4c6;
  background-color: rgba(46, 54, 39, 0.96);
}

.map-layer-switch button:focus-visible,
.map-tool-button:focus-visible {
  outline: 2px solid #f2d474;
  outline-offset: 2px;
}

.map-location-readout,
.map-location-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 10px;
  color: #dce5d4;
  background: rgba(13, 19, 16, 0.84);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(14px);
  font-size: 0.66rem;
  animation: map-tool-enter 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.map-location-readout svg { flex: 0 0 auto; color: #8ec1ff; }
.map-location-readout span { min-width: 0; flex: 1; font-family: ui-monospace, monospace; }
.map-location-readout small { color: #aab59f; white-space: nowrap; }
.map-location-error { color: #f1c1ae; border-color: rgba(232, 116, 82, 0.24); line-height: 1.45; }

.agro-map-shell :deep(.agro-location-icon) {
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
}

.agro-map-shell :deep(.agro-location-dot) {
  z-index: 1;
  width: 16px;
  height: 16px;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #3486f6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}

.agro-map-shell :deep(.agro-location-pulse) {
  position: absolute;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(76, 148, 255, 0.62);
  border-radius: 50%;
  background: rgba(76, 148, 255, 0.18);
  animation: location-pulse 2s ease-out infinite;
}

.map-locate-spin { animation: map-locate-spin 1.2s linear infinite; }

@keyframes map-tool-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes location-pulse {
  0% { transform: scale(0.55); opacity: 0.85; }
  75%, 100% { transform: scale(1.45); opacity: 0; }
}

@keyframes map-locate-spin {
  to { transform: rotate(360deg); }
}

.agro-map-shell :deep(.leaflet-container) {
  width: 100%;
  height: 100%;
  background: #20271a;
  font-family: Inter, system-ui, sans-serif;
}

.agro-map-shell :deep(.leaflet-pane) { z-index: 10; }
.agro-map-shell :deep(.leaflet-top),
.agro-map-shell :deep(.leaflet-bottom) { z-index: 20; }
.agro-map-shell :deep(.leaflet-control-container .leaflet-routing-container) { z-index: 30; }
.agro-map-shell :deep(.leaflet-control-zoom),
.agro-map-shell :deep(.leaflet-pm-toolbar) {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  border-radius: 11px !important;
  background: rgba(19, 25, 17, 0.88) !important;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28) !important;
  backdrop-filter: blur(12px);
}

.agro-map-shell :deep(.leaflet-control-zoom a),
.agro-map-shell :deep(.leaflet-pm-toolbar .leaflet-pm-action) {
  border-color: rgba(255, 255, 255, 0.1) !important;
  color: #edf4e5 !important;
  background-color: transparent !important;
  transition: color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
}

.agro-map-shell :deep(.leaflet-control-zoom a:hover),
.agro-map-shell :deep(.leaflet-pm-toolbar .leaflet-pm-action:hover) {
  color: #ffe078 !important;
  background-color: rgba(255, 196, 0, 0.13) !important;
}

.agro-map-shell :deep(.leaflet-control-zoom a),
.agro-map-shell :deep(.leaflet-pm-toolbar .leaflet-pm-action) {
  min-width: 40px;
  min-height: 40px;
  line-height: 40px;
  touch-action: manipulation;
}

.agro-map-shell :deep(.leaflet-control-attribution) {
  color: #e5e7eb;
  background: rgba(15, 20, 16, 0.72);
  backdrop-filter: blur(8px);
}

.agro-map-shell :deep(.leaflet-control-attribution a) { color: #d8bd56; }

.agro-map-shell :deep(.leaflet-control-scale-line) {
  border: 1px solid rgba(237, 241, 230, 0.75);
  border-top: 0;
  color: #edf1e6;
  background: rgba(15, 20, 16, 0.72);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
}

@media (max-width: 640px) {
  .agro-map-shell :deep(.leaflet-top.leaflet-left) { top: 8px; left: 8px; }
  .agro-map-shell :deep(.leaflet-top.leaflet-right) { top: 8px; right: 8px; }
  .agro-map-shell :deep(.leaflet-control-zoom a),
  .agro-map-shell :deep(.leaflet-pm-toolbar .leaflet-pm-action) {
    min-width: 44px;
    min-height: 44px;
    line-height: 44px;
  }
  .map-floating-tools { top: 10px; right: 10px; width: min(190px, calc(100% - 68px)); gap: 6px; }
  .map-tool-button { min-height: 44px; padding-inline: 10px; font-size: 0.68rem; }
  .map-layer-switch button { min-height: 42px; font-size: 0.67rem; }
}

@media (prefers-reduced-motion: reduce) {
  .map-floating-tools *,
  .agro-map-shell :deep(.agro-location-pulse),
  .map-locate-spin { animation: none !important; transition: none !important; }
  .agro-map-shell :deep(.leaflet-control-zoom a),
  .agro-map-shell :deep(.leaflet-pm-toolbar .leaflet-pm-action) { transition: none; }
}
</style>
