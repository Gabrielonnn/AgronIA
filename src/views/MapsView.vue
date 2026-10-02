<script setup lang="ts">
import { ref } from 'vue'
import AgroMap from '../components/map/AgroMap.vue'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import { Save, Download } from 'lucide-vue-next'

const geojsonData = ref<any>(null)

const handleGeoJsonUpdate = (data: any) => {
  geojsonData.value = data
  console.log('GeoJSON actualizado:', data)
}

const saveMapData = () => {
  if (!geojsonData.value) return
  // Lógica para guardar en Supabase en el futuro
  alert('Datos GeoJSON guardados (Simulación). Revisa la consola.')
}
</script>

<template>
  <div class="h-full flex flex-col gap-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Visor Satelital</h1>
        <p class="text-gray-500 mt-1">Dibuja parcelas y zonas de exclusión sobre el mapa satelital.</p>
      </div>
      <div class="flex gap-3">
        <Button variant="outline" size="sm">
          <Download class="w-4 h-4 mr-2" />
          Exportar
        </Button>
        <Button variant="primary" size="sm" @click="saveMapData">
          <Save class="w-4 h-4 mr-2" />
          Guardar Cambios
        </Button>
      </div>
    </div>

    <div class="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[500px]">
      <div class="lg:col-span-3">
        <AgroMap @update:geojson="handleGeoJsonUpdate" />
      </div>
      
      <div class="lg:col-span-1 space-y-6">
        <Card>
          <template #header>
            <h3 class="font-semibold text-gray-900">Datos Espaciales</h3>
          </template>
          <div class="text-sm text-gray-600">
            <p v-if="!geojsonData || !geojsonData.features || geojsonData.features.length === 0">
              No hay polígonos dibujados. Utiliza las herramientas del mapa para demarcar tu parcela.
            </p>
            <div v-else class="space-y-3">
              <p>Polígonos registrados: <span class="font-bold text-agron-green">{{ geojsonData.features.length }}</span></p>
              
              <div class="mt-4 bg-gray-50 p-3 rounded text-xs font-mono overflow-auto max-h-64 border border-gray-100">
                <pre>{{ JSON.stringify(geojsonData, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
