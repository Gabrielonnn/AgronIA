<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { AlertCircle, BarChart3, Eye, EyeOff, Leaf, LoaderCircle, LockKeyhole, Mail, Map, Satellite, ShieldCheck } from 'lucide-vue-next'
import { supabase } from '../services/supabase'
import { useMainStore } from '../stores'

const router = useRouter()
const store = useMainStore()
const email = ref('')
const password = ref('')
const loading = ref(false)
const showPassword = ref(false)
const capsLockOn = ref(false)
const errorMessage = ref('')

const updateCapsLock = (event: KeyboardEvent) => {
  capsLockOn.value = event.getModifierState('CapsLock')
}

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

    <div class="login-layout">
      <aside class="login-showcase" aria-label="Acerca de AgronIA">
        <RouterLink to="/" class="login-brand" aria-label="AgronIA, inicio">
          <span class="login-brand-mark"><Leaf :size="25" /></span>
          <span>
            <strong>AgronIA</strong>
            <small>Agricultura de Precisión</small>
          </span>
        </RouterLink>

        <div class="showcase-copy">
          <span class="login-kicker"><Satellite :size="14" /> CAMPO · DATOS · FUTURO</span>
          <h1>Una nueva perspectiva para <span>tu campo.</span></h1>
          <p>Conecta información, tecnología y experiencia agrícola en un solo espacio de trabajo.</p>
        </div>

        <div class="showcase-tools">
          <div class="showcase-tool">
            <span class="showcase-tool-icon"><Map :size="19" /></span>
            <span><strong>Mapas y parcelas</strong><small>Explora tus campos con contexto geográfico.</small></span>
          </div>
          <div class="showcase-tool">
            <span class="showcase-tool-icon"><BarChart3 :size="19" /></span>
            <span><strong>Datos y analítica</strong><small>Convierte registros agrícolas en información útil.</small></span>
          </div>
          <div class="showcase-tool">
            <span class="showcase-tool-icon"><Satellite :size="19" /></span>
            <span><strong>Simulación de cultivos</strong><small>Visualiza escenarios para planificar mejor.</small></span>
          </div>
        </div>

        <div class="showcase-note">
          <span class="showcase-note-mark"><Leaf :size="16" /></span>
          <p><strong>Tecnología con propósito.</strong> Herramientas pensadas para una agricultura más precisa y sostenible.</p>
        </div>
        <span class="showcase-orbit showcase-orbit-one" aria-hidden="true"></span>
        <span class="showcase-orbit showcase-orbit-two" aria-hidden="true"></span>
      </aside>

      <section class="login-card" aria-labelledby="login-title">
        <div class="login-card-topline">
          <span class="login-secure"><ShieldCheck :size="16" /> Acceso seguro</span>
          <span class="login-step">PORTAL AGRONIA</span>
        </div>

        <div class="login-heading">
          <span class="login-kicker"><span class="login-kicker-dot"></span> TU ESPACIO DE TRABAJO</span>
          <h2 id="login-title">Qué gusto tenerte de vuelta</h2>
          <p>Ingresa tus credenciales para continuar.</p>
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
              placeholder="nombre@empresa.com"
              autocomplete="email"
              required
              :disabled="loading"
            />
          </div>

          <div class="login-label-row">
            <label for="login-password">Contraseña</label>
            <span v-if="capsLockOn" class="caps-warning" role="status">Bloq Mayús activado</span>
          </div>
          <div class="login-input-wrap">
            <LockKeyhole :size="18" aria-hidden="true" />
            <input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Ingresa tu contraseña"
              autocomplete="current-password"
              required
              :disabled="loading"
              @keyup="updateCapsLock"
              @blur="capsLockOn = false"
            />
            <button
              class="password-toggle"
              type="button"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </div>

          <button class="login-submit" type="submit" :disabled="loading">
            <LoaderCircle v-if="loading" :size="18" class="login-spinner" />
            <span>{{ loading ? 'Verificando acceso…' : 'Iniciar sesión' }}</span>
            <span v-if="!loading" class="submit-arrow" aria-hidden="true">→</span>
          </button>
        </form>

        <div class="login-divider"><span>o</span></div>
        <p class="login-register">
          ¿Aún no tienes cuenta?
          <RouterLink to="/registro">Solicita acceso <span aria-hidden="true">↗</span></RouterLink>
        </p>
        <div class="login-card-footer">
          <ShieldCheck :size="14" />
          <span>Tus credenciales se transmiten de forma segura.</span>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.login-page {
  --login-ink: #f4f7ee;
  --login-muted: #aab5a2;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: auto;
  padding: clamp(1.25rem, 4vw, 4rem);
  color: var(--login-ink);
  background:
    radial-gradient(ellipse at 18% 15%, rgba(120, 150, 76, 0.21), transparent 38%),
    radial-gradient(ellipse at 82% 85%, rgba(245, 138, 0, 0.1), transparent 36%),
    #10150e;
}

.login-layout {
  position: relative;
  display: grid;
  width: min(100%, 1100px);
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.84fr);
  align-items: center;
  gap: clamp(2rem, 6vw, 5.5rem);
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
  width: 100%;
  padding: clamp(1.5rem, 4vw, 2.65rem);
  border: 1px solid rgba(196, 218, 147, 0.16);
  border-radius: 24px;
  background:
    radial-gradient(ellipse at 100% 0, rgba(120, 150, 76, 0.1), transparent 46%),
    linear-gradient(145deg, rgba(31, 38, 24, 0.96), rgba(21, 25, 18, 0.96));
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.4), inset 0 1px rgba(255, 255, 255, 0.045);
  backdrop-filter: blur(18px);
  animation: login-enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.login-showcase {
  position: relative;
  z-index: 1;
  min-width: 0;
  padding-block: 1rem;
  animation: login-enter 0.7s 0.08s cubic-bezier(0.16, 1, 0.3, 1) both;
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

.showcase-copy { max-width: 540px; margin-top: clamp(2.5rem, 7vh, 5rem); }

.login-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #d2b65d;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.showcase-copy h1 {
  max-width: 570px;
  margin: 1.15rem 0 1rem;
  font-size: clamp(2.7rem, 5.2vw, 4.35rem);
  font-weight: 760;
  line-height: 1.02;
  letter-spacing: -0.065em;
  text-wrap: balance;
}

.showcase-copy h1 span {
  color: #e9ca68;
  background: linear-gradient(105deg, #f4d979, #d9a637 90%);
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.showcase-copy > p {
  max-width: 450px;
  margin: 0;
  color: #aab5a2;
  font-size: clamp(0.98rem, 1.5vw, 1.1rem);
  line-height: 1.75;
}

.showcase-tools {
  display: grid;
  gap: 1.2rem;
  margin-top: clamp(2rem, 5vh, 3rem);
}

.showcase-tool {
  display: flex;
  align-items: center;
  gap: 14px;
}

.showcase-tool-icon,
.showcase-note-mark {
  display: grid;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(196, 218, 147, 0.14);
  border-radius: 13px;
  color: #e5c960;
  background: linear-gradient(145deg, rgba(132, 158, 83, 0.14), rgba(255, 255, 255, 0.025));
}

.showcase-tool strong,
.showcase-tool small {
  display: block;
}

.showcase-tool strong {
  color: #e9edde;
  font-size: 0.9rem;
  font-weight: 680;
}

.showcase-tool small {
  margin-top: 3px;
  color: #899581;
  font-size: 0.78rem;
  line-height: 1.45;
}

.showcase-note {
  display: flex;
  max-width: 470px;
  align-items: center;
  gap: 12px;
  margin-top: clamp(2rem, 5vh, 3rem);
  padding-top: 1.2rem;
  border-top: 1px solid rgba(196, 218, 147, 0.12);
}

.showcase-note-mark {
  width: 34px;
  height: 34px;
  border-radius: 11px;
}

.showcase-note p {
  margin: 0;
  color: #899581;
  font-size: 0.76rem;
  line-height: 1.55;
}

.showcase-note strong { color: #dce4d1; }

.showcase-orbit {
  position: absolute;
  z-index: -1;
  width: 380px;
  aspect-ratio: 1;
  border: 1px solid rgba(196, 218, 147, 0.055);
  border-radius: 50%;
  pointer-events: none;
}

.showcase-orbit-one { top: 10%; left: 25%; }
.showcase-orbit-two { top: 20%; left: 10%; width: 560px; }

.login-card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(196, 218, 147, 0.1);
}

.login-secure {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #c8d8a5;
  font-size: 0.76rem;
  font-weight: 650;
}

.login-secure svg { color: #b3ca7a; }

.login-step {
  color: #77836d;
  font-size: 0.61rem;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.login-heading { margin-top: 1.8rem; }
.login-kicker-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d2b65d;
  box-shadow: 0 0 12px rgba(210, 182, 93, 0.55);
}

.login-heading h2 {
  margin: 12px 0 7px;
  font-size: clamp(1.65rem, 4vw, 2.05rem);
  font-weight: 720;
  line-height: 1.12;
  letter-spacing: -0.055em;
  text-wrap: balance;
}

.login-heading p { margin: 0; color: var(--login-muted); line-height: 1.55; }
.login-form { display: grid; gap: 10px; margin-top: 1.55rem; }
.login-form label { color: #e4e9dc; font-size: 0.82rem; font-weight: 650; }
.login-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 5px; }
.caps-warning { color: #f2cb68; font-size: 0.7rem; font-weight: 600; }

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

.login-input-wrap:focus-within > svg {
  color: #dfbf55;
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
  margin-top: 12px;
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
.submit-arrow { margin-left: 3px; font-size: 1.2rem; transition: transform 0.2s ease; }
.login-submit:hover:not(:disabled) .submit-arrow { transform: translateX(3px); }
.login-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 1.35rem;
  color: #77836d;
  font-size: 0.72rem;
}
.login-divider::before,
.login-divider::after { height: 1px; flex: 1; background: rgba(196, 218, 147, 0.1); content: ''; }
.login-register { margin: 1rem 0 0; text-align: center; color: var(--login-muted); font-size: 0.83rem; }
.login-register a { margin-left: 4px; color: #f3c946; font-weight: 700; text-decoration: none; }
.login-register a:hover { color: #ffe17a; text-decoration: underline; }
.login-register a span { display: inline-block; transition: transform 0.2s ease; }
.login-register a:hover span { transform: translate(2px, -2px); }
.login-card-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 1.3rem;
  color: #77836d;
  font-size: 0.68rem;
}
.login-card-footer svg { color: #9aad74; }

.login-page :is(a, button, input):focus-visible {
  outline: 2px solid rgba(240, 203, 89, 0.88);
  outline-offset: 4px;
}

@keyframes login-enter {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes orbit-breathe {
  from { opacity: 0.4; scale: 0.96; }
  to { opacity: 0.9; scale: 1.04; }
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .login-layout {
    width: min(100%, 560px);
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
  }

  .login-showcase { padding-block: 0; }
  .showcase-copy { margin-top: 2rem; }
  .showcase-copy h1 { max-width: 520px; font-size: clamp(2.3rem, 8vw, 3.5rem); }
  .showcase-tools { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 1.6rem; }
  .showcase-tool { align-items: flex-start; flex-direction: column; gap: 9px; }
  .showcase-tool small { font-size: 0.72rem; }
  .showcase-note { margin-top: 1.6rem; }
  .login-card { max-width: none; }
}

@media (max-width: 560px) {
  .login-page { align-items: flex-start; padding: 1.25rem 1rem; }
  .login-layout { gap: 1.5rem; }
  .login-showcase { padding-top: 0.25rem; }
  .showcase-copy { margin-top: 1.7rem; }
  .showcase-copy h1 { margin-top: 0.9rem; font-size: clamp(2.15rem, 10vw, 2.8rem); }
  .showcase-copy > p { font-size: 0.9rem; }
  .showcase-tools { grid-template-columns: minmax(0, 1fr); gap: 12px; margin-top: 1.25rem; }
  .showcase-tool { align-items: center; flex-direction: row; gap: 11px; }
  .showcase-tool-icon { width: 37px; height: 37px; border-radius: 11px; }
  .showcase-tool strong { font-size: 0.8rem; }
  .showcase-tool small { font-size: 0.7rem; }
  .showcase-note { display: none; }
  .login-card { padding: 1.35rem; border-radius: 20px; }
  .login-heading { margin-top: 1.45rem; }
  .login-heading h2 { font-size: 1.65rem; }
  .login-form { margin-top: 1.25rem; }
  .login-input-wrap { min-height: 48px; }
}

@media (prefers-reduced-motion: reduce) {
  .login-card, .login-showcase, .login-orbit, .login-spinner { animation: none; }
  .login-input-wrap, .login-submit, .submit-arrow, .login-register a span { transition: none; }
}
</style>
