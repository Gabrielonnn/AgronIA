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

const handleLogin = async () => {
  loading.value = true
  error.value = ''
  
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  })

  if (authError) {
    error.value = authError.message
  } else {
    router.push('/')
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
          <h2 class="text-2xl font-bold text-gray-900">Iniciar Sesión</h2>
          <p class="text-gray-500 mt-2">Accede a tu panel de AgronIA</p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-6">
          <div v-if="error" class="p-3 bg-agron-danger/10 text-agron-danger rounded text-sm">
            {{ error }}
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
            {{ loading ? 'Iniciando...' : 'Entrar' }}
          </Button>
        </form>
        
        <p class="text-center text-sm text-gray-600 mt-6">
          ¿No tienes cuenta? 
          <RouterLink to="/registro" class="text-agron-green font-medium hover:underline">
            Regístrate aquí
          </RouterLink>
        </p>
      </div>
    </Card>
  </div>
</template>
