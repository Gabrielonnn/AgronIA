<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart, BarChart, GaugeChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import Card from '../components/ui/Card.vue'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Droplets, Bug, Thermometer, TrendingUp, AlertTriangle, CheckCircle, Info } from 'lucide-vue-next'

use([CanvasRenderer, LineChart, PieChart, BarChart, GaugeChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

// ============================================================
// Estado de telemetría — proviene de la simulación
// ============================================================
const simHumidity = ref(62.4)
const simPestIndex = ref(18.2)
const simTemperature = ref(27.4)
const simNDVI = ref(0.72)
const simWaterSaved = ref(65)
const simChemReduction = ref(20)

let telemetryInterval: ReturnType<typeof setInterval>

onMounted(() => {
  telemetryInterval = setInterval(() => {
    simHumidity.value = parseFloat(Math.max(30, Math.min(95, simHumidity.value + (Math.random() - 0.5) * 1.5)).toFixed(1))
    simPestIndex.value = parseFloat(Math.max(0, Math.min(100, simPestIndex.value + (Math.random() - 0.5) * 1)).toFixed(1))
    simTemperature.value = parseFloat(Math.max(18, Math.min(40, simTemperature.value + (Math.random() - 0.5) * 0.3)).toFixed(1))
    simNDVI.value = parseFloat(Math.max(0.1, Math.min(1, simNDVI.value + (Math.random() - 0.5) * 0.02)).toFixed(2))
  }, 2500)
})

onBeforeUnmount(() => clearInterval(telemetryInterval))

const pestStatus = computed(() => {
  if (simPestIndex.value > 30) return { label: 'Crítico', color: 'text-red-500', bg: 'bg-red-50', icon: AlertTriangle, border: 'border-red-200' }
  if (simPestIndex.value > 15) return { label: 'Alerta', color: 'text-orange-500', bg: 'bg-orange-50', icon: AlertTriangle, border: 'border-orange-200' }
  return { label: 'Normal', color: 'text-agron-green', bg: 'bg-green-50', icon: CheckCircle, border: 'border-green-200' }
})

const humidityStatus = computed(() => {
  if (simHumidity.value < 40) return { label: 'Bajo', color: 'text-red-500' }
  if (simHumidity.value < 55) return { label: 'Moderado', color: 'text-orange-500' }
  return { label: 'Óptimo', color: 'text-agron-green' }
})

// ============================================================
// Gráfico Humedad del Suelo (desde simulación)
// ============================================================
const climateChartOptions = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['Humedad Suelo (%)', 'Temperatura (°C)'], bottom: 0, textStyle: { color: '#6b7280' } },
  grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'Humedad Suelo (%)',
      type: 'line',
      smooth: true,
      data: [58, 54, 49, 65, 70, 67, simHumidity.value],
      itemStyle: { color: '#10B981' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#10B98140' }, { offset: 1, color: '#10B98105' }] } }
    },
    {
      name: 'Temperatura (°C)',
      type: 'line',
      smooth: true,
      data: [24, 26, 28, 22, 21, 23, simTemperature.value],
      itemStyle: { color: '#F97316' }
    }
  ]
}))

// ============================================================
// Gráfico Sustentabilidad (datos de simulación)
// ============================================================
const sustainabilityChartOptions = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { top: '5%', left: 'center' },
  series: [{
    name: 'Índice de Sustentabilidad',
    type: 'pie',
    radius: ['40%', '70%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
    label: { show: false, position: 'center' },
    emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
    labelLine: { show: false },
    data: [
      { value: simWaterSaved.value, name: 'Agua Ahorrada', itemStyle: { color: '#10B981' } },
      { value: simChemReduction.value, name: 'Reducción Químicos', itemStyle: { color: '#047857' } },
      { value: 100 - simWaterSaved.value - simChemReduction.value, name: 'Uso Tradicional', itemStyle: { color: '#D1FAE5' } }
    ]
  }]
}))

// ============================================================
// Gráfico Comparativo por Sector (plagas desde simulación)
// ============================================================
const comparisonChartOptions = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { data: ['Zonas Saludables', 'Zonas de Riesgo'], bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
  xAxis: { type: 'category', data: ['Sector A', 'Sector B', 'Sector C', 'Sector D', 'Sector E'] },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'Zonas Saludables',
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' },
      data: [120, 132, 101, 134, 90],
      itemStyle: { color: '#10B981' }
    },
    {
      name: 'Zonas de Riesgo',
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' },
      data: [20, 12, Math.round(simPestIndex.value * 1.2), 10, 30],
      itemStyle: { color: '#EF4444' }
    }
  ]
}))

// ============================================================
// Gauge NDVI
// ============================================================
const ndviGaugeOptions = computed(() => ({
  series: [{
    type: 'gauge',
    startAngle: 200,
    endAngle: -20,
    min: 0,
    max: 1,
    splitNumber: 4,
    radius: '90%',
    axisLine: {
      lineStyle: {
        width: 16,
        color: [[0.33, '#EF4444'], [0.66, '#F97316'], [0.85, '#facc15'], [1, '#10B981']]
      }
    },
    pointer: { icon: 'path://M2090.36389,615.30999 L2090.36389,615.30999 C2091.48372,615.30999 2092.40383,616.23010 2092.40383,617.34993 L2092.40383,652.35000 C2092.40383,653.46983 2091.48372,654.38994 2090.36389,654.38994 L2090.36389,654.38994 C2089.24406,654.38994 2088.32395,653.46983 2088.32395,652.35000 L2088.32395,617.34993 C2088.32395,616.23010 2089.24406,615.30999 2090.36389,615.30999 Z', length: '75%', width: 6, offsetCenter: [0, '5%'] },
    detail: {
      valueAnimation: true,
      formatter: (v: number) => `NDVI\n${v.toFixed(2)}`,
      color: '#1f2937',
      fontSize: 14,
      fontWeight: 'bold',
      offsetCenter: [0, '60%']
    },
    data: [{ value: simNDVI.value }],
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: '#9ca3af', fontSize: 10, formatter: (v: number) => v.toFixed(1) }
  }]
}))

// ============================================================
// Gauge Índice de Plagas
// ============================================================
const pestGaugeOptions = computed(() => ({
  series: [{
    type: 'gauge',
    startAngle: 200,
    endAngle: -20,
    min: 0,
    max: 100,
    splitNumber: 4,
    radius: '90%',
    axisLine: {
      lineStyle: {
        width: 16,
        color: [[0.3, '#10B981'], [0.6, '#facc15'], [0.85, '#F97316'], [1, '#EF4444']]
      }
    },
    pointer: { icon: 'path://M2090.36389,615.30999 L2090.36389,615.30999 C2091.48372,615.30999 2092.40383,616.23010 2092.40383,617.34993 L2092.40383,652.35000 C2092.40383,653.46983 2091.48372,654.38994 2090.36389,654.38994 L2090.36389,654.38994 C2089.24406,654.38994 2088.32395,653.46983 2088.32395,652.35000 L2088.32395,617.34993 C2088.32395,616.23010 2089.24406,615.30999 2090.36389,615.30999 Z', length: '75%', width: 6, offsetCenter: [0, '5%'] },
    detail: {
      valueAnimation: true,
      formatter: (v: number) => `Plagas\n${v.toFixed(0)}%`,
      color: '#1f2937',
      fontSize: 14,
      fontWeight: 'bold',
      offsetCenter: [0, '60%']
    },
    data: [{ value: simPestIndex.value }],
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: '#9ca3af', fontSize: 10 }
  }]
}))
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Dashboards y Analítica</h1>
      <p class="text-gray-500 mt-1">Datos en tiempo real provenientes de la simulación de cultivos.</p>
    </div>

    <!-- Tarjetas de parámetros clave -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Humedad del Suelo -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div class="flex items-center gap-2 mb-3">
          <Droplets class="w-5 h-5 text-blue-500" />
          <span class="text-sm font-medium text-gray-600">Humedad Suelo</span>
        </div>
        <div class="text-3xl font-extrabold text-gray-900">
          {{ simHumidity }}<span class="text-lg text-gray-400">%</span>
        </div>
        <div class="mt-2 flex items-center justify-between">
          <div class="flex-1 bg-gray-100 rounded-full h-1.5 mr-2">
            <div class="h-1.5 rounded-full bg-blue-400 transition-all duration-700" :style="`width: ${simHumidity}%`"></div>
          </div>
          <span class="text-xs font-semibold" :class="humidityStatus.color">{{ humidityStatus.label }}</span>
        </div>
      </div>

      <!-- Índice de Plagas -->
      <div class="bg-white rounded-xl p-5 shadow-sm border" :class="pestStatus.border">
        <div class="flex items-center gap-2 mb-3">
          <Bug class="w-5 h-5" :class="pestStatus.color" />
          <span class="text-sm font-medium text-gray-600">Índice de Plagas</span>
        </div>
        <div class="text-3xl font-extrabold" :class="pestStatus.color">
          {{ simPestIndex }}<span class="text-lg text-gray-400">%</span>
        </div>
        <div class="mt-2 flex items-center justify-between">
          <div class="flex-1 bg-gray-100 rounded-full h-1.5 mr-2">
            <div class="h-1.5 rounded-full transition-all duration-700"
              :class="simPestIndex > 30 ? 'bg-red-500' : simPestIndex > 15 ? 'bg-orange-400' : 'bg-agron-green'"
              :style="`width: ${simPestIndex}%`"></div>
          </div>
          <span class="text-xs font-semibold" :class="pestStatus.color">{{ pestStatus.label }}</span>
        </div>
      </div>

      <!-- Temperatura -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div class="flex items-center gap-2 mb-3">
          <Thermometer class="w-5 h-5 text-orange-500" />
          <span class="text-sm font-medium text-gray-600">Temperatura</span>
        </div>
        <div class="text-3xl font-extrabold text-gray-900">
          {{ simTemperature }}<span class="text-lg text-gray-400">°C</span>
        </div>
        <div class="mt-2 text-xs text-gray-400">Promedio del campo</div>
      </div>

      <!-- NDVI -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div class="flex items-center gap-2 mb-3">
          <TrendingUp class="w-5 h-5 text-agron-green" />
          <span class="text-sm font-medium text-gray-600">NDVI</span>
        </div>
        <div class="text-3xl font-extrabold text-agron-green-dark">
          {{ simNDVI }}
        </div>
        <div class="mt-2 text-xs text-gray-400">Índice Vegetación Diferencial</div>
      </div>
    </div>

    <!-- Aviso: datos de simulación -->
    <div class="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
      <Info class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
      <div>
        <span class="font-semibold text-blue-800">Fuente de datos:</span>
        <span class="text-blue-700"> Los valores mostrados provienen directamente de la simulación de cultivos 3D. Ejecuta "Analizar Campo" en la sección de Simulación para actualizar los parámetros.</span>
      </div>
    </div>

    <!-- Gauges NDVI + Plagas -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <template #header>
          <h3 class="font-semibold text-gray-900">Gauge NDVI — Vigor Foliar</h3>
        </template>
        <div class="h-64 w-full">
          <v-chart class="chart" :option="ndviGaugeOptions" autoresize />
        </div>
      </Card>
      <Card>
        <template #header>
          <h3 class="font-semibold text-gray-900">Gauge — Índice de Plagas</h3>
        </template>
        <div class="h-64 w-full">
          <v-chart class="chart" :option="pestGaugeOptions" autoresize />
        </div>
      </Card>
    </div>

    <!-- Gráficas históricas -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card class="lg:col-span-2">
        <template #header>
          <h3 class="font-semibold text-gray-900">Historial de Clima y Humedad del Suelo</h3>
        </template>
        <div class="h-80 w-full">
          <v-chart class="chart" :option="climateChartOptions" autoresize />
        </div>
      </Card>

      <Card>
        <template #header>
          <h3 class="font-semibold text-gray-900">Índice de Sustentabilidad</h3>
        </template>
        <div class="h-80 w-full">
          <v-chart class="chart" :option="sustainabilityChartOptions" autoresize />
        </div>
      </Card>

      <Card>
        <template #header>
          <h3 class="font-semibold text-gray-900">Salud de Cultivos por Sector</h3>
        </template>
        <div class="h-80 w-full">
          <v-chart class="chart" :option="comparisonChartOptions" autoresize />
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.chart {
  height: 100%;
  width: 100%;
}
</style>
