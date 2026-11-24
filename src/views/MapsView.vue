<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useMainStore } from '../stores'
import { supabase } from '../services/supabase'
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
  Save,
  ScanLine,
  Shapes,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-vue-next'
import {
  listFields,
  listSimulations,
  saveMapWorkspace,
  updateFieldGeometry,
  type FieldRecord,
} from '../services/agronomyData'
import { buildFieldMonitorFeatures, readFieldMonitorData, type FieldMonitorData } from '../services/fieldMonitoring'
import { mergeFieldMapFeatures, type FieldMapElement } from '../services/fieldMapWorkspace'

interface SavedMapElement extends FieldMapElement {
  id: string
  user_id: string
  field_id: string | null
  element_type: string
  created_at: string
}

const store = useMainStore()
const route = useRoute()
const geojsonData = ref<GeoJSON.FeatureCollection | null>(null)
const exportStatus = ref('')
const saveError = ref('')
const fieldName = ref('')
const savedFields = ref<FieldRecord[]>([])
const fieldGeoJsonById = ref(new Map<string, unknown>())
const isSaving = ref(false)
const saveStatus = ref('')
const errorMessage = ref('')
const loadingSaved = ref(false)
const saving = ref(false)
const savedElements = ref<SavedMapElement[]>([])
const selectedFieldId = ref('')
const loadedFieldId = ref('')
const mapWorkspaceDirty = ref(false)
const mapBasemap = ref<'satellite' | 'streets'>('satellite')
const monitorField = ref<FieldRecord | null>(null)
const monitorData = ref<FieldMonitorData | null>(null)
const monitorLoading = ref(false)
const monitorError = ref('')
const monitorCreatedAt = ref('')
let monitorRequestId = 0
let workspaceRequestId = 0

const monitorFieldId = computed(() =>
  typeof route.query.fieldId === 'string' ? route.query.fieldId : '',
)
const isMonitoring = computed(() => monitorFieldId.value.length > 0)
const features = computed<GeoJSON.Feature[]>(() => geojsonData.value?.features ?? [])
const initialFeatures = ref<GeoJSON.Feature[]>([])
const monitorMapFeatures = ref<GeoJSON.Feature[]>([])
const mapInitialFeatures = computed<GeoJSON.Feature[]>(() =>
  isMonitoring.value ? monitorMapFeatures.value : initialFeatures.value,
)
const affectedMonitorPlants = computed(() =>
  (monitorData.value?.plants ?? [])
    .filter(plant =>
      plant.dead || plant.waterStress >= 0.15 || (plant.health !== null && plant.health < 0.7),
    )
    .sort((left, right) => Number(right.dead) - Number(left.dead) || right.waterStress - left.waterStress),
)
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

const handleGeoJsonUpdate = (data: GeoJSON.FeatureCollection) => {
  geojsonData.value = data
  mapWorkspaceDirty.value = true
  exportStatus.value = ''
  saveError.value = ''
  saveStatus.value = ''
  errorMessage.value = ''
  if (!fieldName.value) fieldName.value = `Mapa ${new Date().toLocaleDateString('es-MX')}`
}

const refreshFields = async () => {
  setSavedFields(await listFields())
}

const setSavedFields = (fields: FieldRecord[]) => {
  savedFields.value = fields
  const geometries = new Map<string, unknown>()
  for (const field of fields) geometries.set(field.id, field.geojson_data)
  fieldGeoJsonById.value = geometries
}

const loadWorkspaceElements = async (fieldId: string) => {
  if (!supabase || !store.user?.id) {
    errorMessage.value = 'Inicia sesión y configura Supabase para cargar los elementos del mapa.'
    return
  }

  const requestId = ++workspaceRequestId
  loadingSaved.value = true
  errorMessage.value = ''
  try {
    const result = fieldId
      ? await supabase
        .from('map_elements')
        .select('*')
        .eq('user_id', store.user.id)
        .eq('field_id', fieldId)
        .order('created_at', { ascending: true })
      : await supabase
        .from('map_elements')
        .select('*')
        .eq('user_id', store.user.id)
        .is('field_id', null)
        .order('created_at', { ascending: true })
    const { data, error } = result
    if (error) throw new Error(`No se pudieron consultar los elementos de la parcela: ${error.message}`)
    if (requestId !== workspaceRequestId) return

    const elements = (data ?? []) as SavedMapElement[]
    const validElements = elements.filter(element => isGeometry(element.geometry_data))
    const loadedFeatures = mergeFieldMapFeatures(fieldGeoJsonById.value.get(fieldId), validElements)
    savedElements.value = elements
    geojsonData.value = { type: 'FeatureCollection', features: loadedFeatures }
    initialFeatures.value = loadedFeatures
    loadedFieldId.value = fieldId
    mapWorkspaceDirty.value = false
  } catch (error) {
    if (requestId === workspaceRequestId) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'No se pudieron cargar los elementos guardados de esta parcela.'
    }
  } finally {
    if (requestId === workspaceRequestId) loadingSaved.value = false
  }
}

const loadSavedWorkspace = async () => {
  loadingSaved.value = true
  try {
    const fields = await listFields()
    setSavedFields(fields)
    const requestedFieldId = monitorFieldId.value
      || (typeof route.query.fieldId === 'string' ? route.query.fieldId : '')
    if (requestedFieldId && !fields.some(field => field.id === requestedFieldId)) {
      selectedFieldId.value = ''
      loadedFieldId.value = ''
      geojsonData.value = { type: 'FeatureCollection', features: [] }
      initialFeatures.value = []
      errorMessage.value = 'No se encontró la parcela solicitada o no tienes permiso para verla.'
      loadingSaved.value = false
      return
    }
    const fieldId = fields.some(field => field.id === requestedFieldId)
      ? requestedFieldId
      : fields[0]?.id ?? ''
    selectedFieldId.value = fieldId
    await loadWorkspaceElements(fieldId)
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudieron cargar las parcelas guardadas.'
    loadingSaved.value = false
  }
}

const loadFieldMonitoring = async () => {
  const requestId = ++monitorRequestId
  const fieldId = monitorFieldId.value
  monitorError.value = ''
  monitorField.value = null
  monitorData.value = null
  monitorMapFeatures.value = []
  monitorCreatedAt.value = ''
  monitorLoading.value = false
  if (!fieldId) return

  monitorLoading.value = true
  try {
    const [availableFields, simulations] = await Promise.all([
      listFields(),
      listSimulations(fieldId),
    ])
    if (requestId !== monitorRequestId) return
    setSavedFields(availableFields)
    const field = availableFields.find(item => item.id === fieldId)
    if (!field) throw new Error('No se encontró la parcela o no tienes permiso para verla.')
    monitorField.value = field
    const latestSimulation = simulations[0]
    if (latestSimulation) {
      monitorData.value = readFieldMonitorData(latestSimulation.results)
      monitorCreatedAt.value = latestSimulation.created_at
    }
    monitorMapFeatures.value = buildFieldMonitorFeatures(field.geojson_data, monitorData.value)
  } catch (error) {
    if (requestId === monitorRequestId) {
      monitorError.value = error instanceof Error
        ? error.message
        : 'No se pudo cargar el monitoreo de esta parcela.'
    }
  } finally {
    if (requestId === monitorRequestId) monitorLoading.value = false
  }
}

const monitorTrendPoints = (key: 'health' | 'humidity' | 'ndvi') => {
  const history = monitorData.value?.timeline ?? []
  if (history.length < 2) return ''
  return history.map((sample, index) => {
    const x = (index / (history.length - 1)) * 300
    const y = 90 - Math.min(100, Math.max(0, sample[key])) * 0.8
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

const monitorValue = (value: number | null | undefined, suffix = '%') =>
  value === null || value === undefined ? '—' : `${value.toFixed(0)}${suffix}`

onMounted(() => { void loadSavedWorkspace() })
watch(monitorFieldId, () => { void loadFieldMonitoring() }, { immediate: true })

watch(selectedFieldId, (fieldId, previousFieldId) => {
  if (fieldId === loadedFieldId.value) return
  if (mapWorkspaceDirty.value && !window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos y cargar otra parcela?')) {
    selectedFieldId.value = previousFieldId
    return
  }
  void loadWorkspaceElements(fieldId)
})

const saveMap = async () => {
  if (!geojsonData.value || features.value.length === 0 || !fieldName.value.trim() || isSaving.value) return
  isSaving.value = true
  exportStatus.value = ''
  saveError.value = ''
  try {
    const geojson = JSON.parse(JSON.stringify(geojsonData.value))
    const id = await saveMapWorkspace(fieldName.value.trim(), geojson)
    fieldName.value = ''
    selectedFieldId.value = id
    loadedFieldId.value = id
    exportStatus.value = `Mapa guardado correctamente (campo ${id.slice(0, 8)}).`
    try {
      await refreshFields()
      await loadWorkspaceElements(id)
    } catch (error) {
      saveError.value = error instanceof Error
        ? `El mapa se guardó, pero no se pudo actualizar la lista: ${error.message}`
        : 'El mapa se guardó, pero no se pudo actualizar la lista.'
    }
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : 'No se pudo guardar el mapa.'
  } finally {
    isSaving.value = false
  }
}

const handleBasemapUpdate = (basemap: 'satellite' | 'streets') => {
  mapBasemap.value = basemap
}

const featureName = (feature: GeoJSON.Feature, index: number) => {
  const name = feature.properties?.name
  return typeof name === 'string' && name.trim()
    ? name
    : `Elemento ${index + 1}`
}

const isGeometry = (value: unknown): value is GeoJSON.Geometry => {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  return value.type === 'GeometryCollection'
    ? 'geometries' in value && Array.isArray(value.geometries)
    : 'coordinates' in value
}

const saveMapElements = async () => {
  if (saving.value || loadingSaved.value) return
  if (!supabase || !store.user?.id) {
    errorMessage.value = 'Inicia sesión y configura Supabase para guardar elementos del mapa.'
    return
  }
  if (!geojsonData.value) {
    errorMessage.value = 'No hay un mapa cargado para guardar.'
    return
  }

  saving.value = true
  saveStatus.value = ''
  errorMessage.value = ''
  const currentIds = new Set<string>()
  const invalidFeatureIndex = features.value.findIndex(feature => !feature.geometry)
  if (invalidFeatureIndex >= 0) {
    errorMessage.value = `No se pudo guardar ${featureName(features.value[invalidFeatureIndex], invalidFeatureIndex)} porque no tiene geometría.`
    saving.value = false
    return
  }
  let fieldGeometrySaved = false

  try {
    if (selectedFieldId.value) {
      await updateFieldGeometry(
        selectedFieldId.value,
        JSON.parse(JSON.stringify(geojsonData.value)),
      )
      fieldGeometrySaved = true
    }

    for (const [index, feature] of features.value.entries()) {
      if (errorMessage.value || !feature.geometry) break

      const properties = { ...(feature.properties ?? {}) }
      const elementId = properties.map_element_id
      delete properties.map_element_id
      const name = featureName(feature, index)
      const record = {
        user_id: store.user.id,
        field_id: selectedFieldId.value || null,
        element_type: feature.geometry.type,
        name,
        geometry_data: feature.geometry,
        properties
      }

      if (typeof elementId === 'string') {
        let updateQuery = supabase
          .from('map_elements')
          .update(record)
          .eq('id', elementId)
          .eq('user_id', store.user.id)
        updateQuery = selectedFieldId.value
          ? updateQuery.eq('field_id', selectedFieldId.value)
          : updateQuery.is('field_id', null)
        const { data, error } = await updateQuery.select('id').maybeSingle()

        if (error || !data) {
          errorMessage.value = `No se pudo actualizar ${name}: ${error?.message ?? 'No se encontró el registro o faltan permisos.'}`
          break
        }
        currentIds.add(elementId)
      } else {
        const { data, error } = await supabase
          .from('map_elements')
          .insert(record)
          .select('id')
          .single()

        if (error) {
          errorMessage.value = `No se pudo guardar ${name}: ${error.message}`
          break
        }

        if (!data) {
          errorMessage.value = `No se pudo guardar ${name}: Supabase no devolvió el identificador del elemento.`
          break
        }
        feature.properties = { ...(feature.properties ?? {}), map_element_id: data.id }
        currentIds.add(data.id)
      }
    }

    if (!errorMessage.value) {
      const removedIds = savedElements.value
        .filter(element => element.field_id === (selectedFieldId.value || null))
        .filter(element => isGeometry(element.geometry_data))
        .filter(element => !currentIds.has(element.id))
        .map(element => element.id)

      if (removedIds.length > 0) {
        let deleteQuery = supabase
          .from('map_elements')
          .delete()
          .eq('user_id', store.user.id)
          .in('id', removedIds)
        deleteQuery = selectedFieldId.value
          ? deleteQuery.eq('field_id', selectedFieldId.value)
          : deleteQuery.is('field_id', null)
        const { data, error } = await deleteQuery.select('id')

        if (error) {
          errorMessage.value = `Los elementos se actualizaron, pero no se pudieron eliminar los que quitaste del mapa: ${error.message}`
        } else if (data?.length !== removedIds.length) {
          errorMessage.value = 'Los elementos se actualizaron, pero no se eliminaron todos los que quitaste del mapa. Comprueba los permisos RLS.'
        }
      }
    }

    if (!errorMessage.value) {
      saveStatus.value = 'Elementos del mapa guardados en Supabase.'
      mapWorkspaceDirty.value = false
      loadedFieldId.value = selectedFieldId.value
      await loadWorkspaceElements(selectedFieldId.value)
    } else {
      geojsonData.value = {
        type: 'FeatureCollection',
        features: [...features.value]
      }
      if (fieldGeometrySaved) {
        errorMessage.value = `La geometría de la parcela se guardó, pero los elementos no se guardaron: ${errorMessage.value}`
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudieron guardar los cambios del mapa.'
    if (fieldGeometrySaved) {
      errorMessage.value = `La geometría de la parcela se guardó, pero los elementos no se guardaron: ${errorMessage.value}`
    }
  } finally {
    saving.value = false
  }
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

      <div v-if="!isMonitoring" class="maps-heading-actions">
        <div class="maps-live-pill"><Activity :size="15" /> {{ mapBasemap === 'satellite' ? 'Vista satelital' : 'Mapa de calles' }}</div>
        <Button
          variant="outline"
          size="sm"
          :disabled="(features.length === 0 && savedElements.length === 0) || saving || loadingSaved"
          @click="saveMapElements"
        >
          <Save class="mr-2 h-4 w-4" />
          {{ saving ? 'Guardando…' : 'Guardar en Supabase' }}
        </Button>
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
      <div v-else class="maps-heading-actions">
        <RouterLink class="open-simulation-link" :to="{ name: 'maps', query: {} }">
          <MapPinned :size="15" />
          Volver al mapa editable
        </RouterLink>
      </div>
    </header>

    <section v-if="isMonitoring" class="monitor-view" aria-labelledby="monitor-title">
      <header class="monitor-heading">
        <div>
          <span class="maps-eyebrow"><span></span> MONITOREO DEL CAMPO · CAPA SATELITAL</span>
          <h2 id="monitor-title">{{ monitorField?.name ?? 'Cargando parcela…' }}</h2>
          <p>Ubicaciones y métricas de la simulación guardada sobre el contorno geográfico real.</p>
        </div>
        <span v-if="monitorCreatedAt" class="monitor-updated">
          Último análisis: {{ new Date(monitorCreatedAt).toLocaleString('es-MX') }}
        </span>
      </header>

      <div v-if="monitorLoading" class="monitor-message" role="status">Cargando parcela y último análisis…</div>
      <div v-if="monitorError" class="monitor-message is-error" role="alert">{{ monitorError }}</div>

      <template v-if="monitorField">
        <div class="monitor-summary">
          <article><span>Salud promedio</span><strong>{{ monitorValue(monitorData?.avgHealth) }}</strong></article>
          <article><span>Humedad</span><strong>{{ monitorValue(monitorData?.avgHumidity) }}</strong></article>
          <article><span>NDVI</span><strong>{{ monitorData?.avgNDVI?.toFixed(2) ?? '—' }}</strong></article>
          <article><span>Plantas afectadas</span><strong class="monitor-warning">{{ monitorData?.stressedPlants ?? affectedMonitorPlants.length }}</strong></article>
        </div>

        <div class="monitor-layout">
          <div class="map-card monitor-map-card">
            <div class="map-card-header">
              <div>
                <h2><MapPinned :size="17" /> Parcela y plantas afectadas</h2>
                <p>El contorno es GeoJSON guardado; los marcadores rojos son ubicaciones simuladas.</p>
              </div>
              <span class="map-source"><span></span> {{ mapBasemap === 'satellite' ? 'VISTA SATELITAL' : 'MAPA DE CALLES' }}</span>
            </div>
            <div class="map-canvas monitor-map-canvas">
              <AgroMap
                :initial-features="mapInitialFeatures"
                :read-only="true"
                @update:basemap="handleBasemapUpdate"
              />
            </div>
            <div class="monitor-map-legend">
              <span><i class="monitor-field-key"></i> Geometría guardada</span>
              <span><i class="monitor-plant-key"></i> Planta afectada</span>
              <span>{{ monitorMapFeatures.length }} elementos en el mapa</span>
            </div>
          </div>

          <aside class="monitor-details">
            <section class="monitor-panel">
              <header>
                <div><h3>Tendencia del cultivo</h3><p>Datos guardados del análisis</p></div>
                <Activity :size="17" />
              </header>
              <template v-if="monitorData?.timeline.length">
                <svg class="monitor-chart" viewBox="0 0 300 100" role="img" aria-label="Tendencia de salud, humedad y NDVI">
                  <line v-for="y in [10, 30, 50, 70, 90]" :key="y" x1="0" :y1="y" x2="300" :y2="y" />
                  <polyline class="monitor-line-health" :points="monitorTrendPoints('health')" />
                  <polyline class="monitor-line-humidity" :points="monitorTrendPoints('humidity')" />
                  <polyline class="monitor-line-ndvi" :points="monitorTrendPoints('ndvi')" />
                </svg>
                <div class="monitor-chart-legend">
                  <span><i class="monitor-line-health-key"></i> Salud</span>
                  <span><i class="monitor-line-humidity-key"></i> Humedad</span>
                  <span><i class="monitor-line-ndvi-key"></i> NDVI</span>
                </div>
              </template>
              <p v-else class="monitor-empty">Aún no hay una simulación guardada para esta parcela. Ejecuta un análisis o Centinelas y guarda sus resultados.</p>
            </section>

            <section class="monitor-panel monitor-plant-panel">
              <header>
                <div><h3>Plantas afectadas</h3><p>Estrés hídrico, baja salud o pérdida</p></div>
                <strong>{{ affectedMonitorPlants.length }}</strong>
              </header>
              <div v-if="affectedMonitorPlants.length" class="monitor-plant-list">
                <div v-for="plant in affectedMonitorPlants.slice(0, 12)" :key="plant.id" class="monitor-plant-row">
                  <span class="monitor-plant-dot" :class="{ 'is-dead': plant.dead }"></span>
                  <span><strong>{{ plant.id }}</strong><small>{{ plant.status }} · estrés {{ (plant.waterStress * 100).toFixed(0) }}%</small></span>
                  <small class="monitor-plant-gps">{{ plant.latitude.toFixed(5) }}, {{ plant.longitude.toFixed(5) }}</small>
                </div>
              </div>
              <p v-else class="monitor-empty">No se registraron plantas afectadas con coordenadas en el último análisis.</p>
              <p v-if="affectedMonitorPlants.length > 12" class="monitor-footnote">
                El mapa muestra {{ affectedMonitorPlants.length }} marcadores; aquí se listan los 12 de mayor prioridad.
              </p>
              <p class="monitor-footnote">Son datos simulados, no detecciones satelitales en tiempo real. Verifica las plantas en campo.</p>
            </section>
          </aside>
        </div>
      </template>
    </section>

    <template v-else>
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
        <div class="maps-field-picker">
          <label for="map-field">Relacionar con parcela</label>
          <select
            id="map-field"
            v-model="selectedFieldId"
            class="maps-field-select"
          >
            <option value="">Sin parcela asociada</option>
            <option v-for="field in savedFields" :key="field.id" :value="field.id">{{ field.name }}</option>
          </select>
        </div>
        <div v-if="errorMessage" class="map-feedback is-error" role="alert">
          {{ errorMessage }}
        </div>
        <div v-if="saveStatus" class="map-feedback is-success" role="status">
          {{ saveStatus }}
        </div>
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
              :initial-features="mapInitialFeatures"
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
            <p>Selecciona una herramienta del mapa para marcar una parcela, un punto o un límite.</p>
            <div class="empty-map-hint"><CircleHelp :size="14" /> Los cambios se reflejan en tiempo real</div>
          </div>

          <div v-else class="feature-list">
            <div class="feature-list-heading">
              <span>Capas activas</span>
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

            <div class="map-quick-actions">
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

              <form class="map-save-form" @submit.prevent="saveMap">
                <label for="map-field-name">Nombre del campo</label>
                <input
                  id="map-field-name"
                  v-model="fieldName"
                  maxlength="120"
                  required
                  placeholder="Ej. Parcela norte"
                >
                <Button variant="primary" size="sm" :disabled="isSaving || !fieldName.trim()">
                  <Save class="mr-2 h-4 w-4" />
                  {{ isSaving ? 'Guardando…' : 'Guardar mapa' }}
                </Button>
              </form>
            </div>
          </div>
        </Card>
        <p v-if="exportStatus" class="export-status" role="status"><Check :size="14" /> {{ exportStatus }}</p>
        <p v-if="saveError" class="export-error" role="alert">{{ saveError }}</p>
        <RouterLink
          v-if="selectedFieldId"
          class="open-simulation-link saved-simulation-link"
          :to="{ name: 'simulation', query: { fieldId: selectedFieldId } }"
        >
          <MapPinned :size="15" />
          Abrir esta parcela en simulación
        </RouterLink>

        <Card v-if="savedFields.length" class="map-guide-card">
          <template #header>
            <div class="map-card-title">
              <span class="panel-icon"><MapPinned :size="17" /></span>
              <div>
                <h2>Campos guardados</h2>
                <p>{{ savedFields.length }} registro(s) en tu cuenta</p>
              </div>
            </div>
          </template>
          <div class="feature-list">
            <div v-for="field in savedFields.slice(0, 4)" :key="field.id" class="feature-row">
              <span class="feature-symbol"><MapPinned :size="15" /></span>
              <span class="feature-row-copy">
                <strong>{{ field.name }}</strong>
                <small>{{ new Date(field.created_at).toLocaleDateString('es-MX') }}</small>
              </span>
              <Check :size="15" class="feature-check" />
            </div>
          </div>
        </Card>

        <Card class="map-guide-card">
          <template #header>
            <div class="map-card-title">
              <span class="panel-icon panel-icon-gold"><Sparkles :size="17" /></span>
              <div>
                <h2>Herramientas de campo</h2>
                <p>Guía rápida</p>
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
    </template>
  </div>
</template>

<style scoped>
.maps-page {
  --maps-text: #f5f1df;
  --maps-muted: #98a18c;
  min-width: 0;
  color: #e8eddf;
}

.maps-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  margin-bottom: 1rem;
  padding: 20px 22px;
  border: 1px solid rgba(196, 218, 147, 0.14);
  border-radius: 20px;
  background:
    radial-gradient(ellipse at 2% 0%, rgba(120, 150, 76, 0.15), transparent 54%),
    linear-gradient(125deg, rgba(27, 35, 25, 0.96), rgba(17, 23, 18, 0.92));
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.14), inset 0 1px rgba(255, 255, 255, 0.035);
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

.open-simulation-link {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid rgba(142, 180, 91, 0.32);
  border-radius: 10px;
  color: #dcedc1;
  background: rgba(55, 151, 93, 0.12);
  font-size: 0.74rem;
  font-weight: 750;
  text-decoration: none;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}
.open-simulation-link:hover {
  transform: translateY(-1px);
  border-color: rgba(142, 180, 91, 0.55);
  background: rgba(55, 151, 93, 0.2);
}
.open-simulation-link:focus-visible { outline: 2px solid #c1e19a; outline-offset: 2px; }
.open-simulation-link svg { color: #a9d287; }
.saved-simulation-link { margin-top: 10px; }

.monitor-view { display: grid; gap: 16px; }
.monitor-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 17px;
  background: linear-gradient(140deg, rgba(28, 35, 25, 0.95), rgba(15, 20, 16, 0.9));
}
.monitor-heading .maps-eyebrow { margin-bottom: 6px; }
.monitor-heading h2 { margin: 0; color: var(--maps-text); font-size: 1.25rem; font-weight: 800; }
.monitor-heading p { margin: 5px 0 0; color: var(--maps-muted); font-size: 0.76rem; }
.monitor-updated { color: #aab69d; font-size: 0.68rem; white-space: nowrap; }
.monitor-message { padding: 12px 14px; border: 1px solid rgba(196, 218, 147, 0.14); border-radius: 11px; color: #dce5d4; background: rgba(255,255,255,0.035); font-size: 0.78rem; }
.monitor-message.is-error { border-color: rgba(239, 68, 68, 0.32); color: #fecaca; background: rgba(127, 29, 29, 0.18); }
.monitor-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.monitor-summary article {
  display: grid;
  gap: 6px;
  padding: 13px 15px;
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 13px;
  background: rgba(24, 30, 23, 0.88);
}
.monitor-summary article span { color: var(--maps-muted); font-size: 0.68rem; }
.monitor-summary article strong { color: #e8eedf; font-size: 1.2rem; font-weight: 800; }
.monitor-summary article strong.monitor-warning { color: #ffb79f; }
.monitor-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(290px, 360px); gap: 16px; align-items: start; }
.monitor-map-card { min-width: 0; }
.monitor-map-canvas { height: clamp(450px, 65vh, 700px); }
.monitor-map-canvas :deep(.agro-map-shell) { height: 100%; }
.monitor-map-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 11px 15px; border-top: 1px solid rgba(196, 218, 147, 0.09); color: #a8b397; font-size: 0.66rem; }
.monitor-map-legend span { display: inline-flex; align-items: center; gap: 6px; }
.monitor-field-key { width: 14px; height: 8px; border: 2px solid #f2cf68; border-radius: 2px; }
.monitor-plant-key { width: 9px; height: 9px; border: 2px solid #fff; border-radius: 50%; background: #e55c4a; box-shadow: 0 0 0 2px rgba(229, 92, 74, 0.28); }
.monitor-details { display: grid; gap: 14px; min-width: 0; }
.monitor-panel {
  min-width: 0;
  padding: 15px;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(25, 31, 24, 0.96), rgba(15, 20, 16, 0.92));
}
.monitor-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.monitor-panel > header h3 { margin: 0; color: var(--maps-text); font-size: 0.83rem; font-weight: 800; }
.monitor-panel > header p { margin: 3px 0 0; color: var(--maps-muted); font-size: 0.65rem; }
.monitor-panel > header > svg { color: #d2b75c; }
.monitor-panel > header > strong { color: #ffc2aa; font-size: 1.1rem; }
.monitor-chart { display: block; width: 100%; height: auto; margin: 13px 0 8px; overflow: visible; }
.monitor-chart line { stroke: rgba(196, 218, 147, 0.12); stroke-width: 0.7; }
.monitor-chart polyline { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.monitor-line-health { stroke: #8ed39c; }
.monitor-line-humidity { stroke: #76b8f4; }
.monitor-line-ndvi { stroke: #e1bc60; }
.monitor-chart-legend { display: flex; flex-wrap: wrap; gap: 12px; color: #abb59f; font-size: 0.63rem; }
.monitor-chart-legend span { display: inline-flex; align-items: center; gap: 5px; }
.monitor-chart-legend i { width: 8px; height: 8px; border-radius: 50%; }
.monitor-line-health-key { background: #8ed39c; }
.monitor-line-humidity-key { background: #76b8f4; }
.monitor-line-ndvi-key { background: #e1bc60; }
.monitor-empty { margin: 10px 0 2px; padding: 10px; border: 1px dashed rgba(196, 218, 147, 0.16); border-radius: 10px; color: #aeb8a4; font-size: 0.7rem; line-height: 1.5; }
.monitor-plant-list { display: grid; max-height: 310px; overflow: auto; }
.monitor-plant-row { display: grid; grid-template-columns: 10px minmax(0, 1fr); align-items: center; gap: 9px; padding: 9px 0; border-top: 1px solid rgba(196, 218, 147, 0.08); }
.monitor-plant-row > span:nth-child(2) { display: grid; gap: 2px; }
.monitor-plant-row strong { color: #e7ecde; font-size: 0.68rem; }
.monitor-plant-row small { color: #aab49f; font-size: 0.61rem; }
.monitor-plant-row .monitor-plant-gps { grid-column: 2; color: #8f9b84; font-family: ui-monospace, monospace; }
.monitor-plant-dot { width: 8px; height: 8px; border-radius: 50%; background: #edac52; box-shadow: 0 0 0 3px rgba(237, 172, 82, 0.15); }
.monitor-plant-dot.is-dead { background: #e55c4a; box-shadow: 0 0 0 3px rgba(229, 92, 74, 0.17); }
.monitor-footnote { margin: 9px 0 0; color: #87927d; font-size: 0.6rem; line-height: 1.45; }

.map-quick-actions {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.map-save-form {
  display: grid;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid rgba(196, 218, 147, 0.13);
}
.map-save-form label { color: #c9d3b9; font-size: 0.72rem; font-weight: 700; }
.map-save-form input {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid rgba(196, 218, 147, 0.2);
  border-radius: 9px;
  color: #f5f1df;
  background: rgba(255, 255, 255, 0.04);
}
.map-save-form input:focus {
  outline: 2px solid rgba(142, 180, 91, 0.35);
  border-color: rgba(142, 180, 91, 0.45);
}

.maps-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 1rem;
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(24, 29, 23, 0.96), rgba(18, 22, 18, 0.88));
  box-shadow: 0 16px 26px rgba(0, 0, 0, 0.12), inset 0 1px rgba(255,255,255,0.03);
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
  grid-template-columns: minmax(0, 1fr) minmax(280px, 330px);
  gap: 16px;
  align-items: start;
}
.map-column, .map-card, .map-sidebar { min-width: 0; }
.maps-field-picker {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 12px;
  margin-bottom: 11px;
  padding: 6px 8px 6px 14px;
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 13px;
  background: rgba(22, 29, 22, 0.82);
}
.maps-field-picker label {
  color: #b6c0aa;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}
.maps-field-select {
  width: min(100%, 300px);
  min-height: 36px !important;
  margin-left: auto;
  padding: 0 34px 0 11px !important;
  border: 1px solid rgba(196, 218, 147, 0.18) !important;
  border-radius: 9px !important;
  color: #e9eedf !important;
  background-color: rgba(9, 15, 11, 0.72) !important;
  font-size: 0.72rem;
}
.maps-field-select:focus-visible {
  outline: 2px solid rgba(211, 189, 103, 0.5);
  outline-offset: 2px;
}
.map-feedback {
  margin-bottom: 11px;
  padding: 11px 13px;
  border: 1px solid rgba(196, 218, 147, 0.15);
  border-radius: 11px;
  color: #dce5d4;
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.75rem;
}
.map-feedback.is-error {
  border-color: rgba(248, 113, 113, 0.25);
  color: #fecaca;
  background: rgba(127, 29, 29, 0.2);
}
.map-feedback.is-success {
  border-color: rgba(114, 213, 159, 0.22);
  color: #a8e0ba;
  background: rgba(16, 105, 69, 0.16);
}
.map-card {
  overflow: hidden;
  border: 1px solid rgba(196, 218, 147, 0.14);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(20, 27, 20, 0.96), rgba(14, 18, 15, 0.9));
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22), inset 0 1px rgba(255, 255, 255, 0.04);
  animation: maps-enter 0.55s 0.06s both;
}
.map-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 16px 18px 15px;
  border-bottom: 1px solid rgba(196, 218, 147, 0.1);
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
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
  border-radius: 10px;
  color: #dce7c7;
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.61rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  box-shadow: inset 0 1px rgba(255,255,255,0.04);
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
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(25, 31, 24, 0.98), rgba(15, 20, 16, 0.92));
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.16);
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
.export-error { margin: 10px 0 0; color: #fca5a5; font-size: 0.75rem; }
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
  .monitor-layout { grid-template-columns: minmax(0, 1fr); }
  .monitor-details { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
  .maps-heading { align-items: flex-start; flex-direction: column; padding: 17px; }
  .maps-heading-actions { width: 100%; flex-wrap: wrap; justify-content: flex-start; }
  .monitor-heading { align-items: flex-start; flex-direction: column; }
  .monitor-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .monitor-details { grid-template-columns: minmax(0, 1fr); }
  .maps-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-item { padding: 12px; }
  .overview-item:nth-child(3) { border-left: 0; border-top: 1px solid rgba(196, 218, 147, 0.1); }
  .overview-item:nth-child(4) { border-top: 1px solid rgba(196, 218, 147, 0.1); }
  .maps-layout { grid-template-columns: minmax(0, 1fr); }
  .map-sidebar { grid-template-columns: 1fr; }
  .maps-field-picker { align-items: stretch; flex-direction: column; gap: 7px; padding: 11px; }
  .maps-field-select { width: 100%; margin-left: 0; }
  .map-canvas { height: clamp(320px, 52vh, 500px); height: clamp(320px, 52dvh, 500px); min-height: 0; }
  .map-sidebar { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 420px) {
  .maps-heading-actions { align-items: stretch; flex-direction: column; }
  .maps-heading-actions > :deep(button) { width: 100%; }
  .maps-heading-actions > .open-simulation-link { width: 100%; }
  .maps-live-pill { justify-content: center; }
  .map-card-header { align-items: flex-start; flex-direction: column; }
  .map-source { align-self: flex-start; }
  .map-card-footer { align-items: flex-start; flex-direction: column; }
  .map-canvas { height: clamp(300px, 48vh, 430px); height: clamp(300px, 48dvh, 430px); }
}

@media (prefers-reduced-motion: reduce) {
  .map-card, .map-sidebar :deep(.app-card), .empty-map-icon, .feature-row { animation: none; }
}
</style>
