<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Home, Map, MapPin, PieChart, Database, Settings, LogOut, MonitorPlay, Search, ShieldCheck, Users, X } from 'lucide-vue-next'
import { useMainStore } from '../../stores'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const route = useRoute()
const router = useRouter()
const store = useMainStore()
const menuSearch = ref('')
const menuSearchInput = ref<HTMLInputElement | null>(null)

const userEmail = computed(() => store.user?.email || 'demo@agronia.com')
const userRole = computed(() => {
  const profileRole = store.user?.profile?.role
  const metadataRole = store.user?.user_metadata?.role
  if (profileRole === 'administrador' || metadataRole === 'administrador' || userEmail.value === 'jenone0424@gmail.com') return 'Administrador'
  if (profileRole === 'tecnico' || metadataRole === 'tecnico') return 'Técnico'
  const role = profileRole || metadataRole || 'cliente'
  return role.charAt(0).toUpperCase() + role.slice(1)
})

const menuItems = computed(() => [
  { name: 'Inicio', path: '/', icon: Home, group: 'OPERACIÓN', accent: 'green' },
  { name: 'Mapas', path: '/mapas', icon: Map, group: 'OPERACIÓN', accent: 'blue' },
  { name: 'Dashboards', path: '/dashboards', icon: PieChart, group: 'OPERACIÓN', accent: 'violet' },
  { name: 'Datos', path: '/datos', icon: Database, group: 'OPERACIÓN', accent: 'cyan' },
  { name: 'Simulación', path: '/simulacion', icon: MonitorPlay, group: 'OPERACIÓN', accent: 'gold' },
  { name: 'Usuarios', path: '/usuarios', icon: Users, group: 'GESTIÓN', accent: 'pink' },
  { name: 'Parcelas', path: '/parcelas', icon: MapPin, group: 'GESTIÓN', accent: 'orange' },
  { name: 'Configuración', path: '/configuracion', icon: Settings, group: 'GESTIÓN', accent: 'slate' },
].filter(item => item.path !== '/usuarios' || userRole.value === 'Administrador'))

const isActive = (path: string) => route.path === path
const menuGroups = computed(() => {
  const query = menuSearch.value.trim().toLocaleLowerCase()
  return ['OPERACIÓN', 'GESTIÓN'].map(name => ({
    name,
    items: menuItems.value.filter(item =>
      item.group === name && (!query || item.name.toLocaleLowerCase().includes(query))
    )
  })).filter(group => group.items.length > 0)
})

const handleMenuShortcut = (event: KeyboardEvent) => {
  const target = event.target
  const isTyping = target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'))

  if (event.key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    menuSearchInput.value?.focus()
  } else if (event.key === 'Escape' && document.activeElement === menuSearchInput.value) {
    menuSearch.value = ''
    menuSearchInput.value?.blur()
  }
}

onMounted(() => window.addEventListener('keydown', handleMenuShortcut))
onUnmounted(() => window.removeEventListener('keydown', handleMenuShortcut))

const handleLogout = async () => {
  await store.signOut()
  router.push('/login')
}

// Iniciales del usuario
const userInitials = computed(() => {
  const name = store.user?.user_metadata?.full_name
    || store.user?.user_metadata?.name
    || store.user?.profile?.full_name
    || store.user?.email
    || 'A'
  return name.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase()
})

const userDisplayName = computed(() => {
  const metadata = store.user?.user_metadata
  const profile = store.user?.profile
  return metadata?.full_name
    || metadata?.name
    || profile?.full_name
    || profile?.name
    || userEmail.value
})

const roleColor = computed(() => {
  if (userRole.value === 'Administrador') return 'text-purple-600'
  if (userRole.value === 'Técnico') return 'text-orange-600'
  return 'text-blue-600'
})
</script>

<template>
  <aside class="app-sidebar topo-sidebar w-64 bg-white border-r border-gray-200 h-screen flex flex-col" aria-label="Navegación principal">
    <div class="topo-brand h-16 flex items-center px-6 border-b border-gray-100">
      <div class="topo-brand-content flex items-center gap-2">
        <div class="topo-brand-mark w-8 h-8 rounded-lg bg-agron-green flex items-center justify-center shadow-sm">
          <span class="text-white font-bold text-xl leading-none">A</span>
        </div>
        <div class="topo-brand-copy">
          <span class="topo-brand-name text-xl font-bold text-gray-900 tracking-tight">AgronIA</span>
          <span class="block text-[10px] text-gray-400 leading-none -mt-0.5">Agricultura de Precisión</span>
        </div>
      </div>
      <span class="topo-brand-version">FIELD</span>
    </div>
    
    <nav class="topo-navigation flex-1 overflow-y-auto py-4" aria-label="Secciones de AgronIA">
      <label class="topo-menu-search">
        <Search :size="15" aria-hidden="true" />
        <input ref="menuSearchInput" v-model="menuSearch" type="search" placeholder="Filtrar secciones" aria-label="Filtrar secciones del menú" />
        <button v-if="menuSearch" type="button" aria-label="Limpiar búsqueda" @click="menuSearch = ''">
          <X :size="14" />
        </button>
        <kbd v-else>/</kbd>
      </label>

      <section v-for="group in menuGroups" :key="group.name" class="topo-menu-group">
        <p class="topo-menu-title text-[10px] font-bold text-gray-400 uppercase tracking-widest px-6 mb-2">{{ group.name }}</p>
        <ul class="space-y-0.5 px-3">
          <li v-for="item in group.items" :key="item.path">
            <RouterLink
              :to="item.path"
              class="topo-menu-link flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm"
              :class="[`menu-accent-${item.accent}`, { 'is-current': isActive(item.path) }]"
            >
              <span class="topo-menu-icon-wrap">
                <component :is="item.icon" class="topo-menu-icon w-5 h-5 flex-shrink-0" />
              </span>
              <span class="topo-menu-label">{{ item.name }}</span>
              <span v-if="isActive(item.path)" class="topo-menu-indicator ml-auto w-1.5 h-1.5 rounded-full" aria-hidden="true"></span>
            </RouterLink>
          </li>
        </ul>
      </section>
      <p v-if="menuGroups.length === 0" class="topo-menu-empty">No se encontraron secciones.</p>
    </nav>
    
    <div class="topo-account-area p-4 border-t border-gray-100">
      <div class="topo-user-card flex items-center gap-3 mb-3 p-2 rounded-lg bg-gray-50">
        <div class="topo-user-avatar w-9 h-9 rounded-full bg-agron-green flex items-center justify-center flex-shrink-0">
          <span class="text-xs font-bold text-white">{{ userInitials }}</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="topo-user-name text-xs font-bold truncate">{{ userDisplayName }}</p>
          <p class="topo-user-roleline text-xs truncate">
            <ShieldCheck class="topo-role-icon" :class="roleColor" />
            <span>{{ userRole }}</span>
          </p>
          <p class="topo-user-email text-xs truncate" :title="userEmail">{{ userEmail }}</p>
        </div>
      </div>
      <button
        @click="handleLogout"
        class="topo-logout w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-agron-danger rounded-lg transition-colors"
        aria-label="Cerrar sesión"
      >
        <LogOut class="w-4 h-4" />
        Cerrar Sesión
      </button>
      <p class="topo-account-caption">Agricultura inteligente, en tiempo real</p>
    </div>
  </aside>
</template>
