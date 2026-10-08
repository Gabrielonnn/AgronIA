<script setup lang="ts">
import { computed, ref } from 'vue'
import AgroMap from '../components/map/AgroMap.vue'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import {
  Activity,
  Check,
  ChevronRight,
  CircleHelp,
  Layers3,
  MapPinned,
  MousePointer2,
  Pentagon,
  ScanLine,
  Shapes,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-vue-next'

interface MapFeature {
  type: string
  geometry?: {
    type: string
  } | null
  properties?: Record<string, unknown> | null
}

interface MapFeatureCollection {
  type: 'FeatureCollection'
  features: MapFeature[]
}

const geojsonData = ref<MapFeatureCollection | null>(null)
const exportStatus = ref('')
const mapBasemap = ref<'satellite' | 'streets'>('satellite')

const features = computed(() => geojsonData.value?.features ?? [])
const polygonCount = computed(() =>
  features.value.filter(feature =>
    feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'
  ).length
)
const pointCount = computed(() =>
  features.value.filter(feature =>
    feature.geometry?.type === 'Point' || feature.geometry?.type === 'MultiPoint'
  ).length
)
const lineCount = computed(() =>
  features.value.filter(feature =>
    feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString'
  ).length
)

const handleGeoJsonUpdate = (data: MapFeatureCollection) => {
  geojsonData.value = data
  exportStatus.value = ''
}

const handleBasemapUpdate = (basemap: 'satellite' | 'streets') => {
  mapBasemap.value = basemap
}

const featureName = (feature: MapFeature, index: number) => {
  const name = feature.properties?.name
  return typeof name === 'string' && name.trim()
    ? name
    : `Elemento ${index + 1}`
}

const exportGeoJson = () => {
  if (!geojsonData.value || features.value.length === 0) return

  const file = new Blob([JSON.stringify(geojsonData.value, null, 2)], {
    type: 'application/geo+json'
  })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = `agronia-parcelas-${new Date().toISOString().slice(0, 10)}.geojson`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  exportStatus.value = 'GeoJSON exportado correctamente.'
}
</script>

<template>
  <div class="maps-page">
    <header class="maps-heading">
      <div class="maps-heading-copy">
        <div class="maps-eyebrow"><span></span> AGRONIA · INTELIGENCIA TERRITORIAL</div>
        <h1>Visor satelital</h1>
        <p>Explora el terreno, delimita parcelas y prepara tus datos espaciales.</p>
      </div>

      <div class="maps-heading-actions">
        <div class="maps-live-pill"><Activity :size="15" /> {{ mapBasemap === 'satellite' ? 'Vista satelital' : 'Mapa de calles' }}</div>
        <Button
          variant="primary"
          size="sm"
          :disabled="features.length === 0"
          @click="exportGeoJson"
        >
          <Upload class="mr-2 h-4 w-4" />
          Exportar GeoJSON
        </Button>
      </div>
    </header>

    <div class="maps-overview" aria-label="Resumen de elementos dibujados">
      <div class="overview-item">
        <span class="overview-icon overview-icon-green"><Shapes :size="17" /></span>
        <span class="overview-copy"><strong>{{ features.length }}</strong><small>Elementos totales</small></span>
      </div>
      <div class="overview-item">
        <span class="overview-icon overview-icon-gold"><Pentagon :size="17" /></span>
        <span class="overview-copy"><strong>{{ polygonCount }}</strong><small>Parcelas y áreas</small></span>
      </div>
      <div class="overview-item">
        <span class="overview-icon overview-icon-blue"><MapPinned :size="17" /></span>
        <span class="overview-copy"><strong>{{ pointCount }}</strong><small>Puntos guardados</small></span>
      </div>
      <div class="overview-item">
        <span class="overview-icon overview-icon-violet"><Layers3 :size="17" /></span>
        <span class="overview-copy"><strong>{{ lineCount }}</strong><small>Trazos y límites</small></span>
      </div>
    </div>

    <div class="maps-layout">
      <section class="map-column">
        <div class="map-card">
          <div class="map-card-header">
            <div>
              <h2><ScanLine :size="17" /> Mapa de campo</h2>
              <p>Usa las herramientas del mapa para dibujar o editar elementos.</p>
            </div>
            <span class="map-source"><span></span> {{ mapBasemap === 'satellite' ? 'IMAGEN SATELITAL' : 'MAPA DE CALLES' }}</span>
          </div>

          <div class="map-canvas">
            <AgroMap
              @update:geojson="handleGeoJsonUpdate"
              @update:basemap="handleBasemapUpdate"
            />
          </div>
          <div class="map-card-footer">
            <span><MousePointer2 :size="14" /> Arrastra para explorar · Usa la rueda para acercar</span>
            <span>{{ mapBasemap === 'satellite' ? 'Imágenes © Esri' : 'Calles © OpenStreetMap · CARTO' }}</span>
          </div>
        </div>
      </section>

      <aside class="map-sidebar">
        <Card class="map-data-card">
          <template #header>
            <div class="map-card-title">
              <span class="panel-icon"><Layers3 :size="17" /></span>
              <div>
                <h2>Datos espaciales</h2>
                <p>Elementos dibujados en este mapa</p>
              </div>
            </div>
          </template>

          <div v-if="features.length === 0" class="empty-map-state">
            <span class="empty-map-icon"><MapPinned :size="23" /></span>
            <strong>Aún no hay elementos</strong>
            <p>Selecciona una herramienta en el mapa para marcar una parcela, un punto o un límite.</p>
            <div class="empty-map-hint"><CircleHelp :size="14" /> Los cambios se reflejan aquí al instante</div>
          </div>

          <div v-else class="feature-list">
            <div class="feature-list-heading">
              <span>CAPAS DIBUJADAS</span>
              <span class="feature-count">{{ features.length }}</span>
            </div>

            <div
              v-for="(feature, index) in features"
              :key="`${feature.geometry?.type ?? 'feature'}-${index}`"
              class="feature-row"
            >
              <span class="feature-symbol"><MapPinned :size="15" /></span>
              <span class="feature-row-copy">
                <strong>{{ featureName(feature, index) }}</strong>
                <small>{{ feature.geometry?.type ?? 'Geometría' }}</small>
              </span>
              <Check :size="15" class="feature-check" />
            </div>

            <Button
              variant="outline"
              size="sm"
              class="export-side-button"
              :disabled="features.length === 0"
              @click="exportGeoJson"
            >
              <Upload class="mr-2 h-4 w-4" />
              Descargar datos
            </Button>

            <p v-if="exportStatus" class="export-status" role="status">
              <Check :size="14" /> {{ exportStatus }}
            </p>
          </div>
        </Card>

        <Card class="map-guide-card">
          <template #header>
            <div class="map-card-title">
              <span class="panel-icon panel-icon-gold"><Sparkles :size="17" /></span>
              <div>
                <h2>Herramientas de campo</h2>
                <p>Guía rápida de dibujo</p>
              </div>
            </div>
          </template>

          <div class="tool-guide">
            <div><span class="tool-guide-icon"><Pentagon :size="15" /></span><span><strong>Polígono</strong><small>Delimita una parcela o zona.</small></span><ChevronRight :size="15" /></div>
            <div><span class="tool-guide-icon"><MapPinned :size="15" /></span><span><strong>Marcador</strong><small>Señala un punto de interés.</small></span><ChevronRight :size="15" /></div>
            <div><span class="tool-guide-icon"><Trash2 :size="15" /></span><span><strong>Editar o eliminar</strong><small>Ajusta o retira un elemento.</small></span><ChevronRight :size="15" /></div>
          </div>
        </Card>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.maps-page {
  --maps-text: #f5f1df;
  --maps-muted: #98a18c;
  min-width: 0;
  animation: maps-enter 0.48s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.maps-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
}

.maps-heading-copy { min-width: 0; }
.maps-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
  color: #d1ad3f;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.13em;
}
.maps-eyebrow > span,
.map-source > span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8eb45b;
  box-shadow: 0 0 12px rgba(142, 180, 91, 0.6);
}
.maps-heading h1 {
  margin: 0;
  color: var(--maps-text);
  font-size: clamp(1.65rem, 3vw, 2.3rem);
  font-weight: 800;
  letter-spacing: -0.05em;
}
.maps-heading p { margin: 5px 0 0; color: var(--maps-muted); font-size: 0.9rem; }
.maps-heading-actions { display: flex; align-items: center; gap: 12px; }
.maps-live-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 11px;
  color: #c9d3b9;
  background: rgba(255, 255, 255, 0.035);
  font-size: 0.75rem;
  white-space: nowrap;
}

.maps-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 1.2rem;
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(31, 38, 24, 0.9), rgba(21, 25, 18, 0.83));
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.12);
}
.overview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 15px 18px;
}
.overview-item + .overview-item { border-left: 1px solid rgba(196, 218, 147, 0.1); }
.overview-icon, .panel-icon {
  display: grid;
  width: 37px;
  height: 37px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 11px;
}
.overview-icon-green { color: #8bcea4; background: rgba(55, 151, 93, 0.13); }
.overview-icon-gold { color: #e5c052; background: rgba(255, 196, 0, 0.1); }
.overview-icon-blue { color: #8ab7e9; background: rgba(59, 130, 246, 0.12); }
.overview-icon-violet { color: #bc9de3; background: rgba(139, 92, 246, 0.12); }
.overview-copy { display: flex; min-width: 0; flex-direction: column; }
.overview-copy strong { color: var(--maps-text); font-size: 1.1rem; line-height: 1.1; font-weight: 800; }
.overview-copy small { margin-top: 4px; color: var(--maps-muted); font-size: 0.72rem; white-space: nowrap; }

.maps-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(270px, 320px);
  gap: 18px;
  align-items: start;
}
.map-column, .map-card, .map-sidebar { min-width: 0; }
.map-card {
  overflow: hidden;
  border: 1px solid rgba(196, 218, 147, 0.15);
  border-radius: 17px;
  background: linear-gradient(145deg, rgba(31, 38, 24, 0.92), rgba(21, 25, 18, 0.88));
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.19), inset 0 1px rgba(255, 255, 255, 0.035);
  animation: maps-enter 0.55s 0.06s both;
}
.map-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(196, 218, 147, 0.1);
}
.map-card-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--maps-text);
  font-size: 0.95rem;
  font-weight: 750;
}
.map-card-header h2 svg { color: #d7b847; }
.map-card-header p { margin: 4px 0 0; color: var(--maps-muted); font-size: 0.75rem; }
.map-source {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  padding: 7px 9px;
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 9px;
  color: #b6c0a9;
  background: rgba(255, 255, 255, 0.035);
  font-size: 0.61rem;
  font-weight: 800;
  letter-spacing: 0.07em;
}
.map-source > span { width: 6px; height: 6px; }
.map-canvas { height: clamp(460px, 67vh, 760px); min-height: 420px; }
.map-canvas :deep(.agro-map-shell) { height: 100%; }
.map-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid rgba(196, 218, 147, 0.09);
  color: #85917a;
  font-size: 0.68rem;
}
.map-card-footer span:first-child { display: inline-flex; align-items: center; gap: 6px; }
.map-card-footer svg { color: #c0a640; }

.map-sidebar { display: grid; gap: 16px; min-width: 0; }
.map-sidebar :deep(.app-card) {
  border-color: rgba(196, 218, 147, 0.14);
  border-radius: 16px;
  animation: maps-enter 0.55s 0.12s both;
}
.map-sidebar :deep(.app-card > div:first-child) { padding: 15px 16px; }
.map-sidebar :deep(.app-card > div:last-child) { padding: 16px; }
.map-card-title { display: flex; align-items: center; gap: 11px; }
.panel-icon { width: 35px; height: 35px; color: #8bcea4; background: rgba(55, 151, 93, 0.13); }
.panel-icon-gold { color: #e5c052; background: rgba(255, 196, 0, 0.1); }
.map-card-title h2 { margin: 0; color: var(--maps-text); font-size: 0.86rem; font-weight: 750; }
.map-card-title p { margin: 3px 0 0; color: var(--maps-muted); font-size: 0.68rem; }
.empty-map-state { display: flex; align-items: center; flex-direction: column; padding: 10px 4px 4px; text-align: center; }
.empty-map-icon {
  display: grid;
  width: 50px;
  height: 50px;
  place-items: center;
  margin-bottom: 13px;
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 15px;
  color: #a9c58a;
  background: rgba(120, 150, 76, 0.1);
  animation: map-icon-float 3.5s ease-in-out infinite;
}
.empty-map-state > strong { color: var(--maps-text); font-size: 0.83rem; }
.empty-map-state > p { max-width: 220px; margin: 7px 0 14px; color: var(--maps-muted); font-size: 0.75rem; line-height: 1.55; }
.empty-map-hint { display: flex; align-items: center; gap: 6px; color: #a8b890; font-size: 0.66rem; }
.empty-map-hint svg { color: #d0b04c; }
.feature-list-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; color: var(--maps-muted); font-size: 0.62rem; font-weight: 800; letter-spacing: 0.09em; }
.feature-count { display: grid; min-width: 22px; height: 22px; place-items: center; border-radius: 7px; color: #c6d7a4; background: rgba(120, 150, 76, 0.14); font-size: 0.69rem; }
.feature-row { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid rgba(196, 218, 147, 0.08); animation: maps-enter 0.25s both; }
.feature-symbol { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 9px; color: #a6cb8d; background: rgba(55, 151, 93, 0.11); }
.feature-row-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.feature-row-copy strong { overflow: hidden; color: #e7ecde; font-size: 0.74rem; text-overflow: ellipsis; white-space: nowrap; }
.feature-row-copy small { margin-top: 3px; color: #89947e; font-size: 0.65rem; }
.feature-check { color: #77bd83; }
.export-side-button { width: 100%; margin-top: 13px; }
.export-status { display: flex; align-items: center; gap: 5px; margin: 10px 0 0; color: #91d2a0; font-size: 0.69rem; }
.tool-guide { display: grid; gap: 4px; }
.tool-guide > div { display: flex; align-items: center; gap: 10px; padding: 9px 0; }
.tool-guide > div + div { border-top: 1px solid rgba(196, 218, 147, 0.08); }
.tool-guide-icon { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 9px; color: #d2b75c; background: rgba(255, 196, 0, 0.08); }
.tool-guide > div > span:nth-child(2) { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.tool-guide strong { color: #e3e8da; font-size: 0.72rem; }
.tool-guide small { margin-top: 3px; color: var(--maps-muted); font-size: 0.65rem; line-height: 1.4; }
.tool-guide > div > svg { color: #78836e; }

@keyframes maps-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes map-icon-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@media (max-width: 1023px) {
  .maps-layout { grid-template-columns: minmax(0, 1fr); }
  .map-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .maps-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-item { padding-inline: 12px; }
  .overview-item:nth-child(3) { border-left: 0; border-top: 1px solid rgba(196, 218, 147, 0.1); }
  .overview-item:nth-child(4) { border-top: 1px solid rgba(196, 218, 147, 0.1); }
  .map-canvas { height: clamp(400px, 56vh, 620px); height: clamp(400px, 56dvh, 620px); min-height: 0; }
}

@media (min-width: 768px) and (max-width: 820px) {
  .map-sidebar { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 767px) {
  .maps-heading { align-items: flex-start; flex-direction: column; }
  .maps-heading-actions { width: 100%; justify-content: space-between; }
  .maps-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-item { padding: 12px; }
  .overview-item:nth-child(3) { border-left: 0; border-top: 1px solid rgba(196, 218, 147, 0.1); }
  .overview-item:nth-child(4) { border-top: 1px solid rgba(196, 218, 147, 0.1); }
  .maps-layout { grid-template-columns: minmax(0, 1fr); }
  .map-sidebar { grid-template-columns: 1fr; }
  .map-canvas { height: clamp(320px, 52vh, 500px); height: clamp(320px, 52dvh, 500px); min-height: 0; }
  .map-sidebar { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 420px) {
  .maps-heading-actions { align-items: stretch; flex-direction: column; }
  .maps-heading-actions > :deep(button) { width: 100%; }
  .map-card-header { align-items: flex-start; flex-direction: column; }
  .map-source { align-self: flex-start; }
  .map-card-footer { align-items: flex-start; flex-direction: column; }
  .map-canvas { height: clamp(300px, 48vh, 430px); height: clamp(300px, 48dvh, 430px); }
}

@media (prefers-reduced-motion: reduce) {
  .maps-page, .map-card, .map-sidebar :deep(.app-card), .empty-map-icon, .feature-row { animation: none; }
}
</style>
