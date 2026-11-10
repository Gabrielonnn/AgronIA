<script setup lang="ts">
import { ref, computed } from 'vue'
import Dropzone from '../components/data/Dropzone.vue'
import DataTable from '../components/data/DataTable.vue'
import Card from '../components/ui/Card.vue'
import { FileText, Download, Trash2, BarChart3 } from 'lucide-vue-next'

const tableData = ref<any[]>([])
const columnHeaders = ref<string[]>([])
const fileName = ref('')

const handleDataLoaded = (data: any[]) => {
  tableData.value = data
  if (data.length > 0) {
    columnHeaders.value = Object.keys(data[0])
  }
}

const handleFileNamed = (name: string) => {
  fileName.value = name
}

const clearData = () => {
  tableData.value = []
  columnHeaders.value = []
  fileName.value = ''
}

const downloadCSV = () => {
  if (tableData.value.length === 0) return
  const headers = columnHeaders.value.join(',')
  const rows = tableData.value.map(row => columnHeaders.value.map(h => JSON.stringify(row[h] ?? '')).join(','))
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.value || 'datos_agronia.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// Resumen estadístico por columna numérica
const numericSummary = computed(() => {
  if (tableData.value.length === 0) return []
  return columnHeaders.value
    .filter(h => !isNaN(parseFloat(tableData.value[0][h])))
    .map(h => {
      const vals = tableData.value.map(r => parseFloat(r[h])).filter(v => !isNaN(v))
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      return { col: h, min: min.toFixed(2), max: max.toFixed(2), avg: avg.toFixed(2), count: vals.length }
    })
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Gestión de Registros</h1>
      <p class="text-gray-500 mt-1">Carga y visualiza datasets meteorológicos y reportes de campo en formato CSV.</p>
    </div>

    <Card>
      <template #header>
        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
          <FileText class="w-4 h-4 text-agron-green" /> Cargar Archivo CSV
        </h3>
      </template>
      <Dropzone @data-loaded="handleDataLoaded" @file-named="handleFileNamed" />
      <div class="mt-3 text-xs text-gray-400">
        Formatos aceptados: <span class="font-semibold text-gray-600">.csv</span> — Máximo recomendado: 50,000 filas.
        El archivo debe incluir encabezados en la primera fila.
      </div>
    </Card>

    <template v-if="tableData.length > 0">
      <!-- Barra de acciones -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="bg-agron-green-light text-agron-green-dark text-xs px-3 py-1.5 rounded-full font-semibold">
            {{ tableData.length }} filas
          </span>
          <span class="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-full font-semibold">
            {{ columnHeaders.length }} columnas
          </span>
          <span v-if="fileName" class="text-xs text-gray-500">
            Archivo: <span class="font-medium text-gray-700">{{ fileName }}</span>
          </span>
        </div>
        <div class="flex gap-2">
          <button @click="downloadCSV" class="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-agron-green-dark border border-gray-200 hover:border-agron-green px-3 py-1.5 rounded-lg transition-colors">
            <Download class="w-3.5 h-3.5" /> Exportar CSV
          </button>
          <button @click="clearData" class="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors">
            <Trash2 class="w-3.5 h-3.5" /> Limpiar
          </button>
        </div>
      </div>

      <!-- Resumen estadístico -->
      <Card v-if="numericSummary.length > 0">
        <template #header>
          <h3 class="font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 class="w-4 h-4 text-agron-green" /> Resumen Estadístico
          </h3>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th class="pb-3 pr-4">Columna</th>
                <th class="pb-3 pr-4">Mínimo</th>
                <th class="pb-3 pr-4">Máximo</th>
                <th class="pb-3 pr-4">Promedio</th>
                <th class="pb-3">Registros</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="s in numericSummary" :key="s.col" class="hover:bg-gray-50 transition-colors">
                <td class="py-2.5 pr-4 font-semibold text-gray-800">{{ s.col }}</td>
                <td class="py-2.5 pr-4 text-blue-600 font-mono">{{ s.min }}</td>
                <td class="py-2.5 pr-4 text-orange-600 font-mono">{{ s.max }}</td>
                <td class="py-2.5 pr-4 text-agron-green font-mono font-semibold">{{ s.avg }}</td>
                <td class="py-2.5 text-gray-500">{{ s.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <!-- Tabla de datos -->
      <Card>
        <template #header>
          <div class="flex justify-between items-center">
            <h3 class="font-semibold text-gray-900">Vista Previa de Datos</h3>
            <span class="text-xs text-gray-400">Mostrando hasta 500 filas</span>
          </div>
        </template>
        <DataTable :data="tableData" />
      </Card>
    </template>
  </div>
</template>
