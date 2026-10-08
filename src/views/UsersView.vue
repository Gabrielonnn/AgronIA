<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../services/supabase'
import { useMainStore } from '../stores'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import { Users, UserPlus, Trash2, List, ShieldCheck, UserCheck, Clock3, RefreshCw } from 'lucide-vue-next'

const store = useMainStore()

type Role = 'cliente' | 'administrador' | 'tecnico'

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: Role
  active: boolean
  status: 'pendiente' | 'aprobado' | 'rechazado'
  created_at: string
}

interface UserLog {
  id: string
  action: string
  timestamp: string
}

const users = ref<UserProfile[]>([])
const loadingUsers = ref(true)

const newUserName = ref('')
const newUserEmail = ref('')
const newUserRole = ref<Role>('cliente')
const newUserPassword = ref('')
const addUserMsg = ref('')
const addErrorMsg = ref('')
const loadingAdd = ref(false)

const selectedUserLogs = ref<UserLog[]>([])
const showLogsModal = ref(false)
const selectedUserName = ref('')

const roleLabels: Record<Role, string> = {
  cliente: 'Cliente',
  administrador: 'Administrador',
  tecnico: 'Técnico',
}

const roleColors: Record<Role, string> = {
  cliente: 'bg-blue-100 text-blue-700',
  administrador: 'bg-purple-100 text-purple-700',
  tecnico: 'bg-orange-100 text-orange-700',
}

const isAdmin = computed(() => {
  const profileRole = store.user?.profile?.role
  const metadataRole = store.user?.user_metadata?.role
  return profileRole === 'administrador' || metadataRole === 'administrador' || store.user?.email === 'jenone0424@gmail.com'
})

const activeUsers = computed(() => users.value.filter(user => user.active).length)
const pendingUsers = computed(() => users.value.filter(user => user.status === 'pendiente').length)

const fetchUsers = async () => {
  loadingUsers.value = true
  const { data } = await supabase!.from('profiles').select('*').order('created_at', { ascending: false })
  if (data) users.value = data as UserProfile[]
  loadingUsers.value = false
}

onMounted(() => {
  fetchUsers()
})

const addUser = async () => {
  if (!newUserName.value || !newUserEmail.value || !newUserPassword.value) return
  loadingAdd.value = true
  addErrorMsg.value = ''
  addUserMsg.value = ''
  
  // Usar signUp para crear la cuenta en Auth
  const { error: authError } = await supabase!.auth.signUp({
    email: newUserEmail.value,
    password: newUserPassword.value,
    options: {
      data: {
        name: newUserName.value,
        role: newUserRole.value
      }
    }
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      addErrorMsg.value = 'Este correo ya está registrado en AgronIA.'
    } else {
      addErrorMsg.value = authError.message
    }
    loadingAdd.value = false
    return
  }

  addUserMsg.value = 'Usuario registrado. Se ha enviado correo de confirmación si aplica.'
  newUserName.value = ''
  newUserEmail.value = ''
  newUserPassword.value = ''
  newUserRole.value = 'cliente'
  
  setTimeout(() => { addUserMsg.value = '' }, 4000)
  
  // Refrescar lista después de un segundo (para que el trigger tenga tiempo de insertar)
  setTimeout(fetchUsers, 1000)
  loadingAdd.value = false
}

const removeUser = async (id: string) => {
  if (!confirm('¿Seguro que deseas eliminar este perfil? Esto no borra la cuenta en auth, solo su acceso.')) return
  const { error } = await supabase!.from('profiles').delete().eq('id', id)
  if (!error) {
    users.value = users.value.filter(u => u.id !== id)
  } else {
    alert('Error al eliminar usuario. Posiblemente faltan permisos de administrador en la base de datos.')
  }
}

const toggleUserActive = async (user: UserProfile) => {
  const newStatus = !user.active
  const { error } = await supabase!.from('profiles').update({ active: newStatus }).eq('id', user.id)
  if (!error) user.active = newStatus
}

const changeUserRole = async (user: UserProfile, newRole: Role) => {
  const { error } = await supabase!.from('profiles').update({ role: newRole }).eq('id', user.id)
  if (!error) user.role = newRole
}

const updateStatus = async (user: UserProfile, newStatus: 'aprobado' | 'rechazado') => {
  const active = newStatus === 'aprobado'
  const { error } = await supabase!.from('profiles').update({ status: newStatus, active }).eq('id', user.id)
  if (!error) {
    user.status = newStatus
    user.active = active
  }
}

const viewLogs = async (user: UserProfile) => {
  selectedUserName.value = user.full_name || user.email
  showLogsModal.value = true
  const { data } = await supabase!.from('user_logs').select('*').eq('user_id', user.id).order('timestamp', { ascending: false }).limit(20)
  selectedUserLogs.value = data || []
}
</script>

<template>
  <div class="users-page space-y-6">
    <header class="users-heading">
      <div>
        <span class="users-eyebrow">CONTROL DE ACCESO</span>
        <h1>Gestión de usuarios</h1>
        <p>Administra los perfiles, permisos y actividad de AgronIA.</p>
      </div>
      <span v-if="isAdmin" class="users-admin-badge"><ShieldCheck :size="15" /> Administrador</span>
    </header>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="users-summary-card">
        <span class="users-summary-icon users-summary-icon-gold"><Users :size="18" /></span>
        <div><span>Perfiles registrados</span><strong>{{ users.length }}</strong></div>
      </div>
      <div class="users-summary-card">
        <span class="users-summary-icon users-summary-icon-green"><UserCheck :size="18" /></span>
        <div><span>Accesos activos</span><strong>{{ activeUsers }}</strong></div>
      </div>
      <div class="users-summary-card">
        <span class="users-summary-icon users-summary-icon-amber"><Clock3 :size="18" /></span>
        <div><span>Solicitudes pendientes</span><strong>{{ pendingUsers }}</strong></div>
      </div>
    </div>

    <!-- Registro nuevo usuario -->
    <Card v-if="isAdmin" class="users-card">
      <template #header>
        <div class="users-card-heading">
          <span class="users-card-icon"><UserPlus :size="17" /></span>
          <div><span>GESTIÓN DE ACCESO</span><h3>Registrar usuario</h3></div>
        </div>
      </template>

      <style scoped>
      .users-page {
        min-width: 0;
        color: #e8eddf;
        animation: users-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .users-heading {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.2rem 0 0.25rem;
      }

      .users-eyebrow,
      .users-card-heading > div > span {
        color: #c1a95f;
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.15em;
      }

      .users-heading h1 {
        margin-top: 0.4rem;
        color: #f0f1e9;
        font-size: clamp(1.7rem, 3vw, 2.35rem);
        font-weight: 760;
        letter-spacing: -0.055em;
      }

      .users-heading p {
        margin-top: 0.35rem;
        color: #a2aa97;
        font-size: 0.88rem;
      }

      .users-admin-badge {
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
      }

      .users-summary-card {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.85rem;
        padding: 1rem 1.1rem;
        border: 1px solid rgba(196, 218, 147, 0.13);
        border-radius: 14px;
        background:
          radial-gradient(ellipse at 100% 0, rgba(157, 179, 100, 0.08), transparent 55%),
          linear-gradient(145deg, rgba(29, 36, 25, 0.96), rgba(18, 24, 18, 0.96));
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
        transition: transform 0.22s ease, border-color 0.22s ease;
        animation: users-enter 0.48s both;
      }

      .users-summary-card:nth-child(2) { animation-delay: 0.05s; }
      .users-summary-card:nth-child(3) { animation-delay: 0.1s; }
      .users-summary-card:hover { transform: translateY(-2px); border-color: rgba(211, 189, 103, 0.25); }

      .users-summary-icon,
      .users-card-icon {
        display: grid;
        width: 38px;
        height: 38px;
        flex: 0 0 38px;
        place-items: center;
        border: 1px solid rgba(211, 189, 103, 0.2);
        border-radius: 11px;
        color: #dfc775;
        background: rgba(211, 189, 103, 0.08);
      }

      .users-summary-icon-green {
        border-color: rgba(114, 213, 159, 0.2);
        color: #85d4a3;
        background: rgba(114, 213, 159, 0.08);
      }

      .users-summary-icon-amber {
        border-color: rgba(229, 162, 97, 0.2);
        color: #e5a261;
        background: rgba(229, 162, 97, 0.08);
      }

      .users-summary-card > div { display: grid; min-width: 0; gap: 0.18rem; }
      .users-summary-card > div > span { color: #9ca591; font-size: 0.68rem; }
      .users-summary-card strong { color: #f0f1e9; font-size: 1.35rem; line-height: 1.1; font-variant-numeric: tabular-nums; }

      :deep(.users-card.app-card) {
        min-width: 0;
        border: 1px solid rgba(196, 218, 147, 0.13);
        border-radius: 16px;
        background: linear-gradient(145deg, rgba(26, 34, 25, 0.98), rgba(17, 23, 18, 0.98));
        box-shadow: 0 14px 35px rgba(0, 0, 0, 0.18);
      }

      :deep(.users-card .app-card-header) {
        padding: 1.05rem 1.25rem;
        border-color: rgba(196, 218, 147, 0.1);
      }

      :deep(.users-card .app-card-body) { padding: 1.2rem 1.25rem; }
      .users-card-heading { display: flex; min-width: 0; align-items: center; gap: 0.7rem; }
      .users-card-icon { width: 34px; height: 34px; flex-basis: 34px; border-radius: 10px; }
      .users-card-heading h3 { margin-top: 0.2rem; color: #e8eddf; font-size: 0.88rem; font-weight: 680; }
      .users-form { width: min(100%, 740px); }
      .users-field-label { display: block; margin-bottom: 0.42rem; color: #bac1b0; font-size: 0.72rem; font-weight: 600; }

      .users-field {
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

      .users-field::placeholder { color: #747f70; }
      .users-field:focus {
        border-color: rgba(211, 189, 103, 0.55);
        background: rgba(7, 13, 10, 0.55);
        box-shadow: 0 0 0 3px rgba(211, 189, 103, 0.09);
      }
      .users-field option { color: #e7ebdf; background: #182019; }
      .users-feedback { padding: 0.75rem 0.85rem; border-radius: 10px; font-size: 0.74rem; font-weight: 600; }
      .users-feedback-success { border: 1px solid rgba(114, 213, 159, 0.22); color: #a8e0ba; background: rgba(114, 213, 159, 0.08); }
      .users-feedback-error { border: 1px solid rgba(231, 127, 105, 0.25); color: #f0a293; background: rgba(231, 127, 105, 0.08); }

      :deep(.users-submit) {
        min-height: 40px;
        border: 1px solid rgba(126, 221, 170, 0.24);
        border-radius: 10px;
        background: linear-gradient(120deg, #12845e, #0e6d50);
        box-shadow: 0 8px 20px rgba(8, 151, 99, 0.15);
      }
      :deep(.users-submit:hover:not(:disabled)) { transform: translateY(-1px); box-shadow: 0 11px 24px rgba(8, 151, 99, 0.24); }

      .users-list-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .users-count {
        display: inline-grid;
        min-width: 25px;
        height: 25px;
        margin-left: 0.15rem;
        padding-inline: 0.35rem;
        place-items: center;
        border: 1px solid rgba(211, 189, 103, 0.2);
        border-radius: 999px;
        color: #ddca86;
        background: rgba(211, 189, 103, 0.07);
        font-size: 0.65rem;
        font-weight: 750;
      }

      :deep(.users-refresh) {
        min-height: 34px;
        gap: 0.45rem;
        border-color: rgba(196, 218, 147, 0.16);
        border-radius: 9px;
        color: #cbd2c1;
        background: rgba(255, 255, 255, 0.035);
        font-size: 0.68rem;
      }
      :deep(.users-refresh:hover:not(:disabled)) { border-color: rgba(211, 189, 103, 0.32); color: #e6d28b; background: rgba(211, 189, 103, 0.07); }
      .users-refreshing { animation: users-spin 0.9s linear infinite; }

      .users-loading { display: grid; min-height: 150px; place-items: center; }
      .users-spinner { width: 30px; height: 30px; border: 2px solid rgba(196, 218, 147, 0.15); border-top-color: #d9bd68; border-radius: 50%; animation: users-spin 0.8s linear infinite; }
      .users-empty { display: grid; min-height: 190px; justify-items: center; align-content: center; gap: 0.55rem; color: #929b88; font-size: 0.72rem; text-align: center; }
      .users-empty > span { display: grid; width: 44px; height: 44px; margin-bottom: 0.25rem; place-items: center; border: 1px solid rgba(196, 218, 147, 0.14); border-radius: 14px; color: #c9b66c; background: rgba(211, 189, 103, 0.06); }
      .users-empty > strong { color: #e1e6d7; font-size: 0.85rem; }
      .users-table-wrap { overflow-x: auto; scrollbar-color: rgba(211, 189, 103, 0.25) transparent; }
      .users-table { min-width: 760px; }
      .users-table th { padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(196, 218, 147, 0.12); color: #8f9986; background: rgba(255, 255, 255, 0.025); font-size: 0.57rem; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase; }
      .users-table td { padding: 0.85rem; border-bottom: 1px solid rgba(196, 218, 147, 0.08); color: #d9dfd1; vertical-align: middle; }
      .users-table tbody tr { transition: background 0.18s ease; }
      .users-table tbody tr:hover { background: rgba(255, 255, 255, 0.025); }
      .users-table tbody tr:last-child td { border-bottom: 0; }
      .users-avatar { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 1px solid rgba(211, 189, 103, 0.2); border-radius: 12px; color: #e4cf89; background: linear-gradient(145deg, rgba(211, 189, 103, 0.16), rgba(211, 189, 103, 0.06)); font-size: 0.78rem; font-weight: 800; }
      .users-name { color: #e8eddf; font-size: 0.74rem; font-weight: 650; }
      .users-email { margin-top: 0.15rem; color: #919b88; font-size: 0.66rem; }

      .users-role-select {
        min-height: 31px;
        padding: 0.35rem 1.5rem 0.35rem 0.55rem;
        border: 1px solid rgba(196, 218, 147, 0.16);
        border-radius: 8px;
        outline: none;
        color: #dce3d3;
        background: #1a241b;
        font-size: 0.66rem;
      }
      .users-role-select:focus { border-color: rgba(211, 189, 103, 0.5); }
      .users-role-select option { background: #182019; }
      .users-role-badge,
      .users-status-badge,
      .users-active-badge { display: inline-flex; align-items: center; border-radius: 999px; font-size: 0.62rem; font-weight: 700; white-space: nowrap; }
      .users-role-badge { padding: 0.35rem 0.6rem; }
      .users-role-badge.bg-blue-100 { color: #a9d0ee; background: rgba(78, 143, 183, 0.13); }
      .users-role-badge.bg-purple-100 { color: #ccb3f0; background: rgba(153, 111, 202, 0.14); }
      .users-role-badge.bg-orange-100 { color: #edbd8e; background: rgba(204, 131, 65, 0.14); }
      .users-status-badge { padding: 0.33rem 0.6rem; }
      .users-status-pending { border: 1px solid rgba(224, 189, 96, 0.2); color: #e3cd83; background: rgba(224, 189, 96, 0.08); }
      .users-status-approved { border: 1px solid rgba(114, 213, 159, 0.2); color: #9cdbad; background: rgba(114, 213, 159, 0.08); }
      .users-status-rejected { border: 1px solid rgba(231, 127, 105, 0.2); color: #e69a8c; background: rgba(231, 127, 105, 0.08); }
      .users-review-button { padding: 0.34rem 0.5rem; border: 1px solid transparent; border-radius: 7px; font-size: 0.58rem; font-weight: 700; transition: background 0.18s ease, transform 0.18s ease; }
      .users-review-button:hover { transform: translateY(-1px); }
      .users-review-approve { border-color: rgba(114, 213, 159, 0.2); color: #a3dfb3; background: rgba(114, 213, 159, 0.09); }
      .users-review-approve:hover { background: rgba(114, 213, 159, 0.16); }
      .users-review-reject { border-color: rgba(231, 127, 105, 0.2); color: #e9a094; background: rgba(231, 127, 105, 0.08); }
      .users-review-reject:hover { background: rgba(231, 127, 105, 0.15); }
      .users-active-badge { padding: 0.38rem 0.62rem; border: 1px solid; transition: background 0.18s ease; }
      .users-active-badge:disabled { cursor: default; opacity: 0.65; }
      .users-active { border-color: rgba(114, 213, 159, 0.22); color: #9fdbaf; background: rgba(114, 213, 159, 0.08); }
      .users-active:hover:not(:disabled) { background: rgba(114, 213, 159, 0.16); }
      .users-inactive { border-color: rgba(160, 170, 148, 0.18); color: #a1aa96; background: rgba(160, 170, 148, 0.06); }
      .users-inactive:hover:not(:disabled) { background: rgba(160, 170, 148, 0.12); }
      .users-icon-button { display: grid; width: 32px; height: 32px; place-items: center; border: 1px solid transparent; border-radius: 9px; color: #a4ad98; transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease; }
      .users-icon-button:hover { border-color: rgba(114, 213, 159, 0.17); color: #9eddb1; background: rgba(114, 213, 159, 0.08); }
      .users-delete-button:hover { border-color: rgba(231, 127, 105, 0.18); color: #e99587; background: rgba(231, 127, 105, 0.08); }

      .users-modal { background: rgba(3, 8, 5, 0.72); }
      .users-modal-panel { overflow: hidden; border: 1px solid rgba(196, 218, 147, 0.17); background: linear-gradient(145deg, #20291f, #141c16); box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55); animation: users-enter 0.22s ease both; }
      .users-modal-header { border-bottom: 1px solid rgba(196, 218, 147, 0.12); }
      .users-modal-header h3 { color: #e8eddf; font-size: 0.88rem; font-weight: 700; }
      .users-modal-header button { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 8px; color: #9ca591; transition: color 0.18s ease, background 0.18s ease; }
      .users-modal-header button:hover { color: #f0f1e9; background: rgba(255, 255, 255, 0.07); }
      .users-empty-logs { padding: 1.4rem 0.5rem; color: #929b88; font-size: 0.74rem; text-align: center; }
      .users-log-item { border-color: rgba(196, 218, 147, 0.11); color: #d8dfd0; background: rgba(255, 255, 255, 0.025); }
      .users-log-item > span { color: #929b88; }

      @keyframes users-enter { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes users-spin { to { transform: rotate(360deg); } }

      @media (max-width: 640px) {
        .users-heading { align-items: flex-start; flex-direction: column; gap: 0.85rem; }
        .users-heading p { max-width: 34ch; }
        :deep(.users-card .app-card-header) { padding: 0.95rem; }
        :deep(.users-card .app-card-body) { padding: 0.95rem; }
      }

      @media (max-width: 480px) {
        .users-form > .grid { grid-template-columns: 1fr; }
        .users-list-heading { align-items: flex-start; }
        .users-count { min-width: 22px; height: 22px; }
        .users-refresh { font-size: 0; }
        :deep(.users-refresh svg) { margin: 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        .users-page, .users-summary-card, .users-spinner, .users-refreshing, .users-modal-panel { animation: none; }
        .users-summary-card, .users-field, .users-review-button, .users-icon-button, .users-active-badge,
        :deep(.users-submit), :deep(.users-refresh) { transition: none; }
      }
      </style>
      <div class="users-form space-y-4">
        <div v-if="addUserMsg" class="users-feedback users-feedback-success">{{ addUserMsg }}</div>
        <div v-if="addErrorMsg" class="users-feedback users-feedback-error">{{ addErrorMsg }}</div>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="users-field-label" for="new-user-name">Nombre completo</label>
            <input id="new-user-name" v-model="newUserName" type="text" class="users-field" autocomplete="name" placeholder="Nombre del usuario" />
          </div>
          <div>
            <label class="users-field-label" for="new-user-email">Correo</label>
            <input id="new-user-email" v-model="newUserEmail" type="email" class="users-field" autocomplete="email" placeholder="correo@ejemplo.com" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="users-field-label" for="new-user-password">Contraseña</label>
            <input id="new-user-password" v-model="newUserPassword" type="password" class="users-field" autocomplete="new-password" placeholder="••••••••" />
          </div>
          <div>
            <label class="users-field-label" for="new-user-role">Rol inicial</label>
            <select id="new-user-role" v-model="newUserRole" class="users-field">
              <option value="cliente">Cliente</option>
              <option value="tecnico">Técnico</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
        </div>
        <Button class="users-submit" variant="primary" size="sm" @click="addUser" :disabled="!newUserName || !newUserEmail || !newUserPassword || loadingAdd">
          <UserPlus class="w-4 h-4 mr-2" /> {{ loadingAdd ? 'Registrando...' : 'Registrar Usuario' }}
        </Button>
      </div>
    </Card>

    <!-- Lista de usuarios -->
    <Card class="users-card users-list-card">
      <template #header>
        <div class="users-list-heading">
          <div class="users-card-heading">
            <span class="users-card-icon"><Users :size="17" /></span>
            <div><span>DIRECTORIO</span><h3>Usuarios del sistema</h3></div>
            <span class="users-count">{{ users.length }}</span>
          </div>
          <Button class="users-refresh" variant="outline" size="sm" :disabled="loadingUsers" @click="fetchUsers">
            <RefreshCw :size="14" :class="{ 'users-refreshing': loadingUsers }" /> Actualizar
          </Button>
        </div>
      </template>
      
      <div v-if="loadingUsers" class="users-loading" role="status" aria-label="Cargando usuarios">
        <div class="users-spinner"></div>
      </div>
      
      <div v-else-if="users.length === 0" class="users-empty">
        <span><Users :size="22" /></span>
        <strong>No hay perfiles para mostrar</strong>
        No se encontraron perfiles. Por favor ejecuta el script de SQL en Supabase para crear las tablas y triggers.
      </div>
      
      <div v-else class="users-table-wrap">
        <table class="users-table w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50">
              <th>Usuario</th>
              <th>Rol</th>
              <th>Solicitud</th>
              <th>Estado</th>
              <th class="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <div class="flex items-center gap-3">
                  <div class="users-avatar">
                    <span>{{ (user.full_name || 'U')[0].toUpperCase() }}</span>
                  </div>
                  <div>
                    <p class="users-name">{{ user.full_name || 'Sin nombre' }}</p>
                    <p class="users-email">{{ user.email }}</p>
                  </div>
                </div>
              </td>
              <td>
                <select v-if="isAdmin" :value="user.role" @change="e => changeUserRole(user, (e.target as HTMLSelectElement).value as Role)" class="users-role-select">
                  <option value="cliente">Cliente</option>
                  <option value="tecnico">Técnico</option>
                  <option value="administrador">Administrador</option>
                </select>
                <span v-else class="users-role-badge" :class="roleColors[user.role]">
                  {{ roleLabels[user.role] }}
                </span>
              </td>
              <td>
                <div class="flex flex-col gap-2 items-start">
                  <span v-if="user.status === 'pendiente'" class="users-status-badge users-status-pending">Pendiente</span>
                  <span v-else-if="user.status === 'aprobado'" class="users-status-badge users-status-approved">Aprobado</span>
                  <span v-else class="users-status-badge users-status-rejected">Rechazado</span>
                  
                  <div v-if="isAdmin && user.status === 'pendiente'" class="flex gap-1 mt-1">
                    <button @click="updateStatus(user, 'aprobado')" class="users-review-button users-review-approve">Aprobar</button>
                    <button @click="updateStatus(user, 'rechazado')" class="users-review-button users-review-reject">Rechazar</button>
                  </div>
                </div>
              </td>
              <td>
                <button
                  :disabled="!isAdmin"
                  @click="toggleUserActive(user)"
                  class="users-active-badge"
                  :class="user.active ? 'users-active' : 'users-inactive'"
                >{{ user.active ? 'Activo' : 'Inactivo' }}</button>
              </td>
              <td>
                <div class="flex justify-end items-center gap-2">
                  <button v-if="isAdmin" @click="viewLogs(user)" class="users-icon-button" title="Ver logs de sesión" aria-label="Ver logs de sesión">
                    <List class="w-4 h-4" />
                  </button>
                  <button v-if="isAdmin" @click="removeUser(user.id)" class="users-icon-button users-delete-button" title="Eliminar perfil" aria-label="Eliminar perfil">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <!-- Modal de Logs -->
    <div v-if="showLogsModal" class="users-modal fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div class="users-modal-panel rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div class="users-modal-header p-4 flex justify-between items-center">
          <h3>Actividad de {{ selectedUserName }}</h3>
          <button @click="showLogsModal = false" aria-label="Cerrar actividad">✕</button>
        </div>
        <div class="p-4 flex-1 overflow-y-auto">
          <div v-if="selectedUserLogs.length === 0" class="users-empty-logs">
            No hay registros de sesión recientes.
          </div>
          <ul v-else class="space-y-3">
            <li v-for="log in selectedUserLogs" :key="log.id" class="users-log-item flex justify-between items-center text-sm p-3 rounded-lg border">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" :class="log.action === 'LOGIN' ? 'bg-green-500' : 'bg-orange-500'"></span>
                <span class="font-medium">{{ log.action }}</span>
              </div>
              <span class="text-xs">{{ new Date(log.timestamp).toLocaleString() }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

  </div>
</template>
