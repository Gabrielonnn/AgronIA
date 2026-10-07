<script setup lang="ts">
import { ref } from 'vue'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import { Map, Plus, Trash2, Save } from 'lucide-vue-next'

interface Parcela {
  id: number
  clientName: string
  clientEmail: string
  parcelaName: string
  hectareas: number
  cultivo: string
  municipio: string
}

const parcelas = ref<Parcela[]>([
  { id: 1, clientName: 'Carlos Mendoza', clientEmail: 'carlos@agronia.com', parcelaName: 'Parcela Norte', hectareas: 45, cultivo: 'Maíz', municipio: 'Culiacán' },
  { id: 2, clientName: 'Ana López', clientEmail: 'ana@agronia.com', parcelaName: 'Parcela Sur', hectareas: 80, cultivo: 'Trigo', municipio: 'Navolato' },
])

const showNewParcela = ref(false)
const newParcela = ref({
  clientName: '', clientEmail: '', parcelaName: '', hectareas: 0, cultivo: '', municipio: ''
})
const addParcelaMsg = ref('')

const cultivoOptions = ['Maíz', 'Trigo', 'Frijol', 'Tomate', 'Chile', 'Garbanzo', 'Caña de Azúcar', 'Otro']
const municipioOptions = ['Culiacán', 'Navolato', 'Mocorito', 'Badiraguato', 'Cosalá', 'Elota', 'San Ignacio', 'Otro']

const addParcela = () => {
  if (!newParcela.value.clientName || !newParcela.value.parcelaName) return
  parcelas.value.push({ id: Date.now(), ...newParcela.value })
  newParcela.value = { clientName: '', clientEmail: '', parcelaName: '', hectareas: 0, cultivo: '', municipio: '' }
  showNewParcela.value = false
  addParcelaMsg.value = 'Parcela registrada exitosamente.'
  setTimeout(() => { addParcelaMsg.value = '' }, 3000)
}

const removeParcela = (id: number) => {
  parcelas.value = parcelas.value.filter(p => p.id !== id)
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
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre del Cliente</label>
            <input v-model="newParcela.clientName" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="Nombre completo" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Correo del Cliente</label>
            <input v-model="newParcela.clientEmail" type="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="correo@cliente.com" />
          </div>
          <div>
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
          <div class="md:col-span-2 flex gap-3">
            <Button variant="primary" size="sm" @click="addParcela" :disabled="!newParcela.clientName || !newParcela.parcelaName">
              <Save class="w-4 h-4 mr-2" /> Registrar Parcela
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
              <td class="py-3 pr-4 text-gray-600">{{ p.hectareas }} ha</td>
              <td class="py-3 text-right">
                <button @click="removeParcela(p.id)" class="text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 class="w-4 h-4" />
                </button>
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
