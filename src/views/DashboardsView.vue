<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import Card from '../components/ui/Card.vue'

// Registrar componentes de ECharts
use([
  CanvasRenderer,
  LineChart,
  PieChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

// Opciones Gráfica de Clima/Humedad
const climateChartOptions = {
  tooltip: { trigger: 'axis' },
  legend: { data: ['Humedad Suelo (%)', 'Temperatura (°C)'], bottom: 0 },
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
      data: [45, 42, 38, 55, 60, 58, 52],
      itemStyle: { color: '#10B981' } // agron-green
    },
    {
      name: 'Temperatura (°C)',
      type: 'line',
      smooth: true,
      data: [24, 26, 28, 22, 21, 23, 25],
      itemStyle: { color: '#F97316' } // agron-alert
    }
  ]
}

// Opciones Gráfica de Sustentabilidad (Dona)
const sustainabilityChartOptions = {
  tooltip: { trigger: 'item' },
  legend: { top: '5%', left: 'center' },
  series: [
    {
      name: 'Índice de Sustentabilidad',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: { show: false, position: 'center' },
      emphasis: {
        label: { show: true, fontSize: 16, fontWeight: 'bold' }
      },
      labelLine: { show: false },
      data: [
        { value: 65, name: 'Agua Ahorrada', itemStyle: { color: '#10B981' } },
        { value: 20, name: 'Reducción Químicos', itemStyle: { color: '#047857' } },
        { value: 15, name: 'Uso Tradicional', itemStyle: { color: '#D1FAE5' } }
      ]
    }
  ]
}

// Opciones Gráfica Comparativa (Barras)
const comparisonChartOptions = {
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { data: ['Zonas Saludables', 'Zonas de Riesgo'], bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
  xAxis: {
    type: 'category',
    data: ['Sector A', 'Sector B', 'Sector C', 'Sector D', 'Sector E']
  },
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
      data: [20, 12, 45, 10, 30],
      itemStyle: { color: '#EF4444' } // agron-danger
    }
  ]
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Dashboards y Analítica</h1>
      <p class="text-gray-500 mt-1">Visualización del historial climático y métricas de sustentabilidad.</p>
    </div>

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
