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

  if (to.meta.requiresAuth && !store.user) {
    return { name: 'login' }
  }

  if (to.meta.public && store.user) {
    return { name: 'home' }
  }

  return true
})

export default router