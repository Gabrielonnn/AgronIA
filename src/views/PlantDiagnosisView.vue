<script setup lang="ts">
import { computed } from 'vue'
import { Bug, Droplets, Flame, Layers, Leaf, ScanSearch, Thermometer } from 'lucide-vue-next'
import MultispectralPlantScanner from '../components/diagnosis/MultispectralPlantScanner.vue'

const endpoint = import.meta.env.VITE_PLANT_DIAGNOSIS_API_URL?.trim() ?? ''
const hasEndpoint = computed(() => endpoint.length > 0)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
          Exploración fitosanitaria y radiometría
        </p>
        <h1 class="mt-2 text-3xl font-semibold text-white">
          Reconocimiento IA y Diagnóstico Multiespectral
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-stone-300">
          Conecta la cámara del dispositivo deseado para detectar el área completa de la planta en
          tiempo real, interpretar los espectros <strong>RGB</strong>, <strong>NDVI</strong> y
          <strong>Térmico</strong>, y simular escenarios de estrés hídrico, sobrehidratación y
          presencia o ausencia de plagas.
        </p>
      </div>
      <div
        class="flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-stone-300 sm:self-auto"
      >
        <span
          class="h-2 w-2 rounded-full"
          :class="hasEndpoint ? 'bg-emerald-400' : 'bg-sky-400'"
        ></span>
        {{
          hasEndpoint
            ? 'Motor Híbrido Activo (Tiempo Real + API Python)'
            : 'Motor IA en Navegador Activo (30 FPS)'
        }}
      </div>
    </header>

    <!-- Shared Multispectral Plant Scanner Component -->
    <MultispectralPlantScanner :compact="false" :show-field-scouting-action="false" />

    <!-- Reference Cards for Spectral Channels & Simulation Presets -->
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <article class="rounded-2xl border border-white/10 bg-[#141d16]/90 p-4">
        <div class="flex items-center gap-2 text-emerald-300">
          <ScanSearch class="h-4 w-4" />
          <h2 class="text-xs font-bold uppercase tracking-wider">Detección de Área Total</h2>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-stone-300">
          Segmenta el dosel completo de la planta mediante índices ópticos (<code class="text-emerald-200">ExG</code> y <code class="text-emerald-200">VARI</code>), envolvente poligonal radial y cuadro delimitador para aislar el tejido vegetal del fondo.
        </p>
      </article>

      <article class="rounded-2xl border border-white/10 bg-[#141d16]/90 p-4">
        <div class="flex items-center gap-2 text-lime-300">
          <Layers class="h-4 w-4" />
          <h2 class="text-xs font-bold uppercase tracking-wider">Espectro NDVI</h2>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-stone-300">
          Cuantifica el vigor fotosintético y la densidad clorofílica de <code>-0.1</code> a <code>+1.0</code>, clasificando el área foliar en vigor alto, moderado, clorosis y tejido necrótico.
        </p>
      </article>

      <article class="rounded-2xl border border-white/10 bg-[#141d16]/90 p-4">
        <div class="flex items-center gap-2 text-orange-300">
          <Thermometer class="h-4 w-4" />
          <h2 class="text-xs font-bold uppercase tracking-wider">Termografía LWIR (°C)</h2>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-stone-300">
          Evalúa la transpiración estomática y el índice <code class="text-orange-200">CWSI</code>. El cierre estomático por sequía eleva la temperatura foliar; la sobrehidratación genera enfriamiento basal.
        </p>
      </article>

      <article class="rounded-2xl border border-white/10 bg-[#141d16]/90 p-4">
        <div class="flex items-center gap-2 text-amber-300">
          <div class="flex items-center gap-1">
            <Leaf class="h-3.5 w-3.5 text-emerald-400" />
            <Flame class="h-3.5 w-3.5 text-orange-400" />
            <Droplets class="h-3.5 w-3.5 text-cyan-400" />
            <Bug class="h-3.5 w-3.5 text-red-400" />
          </div>
          <h2 class="text-xs font-bold uppercase tracking-wider">Presets Fisiológicos</h2>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-stone-300">
          Alterna entre <strong>Sin Plagas</strong>, <strong>Estrés Hídrico</strong>, <strong>Sobrehidratación</strong> y <strong>Con Plagas</strong> con intensidad regulable para entrenar decisiones agronómicas.
        </p>
      </article>
    </section>
  </div>
</template>
