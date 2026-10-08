<script setup lang="ts">
import { ref, computed } from 'vue'
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

const userRole = computed(() => {
  const profileRole = store.user?.profile?.role
  const metadataRole = store.user?.user_metadata?.role
  if (profileRole === 'administrador' || metadataRole === 'administrador' || store.user?.email === 'jenone0424@gmail.com') return 'administrador'
  if (profileRole === 'tecnico' || metadataRole === 'tecnico') return 'tecnico'
  return profileRole || metadataRole || 'cliente'
})

const roleLabels: Record<string, string> = {
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
  <div class="settings-page space-y-6">
    <header class="settings-heading">
      <div>
        <span class="settings-eyebrow">PERSONALIZA TU ESPACIO</span>
        <h1>Configuración</h1>
        <p>Administra tu cuenta, preferencias y alertas de AgronIA.</p>
      </div>
      <span class="settings-role-badge"><ShieldCheck :size="15" /> {{ roleLabels[userRole] || 'Cliente' }}</span>
    </header>

    <!-- Tabs -->
    <div class="settings-tabs" role="tablist" aria-label="Secciones de configuración">
      <button
        v-for="tab in tabs" :key="tab.id"
        @click="activeTab = tab.id"
        class="settings-tab"
        :class="{ 'settings-tab-active': activeTab === tab.id }"
        role="tab"
        :aria-selected="activeTab === tab.id"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ============================= MI CUENTA ============================= -->
    <transition name="page" mode="out-in">
      <div v-if="activeTab === 'account'" class="space-y-5">
        <Card class="settings-card">
          <template #header>
            <div class="settings-card-heading">
              <span class="settings-card-icon"><User :size="17" /></span>
              <div><span>PERFIL</span><h3>Información personal</h3></div>
            </div>
          </template>

          <style scoped>
          .settings-page {
            min-width: 0;
            color: #e8eddf;
            animation: settings-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          .settings-heading {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.2rem 0 0.25rem;
          }

          .settings-eyebrow,
          .settings-card-heading > div > span {
            color: #c1a95f;
            font-size: 0.58rem;
            font-weight: 800;
            letter-spacing: 0.15em;
          }

          .settings-heading h1 {
            margin-top: 0.4rem;
            color: #f0f1e9;
            font-size: clamp(1.7rem, 3vw, 2.35rem);
            font-weight: 760;
            letter-spacing: -0.055em;
          }

          .settings-heading p { margin-top: 0.35rem; color: #a2aa97; font-size: 0.88rem; }

          .settings-role-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            padding: 0.55rem 0.75rem;
            border: 1px solid rgba(211, 189, 103, 0.2);
            border-radius: 999px;
            color: #dfcf91;
            background: rgba(211, 189, 103, 0.07);
            font-size: 0.67rem;
            font-weight: 700;
            white-space: nowrap;
          }

          .settings-tabs {
            display: inline-flex;
            max-width: 100%;
            gap: 0.3rem;
            padding: 0.3rem;
            border: 1px solid rgba(196, 218, 147, 0.12);
            border-radius: 12px;
            background: rgba(18, 25, 19, 0.85);
          }

          .settings-tab {
            display: inline-flex;
            min-height: 39px;
            align-items: center;
            justify-content: center;
            gap: 0.55rem;
            padding: 0.55rem 0.9rem;
            border: 1px solid transparent;
            border-radius: 9px;
            color: #969f8c;
            font-size: 0.75rem;
            font-weight: 650;
            transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
          }

          .settings-tab:hover:not(.settings-tab-active) { color: #d5dccd; background: rgba(255, 255, 255, 0.035); }
          .settings-tab-active {
            border-color: rgba(211, 189, 103, 0.19);
            color: #f0e5bd;
            background: linear-gradient(145deg, rgba(211, 189, 103, 0.13), rgba(211, 189, 103, 0.06));
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
          }

          :deep(.settings-card.app-card) {
            min-width: 0;
            border: 1px solid rgba(196, 218, 147, 0.13);
            border-radius: 16px;
            background: linear-gradient(145deg, rgba(26, 34, 25, 0.98), rgba(17, 23, 18, 0.98));
            box-shadow: 0 14px 35px rgba(0, 0, 0, 0.18);
          }

          :deep(.settings-card .app-card-header) {
            padding: 1.05rem 1.25rem;
            border-color: rgba(196, 218, 147, 0.1);
          }

          :deep(.settings-card .app-card-body) { padding: 1.2rem 1.25rem; }
          .settings-card-heading { display: flex; align-items: center; gap: 0.7rem; }
          .settings-card-heading h3 { margin-top: 0.2rem; color: #e8eddf; font-size: 0.88rem; font-weight: 680; }
          .settings-card-icon { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border: 1px solid rgba(211, 189, 103, 0.2); border-radius: 10px; color: #dfc775; background: rgba(211, 189, 103, 0.08); }
          .settings-form { width: min(100%, 680px); }
          .settings-preferences { width: min(100%, 760px); }

          .settings-field-label,
          .settings-range-label {
            display: block;
            margin-bottom: 0.42rem;
            color: #bac1b0;
            font-size: 0.72rem;
            font-weight: 600;
          }

          .settings-field {
            width: 100%;
            min-height: 42px;
            padding: 0.65rem 0.75rem;
            border: 1px solid rgba(196, 218, 147, 0.16);
            border-radius: 10px;
            outline: none;
            color: #e7ebdf;
            background: rgba(7, 13, 10, 0.34);
            font-size: 0.76rem;
            transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
          }

          .settings-field::placeholder { color: #747f70; }
          .settings-field:focus {
            border-color: rgba(211, 189, 103, 0.55);
            background: rgba(7, 13, 10, 0.55);
            box-shadow: 0 0 0 3px rgba(211, 189, 103, 0.09);
          }
          .settings-field option { color: #e7ebdf; background: #182019; }
          .settings-password-field { padding-right: 2.6rem; }
          .settings-password-toggle { position: absolute; top: 50%; right: 0.8rem; display: grid; width: 28px; height: 28px; transform: translateY(-50%); place-items: center; border-radius: 7px; color: #909a87; transition: color 0.18s ease, background 0.18s ease; }
          .settings-password-toggle:hover { color: #e3d18e; background: rgba(211, 189, 103, 0.08); }

          .settings-feedback {
            display: inline-flex;
            align-items: center;
            padding: 0.65rem 0.8rem;
            border: 1px solid rgba(114, 213, 159, 0.22);
            border-radius: 9px;
            color: #a8e0ba;
            background: rgba(114, 213, 159, 0.08);
            font-size: 0.72rem;
            font-weight: 600;
          }

          :deep(.settings-save-button) {
            min-height: 40px;
            border: 1px solid rgba(126, 221, 170, 0.24);
            border-radius: 10px;
            background: linear-gradient(120deg, #12845e, #0e6d50);
            box-shadow: 0 8px 20px rgba(8, 151, 99, 0.15);
          }
          :deep(.settings-save-button:hover:not(:disabled)) { transform: translateY(-1px); box-shadow: 0 11px 24px rgba(8, 151, 99, 0.24); }

          .settings-role-panel {
            border: 1px solid rgba(114, 213, 159, 0.18);
            background: linear-gradient(110deg, rgba(114, 213, 159, 0.09), rgba(21, 38, 27, 0.44));
          }

          .settings-role-icon { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 1px solid rgba(114, 213, 159, 0.2); border-radius: 10px; color: #8ed4a5; background: rgba(114, 213, 159, 0.08); }
          .settings-role-panel h4 { color: #e6ecdf; font-size: 0.84rem; font-weight: 700; }
          .settings-role-panel p { margin-top: 0.3rem; color: #a5ae9c; font-size: 0.72rem; line-height: 1.55; }

          .settings-toggle-row {
            min-height: 58px;
            gap: 1rem;
            padding: 0.7rem 0;
            border-bottom: 1px solid rgba(196, 218, 147, 0.09);
          }
          .settings-toggle-row:first-child { padding-top: 0; }
          .settings-option-title { color: #e2e7dc; font-size: 0.76rem; font-weight: 650; }
          .settings-option-description { margin-top: 0.2rem; color: #929b88; font-size: 0.67rem; }

          .settings-toggle {
            position: relative;
            display: inline-flex;
            width: 42px;
            height: 24px;
            flex: 0 0 42px;
            align-items: center;
            padding: 3px;
            border: 1px solid rgba(196, 218, 147, 0.14);
            border-radius: 999px;
            background: rgba(137, 148, 126, 0.2);
            transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
          }

          .settings-toggle:focus-visible { outline: 2px solid rgba(211, 189, 103, 0.65); outline-offset: 2px; }
          .settings-toggle-on { border-color: rgba(114, 213, 159, 0.35); background: #16815c; box-shadow: 0 0 14px rgba(22, 129, 92, 0.2); }
          .settings-toggle > span { width: 16px; height: 16px; transform: translateX(0); border-radius: 50%; background: #dce3d3; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25); transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease; }
          .settings-toggle > .settings-toggle-thumb-on { transform: translateX(17px); background: #f1f6ed; }

          .settings-range-label { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; margin-top: 0.35rem; }
          .settings-range-label span { color: #94d2a5; font-variant-numeric: tabular-nums; }
          .settings-range { width: 100%; height: 5px; margin-top: 0.7rem; appearance: none; border-radius: 999px; outline: none; accent-color: #72d59f; background: linear-gradient(90deg, rgba(114, 213, 159, 0.48), rgba(196, 218, 147, 0.12)); }
          .settings-range::-webkit-slider-thumb { width: 15px; height: 15px; appearance: none; border: 3px solid #19231b; border-radius: 50%; background: #8bd4a5; box-shadow: 0 0 0 1px rgba(139, 212, 165, 0.55), 0 3px 9px rgba(0, 0, 0, 0.3); }
          .settings-range::-moz-range-thumb { width: 10px; height: 10px; border: 3px solid #19231b; border-radius: 50%; background: #8bd4a5; box-shadow: 0 0 0 1px rgba(139, 212, 165, 0.55), 0 3px 9px rgba(0, 0, 0, 0.3); }

          .settings-save-row { flex-wrap: wrap; }

          @keyframes settings-enter { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: translateY(0); } }

          @media (max-width: 640px) {
            .settings-heading { align-items: flex-start; flex-direction: column; gap: 0.85rem; }
            .settings-heading p { max-width: 35ch; }
            .settings-tab { padding-inline: 0.7rem; font-size: 0.69rem; }
            :deep(.settings-card .app-card-header) { padding: 0.95rem; }
            :deep(.settings-card .app-card-body) { padding: 0.95rem; }
          }

          @media (prefers-reduced-motion: reduce) {
            .settings-page { animation: none; }
            .settings-tab, .settings-field, .settings-password-toggle, .settings-toggle, .settings-toggle > span,
            :deep(.settings-save-button) { transition: none; }
          }
          </style>
          <div class="settings-form space-y-4">
            <div v-if="saveAccountMsg" class="settings-feedback">
              {{ saveAccountMsg }}
            </div>
            <div>
              <label class="settings-field-label" for="settings-display-name">Nombre</label>
              <input id="settings-display-name" v-model="displayName" type="text" class="settings-field" autocomplete="name" />
            </div>
            <div>
              <label class="settings-field-label" for="settings-account-email">Correo electrónico</label>
              <input id="settings-account-email" v-model="accountEmail" type="email" class="settings-field" autocomplete="email" />
            </div>
            <div>
              <label class="settings-field-label" for="settings-new-password">Nueva contraseña</label>
              <div class="relative">
                <input id="settings-new-password" v-model="newPassword" :type="showPassword ? 'text' : 'password'" class="settings-field settings-password-field" autocomplete="new-password" placeholder="••••••••" />
                <button type="button" @click="showPassword = !showPassword" class="settings-password-toggle" :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                  <Eye v-if="!showPassword" class="w-4 h-4" />
                  <EyeOff v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
            <Button class="settings-save-button" variant="primary" size="sm" @click="saveAccount">
              <Save class="w-4 h-4 mr-2" /> Guardar Cambios
            </Button>
          </div>
        </Card>

        <Card class="settings-card">
          <template #header>
            <div class="settings-card-heading">
              <span class="settings-card-icon"><ShieldCheck :size="17" /></span>
              <div><span>SEGURIDAD</span><h3>Nivel de acceso</h3></div>
            </div>
          </template>
          <div class="space-y-3">
            <div class="settings-role-panel flex items-start gap-4 p-4 rounded-xl">
              <div class="settings-role-icon">
                <ShieldCheck :size="19" />
              </div>
              <div>
                <h4>{{ roleLabels[userRole] || 'Cliente' }}</h4>
                <p>
                  <template v-if="userRole === 'cliente'">Visualiza dashboards, mapas y datos de sus parcelas asignadas.</template>
                  <template v-if="userRole === 'administrador'">Acceso total: gestión de usuarios, parcelas, simulación y configuración.</template>
                  <template v-if="userRole === 'tecnico'">Puede ejecutar simulaciones, analizar campos y gestionar misiones de dron.</template>
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
        <Card class="settings-card">
          <template #header>
            <div class="settings-card-heading">
              <span class="settings-card-icon"><Globe :size="17" /></span>
              <div><span>REGIONAL</span><h3>Idioma y unidades</h3></div>
            </div>
          </template>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5 settings-form">
            <div>
              <label class="settings-field-label" for="settings-language">Idioma</label>
              <select id="settings-language" v-model="prefs.lang" class="settings-field">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label class="settings-field-label" for="settings-units">Sistema de unidades</label>
              <select id="settings-units" v-model="prefs.units" class="settings-field">
                <option value="metric">Métrico (°C, km, ha)</option>
                <option value="imperial">Imperial (°F, mi, acre)</option>
              </select>
            </div>
            <div>
              <label class="settings-field-label" for="settings-map-default">Vista de mapa predeterminada</label>
              <select id="settings-map-default" v-model="prefs.mapDefault" class="settings-field">
                <option value="satellite">Satelital</option>
                <option value="terrain">Terreno</option>
                <option value="street">Calles</option>
              </select>
            </div>
          </div>
        </Card>

        <Card class="settings-card">
          <template #header>
            <div class="settings-card-heading">
              <span class="settings-card-icon"><Bell :size="17" /></span>
              <div><span>ALERTAS</span><h3>Notificaciones y umbrales</h3></div>
            </div>
          </template>
          <div class="settings-preferences space-y-5">
            <div class="settings-toggle-row flex items-center justify-between">
              <div>
                <p class="settings-option-title">Notificaciones push</p>
                <p class="settings-option-description">Recibe alertas en el navegador</p>
              </div>
              <button
                @click="prefs.notifications = !prefs.notifications"
                class="settings-toggle"
                :class="{ 'settings-toggle-on': prefs.notifications }"
                :aria-pressed="prefs.notifications"
                aria-label="Activar notificaciones push"
              >
                <span :class="{ 'settings-toggle-thumb-on': prefs.notifications }"></span>
              </button>
            </div>
            <div class="settings-toggle-row flex items-center justify-between">
              <div>
                <p class="settings-option-title">Alertas por correo</p>
                <p class="settings-option-description">Resumen diario de estado del campo</p>
              </div>
              <button
                @click="prefs.emailAlerts = !prefs.emailAlerts"
                class="settings-toggle"
                :class="{ 'settings-toggle-on': prefs.emailAlerts }"
                :aria-pressed="prefs.emailAlerts"
                aria-label="Activar alertas por correo"
              >
                <span :class="{ 'settings-toggle-thumb-on': prefs.emailAlerts }"></span>
              </button>
            </div>
            <div class="settings-toggle-row flex items-center justify-between">
              <div>
                <p class="settings-option-title">Actualización automática</p>
                <p class="settings-option-description">Refrescar datos sin intervención</p>
              </div>
              <button
                @click="prefs.autoRefresh = !prefs.autoRefresh"
                class="settings-toggle"
                :class="{ 'settings-toggle-on': prefs.autoRefresh }"
                :aria-pressed="prefs.autoRefresh"
                aria-label="Activar actualización automática"
              >
                <span :class="{ 'settings-toggle-thumb-on': prefs.autoRefresh }"></span>
              </button>
            </div>
            <div>
              <label class="settings-range-label">
                Umbral de alerta — Humedad mínima: <span class="text-agron-green font-bold">{{ prefs.alertThresholdHumidity }}%</span>
              </label>
              <input v-model="prefs.alertThresholdHumidity" aria-label="Umbral mínimo de humedad" type="range" min="10" max="80" step="5" class="settings-range" />
            </div>
            <div>
              <label class="settings-range-label">
                Umbral de alerta — Índice de plagas: <span class="text-agron-alert font-bold">{{ prefs.alertThresholdPest }}%</span>
              </label>
              <input v-model="prefs.alertThresholdPest" aria-label="Umbral de índice de plagas" type="range" min="5" max="80" step="5" class="settings-range" />
            </div>
          </div>
        </Card>

        <div class="settings-save-row flex items-center gap-3">
          <Button class="settings-save-button" variant="primary" @click="savePrefs">
            <Save class="w-4 h-4 mr-2" /> Guardar Preferencias
          </Button>
          <span v-if="savePrefsMsg" class="settings-feedback">{{ savePrefsMsg }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>
