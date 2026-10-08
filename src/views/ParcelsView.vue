<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMainStore } from '../stores'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import { Map, Plus, Trash2, Save } from 'lucide-vue-next'

const store = useMainStore()

const isAdmin = computed(() => {
  const profileRole = store.user?.profile?.role
  const metadataRole = store.user?.user_metadata?.role
  return profileRole === 'administrador' || metadataRole === 'administrador' || store.user?.email === 'jenone0424@gmail.com'
})

const currentUserEmail = computed(() => store.user?.email || '')
const currentUserName = computed(() => store.user?.user_metadata?.name || store.user?.profile?.full_name || 'Mi Cuenta')

interface Parcela {
  id: number
  clientName: string
  clientEmail: string
  parcelaName: string
  hectareas: number
  cultivo: string
  municipio: string
  status: 'aprobada' | 'pendiente'
}

const allParcelas = ref<Parcela[]>([
  { id: 1, clientName: 'Carlos Mendoza', clientEmail: 'carlos@agronia.com', parcelaName: 'Parcela Norte', hectareas: 45, cultivo: 'Maíz', municipio: 'Culiacán', status: 'aprobada' },
  { id: 2, clientName: 'Ana López', clientEmail: 'ana@agronia.com', parcelaName: 'Parcela Sur', hectareas: 80, cultivo: 'Trigo', municipio: 'Navolato', status: 'aprobada' },
])

const parcelas = computed(() => {
  if (isAdmin.value) return allParcelas.value
  return allParcelas.value.filter(p => p.clientEmail === currentUserEmail.value)
})

const showNewParcela = ref(false)
const newParcela = ref({
  clientName: '', clientEmail: '', parcelaName: '', hectareas: 0, cultivo: '', municipio: ''
})
const addParcelaMsg = ref('')

const cultivoOptions = ['Maíz', 'Trigo', 'Frijol', 'Tomate', 'Chile', 'Garbanzo', 'Caña de Azúcar', 'Otro']
const municipioOptions = ['Culiacán', 'Navolato', 'Mocorito', 'Badiraguato', 'Cosalá', 'Elota', 'San Ignacio', 'Otro']

const addParcela = () => {
  if (!newParcela.value.parcelaName) return

  if (!isAdmin.value) {
    newParcela.value.clientEmail = currentUserEmail.value
    newParcela.value.clientName = currentUserName.value
  }

  const status = isAdmin.value ? 'aprobada' : 'pendiente'

  allParcelas.value.push({ id: Date.now(), ...newParcela.value, status })
  newParcela.value = { clientName: '', clientEmail: '', parcelaName: '', hectareas: 0, cultivo: '', municipio: '' }
  showNewParcela.value = false

  if (isAdmin.value) {
    addParcelaMsg.value = 'Parcela registrada exitosamente.'
  } else {
    addParcelaMsg.value = 'Solicitud de parcela enviada al administrador.'
  }
  setTimeout(() => { addParcelaMsg.value = '' }, 4000)
}

const approveParcela = (id: number) => {
  const p = allParcelas.value.find(x => x.id === id)
  if (p) p.status = 'aprobada'
}

const removeParcela = (id: number) => {
  allParcelas.value = allParcelas.value.filter(p => p.id !== id)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Parcelas y Clientes</h1>
      <p class="text-gray-500 mt-1">Registra y administra clientes y sus respectivos campos agrícolas.</p>
    </div>

    <div class="flex justify-between items-center">
      <p class="text-sm text-gray-500">{{ parcelas.length }} parcela(s) registrada(s)</p>
      <Button variant="primary" size="sm" @click="showNewParcela = !showNewParcela">
        <Plus class="w-4 h-4 mr-2" /> Nueva Parcela
      </Button>
    </div>

    <div v-if="addParcelaMsg" class="p-3 bg-agron-green-light text-agron-green-dark rounded-lg text-sm font-medium">{{ addParcelaMsg }}</div>

    <!-- Form nueva parcela -->
    <transition name="page" mode="out-in">
      <Card v-if="showNewParcela">
        <template #header>
          <h3 class="font-semibold text-gray-900 flex items-center gap-2">
            <Map class="w-4 h-4 text-agron-green" /> Registrar Nueva Parcela
          </h3>
        </template>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div v-if="isAdmin">
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre del Cliente</label>
            <input v-model="newParcela.clientName" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="Nombre completo" />
          </div>
          <div v-if="isAdmin">
            <label class="block text-sm font-medium text-gray-700 mb-1">Correo del Cliente</label>
            <input v-model="newParcela.clientEmail" type="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="correo@cliente.com" />
          </div>
          <div :class="isAdmin ? '' : 'md:col-span-2'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre de la Parcela</label>
            <input v-model="newParcela.parcelaName" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="Ej: Parcela Norte" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Hectáreas</label>
            <input v-model="newParcela.hectareas" type="number" min="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="0" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cultivo Principal</label>
            <select v-model="newParcela.cultivo" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm bg-white">
              <option value="" disabled>Seleccionar cultivo</option>
              <option v-for="c in cultivoOptions" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Municipio</label>
            <select v-model="newParcela.municipio" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm bg-white">
              <option value="" disabled>Seleccionar municipio</option>
              <option v-for="m in municipioOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="md:col-span-2 flex gap-3 mt-2">
            <Button variant="primary" size="sm" @click="addParcela" :disabled="!newParcela.parcelaName">
              <Save class="w-4 h-4 mr-2" /> {{ isAdmin ? 'Registrar Parcela' : 'Solicitar Registro' }}
            </Button>
            <Button variant="outline" size="sm" @click="showNewParcela = false">Cancelar</Button>
          </div>
        </div>
      </Card>
    </transition>

    <!-- Tabla de parcelas -->
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
              <th class="pb-3 pr-4">Hectáreas</th>
              <th class="pb-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="p in parcelas" :key="p.id" class="hover:bg-gray-50 transition-colors">
              <td class="py-3 pr-4">
                <p class="font-medium text-gray-900">{{ p.clientName }}</p>
                <p class="text-xs text-gray-400">{{ p.clientEmail }}</p>
              </td>
              <td class="py-3 pr-4 font-medium text-gray-700">{{ p.parcelaName }}</td>
              <td class="py-3 pr-4">
                <span class="bg-agron-green-light text-agron-green-dark text-xs font-semibold px-2.5 py-1 rounded-full">{{ p.cultivo }}</span>
              </td>
              <td class="py-3 pr-4 text-gray-600">{{ p.municipio }}</td>
              <td class="py-3 pr-4 text-gray-600">
                {{ p.hectareas }} ha
                <span v-if="p.status === 'pendiente'" class="ml-2 bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Pendiente</span>
              </td>
              <td class="py-3 text-right">
                <div class="flex justify-end items-center gap-2">
                  <button v-if="isAdmin && p.status === 'pendiente'" @click="approveParcela(p.id)" class="text-green-600 hover:bg-green-50 font-semibold text-xs border border-green-200 px-2 py-1 rounded transition-colors" title="Aprobar Solicitud">Aprobar</button>
                  <button @click="removeParcela(p.id)" class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Eliminar Parcela">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="parcelas.length === 0">
              <td colspan="6" class="py-8 text-center text-gray-400 text-sm">No hay parcelas registradas.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>
