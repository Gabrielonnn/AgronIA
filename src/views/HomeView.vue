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
  <div class="space-y-8">
    <!-- Hero Banner -->
    <div class="relative rounded-2xl overflow-hidden min-h-[320px] flex items-end shadow-xl">
      <img src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&q=80&w=1600" alt="Campos agrícolas de Sinaloa" class="absolute inset-0 w-full h-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent"></div>
      <div class="relative z-10 p-8 text-white w-full">
        <span class="inline-flex items-center gap-1.5 bg-agron-green/90 text-white text-xs font-semibold px-3 py-1 rounded-full mb-3">
          <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          Sistema Activo — Culiacán, Sinaloa
        </span>
        <h1 class="text-4xl font-extrabold leading-tight mb-2">
          Bienvenido a <span class="text-agron-green">AgronIA</span>
        </h1>
        <p class="text-gray-200 text-lg max-w-xl">
          La plataforma satelital de agricultura de precisión para el agro sinaloense.
        </p>
        <div class="flex gap-3 mt-5">
          <RouterLink to="/mapas" class="inline-flex items-center gap-2 bg-agron-green hover:bg-agron-green-dark text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm">
            <Satellite class="w-4 h-4" /> Ver Mapa Satelital
          </RouterLink>
          <RouterLink to="/simulacion" class="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm backdrop-blur-sm border border-white/20">
            Ir a Simulación <ArrowRight class="w-4 h-4" />
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Servicios ofrecidos (Movido arriba) -->
    <div>
      <h2 class="text-xl font-bold text-gray-900 mb-4">Nuestros Servicios</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div v-for="service in services" :key="service.title"
          class="group relative rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-default">
          <div class="relative h-48 overflow-hidden">
            <img :src="service.img" :alt="service.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <span class="absolute top-3 right-3 bg-agron-green text-white text-xs font-bold px-2.5 py-1 rounded-full">{{ service.badge }}</span>
          </div>
          <div class="p-5 bg-white">
            <h3 class="font-bold text-gray-900 text-lg mb-2">{{ service.title }}</h3>
            <p class="text-gray-500 text-sm leading-relaxed">{{ service.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Telemetría en tiempo real (Movido abajo) -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-xl font-bold text-gray-900">Telemetría en Tiempo Real</h2>
        <span class="flex items-center gap-1.5 text-xs text-agron-green font-medium">
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
