<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMainStore } from '../stores'
import { supabase } from '../services/supabase'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import { Map, Plus, Trash2, Save } from 'lucide-vue-next'

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
const isAdmin = computed(() => {
  const profileRole = store.user?.profile?.role
  const metadataRole = store.user?.user_metadata?.role
  return profileRole === 'administrador' || metadataRole === 'administrador' || store.user?.email === 'jenone0424@gmail.com'
})
const fields = ref<Field[]>([])
const crops = ref<Crop[]>([])
const profiles = ref<ProfileOption[]>([])
const loading = ref(false)
const saving = ref(false)
const showNewField = ref(false)
const errorMessage = ref('')
const statusMessage = ref('')
const newField = ref({
  name: '',
  description: '',
  cropId: '',
  plantingDate: new Date().toISOString().slice(0, 10),
  ownerId: ''
})

const cropName = (cropId: string | null) =>
  crops.value.find(crop => crop.id === cropId)?.name ?? 'Sin cultivo asignado'

const loadData = async () => {
  if (!supabase || !store.user?.id) {
    errorMessage.value = 'Inicia sesión y configura Supabase para consultar tus parcelas.'
    return
  }

  loading.value = true
  errorMessage.value = ''

  const fieldsQuery = supabase.from('fields').select('*').order('created_at', { ascending: false })
  const [fieldsResult, cropsResult] = await Promise.all([
    isAdmin.value ? fieldsQuery : fieldsQuery.eq('user_id', store.user.id),
    supabase.from('crops').select('id, name, scientific_name').order('name')
  ])

  if (fieldsResult.error) {
    errorMessage.value = `No se pudieron consultar las parcelas: ${fieldsResult.error.message}`
    fields.value = []
  } else {
    fields.value = (fieldsResult.data ?? []) as Field[]
  }

  if (cropsResult.error) {
    errorMessage.value = [errorMessage.value, `No se pudo consultar el catálogo de cultivos: ${cropsResult.error.message}`]
      .filter(Boolean)
      .join(' ')
    crops.value = []
  } else {
    crops.value = (cropsResult.data ?? []) as Crop[]
  }

  if (isAdmin.value) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .order('email')

    if (error) {
      errorMessage.value = [errorMessage.value, `No se pudieron consultar los clientes: ${error.message}`]
        .filter(Boolean)
        .join(' ')
    } else {
      profiles.value = (data ?? []) as ProfileOption[]
    }
  } else {
    profiles.value = store.user
      ? [{
          id: store.user.id,
          email: store.user.email ?? '',
          full_name: store.user.profile?.full_name ?? store.user.user_metadata?.name ?? null
        }]
      : []
  }

  if (!newField.value.ownerId && profiles.value.length > 0) {
    newField.value.ownerId = isAdmin.value ? '' : profiles.value[0].id
  }
  loading.value = false
}

onMounted(loadData)

const resetForm = () => {
  newField.value = {
    name: '',
    description: '',
    cropId: '',
    plantingDate: new Date().toISOString().slice(0, 10),
    ownerId: isAdmin.value ? '' : store.user?.id ?? ''
  }
}

const addField = async () => {
  if (!supabase || !store.user?.id || !newField.value.name.trim()) return
  if (!newField.value.ownerId) {
    errorMessage.value = 'Selecciona el cliente propietario de la parcela.'
    return
  }

  saving.value = true
  errorMessage.value = ''
  statusMessage.value = ''

  const { data: field, error } = await supabase
    .from('fields')
    .insert({
      user_id: newField.value.ownerId,
      name: newField.value.name.trim(),
      description: newField.value.description.trim() || null,
      crop_id: newField.value.cropId || null
    })
    .select('id')
    .single()

  if (error) {
    errorMessage.value = `No se pudo guardar la parcela: ${error.message}`
    saving.value = false
    return
  }

  if (newField.value.cropId) {
    const { error: cropError } = await supabase.from('field_crops').insert({
      field_id: field.id,
      crop_id: newField.value.cropId,
      planting_date: newField.value.plantingDate
    })

    if (cropError) {
      const partialSaveMessage = `La parcela se guardó, pero no se pudo registrar su ciclo de cultivo: ${cropError.message}`
      await loadData()
      errorMessage.value = partialSaveMessage
      saving.value = false
      return
    }
  }

  statusMessage.value = 'Parcela guardada en Supabase.'
  showNewField.value = false
  resetForm()
  await loadData()
  saving.value = false
}

const removeField = async (field: Field) => {
  if (!supabase || !window.confirm(`¿Eliminar la parcela "${field.name}"? Esta acción no se puede deshacer.`)) return

  errorMessage.value = ''
  statusMessage.value = ''
  const { error } = await supabase.from('fields').delete().eq('id', field.id)
  if (error) {
    errorMessage.value = `No se pudo eliminar la parcela: ${error.message}`
    return
  }

  statusMessage.value = 'Parcela eliminada.'
  await loadData()
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Parcelas y Clientes</h1>
      <p class="mt-1 text-gray-500">Registra parcelas y relaciona sus cultivos con los datos guardados en Supabase.</p>
    </div>

    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">{{ fields.length }} parcela(s) registrada(s)</p>
      <Button variant="primary" size="sm" @click="showNewField = !showNewField">
        <Plus class="mr-2 h-4 w-4" /> Nueva Parcela
      </Button>
    </div>

    <div v-if="errorMessage" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
      {{ errorMessage }}
    </div>
    <div v-if="statusMessage" class="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700" role="status">
      {{ statusMessage }}
    </div>

    <Card v-if="showNewField">
      <template #header>
        <h3 class="flex items-center gap-2 font-semibold text-gray-900">
          <Map class="h-4 w-4 text-agron-green" /> Registrar Nueva Parcela
        </h3>
      </template>
      <form class="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2" @submit.prevent="addField">
        <label v-if="isAdmin" class="text-sm font-medium text-gray-700">
          Cliente propietario
          <select v-model="newField.ownerId" required class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="" disabled>Seleccionar cliente</option>
            <option v-for="profile in profiles" :key="profile.id" :value="profile.id">
              {{ profile.full_name || profile.email }} ({{ profile.email }})
            </option>
          </select>
        </label>
        <label class="text-sm font-medium text-gray-700" :class="isAdmin ? '' : 'md:col-span-2'">
          Nombre de la parcela
          <input v-model="newField.name" required maxlength="150" class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ej. Parcela Norte" />
        </label>
        <label class="text-sm font-medium text-gray-700 md:col-span-2">
          Descripción
          <textarea v-model="newField.description" rows="2" class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ubicación, superficie u otros detalles" />
        </label>
        <label class="text-sm font-medium text-gray-700">
          Cultivo
          <select v-model="newField.cropId" class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">Sin cultivo</option>
            <option v-for="crop in crops" :key="crop.id" :value="crop.id">
              {{ crop.name }}{{ crop.scientific_name ? ` (${crop.scientific_name})` : '' }}
            </option>
          </select>
        </label>
        <label v-if="newField.cropId" class="text-sm font-medium text-gray-700">
          Fecha de siembra
          <input v-model="newField.plantingDate" type="date" required class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <div class="mt-2 flex gap-3 md:col-span-2">
          <Button variant="primary" size="sm" type="submit" :disabled="saving || loading || (isAdmin && profiles.length === 0)">
            <Save class="mr-2 h-4 w-4" /> {{ saving ? 'Guardando…' : 'Guardar parcela' }}
          </Button>
          <Button variant="outline" size="sm" type="button" @click="showNewField = false">Cancelar</Button>
        </div>
      </form>
      <p v-if="crops.length === 0 && !loading" class="mt-3 text-xs text-gray-500">
        No hay cultivos en el catálogo. Puedes agregarlos desde Datos → Tablas de Supabase → Catálogo de cultivos.
      </p>
    </Card>

    <Card>
      <template #header>
        <h3 class="flex items-center gap-2 font-semibold text-gray-900">
          <Map class="h-4 w-4 text-gray-500" /> Parcelas Registradas
        </h3>
      </template>
      <div v-if="loading" class="py-8 text-center text-sm text-gray-500">Consultando Supabase…</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th class="pb-3 pr-4">Propietario</th>
              <th class="pb-3 pr-4">Parcela</th>
              <th class="pb-3 pr-4">Cultivo</th>
              <th class="pb-3 pr-4">Descripción</th>
              <th class="pb-3">Registrada</th>
              <th class="pb-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="field in fields" :key="field.id" class="hover:bg-gray-50">
              <td class="py-3 pr-4 text-xs text-gray-500">
                {{ profiles.find(profile => profile.id === field.user_id)?.email ?? field.user_id }}
              </td>
              <td class="py-3 pr-4 font-medium text-gray-700">{{ field.name }}</td>
              <td class="py-3 pr-4">
                <span class="rounded-full bg-agron-green-light px-2.5 py-1 text-xs font-semibold text-agron-green-dark">{{ cropName(field.crop_id) }}</span>
              </td>
              <td class="py-3 pr-4 text-gray-600">{{ field.description || '—' }}</td>
              <td class="py-3 text-gray-600">{{ new Date(field.created_at).toLocaleDateString() }}</td>
              <td class="py-3 text-right">
                <button
                  type="button"
                  class="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  :aria-label="`Eliminar parcela ${field.name}`"
                  @click="removeField(field)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </td>
            </tr>
            <tr v-if="fields.length === 0">
              <td colspan="6" class="py-8 text-center text-sm text-gray-400">No hay parcelas registradas.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>
