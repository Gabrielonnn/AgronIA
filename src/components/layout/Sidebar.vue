<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Home, Map, PieChart, Database, Settings, LogOut, MonitorPlay } from 'lucide-vue-next'
import { useMainStore } from '../../stores'

const route = useRoute()
const router = useRouter()
const store = useMainStore()

const menuItems = [
  { name: 'Inicio', path: '/', icon: Home },
  { name: 'Mapas', path: '/mapas', icon: Map },
  { name: 'Dashboards', path: '/dashboards', icon: PieChart },
  { name: 'Datos', path: '/datos', icon: Database },
  { name: 'Simulación', path: '/simulacion', icon: MonitorPlay },
  { name: 'Configuración', path: '/configuracion', icon: Settings },
]

const isActive = (path: string) => route.path === path

const handleLogout = async () => {
  await store.signOut()
  router.push('/login')
}
</script>

<template>
  <aside class="w-64 bg-white border-r border-gray-200 h-screen flex flex-col">
    <div class="h-16 flex items-center px-6 border-b border-gray-100">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded bg-agron-green flex items-center justify-center">
          <span class="text-white font-bold text-xl leading-none">A</span>
        </div>
        <span class="text-xl font-bold text-gray-900 tracking-tight">AgronIA</span>
      </div>
    </div>
    
    <nav class="flex-1 overflow-y-auto py-4">
      <ul class="space-y-1 px-3">
        <li v-for="item in menuItems" :key="item.path">
          <RouterLink
            :to="item.path"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors font-medium text-sm"
            :class="isActive(item.path) 
              ? 'bg-agron-green-light text-agron-green-dark' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
          >
            <component :is="item.icon" class="w-5 h-5" :class="isActive(item.path) ? 'text-agron-green' : 'text-gray-400'" />
            {{ item.name }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    
    <div class="p-4 border-t border-gray-100">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-agron-green-light flex items-center justify-center">
          <span class="text-sm font-medium text-agron-green-dark">US</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900 truncate">Agricultor</p>
          <p class="text-xs text-gray-500 truncate" :title="store.user?.email">{{ store.user?.email || 'demo@agronia.com' }}</p>
        </div>
      </div>
      <button @click="handleLogout" class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-agron-danger rounded-lg transition-colors">
        <LogOut class="w-4 h-4" />
        Cerrar Sesión
      </button>
    </div>
  </aside>
</template>
