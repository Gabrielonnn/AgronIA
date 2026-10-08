<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, GaugeChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { Satellite, Droplets, Bug, Wind, ArrowRight, TrendingUp } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { useMainStore } from '../stores'

use([CanvasRenderer, LineChart, BarChart, GaugeChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const store = useMainStore()
const userName = computed(() => {
  const name = store.user?.profile?.full_name ?? store.user?.user_metadata?.full_name
  const firstName = typeof name === 'string' ? name.trim().split(/\s+/)[0] : ''
  return firstName || 'productor'
})

// Telemetría en tiempo real (simulada)
const humidity = ref(62)
const pestIndex = ref(12)
const temperature = ref(27.4)
const windSpeed = ref(14)

let telemetryInterval: ReturnType<typeof setInterval>

onMounted(() => {
  telemetryInterval = setInterval(() => {
    humidity.value = Math.max(30, Math.min(95, humidity.value + (Math.random() - 0.5) * 3))
    pestIndex.value = Math.max(0, Math.min(100, pestIndex.value + (Math.random() - 0.5) * 2))
    temperature.value = parseFloat((Math.max(18, Math.min(40, temperature.value + (Math.random() - 0.5) * 0.5))).toFixed(1))
    windSpeed.value = Math.max(0, Math.min(50, windSpeed.value + (Math.random() - 0.5) * 2))
  }, 2000)
})

onBeforeUnmount(() => clearInterval(telemetryInterval))

// Gráfico de humedad de suelo semanal
const humidityChartOptions = {
  tooltip: { trigger: 'axis' },
  grid: { left: '3%', right: '4%', bottom: '10%', top: '10%', containLabel: true },
  xAxis: { type: 'category', data: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], axisLine: { lineStyle: { color: '#d1fae5' } }, axisLabel: { color: '#6ee7b7' } },
  yAxis: { type: 'value', axisLabel: { color: '#6ee7b7', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#064e3b30' } } },
  series: [{
    name: 'Humedad Suelo',
    type: 'line',
    smooth: true,
    data: [58, 54, 49, 65, 70, 67, 62],
    itemStyle: { color: '#10B981' },
    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#10B98155' }, { offset: 1, color: '#10B98105' }] } },
    lineStyle: { width: 2, color: '#10B981' }
  }]
}

// Gráfico de índice de plagas semanal
const pestChartOptions = {
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '4%', bottom: '10%', top: '10%', containLabel: true },
  xAxis: { type: 'category', data: ['Sec A', 'Sec B', 'Sec C', 'Sec D', 'Sec E'], axisLabel: { color: '#fcd34d' } },
  yAxis: { type: 'value', axisLabel: { color: '#fcd34d', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#78350f30' } } },
  series: [{
    name: 'Índice de Plagas',
    type: 'bar',
    data: [8, 22, 12, 35, 5],
    itemStyle: {
      color: (params: any) => {
        const v = params.data
        if (v > 30) return '#EF4444'
        if (v > 15) return '#F97316'
        return '#10B981'
      },
      borderRadius: [4, 4, 0, 0]
    }
  }]
}

const services = [
  {
    title: 'Análisis Multiespectral',
    description: 'Imágenes NDVI y térmicas de alta resolución para detectar estrés hídrico y plagas antes de que sean visibles.',
    img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop',
    badge: 'IA Activa'
  },
  {
    title: 'Drones Autónomos',
    description: 'Flota de UAVs para fumigación e irrigación de precisión, reduciendo el consumo de agroquímicos hasta un 40%.',
    img: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&auto=format&fit=crop',
    badge: 'Automatizado'
  },
  {
    title: 'Sensores IoT en Suelo',
    description: 'Red de sondas conectadas para medir en tiempo real la humedad, conductividad y temperatura de la raíz.',
    img: 'https://images.unsplash.com/photo-1530836369250-ef71a3f5e43d?w=800&auto=format&fit=crop',
    badge: 'Tiempo Real'
  },
  {
    title: 'Dashboards Analíticos',
    description: 'Visualiza reportes detallados y series de tiempo con recomendaciones prescriptivas generadas por IA.',
    img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop',
    badge: 'Big Data'
  }
]

const stats = [
  { label: 'Agricultores atendidos', value: '1,240+', icon: '🌾' },
  { label: 'Hectáreas monitoreadas', value: '38,500', icon: '🛰️' },
  { label: 'Ahorro en agua', value: '34%', icon: '💧' },
  { label: 'Reducción de plagas', value: '51%', icon: '🐛' },
]
</script>

<template>
  <div class="home-page space-y-7">
    <header class="home-heading">
      <div>
        <span class="home-eyebrow">CENTRO DE OPERACIONES</span>
        <h1>Hola, {{ userName }}<span class="home-heading-period">.</span></h1>
        <p>Una vista clara de lo que sucede en tu campo.</p>
      </div>
      <span class="home-heading-tag"><span></span> AGRONIA · SINALOA</span>
    </header>

    <!-- Hero Banner -->
    <section class="home-hero relative rounded-2xl overflow-hidden min-h-[320px] flex items-end shadow-xl">
      <img src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&q=80&w=1600" alt="Campos agrícolas de Sinaloa" class="home-hero-image absolute inset-0 w-full h-full object-cover" />
      <div class="home-hero-overlay absolute inset-0"></div>
      <div class="home-hero-content relative z-10 p-8 text-white w-full">
        <span class="home-status inline-flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1 rounded-full mb-3">
          <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          AGRICULTURA DE PRECISIÓN
        </span>
        <h1 class="home-title text-4xl font-extrabold leading-tight mb-2">
          Tu campo, con una nueva <span class="text-agron-green">perspectiva.</span>
        </h1>
        <p class="home-description text-gray-200 text-lg max-w-xl">
          Datos, mapas e inteligencia agrícola para tomar decisiones con confianza.
        </p>
        <div class="home-actions flex gap-3 mt-5">
          <RouterLink to="/mapas" class="home-action-primary inline-flex items-center gap-2 bg-agron-green hover:bg-agron-green-dark text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm">
            <Satellite class="w-4 h-4" /> Ver Mapa Satelital
          </RouterLink>
          <RouterLink to="/simulacion" class="home-action-secondary inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm backdrop-blur-sm border border-white/20">
            Ir a Simulación <ArrowRight class="w-4 h-4" />
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Servicios ofrecidos (Movido arriba) -->
    <div>
      <div class="home-section-heading">
        <div>
          <span class="home-eyebrow">HERRAMIENTAS</span>
          <h2 class="home-section-title">Todo tu campo, en un solo lugar</h2>
        </div>
        <span class="home-section-caption">Explora las capacidades de AgronIA</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div v-for="service in services" :key="service.title"
        class="home-service-card group relative rounded-xl overflow-hidden shadow-sm border hover:shadow-md transition-shadow cursor-default">
          <div class="relative h-48 overflow-hidden">
            <img :src="service.img" :alt="service.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <span class="home-service-badge absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full">{{ service.badge }}</span>
          </div>
          <div class="home-service-copy p-5 bg-white">
            <h3 class="font-bold text-gray-900 text-lg mb-2">{{ service.title }}</h3>
            <p class="text-gray-500 text-sm leading-relaxed">{{ service.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Telemetría en tiempo real (Movido abajo) -->
    <div>
      <div class="home-section-heading">
        <div>
          <span class="home-eyebrow">ESTADO DEL CULTIVO</span>
          <h2 class="home-section-title">Resumen de condiciones</h2>
        </div>
        <span class="home-live-label"><span></span> Datos de demostración · actualización cada 2 s</span>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="home-metric-card rounded-xl p-5 shadow-sm border flex flex-col gap-2">
          <div class="flex items-center gap-2 text-blue-500">
            <Droplets class="w-5 h-5" />
            <span class="home-metric-label">Humedad del suelo</span>
          </div>
          <div class="home-metric-value">{{ humidity.toFixed(0) }}<span>%</span></div>
          <div class="home-meter">
            <div class="h-1.5 rounded-full bg-blue-400 transition-all duration-700" :style="`width: ${humidity}%`"></div>
          </div>
        </div>
        <div class="home-metric-card rounded-xl p-5 shadow-sm border flex flex-col gap-2">
          <div class="flex items-center gap-2 text-orange-500">
            <Bug class="w-5 h-5" />
            <span class="home-metric-label">Índice de plagas</span>
          </div>
          <div class="home-metric-value" :class="pestIndex > 30 ? 'text-red-400' : pestIndex > 15 ? 'text-orange-400' : 'text-agron-green'">
            {{ pestIndex.toFixed(0) }}<span>%</span>
          </div>
          <div class="home-meter">
            <div class="h-1.5 rounded-full transition-all duration-700" :class="pestIndex > 30 ? 'bg-red-500' : pestIndex > 15 ? 'bg-orange-400' : 'bg-agron-green'" :style="`width: ${pestIndex}%`"></div>
          </div>
        </div>
        <div class="home-metric-card rounded-xl p-5 shadow-sm border flex flex-col gap-2">
          <div class="flex items-center gap-2 text-agron-alert">
            <TrendingUp class="w-5 h-5" />
            <span class="home-metric-label">Temperatura</span>
          </div>
          <div class="home-metric-value">{{ temperature }}<span>°C</span></div>
          <div class="home-meter">
            <div class="h-1.5 rounded-full bg-orange-400 transition-all duration-700" :style="`width: ${((temperature - 18) / 22) * 100}%`"></div>
          </div>
        </div>
        <div class="home-metric-card rounded-xl p-5 shadow-sm border flex flex-col gap-2">
          <div class="flex items-center gap-2 text-cyan-500">
            <Wind class="w-5 h-5" />
            <span class="home-metric-label">Velocidad del viento</span>
          </div>
          <div class="home-metric-value">{{ windSpeed.toFixed(0) }}<span> km/h</span></div>
          <div class="home-meter">
            <div class="h-1.5 rounded-full bg-cyan-400 transition-all duration-700" :style="`width: ${(windSpeed / 50) * 100}%`"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Gráficos analíticos -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="home-chart-card rounded-xl p-5 shadow-sm">
        <h3 class="home-chart-title">Humedad del suelo <span>· Semana actual</span></h3>
        <div class="h-52">
          <v-chart :option="humidityChartOptions" autoresize class="h-full w-full" />
        </div>
      </div>
      <div class="home-chart-card home-chart-warm rounded-xl p-5 shadow-sm">
        <h3 class="home-chart-title">Índice de plagas <span>· Por sector</span></h3>
        <div class="h-52">
          <v-chart :option="pestChartOptions" autoresize class="h-full w-full" />
        </div>
      </div>
    </div>

    <!-- Estadísticas de impacto -->
    <div class="home-impact rounded-2xl p-8 text-white">
      <span class="home-eyebrow">RESULTADOS</span>
      <h2 class="text-xl font-bold mb-6 text-center">Impacto AgronIA en Sinaloa</h2>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div v-for="stat in stats" :key="stat.label" class="text-center">
          <div class="text-3xl mb-1">{{ stat.icon }}</div>
          <div class="text-3xl font-extrabold">{{ stat.value }}</div>
          <div class="text-emerald-200 text-sm mt-1">{{ stat.label }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  min-width: 0;
  animation: home-enter 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.home-heading,
.home-section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.home-heading { padding: 0.25rem 0 0.2rem; }

.home-heading h1 {
  margin-top: 0.35rem;
  color: #f0f1e9;
  font-size: clamp(1.65rem, 3vw, 2.25rem);
  font-weight: 750;
  letter-spacing: -0.055em;
}

.home-heading > div > p {
  margin-top: 0.35rem;
  color: #a7ad9a;
  font-size: 0.9rem;
}

.home-heading-period { color: #d9bd68; }

.home-heading-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid rgba(211, 189, 103, 0.18);
  border-radius: 999px;
  color: #c9bd8f;
  background: rgba(211, 189, 103, 0.055);
  font-size: 0.58rem;
  font-weight: 750;
  letter-spacing: 0.12em;
  white-space: nowrap;
}

.home-heading-tag > span,
.home-live-label > span {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #72d59f;
  box-shadow: 0 0 12px rgba(114, 213, 159, 0.55);
  animation: home-pulse 2s ease-in-out infinite;
}

.home-eyebrow {
  display: block;
  color: #c0a95d;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.home-section-heading { margin-bottom: 1rem; }

.home-section-title {
  margin-top: 0.35rem;
  color: #edf0e5;
  font-size: clamp(1.1rem, 2vw, 1.35rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.home-section-caption {
  padding-bottom: 0.15rem;
  color: #909986;
  font-size: 0.72rem;
}

.home-hero {
  min-height: clamp(330px, 37vw, 460px);
  isolation: isolate;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 22px 54px rgba(0, 0, 0, 0.28), inset 0 1px rgba(255, 255, 255, 0.12);
}

.home-hero-image {
  z-index: -2;
  transform: scale(1.015);
  animation: field-drift 24s ease-in-out infinite alternate;
}

.home-hero-overlay {
  z-index: -1;
  background:
    linear-gradient(90deg, rgba(8, 22, 13, 0.88) 0%, rgba(8, 22, 13, 0.62) 48%, rgba(8, 22, 13, 0.08) 100%),
    linear-gradient(0deg, rgba(7, 14, 9, 0.28), transparent 58%);
}

.home-hero-content {
  padding: clamp(1.4rem, 4vw, 3.25rem);
}

.home-status {
  padding: 0.55rem 0.9rem;
  border: 1px solid rgba(160, 255, 208, 0.26);
  background: rgba(9, 45, 34, 0.66);
  box-shadow: 0 7px 24px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(10px);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  animation: home-enter 0.6s 0.08s both;
}

.home-title {
  max-width: 790px;
  margin-top: 0.25rem;
  font-size: clamp(2.2rem, 5vw, 4rem);
  line-height: 1.02;
  letter-spacing: -0.055em;
  text-wrap: balance;
  animation: home-enter 0.65s 0.14s both;
}

.home-title span {
  color: #5fe0a1;
  text-shadow: 0 0 28px rgba(47, 211, 133, 0.2);
}

.home-description {
  max-width: 620px;
  font-size: clamp(1rem, 1.6vw, 1.2rem);
  line-height: 1.6;
  text-wrap: pretty;
  animation: home-enter 0.65s 0.2s both;
}

.home-actions { flex-wrap: wrap; animation: home-enter 0.65s 0.26s both; }

.home-action-primary,
.home-action-secondary {
  min-height: 46px;
  justify-content: center;
  border-radius: 12px;
  transition: transform 0.22s ease, box-shadow 0.22s ease, filter 0.22s ease, background 0.22s ease;
}

.home-action-primary {
  background: linear-gradient(120deg, #14b87d, #07855e);
  box-shadow: 0 10px 24px rgba(8, 151, 99, 0.3);
}

.home-action-primary:hover,
.home-action-secondary:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

.home-action-primary:hover { box-shadow: 0 14px 30px rgba(8, 151, 99, 0.42); }
.home-action-secondary { background: rgba(255, 255, 255, 0.13); }

.home-service-card {
  min-width: 0;
  border-color: rgba(196, 218, 147, 0.14);
  background: linear-gradient(145deg, rgba(28, 36, 25, 0.96), rgba(19, 25, 19, 0.96));
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s ease, border-color 0.28s ease;
}

.home-service-card:hover {
  transform: translateY(-5px);
  border-color: rgba(255, 196, 0, 0.24);
  box-shadow: 0 22px 42px rgba(0, 0, 0, 0.24);
}

.home-service-card > div:first-child { isolation: isolate; }
.home-service-card img { transition: transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease; }
.home-service-card:hover img { transform: scale(1.045); filter: saturate(1.08); }

.home-service-copy { background: transparent; }
.home-service-copy h3 {
  color: #edf0e5;
  letter-spacing: -0.025em;
}
.home-service-copy p { color: #a5ad9b; }

.home-service-badge {
  border: 1px solid rgba(187, 230, 164, 0.25);
  color: #d8efc4;
  background: rgba(16, 45, 32, 0.78);
  backdrop-filter: blur(12px);
}

.home-live-label {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: #9da690;
  font-size: 0.68rem;
  white-space: nowrap;
}

.home-metric-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-color: rgba(196, 218, 147, 0.13);
  background:
    radial-gradient(ellipse at 100% 0, rgba(157, 179, 100, 0.09), transparent 48%),
    linear-gradient(145deg, rgba(29, 36, 25, 0.94), rgba(19, 24, 18, 0.96));
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
  transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
  animation: home-enter 0.5s both;
}

.home-metric-card:nth-child(2) { animation-delay: 0.05s; }
.home-metric-card:nth-child(3) { animation-delay: 0.1s; }
.home-metric-card:nth-child(4) { animation-delay: 0.15s; }

.home-metric-card:hover {
  transform: translateY(-3px);
  border-color: rgba(211, 189, 103, 0.3);
  box-shadow: 0 18px 35px rgba(0, 0, 0, 0.22);
}

.home-metric-label {
  min-width: 0;
  color: #aab19f;
  font-size: 0.76rem;
  font-weight: 550;
}

.home-metric-value {
  color: #f0f1e9;
  font-size: clamp(1.7rem, 3vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.06em;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.home-metric-value > span {
  margin-left: 0.15rem;
  color: #929b88;
  font-size: 0.9rem;
  font-weight: 550;
  letter-spacing: -0.01em;
}

.home-meter {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(231, 237, 216, 0.08);
}

.home-meter > div { height: 100%; }

.home-chart-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(196, 218, 147, 0.14);
  background:
    radial-gradient(ellipse at 5% 0, rgba(32, 116, 76, 0.19), transparent 56%),
    linear-gradient(145deg, rgba(25, 34, 25, 0.98), rgba(17, 23, 18, 0.98));
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.18);
}

.home-chart-warm {
  background:
    radial-gradient(ellipse at 95% 0, rgba(172, 111, 33, 0.14), transparent 54%),
    linear-gradient(145deg, rgba(32, 30, 22, 0.98), rgba(20, 22, 18, 0.98));
}

.home-chart-title {
  margin-bottom: 0.9rem;
  color: #e9eddf;
  font-size: 0.92rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.home-chart-title > span {
  color: #89927f;
  font-size: 0.75rem;
  font-weight: 450;
}

.home-impact {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(216, 192, 111, 0.2);
  background:
    radial-gradient(ellipse at 50% -20%, rgba(145, 167, 92, 0.3), transparent 60%),
    linear-gradient(120deg, #18271e, #12221c 58%, #202719);
  box-shadow: 0 20px 44px rgba(0, 0, 0, 0.2), inset 0 1px rgba(255, 255, 255, 0.04);
}

.home-impact > .home-eyebrow { text-align: center; }
.home-impact h2 { margin-top: 0.5rem; color: #f0f0e5; }
.home-impact .text-3xl { color: #f0e8c9; }
.home-impact .text-emerald-200 { color: #b6c5a2; }

@keyframes home-enter {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes home-pulse {
  50% { opacity: 0.48; box-shadow: 0 0 4px rgba(114, 213, 159, 0.25); }
}

@keyframes field-drift {
  from { transform: scale(1.015) translateX(0); }
  to { transform: scale(1.075) translateX(-0.7%); }
}

@media (max-width: 760px) {
  .home-section-caption { display: none; }
  .home-live-label { max-width: 45%; white-space: normal; text-align: right; }
}

@media (max-width: 640px) {
  .home-hero { min-height: 360px; }
  .home-heading { align-items: flex-start; }
  .home-heading-tag { margin-top: 0.15rem; font-size: 0.5rem; }
  .home-heading > div > p { max-width: 28ch; }
  .home-hero-overlay {
    background:
      linear-gradient(90deg, rgba(8, 22, 13, 0.82), rgba(8, 22, 13, 0.26)),
      linear-gradient(0deg, rgba(7, 14, 9, 0.44), transparent 80%);
  }
  .home-title { max-width: 14ch; }
  .home-actions { display: grid; grid-template-columns: 1fr; }
  .home-actions a { width: 100%; }
  .home-live-label { max-width: 42%; font-size: 0.61rem; }
  .home-metric-card { padding: 1rem; }
  .home-metric-label { font-size: 0.68rem; }
  .home-impact { padding: 1.5rem; }
}

@media (max-width: 380px) {
  .home-heading-tag { display: none; }
  .home-live-label { max-width: 38%; font-size: 0.56rem; }
}

@media (prefers-reduced-motion: reduce) {
  .home-page, .home-heading-tag > span, .home-live-label > span, .home-hero-image, .home-status, .home-title, .home-description, .home-actions, .home-metric-card { animation: none; }
  .home-service-card, .home-service-card img, .home-metric-card, .home-action-primary, .home-action-secondary { transition: none; }
}
</style>
