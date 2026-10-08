<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../services/supabase'
import { useMainStore } from '../stores'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import { Users, UserPlus, Trash2, List, ShieldCheck } from 'lucide-vue-next'

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
  const metadata = store.user?.user_metadata
  return metadata?.role === 'administrador' || store.user?.email === 'jenone0424@gmail.com'
})

const fetchUsers = async () => {
  loadingUsers.value = true
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
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
  const { error: authError } = await supabase.auth.signUp({
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
  await supabase.from('profiles').delete().eq('id', id)
  users.value = users.value.filter(u => u.id !== id)
}

const toggleUserActive = async (user: UserProfile) => {
  const newStatus = !user.active
  const { error } = await supabase.from('profiles').update({ active: newStatus }).eq('id', user.id)
  if (!error) user.active = newStatus
}

const changeUserRole = async (user: UserProfile, newRole: Role) => {
  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', user.id)
  if (!error) user.role = newRole
}

const updateStatus = async (user: UserProfile, newStatus: 'aprobado' | 'rechazado') => {
  const active = newStatus === 'aprobado'
  const { error } = await supabase.from('profiles').update({ status: newStatus, active }).eq('id', user.id)
  if (!error) {
    user.status = newStatus
    user.active = active
  }
}

const viewLogs = async (user: UserProfile) => {
  selectedUserName.value = user.full_name || user.email
  showLogsModal.value = true
  const { data } = await supabase.from('user_logs').select('*').eq('user_id', user.id).order('timestamp', { ascending: false }).limit(20)
  selectedUserLogs.value = data || []
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
      <p class="text-gray-500 mt-1">Administra los accesos y roles de la plataforma con datos reales.</p>
    </div>

    <!-- Registro nuevo usuario -->
    <Card v-if="isAdmin">
      <template #header>
        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
          <UserPlus class="w-4 h-4 text-agron-green" /> Registrar Nuevo Usuario (Admin)
        </h3>
      </template>
      <div class="space-y-4 max-w-lg">
        <div v-if="addUserMsg" class="p-3 bg-agron-green-light text-agron-green-dark rounded-lg text-sm font-medium">{{ addUserMsg }}</div>
        <div v-if="addErrorMsg" class="p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium">{{ addErrorMsg }}</div>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
            <input v-model="newUserName" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="Nombre del usuario" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Correo</label>
            <input v-model="newUserEmail" type="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="correo@ejemplo.com" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input v-model="newUserPassword" type="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="••••••••" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Rol Inicial</label>
            <select v-model="newUserRole" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm bg-white">
              <option value="cliente">Cliente</option>
              <option value="tecnico">Técnico</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
        </div>
        <Button variant="primary" size="sm" @click="addUser" :disabled="!newUserName || !newUserEmail || !newUserPassword || loadingAdd">
          <UserPlus class="w-4 h-4 mr-2" /> {{ loadingAdd ? 'Registrando...' : 'Registrar Usuario' }}
        </Button>
      </div>
    </Card>

    <!-- Lista de usuarios -->
    <Card>
      <template #header>
        <div class="flex justify-between items-center w-full">
          <h3 class="font-semibold text-gray-900 flex items-center gap-2">
            <Users class="w-4 h-4 text-gray-500" /> Usuarios del Sistema
          </h3>
          <Button variant="outline" size="sm" @click="fetchUsers">Refrescar</Button>
        </div>
      </template>
      
      <div v-if="loadingUsers" class="p-8 flex justify-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-agron-green"></div>
      </div>
      
      <div v-else-if="users.length === 0" class="p-8 text-center text-gray-500">
        No se encontraron perfiles. Por favor ejecuta el script de SQL en Supabase para crear las tablas y triggers.
      </div>
      
      <div v-else class="divide-y divide-gray-100 overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50">
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Usuario</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Solicitud</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50/50 transition-colors">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-agron-green-light flex items-center justify-center flex-shrink-0">
                    <span class="text-agron-green-dark font-bold text-sm">{{ (user.full_name || 'U')[0].toUpperCase() }}</span>
                  </div>
                  <div>
                    <p class="font-medium text-gray-900 text-sm">{{ user.full_name || 'Sin nombre' }}</p>
                    <p class="text-xs text-gray-500">{{ user.email }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3">
                <select v-if="isAdmin" :value="user.role" @change="e => changeUserRole(user, (e.target as HTMLSelectElement).value as Role)" class="text-xs font-semibold px-2 py-1 rounded-md border border-gray-200 outline-none focus:border-agron-green bg-white">
                  <option value="cliente">Cliente</option>
                  <option value="tecnico">Técnico</option>
                  <option value="administrador">Administrador</option>
                </select>
                <span v-else class="text-xs font-semibold px-2.5 py-1 rounded-full" :class="roleColors[user.role]">
                  {{ roleLabels[user.role] }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-col gap-2 items-start">
                  <span v-if="user.status === 'pendiente'" class="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">Pendiente</span>
                  <span v-else-if="user.status === 'aprobado'" class="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Aprobado</span>
                  <span v-else class="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Rechazado</span>
                  
                  <div v-if="isAdmin && user.status === 'pendiente'" class="flex gap-1 mt-1">
                    <button @click="updateStatus(user, 'aprobado')" class="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors shadow-sm">Aprobar</button>
                    <button @click="updateStatus(user, 'rechazado')" class="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors shadow-sm">Rechazar</button>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3">
                <button
                  :disabled="!isAdmin"
                  @click="toggleUserActive(user)"
                  class="text-xs font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50"
                  :class="user.active ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100' : 'border-gray-300 text-gray-500 bg-gray-50 hover:bg-gray-100'"
                >{{ user.active ? 'Activo' : 'Inactivo' }}</button>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end items-center gap-2">
                  <button v-if="isAdmin" @click="viewLogs(user)" class="p-1.5 text-gray-500 hover:text-agron-green hover:bg-agron-green-light rounded transition-colors" title="Ver Logs de Sesión">
                    <List class="w-4 h-4" />
                  </button>
                  <button v-if="isAdmin" @click="removeUser(user.id)" class="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Eliminar Perfil">
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
    <div v-if="showLogsModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div class="p-4 border-b border-gray-100 flex justify-between items-center">
          <h3 class="font-bold text-gray-900">Logs de Sesión: {{ selectedUserName }}</h3>
          <button @click="showLogsModal = false" class="text-gray-400 hover:text-gray-900">✕</button>
        </div>
        <div class="p-4 flex-1 overflow-y-auto">
          <div v-if="selectedUserLogs.length === 0" class="text-center text-sm text-gray-500 py-4">
            No hay registros de sesión recientes.
          </div>
          <ul v-else class="space-y-3">
            <li v-for="log in selectedUserLogs" :key="log.id" class="flex justify-between items-center text-sm p-3 rounded-lg border border-gray-100 bg-gray-50/50">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" :class="log.action === 'LOGIN' ? 'bg-green-500' : 'bg-orange-500'"></span>
                <span class="font-medium text-gray-700">{{ log.action }}</span>
              </div>
              <span class="text-xs text-gray-500">{{ new Date(log.timestamp).toLocaleString() }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

  </div>
</template>
