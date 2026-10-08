<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { Crosshair, LocateFixed, MapPin } from 'lucide-vue-next'

// Coordenadas por defecto: Culiacán, Sinaloa
const CULIACAN_COORDS: [number, number] = [24.7994, -107.3939]
const DEFAULT_ZOOM = 13

const mapContainer = ref<HTMLElement | null>(null)
const locationStatus = ref<'idle' | 'requesting' | 'success' | 'denied'>('idle')
const userLat = ref<number | null>(null)
const userLng = ref<number | null>(null)
const drawnLayers = new Set<L.Layer>()

let map: L.Map | null = null
let userMarker: L.Marker | null = null

const emit = defineEmits<{
  (e: 'update:geojson', data: any): void
}>()

const centerOnCuliacan = () => {
  if (map) {
    map.setView(CULIACAN_COORDS, DEFAULT_ZOOM, { animate: true })
  }
}

const requestLocationPermission = () => {
  if (!navigator.geolocation) {
    locationStatus.value = 'denied'
    return
  }

  locationStatus.value = 'requesting'
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLat.value = parseFloat(position.coords.latitude.toFixed(5))
      userLng.value = parseFloat(position.coords.longitude.toFixed(5))
      locationStatus.value = 'success'

      if (map) {
        // Quitar marcador anterior
        if (userMarker) map.removeLayer(userMarker)

        // Icono de ubicación del usuario
        const userIcon = L.divIcon({
          className: '',
          html: `<div style="
            width: 20px; height: 20px; 
            background: #10B981; 
            border: 3px solid white; 
            border-radius: 50%;
            box-shadow: 0 0 0 4px #10B98160;
          "></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })

        userMarker = L.marker([position.coords.latitude, position.coords.longitude], { icon: userIcon })
          .addTo(map)
          .bindPopup(`<b>Tu ubicación</b><br>${userLat.value}°, ${userLng.value}°`)
          .openPopup()

        map.setView([position.coords.latitude, position.coords.longitude], 15, { animate: true })
      }
    },
    (_error) => {
      locationStatus.value = 'denied'
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )
}

onMounted(() => {
  if (!mapContainer.value) return

  // Inicializar mapa centrado en Culiacán, Sinaloa
  map = L.map(mapContainer.value).setView(CULIACAN_COORDS, DEFAULT_ZOOM)

  // Capa satelital (Esri World Imagery)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
  }).addTo(map)

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
  emit('update:geojson', geojson)
}

onUnmounted(() => {
  if (map) map.remove()
})
</script>

<template>
  <div class="agro-map-shell w-full h-full overflow-hidden z-0 relative">
    <div ref="mapContainer" class="w-full h-full"></div>

    <!-- Panel de ubicación (top-right) -->
    <div class="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
      <!-- Botón: Centrar en Culiacán -->
      <button
        @click="centerOnCuliacan"
        class="flex items-center gap-2 bg-agron-green-dark hover:bg-agron-green text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg transition-colors"
        title="Centrar vista en Culiacán"
      >
        <MapPin class="w-4 h-4" />
        Culiacán
      </button>

      <!-- Botón: Mi ubicación -->
      <button
        @click="requestLocationPermission"
        :disabled="locationStatus === 'requesting'"
        class="flex items-center gap-2 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg transition-colors"
        :class="{
          'bg-blue-600 hover:bg-blue-700': locationStatus === 'idle' || locationStatus === 'success',
          'bg-gray-500 cursor-not-allowed': locationStatus === 'requesting',
          'bg-red-600 hover:bg-red-700': locationStatus === 'denied'
        }"
        title="Usar mi ubicación"
      >
        <LocateFixed class="w-4 h-4" :class="locationStatus === 'requesting' ? 'animate-spin' : ''" />
        {{ locationStatus === 'requesting' ? 'Buscando...' : locationStatus === 'denied' ? 'Sin permiso' : locationStatus === 'success' ? 'Ubicado' : 'Mi Ubicación' }}
      </button>

      <!-- Coordenadas del usuario si se obtuvo ubicación -->
      <div v-if="locationStatus === 'success' && userLat !== null && userLng !== null"
        class="bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg font-mono">
        <div class="flex items-center gap-1.5">
          <Crosshair class="w-3 h-3 text-agron-green" />
          {{ userLat }}°, {{ userLng }}°
        </div>
      </div>

      <!-- Mensaje si se denegó el permiso -->
      <div v-if="locationStatus === 'denied'"
        class="bg-red-900/80 backdrop-blur-sm text-red-200 text-xs px-3 py-1.5 rounded-lg max-w-[160px]">
        Permiso de ubicación denegado. Habilítalo en la configuración del navegador.
      </div>
    </div>
  </div>
</template>

<style scoped>
.agro-map-shell {
  border-radius: 0;
  isolation: isolate;
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

.agro-map-shell :deep(.leaflet-control-attribution) {
  color: #e5e7eb;
  background: rgba(15, 20, 16, 0.72);
  backdrop-filter: blur(8px);
}

.agro-map-shell :deep(.leaflet-control-attribution a) { color: #d8bd56; }

@media (max-width: 640px) {
  .agro-map-shell :deep(.leaflet-top.leaflet-left) { top: 8px; left: 8px; }
  .agro-map-shell :deep(.leaflet-control-zoom a) { width: 34px; height: 34px; line-height: 34px; }
}

@media (prefers-reduced-motion: reduce) {
  .agro-map-shell :deep(.leaflet-control-zoom a),
  .agro-map-shell :deep(.leaflet-pm-toolbar .leaflet-pm-action) { transition: none; }
}
</style>
