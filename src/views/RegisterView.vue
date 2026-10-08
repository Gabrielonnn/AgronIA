<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../services/supabase'
import {
  Mail, Lock, Eye, EyeOff, Leaf, AlertCircle,
  Loader2, ShieldCheck, AlertTriangle, CheckCircle2
} from 'lucide-vue-next'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const successMessage = ref('')
const showPassword = ref(false)
const capsLockOn = ref(false)
const progress = ref(0)

const passwordStrength = computed(() => {
  const value = password.value
  const checks = [
    value.length >= 8,
    /[a-z]/.test(value) && /[A-Z]/.test(value),
    /\d/.test(value),
    /[^a-zA-Z0-9]/.test(value)
  ]
  const score = checks.filter(Boolean).length
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte']
  return { score, label: labels[score] }
})

const backgroundLeaves = Array.from({ length: 10 }, (_, index) => ({
  id: index,
  style: {
    '--x': `${(index * 37 + 8) % 96}%`,
    '--delay': `${-index * 2.1}s`,
    '--duration': `${16 + (index % 5) * 2}s`,
    '--rotate': `${index * 47}deg`,
    '--sway-duration': `${3 + (index % 4) * 0.7}s`
  }
}))
const backgroundParticles = Array.from({ length: 22 }, (_, index) => ({
  id: index,
  style: {
    '--x': `${(index * 29 + 11) % 98}%`,
    '--delay': `${-index * 0.8}s`,
    '--duration': `${11 + (index % 6) * 2}s`,
    '--size': `${2 + (index % 4)}px`,
    '--drift-x': `${index % 2 ? 34 : -34}px`
  }
}))
const backgroundFireflies = Array.from({ length: 12 }, (_, index) => ({
  id: index,
  style: {
    '--x': `${(index * 41 + 13) % 96}%`,
    '--y': `${(index * 31 + 9) % 94}%`,
    '--delay': `${-index * 1.3}s`,
    '--duration': `${7 + (index % 5) * 1.5}s`,
    '--drift-x': `${index % 2 ? 18 : -18}px`,
    '--drift-y': `${index % 3 ? -22 : 22}px`
  }
}))
const backgroundDrones = Array.from({ length: 10 }, (_, index) => ({
  id: index,
  color: ['#78964c', '#ffc400', '#f58a00', '#b4d18b'][index % 4],
  style: {
    '--drone-y': `${8 + index * 9}%`,
    '--drone-size': `${38 + (index % 3) * 9}px`,
    '--drone-duration': `${19 + (index % 5) * 3}s`,
    '--drone-delay': `${-index * 2.7}s`,
    '--drone-direction': index % 2 ? 'reverse' : 'normal'
  }
}))

const checkCapsLock = (e: KeyboardEvent) => {
  capsLockOn.value = e.getModifierState && e.getModifierState('CapsLock')
}

onMounted(() => {
  window.addEventListener('keydown', checkCapsLock)
  window.addEventListener('keyup', checkCapsLock)
})
onUnmounted(() => {
  window.removeEventListener('keydown', checkCapsLock)
  window.removeEventListener('keyup', checkCapsLock)
})

const handleRegister = async () => {
  loading.value = true
  error.value = ''
  successMessage.value = ''
  progress.value = 15

  progress.value = 15

  try {
    progress.value = 35

    if (!supabase) {
      error.value = 'La configuración de Supabase no está disponible. Revisa las variables de entorno.'
      progress.value = 0
      return
    }

    const { error: authError } = await supabase.auth.signUp({
      email: email.value,
      password: password.value
    })

    progress.value = 80

    if (authError) {
      error.value = translateError(authError.message)
      progress.value = 0
    } else {
      successMessage.value = 'Registro exitoso. Puedes iniciar sesión ahora.'
      progress.value = 100
      setTimeout(() => router.push('/login'), 2000)
    }
  } catch (err: any) {
    error.value = 'Error inesperado al registrar. Intenta de nuevo.'
    progress.value = 0
  } finally {
    loading.value = false
  }
}

const translateError = (msg: string): string => {
  if (msg.includes('Password should')) return 'La contraseña es demasiado corta'
  if (msg.includes('User already registered')) return 'Este correo ya está registrado'
  return msg
}
</script>

<template>
  <div class="login-root">
    <div class="bg-grid"></div>
    <div class="field-contours"></div>
    <div class="glow glow-green"></div>
    <div class="glow glow-blue"></div>
    <div class="ambient-fireflies" aria-hidden="true">
      <span
        v-for="firefly in backgroundFireflies"
        :key="'firefly-' + firefly.id"
        class="firefly"
        :style="firefly.style"
      ></span>
    </div>

    <div class="drone-fleet" aria-hidden="true">
      <div
        v-for="drone in backgroundDrones"
        :key="'drone-' + drone.id"
        class="drone"
        :style="{ ...drone.style, color: drone.color }"
      >
        <svg viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="12" cy="10" rx="10" ry="2" fill="currentColor" opacity="0.42"/>
          <ellipse cx="52" cy="10" rx="10" ry="2" fill="currentColor" opacity="0.42"/>
          <rect x="24" y="12" width="16" height="8" rx="3" fill="#17200f" stroke="currentColor" stroke-width="1.5"/>
          <path d="M24 14 L12 10 M40 14 L52 10" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="32" cy="22" r="3" fill="currentColor"/>
          <circle cx="32" cy="22" r="6" fill="currentColor" opacity="0.28">
            <animate attributeName="r" values="6;9;6" dur="1.8s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.28;0;0.28" dur="1.8s" repeatCount="indefinite"/>
          </circle>
        </svg>
      </div>
    </div>

    <div class="trail trail-1"></div>
    <div class="trail trail-2"></div>
    <div class="scan-line"></div>

    <div class="leaves">
      <span
        v-for="leaf in backgroundLeaves"
        :key="'leaf-' + leaf.id"
        class="leaf"
        :style="leaf.style"
      >
        <Leaf :size="14" />
      </span>
    </div>

    <div class="particles">
      <span
        v-for="particle in backgroundParticles"
        :key="'p-' + particle.id"
        class="particle"
        :style="particle.style"
      ></span>
    </div>

    <div class="login-card">
      <div class="logo-wrapper">
        <div class="logo-ring ring-1"></div>
        <div class="logo-ring ring-2"></div>
        <div class="logo-pulse"></div>
        <Leaf class="logo-icon" :size="30" :stroke-width="2.5" />
      </div>

      <h1 class="title">
        Agron<span class="accent">IA</span>
      </h1>

      <div class="badge">
        <ShieldCheck :size="12" />
        <span>Crear cuenta</span>
      </div>

      <p class="subtitle">
        Únete a la red inteligente de monitoreo agrícola
      </p>

      <form @submit.prevent="handleRegister" class="form">
        <div v-if="error" class="error-box reveal-item">
          <AlertCircle :size="16" />
          <span>{{ translateError(error) }}</span>
        </div>

        <div v-if="successMessage" class="success-box reveal-item">
          <CheckCircle2 :size="16" />
          <span>{{ successMessage }}</span>
        </div>

        <div class="input-group reveal-item reveal-delay-1">
          <Mail class="input-icon" :size="18" />
          <input
            v-model="email"
            type="email"
            required
            placeholder="tu@correo.com"
            autocomplete="email"
            :disabled="loading"
            aria-label="Correo electrónico"
          />
        </div>

        <div class="input-wrapper reveal-item reveal-delay-2">
          <div class="input-group">
            <Lock class="input-icon" :size="18" />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              placeholder="••••••••"
              autocomplete="new-password"
              :disabled="loading"
              aria-label="Contraseña"
            />
            <button
              type="button"
              class="toggle-pass"
              @click="showPassword = !showPassword"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="showPassword"
            >
              <Eye v-if="!showPassword" :size="18" />
              <EyeOff v-else :size="18" />
            </button>
          </div>

          <Transition name="strength">
            <div v-if="password" class="password-strength" aria-live="polite">
              <div class="strength-heading">
                <span>Seguridad de la contraseña</span>
                <span class="strength-label" :class="`strength-${passwordStrength.score}`">
                  {{ passwordStrength.label }}
                </span>
              </div>
              <div
                class="strength-meter"
                role="meter"
                aria-label="Fortaleza de la contraseña"
                :aria-valuenow="passwordStrength.score"
                aria-valuemin="0"
                aria-valuemax="4"
              >
                <span
                  v-for="segment in 4"
                  :key="segment"
                  class="strength-segment"
                  :class="{ active: passwordStrength.score >= segment }"
                  :style="{ '--segment-index': segment }"
                ></span>
              </div>
              <span class="strength-hint">Usa 8 caracteres, mayúsculas, números y símbolos.</span>
            </div>
          </Transition>

          <transition name="fade">
            <div v-if="capsLockOn" class="caps-warning">
              <AlertTriangle :size="12" />
              <span>Bloq Mayús está activado</span>
            </div>
          </transition>
        </div>

        <transition name="fade">
          <div v-if="loading" class="progress-bar reveal-item">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
        </transition>

        <button
          type="submit"
          class="btn-login reveal-item reveal-delay-3"
          :disabled="loading"
        >
          <Loader2 v-if="loading" class="spin" :size="18" />
          <span>{{ loading ? 'Registrando usuario...' : 'Crear cuenta' }}</span>
        </button>
      </form>

      <p class="footer-text reveal-item reveal-delay-4">
        ¿Ya tienes cuenta?
        <RouterLink to="/login" class="footer-link">
          Inicia sesión
        </RouterLink>
      </p>
    </div>

    <div class="bottom-credit">
      © 2025 AgronIA · Tecnológico Nacional de México
    </div>
  </div>
</template>

<style scoped>
.login-root {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: #0B0F19;
  overflow: hidden;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(16, 185, 129, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16, 185, 129, 0.06) 1px, transparent 1px);
  background-size: 50px 50px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(130px);
  opacity: 0.45;
  pointer-events: none;
}
.glow-green {
  width: 520px; height: 520px;
  background: #10B981;
  top: -200px; left: -180px;
  animation: float 9s ease-in-out infinite;
}
.glow-blue {
  width: 460px; height: 460px;
  background: #3B82F6;
  bottom: -160px; right: -160px;
  animation: float 12s ease-in-out infinite reverse;
}
@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(40px, -40px) scale(1.1); }
}

.drone {
  position: absolute;
  width: 70px;
  pointer-events: none;
  z-index: 1;
  filter: drop-shadow(0 0 12px rgba(16, 185, 129, 0.6));
}
.drone svg { width: 100%; height: auto; }
.drone-1 {
  top: 12%;
  animation: flyRight 18s linear infinite;
}
.drone-2 {
  top: 70%;
  animation: flyLeft 22s linear infinite;
  animation-delay: 3s;
  filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.6));
}
.drone-3 {
  top: 40%;
  width: 50px;
  animation: flyZigzag 14s linear infinite;
  animation-delay: 6s;
  filter: drop-shadow(0 0 10px rgba(52, 211, 153, 0.7));
}
@keyframes flyRight {
  0% { left: -100px; transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-15px) rotate(3deg); }
  50% { transform: translateY(10px) rotate(-3deg); }
  75% { transform: translateY(-8px) rotate(2deg); }
  100% { left: calc(100% + 100px); transform: translateY(0) rotate(0deg); }
}
@keyframes flyLeft {
  0% { right: -100px; transform: translateY(0) scaleX(-1); }
  25% { transform: translateY(12px) scaleX(-1) rotate(-2deg); }
  50% { transform: translateY(-10px) scaleX(-1) rotate(2deg); }
  75% { transform: translateY(6px) scaleX(-1) rotate(-1deg); }
  100% { right: calc(100% + 100px); transform: translateY(0) scaleX(-1); }
}
@keyframes flyZigzag {
  0% { left: -80px; transform: translateY(0); }
  20% { transform: translateY(-30px); }
  40% { transform: translateY(20px); }
  60% { transform: translateY(-20px); }
  80% { transform: translateY(15px); }
  100% { left: calc(100% + 80px); transform: translateY(0); }
}

.trail {
  position: absolute;
  height: 1px;
  background: linear-gradient(90deg, transparent, #10B981, transparent);
  opacity: 0.6;
  pointer-events: none;
  filter: blur(1px);
}
.trail-1 {
  top: 13%;
  width: 120px;
  animation: trail1 18s linear infinite;
}
.trail-2 {
  top: 71%;
  width: 100px;
  background: linear-gradient(90deg, transparent, #3B82F6, transparent);
  animation: trail2 22s linear infinite;
  animation-delay: 3s;
}
@keyframes trail1 {
  0% { left: -120px; }
  100% { left: calc(100% + 20px); }
}
@keyframes trail2 {
  0% { right: -100px; }
  100% { right: calc(100% + 20px); }
}

.scan-line {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #10B981, transparent);
  opacity: 0.35;
  animation: scan 6s linear infinite;
  pointer-events: none;
  z-index: 1;
}
@keyframes scan {
  0% { top: 0%; opacity: 0; }
  10% { opacity: 0.6; }
  90% { opacity: 0.6; }
  100% { top: 100%; opacity: 0; }
}

.leaves {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.leaf {
  position: absolute;
  left: var(--x);
  top: -30px;
  color: #10B981;
  opacity: 0.4;
  animation: fall var(--duration) linear infinite;
  animation-delay: var(--delay);
}
.leaf svg {
  transform: rotate(var(--rotate));
  animation: sway 3s ease-in-out infinite;
}
@keyframes fall {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  10% { opacity: 0.5; }
  90% { opacity: 0.5; }
  100% { transform: translateY(100vh) translateX(60px); opacity: 0; }
}
@keyframes sway {
  0%, 100% { transform: rotate(var(--rotate)) translateX(0); }
  50% { transform: rotate(calc(var(--rotate) + 20deg)) translateX(15px); }
}

.particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.particle {
  position: absolute;
  left: var(--x);
  bottom: -10px;
  width: var(--size);
  height: var(--size);
  background: #10B981;
  border-radius: 50%;
  opacity: 0;
  box-shadow: 0 0 8px #10B981;
  animation: rise var(--duration) linear infinite;
  animation-delay: var(--delay);
}
@keyframes rise {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  10% { opacity: 0.8; }
  90% { opacity: 0.8; }
  100% { transform: translateY(-100vh) translateX(30px); opacity: 0; }
}

.login-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 430px;
  padding: 48px 40px 40px;
  border-radius: 24px;
  background: rgba(17, 24, 39, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(16, 185, 129, 0.25);
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset,
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  text-align: center;
}

.logo-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin-bottom: 22px;
  border-radius: 20px;
  background: linear-gradient(135deg, #10B981, #059669);
  box-shadow:
    0 12px 32px rgba(16, 185, 129, 0.45),
    0 0 40px rgba(16, 185, 129, 0.2);
}
.logo-icon {
  color: #0B0F19;
  z-index: 3;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}
.logo-pulse {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  background: #10B981;
  animation: pulse 2.5s ease-out infinite;
  z-index: 1;
}
.logo-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid #10B981;
  opacity: 0.4;
  pointer-events: none;
}
.ring-1 {
  inset: -12px;
  animation: ringPulse 3s ease-out infinite;
}
.ring-2 {
  inset: -24px;
  animation: ringPulse 3s ease-out infinite 1s;
}
@keyframes pulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.7); opacity: 0; }
}
@keyframes ringPulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  100% { transform: scale(1.4); opacity: 0; }
}

.title {
  font-size: 32px;
  font-weight: 800;
  color: #F8FAFC;
  margin: 0 0 10px;
  letter-spacing: -0.8px;
}
.accent { color: #10B981; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  margin-bottom: 14px;
  border-radius: 20px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #34D399;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.subtitle {
  font-size: 13px;
  color: #94A3B8;
  margin-bottom: 30px;
  line-height: 1.5;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
}

.error-box,
.success-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-radius: 10px;
  font-size: 13px;
}

.error-box {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #F87171;
}
.success-box {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #86EFAC;
}

.input-wrapper { display: flex; flex-direction: column; gap: 6px; }

.input-group {
  position: relative;
  display: flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px;
  padding: 0 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.input-group:hover {
  border-color: rgba(16, 185, 129, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 12px 22px rgba(16, 185, 129, 0.08);
}
.input-group:focus-within {
  border-color: #10B981;
  box-shadow:
    0 0 0 4px rgba(16, 185, 129, 0.15),
    0 8px 20px rgba(16, 185, 129, 0.1);
  transform: translateY(-1px) scale(1.01);
  background: rgba(15, 23, 42, 1);
}
.input-icon {
  color: #64748B;
  margin-right: 12px;
  flex-shrink: 0;
  transition: color 0.3s ease;
}
.input-group:focus-within .input-icon {
  color: #10B981;
}
.input-group input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  padding: 15px 0;
  color: #F8FAFC;
  font-size: 14px;
  font-family: inherit;
}
.input-group input::placeholder { color: #64748B; }
.input-group input:disabled { opacity: 0.6; cursor: not-allowed; }

.toggle-pass {
  background: none;
  border: none;
  color: #64748B;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}
.toggle-pass:hover {
  color: #10B981;
  background: rgba(16, 185, 129, 0.1);
}

.caps-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  color: #FBBF24;
  font-size: 11px;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.progress-bar {
  width: 100%;
  height: 3px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #10B981, #34D399);
  border-radius: 2px;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
  transition: width 0.4s ease;
}

.btn-login {
  margin-top: 6px;
  padding: 15px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #10B981, #059669);
  color: #0B0F19;
  font-weight: 700;
  font-size: 15px;
  font-family: inherit;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s ease;
  box-shadow:
    0 8px 24px rgba(16, 185, 129, 0.35),
    0 0 0 1px rgba(16, 185, 129, 0.5) inset;
}
.btn-login::before {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  transition: left 0.6s;
}
.btn-login:hover:not(:disabled)::before { left: 100%; }
.btn-login:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.01);
  box-shadow:
    0 12px 32px rgba(16, 185, 129, 0.5),
    0 0 0 1px rgba(16, 185, 129, 0.8) inset;
}
.btn-login:disabled { opacity: 0.8; cursor: not-allowed; }

.btn-login:active:not(:disabled) {
  transform: translateY(0) scale(0.99);
}

.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.footer-text {
  margin-top: 26px;
  font-size: 13px;
  color: #64748B;
}
.footer-link {
  color: #10B981;
  text-decoration: none;
  font-weight: 600;
  margin-left: 4px;
  transition: all 0.2s;
}
.footer-link:hover {
  color: #34D399;
  text-decoration: underline;
  transform: translateX(2px);
  display: inline-block;
}

.bottom-credit {
  position: absolute;
  bottom: 20px;
  left: 0; right: 0;
  text-align: center;
  font-size: 11px;
  color: #475569;
  letter-spacing: 0.3px;
  z-index: 2;
}

@media (max-width: 480px) {
  .login-card {
    padding: 36px 26px 32px;
    border-radius: 20px;
  }
  .title { font-size: 26px; }
  .glow { opacity: 0.3; }
  .badge { font-size: 10px; }
  .drone { width: 50px; }
  .drone-3 { width: 38px; }
}

@media (prefers-reduced-motion: reduce) {
  .drone, .trail, .leaf, .particle, .scan-line, .logo-pulse, .logo-ring {
    animation: none !important;
  }
}

.login-root {
  --palette-olive: #34480d;
  --palette-leaf: #78964c;
  --palette-gold: #ffc400;
  --palette-orange: #f58a00;
  --palette-earth: #4c2b08;
  background:
    radial-gradient(ellipse at 10% 12%, rgba(120, 150, 76, 0.19), transparent 34%),
    radial-gradient(ellipse at 90% 88%, rgba(245, 138, 0, 0.15), transparent 38%),
    #10150e;
}

.bg-grid {
  background-image:
    linear-gradient(rgba(255, 196, 0, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 196, 0, 0.055) 1px, transparent 1px);
}

.glow-green { background: var(--palette-leaf); }
.glow-blue { background: var(--palette-orange); }
.drone-2 { filter: drop-shadow(0 0 12px rgba(245, 138, 0, 0.65)); }
.drone-3 { filter: drop-shadow(0 0 10px rgba(255, 196, 0, 0.7)); }
.trail-1 { background: linear-gradient(90deg, transparent, var(--palette-leaf), transparent); }
.trail-2 { background: linear-gradient(90deg, transparent, var(--palette-orange), transparent); }
.scan-line { background: linear-gradient(90deg, transparent, var(--palette-gold), transparent); }
.leaf { color: var(--palette-leaf); }
.particle { background: var(--palette-gold); box-shadow: 0 0 8px var(--palette-gold); }

.login-card {
  animation: card-arrive 0.75s cubic-bezier(0.2, 0.8, 0.2, 1);
  background: rgba(28, 32, 21, 0.88);
  border-color: rgba(255, 196, 0, 0.23);
}

.reveal-item { animation: reveal-rise 0.62s cubic-bezier(0.2, 0.75, 0.25, 1) both; }
.reveal-delay-1 { animation-delay: 0.08s; }
.reveal-delay-2 { animation-delay: 0.16s; }
.reveal-delay-3 { animation-delay: 0.24s; }
.reveal-delay-4 { animation-delay: 0.32s; }

.logo-wrapper,
.btn-login {
  background: linear-gradient(135deg, var(--palette-gold), var(--palette-orange));
  box-shadow: 0 12px 32px rgba(245, 138, 0, 0.28), 0 0 0 1px rgba(255, 196, 0, 0.26) inset;
}

.logo-icon { color: var(--palette-earth); }
.logo-pulse { background: var(--palette-gold); }
.logo-ring { border-color: var(--palette-gold); }
.accent, .footer-link { color: var(--palette-gold); }
.badge {
  color: #f5cc54;
  background: rgba(255, 196, 0, 0.08);
  border-color: rgba(255, 196, 0, 0.22);
}
.success-box {
  color: #e8d99b;
  background: rgba(120, 150, 76, 0.12);
  border-color: rgba(120, 150, 76, 0.3);
}

.input-group:hover {
  border-color: rgba(255, 196, 0, 0.38);
  box-shadow: 0 12px 22px rgba(255, 196, 0, 0.07);
}
.input-group:focus-within {
  border-color: var(--palette-gold);
  box-shadow: 0 0 0 4px rgba(255, 196, 0, 0.12), 0 8px 20px rgba(245, 138, 0, 0.1);
}
.input-group:focus-within .input-icon, .toggle-pass:hover { color: var(--palette-gold); }
.toggle-pass:hover { background: rgba(255, 196, 0, 0.1); }
.progress-fill { background: linear-gradient(90deg, var(--palette-leaf), var(--palette-gold), var(--palette-orange)); }
.btn-login { color: var(--palette-earth); }
.footer-link:hover { color: #ffdc55; }

@keyframes card-arrive {
  from { opacity: 0; transform: translateY(22px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes reveal-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.login-root::before,
.login-root::after {
  position: absolute;
  z-index: 0;
  width: min(58vw, 520px);
  aspect-ratio: 1;
  border: 1px solid rgba(255, 196, 0, 0.07);
  border-radius: 50%;
  content: '';
  pointer-events: none;
  animation: field-orbit 24s linear infinite;
}

.login-root::before {
  top: -30%;
  right: -22%;
  box-shadow: 0 0 0 28px rgba(255, 196, 0, 0.018), 0 0 0 58px rgba(120, 150, 76, 0.025);
}

.login-root::after {
  bottom: -45%;
  left: -24%;
  width: min(72vw, 650px);
  border-color: rgba(120, 150, 76, 0.09);
  box-shadow: 0 0 0 32px rgba(120, 150, 76, 0.018), 0 0 0 66px rgba(245, 138, 0, 0.018);
  animation-direction: reverse;
  animation-duration: 32s;
}

.login-card {
  border-color: rgba(255, 196, 0, 0.3);
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.035) inset,
    0 0 42px rgba(255, 196, 0, 0.045);
  transition: transform 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
}

.login-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 196, 0, 0.43);
  box-shadow:
    0 36px 88px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.045) inset,
    0 0 54px rgba(255, 196, 0, 0.075);
}

.password-strength {
  display: grid;
  gap: 8px;
  padding: 0 3px;
  animation: reveal-rise 0.3s ease both;
}

.strength-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #a9ad9c;
  font-size: 11px;
}

.strength-label { font-weight: 700; }
.strength-0, .strength-1 { color: #ff9b70; }
.strength-2 { color: #f5cc54; }
.strength-3, .strength-4 { color: #b4d18b; }

.strength-meter {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}

.strength-segment {
  height: 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  transition: background 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}

.strength-segment.active {
  background: linear-gradient(90deg, var(--palette-leaf), var(--palette-gold));
  box-shadow: 0 0 10px rgba(255, 196, 0, 0.2);
  animation: segment-arrive 0.3s calc(var(--segment-index) * 45ms) both;
}

.strength-hint {
  color: #777c6d;
  font-size: 10px;
  line-height: 1.4;
}

.strength-enter-active, .strength-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.strength-enter-from, .strength-leave-to { opacity: 0; transform: translateY(-4px); }

.logo-wrapper { animation: logo-glow 4s ease-in-out infinite; }
.badge { animation: badge-hover 4.5s ease-in-out infinite; }

.badge::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--palette-gold);
  box-shadow: 0 0 0 0 rgba(255, 196, 0, 0.55);
  content: '';
  animation: status-pulse 2s ease-out infinite;
}

.input-group {
  transition: border-color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}

.input-group:focus-within .input-icon { transform: scale(1.12); }
.input-icon { transition: color 0.3s ease, transform 0.3s ease; }

.error-box,
.success-box {
  animation: message-arrive 0.42s ease-out both;
}

.error-box { animation-name: message-arrive, error-nudge; animation-duration: 0.42s, 0.38s; animation-delay: 0s, 0.12s; }
.success-box { animation-name: message-arrive, success-pop; animation-duration: 0.42s, 0.55s; }

.btn-login:focus-visible,
.toggle-pass:focus-visible,
.footer-link:focus-visible {
  outline: 2px solid var(--palette-gold);
  outline-offset: 4px;
}

.btn-login::before { z-index: 0; }
.btn-login > * { position: relative; z-index: 1; }
.btn-login:hover:not(:disabled) { filter: saturate(1.12) brightness(1.04); }
.progress-fill { position: relative; overflow: hidden; }
.progress-fill::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.52), transparent);
  content: '';
  animation: progress-glint 1.4s ease-in-out infinite;
}

@keyframes field-orbit { to { transform: rotate(360deg); } }
@keyframes logo-glow {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(255, 196, 0, 0)); }
  50% { filter: drop-shadow(0 0 12px rgba(255, 196, 0, 0.28)); }
}
@keyframes badge-hover {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes status-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 196, 0, 0.48); }
  70%, 100% { box-shadow: 0 0 0 6px rgba(255, 196, 0, 0); }
}
@keyframes message-arrive {
  from { opacity: 0; transform: translateY(-7px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes error-nudge {
  0%, 100% { translate: 0; }
  25% { translate: -4px; }
  75% { translate: 4px; }
}
@keyframes success-pop {
  0% { transform: scale(0.96); }
  55% { transform: scale(1.025); }
  100% { transform: scale(1); }
}
@keyframes progress-glint {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}
@keyframes segment-arrive {
  from { transform: scaleX(0.6); }
  to { transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .login-card, .reveal-item, .login-root::before, .login-root::after,
  .logo-wrapper, .badge, .badge::before, .error-box, .success-box,
  .progress-fill::after, .password-strength, .strength-segment.active {
    animation: none !important;
  }

  .login-card:hover { transform: none; }
  .strength-enter-active, .strength-leave-active { transition-duration: 0.01ms !important; }
}

.bg-grid {
  animation: grid-breathe 16s ease-in-out infinite alternate;
}

.bg-grid::after {
  position: absolute;
  inset: -45%;
  background: radial-gradient(ellipse at center, rgba(255, 196, 0, 0.075), transparent 58%);
  content: '';
  pointer-events: none;
  animation: light-sweep 24s ease-in-out infinite alternate;
}

.field-contours {
  position: absolute;
  z-index: 0;
  inset: -24%;
  background: repeating-radial-gradient(
    ellipse at 50% 82%,
    transparent 0 32px,
    rgba(120, 150, 76, 0.075) 33px,
    transparent 34px 58px
  );
  opacity: 0.48;
  mask-image: linear-gradient(to bottom, transparent 3%, black 32%, black 82%, transparent 100%);
  pointer-events: none;
  animation: contour-flow 48s ease-in-out infinite alternate;
}

.glow { will-change: opacity, transform; }
.glow-green { animation: glow-drift-green 18s ease-in-out infinite alternate; }
.glow-blue { animation: glow-drift-orange 22s ease-in-out infinite alternate; }

.ambient-fireflies {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.firefly {
  position: absolute;
  top: var(--y);
  left: var(--x);
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffd94a;
  box-shadow: 0 0 8px 2px rgba(255, 196, 0, 0.42), 0 0 22px rgba(255, 196, 0, 0.2);
  opacity: 0;
  animation: firefly-drift var(--duration) var(--delay) ease-in-out infinite;
}

.leaf { animation-duration: var(--duration); }
.leaf svg { animation-duration: var(--sway-duration); }
.particle { animation-name: rise; will-change: translate, opacity; }

.drone-1 {
  left: 0;
  animation: drone-glide-right 26s linear infinite;
}

.drone-2 {
  right: 0;
  animation: drone-glide-left 30s linear infinite;
}

.drone-3 {
  left: 0;
  animation: drone-glide-zigzag 22s linear infinite;
}

.drone svg { animation: drone-hover 3.8s ease-in-out infinite; }
.drone-2 svg { animation-delay: -1.2s; }
.drone-3 svg { animation-delay: -2.4s; }

.trail-1 {
  left: 0;
  animation: trail-glide-right 26s linear infinite;
}

.trail-2 {
  right: 0;
  animation: trail-glide-left 30s 3s linear infinite;
}

.scan-line {
  top: 0;
  will-change: transform, opacity;
  animation: scan-sweep 8s linear infinite;
}

@keyframes grid-breathe {
  from { opacity: 0.5; transform: translate3d(0, 0, 0); }
  to { opacity: 0.86; transform: translate3d(0, -10px, 0); }
}

@keyframes light-sweep {
  from { transform: translate3d(-12%, -6%, 0) scale(0.9); opacity: 0.55; }
  to { transform: translate3d(12%, 8%, 0) scale(1.12); opacity: 1; }
}

@keyframes contour-flow {
  from { transform: translate3d(-1.5%, 0, 0) scale(1); }
  to { transform: translate3d(1.5%, -1%, 0) scale(1.035); }
}

@keyframes glow-drift-green {
  from { translate: -10px 8px; scale: 0.96; opacity: 0.32; }
  to { translate: 46px -34px; scale: 1.08; opacity: 0.5; }
}

@keyframes glow-drift-orange {
  from { translate: 12px -8px; scale: 1.02; opacity: 0.3; }
  to { translate: -42px 30px; scale: 0.92; opacity: 0.47; }
}

@keyframes firefly-drift {
  0%, 100% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.65); }
  18%, 72% { opacity: 0.72; }
  50% { opacity: 1; transform: translate3d(var(--drift-x), var(--drift-y), 0) scale(1.15); }
}

@keyframes rise {
  0% { translate: 0 0; opacity: 0; }
  12% { opacity: 0.78; }
  82% { opacity: 0.65; }
  100% { translate: var(--drift-x) -105vh; opacity: 0; }
}

@keyframes drone-glide-right {
  from { translate: -120px 0; }
  to { translate: calc(100vw + 120px) 0; }
}

@keyframes drone-glide-left {
  from { translate: calc(100vw + 120px) 0; }
  to { translate: -120px 0; }
}

@keyframes drone-glide-zigzag {
  0% { translate: -100px 0; }
  25% { translate: 25vw -20px; }
  50% { translate: 50vw 12px; }
  75% { translate: 75vw -16px; }
  100% { translate: calc(100vw + 100px) 0; }
}

@keyframes drone-hover {
  0%, 100% { transform: translateY(0) rotate(0); }
  50% { transform: translateY(-5px) rotate(1.5deg); }
}

@keyframes trail-glide-right {
  from { translate: -140px 0; }
  to { translate: calc(100vw + 140px) 0; }
}

@keyframes trail-glide-left {
  from { translate: calc(100vw + 120px) 0; }
  to { translate: -120px 0; }
}

@keyframes scan-sweep {
  0% { transform: translateY(-5vh); opacity: 0; }
  12%, 82% { opacity: 0.48; }
  100% { transform: translateY(105vh); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .bg-grid, .bg-grid::after, .field-contours, .glow, .firefly,
  .drone, .drone svg, .trail, .scan-line, .leaf, .leaf svg, .particle {
    animation: none !important;
    will-change: auto;
  }

  .firefly { opacity: 0.22; }
}

.drone-fleet {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.drone-fleet .drone {
  top: var(--drone-y);
  left: 0;
  width: var(--drone-size);
  opacity: 0.72;
  filter: drop-shadow(0 0 9px currentColor);
  animation: drone-traffic var(--drone-duration) var(--drone-delay) linear infinite var(--drone-direction);
}

.drone-fleet .drone svg {
  width: 100%;
  height: auto;
}

@keyframes drone-traffic {
  from { translate: -12vw 0; }
  to { translate: 112vw 0; }
}

@media (max-width: 480px) {
  .drone-fleet .drone { opacity: 0.56; }
}

@media (prefers-reduced-motion: reduce) {
  .drone-fleet .drone { animation: none !important; }
}
</style>
