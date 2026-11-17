<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useMainStore } from '../stores'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import {
  createCrop,
  createDevice,
  createFieldCrop,
  createTreatment,
  listAlerts,
  listCrops,
  listDevices,
  listFieldCrops,
  listFields,
  listSatelliteImagery,
  listTreatments,
  markAlertRead,
  saveSatelliteImagery,
  updateDeviceStatus,
  type CropRecord,
  type FieldRecord,
  type Json,
} from '../services/agronomyData'

const store = useMainStore()
const isAdmin = computed(() => store.user?.profile?.role === 'administrador' && store.user?.profile?.active)
const fields = shallowRef<FieldRecord[]>([])
const crops = ref<CropRecord[]>([])
const selectedFieldId = ref('')
const fieldCrops = ref<any[]>([])
const imagery = ref<any[]>([])
const treatments = ref<any[]>([])
const devices = ref<any[]>([])
const alerts = ref<any[]>([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const cropForm = ref({
  name: '',
  scientific_name: '',
  optimal_min_humidity: '',
  optimal_max_humidity: '',
  optimal_min_temp: '',
  optimal_max_temp: '',
  growth_cycle_days: '',
})
const fieldCropForm = ref({
  crop_id: '',
  planting_date: '',
  estimated_harvest_date: '',
  actual_harvest_date: '',
  yield_tons: '',
  status: 'planted',
})
const treatmentForm = ref({
  treatment_type: '',
  product_name: '',
  dosage: '',
  unit_of_measure: '',
  application_date: '',
  notes: '',
})
const deviceForm = ref({ name: '', device_type: '', status: 'active', configuration: '{}' })
const imageryForm = ref({
  tile_url: '',
  capture_date: '',
  ndvi_avg: '',
  cloud_coverage: '',
})

const selectedField = computed(() => fields.value.some(field => field.id === selectedFieldId.value))

const loadFieldsAndCrops = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    fields.value = await listFields()
    crops.value = await listCrops()
    if (!selectedFieldId.value && fields.value.length) selectedFieldId.value = fields.value[0].id
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudieron cargar los campos y cultivos.'
  } finally {
    loading.value = false
  }
}

const loadFieldRecords = async () => {
  if (!selectedFieldId.value) {
    fieldCrops.value = []
    imagery.value = []
    treatments.value = []
    devices.value = []
    alerts.value = []
    return
  }
  errorMessage.value = ''
  try {
    fieldCrops.value = await listFieldCrops(selectedFieldId.value)
    imagery.value = await listSatelliteImagery(selectedFieldId.value)
    treatments.value = await listTreatments(selectedFieldId.value)
    devices.value = await listDevices(selectedFieldId.value)
    alerts.value = await listAlerts(selectedFieldId.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudieron cargar los registros del campo.'
  }
}

watch(selectedFieldId, () => { void loadFieldRecords() })
onMounted(loadFieldsAndCrops)

const runSave = async (action: () => Promise<void>, success: string) => {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await action()
    successMessage.value = success
    await loadFieldRecords()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo guardar el registro.'
  } finally {
    saving.value = false
  }
}

const optionalNumber = (value: string) => value.trim() ? Number(value) : null
const asIsoDate = (value: string) => value ? new Date(value).toISOString() : undefined

const saveCrop = () => runSave(async () => {
  const optionalValues = [
    cropForm.value.optimal_min_humidity,
    cropForm.value.optimal_max_humidity,
    cropForm.value.optimal_min_temp,
    cropForm.value.optimal_max_temp,
    cropForm.value.growth_cycle_days,
  ].map(optionalNumber)
  await createCrop({
    name: cropForm.value.name.trim(),
    scientific_name: cropForm.value.scientific_name.trim() || null,
    optimal_min_humidity: optionalValues[0],
    optimal_max_humidity: optionalValues[1],
    optimal_min_temp: optionalValues[2],
    optimal_max_temp: optionalValues[3],
    growth_cycle_days: optionalValues[4],
  })
  crops.value = await listCrops()
  cropForm.value = {
    name: '', scientific_name: '', optimal_min_humidity: '', optimal_max_humidity: '',
    optimal_min_temp: '', optimal_max_temp: '', growth_cycle_days: '',
  }
}, 'Cultivo añadido al catálogo.')

const saveFieldCrop = () => {
  if (!selectedFieldId.value || !fieldCropForm.value.crop_id) return
  return runSave(() => createFieldCrop({
    field_id: selectedFieldId.value,
    crop_id: fieldCropForm.value.crop_id,
    planting_date: fieldCropForm.value.planting_date || null,
    estimated_harvest_date: fieldCropForm.value.estimated_harvest_date || null,
    actual_harvest_date: fieldCropForm.value.actual_harvest_date || null,
    yield_tons: optionalNumber(fieldCropForm.value.yield_tons),
    status: fieldCropForm.value.status,
  }), 'Cultivo asociado al campo.')
}

const saveTreatmentRecord = () => {
  if (!selectedFieldId.value) return
  return runSave(() => createTreatment({
    field_id: selectedFieldId.value,
    treatment_type: treatmentForm.value.treatment_type.trim(),
    product_name: treatmentForm.value.product_name.trim() || null,
    dosage: optionalNumber(treatmentForm.value.dosage),
    unit_of_measure: treatmentForm.value.unit_of_measure.trim() || null,
    application_date: asIsoDate(treatmentForm.value.application_date) ?? new Date().toISOString(),
    notes: treatmentForm.value.notes.trim() || null,
  }), 'Tratamiento guardado.')
}

const saveDevice = () => {
  if (!selectedFieldId.value) return
  let configuration: Json
  try {
    const parsed: unknown = JSON.parse(deviceForm.value.configuration)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('La configuración debe ser un objeto JSON.')
    }
    configuration = parsed as Json
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'La configuración JSON no es válida.'
    return
  }
  return runSave(() => createDevice({
    field_id: selectedFieldId.value,
    name: deviceForm.value.name.trim(),
    device_type: deviceForm.value.device_type.trim(),
    status: deviceForm.value.status,
    configuration,
  }), 'Dispositivo guardado.')
}

const saveImagery = () => {
  if (!selectedFieldId.value) return
  return runSave(() => saveSatelliteImagery({
    field_id: selectedFieldId.value,
    tile_url: imageryForm.value.tile_url.trim(),
    capture_date: asIsoDate(imageryForm.value.capture_date) ?? new Date().toISOString(),
    ndvi_avg: optionalNumber(imageryForm.value.ndvi_avg),
    cloud_coverage: optionalNumber(imageryForm.value.cloud_coverage),
  }), 'Imagen satelital guardada.')
}

const toggleDeviceStatus = (device: { id: string; status: string }) => runSave(
  () => updateDeviceStatus(device.id, device.status === 'active' ? 'inactive' : 'active'),
  'Estado del dispositivo actualizado.',
)

const readAlert = (alert: { id: string }) => runSave(
  () => markAlertRead(alert.id),
  'Alerta marcada como leída.',
)
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Gestión de campos</h1>
        <p class="mt-1 text-gray-500">Cultivos, tratamientos, dispositivos e imágenes asociadas a tus campos.</p>
      </div>
      <label class="grid gap-1 text-sm font-medium text-gray-700">
        Campo activo
        <select v-model="selectedFieldId" class="min-w-60 rounded-lg border border-gray-300 bg-white px-3 py-2">
          <option value="">Selecciona un campo</option>
          <option v-for="field in fields" :key="field.id" :value="field.id">{{ field.name }}</option>
        </select>
      </label>
    </header>

    <p v-if="errorMessage" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700" role="status">{{ successMessage }}</p>
    <p v-if="loading" class="text-sm text-gray-500">Cargando campos y cultivos…</p>
    <div v-else-if="fields.length === 0" class="rounded-xl border border-dashed border-gray-300 p-8 text-center">
      <h2 class="font-semibold text-gray-800">Todavía no tienes campos</h2>
      <p class="mt-1 text-sm text-gray-500">Delimita un campo en el mapa para comenzar a guardar sus registros.</p>
      <RouterLink to="/mapas" class="mt-3 inline-block text-sm font-semibold text-agron-green-dark">Abrir mapas</RouterLink>
    </div>

    <template v-else-if="selectedField">
      <Card v-if="isAdmin">
        <template #header><h2 class="font-semibold text-gray-900">Catálogo de cultivos</h2></template>
        <form class="grid grid-cols-1 gap-3 md:grid-cols-4" @submit.prevent="saveCrop">
          <input v-model="cropForm.name" required maxlength="120" placeholder="Nombre del cultivo" class="field-input">
          <input v-model="cropForm.scientific_name" placeholder="Nombre científico" class="field-input">
          <input v-model="cropForm.growth_cycle_days" type="number" min="1" placeholder="Ciclo (días)" class="field-input">
          <Button type="submit" variant="primary" :disabled="saving">Añadir cultivo</Button>
          <input v-model="cropForm.optimal_min_humidity" type="number" placeholder="Humedad mín. %" class="field-input">
          <input v-model="cropForm.optimal_max_humidity" type="number" placeholder="Humedad máx. %" class="field-input">
          <input v-model="cropForm.optimal_min_temp" type="number" placeholder="Temperatura mín." class="field-input">
          <input v-model="cropForm.optimal_max_temp" type="number" placeholder="Temperatura máx." class="field-input">
        </form>
        <p class="mt-3 text-xs text-gray-500">{{ crops.length }} cultivo(s) en catálogo</p>
      </Card>

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <template #header><h2 class="font-semibold text-gray-900">Cultivos del campo</h2></template>
          <form class="grid grid-cols-1 gap-3 sm:grid-cols-2" @submit.prevent="saveFieldCrop">
            <select v-model="fieldCropForm.crop_id" required class="field-input sm:col-span-2">
              <option value="">Selecciona un cultivo</option>
              <option v-for="crop in crops" :key="crop.id" :value="crop.id">{{ crop.name }}</option>
            </select>
            <label class="grid gap-1 text-xs text-gray-500">Fecha de siembra<input v-model="fieldCropForm.planting_date" type="date" class="field-input"></label>
            <label class="grid gap-1 text-xs text-gray-500">Cosecha estimada<input v-model="fieldCropForm.estimated_harvest_date" type="date" class="field-input"></label>
            <label class="grid gap-1 text-xs text-gray-500">Cosecha real<input v-model="fieldCropForm.actual_harvest_date" type="date" class="field-input"></label>
            <input v-model="fieldCropForm.yield_tons" type="number" min="0" step="any" placeholder="Rendimiento (toneladas)" class="field-input">
            <input v-model="fieldCropForm.status" required placeholder="Estado (planted, harvested…)" class="field-input">
            <Button type="submit" variant="primary" :disabled="saving || !crops.length">Asociar cultivo</Button>
          </form>
          <ul class="mt-4 divide-y divide-gray-100">
            <li v-for="item in fieldCrops" :key="item.id" class="py-2 text-sm text-gray-700">
              {{ item.crops?.name ?? 'Cultivo' }} · {{ item.status }}
              <span v-if="item.planting_date" class="text-gray-400"> · siembra {{ item.planting_date }}</span>
            </li>
            <li v-if="!fieldCrops.length" class="py-2 text-sm text-gray-400">Sin cultivos asociados.</li>
          </ul>
        </Card>

        <Card>
          <template #header><h2 class="font-semibold text-gray-900">Tratamientos</h2></template>
          <form class="grid grid-cols-1 gap-3 sm:grid-cols-2" @submit.prevent="saveTreatmentRecord">
            <input v-model="treatmentForm.treatment_type" required placeholder="Tipo de tratamiento" class="field-input">
            <input v-model="treatmentForm.product_name" placeholder="Producto" class="field-input">
            <input v-model="treatmentForm.dosage" type="number" min="0" step="any" placeholder="Dosis" class="field-input">
            <input v-model="treatmentForm.unit_of_measure" placeholder="Unidad (kg/ha, L…)" class="field-input">
            <input v-model="treatmentForm.application_date" type="datetime-local" class="field-input">
            <input v-model="treatmentForm.notes" placeholder="Notas" class="field-input">
            <Button type="submit" variant="primary" :disabled="saving">Guardar tratamiento</Button>
          </form>
          <ul class="mt-4 divide-y divide-gray-100">
            <li v-for="item in treatments" :key="item.id" class="py-2 text-sm text-gray-700">
              {{ item.treatment_type }}<span v-if="item.product_name"> · {{ item.product_name }}</span>
              <span class="text-gray-400"> · {{ new Date(item.application_date).toLocaleDateString('es-MX') }}</span>
            </li>
            <li v-if="!treatments.length" class="py-2 text-sm text-gray-400">Sin tratamientos registrados.</li>
          </ul>
        </Card>

        <Card>
          <template #header><h2 class="font-semibold text-gray-900">Dispositivos</h2></template>
          <form class="grid grid-cols-1 gap-3 sm:grid-cols-2" @submit.prevent="saveDevice">
            <input v-model="deviceForm.name" required placeholder="Nombre del dispositivo" class="field-input">
            <input v-model="deviceForm.device_type" required placeholder="Tipo (sensor, dron…)" class="field-input">
            <select v-model="deviceForm.status" class="field-input">
              <option value="active">Activo</option><option value="inactive">Inactivo</option><option value="maintenance">Mantenimiento</option>
            </select>
            <div class="device-config-field sm:col-span-2">
              <div class="device-config-heading">
                <label for="device-configuration">Configuración del dispositivo</label>
                <span>JSON</span>
              </div>
              <textarea
                id="device-configuration"
                v-model="deviceForm.configuration"
                rows="3"
                placeholder='{"interval": 60}'
                aria-describedby="device-configuration-hint"
                class="field-input device-config-editor"
              ></textarea>
              <p id="device-configuration-hint">Opcional · agrega parámetros del sensor o dron en formato JSON.</p>
            </div>
            <Button type="submit" variant="primary" :disabled="saving">Añadir dispositivo</Button>
          </form>
          <ul class="mt-4 divide-y divide-gray-100">
            <li v-for="device in devices" :key="device.id" class="flex items-center justify-between gap-3 py-2 text-sm">
              <span class="text-gray-700">{{ device.name }} · {{ device.device_type }} · {{ device.status }}</span>
              <button type="button" class="text-xs font-semibold text-agron-green-dark" :disabled="saving" @click="toggleDeviceStatus(device)">
                {{ device.status === 'active' ? 'Desactivar' : 'Activar' }}
              </button>
            </li>
            <li v-if="!devices.length" class="py-2 text-sm text-gray-400">Sin dispositivos registrados.</li>
          </ul>
        </Card>

        <Card>
          <template #header><h2 class="font-semibold text-gray-900">Imágenes satelitales</h2></template>
          <form class="grid grid-cols-1 gap-3 sm:grid-cols-2" @submit.prevent="saveImagery">
            <input v-model="imageryForm.tile_url" required type="url" placeholder="URL de la imagen o tile" class="field-input sm:col-span-2">
            <input v-model="imageryForm.capture_date" type="datetime-local" class="field-input">
            <input v-model="imageryForm.ndvi_avg" type="number" min="-1" max="1" step="any" placeholder="NDVI promedio" class="field-input">
            <input v-model="imageryForm.cloud_coverage" type="number" min="0" max="100" step="any" placeholder="Nubosidad %" class="field-input">
            <Button type="submit" variant="primary" :disabled="saving">Guardar imagen</Button>
          </form>
          <ul class="mt-4 divide-y divide-gray-100">
            <li v-for="item in imagery" :key="item.id" class="py-2 text-sm text-gray-700">
              <a :href="item.tile_url" target="_blank" rel="noopener noreferrer" class="text-agron-green-dark underline">Ver imagen</a>
              <span class="text-gray-400"> · {{ new Date(item.capture_date).toLocaleDateString('es-MX') }}</span>
              <span v-if="item.ndvi_avg !== null" class="text-gray-500"> · NDVI {{ item.ndvi_avg }}</span>
            </li>
            <li v-if="!imagery.length" class="py-2 text-sm text-gray-400">Sin imágenes registradas.</li>
          </ul>
        </Card>

        <Card class="xl:col-span-2">
          <template #header><h2 class="font-semibold text-gray-900">Alertas del campo</h2></template>
          <ul class="divide-y divide-gray-100">
            <li v-for="alert in alerts" :key="alert.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <strong class="text-sm text-gray-800">{{ alert.alert_type }} · {{ alert.severity }}</strong>
                <span class="ml-2 text-sm text-gray-600">{{ alert.message }}</span>
              </span>
              <button v-if="!alert.is_read" type="button" class="text-xs font-semibold text-agron-green-dark" :disabled="saving" @click="readAlert(alert)">Marcar leída</button>
              <span v-else class="text-xs text-gray-400">Leída</span>
            </li>
            <li v-if="!alerts.length" class="py-2 text-sm text-gray-400">Sin alertas registradas.</li>
          </ul>
        </Card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.field-input {
  min-width: 0;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.55rem 0.7rem;
  color: #374151;
  background: white;
  font-size: 0.875rem;
}
.field-input:focus { outline: 2px solid #4d7c0f; outline-offset: 1px; }

.device-config-field {
  display: grid;
  min-width: 0;
  gap: 0.5rem;
  padding: 0.8rem;
  border: 1px solid rgba(196, 218, 147, 0.15);
  border-radius: 0.8rem;
  background: linear-gradient(145deg, rgba(28, 36, 25, 0.72), rgba(17, 24, 19, 0.72));
}

.device-config-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.device-config-heading label {
  color: #dce5ce;
  font-size: 0.75rem;
  font-weight: 650;
}

.device-config-heading span {
  padding: 0.2rem 0.45rem;
  border: 1px solid rgba(211, 189, 103, 0.2);
  border-radius: 5px;
  color: #d9bd68;
  background: rgba(211, 189, 103, 0.07);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.62rem;
  font-weight: 700;
}

.device-config-editor {
  width: 100%;
  min-height: 82px;
  border-color: rgba(196, 218, 147, 0.2);
  border-radius: 0.65rem;
  color: #d7e4ce;
  background: rgba(8, 14, 10, 0.82);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  line-height: 1.55;
  resize: vertical;
}

.device-config-editor::placeholder { color: #78836e; }
.device-config-editor:focus {
  border-color: rgba(142, 180, 91, 0.55);
  outline: 2px solid rgba(142, 180, 91, 0.25);
  outline-offset: 1px;
}

.device-config-field > p {
  color: #929b88;
  font-size: 0.68rem;
  line-height: 1.4;
}
</style>
