import { createRouter, createWebHistory } from 'vue-router'
import { useMainStore } from '../stores'

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
      component: () => import('../views/HomeView.vue')
    },
    {
      path: '/mapas',
      name: 'maps',
      component: () => import('../views/MapsView.vue')
    },
    {
      path: '/dashboards',
      name: 'dashboards',
      component: () => import('../views/DashboardsView.vue')
    },
    {
      path: '/datos',
      name: 'data',
      component: () => import('../views/DataView.vue')
    },
    {
      path: '/simulacion',
      name: 'simulation',
      component: () => import('../views/SimulationView.vue')
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const store = useMainStore()
  // Esperar a que se cargue el estado inicial si es necesario
  if (store.loading) {
    await store.checkAuth()
  }

  if (!to.meta.public && !store.user) {
    next('/login')
  } else if (to.meta.public && store.user) {
    next('/')
  } else {
    next()
  }
})

export default router
