<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../services/supabase'
import Button from '../components/ui/Button.vue'
import Card from '../components/ui/Card.vue'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const successMessage = ref('')

const handleRegister = async () => {
  loading.value = true
  error.value = ''
  successMessage.value = ''
  
  const { error: authError } = await supabase.auth.signUp({
    email: email.value,
    password: password.value
  })

  if (authError) {
    error.value = authError.message
  } else {
    successMessage.value = 'Registro exitoso. Puedes iniciar sesión ahora.'
    setTimeout(() => router.push('/login'), 2000)
  }
  loading.value = false
}
</script>

<template>
  <div class="min-h-screen bg-agron-bg-alt flex items-center justify-center p-4">
    <Card class="w-full max-w-md">
      <div class="p-8">
        <div class="text-center mb-8">
          <div class="w-12 h-12 rounded-lg bg-agron-green flex items-center justify-center mx-auto mb-4">
            <span class="text-white font-bold text-2xl">A</span>
          </div>
          <h2 class="text-2xl font-bold text-gray-900">Crear Cuenta</h2>
          <p class="text-gray-500 mt-2">Únete a AgronIA</p>
        </div>

        <form @submit.prevent="handleRegister" class="space-y-6">
          <div v-if="error" class="p-3 bg-agron-danger/10 text-agron-danger rounded text-sm">
            {{ error }}
          </div>
          <div v-if="successMessage" class="p-3 bg-agron-green-light text-agron-green-dark rounded text-sm">
            {{ successMessage }}
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
            <input 
              v-model="email" 
              type="email" 
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green focus:border-agron-green outline-none transition-colors"
              placeholder="tu@correo.com"
            >
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input 
              v-model="password" 
              type="password" 
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agron-green focus:border-agron-green outline-none transition-colors"
              placeholder="••••••••"
            >
          </div>

          <Button type="submit" variant="primary" class="w-full" :disabled="loading">
            {{ loading ? 'Registrando...' : 'Registrarse' }}
          </Button>
        </form>
        
        <p class="text-center text-sm text-gray-600 mt-6">
          ¿Ya tienes cuenta? 
          <RouterLink to="/login" class="text-agron-green font-medium hover:underline">
            Inicia sesión
          </RouterLink>
        </p>
      </div>
    </Card>
  </div>
</template>
