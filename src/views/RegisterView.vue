<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../services/supabase'
import {
  Mail, Lock, Eye, EyeOff, Leaf, AlertCircle, UserRound,
  Loader2, ShieldCheck, AlertTriangle, CheckCircle2, Sparkles, RefreshCw
} from 'lucide-vue-next'

const router = useRouter()
const agroniaMark = `${import.meta.env.BASE_URL}agronia-wordmark-mark.png`
const agroniaWordmark = `${import.meta.env.BASE_URL}agronia-wordmark.png`
const fullName = ref('')
const email = ref('')
const password = ref('')
const verificationCode = ref('')
const loading = ref(false)
const error = ref('')
const successMessage = ref('')
const verificationStep = ref(false)
const resendCooldown = ref(0)
const showPassword = ref(false)
const capsLockOn = ref(false)
const progress = ref(0)
const registerSuccess = ref(false)
let successRedirectTimeout: ReturnType<typeof setTimeout> | undefined
let resendInterval: ReturnType<typeof setInterval> | undefined

const backgroundDrones = Array.from({ length: 8 }, (_, index) => ({
  id: index,
  color: ['#78964c', '#ffc400', '#f58a00', '#b4d18b'][index % 4],
  style: {
    '--drone-y': `${9 + index * 11}%`,
    '--drone-size': `${38 + (index % 3) * 9}px`,
    '--drone-duration': `${19 + (index % 5) * 3}s`,
    '--drone-delay': `${-index * 2.7}s`,
    '--drone-direction': index % 2 ? 'reverse' : 'normal'
  }
}))

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
  if (successRedirectTimeout) clearTimeout(successRedirectTimeout)
  if (resendInterval) clearInterval(resendInterval)
})

const startResendCooldown = () => {
  if (resendInterval) clearInterval(resendInterval)
  resendCooldown.value = 60
  resendInterval = setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0 && resendInterval) {
      clearInterval(resendInterval)
      resendInterval = undefined
    }
  }, 1000)
}

const handleRegister = async () => {
  loading.value = true
  error.value = ''
  successMessage.value = ''
  progress.value = 15

  try {
    progress.value = 35

    if (!supabase) {
      error.value = 'La configuración de Supabase no está disponible. Revisa las variables de entorno.'
      progress.value = 0
      return
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: password.value,
      options: {
        data: {
          name: fullName.value.trim(),
          full_name: fullName.value.trim(),
        },
      },
    })

    progress.value = 80

    if (authError) {
      error.value = translateError(authError.message)
      progress.value = 0
    } else if (data.session) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) throw signOutError
      error.value = 'El proyecto no está exigiendo confirmar el correo. Activa la confirmación de email en Supabase para completar el registro con código.'
      progress.value = 0
    } else {
      verificationStep.value = true
      successMessage.value = `Enviamos un código de verificación a ${email.value.trim()}.`
      startResendCooldown()
      progress.value = 100
    }
  } catch (err: unknown) {
    error.value = err instanceof Error
      ? translateError(err.message)
      : 'Error inesperado al registrar. Intenta de nuevo.'
    progress.value = 0
  } finally {
    loading.value = false
  }
}

const handleVerifyCode = async () => {
  loading.value = true
  error.value = ''
  progress.value = 35

  try {
    if (!supabase) {
      error.value = 'La configuración de Supabase no está disponible. Revisa las variables de entorno.'
      progress.value = 0
      return
    }

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.value.trim(),
      token: verificationCode.value.trim(),
      type: 'signup',
    })

    if (verifyError) {
      error.value = translateError(verifyError.message)
      progress.value = 0
      return
    }

    if (!data.session) {
      error.value = 'No se pudo confirmar la cuenta. Solicita un nuevo código e inténtalo otra vez.'
      progress.value = 0
      return
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    if (signOutError) throw signOutError

    progress.value = 100
    registerSuccess.value = true
    successRedirectTimeout = setTimeout(() => router.push('/login'), 3500)
  } catch (err: unknown) {
    error.value = err instanceof Error
      ? translateError(err.message)
      : 'Error inesperado al verificar el correo. Intenta de nuevo.'
    progress.value = 0
  } finally {
    loading.value = false
  }
}

const resendVerificationCode = async () => {
  if (!supabase || resendCooldown.value > 0 || loading.value) return

  loading.value = true
  error.value = ''
  successMessage.value = ''

  try {
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.value.trim(),
    })

    if (resendError) {
      error.value = translateError(resendError.message)
      return
    }

    successMessage.value = `Enviamos un nuevo código a ${email.value.trim()}.`
    verificationCode.value = ''
    startResendCooldown()
  } catch (err: unknown) {
    error.value = err instanceof Error
      ? translateError(err.message)
      : 'No se pudo reenviar el código. Intenta de nuevo.'
  } finally {
    loading.value = false
  }
}

const handleSubmit = () => verificationStep.value ? handleVerifyCode() : handleRegister()

const translateError = (msg: string): string => {
  if (msg.includes('Password should')) return 'La contraseña es demasiado corta'
  if (msg.includes('User already registered')) return 'Este correo ya está registrado'
  if (/invalid.*(token|otp)|token.*(expired|invalid)|otp.*expired/i.test(msg)) {
    return 'El código no es válido o ya venció. Solicita uno nuevo e inténtalo otra vez.'
  }
  if (/too many requests|rate limit/i.test(msg)) {
    return 'Se hicieron demasiados intentos. Espera un momento antes de volver a intentarlo.'
  }
  if (/abort|timeout|timed out|failed to fetch|networkerror/i.test(msg)) {
    return 'No se pudo conectar con el servicio de registro. Comprueba tu conexión y la configuración de Supabase.'
  }
  return msg
}
</script>

<template>
  <div class="login-root">
    <div class="drone-fleet" aria-hidden="true">
      <div
        v-for="drone in backgroundDrones"
        :key="'drone-' + drone.id"
        class="drone"
        :style="{ ...drone.style, color: drone.color }"
      >
        <svg viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="12" cy="10" rx="10" ry="2" fill="currentColor" opacity="0.42" />
          <ellipse cx="52" cy="10" rx="10" ry="2" fill="currentColor" opacity="0.42" />
          <rect x="24" y="12" width="16" height="8" rx="3" fill="#17200f" stroke="currentColor" stroke-width="1.5" />
          <path d="M24 14 12 10m28 4 12-4" stroke="currentColor" stroke-width="1.5" />
          <circle cx="32" cy="22" r="3" fill="currentColor" />
          <circle cx="32" cy="22" r="6" fill="currentColor" opacity="0.28">
            <animate attributeName="r" values="6;9;6" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.28;0;0.28" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </div>
    <div class="auth-shell">
      <aside class="story-panel">
        <RouterLink to="/" class="story-brand" aria-label="AgronIA, inicio">
          <img class="story-brand-wordmark" :src="agroniaWordmark" alt="" />
        </RouterLink>

        <div class="story-copy">
          <p class="story-eyebrow"><span></span> Agricultura de precisión</p>
          <h2>Decisiones más claras.<br /><em>Cultivos más fuertes.</em></h2>
          <p class="story-description">
            Conecta tus parcelas con información inteligente y lleva cada temporada más lejos.
          </p>
        </div>

        <div class="field-visual" aria-hidden="true">
          <div class="field-orbit field-orbit-outer"></div>
          <div class="field-orbit field-orbit-inner"></div>
          <div class="field-sun"></div>
          <div class="field-row field-row-one"></div>
          <div class="field-row field-row-two"></div>
          <div class="field-row field-row-three"></div>
          <div class="field-row field-row-four"></div>
          <div class="field-pin"><Leaf :size="18" /></div>
          <div class="field-data-card">
            <span class="field-data-icon"><ShieldCheck :size="15" /></span>
            <span><strong>Tu campo, en perspectiva</strong><small>Información para crecer mejor</small></span>
            <span class="field-data-status"></span>
          </div>
        </div>

        <div class="story-footnote">
          <span class="story-footnote-line"></span>
          <span>Tecnología con raíces en el campo</span>
        </div>
      </aside>

      <main class="login-card">
        <div class="form-heading">
          <div class="logo-wrapper">
            <img class="form-brand-mark" :src="agroniaMark" alt="" />
          </div>
          <div class="form-heading-copy">
            <p class="badge"><ShieldCheck :size="13" /><span>Acceso a AgronIA</span></p>
            <h1 class="title">{{ verificationStep ? 'Verifica tu correo' : 'Crea tu cuenta' }}</h1>
          </div>
        </div>

        <p class="subtitle">
          {{ verificationStep
            ? 'Confirma que esta dirección de correo te pertenece para continuar.'
            : 'Empieza a tomar decisiones con más contexto y confianza.' }}
        </p>

        <form @submit.prevent="handleSubmit" class="form">
          <div v-if="error" class="error-box reveal-item">
            <AlertCircle :size="16" />
            <span>{{ translateError(error) }}</span>
          </div>

          <div v-if="successMessage" class="success-box reveal-item">
            <CheckCircle2 :size="16" />
            <span>{{ successMessage }}</span>
          </div>

          <template v-if="!verificationStep">
          <div class="input-wrapper reveal-item reveal-delay-1">
            <label class="field-label" for="register-name">Nombre completo</label>
            <div class="input-group">
              <UserRound class="input-icon" :size="18" />
              <input
                id="register-name"
                v-model="fullName"
                type="text"
                required
                maxlength="120"
                placeholder="Tu nombre"
                autocomplete="name"
                :disabled="loading"
              />
            </div>
          </div>

          <div class="input-wrapper reveal-item reveal-delay-2">
            <label class="field-label" for="register-email">Correo electrónico</label>
            <div class="input-group">
              <Mail class="input-icon" :size="18" />
              <input
                id="register-email"
                v-model="email"
                type="email"
                required
                placeholder="tu@correo.com"
                autocomplete="email"
                :disabled="loading"
                aria-label="Correo electrónico"
              />
            </div>
          </div>

          <div class="input-wrapper reveal-item reveal-delay-3">
            <label class="field-label" for="register-password">Contraseña</label>
            <div class="input-group">
              <Lock class="input-icon" :size="18" />
              <input
                id="register-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                minlength="8"
                placeholder="Crea una contraseña segura"
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
          </template>

            <div v-else class="verification-panel reveal-item">
              <div class="verification-icon"><Mail :size="21" /></div>
              <p class="verification-label">Código de 6 dígitos</p>
              <div class="input-group verification-input-group">
                <input
                  id="register-verification-code"
                  v-model="verificationCode"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxlength="6"
                  required
                  placeholder="000000"
                  :disabled="loading"
                  aria-label="Código de verificación de seis dígitos"
                />
              </div>
              <p class="verification-hint">Revisa también la carpeta de correo no deseado.</p>
              <button
                type="button"
                class="resend-code"
                :disabled="loading || resendCooldown > 0"
                @click="resendVerificationCode"
              >
                <RefreshCw :size="14" :class="{ 'spin': loading }" />
                {{ resendCooldown > 0 ? `Reenviar código en ${resendCooldown}s` : 'Enviar un nuevo código' }}
              </button>
            </div>

          <transition name="fade">
            <div v-if="loading" class="progress-bar reveal-item">
              <div class="progress-fill" :style="{ width: progress + '%' }"></div>
            </div>
          </transition>

          <button
            type="submit"
            class="btn-login reveal-item reveal-delay-4"
            :disabled="loading || (verificationStep && verificationCode.length !== 6)"
          >
            <Loader2 v-if="loading" class="spin" :size="18" />
            <span>{{ loading
              ? (verificationStep ? 'Verificando código...' : 'Registrando usuario...')
              : (verificationStep ? 'Verificar y continuar' : 'Crear cuenta') }}</span>
          </button>
        </form>

        <p v-if="!verificationStep" class="review-note"><ShieldCheck :size="15" /> Cada cuenta requiere aprobación antes de activar el acceso.</p>
        <p v-else class="review-note"><ShieldCheck :size="15" /> Después de confirmar tu correo, un administrador revisará tu solicitud.</p>

        <p class="footer-text reveal-item reveal-delay-5">
          ¿Ya tienes cuenta?
          <RouterLink to="/login" class="footer-link">
            Inicia sesión
          </RouterLink>
        </p>
      </main>
    </div>

    <Transition name="login-success">
      <div v-if="registerSuccess" class="login-success-overlay" role="status" aria-live="polite">
        <div class="success-orbit success-orbit-one" style="border-color: rgba(245, 138, 0, 0.2)"></div>
        <div class="success-orbit success-orbit-two" style="border-color: rgba(245, 138, 0, 0.1)"></div>
        <div class="success-content">
          <div class="success-icon" style="background: linear-gradient(135deg, #f58a00, #ffc400); box-shadow: 0 0 30px rgba(245, 138, 0, 0.4)">
            <CheckCircle2 :size="42" :stroke-width="1.8" />
            <Sparkles class="success-sparkle" :size="20" />
          </div>
          <p class="success-eyebrow" style="color: #f58a00">Correo verificado</p>
          <h2>Solicitud recibida</h2>
          <p>Un administrador revisará tu solicitud antes de activar el acceso.</p>
          <div class="success-progress"><span style="background: linear-gradient(90deg, #f58a00, #ffc400)"></span></div>
        </div>
      </div>
    </Transition>

    <div class="bottom-credit">
      © 2026 AgronIA · Tecnológico Nacional de México
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

.login-root {
  --palette-forest: #203d2e;
  --palette-leaf: #64866c;
  --palette-gold: #d6a85b;
  --palette-orange: #c7863e;
  --palette-earth: #27372c;
  display: grid;
  grid-template-rows: 1fr auto;
  justify-items: center;
  align-items: center;
  gap: 18px;
  min-height: 100svh;
  padding: clamp(24px, 5vh, 48px) 32px 22px;
  overflow-x: hidden;
  overflow-y: auto;
  background:
    radial-gradient(ellipse at 10% 10%, rgba(93, 122, 88, 0.24), transparent 38%),
    radial-gradient(ellipse at 93% 94%, rgba(168, 117, 60, 0.12), transparent 35%),
    #111a14;
}

.auth-shell {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1.03fr) minmax(400px, 0.97fr);
  width: min(1080px, 100%);
  min-height: 610px;
  overflow: hidden;
  border: 1px solid rgba(225, 232, 216, 0.13);
  border-radius: 28px;
  background: #faf9f5;
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.34), 0 1px 0 rgba(255, 255, 255, 0.08) inset;
  animation: card-arrive 0.65s cubic-bezier(0.2, 0.75, 0.25, 1) both;
}

.story-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 38px 44px 30px;
  overflow: hidden;
  color: #f4f2e8;
  background:
    radial-gradient(ellipse at 90% 6%, rgba(208, 168, 91, 0.13), transparent 36%),
    linear-gradient(150deg, #243d2d 0%, #1b3024 52%, #15271d 100%);
}

.story-panel::before,
.story-panel::after {
  position: absolute;
  border: 1px solid rgba(221, 219, 176, 0.08);
  border-radius: 50%;
  content: '';
  pointer-events: none;
}

.story-panel::before {
  top: 30%;
  left: -30%;
  width: 112%;
  aspect-ratio: 1;
}

.story-panel::after {
  top: 34%;
  left: -24%;
  width: 100%;
  aspect-ratio: 1;
}

.story-brand {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  color: #f5f4eb;
  font-size: 17px;
  font-weight: 720;
  letter-spacing: -0.45px;
  text-decoration: none;
}

.story-brand-wordmark {
  display: block;
  width: clamp(112px, 12vw, 142px);
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 5px 14px rgba(0, 0, 0, 0.2));
}

.story-copy {
  position: relative;
  z-index: 1;
  max-width: 430px;
  margin-top: 60px;
}

.story-eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 19px;
  color: #d3c7a7;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.story-eyebrow span,
.field-data-status {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d9b96e;
  box-shadow: 0 0 12px rgba(217, 185, 110, 0.6);
}

.story-copy h2 {
  margin: 0;
  color: #fbfaf3;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(34px, 3.6vw, 46px);
  font-weight: 500;
  letter-spacing: -1.7px;
  line-height: 1.1;
}

.story-copy h2 em {
  color: #d7bb79;
  font-weight: 400;
}

.story-description {
  max-width: 350px;
  margin: 18px 0 0;
  color: rgba(232, 234, 220, 0.72);
  font-size: 13px;
  line-height: 1.75;
}

.field-visual {
  position: relative;
  min-height: 204px;
  flex: 1;
  margin: 16px -8px 0;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(ellipse at 50% 88%, rgba(151, 166, 106, 0.23), transparent 53%),
    linear-gradient(180deg, transparent 5%, rgba(13, 34, 24, 0.16) 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, #000 16%, #000 90%, transparent 100%);
}

.verification-panel {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 18px 0 4px;
  text-align: center;
}

.verification-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid #e1e8dc;
  border-radius: 15px;
  color: #527456;
  background: #eff4eb;
}

.verification-label {
  margin: 3px 0 0;
  color: #39463a;
  font-size: 12px;
  font-weight: 650;
}

.verification-input-group {
  width: min(100%, 300px);
  justify-content: center;
}

.verification-input-group input {
  flex: 0 1 190px;
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.45em;
  font-variant-numeric: tabular-nums;
}

.verification-hint {
  margin: 0;
  color: #858d81;
  font-size: 10px;
}

.resend-code {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  color: #527456;
  background: transparent;
  font-size: 11px;
  font-weight: 650;
}

.resend-code:hover:not(:disabled) { background: #eff4eb; }
.resend-code:disabled { color: #a4aaa0; cursor: not-allowed; }
.resend-code:focus-visible { outline: 2px solid #8a7043; outline-offset: 2px; }

.field-orbit {
  position: absolute;
  left: 50%;
  bottom: -59%;
  width: 108%;
  aspect-ratio: 1;
  border: 1px solid rgba(213, 196, 142, 0.24);
  border-radius: 50%;
  transform: translateX(-50%);
}

.field-orbit-inner {
  bottom: -69%;
  width: 86%;
  border-color: rgba(213, 196, 142, 0.18);
}

.field-sun {
  position: absolute;
  top: 16%;
  right: 17%;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(230, 205, 137, 0.45);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(226, 194, 117, 0.2), rgba(226, 194, 117, 0.02) 70%);
}

.field-row {
  position: absolute;
  left: 50%;
  bottom: -52%;
  width: 126%;
  height: 113%;
  border: 1px solid rgba(215, 198, 147, 0.22);
  border-radius: 48%;
  transform: translateX(-50%) rotate(-9deg);
}

.field-row-two { width: 108%; bottom: -57%; transform: translateX(-50%) rotate(8deg); }
.field-row-three { width: 90%; bottom: -63%; transform: translateX(-50%) rotate(-7deg); }
.field-row-four { width: 72%; bottom: -69%; transform: translateX(-50%) rotate(6deg); }

.field-pin {
  position: absolute;
  top: 31%;
  left: 50%;
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(230, 209, 153, 0.45);
  border-radius: 14px;
  color: #e4c777;
  background: rgba(30, 58, 40, 0.88);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.23);
  transform: translateX(-50%) rotate(-5deg);
}

.field-data-card {
  position: absolute;
  right: 2%;
  bottom: 22%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 230px;
  padding: 11px 13px;
  border: 1px solid rgba(236, 235, 216, 0.13);
  border-radius: 13px;
  background: rgba(29, 49, 36, 0.82);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(12px);
}

.field-data-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  color: #e1c376;
  background: rgba(218, 187, 111, 0.12);
}

.field-data-card strong,
.field-data-card small { display: block; }
.field-data-card strong { color: #f2f0e6; font-size: 10px; font-weight: 650; }
.field-data-card small { margin-top: 3px; color: rgba(224, 228, 211, 0.58); font-size: 9px; }
.field-data-status { width: 5px; height: 5px; margin-left: auto; }

.story-footnote {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 11px;
  color: rgba(227, 228, 211, 0.58);
  font-size: 10px;
  letter-spacing: 0.25px;
}

.story-footnote-line {
  width: 25px;
  height: 1px;
  background: #c9ab67;
}

.login-card {
  align-self: stretch;
  width: auto;
  max-width: none;
  padding: 54px clamp(34px, 4.2vw, 58px) 34px;
  border: 0;
  border-radius: 0;
  color: #29362c;
  background: #faf9f5;
  box-shadow: none;
  text-align: left;
  transition: none;
}

.login-card:hover {
  transform: none;
  border-color: transparent;
  box-shadow: none;
}

.form-heading {
  display: flex;
  align-items: center;
  gap: 15px;
}

.logo-wrapper {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  margin: 0;
  border: 1px solid #e6e9de;
  border-radius: 15px;
  background: #edf1e9;
  box-shadow: none;
  animation: none;
}

.story-brand-wordmark {
  animation: brand-arrive 0.8s 0.08s cubic-bezier(0.2, 0.75, 0.25, 1) both;
  transition: transform 0.3s ease, filter 0.3s ease;
}

.story-brand:hover .story-brand-wordmark {
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.28));
  transform: translateY(-2px);
}

.story-copy {
  animation: story-arrive 0.75s 0.18s cubic-bezier(0.2, 0.75, 0.25, 1) both;
}

.field-visual {
  animation: field-arrive 0.9s 0.3s cubic-bezier(0.2, 0.75, 0.25, 1) both;
}

.logo-wrapper {
  animation: logo-arrive 0.65s 0.12s cubic-bezier(0.2, 0.75, 0.25, 1) both;
}

.form-brand-mark {
  width: 40px;
  height: 40px;
  object-fit: contain;
  transition: transform 0.35s cubic-bezier(0.2, 0.75, 0.25, 1);
}

.logo-wrapper:hover .form-brand-mark {
  transform: rotate(-7deg) scale(1.05);
}

.logo-icon {
  z-index: 1;
  color: #3d6747;
  filter: none;
}

.form-heading-copy { min-width: 0; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  margin: 0 0 5px;
  border: 0;
  color: #71816c;
  background: transparent;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.15px;
  text-transform: uppercase;
  animation: none;
}

.badge::before { display: none; }

.title {
  margin: 0;
  color: #26372b;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 29px;
  font-weight: 500;
  letter-spacing: -0.8px;
  line-height: 1.1;
}

.subtitle {
  margin: 14px 0 26px;
  color: #7c8379;
  font-size: 12px;
  line-height: 1.65;
}

.form { gap: 17px; }
.input-wrapper { gap: 8px; }

.field-label {
  color: #39463a;
  font-size: 11px;
  font-weight: 650;
  transition: color 0.22s ease, transform 0.22s ease;
}

.input-wrapper:focus-within .field-label {
  color: #456b4d;
  transform: translateX(2px);
}

.input-group {
  position: relative;
  min-height: 49px;
  padding: 0 14px;
  border: 1px solid #e4e7df;
  border-radius: 11px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(26, 43, 30, 0.025);
  transition: border-color 0.28s ease, background 0.28s ease, box-shadow 0.28s ease, transform 0.28s ease;
}

.input-group::after {
  position: absolute;
  right: 14px;
  bottom: -1px;
  left: 14px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, #6e8c6f, #cfaa61);
  content: '';
  pointer-events: none;
  transform: scaleX(0);
  transform-origin: center;
  transition: transform 0.32s cubic-bezier(0.2, 0.75, 0.25, 1);
}

.input-group:hover {
  border-color: #c8d3c5;
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(37, 67, 45, 0.05);
}

.input-group:focus-within {
  border-color: #65846a;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(92, 128, 97, 0.1), 0 8px 18px rgba(37, 67, 45, 0.07);
  transform: translateY(-1px);
}

.input-group:focus-within::after { transform: scaleX(1); }

.input-icon { color: #98a095; }
.input-group:focus-within .input-icon {
  color: #56765b;
  filter: drop-shadow(0 2px 3px rgba(86, 118, 91, 0.16));
}

.input-group input {
  padding: 13px 0;
  color: #28372c;
  font-size: 12px;
  transition: color 0.2s ease;
}

.input-group input::placeholder { color: #aab0a7; }
.toggle-pass { color: #8a9389; }
.toggle-pass:hover {
  color: #456b4d;
  background: #eff3ed;
  transform: rotate(-6deg) scale(1.06);
}

.password-strength {
  gap: 7px;
  padding: 2px 1px 0;
}

.strength-heading { color: #818a7f; font-size: 10px; }
.strength-hint { color: #9aa095; font-size: 9px; }
.strength-segment { height: 3px; background: #e8ebe4; }
.strength-segment.active {
  background: linear-gradient(90deg, #789476, #cfaa61);
  box-shadow: 0 0 8px rgba(120, 148, 118, 0.2);
}

.caps-warning {
  border-color: #eed9a9;
  color: #8a6831;
  background: #fbf5e8;
}

.error-box {
  border-color: #f0d0c8;
  border-radius: 10px;
  color: #a64d3f;
  background: #fff3f0;
}

.success-box {
  border-color: #d4e2d0;
  color: #456b4d;
  background: #f0f6ee;
}

.progress-bar { background: #e8ebe4; }
.progress-fill {
  background: linear-gradient(90deg, #6e8c6f, #c8a45c);
  box-shadow: none;
}

.btn-login {
  min-height: 49px;
  margin-top: 1px;
  padding: 13px 16px;
  border: 1px solid #34583e;
  border-radius: 11px;
  color: #f7f6ee;
  background: linear-gradient(135deg, #426b4b, #31563c);
  box-shadow: 0 7px 16px rgba(49, 86, 60, 0.16), 0 1px 0 rgba(255, 255, 255, 0.15) inset;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.15px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.btn-login::before {
  left: 0;
  width: 42%;
  transform: translateX(-150%);
  transition: transform 0.7s ease;
  animation: button-shine 6.5s 1.2s ease-in-out infinite;
}

.btn-login:hover:not(:disabled)::before {
  left: 0;
  transform: translateX(310%);
  animation: none;
}

.btn-login:disabled::before { animation: none; }

.btn-login:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(49, 86, 60, 0.2);
}

.btn-login:active:not(:disabled) { transform: translateY(0); }
.btn-login:focus-visible, .toggle-pass:focus-visible, .footer-link:focus-visible {
  outline-color: #8a7043;
}

.review-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 16px 0 0;
  color: #8a9187;
  font-size: 10px;
}

.review-note svg { color: #788d71; }
.review-note:hover svg { animation: shield-nod 0.55s ease; }

.footer-text {
  margin: 20px 0 0;
  padding-top: 17px;
  border-top: 1px solid #eceee8;
  color: #858c82;
  font-size: 11px;
}

.footer-link {
  color: #456a4d;
  font-weight: 700;
}

.footer-link { transition: color 0.2s ease, transform 0.2s ease; }
.footer-link:hover {
  display: inline-block;
  color: #2f5739;
  transform: translateX(2px);
}

.bottom-credit {
  position: static;
  color: rgba(220, 224, 210, 0.48);
  font-size: 9px;
  letter-spacing: 0.55px;
}

@media (max-width: 900px) {
  .auth-shell {
    grid-template-columns: minmax(0, 0.95fr) minmax(370px, 1.05fr);
    min-height: 570px;
  }

  .story-panel { padding: 32px 30px 26px; }
  .story-copy { margin-top: 48px; }
  .story-copy h2 { font-size: 36px; }
  .login-card { padding: 44px 34px 30px; }
}

@media (max-width: 700px) {
  .login-root { padding: 20px 18px 16px; }

  .auth-shell {
    grid-template-columns: minmax(0, 1fr);
    width: min(480px, 100%);
    min-height: 0;
    border-radius: 22px;
  }


  .story-panel { min-height: 250px; padding: 24px 27px 20px; }
  .story-brand-wordmark { width: 108px; }
  .story-copy { margin-top: 31px; }
  .story-copy h2 { font-size: 32px; }
  .story-eyebrow { margin-bottom: 12px; font-size: 9px; }
  .story-description { max-width: 320px; margin-top: 11px; font-size: 11px; }
  .field-visual { position: absolute; right: 16px; bottom: 1px; width: 42%; min-height: 140px; margin: 0; opacity: 0.66; }
  .field-data-card, .field-pin { display: none; }
  .story-footnote { display: none; }
  .login-card { padding: 31px 28px 25px; }
  .subtitle { margin-bottom: 21px; }
  .form { gap: 14px; }
  .review-note { margin-top: 13px; }
  .footer-text { margin-top: 17px; padding-top: 14px; }
}

@media (max-width: 420px) {
  .login-root { padding: 12px; }
  .story-panel { min-height: 232px; padding: 20px 21px 17px; }
  .story-brand-wordmark { width: 100px; }
  .story-copy { margin-top: 28px; }
  .story-copy h2 { font-size: 29px; }
  .story-description { max-width: 260px; }
  .field-visual { right: 0; width: 38%; opacity: 0.45; }
  .login-card { padding: 27px 21px 22px; }
  .title { font-size: 26px; }
  .form-heading { gap: 12px; }
  .logo-wrapper { width: 43px; height: 43px; border-radius: 13px; }
  .review-note { align-items: flex-start; font-size: 9px; }
}

@media (max-height: 760px) and (min-width: 701px) {
  .login-root { align-items: start; }
  .auth-shell { min-height: 560px; }
}

@media (prefers-reduced-motion: reduce) {
  .auth-shell, .login-card, .reveal-item, .error-box, .success-box,
  .progress-fill::after, .password-strength, .strength-segment.active,
  .story-brand-wordmark, .story-copy, .field-visual, .logo-wrapper,
  .review-note:hover svg, .btn-login::before {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }

  .login-card:hover, .story-brand:hover .story-brand-wordmark { transform: none; }
  .input-group:hover, .input-group:focus-within, .toggle-pass:hover,
  .footer-link:hover, .logo-wrapper:hover .form-brand-mark {
    transform: none;
  }
  .btn-login:hover:not(:disabled), .btn-login:active:not(:disabled),
  .btn-login:hover:not(:disabled)::before { transform: none; }
  .input-group::after { transition-duration: 0.01ms !important; }
}

@keyframes button-shine {
  0%, 68% { transform: translateX(-150%); }
  82%, 100% { transform: translateX(310%); }
}

@keyframes shield-nod {
  35% { transform: rotate(-12deg) scale(1.12); }
  70% { transform: rotate(8deg) scale(1.05); }
}

@keyframes brand-arrive {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes story-arrive {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes field-arrive {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes logo-arrive {
  from { opacity: 0; transform: translateY(6px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.auth-shell {
  border-color: rgba(215, 187, 121, 0.24);
  background: #172a21;
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.42), 0 1px 0 rgba(255, 255, 255, 0.035) inset;
}

.login-card {
  color: #e8eddf;
  background:
    radial-gradient(ellipse at 100% 0%, rgba(120, 150, 76, 0.1), transparent 38%),
    linear-gradient(155deg, #1d3428 0%, #172b22 52%, #14251d 100%);
  box-shadow: inset 1px 0 0 rgba(215, 187, 121, 0.12);
}

.title { color: #f4f1e7; }
.badge { color: #d7bc7e; }
.subtitle { color: #b2bdad; }
.field-label { color: #dce2d5; }

.input-group {
  border-color: rgba(190, 207, 183, 0.2);
  background: rgba(10, 25, 18, 0.6);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.input-group:hover {
  border-color: rgba(196, 171, 107, 0.48);
  background: rgba(14, 33, 24, 0.82);
  box-shadow: 0 6px 16px rgba(5, 15, 9, 0.2);
}

.input-group:focus-within {
  border-color: #c8a960;
  background: rgba(14, 33, 24, 0.92);
  box-shadow: 0 0 0 3px rgba(200, 169, 96, 0.13), 0 8px 18px rgba(5, 15, 9, 0.2);
}

.input-icon { color: #a5b3a0; }
.input-group:focus-within .input-icon { color: #e0c47a; }
.input-group input { color: #f0f1e7; }
.input-group input::placeholder { color: #9aa895; }
.toggle-pass { color: #a5b3a0; }
.toggle-pass:hover { color: #e0c47a; background: rgba(215, 187, 121, 0.12); }

.strength-heading { color: #bdc5b6; }
.strength-hint { color: #9ea99b; }
.strength-segment { background: rgba(197, 209, 187, 0.16); }

.verification-icon {
  border-color: rgba(215, 187, 121, 0.28);
  color: #e0c47a;
  background: rgba(215, 187, 121, 0.1);
}

.verification-label { color: #e0e5d8; }
.verification-hint { color: #a5b1a0; }
.resend-code { color: #d8bc75; }
.resend-code:hover:not(:disabled) { background: rgba(215, 187, 121, 0.1); }
.resend-code:disabled { color: #879486; }

.caps-warning {
  border-color: rgba(224, 185, 102, 0.3);
  color: #e7c77f;
  background: rgba(224, 185, 102, 0.09);
}

.error-box {
  border-color: rgba(248, 142, 120, 0.26);
  color: #ffc0ad;
  background: rgba(130, 48, 39, 0.22);
}

.success-box {
  border-color: rgba(162, 199, 143, 0.25);
  color: #d0e6bd;
  background: rgba(75, 111, 63, 0.2);
}

.progress-bar { background: rgba(197, 209, 187, 0.14); }
.review-note { color: #a9b5a4; }
.review-note svg { color: #c5ae6f; }
.footer-text {
  border-color: rgba(197, 209, 187, 0.14);
  color: #aab5a5;
}

.footer-link { color: #dfc37a; }
.footer-link:hover { color: #f1d991; }

.logo-wrapper {
  border-color: rgba(215, 187, 121, 0.3);
  background: linear-gradient(145deg, rgba(91, 128, 82, 0.34), rgba(31, 63, 44, 0.72));
  box-shadow: 0 10px 24px rgba(4, 14, 8, 0.24), 0 0 22px rgba(215, 187, 121, 0.08);
  animation: logo-arrive 0.65s 0.12s cubic-bezier(0.2, 0.75, 0.25, 1) both, logo-bob 5s 1s ease-in-out infinite;
}

.form-brand-mark {
  filter: drop-shadow(0 2px 6px rgba(225, 190, 94, 0.24));
}

.story-panel::before { animation: field-current 18s ease-in-out infinite alternate; }
.story-eyebrow span { animation: status-pulse 2.8s ease-out infinite; }
.field-orbit { animation: orbit-drift 54s linear infinite; }
.field-orbit-inner { animation-direction: reverse; animation-duration: 72s; }
.field-sun { animation: sun-breathe 5s ease-in-out infinite; }
.field-row-one { animation: furrow-glow 7s ease-in-out infinite; }
.field-row-two { animation: furrow-glow 7s 1.2s ease-in-out infinite; }
.field-row-three { animation: furrow-glow 7s 2.4s ease-in-out infinite; }
.field-row-four { animation: furrow-glow 7s 3.6s ease-in-out infinite; }
.field-pin { animation: pin-float 4s ease-in-out infinite; }
.field-data-card { animation: data-card-float 6s ease-in-out infinite; }

@keyframes logo-bob {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -3px; }
}

@keyframes field-current {
  from { translate: 0 0; }
  to { translate: 12px -9px; }
}

@keyframes orbit-drift {
  from { transform: translateX(-50%) rotate(0); }
  to { transform: translateX(-50%) rotate(360deg); }
}

@keyframes sun-breathe {
  0%, 100% { scale: 1; opacity: 0.65; }
  50% { scale: 1.12; opacity: 1; }
}

@keyframes furrow-glow {
  0%, 100% { border-color: rgba(215, 198, 147, 0.14); }
  50% { border-color: rgba(215, 198, 147, 0.34); }
}

@keyframes pin-float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -6px; }
}

@keyframes data-card-float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -4px; }
}

@media (prefers-reduced-motion: reduce) {
  .story-panel::before, .story-eyebrow span, .field-orbit, .field-sun,
  .field-row, .field-pin, .field-data-card, .logo-wrapper {
    animation: none !important;
  }
}
</style>
