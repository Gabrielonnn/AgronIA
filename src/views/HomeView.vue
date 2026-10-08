<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, GaugeChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Satellite, Droplets, Bug, Wind, ArrowRight, TrendingUp } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'

use([CanvasRenderer, LineChart, BarChart, GaugeChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])



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
  <div class="home-page space-y-8">
    <!-- Hero Banner -->
    <section class="home-hero relative rounded-2xl overflow-hidden min-h-[320px] flex items-end shadow-xl">
      <img src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&q=80&w=1600" alt="Campos agrícolas de Sinaloa" class="home-hero-image absolute inset-0 w-full h-full object-cover" />
      <div class="home-hero-overlay absolute inset-0"></div>
      <div class="home-hero-content relative z-10 p-8 text-white w-full">
        <span class="home-status inline-flex items-center gap-1.5 bg-agron-green/90 text-white text-xs font-semibold px-3 py-1 rounded-full mb-3">
          <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          Sistema Activo — Culiacán, Sinaloa
        </span>
        <h1 class="home-title text-4xl font-extrabold leading-tight mb-2">
          Bienvenido a <span class="text-agron-green">AgronIA</span>
        </h1>
        <p class="home-description text-gray-200 text-lg max-w-xl">
          La plataforma satelital de agricultura de precisión para el agro sinaloense.
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
      <h2 class="home-section-title text-xl font-bold text-gray-900 mb-4">Nuestros Servicios</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div v-for="service in services" :key="service.title"
        class="home-service-card group relative rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-default">
          <div class="relative h-48 overflow-hidden">
            <img :src="service.img" :alt="service.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <span class="absolute top-3 right-3 bg-agron-green text-white text-xs font-bold px-2.5 py-1 rounded-full">{{ service.badge }}</span>
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
      <div class="flex items-center justify-between mb-3">
        <h2 class="home-section-title text-xl font-bold text-gray-900">Telemetría en Tiempo Real</h2>
        <span class="home-live-label flex items-center gap-1.5 text-xs text-agron-green font-medium">
          <span class="w-2 h-2 rounded-full bg-agron-green animate-pulse"></span>
          Actualización cada 2s
        </span>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-2">
          <div class="flex items-center gap-2 text-blue-500">
            <Droplets class="w-5 h-5" />
            <span class="text-sm font-medium text-gray-600">Humedad del Suelo</span>
          </div>
          <div class="text-3xl font-extrabold text-gray-900">{{ humidity.toFixed(0) }}<span class="text-lg font-medium text-gray-400">%</span></div>
          <div class="w-full bg-gray-100 rounded-full h-1.5">
            <div class="h-1.5 rounded-full bg-blue-400 transition-all duration-700" :style="`width: ${humidity}%`"></div>
          </div>
        </div>
        <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-2">
          <div class="flex items-center gap-2 text-orange-500">
            <Bug class="w-5 h-5" />
            <span class="text-sm font-medium text-gray-600">Índice de Plagas</span>
          </div>
          <div class="text-3xl font-extrabold" :class="pestIndex > 30 ? 'text-red-500' : pestIndex > 15 ? 'text-orange-500' : 'text-agron-green'">
            {{ pestIndex.toFixed(0) }}<span class="text-lg font-medium text-gray-400">%</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-1.5">
            <div class="h-1.5 rounded-full transition-all duration-700" :class="pestIndex > 30 ? 'bg-red-500' : pestIndex > 15 ? 'bg-orange-400' : 'bg-agron-green'" :style="`width: ${pestIndex}%`"></div>
          </div>
        </div>
        <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-2">
          <div class="flex items-center gap-2 text-agron-alert">
            <TrendingUp class="w-5 h-5" />
            <span class="text-sm font-medium text-gray-600">Temperatura</span>
          </div>
          <div class="text-3xl font-extrabold text-gray-900">{{ temperature }}<span class="text-lg font-medium text-gray-400">°C</span></div>
          <div class="w-full bg-gray-100 rounded-full h-1.5">
            <div class="h-1.5 rounded-full bg-orange-400 transition-all duration-700" :style="`width: ${((temperature - 18) / 22) * 100}%`"></div>
          </div>
        </div>
        <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-2">
          <div class="flex items-center gap-2 text-cyan-500">
            <Wind class="w-5 h-5" />
            <span class="text-sm font-medium text-gray-600">Velocidad del Viento</span>
          </div>
          <div class="text-3xl font-extrabold text-gray-900">{{ windSpeed.toFixed(0) }}<span class="text-lg font-medium text-gray-400"> km/h</span></div>
          <div class="w-full bg-gray-100 rounded-full h-1.5">
            <div class="h-1.5 rounded-full bg-cyan-400 transition-all duration-700" :style="`width: ${(windSpeed / 50) * 100}%`"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Gráficos analíticos -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-agron-green-dark rounded-xl p-5 shadow-sm">
        <h3 class="font-semibold text-white mb-4">Humedad del Suelo — Semana Actual</h3>
        <div class="h-52">
          <v-chart :option="humidityChartOptions" autoresize class="h-full w-full" />
        </div>
      </div>
      <div class="bg-[#1c1007] rounded-xl p-5 shadow-sm">
        <h3 class="font-semibold text-white mb-4">Índice de Plagas por Sector</h3>
        <div class="h-52">
          <v-chart :option="pestChartOptions" autoresize class="h-full w-full" />
        </div>
      </div>
    </div>

    <!-- Estadísticas de impacto -->
    <div class="bg-gradient-to-r from-agron-green-dark to-emerald-700 rounded-2xl p-8 text-white">
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

.home-hero {
  min-height: clamp(320px, 36vw, 440px);
  isolation: isolate;
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
  background: rgba(9, 115, 83, 0.78);
  box-shadow: 0 7px 24px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(10px);
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

.home-section-title {
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.home-service-card {
  border-color: rgba(196, 218, 147, 0.14);
  background: linear-gradient(145deg, rgba(31, 38, 24, 0.92), rgba(21, 25, 18, 0.9));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
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
.home-service-copy h3 { letter-spacing: -0.025em; }
.home-live-label { white-space: nowrap; }

@keyframes home-enter {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes field-drift {
  from { transform: scale(1.015) translateX(0); }
  to { transform: scale(1.075) translateX(-0.7%); }
}

@media (max-width: 640px) {
  .home-hero { min-height: 360px; }
  .home-hero-overlay {
    background:
      linear-gradient(90deg, rgba(8, 22, 13, 0.82), rgba(8, 22, 13, 0.26)),
      linear-gradient(0deg, rgba(7, 14, 9, 0.44), transparent 80%);
  }
  .home-title { max-width: 14ch; }
  .home-actions { display: grid; grid-template-columns: 1fr; }
  .home-actions a { width: 100%; }
  .home-live-label { font-size: 0.66rem; }
}

@media (max-width: 380px) {
  .home-live-label { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .home-page, .home-hero-image, .home-status, .home-title, .home-description, .home-actions { animation: none; }
  .home-service-card, .home-service-card img, .home-action-primary, .home-action-secondary { transition: none; }
}
</style>
