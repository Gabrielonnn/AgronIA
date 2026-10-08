<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { Leaf, Menu, X } from 'lucide-vue-next'
import { useMainStore } from './stores'
import Sidebar from './components/layout/Sidebar.vue'

const route = useRoute()
const store = useMainStore()
const showIntro = ref(true)
let introTimer: number | undefined
const mobileMenuOpen = ref(false)

onMounted(() => {
  store.checkAuth()
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 3100
  introTimer = window.setTimeout(() => {
    showIntro.value = false
  }, duration)
})

watch(() => route.path, () => {
  mobileMenuOpen.value = false
})

onUnmounted(() => {
  if (introTimer !== undefined) window.clearTimeout(introTimer)
})
</script>

<template>
  <div v-if="store.loading" class="min-h-screen flex items-center justify-center bg-agron-bg-alt">
    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-agron-green"></div>
  </div>
  <div v-else class="min-h-screen bg-agron-bg-alt flex flex-col md:flex-row relative overflow-hidden">
    <Transition name="app-intro">
      <div v-if="showIntro" class="app-intro" role="status" aria-live="polite">
        <div class="app-intro-field"></div>
        <div class="app-intro-furrows"></div>
        <div class="app-intro-glow"></div>
        <div class="app-intro-sun" aria-hidden="true"></div>
        <div class="app-intro-scan" aria-hidden="true"></div>
        <div class="app-intro-crops" aria-hidden="true">
          <span v-for="crop in 7" :key="crop" class="app-intro-crop">
            <i></i><i></i>
          </span>
        </div>
        <div class="app-intro-sparks" aria-hidden="true">
          <span v-for="spark in 12" :key="spark" class="app-intro-spark"></span>
        </div>
        <div class="app-intro-drones" aria-hidden="true">
          <span v-for="drone in 3" :key="drone" class="app-intro-drone"></span>
        </div>
        <div class="app-intro-orbit app-intro-orbit-one"></div>
        <div class="app-intro-orbit app-intro-orbit-two"></div>
        <div class="app-intro-content">
          <div class="app-intro-mark">
            <span class="app-intro-mark-ring"></span>
            <span class="app-intro-mark-spinner"></span>
            <span class="app-intro-satellite app-intro-satellite-one"></span>
            <span class="app-intro-satellite app-intro-satellite-two"></span>
            <Leaf :size="34" :stroke-width="1.8" />
          </div>
          <p class="app-intro-kicker"><span></span>Agricultura inteligente</p>
          <h1 class="app-intro-title">Agron<span>IA</span></h1>
          <p class="app-intro-caption">Tecnología para una agricultura más precisa, productiva y sostenible.</p>
          <div class="app-intro-divider"></div>
          <div class="app-intro-progress" aria-hidden="true"><span></span></div>
          <div class="app-intro-loading">
            <span class="app-intro-loading-dot"></span>
            <span>Preparando tu espacio de trabajo</span>
          </div>
          <p class="app-intro-footer">CAMPO <span>·</span> DATOS <span>·</span> FUTURO</p>
        </div>
      </div>
    </Transition>
    <div v-if="!route.meta.public" class="md:hidden flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3 z-30 relative shadow-sm">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-agron-green flex items-center justify-center shadow-sm">
          <span class="text-white font-bold text-lg leading-none">A</span>
        </div>
        <span class="text-lg font-bold text-gray-900 tracking-tight leading-tight">AgronIA</span>
      </div>
      <button
        type="button"
        aria-label="Abrir o cerrar menú"
        :aria-expanded="mobileMenuOpen"
        class="text-gray-600 hover:text-agron-green transition-colors p-1 bg-gray-100 rounded-md"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <Menu v-if="!mobileMenuOpen" class="w-6 h-6" />
        <X v-else class="w-6 h-6" />
      </button>
    </div>
    <Transition name="fade">
      <div
        v-if="mobileMenuOpen && !route.meta.public"
        class="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        @click="mobileMenuOpen = false"
      ></div>
    </Transition>
    <div
      v-if="!route.meta.public"
      :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
      class="fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:relative md:translate-x-0 shadow-2xl md:shadow-none"
    >
      <Sidebar />
    </div>
    <main
      class="app-main relative flex-1 h-[calc(100vh-61px)] md:h-screen overflow-y-auto w-full"
      :class="[{ 'p-4 md:p-6': !route.meta.public }, { 'app-main-reveal': !showIntro }]"
    >
      <RouterView v-slot="{ Component }">
        <component v-if="route.meta.public" :is="Component" :key="route.path" />
        <Transition v-else name="page" mode="in-out">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app-intro {
  --palette-leaf: #78964c;
  --palette-gold: #ffc400;
  --palette-orange: #f58a00;
  --palette-earth: #4c2b08;
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 46%, rgba(120, 150, 76, 0.18), transparent 38%),
    radial-gradient(ellipse at 50% 100%, rgba(245, 138, 0, 0.07), transparent 48%),
    rgba(16, 21, 14, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  text-align: center;
}

.app-intro-field,
.app-intro-furrows,
.app-intro-glow,
.app-intro-sun,
.app-intro-scan,
.app-intro-crops,
.app-intro-sparks,
.app-intro-drones {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.app-intro-field {
  background-image:
    linear-gradient(rgba(255, 196, 0, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 196, 0, 0.035) 1px, transparent 1px);
  background-size: 54px 54px;
  mask-image: radial-gradient(ellipse at center, black 15%, transparent 76%);
  animation: intro-field-drift 18s ease-in-out infinite alternate;
}

.app-intro-furrows {
  inset: auto -25% -42%;
  height: 78%;
  border-radius: 50% 50% 0 0;
  background: repeating-radial-gradient(
    ellipse at 50% 100%,
    transparent 0 28px,
    rgba(196, 218, 147, 0.11) 29px 30px,
    transparent 31px 53px
  );
  mask-image: linear-gradient(to top, black, transparent 88%);
  transform: perspective(500px) rotateX(48deg);
  transform-origin: center bottom;
  animation: furrows-drift 14s ease-in-out infinite alternate;
}

.app-intro-glow {
  inset: -30%;
  background: conic-gradient(
    from 20deg at 50% 50%,
    transparent 0deg,
    rgba(255, 196, 0, 0.035) 45deg,
    transparent 90deg,
    rgba(120, 150, 76, 0.045) 180deg,
    transparent 230deg,
    rgba(245, 138, 0, 0.035) 300deg,
    transparent 360deg
  );
  filter: blur(30px);
  animation: intro-glow-rotate 32s linear infinite;
}

.app-intro-sun {
  top: 10%;
  bottom: auto;
  right: 12%;
  left: auto;
  width: clamp(62px, 9vw, 112px);
  aspect-ratio: 1;
  border: 1px solid rgba(255, 214, 105, 0.25);
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(255, 218, 117, 0.2) 0 22%, transparent 23%),
    repeating-conic-gradient(from 0deg, rgba(255, 214, 105, 0.28) 0deg 1deg, transparent 1deg 30deg);
  box-shadow: 0 0 55px rgba(255, 196, 0, 0.12), inset 0 0 28px rgba(255, 196, 0, 0.08);
  animation: sun-breathe 5s ease-in-out infinite;
}

.app-intro-scan {
  inset: -20% 0 auto;
  height: 30%;
  background: linear-gradient(180deg, transparent, rgba(176, 216, 111, 0.055), transparent);
  animation: field-scan 8s ease-in-out infinite;
}

.app-intro-crops {
  inset: auto 0 0;
  height: clamp(82px, 17vh, 150px);
  display: flex;
  align-items: flex-end;
  justify-content: space-evenly;
  padding: 0 max(8%, 24px);
  mask-image: linear-gradient(to top, black, transparent 92%);
}

.app-intro-crop {
  position: relative;
  width: 2px;
  height: var(--crop-height);
  background: linear-gradient(to top, rgba(120, 150, 76, 0.05), rgba(173, 204, 119, 0.45));
  transform-origin: bottom;
  animation:
    crop-grow 1.2s var(--crop-delay) cubic-bezier(0.2, 0.8, 0.2, 1) both,
    crop-sway var(--crop-speed) ease-in-out infinite alternate;
}

.app-intro-crop::before,
.app-intro-crop::after {
  position: absolute;
  bottom: 52%;
  width: 19px;
  height: 8px;
  border: 1px solid rgba(173, 204, 119, 0.4);
  background: linear-gradient(135deg, rgba(120, 150, 76, 0.25), rgba(196, 218, 147, 0.08));
  content: '';
}

.app-intro-crop::before {
  right: 1px;
  border-radius: 100% 0 100% 0;
  transform: rotate(-24deg);
  transform-origin: right bottom;
}

.app-intro-crop::after {
  left: 1px;
  border-radius: 0 100% 0 100%;
  transform: rotate(24deg);
  transform-origin: left bottom;
}

.app-intro-crop i {
  position: absolute;
  bottom: 77%;
  left: 50%;
  width: 13px;
  height: 7px;
  border-radius: 100% 0 100% 0;
  background: rgba(196, 218, 147, 0.48);
  transform: translateX(-50%) rotate(-42deg);
}

.app-intro-crop i:nth-of-type(2) {
  bottom: 88%;
  transform: translateX(-50%) rotate(135deg);
}

.app-intro-crop:nth-child(1) { --crop-height: 52%; --crop-speed: 3.2s; --crop-delay: 0.05s; }
.app-intro-crop:nth-child(2) { --crop-height: 74%; --crop-speed: 4.1s; --crop-delay: 0.22s; }
.app-intro-crop:nth-child(3) { --crop-height: 60%; --crop-speed: 3.7s; --crop-delay: 0.12s; }
.app-intro-crop:nth-child(4) { --crop-height: 88%; --crop-speed: 4.4s; --crop-delay: 0.32s; }
.app-intro-crop:nth-child(5) { --crop-height: 64%; --crop-speed: 3.5s; --crop-delay: 0.18s; }
.app-intro-crop:nth-child(6) { --crop-height: 77%; --crop-speed: 4.2s; --crop-delay: 0.28s; }
.app-intro-crop:nth-child(7) { --crop-height: 55%; --crop-speed: 3.4s; --crop-delay: 0.08s; }

.app-intro-spark {
  position: absolute;
  top: calc(12% + var(--spark-y));
  left: var(--spark-x);
  width: var(--spark-size);
  height: var(--spark-size);
  border-radius: 50%;
  background: #f8d966;
  box-shadow: 0 0 12px 2px rgba(255, 196, 0, 0.38);
  opacity: 0;
  animation: intro-spark-float var(--spark-duration) var(--spark-delay) ease-in-out infinite;
}

.app-intro-spark:nth-child(1) { --spark-x: 14%; --spark-y: 7%; --spark-size: 3px; --spark-duration: 7s; --spark-delay: -1s; }
.app-intro-spark:nth-child(2) { --spark-x: 82%; --spark-y: 18%; --spark-size: 2px; --spark-duration: 8s; --spark-delay: -4s; }
.app-intro-spark:nth-child(3) { --spark-x: 23%; --spark-y: 58%; --spark-size: 2px; --spark-duration: 9s; --spark-delay: -2s; }
.app-intro-spark:nth-child(4) { --spark-x: 76%; --spark-y: 67%; --spark-size: 3px; --spark-duration: 8s; --spark-delay: -6s; }
.app-intro-spark:nth-child(5) { --spark-x: 91%; --spark-y: 42%; --spark-size: 2px; --spark-duration: 10s; --spark-delay: -3s; }
.app-intro-spark:nth-child(6) { --spark-x: 8%; --spark-y: 38%; --spark-size: 2px; --spark-duration: 9s; --spark-delay: -5s; }
.app-intro-spark:nth-child(7) { --spark-x: 38%; --spark-y: 5%; --spark-size: 2px; --spark-duration: 8s; --spark-delay: -2s; }
.app-intro-spark:nth-child(8) { --spark-x: 67%; --spark-y: 12%; --spark-size: 3px; --spark-duration: 11s; --spark-delay: -7s; }
.app-intro-spark:nth-child(9) { --spark-x: 4%; --spark-y: 71%; --spark-size: 2px; --spark-duration: 10s; --spark-delay: -4s; }
.app-intro-spark:nth-child(10) { --spark-x: 96%; --spark-y: 78%; --spark-size: 3px; --spark-duration: 9s; --spark-delay: -1s; }
.app-intro-spark:nth-child(11) { --spark-x: 56%; --spark-y: 75%; --spark-size: 2px; --spark-duration: 12s; --spark-delay: -8s; }
.app-intro-spark:nth-child(12) { --spark-x: 31%; --spark-y: 29%; --spark-size: 2px; --spark-duration: 8s; --spark-delay: -5s; }

.app-intro-drone {
  position: absolute;
  top: var(--drone-y);
  left: -10%;
  width: 30px;
  height: 20px;
  opacity: 0;
  background:
    radial-gradient(ellipse at 13% 50%, rgba(255, 235, 163, 0.85) 0 2px, transparent 3px),
    radial-gradient(ellipse at 87% 50%, rgba(255, 235, 163, 0.85) 0 2px, transparent 3px),
    linear-gradient(rgba(255, 235, 163, 0.75), rgba(255, 235, 163, 0.75)) center / 65% 1px no-repeat,
    radial-gradient(ellipse at center, #dce9bf 0 2px, transparent 3px);
  filter: drop-shadow(0 0 6px rgba(255, 196, 0, 0.55));
  animation: drone-crossing var(--drone-duration) var(--drone-delay) linear infinite;
}

.app-intro-drone:nth-child(1) { --drone-y: 24%; --drone-duration: 19s; --drone-delay: -8s; }
.app-intro-drone:nth-child(2) { --drone-y: 66%; --drone-duration: 24s; --drone-delay: -15s; transform: scale(0.72); }
.app-intro-drone:nth-child(3) { --drone-y: 42%; --drone-duration: 22s; --drone-delay: -4s; transform: scale(0.55); }

.app-intro-content {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100% - 40px, 470px);
  flex-direction: column;
  align-items: center;
  padding: clamp(36px, 7vw, 56px) clamp(24px, 7vw, 52px) 32px;
  border: 1px solid rgba(255, 196, 0, 0.16);
  border-radius: 30px;
  background: linear-gradient(145deg, rgba(31, 38, 24, 0.84), rgba(21, 25, 18, 0.74));
  box-shadow:
    0 32px 100px rgba(0, 0, 0, 0.4),
    0 0 70px rgba(120, 150, 76, 0.08),
    0 1px 0 rgba(255, 255, 255, 0.045) inset;
  animation: content-arrive 0.85s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.app-intro-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin-bottom: 25px;
  border: 1px solid rgba(255, 196, 0, 0.35);
  border-radius: 24px;
  color: var(--palette-gold);
  background: linear-gradient(145deg, rgba(120, 150, 76, 0.24), rgba(76, 43, 8, 0.42));
  box-shadow: 0 12px 38px rgba(0, 0, 0, 0.25), 0 0 44px rgba(255, 196, 0, 0.08);
  animation: mark-arrive 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both, mark-float 2.4s 0.8s ease-in-out infinite;
}

.app-intro-mark-ring {
  position: absolute;
  inset: -11px;
  border: 1px solid rgba(255, 196, 0, 0.35);
  border-radius: 34px;
  animation: mark-ring 2.4s ease-out infinite;
}

.app-intro-mark-spinner {
  position: absolute;
  inset: -6px;
  border: 1px solid transparent;
  border-top-color: rgba(255, 196, 0, 0.8);
  border-right-color: rgba(120, 150, 76, 0.6);
  border-radius: 29px;
  animation: mark-spin 5s linear infinite;
}

.app-intro-satellite {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff1a8;
  box-shadow: 0 0 10px rgba(255, 196, 0, 0.8);
}

.app-intro-satellite-one {
  top: 8px;
  right: 4px;
  animation: satellite-blink 1.8s ease-in-out infinite;
}

.app-intro-satellite-two {
  bottom: 8px;
  left: 4px;
  width: 4px;
  height: 4px;
  animation: satellite-blink 1.8s 0.9s ease-in-out infinite;
}

.app-intro-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 9px;
  color: #c6d4a9;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  animation: intro-copy 0.7s 0.18s both;
}

.app-intro-kicker span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--palette-gold);
  box-shadow: 0 0 12px rgba(255, 196, 0, 0.72);
}

.app-intro-title {
  margin: 0;
  color: #fff9e8;
  font-size: clamp(44px, 9vw, 58px);
  font-weight: 800;
  letter-spacing: -0.06em;
  line-height: 1.1;
  animation: intro-copy 0.7s 0.28s both;
}

.app-intro-title span { color: var(--palette-gold); }

.app-intro-caption {
  max-width: 310px;
  margin: 12px 0 23px;
  color: #b7bdab;
  font-size: 13px;
  line-height: 1.7;
  animation: intro-copy 0.7s 0.38s both;
}

.app-intro-divider {
  width: 38px;
  height: 1px;
  margin-bottom: 20px;
  background: linear-gradient(90deg, transparent, rgba(255, 196, 0, 0.8), transparent);
  animation: intro-copy 0.7s 0.4s both;
}

.app-intro-progress {
  width: min(150px, 48vw);
  height: 3px;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.14);
  animation: intro-copy 0.7s 0.48s both;
}

.app-intro-progress span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--palette-leaf), var(--palette-gold), var(--palette-orange));
  box-shadow: 0 0 12px rgba(255, 196, 0, 0.42);
  animation: progress-fill 3.1s cubic-bezier(0.55, 0.05, 0.8, 0.45) both;
}

.app-intro-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  color: #737b69;
  font-size: 10px;
  letter-spacing: 0.04em;
  animation: intro-copy 0.7s 0.52s both;
}

.app-intro-loading-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--palette-gold);
  box-shadow: 0 0 9px rgba(255, 196, 0, 0.7);
  animation: loading-pulse 1.1s ease-in-out infinite;
}

.app-intro-footer {
  margin: 24px 0 0;
  color: rgba(198, 212, 169, 0.48);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.22em;
}

.app-intro-footer span {
  padding: 0 5px;
  color: rgba(255, 196, 0, 0.7);
}

.app-intro-orbit {
  position: absolute;
  width: min(72vw, 520px);
  aspect-ratio: 1;
  border: 1px solid rgba(255, 196, 0, 0.1);
  border-radius: 50%;
  pointer-events: none;
  animation: orbit-pulse 3.2s ease-out infinite;
}

.app-intro-orbit-two { animation-delay: 1.1s; }
.app-intro-enter-active { transition: opacity 0.35s ease; }
.app-intro-leave-active {
  transition: opacity 0.8s ease, clip-path 0.9s cubic-bezier(0.7, 0, 0.2, 1), backdrop-filter 0.8s ease;
}
.app-intro-enter-from, .app-intro-leave-to { opacity: 0; }
.app-intro-leave-to {
  clip-path: inset(0 0 100% 0);
  backdrop-filter: blur(0);
  -webkit-backdrop-filter: blur(0);
}

.app-intro-leave-active .app-intro-content {
  animation: content-exit 0.58s cubic-bezier(0.6, 0, 0.8, 0.2) both;
}

.app-main-reveal :deep(.login-card) {
  animation: login-reveal 0.9s 0.12s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.app-main-reveal :deep(.login-card > *) {
  animation: login-content-reveal 0.65s 0.32s both;
}

@keyframes mark-arrive {
  from { opacity: 0; transform: translateY(18px) scale(0.72) rotate(-8deg); }
  to { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
}
@keyframes content-arrive {
  from { opacity: 0; transform: translateY(12px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes content-exit {
  to { opacity: 0; transform: translateY(-18px) scale(0.97); filter: blur(8px); }
}
@keyframes login-reveal {
  from { opacity: 0; transform: translateY(28px) scale(0.96); filter: blur(7px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes login-content-reveal {
  from { opacity: 0; translate: 0 10px; }
  to { opacity: 1; translate: 0 0; }
}
@keyframes mark-float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -5px; }
}
@keyframes mark-ring {
  from { opacity: 0.5; transform: scale(0.9); }
  to { opacity: 0; transform: scale(1.32); }
}
@keyframes mark-spin { to { transform: rotate(360deg); } }
@keyframes intro-copy {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes progress-fill { to { width: 100%; } }
@keyframes orbit-pulse {
  from { opacity: 0.5; transform: scale(0.78); }
  to { opacity: 0; transform: scale(1.12); }
}
@keyframes intro-field-drift {
  from { transform: translate3d(0, 0, 0); opacity: 0.55; }
  to { transform: translate3d(0, -18px, 0); opacity: 0.9; }
}
@keyframes furrows-drift {
  from { background-position: 0 0; opacity: 0.55; }
  to { background-position: 0 34px; opacity: 1; }
}
@keyframes intro-glow-rotate { to { transform: rotate(360deg); } }
@keyframes sun-breathe {
  0%, 100% { opacity: 0.5; transform: scale(0.96); }
  50% { opacity: 0.95; transform: scale(1.04); }
}
@keyframes field-scan {
  from { transform: translateY(-10vh); opacity: 0; }
  20%, 80% { opacity: 1; }
  to { transform: translateY(115vh); opacity: 0; }
}
@keyframes crop-sway {
  from { transform: rotate(-3deg); }
  to { transform: rotate(3deg); }
}
@keyframes crop-grow {
  from { height: 0; }
  to { height: var(--crop-height); }
}
@keyframes intro-spark-float {
  0%, 100% { opacity: 0; transform: translate3d(0, 12px, 0) scale(0.65); }
  35%, 65% { opacity: 0.62; }
  50% { opacity: 0.95; transform: translate3d(10px, -18px, 0) scale(1.15); }
}
@keyframes satellite-blink {
  0%, 100% { opacity: 0.45; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.25); }
}
@keyframes loading-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.78); }
  50% { opacity: 1; transform: scale(1.25); }
}
@keyframes drone-crossing {
  0% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.75); }
  8%, 86% { opacity: 0.52; }
  50% { transform: translate3d(55vw, -14px, 0) scale(1); }
  92%, 100% { opacity: 0; transform: translate3d(115vw, 5px, 0) scale(0.8); }
}

@media (prefers-reduced-motion: reduce) {
  .app-intro-field, .app-intro-furrows, .app-intro-glow, .app-intro-sun, .app-intro-scan,
  .app-intro-crop, .app-intro-spark, .app-intro-drone,
  .app-intro-content, .app-intro-mark, .app-intro-mark-ring, .app-intro-mark-spinner,
  .app-intro-satellite, .app-intro-kicker,
  .app-intro-title, .app-intro-caption, .app-intro-divider, .app-intro-progress,
  .app-intro-progress span, .app-intro-loading, .app-intro-loading-dot, .app-intro-orbit {
    animation: none !important;
  }

  .app-intro-enter-active, .app-intro-leave-active {
    transition-duration: 0.01ms !important;
  }

  .app-intro-leave-active .app-intro-content { animation: none !important; }
  .app-main-reveal :deep(.login-card) { animation: none !important; }
  .app-main-reveal :deep(.login-card > *) { animation: none !important; }
}
</style>
