<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMainStore } from '../stores'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import {
  AlertCircle, Check, LoaderCircle, Map, Plus, RefreshCw, Save, Trash2, Search,
} from 'lucide-vue-next'
import {
  createParcel,
  deleteParcel,
  listParcelOwners,
  listParcels,
  updateParcelStatus,
  type ParcelInput,
  type ParcelOwner,
  type ParcelRecord,
} from '../services/agronomyData'

const store = useMainStore()

const isAdmin = computed(() => {
  const profileRole = store.user?.profile?.role
  return profileRole === 'administrador'
    && store.user?.profile?.active === true
})

const parcelas = ref<ParcelRecord[]>([])
const owners = ref<ParcelOwner[]>([])
const loading = ref(true)
const saving = ref(false)
const busyParcelId = ref('')
const showNewParcela = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const searchQuery = ref('')
const statusFilter = ref<'all' | ParcelRecord['status']>('all')
const newParcela = ref({
  ownerId: '',
  parcelaName: '',
  hectareas: '',
  cultivo: '',
  municipio: '',
})

const cultivoOptions = ['Maíz', 'Trigo', 'Frijol', 'Tomate', 'Chile', 'Garbanzo', 'Caña de Azúcar', 'Otro']
const municipioOptions = ['Culiacán', 'Navolato', 'Mocorito', 'Badiraguato', 'Cosalá', 'Elota', 'San Ignacio', 'Otro']
const canSave = computed(() =>
  newParcela.value.parcelaName.trim().length > 0
  && Number(newParcela.value.hectareas) > 0
  && newParcela.value.cultivo.length > 0
  && newParcela.value.municipio.length > 0
  && (!isAdmin.value || newParcela.value.ownerId.length > 0)
)
const approvedCount = computed(() => parcelas.value.filter(parcel => parcel.status === 'approved').length)
const pendingCount = computed(() => parcelas.value.filter(parcel => parcel.status === 'pending').length)
const totalHectares = computed(() => parcelas.value.reduce((total, parcel) => total + parcel.hectares, 0))
const filteredParcels = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  return parcelas.value.filter(parcel => {
    const owner = `${parcel.profiles?.full_name ?? ''} ${parcel.profiles?.email ?? ''}`
    const matchesText = !query
      || `${parcel.name} ${parcel.crop} ${parcel.municipality} ${owner}`.toLocaleLowerCase().includes(query)
    const matchesStatus = statusFilter.value === 'all' || parcel.status === statusFilter.value
    return matchesText && matchesStatus
  })
})

const loadData = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const [parcelRows, ownerRows] = await Promise.all([
      listParcels(),
      isAdmin.value ? listParcelOwners() : Promise.resolve([]),
    ])
    parcelas.value = parcelRows
    owners.value = ownerRows
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudieron cargar las parcelas.'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const addParcela = async () => {
  if (!canSave.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const ownerId = isAdmin.value ? newParcela.value.ownerId : store.user?.id
  if (!ownerId) {
    errorMessage.value = 'No se encontró la sesión del usuario. Vuelve a iniciar sesión.'
    saving.value = false
    return
  }

  const input: ParcelInput = {
    owner_id: ownerId,
    name: newParcela.value.parcelaName.trim(),
    hectares: Number(newParcela.value.hectareas),
    crop: newParcela.value.cultivo,
    municipality: newParcela.value.municipio,
    status: isAdmin.value ? 'approved' : 'pending',
  }

  try {
    const created = await createParcel(input)
    parcelas.value = [created, ...parcelas.value]
    newParcela.value = { ownerId: '', parcelaName: '', hectareas: '', cultivo: '', municipio: '' }
    showNewParcela.value = false
    successMessage.value = isAdmin.value
      ? 'Parcela registrada correctamente.'
      : 'Solicitud de parcela enviada al administrador.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo guardar la parcela.'
  } finally {
    saving.value = false
  }
}

const approveParcela = async (parcel: ParcelRecord) => {
  busyParcelId.value = parcel.id
  errorMessage.value = ''
  try {
    await updateParcelStatus(parcel.id, 'approved')
    parcel.status = 'approved'
    successMessage.value = 'Solicitud aprobada.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo aprobar la parcela.'
  } finally {
    busyParcelId.value = ''
  }
}

const removeParcela = async (parcel: ParcelRecord) => {
  if (!confirm(`¿Seguro que deseas eliminar la parcela "${parcel.name}"?`)) return
  busyParcelId.value = parcel.id
  errorMessage.value = ''
  try {
    await deleteParcel(parcel.id)
    parcelas.value = parcelas.value.filter(item => item.id !== parcel.id)
    successMessage.value = 'Parcela eliminada.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo eliminar la parcela.'
  } finally {
    busyParcelId.value = ''
  }
}

const statusLabel = (status: ParcelRecord['status']) => ({
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
})[status]
</script>

<template>
  <div class="parcels-page space-y-6">
    <header class="parcels-heading">
      <div>
        <span class="parcels-eyebrow">OPERACIÓN AGRÍCOLA</span>
        <h1>Parcelas y clientes</h1>
        <p>Administra solicitudes, cultivos y superficies desde un solo lugar.</p>
      </div>
      <Button class="parcels-primary-button" variant="primary" size="sm" @click="showNewParcela = !showNewParcela">
        <Plus class="w-4 h-4 mr-2" /> Nueva Parcela
      </Button>
    </header>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="parcels-stat">
        <span class="parcels-stat-icon"><Map :size="18" /></span>
        <span><small>Parcelas registradas</small><strong>{{ parcelas.length }}</strong></span>
      </div>
      <div class="parcels-stat">
        <span class="parcels-stat-icon parcels-stat-approved"><Check :size="18" /></span>
        <span><small>Parcelas aprobadas</small><strong>{{ approvedCount }}</strong></span>
      </div>
      <div class="parcels-stat">
        <span class="parcels-stat-icon parcels-stat-pending"><RefreshCw :size="18" /></span>
        <span><small>Solicitudes pendientes</small><strong>{{ pendingCount }}</strong></span>
      </div>
      <div class="parcels-stat">
        <span class="parcels-stat-icon parcels-stat-area"><Map :size="18" /></span>
        <span><small>Superficie total</small><strong>{{ totalHectares.toLocaleString('es-MX', { maximumFractionDigits: 2 }) }} ha</strong></span>
      </div>
    </div>

    <div v-if="errorMessage" class="parcels-feedback parcels-feedback-error flex items-start gap-2 rounded-lg p-3 text-sm" role="alert">
      <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" /> {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="parcels-feedback parcels-feedback-success flex items-start gap-2 rounded-lg p-3 text-sm" role="status">
      <Check class="w-4 h-4 mt-0.5 shrink-0" /> {{ successMessage }}
    </div>

    <transition name="page" mode="out-in">
      <Card v-if="showNewParcela" class="parcels-card">
        <template #header>
          <h3 class="font-semibold text-gray-900 flex items-center gap-2">
            <Map class="w-4 h-4 text-agron-green" /> Registrar Nueva Parcela
          </h3>
        </template>
        <form class="parcels-form grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl" @submit.prevent="addParcela">
          <label v-if="isAdmin" class="grid gap-1 text-sm font-medium">
            Cliente propietario
            <select v-model="newParcela.ownerId" required class="parcel-input">
              <option value="" disabled>Seleccionar cliente activo</option>
              <option v-for="owner in owners" :key="owner.id" :value="owner.id">{{ owner.full_name || owner.email }} · {{ owner.email }}</option>
            </select>
            <span v-if="owners.length === 0" class="font-normal text-amber-700">No hay clientes activos disponibles.</span>
          </label>
          <label :class="isAdmin ? '' : 'md:col-span-2'" class="grid gap-1 text-sm font-medium">
            Nombre de la parcela
            <input v-model="newParcela.parcelaName" required maxlength="120" type="text" class="parcel-input" placeholder="Ej: Parcela Norte">
          </label>
          <label class="grid gap-1 text-sm font-medium">
            Hectáreas
            <input v-model="newParcela.hectareas" required type="number" min="0.01" max="1000000" step="0.01" class="parcel-input" placeholder="0.00">
          </label>
          <label class="grid gap-1 text-sm font-medium">
            Cultivo principal
            <select v-model="newParcela.cultivo" required class="parcel-input">
              <option value="" disabled>Seleccionar cultivo</option>
              <option v-for="cultivo in cultivoOptions" :key="cultivo" :value="cultivo">{{ cultivo }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-sm font-medium">
            Municipio
            <select v-model="newParcela.municipio" required class="parcel-input">
              <option value="" disabled>Seleccionar municipio</option>
              <option v-for="municipio in municipioOptions" :key="municipio" :value="municipio">{{ municipio }}</option>
            </select>
          </label>
          <div class="md:col-span-2 flex gap-3 mt-2">
            <Button type="submit" variant="primary" size="sm" :disabled="!canSave || saving">
              <LoaderCircle v-if="saving" class="w-4 h-4 mr-2 animate-spin" />
              <Save v-else class="w-4 h-4 mr-2" />
              {{ saving ? 'Guardando…' : isAdmin ? 'Registrar parcela' : 'Solicitar registro' }}
            </Button>
            <Button type="button" variant="outline" size="sm" @click="showNewParcela = false">Cancelar</Button>
          </div>
        </form>
      </Card>
    </transition>

    <Card class="parcels-card">
      <template #header>
        <div class="parcels-list-heading">
          <div>
            <span class="parcels-eyebrow">DIRECTORIO</span>
            <h3>Parcelas registradas <span class="parcels-count">{{ filteredParcels.length }}</span></h3>
          </div>
          <button type="button" class="parcels-refresh" :disabled="loading" @click="loadData">
            <RefreshCw :size="15" :class="{ 'animate-spin': loading }" /> Actualizar
          </button>
        </div>
      </template>
      <div class="parcels-filters">
        <label class="parcels-search">
          <span class="sr-only">Buscar parcelas</span>
          <Search :size="16" />
          <input v-model="searchQuery" type="search" placeholder="Buscar por parcela, cultivo, municipio o cliente">
        </label>
        <label>
          <span class="sr-only">Filtrar por estado</span>
          <select v-model="statusFilter" class="parcel-input parcels-status-filter">
            <option value="all">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
          </select>
        </label>
      </div>
      <div class="overflow-x-auto">
        <table class="parcels-table w-full text-sm">
          <thead>
            <tr class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
              <th class="pb-3 pr-4">Cliente</th>
              <th class="pb-3 pr-4">Parcela</th>
              <th class="pb-3 pr-4">Cultivo</th>
              <th class="pb-3 pr-4">Municipio</th>
              <th class="pb-3 pr-4">Hectáreas / estado</th>
              <th class="pb-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="parcel in filteredParcels" :key="parcel.id">
              <td class="py-3 pr-4">
                <p class="font-medium">{{ parcel.profiles?.full_name || parcel.profiles?.email || 'Cuenta actual' }}</p>
                <p class="text-xs text-gray-400">{{ parcel.profiles?.email || '—' }}</p>
              </td>
              <td class="py-3 pr-4 font-semibold">{{ parcel.name }}</td>
              <td class="py-3 pr-4"><span class="parcels-crop-badge">{{ parcel.crop }}</span></td>
              <td class="py-3 pr-4">{{ parcel.municipality }}</td>
              <td class="py-3 pr-4">
                {{ parcel.hectares.toLocaleString('es-MX') }} ha
                <span class="parcels-status-badge" :class="`status-${parcel.status}`">{{ statusLabel(parcel.status) }}</span>
              </td>
              <td class="py-3 text-right">
                <div class="flex justify-end items-center gap-2">
                  <button
                    v-if="isAdmin && parcel.status === 'pending'"
                    type="button"
                    :disabled="busyParcelId === parcel.id"
                    class="parcels-approve-button"
                    @click="approveParcela(parcel)"
                  >{{ busyParcelId === parcel.id ? 'Guardando…' : 'Aprobar' }}</button>
                  <button
                    v-if="isAdmin || parcel.status === 'pending'"
                    type="button"
                    :disabled="busyParcelId === parcel.id"
                    class="parcels-delete-button"
                    :aria-label="`Eliminar parcela ${parcel.name}`"
                    @click="removeParcela(parcel)"
                  ><Trash2 class="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="6" class="py-8 text-center text-sm"><LoaderCircle class="inline w-4 h-4 animate-spin mr-2" />Cargando parcelas…</td>
            </tr>
            <tr v-else-if="parcelas.length === 0">
              <td colspan="6" class="parcels-empty">Todavía no hay parcelas registradas. Crea una nueva para comenzar.</td>
            </tr>
            <tr v-else-if="filteredParcels.length === 0">
              <td colspan="6" class="parcels-empty">No hay parcelas que coincidan con esos filtros.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.parcels-page {
  min-width: 0;
  color: #e8eddf;
  animation: parcels-arrive 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.parcels-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 0.25rem 0;
}

.parcels-eyebrow {
  color: #c1a95f;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.parcels-heading h1 {
  margin-top: 0.4rem;
  color: #f0f1e9;
  font-size: clamp(1.7rem, 3vw, 2.35rem);
  font-weight: 760;
  letter-spacing: -0.055em;
}

.parcels-heading p { margin-top: 0.35rem; color: #a2aa97; font-size: 0.88rem; }
:deep(.parcels-primary-button) { min-height: 42px; border: 1px solid rgba(126, 221, 170, 0.24); border-radius: 10px; background: linear-gradient(120deg, #12845e, #0e6d50); }

.parcels-stat {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(29, 36, 25, 0.96), rgba(18, 24, 18, 0.96));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
  transition: transform 0.2s ease, border-color 0.2s ease;
}
.parcels-stat:hover { transform: translateY(-2px); border-color: rgba(211, 189, 103, 0.25); }
.parcels-stat > span:last-child { display: grid; gap: 0.2rem; }
.parcels-stat small { color: #9ca591; font-size: 0.68rem; }
.parcels-stat strong { color: #f0f1e9; font-size: 1.35rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.parcels-stat-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border: 1px solid rgba(211, 189, 103, 0.2); border-radius: 11px; color: #dfc775; background: rgba(211, 189, 103, 0.08); }
.parcels-stat-approved { border-color: rgba(114, 213, 159, 0.2); color: #85d4a3; background: rgba(114, 213, 159, 0.08); }
.parcels-stat-pending { border-color: rgba(229, 162, 97, 0.2); color: #e5a261; background: rgba(229, 162, 97, 0.08); }
.parcels-stat-area { border-color: rgba(117, 184, 236, 0.2); color: #91c4e9; background: rgba(117, 184, 236, 0.08); }
.parcels-feedback-error { border: 1px solid rgba(231, 127, 105, 0.25); color: #f0a293; background: rgba(231, 127, 105, 0.08); }
.parcels-feedback-success { border: 1px solid rgba(114, 213, 159, 0.22); color: #a8e0ba; background: rgba(114, 213, 159, 0.08); }

:deep(.parcels-card.app-card) { min-width: 0; border: 1px solid rgba(196, 218, 147, 0.13); border-radius: 16px; background: linear-gradient(145deg, rgba(26, 34, 25, 0.98), rgba(17, 23, 18, 0.98)); box-shadow: 0 14px 35px rgba(0, 0, 0, 0.18); }
:deep(.parcels-card .app-card-header) { padding: 1.05rem 1.25rem; border-color: rgba(196, 218, 147, 0.1); }
:deep(.parcels-card .app-card-body) { padding: 1.2rem 1.25rem; }
.parcels-form > label { color: #bac1b0; }
.parcel-input { width: 100%; min-height: 42px; padding: 0.65rem 0.75rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 10px; outline: none; color: #e7ebdf; background: rgba(7, 13, 10, 0.45); font-size: 0.76rem; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.parcel-input:focus { border-color: rgba(211, 189, 103, 0.55); box-shadow: 0 0 0 3px rgba(211, 189, 103, 0.09); }
.parcel-input option { color: #e7ebdf; background: #182019; }
.parcels-list-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%; }
.parcels-list-heading h3 { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.22rem; color: #e8eddf; font-size: 0.9rem; font-weight: 680; }
.parcels-count { display: grid; min-width: 24px; height: 24px; padding: 0 0.35rem; place-items: center; border: 1px solid rgba(211, 189, 103, 0.2); border-radius: 999px; color: #ddca86; background: rgba(211, 189, 103, 0.07); font-size: 0.64rem; }
.parcels-refresh { display: inline-flex; min-height: 34px; align-items: center; gap: 0.45rem; padding: 0 0.7rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 9px; color: #cbd2c1; background: rgba(255,255,255,0.035); font-size: 0.68rem; }
.parcels-refresh:hover { border-color: rgba(211, 189, 103, 0.32); color: #e6d28b; }
.parcels-refresh:disabled { opacity: 0.55; }
.parcels-filters { display: flex; flex-wrap: wrap; gap: 0.7rem; margin-bottom: 1rem; }
.parcels-search { display: flex; min-width: min(100%, 250px); min-height: 42px; flex: 1; align-items: center; gap: 0.55rem; padding: 0 0.75rem; border: 1px solid rgba(196, 218, 147, 0.16); border-radius: 10px; color: #929b88; background: rgba(7, 13, 10, 0.45); }
.parcels-search:focus-within { border-color: rgba(211, 189, 103, 0.55); box-shadow: 0 0 0 3px rgba(211, 189, 103, 0.09); }
.parcels-search input { width: 100%; min-width: 0; border: 0; outline: 0; color: #e7ebdf; background: transparent; font-size: 0.73rem; }
.parcels-search input::placeholder { color: #747f70; }
.parcels-status-filter { width: auto; min-width: 160px; }
.parcels-table { min-width: 720px; border-collapse: collapse; }
.parcels-table th { padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(196, 218, 147, 0.12); color: #8f9986; background: rgba(255, 255, 255, 0.025); font-size: 0.57rem; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase; }
.parcels-table td { padding: 0.85rem; border-bottom: 1px solid rgba(196, 218, 147, 0.08); color: #d9dfd1; vertical-align: middle; }
.parcels-table tbody tr { transition: background 0.18s ease; }
.parcels-table tbody tr:hover { background: rgba(255, 255, 255, 0.025); }
.parcels-table tbody tr:last-child td { border-bottom: 0; }
.parcels-crop-badge,.parcels-status-badge { display: inline-flex; align-items: center; border-radius: 999px; font-size: 0.62rem; font-weight: 700; white-space: nowrap; }
.parcels-crop-badge { padding: 0.35rem 0.6rem; color: #9cdbad; background: rgba(114, 213, 159, 0.09); }
.parcels-status-badge { margin-left: 0.4rem; padding: 0.32rem 0.55rem; border: 1px solid; }
.status-approved { border-color: rgba(114, 213, 159, 0.2); color: #9cdbad; background: rgba(114, 213, 159, 0.08); }
.status-pending { border-color: rgba(224, 189, 96, 0.2); color: #e3cd83; background: rgba(224, 189, 96, 0.08); }
.status-rejected { border-color: rgba(231, 127, 105, 0.2); color: #e69a8c; background: rgba(231, 127, 105, 0.08); }
.parcels-approve-button { padding: 0.34rem 0.5rem; border: 1px solid rgba(114, 213, 159, 0.2); border-radius: 7px; color: #a3dfb3; background: rgba(114, 213, 159, 0.09); font-size: 0.62rem; font-weight: 700; }
.parcels-delete-button { display: grid; width: 31px; height: 31px; place-items: center; border-radius: 8px; color: #a4ad98; }
.parcels-delete-button:hover { color: #e99587; background: rgba(231, 127, 105, 0.08); }
.parcels-approve-button:disabled,.parcels-delete-button:disabled { cursor: wait; opacity: 0.5; }
.parcels-empty { padding: 2rem 1rem; color: #929b88; text-align: center; }

@keyframes parcels-arrive { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 640px) {
  .parcels-heading { align-items: flex-start; flex-direction: column; }
  :deep(.parcels-card .app-card-header), :deep(.parcels-card .app-card-body) { padding: 0.95rem; }
}
@media (prefers-reduced-motion: reduce) {
  .parcels-page { animation: none; }
  .parcels-stat { transition: none; }
}
</style>
