<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

const mapContainer = ref<HTMLElement | null>(null)
let map: L.Map | null = null

const emit = defineEmits<{
  (e: 'update:geojson', data: any): void
}>()

onMounted(() => {
  if (!mapContainer.value) return

  // Inicializar mapa centrado en una ubicación agrícola de ejemplo
  map = L.map(mapContainer.value).setView([20.659698, -103.349609], 13)

  // Capa satelital gratuita (Esri World Imagery)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EAP, and the GIS User Community',
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
  map.on('pm:create', updateGeoJson)
  map.on('pm:remove', updateGeoJson)
  
  // Para ediciones, iterar sobre capas
  map.on('pm:globaleditmodetoggled', (e) => {
    if (!e.enabled && map) {
      map.eachLayer((layer: any) => {
        if (layer.pm) {
          layer.on('pm:edit', updateGeoJson)
          layer.on('pm:dragend', updateGeoJson)
        }
      })
    }
  })
})

const updateGeoJson = () => {
  if (!map) return
  const featureGroup = L.featureGroup()
  map.eachLayer((layer: any) => {
    // Si la capa tiene feature o toGeoJSON (es una capa de dibujo)
    if (layer instanceof L.Path || layer instanceof L.Marker) {
      featureGroup.addLayer(layer)
    }
  })
  
  const geojson = featureGroup.toGeoJSON()
  emit('update:geojson', geojson)
}

onUnmounted(() => {
  if (map) {
    map.remove()
  }
})
</script>

<template>
  <div ref="mapContainer" class="w-full h-full rounded-xl overflow-hidden shadow-sm z-0 relative"></div>
</template>

<style>
/* Ajustes para z-index de leaflet respecto a tailwind */
.leaflet-pane {
  z-index: 10;
}
.leaflet-top, .leaflet-bottom {
  z-index: 20;
}
.leaflet-control-container .leaflet-routing-container {
  z-index: 30;
}
</style>
