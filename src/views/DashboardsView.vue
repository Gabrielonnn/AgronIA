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
import { RouterLink } from 'vue-router'
import { ArrowRight, Droplets, Bug, Thermometer, TrendingUp, AlertTriangle, CheckCircle, Info } from 'lucide-vue-next'

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
  animationDuration: 900,
  animationDurationUpdate: 500,
  animationEasing: 'cubicOut' as const,
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(15, 22, 17, 0.96)',
    borderColor: 'rgba(196, 218, 147, 0.2)',
    textStyle: { color: '#e8eddf' }
  },
  legend: { data: ['Humedad Suelo (%)', 'Temperatura (°C)'], bottom: 0, textStyle: { color: '#aab19f' } },
  grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    axisLine: { lineStyle: { color: 'rgba(196, 218, 147, 0.16)' } },
    axisTick: { show: false },
    axisLabel: { color: '#929b88' }
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    axisLabel: { color: '#929b88' },
    splitLine: { lineStyle: { color: 'rgba(196, 218, 147, 0.09)' } }
  },
  series: [
    {
      name: 'Humedad Suelo (%)',
      type: 'line',
      smooth: true,
      data: [58, 54, 49, 65, 70, 67, simHumidity.value],
      symbolSize: 7,
      itemStyle: { color: '#72d59f' },
      lineStyle: { width: 3, color: '#72d59f' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#10B98140' }, { offset: 1, color: '#10B98105' }] } }
    },
    {
      name: 'Temperatura (°C)',
      type: 'line',
      smooth: true,
      data: [24, 26, 28, 22, 21, 23, simTemperature.value],
      symbolSize: 7,
      itemStyle: { color: '#e5a261' },
      lineStyle: { width: 3, color: '#e5a261' }
    }
  ]
}))

// ============================================================
// Gráfico Sustentabilidad (datos de simulación)
// ============================================================
const sustainabilityChartOptions = computed(() => ({
  animationDuration: 900,
  animationDurationUpdate: 500,
  animationEasing: 'cubicOut' as const,
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(15, 22, 17, 0.96)',
    borderColor: 'rgba(196, 218, 147, 0.2)',
    textStyle: { color: '#e8eddf' }
  },
  legend: { top: '5%', left: 'center', textStyle: { color: '#aab19f' } },
  series: [{
    name: 'Índice de Sustentabilidad',
    type: 'pie',
    radius: ['40%', '70%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 10, borderColor: '#182019', borderWidth: 3 },
    label: { show: false, position: 'center', color: '#e8eddf' },
    emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold', color: '#e8eddf' } },
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
  animationDuration: 900,
  animationDurationUpdate: 500,
  animationEasing: 'cubicOut' as const,
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    backgroundColor: 'rgba(15, 22, 17, 0.96)',
    borderColor: 'rgba(196, 218, 147, 0.2)',
    textStyle: { color: '#e8eddf' }
  },
  legend: { data: ['Zonas Saludables', 'Zonas de Riesgo'], bottom: 0, textStyle: { color: '#aab19f' } },
  grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
  xAxis: {
    type: 'category',
    data: ['Sector A', 'Sector B', 'Sector C', 'Sector D', 'Sector E'],
    axisLine: { lineStyle: { color: 'rgba(196, 218, 147, 0.16)' } },
    axisTick: { show: false },
    axisLabel: { color: '#929b88' }
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    axisLabel: { color: '#929b88' },
    splitLine: { lineStyle: { color: 'rgba(196, 218, 147, 0.09)' } }
  },
  series: [
    {
      name: 'Zonas Saludables',
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' },
      data: [120, 132, 101, 134, 90],
      itemStyle: { color: '#72d59f', borderRadius: [5, 5, 0, 0] }
    },
    {
      name: 'Zonas de Riesgo',
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' },
      data: [20, 12, Math.round(simPestIndex.value * 1.2), 10, 30],
      itemStyle: { color: '#e77f69', borderRadius: [5, 5, 0, 0] }
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
      color: '#e8eddf',
      fontSize: 14,
      fontWeight: 'bold',
      offsetCenter: [0, '60%']
    },
    data: [{ value: simNDVI.value }],
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: '#a0aa94', fontSize: 10, formatter: (v: number) => v.toFixed(1) }
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
      color: '#e8eddf',
      fontSize: 14,
      fontWeight: 'bold',
      offsetCenter: [0, '60%']
    },
    data: [{ value: simPestIndex.value }],
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: '#a0aa94', fontSize: 10 }
  }]
}))
</script>

<template>
  <div class="dashboard-page space-y-6">
    <header class="dashboard-heading">
      <div>
        <span class="dashboard-eyebrow">INTELIGENCIA AGRÍCOLA</span>
        <h1>Analítica del cultivo</h1>
        <p>Indicadores y tendencias de tu simulación agrícola.</p>
      </div>
      <div class="dashboard-heading-actions">
        <span class="dashboard-live"><span></span> Vista demostrativa</span>
        <RouterLink to="/simulacion" class="dashboard-simulation-link">
          Abrir simulador <ArrowRight :size="16" />
        </RouterLink>
      </div>
    </header>

    <!-- Tarjetas de parámetros clave -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Humedad del Suelo -->
      <div class="dashboard-metric dashboard-metric-blue">
        <div class="dashboard-metric-heading">
          <span class="dashboard-metric-icon"><Droplets :size="18" /></span>
          <span class="dashboard-metric-label">Humedad del suelo</span>
        </div>
        <div class="dashboard-metric-value">
          {{ simHumidity }}<span>%</span>
        </div>
        <div class="dashboard-metric-foot">
          <div class="dashboard-meter">
            <div class="h-1.5 rounded-full bg-blue-400 transition-all duration-700" :style="`width: ${simHumidity}%`"></div>
          </div>
          <span class="dashboard-status" :class="humidityStatus.color">{{ humidityStatus.label }}</span>
        </div>
      </div>

      <!-- Índice de Plagas -->
      <div class="dashboard-metric dashboard-metric-orange" :class="pestStatus.border">
        <div class="dashboard-metric-heading">
          <span class="dashboard-metric-icon"><Bug :size="18" /></span>
          <span class="dashboard-metric-label">Índice de plagas</span>
        </div>
        <div class="dashboard-metric-value" :class="pestStatus.color">
          {{ simPestIndex }}<span>%</span>
        </div>
        <div class="dashboard-metric-foot">
          <div class="dashboard-meter">
            <div class="h-1.5 rounded-full transition-all duration-700"
              :class="simPestIndex > 30 ? 'bg-red-500' : simPestIndex > 15 ? 'bg-orange-400' : 'bg-agron-green'"
              :style="`width: ${simPestIndex}%`"></div>
          </div>
          <span class="dashboard-status" :class="pestStatus.color">{{ pestStatus.label }}</span>
        </div>
      </div>

      <!-- Temperatura -->
      <div class="dashboard-metric dashboard-metric-amber">
        <div class="dashboard-metric-heading">
          <span class="dashboard-metric-icon"><Thermometer :size="18" /></span>
          <span class="dashboard-metric-label">Temperatura</span>
        </div>
        <div class="dashboard-metric-value">
          {{ simTemperature }}<span>°C</span>
        </div>
        <div class="dashboard-metric-note">Promedio del campo</div>
      </div>

      <!-- NDVI -->
      <div class="dashboard-metric dashboard-metric-green">
        <div class="dashboard-metric-heading">
          <span class="dashboard-metric-icon"><TrendingUp :size="18" /></span>
          <span class="dashboard-metric-label">Índice NDVI</span>
        </div>
        <div class="dashboard-metric-value">
          {{ simNDVI }}<span>/ 1.00</span>
        </div>
        <div class="dashboard-metric-note">Vigor de la vegetación</div>
      </div>
    </div>

    <!-- Aviso: datos de simulación -->
    <div class="dashboard-source">
      <span class="dashboard-source-icon"><Info :size="17" /></span>
      <div>
        <strong>Datos de demostración</strong>
        <p>Los indicadores representan la simulación 3D y fluctúan para mostrar el panel en funcionamiento. Ejecuta “Analizar campo” en Simulación para generar nuevos parámetros.</p>
      </div>
    </div>

    <!-- Gauges NDVI + Plagas -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card class="dashboard-chart-card">
        <template #header>
          <div class="dashboard-chart-heading">
            <div><span>VIGOR VEGETAL</span><h3>Índice NDVI</h3></div>
            <span class="dashboard-chart-value">{{ simNDVI }}</span>
          </div>
        </template>
        <div class="h-64 w-full">
          <v-chart class="chart" :option="ndviGaugeOptions" autoresize />
        </div>
      </Card>
      <Card class="dashboard-chart-card">
        <template #header>
          <div class="dashboard-chart-heading">
            <div><span>MONITOREO FITOSANITARIO</span><h3>Índice de plagas</h3></div>
            <span class="dashboard-chart-value">{{ simPestIndex }}%</span>
          </div>
        </template>
        <div class="h-64 w-full">
          <v-chart class="chart" :option="pestGaugeOptions" autoresize />
        </div>
      </Card>
    </div>

    <!-- Gráficas históricas -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card class="dashboard-chart-card lg:col-span-2">
        <template #header>
          <div class="dashboard-chart-heading">
            <div><span>TENDENCIA SEMANAL</span><h3>Clima y humedad del suelo</h3></div>
            <span class="dashboard-chart-caption">Lunes — Domingo</span>
          </div>
        </template>
        <div class="h-80 w-full">
          <v-chart class="chart" :option="climateChartOptions" autoresize />
        </div>
      </Card>

      <Card class="dashboard-chart-card">
        <template #header>
          <div class="dashboard-chart-heading">
            <div><span>EFICIENCIA DE RECURSOS</span><h3>Índice de sustentabilidad</h3></div>
          </div>
        </template>
        <div class="h-80 w-full">
          <v-chart class="chart" :option="sustainabilityChartOptions" autoresize />
        </div>
      </Card>

      <Card class="dashboard-chart-card">
        <template #header>
          <div class="dashboard-chart-heading">
            <div><span>COMPARATIVA DE PARCELAS</span><h3>Salud por sector</h3></div>
          </div>
        </template>
        <div class="h-80 w-full">
          <v-chart class="chart" :option="comparisonChartOptions" autoresize />
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  min-width: 0;
  color: #e8eddf;
  animation: dashboard-arrive 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.dashboard-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.2rem 0 0.25rem;
}

.dashboard-eyebrow,
.dashboard-chart-heading > div > span {
  color: #c1a95f;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.dashboard-heading h1 {
  margin-top: 0.4rem;
  color: #f0f1e9;
  font-size: clamp(1.7rem, 3vw, 2.35rem);
  font-weight: 760;
  letter-spacing: -0.055em;
}

.dashboard-heading p {
  margin-top: 0.35rem;
  color: #a2aa97;
  font-size: 0.88rem;
}

.dashboard-heading-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.dashboard-live {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #bdc5b1;
  font-size: 0.68rem;
  white-space: nowrap;
}

.dashboard-live > span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d5b75f;
  box-shadow: 0 0 12px rgba(213, 183, 95, 0.5);
  animation: dashboard-pulse 2s ease-in-out infinite;
}

.dashboard-simulation-link {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 0.65rem 0.9rem;
  border: 1px solid rgba(211, 189, 103, 0.25);
  border-radius: 11px;
  color: #e7d99f;
  background: linear-gradient(145deg, rgba(211, 189, 103, 0.13), rgba(211, 189, 103, 0.055));
  font-size: 0.73rem;
  font-weight: 700;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.dashboard-simulation-link:hover {
  transform: translateY(-2px);
  border-color: rgba(211, 189, 103, 0.48);
  background: rgba(211, 189, 103, 0.17);
}

.dashboard-metric {
  position: relative;
  min-width: 0;
  padding: 1.15rem;
  overflow: hidden;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 15px;
  background: linear-gradient(145deg, rgba(29, 36, 25, 0.96), rgba(18, 24, 18, 0.96));
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
  transition: transform 0.23s ease, border-color 0.23s ease, box-shadow 0.23s ease;
  animation: dashboard-arrive 0.5s both;
}

.dashboard-metric:nth-child(2) { animation-delay: 0.05s; }
.dashboard-metric:nth-child(3) { animation-delay: 0.1s; }
.dashboard-metric:nth-child(4) { animation-delay: 0.15s; }

.dashboard-metric:hover {
  transform: translateY(-3px);
  border-color: rgba(211, 189, 103, 0.28);
  box-shadow: 0 18px 35px rgba(0, 0, 0, 0.22);
}

.dashboard-metric-blue { --metric-accent: #75b8ec; }
.dashboard-metric-orange { --metric-accent: #eba76f; }
.dashboard-metric-amber { --metric-accent: #e1c575; }
.dashboard-metric-green { --metric-accent: #8cc99a; }

.dashboard-metric-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.65rem;
}

.dashboard-metric-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--metric-accent) 24%, transparent);
  border-radius: 10px;
  color: var(--metric-accent);
  background: color-mix(in srgb, var(--metric-accent) 10%, transparent);
}

.dashboard-metric-label {
  overflow: hidden;
  color: #aab19f;
  font-size: 0.73rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-metric-value {
  margin: 0.75rem 0 0.55rem;
  color: #f0f1e9;
  font-size: clamp(1.7rem, 3vw, 2.2rem);
  font-weight: 800;
  letter-spacing: -0.06em;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.dashboard-metric-value > span {
  margin-left: 0.17rem;
  color: #929b88;
  font-size: 0.9rem;
  font-weight: 550;
  letter-spacing: -0.01em;
}

.dashboard-metric-foot {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.dashboard-meter {
  height: 5px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(231, 237, 216, 0.08);
}

.dashboard-meter > div { height: 100%; }
.dashboard-status { flex: 0 0 auto; font-size: 0.64rem; font-weight: 700; }
.dashboard-metric-note { color: #89927f; font-size: 0.68rem; }

.dashboard-source {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(117, 184, 236, 0.17);
  border-radius: 13px;
  background: linear-gradient(110deg, rgba(48, 91, 113, 0.15), rgba(30, 42, 37, 0.34));
}

.dashboard-source-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border: 1px solid rgba(117, 184, 236, 0.2);
  border-radius: 9px;
  color: #8cc7ed;
  background: rgba(117, 184, 236, 0.09);
}

.dashboard-source strong { color: #d6e9f3; font-size: 0.75rem; }
.dashboard-source p { margin-top: 0.22rem; color: #a3b2b4; font-size: 0.7rem; line-height: 1.55; }

:deep(.dashboard-chart-card.app-card) {
  min-width: 0;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(26, 34, 25, 0.98), rgba(17, 23, 18, 0.98));
  box-shadow: 0 14px 35px rgba(0, 0, 0, 0.18);
  transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
}

:deep(.dashboard-chart-card.app-card:hover) {
  transform: translateY(-2px);
  border-color: rgba(211, 189, 103, 0.25);
  box-shadow: 0 19px 40px rgba(0, 0, 0, 0.24);
}

:deep(.dashboard-chart-card .app-card-header) {
  padding: 1.1rem 1.3rem;
  border-color: rgba(196, 218, 147, 0.1);
}

:deep(.dashboard-chart-card .app-card-body) { padding: 1rem 1.15rem 1.2rem; }

.dashboard-chart-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.dashboard-chart-heading > div > span { font-size: 0.53rem; }
.dashboard-chart-heading h3 { margin-top: 0.3rem; color: #e8eddf; font-size: 0.88rem; font-weight: 680; }
.dashboard-chart-value { color: #e6d28b; font-size: 1rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.dashboard-chart-caption { color: #8f9986; font-size: 0.68rem; }

.chart {
  display: block;
  height: 100%;
  width: 100%;
}

@keyframes dashboard-arrive {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes dashboard-pulse {
  50% { opacity: 0.48; box-shadow: 0 0 4px rgba(213, 183, 95, 0.2); }
}

@media (max-width: 760px) {
  .dashboard-heading { align-items: flex-start; flex-direction: column; gap: 1rem; }
  .dashboard-heading-actions { width: 100%; justify-content: space-between; }
}

@media (max-width: 480px) {
  .dashboard-heading-actions { align-items: flex-start; flex-direction: column; }
  .dashboard-metric { padding: 0.9rem; }
  .dashboard-metric-heading { gap: 0.48rem; }
  .dashboard-metric-icon { width: 30px; height: 30px; flex-basis: 30px; }
  .dashboard-metric-label { font-size: 0.66rem; }
  .dashboard-source { padding: 0.85rem; }
  :deep(.dashboard-chart-card .app-card-header) { padding: 0.95rem 1rem; }
  :deep(.dashboard-chart-card .app-card-body) { padding: 0.65rem 0.7rem 0.9rem; }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-page, .dashboard-metric, .dashboard-live > span { animation: none; }
  .dashboard-metric, .dashboard-simulation-link, :deep(.dashboard-chart-card.app-card) { transition: none; }
}
</style>
