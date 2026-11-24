<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, GaugeChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { computed, ref, onMounted, onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  Satellite,
  Droplets,
  Bug,
  Wind,
  ArrowRight,
  TrendingUp,
  MapPinned,
  ScanSearch,
  Database,
  MonitorPlay
} from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { useMainStore } from '../stores'
import { listFieldMetrics, listFields, type FieldMetricRecord, type FieldRecord } from '../services/agronomyData'

use([CanvasRenderer, LineChart, BarChart, GaugeChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const store = useMainStore()
const agroniaMark = `${import.meta.env.BASE_URL}agronia-mark.png`
const userName = computed(() => {
  const name = store.user?.profile?.full_name ?? store.user?.user_metadata?.full_name
  const firstName = typeof name === 'string' ? name.trim().split(/\s+/)[0] : ''
  return firstName || 'productor'
})

const fields = shallowRef<FieldRecord[]>([])
const selectedFieldId = ref('')
const metrics = shallowRef<FieldMetricRecord[]>([])
const dataError = ref('')
const latestMetric = computed(() => metrics.value[0])
const hasSimulationMetrics = computed(() => metrics.value.some(metric =>
  metric.raw_data !== null
  && typeof metric.raw_data === 'object'
  && !Array.isArray(metric.raw_data)
  && metric.raw_data.source === 'simulation',
))
const rawMetricValue = (key: string, metric?: FieldMetricRecord) => {
  const rawData = metric?.raw_data
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return null
  const value = rawData[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsedValue = Number(value)
    if (Number.isFinite(parsedValue)) return parsedValue
  }
  return null
}
const latestMetricWith = (value: (metric: FieldMetricRecord) => number | null) =>
  metrics.value.find(metric => value(metric) !== null)
const humidity = computed(() => latestMetricWith(metric => metric.soil_humidity)?.soil_humidity ?? null)
const pestIndex = computed(() => {
  const metric = latestMetricWith(row => rawMetricValue('pest_index', row))
  return metric ? rawMetricValue('pest_index', metric) : null
})
const temperature = computed(() => latestMetricWith(metric => metric.temperature)?.temperature ?? null)
const speedMetric = computed(() => latestMetricWith(row =>
  rawMetricValue('ground_speed_mps', row) ?? rawMetricValue('wind_speed_kmh', row),
))
const windSpeed = computed(() => {
  const metric = speedMetric.value
  if (!metric) return null
  const metersPerSecond = rawMetricValue('ground_speed_mps', metric)
  if (metersPerSecond !== null) return metersPerSecond * 3.6
  return rawMetricValue('wind_speed_kmh', metric)
})
const speedLabel = computed(() => speedMetric.value && rawMetricValue('ground_speed_mps', speedMetric.value) !== null
  ? 'Velocidad del dron'
  : 'Velocidad del viento')

const loadMetrics = async () => {
  if (!selectedFieldId.value) {
    metrics.value = []
    return
  }
  metrics.value = await listFieldMetrics(selectedFieldId.value)
  dataError.value = ''
}

const loadFields = async () => {
  fields.value = await listFields()
  if (!fields.value.some(field => field.id === selectedFieldId.value)) {
    selectedFieldId.value = fields.value[0]?.id ?? ''
  }
  dataError.value = ''
}

watch(selectedFieldId, () => {
  void loadMetrics().catch(error => {
    dataError.value = error instanceof Error ? error.message : 'No se pudieron cargar las mediciones.'
  })
})

let telemetryInterval: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  try {
    await loadFields()
  } catch (error) {
    dataError.value = error instanceof Error ? error.message : 'No se pudieron cargar los datos del campo.'
  }
  telemetryInterval = setInterval(() => {
    void loadMetrics().catch(error => {
      dataError.value = error instanceof Error ? error.message : 'No se pudieron actualizar las mediciones.'
    })
  }, 10_000)
})
onBeforeUnmount(() => {
  if (telemetryInterval) clearInterval(telemetryInterval)
})

const chartRecords = computed(() => [...metrics.value].slice(0, 7).reverse())
const humidityChartOptions = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: '3%', right: '4%', bottom: '10%', top: '10%', containLabel: true },
  xAxis: { type: 'category', data: chartRecords.value.map(row => new Date(row.record_date).toLocaleDateString('es-MX', { weekday: 'short' })), axisLine: { lineStyle: { color: '#d1fae5' } }, axisLabel: { color: '#6ee7b7' } },
  yAxis: { type: 'value', axisLabel: { color: '#6ee7b7', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#064e3b30' } } },
  series: [{
    name: 'Humedad Suelo',
    type: 'line',
    smooth: true,
    data: chartRecords.value.map(row => row.soil_humidity),
    itemStyle: { color: '#10B981' },
    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#10B98155' }, { offset: 1, color: '#10B98105' }] } },
    lineStyle: { width: 2, color: '#10B981' }
  }]
}))

const pestChartOptions = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '4%', bottom: '10%', top: '10%', containLabel: true },
  xAxis: { type: 'category', data: chartRecords.value.map(row => new Date(row.record_date).toLocaleDateString('es-MX', { month: 'numeric', day: 'numeric' })), axisLabel: { color: '#fcd34d' } },
  yAxis: { type: 'value', axisLabel: { color: '#fcd34d', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#78350f30' } } },
  series: [{
    name: 'Índice de Plagas',
    type: 'bar',
    data: chartRecords.value.map(row => {
      return rawMetricValue('pest_index', row)
    }),
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
}))

const capabilities = [
  {
    title: 'Mapas y parcelas',
    description: 'Dibuja límites, marca puntos de interés y guarda tus campos.',
    to: '/mapas',
    icon: MapPinned,
    accent: 'green',
    label: 'Organiza tus campos'
  },
  {
    title: 'Análisis de cultivos',
    description: 'Analiza imágenes para revisar señales visibles y sugerencias de verificación.',
    to: '/analisis',
    icon: ScanSearch,
    accent: 'violet',
    label: 'Evalúa información'
  },
  {
    title: 'Datos y registros',
    description: 'Reúne mediciones de campo y revisa cómo cambian con el tiempo.',
    to: '/datos',
    icon: Database,
    accent: 'blue',
    label: 'Da seguimiento'
  },
  {
    title: 'Simulación',
    description: 'Explora escenarios con los datos disponibles para apoyar tu planeación.',
    to: '/simulacion',
    icon: MonitorPlay,
    accent: 'gold',
    label: 'Planea con contexto'
  },
]

const workflow = [
  { number: '01', title: 'Organiza', description: 'Registra tus parcelas y delimita cada campo.' },
  { number: '02', title: 'Consulta', description: 'Agrega mediciones y revisa análisis e indicadores.' },
  { number: '03', title: 'Decide', description: 'Usa la información para planear tus siguientes acciones.' },
]

const stats = computed(() => [
  { label: 'Campos registrados', value: String(fields.value.length), icon: '🌾' },
  { label: 'Mediciones recientes', value: String(metrics.value.length), icon: '🛰️' },
  { label: 'Última humedad registrada', value: humidity.value === null ? '—' : `${humidity.value}%`, icon: '💧' },
  { label: 'Último registro', value: latestMetric.value ? new Date(latestMetric.value.record_date).toLocaleString('es-MX') : '—', icon: '📊' },
])
</script>

<template>
  <div class="home-page space-y-7">
    <header class="home-heading">
      <div>
        <span class="home-eyebrow">CENTRO DE OPERACIONES</span>
        <h1>Hola, {{ userName }}<span class="home-heading-period">.</span></h1>
        <p>Una vista clara de lo que sucede en tu campo.</p>
      </div>
      <span class="home-heading-tag">
        <img :src="agroniaMark" alt="" />
        <span></span> SINALOA
      </span>
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

    <section class="home-about">
      <div class="home-about-mark"><MapPinned :size="22" /></div>
      <div class="home-about-copy">
        <span class="home-eyebrow">¿QUÉ ES AGRONIA?</span>
        <h2 class="home-section-title">Una forma más clara de conocer tu campo.</h2>
        <p>
          AgronIA reúne mapas, registros y herramientas de análisis para ayudarte a organizar
          la información agrícola, detectar cambios y planear con mayor contexto.
        </p>
      </div>
      <div class="home-about-note">
        <span>Tu información, en un solo lugar</span>
        <small>Mapas · mediciones · análisis</small>
      </div>
    </section>

    <section>
      <div class="home-section-heading">
        <div>
          <span class="home-eyebrow">EXPLORA AGRONIA</span>
          <h2 class="home-section-title">¿En qué te puede ayudar?</h2>
        </div>
        <span class="home-section-caption">Elige una herramienta para comenzar</span>
      </div>
      <div class="home-capabilities">
        <RouterLink
          v-for="capability in capabilities"
          :key="capability.title"
          :to="capability.to"
          class="home-capability-card"
        >
          <div class="home-capability-top">
            <span class="home-capability-icon" :class="`home-capability-icon-${capability.accent}`">
              <component :is="capability.icon" :size="19" />
            </span>
            <ArrowRight :size="17" class="home-capability-arrow" />
          </div>
          <span class="home-capability-label">{{ capability.label }}</span>
          <h3>{{ capability.title }}</h3>
          <p>{{ capability.description }}</p>
        </RouterLink>
      </div>
    </section>

    <section class="home-workflow">
      <div class="home-section-heading">
        <div>
          <span class="home-eyebrow">EMPIEZA EN TRES PASOS</span>
          <h2 class="home-section-title">De la información a la acción.</h2>
        </div>
      </div>
      <div class="home-workflow-grid">
        <article v-for="step in workflow" :key="step.number" class="home-workflow-step">
          <span>{{ step.number }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <!-- Telemetría en tiempo real (Movido abajo) -->
    <div>
      <div class="home-section-heading">
        <div>
          <span class="home-eyebrow">ESTADO DEL CULTIVO</span>
          <h2 class="home-section-title">Resumen de condiciones</h2>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-3">
          <label class="sr-only" for="home-field-select">Campo para consultar</label>
          <select id="home-field-select" v-model="selectedFieldId" class="rounded-lg border border-white/10 bg-[#182019] px-3 py-2 text-sm text-white" :disabled="fields.length === 0">
            <option value="" disabled>Selecciona un campo</option>
            <option v-for="field in fields" :key="field.id" :value="field.id">{{ field.name }}</option>
          </select>
          <span class="home-live-label"><span></span> Datos guardados · consulta cada 10 s</span>
        </div>
      </div>
      <p v-if="dataError" role="alert" class="mb-3 text-sm text-red-400">{{ dataError }}</p>
      <p v-else-if="hasSimulationMetrics" class="mb-3 text-sm text-amber-300">
        El historial incluye registros generados por el simulador; no son mediciones de sensores.
      </p>
      <p v-else-if="!fields.length" class="mb-3 text-sm text-gray-400">
        Aún no tienes campos registrados. <RouterLink to="/mapas" class="text-agron-green underline">Dibuja o guarda uno en el mapa.</RouterLink>
      </p>
      <p v-else-if="!metrics.length" class="mb-3 text-sm text-gray-400">
        Este campo todavía no tiene mediciones guardadas; aquí aparecerán cuando conectes sensores o registres datos.
      </p>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="home-metric-card rounded-xl p-5 shadow-sm border flex flex-col gap-2">
          <div class="flex items-center gap-2 text-blue-500">
            <Droplets class="w-5 h-5" />
            <span class="home-metric-label">Humedad del suelo</span>
          </div>
          <div class="home-metric-value">{{ humidity === null ? '—' : humidity.toFixed(0) }}<span v-if="humidity !== null">%</span></div>
          <div class="home-meter">
            <div class="h-1.5 rounded-full bg-blue-400 transition-all duration-700" :style="{ width: `${humidity ?? 0}%` }"></div>
          </div>
        </div>
        <div class="home-metric-card rounded-xl p-5 shadow-sm border flex flex-col gap-2">
          <div class="flex items-center gap-2 text-orange-500">
            <Bug class="w-5 h-5" />
            <span class="home-metric-label">Índice de plagas</span>
          </div>
          <div class="home-metric-value" :class="pestIndex === null ? '' : pestIndex > 30 ? 'text-red-400' : pestIndex > 15 ? 'text-orange-400' : 'text-agron-green'">
            {{ pestIndex === null ? '—' : pestIndex.toFixed(0) }}<span v-if="pestIndex !== null">%</span>
          </div>
          <div class="home-meter">
            <div class="h-1.5 rounded-full transition-all duration-700" :class="pestIndex === null ? 'bg-gray-500' : pestIndex > 30 ? 'bg-red-500' : pestIndex > 15 ? 'bg-orange-400' : 'bg-agron-green'" :style="{ width: `${pestIndex ?? 0}%` }"></div>
          </div>
        </div>
        <div class="home-metric-card rounded-xl p-5 shadow-sm border flex flex-col gap-2">
          <div class="flex items-center gap-2 text-agron-alert">
            <TrendingUp class="w-5 h-5" />
            <span class="home-metric-label">Temperatura</span>
          </div>
          <div class="home-metric-value">{{ temperature === null ? '—' : temperature.toFixed(1) }}<span v-if="temperature !== null">°C</span></div>
          <div class="home-meter">
            <div class="h-1.5 rounded-full bg-orange-400 transition-all duration-700" :style="{ width: `${temperature === null ? 0 : Math.max(0, Math.min(100, ((temperature - 18) / 22) * 100))}%` }"></div>
          </div>
        </div>
        <div class="home-metric-card rounded-xl p-5 shadow-sm border flex flex-col gap-2">
          <div class="flex items-center gap-2 text-cyan-500">
            <Wind class="w-5 h-5" />
            <span class="home-metric-label">{{ speedLabel }}</span>
          </div>
          <div class="home-metric-value">{{ windSpeed === null ? '—' : windSpeed.toFixed(0) }}<span v-if="windSpeed !== null"> km/h</span></div>
          <div class="home-meter">
            <div class="h-1.5 rounded-full bg-cyan-400 transition-all duration-700" :style="{ width: `${windSpeed === null ? 0 : Math.max(0, Math.min(100, (windSpeed / 50) * 100))}%` }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Gráficos analíticos -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="home-chart-card rounded-xl p-5 shadow-sm">
        <h3 class="home-chart-title">Humedad del suelo <span>· Últimos registros</span></h3>
        <div class="h-52">
          <v-chart :option="humidityChartOptions" autoresize class="h-full w-full" />
        </div>
      </div>
      <div class="home-chart-card home-chart-warm rounded-xl p-5 shadow-sm">
        <h3 class="home-chart-title">Índice de plagas <span>· Historial registrado</span></h3>
        <div class="h-52">
          <v-chart :option="pestChartOptions" autoresize class="h-full w-full" />
        </div>
      </div>
    </div>

    <!-- Estadísticas de impacto -->
    <div class="home-impact rounded-2xl p-8 text-white">
      <span class="home-eyebrow">RESULTADOS</span>
      <h2 class="text-xl font-bold mb-6 text-center">Datos de tu operación</h2>
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

.home-heading-tag img {
  width: 24px;
  height: 24px;
  object-fit: contain;
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

.home-about {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.15rem;
  padding: clamp(1.1rem, 2.5vw, 1.65rem);
  border: 1px solid rgba(196, 218, 147, 0.14);
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 0% 50%, rgba(52, 127, 77, 0.16), transparent 48%),
    linear-gradient(145deg, rgba(28, 36, 25, 0.96), rgba(17, 24, 19, 0.96));
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.16);
}

.home-about-mark,
.home-capability-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 12px;
}

.home-about-mark {
  width: 48px;
  height: 48px;
  color: #9ccea0;
  background: rgba(55, 151, 93, 0.14);
}

.home-about-copy .home-section-title { margin-bottom: 0.35rem; }
.home-about-copy p {
  max-width: 65ch;
  color: #a5ad9b;
  font-size: 0.82rem;
  line-height: 1.6;
}

.home-about-note {
  display: grid;
  gap: 0.25rem;
  padding-left: 1.2rem;
  border-left: 1px solid rgba(196, 218, 147, 0.15);
  color: #dce5ce;
  font-size: 0.75rem;
  font-weight: 650;
  white-space: nowrap;
}

.home-about-note small {
  color: #89947f;
  font-size: 0.65rem;
  font-weight: 450;
}

.home-capabilities {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
}

.home-capability-card {
  display: flex;
  min-width: 0;
  min-height: 192px;
  flex-direction: column;
  padding: 1.1rem;
  border: 1px solid rgba(196, 218, 147, 0.13);
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(28, 36, 25, 0.96), rgba(18, 24, 19, 0.96));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
  text-decoration: none;
  transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
}

.home-capability-card:hover {
  transform: translateY(-3px);
  border-color: rgba(211, 189, 103, 0.3);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.2);
}

.home-capability-card:focus-visible {
  outline: 2px solid rgba(228, 193, 82, 0.75);
  outline-offset: 3px;
}

.home-capability-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.05rem;
}

.home-capability-icon {
  width: 38px;
  height: 38px;
}

.home-capability-icon-green { color: #9ccea0; background: rgba(55, 151, 93, 0.14); }
.home-capability-icon-violet { color: #c3a2eb; background: rgba(139, 92, 246, 0.13); }
.home-capability-icon-blue { color: #8ab7e9; background: rgba(59, 130, 246, 0.13); }
.home-capability-icon-gold { color: #e5c052; background: rgba(255, 196, 0, 0.1); }
.home-capability-arrow { color: #829078; transition: transform 0.2s ease, color 0.2s ease; }
.home-capability-card:hover .home-capability-arrow { transform: translateX(3px); color: #e1c25f; }

.home-capability-label {
  margin-bottom: 0.3rem;
  color: #c0a95d;
  font-size: 0.56rem;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.home-capability-card h3 {
  color: #edf0e5;
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.home-capability-card p {
  margin-top: 0.4rem;
  color: #a5ad9b;
  font-size: 0.72rem;
  line-height: 1.55;
}

.home-workflow {
  padding: 1.2rem;
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 18px;
  background: rgba(19, 26, 20, 0.72);
}

.home-workflow .home-section-heading { margin-bottom: 0.8rem; }

.home-workflow-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.home-workflow-step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
}

.home-workflow-step > span {
  color: #d9bd68;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.home-workflow-step h3 { color: #e9eddf; font-size: 0.78rem; font-weight: 700; }
.home-workflow-step p { margin-top: 0.25rem; color: #929b88; font-size: 0.68rem; line-height: 1.5; }

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
  .home-about { grid-template-columns: auto minmax(0, 1fr); }
  .home-about-note { grid-column: 2; padding: 0.7rem 0 0; border-top: 1px solid rgba(196, 218, 147, 0.12); border-left: 0; }
  .home-capabilities { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
  .home-about { align-items: flex-start; gap: 0.85rem; }
  .home-about-mark { width: 40px; height: 40px; }
  .home-about-note { font-size: 0.7rem; }
  .home-capability-card { min-height: 184px; padding: 0.9rem; }
  .home-workflow-grid { grid-template-columns: 1fr; }
  .home-workflow { padding: 1rem; }
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
  .home-capability-card, .home-capability-arrow, .home-metric-card, .home-action-primary, .home-action-secondary { transition: none; }
}
</style>
