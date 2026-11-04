<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMainStore } from '../stores'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import {
  AlertCircle, Check, LoaderCircle, Map, Plus, RefreshCw, Save, Trash2,
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
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Parcelas y Clientes</h1>
        <p class="text-gray-500 mt-1">Registra y administra parcelas agrícolas vinculadas a tu cuenta.</p>
      </div>
      <Button variant="primary" size="sm" @click="showNewParcela = !showNewParcela">
        <Plus class="w-4 h-4 mr-2" /> Nueva Parcela
      </Button>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-gray-500">{{ parcelas.length }} parcela(s) registrada(s)</p>
      <button type="button" class="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-agron-green" :disabled="loading" @click="loadData">
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Actualizar
      </button>
    </div>

    <div v-if="errorMessage" class="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
      <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" /> {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700" role="status">
      <Check class="w-4 h-4 mt-0.5 shrink-0" /> {{ successMessage }}
    </div>

    <transition name="page" mode="out-in">
      <Card v-if="showNewParcela">
        <template #header>
          <h3 class="font-semibold text-gray-900 flex items-center gap-2">
            <Map class="w-4 h-4 text-agron-green" /> Registrar Nueva Parcela
          </h3>
        </template>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl" @submit.prevent="addParcela">
          <label v-if="isAdmin" class="grid gap-1 text-sm font-medium text-gray-700">
            Cliente propietario
            <select v-model="newParcela.ownerId" required class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="" disabled>Seleccionar cliente activo</option>
              <option v-for="owner in owners" :key="owner.id" :value="owner.id">{{ owner.full_name || owner.email }} · {{ owner.email }}</option>
            </select>
            <span v-if="owners.length === 0" class="font-normal text-amber-700">No hay clientes activos disponibles.</span>
          </label>
          <label :class="isAdmin ? '' : 'md:col-span-2'" class="grid gap-1 text-sm font-medium text-gray-700">
            Nombre de la parcela
            <input v-model="newParcela.parcelaName" required maxlength="120" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Ej: Parcela Norte">
          </label>
          <label class="grid gap-1 text-sm font-medium text-gray-700">
            Hectáreas
            <input v-model="newParcela.hectareas" required type="number" min="0.01" max="1000000" step="0.01" class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0.00">
          </label>
          <label class="grid gap-1 text-sm font-medium text-gray-700">
            Cultivo principal
            <select v-model="newParcela.cultivo" required class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="" disabled>Seleccionar cultivo</option>
              <option v-for="cultivo in cultivoOptions" :key="cultivo" :value="cultivo">{{ cultivo }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-sm font-medium text-gray-700">
            Municipio
            <select v-model="newParcela.municipio" required class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white">
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

    <Card>
      <template #header>
        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
          <Map class="w-4 h-4 text-gray-500" /> Parcelas Registradas
        </h3>
      </template>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
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
            <tr v-for="parcel in parcelas" :key="parcel.id" class="hover:bg-gray-50 transition-colors">
              <td class="py-3 pr-4">
                <p class="font-medium text-gray-900">{{ parcel.profiles?.full_name || parcel.profiles?.email || 'Cuenta actual' }}</p>
                <p class="text-xs text-gray-400">{{ parcel.profiles?.email || '—' }}</p>
              </td>
              <td class="py-3 pr-4 font-medium text-gray-700">{{ parcel.name }}</td>
              <td class="py-3 pr-4"><span class="bg-agron-green-light text-agron-green-dark text-xs font-semibold px-2.5 py-1 rounded-full">{{ parcel.crop }}</span></td>
              <td class="py-3 pr-4 text-gray-600">{{ parcel.municipality }}</td>
              <td class="py-3 pr-4 text-gray-600">
                {{ parcel.hectares }} ha
                <span class="ml-2 bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{{ statusLabel(parcel.status) }}</span>
              </td>
              <td class="py-3 text-right">
                <div class="flex justify-end items-center gap-2">
                  <button
                    v-if="isAdmin && parcel.status === 'pending'"
                    type="button"
                    :disabled="busyParcelId === parcel.id"
                    class="text-green-600 hover:bg-green-50 font-semibold text-xs border border-green-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    @click="approveParcela(parcel)"
                  >{{ busyParcelId === parcel.id ? 'Guardando…' : 'Aprobar' }}</button>
                  <button
                    v-if="isAdmin || parcel.status === 'pending'"
                    type="button"
                    :disabled="busyParcelId === parcel.id"
                    class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                    :aria-label="`Eliminar parcela ${parcel.name}`"
                    @click="removeParcela(parcel)"
                  ><Trash2 class="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="6" class="py-8 text-center text-gray-400 text-sm"><LoaderCircle class="inline w-4 h-4 animate-spin mr-2" />Cargando parcelas…</td>
            </tr>
            <tr v-else-if="parcelas.length === 0">
              <td colspan="6" class="py-8 text-center text-gray-400 text-sm">No hay parcelas registradas en tu cuenta.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>
