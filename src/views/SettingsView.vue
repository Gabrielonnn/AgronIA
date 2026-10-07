<script setup lang="ts">
import { ref } from 'vue'
import { useMainStore } from '../stores'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import {
  User, Settings2, ShieldCheck, Bell, Globe,
  Save, Eye, EyeOff
} from 'lucide-vue-next'

const store = useMainStore()

// ============================================================
// Tabs
// ============================================================
type Tab = 'account' | 'preferences'
const activeTab = ref<Tab>('account')

const tabs = [
  { id: 'account' as Tab, label: 'Mi Cuenta', icon: User },
  { id: 'preferences' as Tab, label: 'Preferencias', icon: Settings2 },
]

// ============================================================
// CUENTA
// ============================================================
const displayName = ref('Agricultor AgronIA')
const accountEmail = ref(store.user?.email || 'demo@agronia.com')
const newPassword = ref('')
const showPassword = ref(false)
const saveAccountMsg = ref('')

const saveAccount = () => {
  saveAccountMsg.value = 'Cambios guardados correctamente.'
  setTimeout(() => { saveAccountMsg.value = '' }, 3000)
}

// Nivel de acceso para info
type Role = 'cliente' | 'administrador' | 'tecnico'
const roleLabels: Record<Role, string> = {
  cliente: 'Cliente',
  administrador: 'Administrador',
  tecnico: 'Técnico',
}

// ============================================================
// PREFERENCIAS
// ============================================================
const prefs = ref({
  lang: 'es',
  units: 'metric',
  notifications: true,
  emailAlerts: true,
  alertThresholdHumidity: 40,
  alertThresholdPest: 25,
  mapDefault: 'satellite',
  autoRefresh: true,
})
const savePrefsMsg = ref('')

const savePrefs = () => {
  savePrefsMsg.value = 'Preferencias guardadas.'
  setTimeout(() => { savePrefsMsg.value = '' }, 3000)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Configuración</h1>
      <p class="text-gray-500 mt-1">Administra tu cuenta personal y preferencias del sistema.</p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
      <button
        v-for="tab in tabs" :key="tab.id"
        @click="activeTab = tab.id"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="activeTab === tab.id
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ============================= MI CUENTA ============================= -->
    <transition name="page" mode="out-in">
      <div v-if="activeTab === 'account'" class="space-y-5">
        <Card>
          <template #header>
            <h3 class="font-semibold text-gray-900 flex items-center gap-2">
              <User class="w-4 h-4 text-agron-green" /> Información Personal
            </h3>
          </template>
          <div class="space-y-4 max-w-md">
            <div v-if="saveAccountMsg" class="p-3 bg-agron-green-light text-agron-green-dark rounded-lg text-sm font-medium">
              {{ saveAccountMsg }}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input v-model="displayName" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green focus:border-agron-green outline-none transition-colors text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
              <input v-model="accountEmail" type="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green focus:border-agron-green outline-none transition-colors text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
              <div class="relative">
                <input v-model="newPassword" :type="showPassword ? 'text' : 'password'" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green focus:border-agron-green outline-none transition-colors text-sm pr-10" placeholder="••••••••" />
                <button @click="showPassword = !showPassword" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <Eye v-if="!showPassword" class="w-4 h-4" />
                  <EyeOff v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
            <Button variant="primary" size="sm" @click="saveAccount">
              <Save class="w-4 h-4 mr-2" /> Guardar Cambios
            </Button>
          </div>
        </Card>

        <Card>
          <template #header>
            <h3 class="font-semibold text-gray-900 flex items-center gap-2">
              <ShieldCheck class="w-4 h-4 text-agron-green" /> Nivel de Acceso
            </h3>
          </template>
          <div class="space-y-3">
            <div v-for="role in (['cliente', 'administrador', 'tecnico'] as Role[])" :key="role"
              class="flex items-start gap-4 p-4 rounded-xl border"
              :class="role === 'administrador' ? 'border-agron-green bg-agron-green-light/50' : 'border-gray-100 bg-gray-50'">
              <div class="mt-0.5">
                <ShieldCheck class="w-5 h-5" :class="role === 'administrador' ? 'text-agron-green' : 'text-gray-400'" />
              </div>
              <div>
                <h4 class="font-semibold text-gray-900 capitalize">{{ roleLabels[role] }}</h4>
                <p class="text-sm text-gray-500 mt-0.5">
                  <template v-if="role === 'cliente'">Visualiza dashboards, mapas y datos de sus parcelas asignadas.</template>
                  <template v-if="role === 'administrador'">Acceso total: gestión de usuarios, parcelas, simulación y configuración.</template>
                  <template v-if="role === 'tecnico'">Puede ejecutar simulaciones, analizar campos y gestionar misiones de dron.</template>
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </transition>

    <!-- ============================= PREFERENCIAS ============================= -->
    <transition name="page" mode="out-in">
      <div v-if="activeTab === 'preferences'" class="space-y-5">
        <Card>
          <template #header>
            <h3 class="font-semibold text-gray-900 flex items-center gap-2">
              <Globe class="w-4 h-4 text-agron-green" /> Idioma y Unidades
            </h3>
          </template>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-xl">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
              <select v-model="prefs.lang" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm bg-white">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Sistema de Unidades</label>
              <select v-model="prefs.units" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm bg-white">
                <option value="metric">Métrico (°C, km, ha)</option>
                <option value="imperial">Imperial (°F, mi, acre)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Vista de Mapa Predeterminada</label>
              <select v-model="prefs.mapDefault" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm bg-white">
                <option value="satellite">Satelital</option>
                <option value="terrain">Terreno</option>
                <option value="street">Calles</option>
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <template #header>
            <h3 class="font-semibold text-gray-900 flex items-center gap-2">
              <Bell class="w-4 h-4 text-agron-green" /> Notificaciones y Alertas
            </h3>
          </template>
          <div class="space-y-5 max-w-xl">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium text-gray-900 text-sm">Notificaciones push</p>
                <p class="text-xs text-gray-500">Recibe alertas en el navegador</p>
              </div>
              <button
                @click="prefs.notifications = !prefs.notifications"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="prefs.notifications ? 'bg-agron-green' : 'bg-gray-200'"
              >
                <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  :class="prefs.notifications ? 'translate-x-6' : 'translate-x-1'"></span>
              </button>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium text-gray-900 text-sm">Alertas por correo</p>
                <p class="text-xs text-gray-500">Resumen diario de estado del campo</p>
              </div>
              <button
                @click="prefs.emailAlerts = !prefs.emailAlerts"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="prefs.emailAlerts ? 'bg-agron-green' : 'bg-gray-200'"
              >
                <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  :class="prefs.emailAlerts ? 'translate-x-6' : 'translate-x-1'"></span>
              </button>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium text-gray-900 text-sm">Actualización automática</p>
                <p class="text-xs text-gray-500">Refrescar datos sin intervención</p>
              </div>
              <button
                @click="prefs.autoRefresh = !prefs.autoRefresh"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="prefs.autoRefresh ? 'bg-agron-green' : 'bg-gray-200'"
              >
                <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  :class="prefs.autoRefresh ? 'translate-x-6' : 'translate-x-1'"></span>
              </button>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Umbral de alerta — Humedad mínima: <span class="text-agron-green font-bold">{{ prefs.alertThresholdHumidity }}%</span>
              </label>
              <input v-model="prefs.alertThresholdHumidity" type="range" min="10" max="80" step="5" class="w-full accent-agron-green" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Umbral de alerta — Índice de plagas: <span class="text-agron-alert font-bold">{{ prefs.alertThresholdPest }}%</span>
              </label>
              <input v-model="prefs.alertThresholdPest" type="range" min="5" max="80" step="5" class="w-full accent-agron-green" />
            </div>
          </div>
        </Card>

        <div class="flex items-center gap-3">
          <Button variant="primary" @click="savePrefs">
            <Save class="w-4 h-4 mr-2" /> Guardar Preferencias
          </Button>
          <span v-if="savePrefsMsg" class="text-sm text-agron-green font-medium">{{ savePrefsMsg }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>
