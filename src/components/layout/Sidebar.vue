<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Home, Map, MapPin, PieChart, Database, Settings, LogOut, MonitorPlay, ShieldCheck, Users, ScanSearch, Sprout } from 'lucide-vue-next'
import { useMainStore } from '../../stores'
import { supabase } from '../../services/supabase'
import { computed } from 'vue'
import agroniaLogo from '../../assets/agronia-logo.png'

const route = useRoute()
const router = useRouter()
const store = useMainStore()

const userEmail = computed(() => store.user?.email || 'demo@agronia.com')
const avatarUrl = computed(() => {
  const path = store.user?.profile?.avatar_path
  if (path && supabase) return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
  return store.user?.user_metadata?.avatar_url || ''
})
const userRole = computed(() => {
  const profileRole = store.user?.profile?.role
  if (profileRole === 'administrador' && store.user?.profile?.active) return 'Administrador'
  if (profileRole === 'tecnico') return 'Técnico'
  const role = profileRole || 'cliente'
  return role.charAt(0).toUpperCase() + role.slice(1)
})

const menuItems = computed(() => [
  { name: 'Inicio', path: '/', icon: Home, group: 'OPERACIÓN', accent: 'green' },
  { name: 'Mapas', path: '/mapas', icon: Map, group: 'OPERACIÓN', accent: 'blue' },
  { name: 'Dashboards', path: '/dashboards', icon: PieChart, group: 'OPERACIÓN', accent: 'violet' },
  { name: 'Datos', path: '/datos', icon: Database, group: 'OPERACIÓN', accent: 'cyan' },
  { name: 'Análisis IA', path: '/analisis', icon: ScanSearch, group: 'OPERACIÓN', accent: 'indigo' },
  { name: 'Diagnóstico', path: '/diagnostico', icon: ScanSearch, group: 'OPERACIÓN', accent: 'lime' },
  { name: 'Simulación', path: '/simulacion', icon: MonitorPlay, group: 'OPERACIÓN', accent: 'gold' },
  { name: 'Usuarios', path: '/usuarios', icon: Users, group: 'GESTIÓN', accent: 'pink' },
  { name: 'Parcelas', path: '/parcelas', icon: MapPin, group: 'GESTIÓN', accent: 'orange' },
  { name: 'Campos y registros', path: '/campos', icon: Sprout, group: 'GESTIÓN', accent: 'teal' },
  { name: 'Configuración', path: '/configuracion', icon: Settings, group: 'GESTIÓN', accent: 'rose' },
].filter(item => item.path !== '/usuarios' || userRole.value === 'Administrador'))

const isActive = (path: string) => route.path === path
const menuGroups = computed(() => {
  return ['OPERACIÓN', 'GESTIÓN'].map(name => ({
    name,
    items: menuItems.value.filter(item => item.group === name)
  }))
})

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

const sidebarDrones = ['gold', 'orange', 'green', 'lime', 'teal']
</script>

<template>
  <aside class="app-sidebar topo-sidebar w-64 bg-white border-r border-gray-200 h-screen flex flex-col" aria-label="Navegación principal">
    <div class="topo-drone-scene" aria-hidden="true">
      <svg
        v-for="drone in sidebarDrones"
        :key="drone"
        class="topo-drone"
        :class="`topo-drone-${drone}`"
        viewBox="0 0 64 32"
        fill="none"
      >
        <ellipse class="topo-drone-rotor" cx="12" cy="10" rx="10" ry="2" fill="currentColor" opacity="0.62" />
        <ellipse class="topo-drone-rotor" cx="52" cy="10" rx="10" ry="2" fill="currentColor" opacity="0.62" />
        <path d="M24 14 12 10m28 4 12-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        <rect x="24" y="12" width="16" height="8" rx="3" fill="#17200f" stroke="currentColor" stroke-width="1.5" />
        <circle cx="32" cy="22" r="3" fill="currentColor" />
        <circle class="topo-drone-beacon" cx="32" cy="22" r="6" fill="currentColor" />
      </svg>
    </div>
    <div class="topo-brand h-16 flex items-center px-6 border-b border-gray-100">
      <div class="topo-brand-content flex items-center">
        <img class="topo-brand-logo" :src="agroniaLogo" alt="AgronIA" />
      </div>
      <span class="topo-brand-version">FIELD</span>
    </div>
    
    <nav class="topo-navigation flex-1 overflow-y-auto py-4" aria-label="Secciones de AgronIA">
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
    </nav>
    
    <div class="topo-account-area p-4 border-t border-gray-100">
      <div class="topo-user-card flex items-center gap-3 mb-3 p-2 rounded-lg bg-gray-50">
        <div class="topo-user-avatar w-9 h-9 rounded-full bg-agron-green flex items-center justify-center flex-shrink-0">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="`Foto de perfil de ${userDisplayName}`"
            class="h-full w-full rounded-full object-cover"
          />
          <span v-else class="text-xs font-bold text-white">{{ userInitials }}</span>
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
