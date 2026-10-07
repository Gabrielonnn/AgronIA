<script setup lang="ts">
import { ref } from 'vue'
import Card from '../components/ui/Card.vue'
import Button from '../components/ui/Button.vue'
import { Users, UserPlus, Trash2, ShieldCheck } from 'lucide-vue-next'

type Role = 'cliente' | 'administrador' | 'tecnico'

interface SystemUser {
  id: number
  name: string
  email: string
  role: Role
  active: boolean
}

const users = ref<SystemUser[]>([
  { id: 1, name: 'Carlos Mendoza', email: 'carlos@agronia.com', role: 'cliente', active: true },
  { id: 2, name: 'Laura Ríos', email: 'laura@agronia.com', role: 'administrador', active: true },
  { id: 3, name: 'Miguel Torres', email: 'miguel@agronia.com', role: 'tecnico', active: true },
])

const newUserName = ref('')
const newUserEmail = ref('')
const newUserRole = ref<Role>('cliente')
const newUserPassword = ref('')
const addUserMsg = ref('')

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

const addUser = () => {
  if (!newUserName.value || !newUserEmail.value) return
  users.value.push({
    id: Date.now(),
    name: newUserName.value,
    email: newUserEmail.value,
    role: newUserRole.value,
    active: true
  })
  newUserName.value = ''
  newUserEmail.value = ''
  newUserPassword.value = ''
  newUserRole.value = 'cliente'
  addUserMsg.value = 'Usuario registrado exitosamente.'
  setTimeout(() => { addUserMsg.value = '' }, 3000)
}

const removeUser = (id: number) => {
  users.value = users.value.filter(u => u.id !== id)
}

const toggleUserActive = (user: SystemUser) => {
  user.active = !user.active
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
      <p class="text-gray-500 mt-1">Administra los accesos y roles de la plataforma.</p>
    </div>

    <!-- Registro nuevo usuario -->
    <Card>
      <template #header>
        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
          <UserPlus class="w-4 h-4 text-agron-green" /> Registrar Nuevo Usuario
        </h3>
      </template>
      <div class="space-y-4 max-w-lg">
        <div v-if="addUserMsg" class="p-3 bg-agron-green-light text-agron-green-dark rounded-lg text-sm font-medium">{{ addUserMsg }}</div>
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
            <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña temporal</label>
            <input v-model="newUserPassword" type="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm" placeholder="••••••••" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nivel de Acceso</label>
            <select v-model="newUserRole" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green outline-none text-sm bg-white">
              <option value="cliente">Cliente</option>
              <option value="tecnico">Técnico</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
        </div>
        <Button variant="primary" size="sm" @click="addUser" :disabled="!newUserName || !newUserEmail">
          <UserPlus class="w-4 h-4 mr-2" /> Registrar Usuario
        </Button>
      </div>
    </Card>

    <!-- Lista de usuarios -->
    <Card>
      <template #header>
        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
          <Users class="w-4 h-4 text-gray-500" /> Usuarios del Sistema
        </h3>
      </template>
      <div class="divide-y divide-gray-100">
        <div v-for="user in users" :key="user.id" class="py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-agron-green-light flex items-center justify-center">
              <span class="text-agron-green-dark font-bold text-sm">{{ user.name[0] }}</span>
            </div>
            <div>
              <p class="font-medium text-gray-900 text-sm">{{ user.name }}</p>
              <p class="text-xs text-gray-500">{{ user.email }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full" :class="roleColors[user.role]">
              {{ roleLabels[user.role] }}
            </span>
            <button
              @click="toggleUserActive(user)"
              class="text-xs font-medium px-2.5 py-1 rounded-full border transition-colors"
              :class="user.active ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100' : 'border-gray-300 text-gray-500 bg-gray-50 hover:bg-gray-100'"
            >{{ user.active ? 'Activo' : 'Inactivo' }}</button>
            <button @click="removeUser(user.id)" class="text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
