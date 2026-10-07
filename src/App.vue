<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useMainStore } from './stores'
import Sidebar from './components/layout/Sidebar.vue'

const route = useRoute()
const store = useMainStore()

onMounted(() => {
  store.checkAuth()
})
</script>

<template>
  <div v-if="store.loading" class="min-h-screen flex items-center justify-center bg-agron-bg-alt">
    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-agron-green"></div>
  </div>
  <div v-else class="min-h-screen bg-agron-bg-alt flex">
    <Sidebar v-if="!route.meta.public" />
    <main class="flex-1 h-screen overflow-y-auto" :class="{ 'p-6': !route.meta.public }">
      <RouterView v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
  </div>
</template>
