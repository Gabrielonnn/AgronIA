<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMainStore } from '../stores'
import { supabase } from '../services/supabase'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import { AlertCircle, Check, LoaderCircle, Map, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-vue-next'

interface Crop {
  id: string
  name: string
  scientific_name: string | null
}

interface Field {
  id: string
  user_id: string
  name: string
  description: string | null
  crop_id: string | null
  created_at: string
}

interface ProfileOption {
  id: string
  email: string
  full_name: string | null
}

const store = useMainStore()
const isAdmin = computed(() =>
  store.user?.profile?.role === 'administrador' && store.user.profile.active === true
)
const fields = ref<Field[]>([])
const crops = ref<Crop[]>([])
const profiles = ref<ProfileOption[]>([])
const loading = ref(false)
const saving = ref(false)
const busyFieldId = ref('')
const showNewField = ref(false)
const errorMessage = ref('')
const statusMessage = ref('')
const searchQuery = ref('')
const newField = ref({
  name: '',
  description: '',
  cropId: '',
  plantingDate: new Date().toISOString().slice(0, 10),
  ownerId: '',
})

const cropName = (cropId: string | null) =>
  crops.value.find(crop => crop.id === cropId)?.name ?? 'Sin cultivo asignado'
const croppedFieldCount = computed(() => fields.value.filter(field => field.crop_id).length)
const filteredFields = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return fields.value
  return fields.value.filter(field => {
    const owner = profiles.value.find(profile => profile.id === field.user_id)
    return `${field.name} ${field.description ?? ''} ${cropName(field.crop_id)} ${owner?.email ?? ''} ${owner?.full_name ?? ''}`
      .toLocaleLowerCase()
      .includes(query)
  })
})

const loadData = async () => {
  if (!supabase || !store.user?.id) {
    errorMessage.value = 'Inicia sesión y configura Supabase para consultar tus parcelas.'
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    let fieldsQuery = supabase.from('fields').select('id,user_id,name,description,crop_id,created_at').order('created_at', { ascending: false })
    if (!isAdmin.value) fieldsQuery = fieldsQuery.eq('user_id', store.user.id)

    const [fieldsResult, cropsResult] = await Promise.all([
      fieldsQuery,
      supabase.from('crops').select('id,name,scientific_name').order('name'),
    ])
    if (fieldsResult.error) throw new Error(`No se pudieron consultar las parcelas: ${fieldsResult.error.message}`)
    if (cropsResult.error) throw new Error(`No se pudo consultar el catálogo de cultivos: ${cropsResult.error.message}`)
    fields.value = (fieldsResult.data ?? []) as Field[]
    crops.value = (cropsResult.data ?? []) as Crop[]

    if (isAdmin.value) {
      const { data, error } = await supabase.from('profiles').select('id,email,full_name').order('email')
      if (error) throw new Error(`No se pudieron consultar los clientes: ${error.message}`)
      profiles.value = (data ?? []) as ProfileOption[]
    } else {
      profiles.value = [{
        id: store.user.id,
        email: store.user.email ?? '',
        full_name: store.user.profile?.full_name ?? store.user.user_metadata?.name ?? null,
      }]
      newField.value.ownerId = store.user.id
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudieron cargar las parcelas.'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const resetForm = () => {
  newField.value = {
    name: '',
    description: '',
    cropId: '',
    plantingDate: new Date().toISOString().slice(0, 10),
    ownerId: isAdmin.value ? '' : store.user?.id ?? '',
  }
}

const addField = async () => {
  if (!supabase || !store.user?.id || !newField.value.name.trim() || saving.value) return
  if (!newField.value.ownerId) {
    errorMessage.value = 'Selecciona el cliente propietario de la parcela.'
    return
  }

  saving.value = true
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    const { data: field, error } = await supabase.from('fields').insert({
      user_id: newField.value.ownerId,
      name: newField.value.name.trim(),
      description: newField.value.description.trim() || null,
      crop_id: newField.value.cropId || null,
    }).select('id').single()
    if (error) throw new Error(`No se pudo guardar la parcela: ${error.message}`)

    if (newField.value.cropId) {
      const { error: cropError } = await supabase.from('field_crops').insert({
        field_id: field.id,
        crop_id: newField.value.cropId,
        planting_date: newField.value.plantingDate,
      })
      if (cropError) {
        await loadData()
        throw new Error(`La parcela se guardó, pero no se pudo registrar su ciclo de cultivo: ${cropError.message}`)
      }
    }

    statusMessage.value = 'Parcela guardada en Supabase.'
    showNewField.value = false
    resetForm()
    await loadData()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo guardar la parcela.'
  } finally {
    saving.value = false
  }
}

const removeField = async (field: Field) => {
  if (!supabase || !window.confirm(`¿Eliminar la parcela "${field.name}"? Esta acción no se puede deshacer.`)) return

  busyFieldId.value = field.id
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    const { error } = await supabase.from('fields').delete().eq('id', field.id)
    if (error) throw new Error(`No se pudo eliminar la parcela: ${error.message}`)
    statusMessage.value = 'Parcela eliminada.'
    await loadData()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo eliminar la parcela.'
  } finally {
    busyFieldId.value = ''
  }
}
</script>

<template>
  <div class="parcels-page space-y-6">
    <header class="parcels-heading">
      <div>
        <span class="parcels-eyebrow">OPERACIÓN AGRÍCOLA</span>
        <h1>Parcelas y clientes</h1>
        <p>Administra los campos y sus cultivos desde un solo lugar.</p>
      </div>
      <Button class="parcels-primary-button" variant="primary" size="sm" @click="showNewField = !showNewField">
        <Plus class="mr-2 h-4 w-4" /> Nueva parcela
      </Button>
    </header>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div class="parcels-stat">
        <span class="parcels-stat-icon"><Map :size="18" /></span>
        <span><small>Parcelas registradas</small><strong>{{ fields.length }}</strong></span>
      </div>
      <div class="parcels-stat parcels-stat-approved">
        <span class="parcels-stat-icon"><Check :size="18" /></span>
        <span><small>Con cultivo asignado</small><strong>{{ croppedFieldCount }}</strong></span>
      </div>
      <div class="parcels-stat parcels-stat-area">
        <span class="parcels-stat-icon"><Map :size="18" /></span>
        <span><small>Cultivos disponibles</small><strong>{{ crops.length }}</strong></span>
      </div>
    </div>

    <div v-if="errorMessage" class="parcels-feedback parcels-feedback-error flex items-start gap-2 rounded-lg p-3 text-sm" role="alert">
      <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" /> {{ errorMessage }}
    </div>
    <div v-if="statusMessage" class="parcels-feedback parcels-feedback-success flex items-start gap-2 rounded-lg p-3 text-sm" role="status">
      <Check class="mt-0.5 h-4 w-4 shrink-0" /> {{ statusMessage }}
    </div>

    <transition name="page" mode="out-in">
      <Card v-if="showNewField" class="parcels-card">
        <template #header>
          <h2 class="flex items-center gap-2 font-semibold"><Map class="h-4 w-4" /> Registrar parcela</h2>
        </template>
        <form class="parcels-form grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2" @submit.prevent="addField">
          <label v-if="isAdmin" class="grid gap-1 text-sm font-medium">
            Cliente propietario
            <select v-model="newField.ownerId" required class="parcel-input">
              <option value="" disabled>Seleccionar cliente</option>
              <option v-for="profile in profiles" :key="profile.id" :value="profile.id">
                {{ profile.full_name || profile.email }} · {{ profile.email }}
              </option>
            </select>
          </label>
          <label class="grid gap-1 text-sm font-medium" :class="isAdmin ? '' : 'md:col-span-2'">
            Nombre de la parcela
            <input v-model="newField.name" required maxlength="150" class="parcel-input" placeholder="Ej. Parcela Norte">
          </label>
          <label class="grid gap-1 text-sm font-medium md:col-span-2">
            Descripción
            <textarea v-model="newField.description" rows="2" class="parcel-input" placeholder="Ubicación u otros detalles" />
          </label>
          <label class="grid gap-1 text-sm font-medium">
            Cultivo
            <select v-model="newField.cropId" class="parcel-input">
              <option value="">Sin cultivo</option>
              <option v-for="crop in crops" :key="crop.id" :value="crop.id">
                {{ crop.name }}{{ crop.scientific_name ? ` (${crop.scientific_name})` : '' }}
              </option>
            </select>
          </label>
          <label v-if="newField.cropId" class="grid gap-1 text-sm font-medium">
            Fecha de siembra
            <input v-model="newField.plantingDate" type="date" required class="parcel-input">
          </label>
          <div class="mt-2 flex gap-3 md:col-span-2">
            <Button variant="primary" size="sm" type="submit" :disabled="saving || loading || (isAdmin && profiles.length === 0)">
              <LoaderCircle v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
              <Save v-else class="mr-2 h-4 w-4" />
              {{ saving ? 'Guardando…' : 'Guardar parcela' }}
            </Button>
            <Button variant="outline" size="sm" type="button" @click="showNewField = false">Cancelar</Button>
          </div>
        </form>
        <p v-if="crops.length === 0 && !loading" class="mt-3 text-xs text-gray-400">
          No hay cultivos en el catálogo. Agrégalos desde Datos → Tablas de Supabase.
        </p>
      </Card>
    </transition>

    <Card class="parcels-card">
      <template #header>
        <div class="parcels-list-heading">
          <div>
            <span class="parcels-eyebrow">DIRECTORIO</span>
            <h2>Parcelas registradas <span class="parcels-count">{{ filteredFields.length }}</span></h2>
          </div>
          <button type="button" class="parcels-refresh" :disabled="loading" @click="loadData">
            <RefreshCw :size="15" :class="{ 'animate-spin': loading }" /> Actualizar
          </button>
        </div>
      </template>
      <label class="parcels-search mb-4">
        <span class="sr-only">Buscar parcelas</span>
        <Search :size="16" />
        <input v-model="searchQuery" type="search" placeholder="Buscar por parcela, cultivo o cliente">
      </label>
      <div v-if="loading" class="py-8 text-center text-sm text-gray-400">Consultando Supabase…</div>
      <div v-else class="overflow-x-auto">
        <table class="parcels-table w-full text-sm">
          <thead>
            <tr class="text-left text-xs font-semibold uppercase tracking-wider">
              <th>Propietario</th><th>Parcela</th><th>Cultivo</th><th>Descripción</th><th>Registrada</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="field in filteredFields" :key="field.id">
              <td>{{ profiles.find(profile => profile.id === field.user_id)?.email ?? 'Cuenta actual' }}</td>
              <td class="font-semibold">{{ field.name }}</td>
              <td><span class="parcels-crop-badge">{{ cropName(field.crop_id) }}</span></td>
              <td>{{ field.description || '—' }}</td>
              <td>{{ new Date(field.created_at).toLocaleDateString('es-MX') }}</td>
              <td class="text-right">
                <button
                  type="button"
                  class="parcels-delete-button"
                  :disabled="busyFieldId === field.id"
                  :aria-label="`Eliminar parcela ${field.name}`"
                  @click="removeField(field)"
                >
                  <LoaderCircle v-if="busyFieldId === field.id" class="h-4 w-4 animate-spin" />
                  <Trash2 v-else class="h-4 w-4" />
                </button>
              </td>
            </tr>
            <tr v-if="!filteredFields.length">
              <td colspan="6" class="parcels-empty">
                {{ searchQuery ? 'No hay parcelas que coincidan con la búsqueda.' : 'Todavía no hay parcelas registradas.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.parcels-page { min-width: 0; color: #e8eddf; animation: parcels-arrive 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }
.parcels-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 1.25rem; padding: 0.25rem 0; }
.parcels-eyebrow { color: #c1a95f; font-size: 0.58rem; font-weight: 800; letter-spacing: 0.15em; }
.parcels-heading h1 { margin-top: 0.4rem; color: #f0f1e9; font-size: clamp(1.7rem, 3vw, 2.35rem); font-weight: 760; letter-spacing: -0.055em; }
.parcels-heading p { margin-top: 0.35rem; color: #a2aa97; font-size: 0.88rem; }
:deep(.parcels-primary-button) { min-height: 42px; border: 1px solid rgba(126, 221, 170, 0.24); border-radius: 10px; background: linear-gradient(120deg, #12845e, #0e6d50); }
.parcels-stat { display: flex; min-width: 0; align-items: center; gap: 0.85rem; padding: 1rem 1.1rem; border: 1px solid rgba(196, 218, 147, 0.13); border-radius: 14px; background: linear-gradient(145deg, rgba(29, 36, 25, 0.96), rgba(18, 24, 18, 0.96)); }
.parcels-stat > span:last-child { display: grid; gap: 0.2rem; }
.parcels-stat small { color: #9ca591; font-size: 0.68rem; }
.parcels-stat strong { color: #f0f1e9; font-size: 1.35rem; }
.parcels-stat-icon { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid rgba(211, 189, 103, 0.2); border-radius: 11px; color: #dfc775; background: rgba(211, 189, 103, 0.08); }
.parcels-stat-approved .parcels-stat-icon { color: #85d4a3; }
.parcels-stat-area .parcels-stat-icon { color: #91c4e9; }
.parcels-feedback-error { border: 1px solid rgba(231, 127, 105, 0.25); color: #f0a293; background: rgba(231, 127, 105, 0.08); }
.parcels-feedback-success { border: 1px solid rgba(114, 213, 159, 0.22); color: #a8e0ba; background: rgba(114, 213, 159, 0.08); }
:deep(.parcels-card.app-card) { min-width: 0; border: 1px solid rgba(196, 218, 147, 0.13); border-radius: 16px; background: linear-gradient(145deg, rgba(26, 34, 25, 0.98), rgba(17, 23, 18, 0.98)); }
:deep(.parcels-card .app-card-header), :deep(.parcels-card .app-card-body) { border-color: rgba(196, 218, 147, 0.1); }
.parcels-form > label { color: #bac1b0; }
.parcel-input { width: 100%; min-height: 42px; padding: 0.65rem 0.75rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 10px; color: #e7ebdf; background: rgba(7, 13, 10, 0.45); font-size: 0.76rem; }
.parcel-input option { color: #e7ebdf; background: #182019; }
.parcels-list-heading { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 1rem; }
.parcels-list-heading h2 { display: flex; align-items: center; gap: 0.6rem; color: #e8eddf; font-size: 0.9rem; font-weight: 680; }
.parcels-count { color: #ddca86; }
.parcels-refresh { display: inline-flex; min-height: 34px; align-items: center; gap: 0.45rem; padding: 0 0.7rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 9px; color: #cbd2c1; background: rgba(255,255,255,0.035); font-size: 0.68rem; }
.parcels-search { display: flex; min-height: 42px; align-items: center; gap: 0.55rem; padding: 0 0.75rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 10px; color: #929b88; background: rgba(7, 13, 10, 0.45); }
.parcels-search input { width: 100%; min-width: 0; border: 0; outline: 0; color: #e7ebdf; background: transparent; font-size: 0.73rem; }
.parcels-table { min-width: 680px; border-collapse: collapse; }
.parcels-table th { padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(196, 218, 147, 0.12); color: #8f9986; }
.parcels-table td { padding: 0.85rem; border-bottom: 1px solid rgba(196, 218, 147, 0.08); color: #c4cbbd; }
.parcels-crop-badge { display: inline-block; padding: 0.25rem 0.55rem; border: 1px solid rgba(114, 213, 159, 0.2); border-radius: 999px; color: #a8e0ba; background: rgba(114, 213, 159, 0.08); font-size: 0.68rem; }
.parcels-delete-button { padding: 0.4rem; border-radius: 7px; color: #c78676; }
.parcels-delete-button:hover { background: rgba(231, 127, 105, 0.1); }
.parcels-empty { padding: 2rem !important; color: #929b88 !important; text-align: center; }
@keyframes parcels-arrive { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 640px) { .parcels-heading { align-items: flex-start; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .parcels-page { animation: none; } }
</style>
