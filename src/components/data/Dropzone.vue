<script setup lang="ts">
import { ref } from 'vue'
import { UploadCloud } from 'lucide-vue-next'
import Papa from 'papaparse'

const emit = defineEmits<{
  (e: 'data-loaded', data: any[]): void
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = true
}

const onDragLeave = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
}

const onDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFile(files[0])
  }
}

const onFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    handleFile(target.files[0])
  }
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFile = (file: File) => {
  if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        emit('data-loaded', results.data)
      },
      error: (err) => {
        console.error('Error parseando CSV:', err)
        alert('Error al leer el archivo CSV')
      }
    })
  } else {
    alert('Por favor, sube un archivo CSV.')
  }
}
</script>

<template>
  <div 
    class="border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer"
    :class="isDragging ? 'border-agron-green bg-agron-green-light/20' : 'border-gray-300 hover:border-agron-green hover:bg-gray-50'"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @click="triggerFileInput"
  >
    <input 
      type="file" 
      ref="fileInput" 
      class="hidden" 
      accept=".csv"
      @change="onFileChange"
    >
    <div class="flex flex-col items-center justify-center space-y-4">
      <div class="p-4 bg-agron-green-light rounded-full text-agron-green-dark">
        <UploadCloud class="w-8 h-8" />
      </div>
      <div>
        <p class="text-lg font-medium text-gray-900">Haz clic para subir o arrastra y suelta</p>
        <p class="text-sm text-gray-500 mt-1">Soporta archivos CSV de datos meteorológicos o de sensores</p>
      </div>
    </div>
  </div>
</template>
