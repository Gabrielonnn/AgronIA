<script setup lang="ts">
import { ref } from 'vue'
import Dropzone from '../components/data/Dropzone.vue'
import DataTable from '../components/data/DataTable.vue'
import Card from '../components/ui/Card.vue'

const tableData = ref<any[]>([])

const handleDataLoaded = (data: any[]) => {
  tableData.value = data
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Gestión de Registros</h1>
      <p class="text-gray-500 mt-1">Carga y visualiza datasets meteorológicos y reportes de campo.</p>
    </div>

    <Card>
      <template #header>
        <h3 class="font-semibold text-gray-900">Cargar Archivo de Datos</h3>
      </template>
      <Dropzone @data-loaded="handleDataLoaded" />
    </Card>

    <Card v-if="tableData.length > 0">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="font-semibold text-gray-900">Vista Previa de Datos</h3>
          <span class="bg-agron-green-light text-agron-green-dark text-xs px-2 py-1 rounded-full font-medium">
            {{ tableData.length }} registros
          </span>
        </div>
      </template>
      <DataTable :data="tableData" />
    </Card>
  </div>
</template>
