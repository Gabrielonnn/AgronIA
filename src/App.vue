<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useMainStore } from './stores'
import Sidebar from './components/layout/Sidebar.vue'
import { Menu, X } from 'lucide-vue-next'

const route = useRoute()
const store = useMainStore()
const mobileMenuOpen = ref(false)

onMounted(() => {
  store.checkAuth()
})

// Cerrar el menú al cambiar de ruta
watch(() => route.path, () => {
  mobileMenuOpen.value = false
})
</script>

<template>
  <div v-if="store.loading" class="min-h-screen flex items-center justify-center bg-agron-bg-alt">
    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-agron-green"></div>
  </div>
  
  <div v-else class="min-h-screen bg-agron-bg-alt flex flex-col md:flex-row relative overflow-hidden">
    <!-- Header Móvil -->
    <div v-if="!route.meta.public" class="md:hidden flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3 z-30 relative shadow-sm">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-agron-green flex items-center justify-center shadow-sm">
          <span class="text-white font-bold text-lg leading-none">A</span>
        </div>
        <div>
          <span class="text-lg font-bold text-gray-900 tracking-tight leading-tight block">AgronIA</span>
        </div>
      </div>
      <button @click="mobileMenuOpen = !mobileMenuOpen" class="text-gray-600 hover:text-agron-green transition-colors p-1 bg-gray-100 rounded-md">
        <Menu v-if="!mobileMenuOpen" class="w-6 h-6" />
        <X v-else class="w-6 h-6" />
      </button>
    </div>

    <!-- Overlay para móvil -->
    <transition name="fade">
      <div v-if="mobileMenuOpen && !route.meta.public" @click="mobileMenuOpen = false" class="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"></div>
    </transition>

    <!-- Sidebar Wrapper -->
    <div v-if="!route.meta.public" 
         :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'" 
         class="fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:relative md:translate-x-0 shadow-2xl md:shadow-none">
      <Sidebar />
    </div>

    <!-- Main Content -->
    <main class="flex-1 h-[calc(100vh-61px)] md:h-screen overflow-y-auto w-full" :class="{ 'p-4 md:p-6': !route.meta.public }">
      <RouterView v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
  </div>
</template>
