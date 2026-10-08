import { createRouter, createWebHistory } from 'vue-router'
import { useMainStore } from '../stores'
import { isSupabaseConfigured } from '../services/supabase'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/registro',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/mapas',
      name: 'maps',
      component: () => import('../views/MapsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/dashboards',
      name: 'dashboards',
      component: () => import('../views/DashboardsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/datos',
      name: 'data',
      component: () => import('../views/DataView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/simulacion',
      name: 'simulation',
      component: () => import('../views/SimulationView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/configuracion',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/usuarios',
      name: 'users',
      component: () => import('../views/UsersView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/parcelas',
      name: 'parcels',
      component: () => import('../views/ParcelsView.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach(async (to) => {
  const store = useMainStore()

  if (!store.initialized) {
    await store.init()
  }

  if (!isSupabaseConfigured) {
    if (to.meta.requiresAuth) {
      return { name: 'login' }
    }
    return true
  }

  if (to.meta.requiresAdmin) {
    const profileRole = store.user?.profile?.role
    const metadataRole = store.user?.user_metadata?.role
    const isAdmin = profileRole === 'administrador' || metadataRole === 'administrador' || store.user?.email === 'jenone0424@gmail.com'
    if (!isAdmin) return { name: 'home' }
  }

  if (to.meta.requiresAuth && !store.user) {
    return { name: 'login' }
  }

  if (to.meta.public && store.user) {
    return { name: 'home' }
  }

  return true
})

export default router