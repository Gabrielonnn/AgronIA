<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, CheckCircle2, KeyRound, Leaf, Loader2, Mail, ShieldCheck } from 'lucide-vue-next'
import { supabase } from '../services/supabase'

const route = useRoute()
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const isResetMode = ref(false)
const emailSent = ref(false)
const passwordUpdated = ref(false)
const loading = ref(false)
const error = ref('')
let authSubscription: ReturnType<NonNullable<typeof supabase>['auth']['onAuthStateChange']>['data']['subscription'] | undefined

onMounted(async () => {
  isResetMode.value = route.query.mode === 'reset'
  if (!supabase) return

  const { data } = supabase.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
      isResetMode.value = true
      error.value = ''
    }
  })
  authSubscription = data.subscription

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (route.query.mode === 'reset' && sessionData.session) isResetMode.value = true
    if (route.query.mode === 'reset' && !sessionData.session) {
      error.value = 'El enlace no es válido o ya venció. Solicita uno nuevo para continuar.'
    }
  } catch (err: unknown) {
    error.value = err instanceof Error
      ? `No se pudo validar el enlace: ${err.message}`
      : 'No se pudo validar el enlace de recuperación.'
  }
})

onUnmounted(() => authSubscription?.unsubscribe())

const requestRecovery = async () => {
  if (!supabase) {
    error.value = 'El servicio de acceso no está configurado. Contacta al administrador.'
    return
  }

  loading.value = true
  error.value = ''
  try {
    const redirectTo = new URL(
      `${import.meta.env.BASE_URL}recuperar-acceso?mode=reset`,
      window.location.origin,
    ).toString()
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.value.trim(), { redirectTo })
    if (recoveryError) throw recoveryError
    emailSent.value = true
  } catch (err: unknown) {
    error.value = err instanceof Error
      ? `No se pudo enviar el enlace: ${err.message}`
      : 'No se pudo enviar el enlace de recuperación.'
  } finally {
    loading.value = false
  }
}

const updatePassword = async () => {
  error.value = ''
  if (password.value.length < 8) {
    error.value = 'La contraseña debe tener al menos 8 caracteres.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Las contraseñas no coinciden.'
    return
  }
  if (!supabase) {
    error.value = 'El servicio de acceso no está configurado. Contacta al administrador.'
    return
  }

  loading.value = true
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!sessionData.session) {
      error.value = 'El enlace venció o ya fue utilizado. Solicita uno nuevo.'
      isResetMode.value = false
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: password.value })
    if (updateError) throw updateError
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      passwordUpdated.value = true
      error.value = `La contraseña se actualizó, pero no se pudo cerrar la sesión: ${signOutError.message}`
      return
    }
    passwordUpdated.value = true
  } catch (err: unknown) {
    error.value = err instanceof Error
      ? `No se pudo actualizar la contraseña: ${err.message}`
      : 'No se pudo actualizar la contraseña.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="recovery-page">
    <div class="recovery-glow recovery-glow-one" aria-hidden="true"></div>
    <div class="recovery-glow recovery-glow-two" aria-hidden="true"></div>
    <div class="recovery-grid" aria-hidden="true"></div>

    <section class="recovery-card">
      <RouterLink to="/login" class="back-link">
        <ArrowLeft :size="16" />
        Volver al acceso
      </RouterLink>

      <div class="brand-mark" aria-hidden="true">
        <Leaf :size="25" />
      </div>
      <p class="eyebrow">AGRANIA · ACCESO SEGURO</p>

      <Transition name="recovery-content" mode="out-in">
        <div v-if="passwordUpdated" key="updated" class="recovery-state">
          <div class="state-icon success-icon"><CheckCircle2 :size="26" /></div>
          <h1>Contraseña actualizada</h1>
          <p>{{ error ? 'La contraseña se actualizó, pero tu sesión sigue abierta.' : 'Tu contraseña se cambió correctamente. Ya puedes iniciar sesión con tus nuevos datos.' }}</p>
          <p v-if="error" class="recovery-message is-error" role="alert">{{ error }}</p>
          <RouterLink to="/login" class="primary-button">{{ error ? 'Continuar en AgronIA' : 'Ir al inicio de sesión' }}</RouterLink>
        </div>

        <div v-else-if="isResetMode" key="reset" class="recovery-content">
          <div class="state-icon"><KeyRound :size="24" /></div>
          <h1>Crea una nueva contraseña</h1>
          <p>Elige una contraseña segura de al menos 8 caracteres.</p>

          <form class="recovery-form" @submit.prevent="updatePassword">
            <label for="new-password">Nueva contraseña</label>
            <div class="recovery-input">
              <KeyRound :size="17" />
              <input
                id="new-password"
                v-model="password"
                type="password"
                autocomplete="new-password"
                minlength="8"
                required
                placeholder="Mínimo 8 caracteres"
                :disabled="loading"
              />
            </div>
            <label for="confirm-password">Confirma tu contraseña</label>
            <div class="recovery-input">
              <ShieldCheck :size="17" />
              <input
                id="confirm-password"
                v-model="confirmPassword"
                type="password"
                autocomplete="new-password"
                minlength="8"
                required
                placeholder="Repite la contraseña"
                :disabled="loading"
              />
            </div>
            <p v-if="error" class="recovery-message is-error" role="alert">{{ error }}</p>
            <button type="submit" class="primary-button" :disabled="loading">
              <Loader2 v-if="loading" class="loading-icon" :size="17" />
              {{ loading ? 'Actualizando…' : 'Guardar nueva contraseña' }}
            </button>
          </form>
        </div>

        <div v-else-if="emailSent" key="sent" class="recovery-state">
          <div class="state-icon success-icon"><CheckCircle2 :size="26" /></div>
          <h1>Revisa tu correo</h1>
          <p>Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.</p>
          <p class="mail-destination">{{ email.trim() }}</p>
          <RouterLink to="/login" class="primary-button">Volver al inicio de sesión</RouterLink>
        </div>

        <div v-else key="request" class="recovery-content">
          <div class="state-icon"><Mail :size="24" /></div>
          <h1>Recupera tu acceso</h1>
          <p>Te enviaremos un enlace seguro para crear una contraseña nueva.</p>

          <div class="username-note">
            <strong>¿Olvidaste tu usuario?</strong>
            <span>Tu usuario de AgronIA es el correo con el que te registraste. Si no recuerdas ese correo, contacta al administrador de tu organización.</span>
          </div>

          <form class="recovery-form" @submit.prevent="requestRecovery">
            <label for="recovery-email">Correo registrado</label>
            <div class="recovery-input">
              <Mail :size="17" />
              <input
                id="recovery-email"
                v-model="email"
                type="email"
                autocomplete="email"
                required
                placeholder="tu@correo.com"
                :disabled="loading"
              />
            </div>
            <p v-if="error" class="recovery-message is-error" role="alert">{{ error }}</p>
            <button type="submit" class="primary-button" :disabled="loading">
              <Loader2 v-if="loading" class="loading-icon" :size="17" />
              {{ loading ? 'Enviando enlace…' : 'Enviar enlace de recuperación' }}
            </button>
          </form>
        </div>
      </Transition>

      <p class="security-note"><ShieldCheck :size="14" /> Tu cuenta está protegida con un enlace de un solo uso.</p>
    </section>
  </main>
</template>

<style scoped>
.recovery-page {
  --gold: #f0c84b;
  position: relative;
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  overflow: hidden;
  padding: 2rem 1rem;
  color: #f4f1e7;
  background: #11150e;
  isolation: isolate;
}

.recovery-grid {
  position: absolute;
  z-index: -1;
  inset: 0;
  background-image:
    linear-gradient(rgba(240, 200, 75, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(240, 200, 75, 0.035) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(ellipse at center, #000 10%, transparent 78%);
}

.recovery-glow {
  position: absolute;
  z-index: -1;
  width: min(60vw, 560px);
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.2;
  pointer-events: none;
}

.recovery-glow-one {
  top: -25%;
  left: -15%;
  background: #829b3f;
  animation: glow-drift 12s ease-in-out infinite alternate;
}

.recovery-glow-two {
  right: -20%;
  bottom: -30%;
  background: #d89027;
  animation: glow-drift 15s ease-in-out infinite alternate-reverse;
}

.recovery-card {
  width: min(100%, 460px);
  padding: clamp(1.5rem, 6vw, 2.75rem);
  border: 1px solid rgba(240, 200, 75, 0.2);
  border-radius: 24px;
  background: rgba(28, 32, 21, 0.9);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.38), inset 0 1px rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
  animation: card-arrive 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #adb69e;
  font-size: 0.8rem;
  text-decoration: none;
  transition: color 0.2s ease, transform 0.2s ease;
}
.back-link:hover { color: var(--gold); transform: translateX(-2px); }

.brand-mark,
.state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(240, 200, 75, 0.27);
  border-radius: 16px;
  color: var(--gold);
  background: linear-gradient(145deg, rgba(240, 200, 75, 0.14), rgba(120, 150, 76, 0.1));
  box-shadow: 0 8px 26px rgba(240, 200, 75, 0.08);
}
.brand-mark { margin: 2rem 0 1rem; animation: mark-pulse 3s ease-in-out infinite; }

.eyebrow {
  margin: 0 0 1.25rem;
  color: #d5bb62;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.recovery-content > .state-icon,
.recovery-state > .state-icon { margin-bottom: 1rem; }

h1 {
  margin: 0;
  color: #f6f3e8;
  font-size: clamp(1.6rem, 5vw, 2rem);
  letter-spacing: -0.045em;
  line-height: 1.15;
}

.recovery-content > p,
.recovery-state > p {
  margin: 0.65rem 0 1.5rem;
  color: #a7ad9c;
  font-size: 0.9rem;
  line-height: 1.65;
}

.username-note {
  display: grid;
  gap: 0.35rem;
  margin: 1.2rem 0 1.35rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 12px;
  color: #aab29e;
  background: rgba(255, 255, 255, 0.035);
  font-size: 0.77rem;
  line-height: 1.55;
}
.username-note strong { color: #e6d58f; font-size: 0.8rem; }

.recovery-form { display: grid; gap: 0.65rem; }
.recovery-form label {
  margin-top: 0.25rem;
  color: #dce1d4;
  font-size: 0.77rem;
  font-weight: 650;
}

.recovery-input {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 0.7rem;
  padding: 0 0.9rem;
  border: 1px solid rgba(196, 218, 147, 0.16);
  border-radius: 11px;
  color: #929d86;
  background: rgba(13, 17, 12, 0.72);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.recovery-input:focus-within {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(240, 200, 75, 0.12);
}
.recovery-input input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: #f4f1e7;
  background: transparent;
  font: inherit;
  font-size: 0.86rem;
}
.recovery-input input::placeholder { color: #6f7868; }

.primary-button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  margin-top: 0.55rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 222, 119, 0.48);
  border-radius: 11px;
  color: #2b240f;
  background: linear-gradient(135deg, #f3d66f, #dfaa32);
  box-shadow: 0 8px 22px rgba(211, 165, 49, 0.15);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 750;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
}
.primary-button:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.06);
  box-shadow: 0 12px 28px rgba(211, 165, 49, 0.23);
}
.primary-button:focus-visible,
.back-link:focus-visible { outline: 2px solid #ffe58d; outline-offset: 3px; }
.primary-button:disabled { cursor: wait; opacity: 0.72; }

.recovery-message {
  margin: 0.25rem 0 0;
  padding: 0.7rem 0.8rem;
  border-radius: 9px;
  font-size: 0.78rem;
  line-height: 1.5;
}
.is-error {
  border: 1px solid rgba(248, 113, 113, 0.24);
  color: #fca5a5;
  background: rgba(127, 29, 29, 0.17);
}

.recovery-state { text-align: left; }
.recovery-state .success-icon {
  color: #a6ce70;
  border-color: rgba(166, 206, 112, 0.3);
  background: rgba(116, 153, 70, 0.15);
  animation: success-pop 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.recovery-state .primary-button { width: 100%; }
.mail-destination {
  padding: 0.75rem 0.9rem;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 9px;
  color: #e6d58f !important;
  background: rgba(255, 255, 255, 0.035);
  overflow-wrap: anywhere;
}

.security-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  margin: 1.65rem 0 0;
  color: #7e8874;
  font-size: 0.68rem;
}
.security-note svg { flex: 0 0 auto; color: #a7b987; }
.loading-icon { animation: spin 0.8s linear infinite; }

.recovery-content-enter-active,
.recovery-content-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.recovery-content-enter-from { opacity: 0; transform: translateY(8px); }
.recovery-content-leave-to { opacity: 0; transform: translateY(-6px); }

@keyframes card-arrive {
  from { opacity: 0; transform: translateY(18px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes glow-drift { to { transform: translate(8%, 10%) scale(1.12); } }
@keyframes mark-pulse { 50% { box-shadow: 0 8px 32px rgba(240, 200, 75, 0.2); } }
@keyframes success-pop { from { opacity: 0; transform: scale(0.75); } to { opacity: 1; transform: scale(1); } }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 480px) {
  .recovery-card { border-radius: 19px; }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
