<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Home, Map, MapPin, PieChart, Database, Settings, LogOut, MonitorPlay, ShieldCheck, Users } from 'lucide-vue-next'
import { useMainStore } from '../../stores'
import { computed } from 'vue'

const route = useRoute()
const router = useRouter()
const store = useMainStore()

const menuItems = computed(() => {
  const items = [
    { name: 'Inicio', path: '/', icon: Home },
    { name: 'Mapas', path: '/mapas', icon: Map },
    { name: 'Dashboards', path: '/dashboards', icon: PieChart },
    { name: 'Datos', path: '/datos', icon: Database },
    { name: 'Simulación', path: '/simulacion', icon: MonitorPlay },
    { name: 'Parcelas', path: '/parcelas', icon: MapPin },
    { name: 'Configuración', path: '/configuracion', icon: Settings },
  ]
  if (userRole.value === 'Administrador') {
    items.splice(5, 0, { name: 'Usuarios', path: '/usuarios', icon: Users })
  }
  return items
})

const isActive = (path: string) => route.path === path

const handleLogout = async () => {
  await store.signOut()
  router.push('/login')
}

// Iniciales del usuario
const userInitials = computed(() => {
  const email = store.user?.email || 'A'
  return email.substring(0, 2).toUpperCase()
})

const userEmail = computed(() => store.user?.email || 'demo@agronia.com')

const userRole = computed(() => {
  const profileRole = store.user?.profile?.role
  const metadataRole = store.user?.user_metadata?.role
  if (profileRole === 'administrador' || metadataRole === 'administrador' || userEmail.value === 'jenone0424@gmail.com') return 'Administrador'
  if (profileRole === 'tecnico' || metadataRole === 'tecnico') return 'Técnico'
  const role = profileRole || metadataRole || 'cliente'
  return role.charAt(0).toUpperCase() + role.slice(1)
})

const roleColor = computed(() => {
  if (userRole.value === 'Administrador') return 'text-purple-600'
  if (userRole.value === 'Técnico') return 'text-orange-600'
  return 'text-blue-600'
})
</script>

<template>
  <aside class="w-64 bg-white border-r border-gray-200 h-screen flex flex-col">
    <!-- Logo -->
    <div class="h-16 flex items-center px-6 border-b border-gray-100">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-agron-green flex items-center justify-center shadow-sm">
          <span class="text-white font-bold text-xl leading-none">A</span>
        </div>
        <div>
          <span class="text-xl font-bold text-gray-900 tracking-tight">AgronIA</span>
          <span class="block text-[10px] text-gray-400 leading-none -mt-0.5">Agricultura de Precisión</span>
        </div>
      </div>
    </div>
    
    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto py-4">
      <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-6 mb-2">Menú Principal</p>
      <ul class="space-y-0.5 px-3">
        <li v-for="item in menuItems" :key="item.path">
          <RouterLink
            :to="item.path"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm"
            :class="isActive(item.path) 
              ? 'bg-agron-green-light text-agron-green-dark shadow-sm' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
          >
            <component
              :is="item.icon"
              class="w-5 h-5 flex-shrink-0"
              :class="isActive(item.path) ? 'text-agron-green' : 'text-gray-400'"
            />
            {{ item.name }}
            <!-- Indicador activo -->
            <span v-if="isActive(item.path)" class="ml-auto w-1.5 h-1.5 rounded-full bg-agron-green"></span>
          </RouterLink>
        </li>
      </ul>
    </nav>
    
    <!-- User info + logout -->
    <div class="p-4 border-t border-gray-100">
      <div class="flex items-center gap-3 mb-3 p-2 rounded-lg bg-gray-50">
        <div class="w-9 h-9 rounded-full bg-agron-green flex items-center justify-center flex-shrink-0">
          <span class="text-xs font-bold text-white">{{ userInitials }}</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1">
            <ShieldCheck class="w-3 h-3 flex-shrink-0" :class="roleColor" />
            <p class="text-xs font-bold truncate" :class="roleColor">{{ userRole }}</p>
          </div>
          <p class="text-xs text-gray-500 truncate" :title="userEmail">{{ userEmail }}</p>
        </div>
      </div>
      <button
        @click="handleLogout"
        class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-agron-danger rounded-lg transition-colors"
      >
        <LogOut class="w-4 h-4" />
        Cerrar Sesión
      </button>
    </div>
  </aside>
</template>
