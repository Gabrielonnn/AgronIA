<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { AlertCircle, Eye, EyeOff, Leaf, LoaderCircle, LockKeyhole, Mail, Satellite } from 'lucide-vue-next'
import { supabase } from '../services/supabase'
import { useMainStore } from '../stores'

const router = useRouter()
const store = useMainStore()
const email = ref('')
const password = ref('')
const loading = ref(false)
const showPassword = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  if (!supabase) {
    errorMessage.value = 'El servicio de acceso no está configurado. Contacta al administrador.'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        errorMessage.value = 'Correo o contraseña incorrectos.'
      } else if (error.message.includes('Email not confirmed')) {
        errorMessage.value = 'Debes confirmar tu correo antes de iniciar sesión.'
      } else {
        errorMessage.value = error.message
      }
      return
    }

    if (!data.session) {
      errorMessage.value = 'No se pudo establecer una sesión. Intenta de nuevo.'
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('status, active')
      .eq('id', data.session.user.id)
      .single()

    if (profile && (profile.status === 'pendiente' || profile.status === 'rechazado' || !profile.active)) {
      await supabase.auth.signOut()
      errorMessage.value = profile.status === 'pendiente'
        ? 'Tu cuenta está pendiente de aprobación por un administrador.'
        : profile.status === 'rechazado'
          ? 'Tu solicitud de registro ha sido rechazada.'
          : 'Tu cuenta está desactivada. Contacta a un administrador.'
      return
    }

    store.setUser(data.session.user)
    await router.push('/')
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudo iniciar sesión. Intenta de nuevo.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <div class="login-orbit login-orbit-one" aria-hidden="true"></div>
    <div class="login-orbit login-orbit-two" aria-hidden="true"></div>
    <div class="login-grain" aria-hidden="true"></div>

    <section class="login-card" aria-labelledby="login-title">
      <RouterLink to="/" class="login-brand" aria-label="AgronIA">
        <span class="login-brand-mark"><Leaf :size="25" /></span>
        <span>
          <strong>AgronIA</strong>
          <small>Agricultura de Precisión</small>
        </span>
      </RouterLink>

      <div class="login-heading">
        <span class="login-kicker"><Satellite :size="14" /> CAMPO · DATOS · FUTURO</span>
        <h1 id="login-title">Bienvenido de vuelta</h1>
        <p>Accede a tu espacio de agricultura inteligente.</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div v-if="errorMessage" class="login-error" role="alert">
          <AlertCircle :size="18" />
          <span>{{ errorMessage }}</span>
        </div>

        <label for="login-email">Correo electrónico</label>
        <div class="login-input-wrap">
          <Mail :size="18" aria-hidden="true" />
          <input
            id="login-email"
            v-model="email"
            type="email"
            placeholder="tu@correo.com"
            autocomplete="email"
            required
            :disabled="loading"
          />
        </div>

        <label for="login-password">Contraseña</label>
        <div class="login-input-wrap">
          <LockKeyhole :size="18" aria-hidden="true" />
          <input
            id="login-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Tu contraseña"
            autocomplete="current-password"
            required
            :disabled="loading"
          />
          <button
            class="password-toggle"
            type="button"
            :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" :size="18" />
            <Eye v-else :size="18" />
          </button>
        </div>

        <button class="login-submit" type="submit" :disabled="loading">
          <LoaderCircle v-if="loading" :size="18" class="login-spinner" />
          <span>{{ loading ? 'Verificando acceso…' : 'Iniciar sesión' }}</span>
        </button>
      </form>

      <p class="login-register">
        ¿Aún no tienes cuenta?
        <RouterLink to="/registro">Solicita acceso</RouterLink>
      </p>
      <p class="login-footnote">Tecnología para una agricultura más precisa y sostenible.</p>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  --login-ink: #f4f7ee;
  --login-muted: #aab5a2;
  position: relative;
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  overflow: hidden;
  padding: clamp(1rem, 4vw, 2.5rem);
  color: var(--login-ink);
  background:
    radial-gradient(ellipse at 18% 15%, rgba(120, 150, 76, 0.21), transparent 38%),
    radial-gradient(ellipse at 82% 85%, rgba(245, 138, 0, 0.1), transparent 36%),
    #10150e;
}

.login-grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.35;
  background-image:
    linear-gradient(rgba(255, 196, 0, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 196, 0, 0.035) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black, transparent 78%);
}

.login-orbit {
  position: absolute;
  width: min(58vw, 620px);
  aspect-ratio: 1;
  border: 1px solid rgba(196, 218, 147, 0.08);
  border-radius: 50%;
  pointer-events: none;
  animation: orbit-breathe 10s ease-in-out infinite alternate;
}

.login-orbit-one { transform: translate(-34%, -25%); }
.login-orbit-two {
  width: min(78vw, 850px);
  transform: translate(32%, 24%);
  animation-delay: -4s;
}

.login-card {
  position: relative;
  width: min(100%, 460px);
  padding: clamp(1.5rem, 5vw, 2.75rem);
  border: 1px solid rgba(196, 218, 147, 0.16);
  border-radius: 26px;
  background: linear-gradient(145deg, rgba(31, 38, 24, 0.94), rgba(21, 25, 18, 0.94));
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.4), inset 0 1px rgba(255, 255, 255, 0.045);
  backdrop-filter: blur(18px);
  animation: login-enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.login-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.login-brand-mark {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 15px;
  color: #332307;
  background: linear-gradient(135deg, #ffd957, #f58a00);
  box-shadow: 0 10px 24px rgba(245, 138, 0, 0.22);
}

.login-brand strong,
.login-brand small { display: block; }
.login-brand strong { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.04em; }
.login-brand small { margin-top: 2px; color: var(--login-muted); font-size: 0.72rem; }

.login-heading { margin-top: 2.4rem; }
.login-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #d2b65d;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.login-heading h1 {
  margin: 12px 0 7px;
  font-size: clamp(1.75rem, 6vw, 2.2rem);
  line-height: 1.1;
  letter-spacing: -0.055em;
}

.login-heading p { margin: 0; color: var(--login-muted); line-height: 1.55; }
.login-form { display: grid; gap: 10px; margin-top: 1.8rem; }
.login-form label { margin-top: 8px; color: #e4e9dc; font-size: 0.84rem; font-weight: 650; }

.login-input-wrap {
  display: flex;
  min-width: 0;
  min-height: 50px;
  align-items: center;
  gap: 11px;
  padding: 0 14px;
  border: 1px solid rgba(196, 218, 147, 0.16);
  border-radius: 13px;
  color: #99a78c;
  background: rgba(8, 12, 8, 0.42);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.login-input-wrap:focus-within {
  border-color: rgba(255, 196, 0, 0.65);
  background: rgba(8, 12, 8, 0.66);
  box-shadow: 0 0 0 4px rgba(255, 196, 0, 0.08);
}

.login-input-wrap input {
  width: 100%;
  min-width: 0;
  padding: 13px 0;
  border: 0;
  outline: 0;
  color: var(--login-ink);
  background: transparent;
}
.login-input-wrap input::placeholder { color: #6f7b67; }
.password-toggle {
  display: inline-grid;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 9px;
  color: #9ba88f;
  background: transparent;
  cursor: pointer;
}
.password-toggle:hover { color: #f5cd4e; background: rgba(255, 255, 255, 0.05); }

.login-submit {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  border: 0;
  border-radius: 13px;
  color: #241b08;
  background: linear-gradient(110deg, #ffd34b, #f5a522 55%, #f58a00);
  box-shadow: 0 12px 28px rgba(245, 138, 0, 0.2);
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
}
.login-submit:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.07);
  box-shadow: 0 16px 34px rgba(245, 138, 0, 0.3);
}
.login-submit:disabled { opacity: 0.72; cursor: wait; }
.login-spinner { animation: spin 0.8s linear infinite; }

.login-error {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(248, 113, 113, 0.24);
  border-radius: 12px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.22);
  font-size: 0.85rem;
  line-height: 1.45;
}
.login-error svg { flex: 0 0 auto; margin-top: 1px; }
.login-register { margin: 1.45rem 0 0; text-align: center; color: var(--login-muted); font-size: 0.88rem; }
.login-register a { margin-left: 4px; color: #f3c946; font-weight: 700; text-decoration: none; }
.login-register a:hover { color: #ffe17a; text-decoration: underline; }
.login-footnote { margin: 1.7rem 0 0; padding-top: 1rem; border-top: 1px solid rgba(196, 218, 147, 0.1); text-align: center; color: #76816d; font-size: 0.72rem; }

@keyframes login-enter {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes orbit-breathe {
  from { opacity: 0.4; scale: 0.96; }
  to { opacity: 0.9; scale: 1.04; }
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 420px) {
  .login-card { border-radius: 21px; }
  .login-heading { margin-top: 1.8rem; }
}

@media (prefers-reduced-motion: reduce) {
  .login-card, .login-orbit, .login-spinner { animation: none; }
  .login-input-wrap, .login-submit { transition: none; }
}
</style>
