<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import Button from '../ui/Button.vue'

const props = defineProps<{
  data: any[]
}>()

const itemsPerPage = 10
const currentPage = ref(1)

const totalPages = computed(() => Math.ceil(props.data.length / itemsPerPage))

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return props.data.slice(start, end)
})

const columns = computed(() => {
  if (props.data.length > 0) {
    return Object.keys(props.data[0])
  }
  return []
})

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}
</script>

<template>
  <div class="w-full">
    <div v-if="data.length === 0" class="text-center p-8 text-gray-500">
      No hay datos para mostrar.
    </div>
    
    <div v-else class="flex flex-col">
      <div class="overflow-x-auto rounded-lg border border-gray-200">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th v-for="col in columns" :key="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {{ col }}
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="(row, index) in paginatedData" :key="index" class="hover:bg-gray-50 transition-colors">
              <td v-for="col in columns" :key="col" class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ row[col] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between mt-4 px-2">
        <p class="text-sm text-gray-700">
          Mostrando <span class="font-medium">{{ ((currentPage - 1) * itemsPerPage) + 1 }}</span> a 
          <span class="font-medium">{{ Math.min(currentPage * itemsPerPage, data.length) }}</span> 
          de <span class="font-medium">{{ data.length }}</span> resultados
        </p>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" :disabled="currentPage === 1" @click="prevPage">
            <ChevronLeft class="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" :disabled="currentPage === totalPages" @click="nextPage">
            <ChevronRight class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
