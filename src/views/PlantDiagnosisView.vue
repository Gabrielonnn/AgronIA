<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Activity, Bug, Droplets, Flame, Layers, Leaf, ScanSearch, Thermometer } from 'lucide-vue-next'
import MultispectralPlantScanner from '../components/diagnosis/MultispectralPlantScanner.vue'
import { checkAgroVisionHealth, resolveDiagnosisBaseUrl } from '../services/plantDiagnosis'

const baseUrl = resolveDiagnosisBaseUrl(import.meta.env.VITE_PLANT_DIAGNOSIS_API_URL)
const backendOnline = ref(false)
const onnxReady = ref(false)

onMounted(async () => {
  const health = await checkAgroVisionHealth(baseUrl)
  if (health) {
    backendOnline.value = true
    onnxReady.value = Boolean(health.onnx_ready)
  }
})
</script>

<template>
  <div class="diagnosis-page">
    <header class="diagnosis-hero">
      <div class="diagnosis-hero-copy">
        <div class="diagnosis-hero-meta">
          <p class="diagnosis-eyebrow"><span></span> AGRONOMÍA DE PRECISIÓN · 01</p>
          <span class="diagnosis-engine-status">
            <i class="is-hybrid"></i>
            {{
              onnxReady
                ? 'AgroVision ONNX + Servidor IA Activo'
                : 'AgroVision ONNX + PlantLens (Web AI)'
            }}
          </span>
        </div>

        <h1>Diagnóstico <span>multiespectral</span></h1>
        <p class="diagnosis-intro">
          Examina el follaje, mide el vigor y localiza señales de estrés a partir de una imagen,
          una cámara o la planta de demostración.
        </p>

        <div class="diagnosis-spectrum-chips" aria-label="Canales disponibles">
          <span><i class="spectrum-dot is-rgb"></i><strong>RGB</strong> Imagen visible</span>
          <span><i class="spectrum-dot is-ndvi"></i><strong>NDVI</strong> Vigor vegetal</span>
          <span><i class="spectrum-dot is-thermal"></i><strong>LWIR</strong> Temperatura</span>
        </div>
      </div>

      <div class="diagnosis-hero-visual" aria-hidden="true">
        <div class="diagnosis-orbit diagnosis-orbit-outer"></div>
        <div class="diagnosis-orbit diagnosis-orbit-inner"></div>
        <div class="diagnosis-visual-core">
          <Leaf :size="35" :stroke-width="1.4" />
          <span class="diagnosis-scan-beam"></span>
        </div>
        <span class="diagnosis-visual-tag tag-top"><Activity :size="13" /> LECTURA EN VIVO</span>
        <span class="diagnosis-visual-tag tag-bottom"><span></span> RGB · NDVI · TÉRMICO</span>
        <i class="diagnosis-visual-spark spark-one"></i>
        <i class="diagnosis-visual-spark spark-two"></i>
        <i class="diagnosis-visual-spark spark-three"></i>
      </div>
    </header>

    <section class="diagnosis-workspace" aria-labelledby="diagnosis-station-title">
      <div class="diagnosis-section-heading">
        <div>
          <span class="diagnosis-section-kicker">ESTACIÓN DE ANÁLISIS</span>
          <h2 id="diagnosis-station-title">Explora una muestra</h2>
        </div>
        <p>Selecciona el origen de imagen y ajusta la lectura a las condiciones de tu cultivo.</p>
      </div>
      <div class="diagnosis-scanner">
        <MultispectralPlantScanner :compact="false" :show-field-scouting-action="false" />
      </div>
    </section>

    <section class="diagnosis-guide" aria-labelledby="diagnosis-guide-title">
      <div class="diagnosis-section-heading guide-heading">
        <div>
          <span class="diagnosis-section-kicker">GUÍA DE LECTURA</span>
          <h2 id="diagnosis-guide-title">Qué observa el análisis</h2>
        </div>
        <p>Las señales orientan la inspección; confirma cualquier hallazgo directamente en campo.</p>
      </div>

      <div class="diagnosis-guide-grid">
        <article class="diagnosis-guide-card guide-area">
          <span class="guide-index">01 / VISIÓN</span>
          <span class="guide-icon"><ScanSearch :size="19" /></span>
          <h3>Área foliar</h3>
          <p>Separa el follaje del fondo y destaca contornos y zonas que conviene revisar.</p>
          <span class="guide-tech">ExG · VARI · segmentación</span>
        </article>

        <article class="diagnosis-guide-card guide-vigor">
          <span class="guide-index">02 / VIGOR</span>
          <span class="guide-icon"><Layers :size="19" /></span>
          <h3>Respuesta espectral</h3>
          <p>Representa diferencias de vigor vegetal para comparar tejido sano y señales de estrés.</p>
          <span class="guide-tech">NDVI · índice relativo</span>
        </article>

        <article class="diagnosis-guide-card guide-temperature">
          <span class="guide-index">03 / TEMPERATURA</span>
          <span class="guide-icon"><Thermometer :size="19" /></span>
          <h3>Patrón térmico</h3>
          <p>Visualiza variaciones térmicas que pueden acompañar cambios en la transpiración.</p>
          <span class="guide-tech">LWIR · grados Celsius</span>
        </article>

        <article class="diagnosis-guide-card guide-scenarios">
          <span class="guide-index">04 / ESCENARIOS</span>
          <span class="guide-icon">
            <span class="scenario-icon-stack">
              <Flame :size="12" class="scenario-flame" />
              <Droplets :size="12" class="scenario-water" />
              <Bug :size="12" class="scenario-bug" />
            </span>
          </span>
          <h3>Escenarios de estrés</h3>
          <p>Compara respuestas simuladas ante sequía, exceso de agua o presencia de plagas.</p>
          <span class="guide-tech">Simulación orientativa</span>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.diagnosis-page {
  --diagnosis-gold: #e7c96c;
  --diagnosis-muted: #a9b29d;
  display: grid;
  width: min(100%, 1480px);
  gap: clamp(1.25rem, 2.5vw, 2rem);
  margin-inline: auto;
  padding-bottom: 1.5rem;
  animation: diagnosis-page-enter 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.diagnosis-hero {
  position: relative;
  display: grid;
  min-height: 250px;
  grid-template-columns: minmax(0, 1fr) minmax(210px, 0.38fr);
  align-items: center;
  overflow: hidden;
  padding: clamp(1.5rem, 3.5vw, 2.7rem);
  border: 1px solid rgba(202, 217, 168, 0.15);
  border-radius: 24px;
  background:
    radial-gradient(ellipse at 86% 45%, rgba(181, 154, 69, 0.14), transparent 35%),
    radial-gradient(ellipse at 7% 0, rgba(103, 151, 92, 0.17), transparent 48%),
    linear-gradient(125deg, rgba(24, 36, 27, 0.98), rgba(15, 23, 19, 0.97));
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2), inset 0 1px rgba(255, 255, 255, 0.035);
  isolation: isolate;
}

.diagnosis-hero::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background-image: linear-gradient(rgba(196, 218, 147, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(196, 218, 147, 0.035) 1px, transparent 1px);
  background-size: 34px 34px;
  content: "";
  mask-image: linear-gradient(90deg, #000, transparent 76%);
}

.diagnosis-hero-copy { position: relative; z-index: 1; max-width: 760px; }
.diagnosis-hero-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.diagnosis-eyebrow,
.diagnosis-section-kicker {
  margin: 0;
  color: #d3b85e;
  font-size: 0.65rem;
  font-weight: 850;
  letter-spacing: 0.17em;
}

.diagnosis-eyebrow { display: inline-flex; align-items: center; gap: 0.55rem; }
.diagnosis-eyebrow > span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #b6d681;
  box-shadow: 0 0 12px rgba(182, 214, 129, 0.6);
}

.diagnosis-engine-status {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid rgba(196, 218, 147, 0.15);
  border-radius: 999px;
  color: #b8c2ad;
  background: rgba(3, 9, 6, 0.32);
  font-size: 0.67rem;
  font-weight: 650;
}
.diagnosis-engine-status i,
.diagnosis-visual-tag.tag-bottom > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #77b8d3;
  box-shadow: 0 0 9px rgba(119, 184, 211, 0.55);
}
.diagnosis-engine-status i.is-hybrid {
  background: #88cc7e;
  box-shadow: 0 0 9px rgba(136, 204, 126, 0.55);
}

.diagnosis-hero h1 {
  margin: 1.1rem 0 0.7rem;
  color: #f1f0e6;
  font-size: clamp(2rem, 4vw, 3.1rem);
  font-weight: 750;
  letter-spacing: -0.06em;
  line-height: 1.04;
}
.diagnosis-hero h1 span {
  color: #e5c968;
  background: linear-gradient(100deg, #f1d980, #b9d180 72%);
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.diagnosis-intro {
  max-width: 650px;
  margin: 0;
  color: #aab4a2;
  font-size: clamp(0.83rem, 1.2vw, 0.97rem);
  line-height: 1.7;
}

.diagnosis-spectrum-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.25rem;
}
.diagnosis-spectrum-chips > span {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.43rem 0.65rem;
  border: 1px solid rgba(196, 218, 147, 0.14);
  border-radius: 8px;
  color: #9da997;
  background: rgba(4, 9, 6, 0.32);
  font-size: 0.66rem;
}
.diagnosis-spectrum-chips strong { color: #e8e9dc; font-size: 0.66rem; }
.spectrum-dot { width: 7px; height: 7px; border-radius: 50%; }
.spectrum-dot.is-rgb { background: #65cf98; box-shadow: 0 0 9px rgba(101, 207, 152, 0.55); }
.spectrum-dot.is-ndvi { background: #d7cd53; box-shadow: 0 0 9px rgba(215, 205, 83, 0.4); }
.spectrum-dot.is-thermal { background: #f19b58; box-shadow: 0 0 9px rgba(241, 155, 88, 0.45); }

.diagnosis-hero-visual {
  position: relative;
  display: grid;
  width: min(100%, 250px);
  aspect-ratio: 1;
  justify-self: center;
  place-items: center;
  animation: diagnosis-visual-arrive 0.8s 0.1s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.diagnosis-orbit {
  position: absolute;
  border: 1px solid rgba(207, 194, 128, 0.18);
  border-radius: 50%;
}
.diagnosis-orbit-outer {
  inset: 7%;
  border-style: dashed;
  animation: diagnosis-orbit 36s linear infinite;
}
.diagnosis-orbit-inner {
  inset: 19%;
  border-color: rgba(173, 205, 133, 0.23);
  box-shadow: 0 0 38px rgba(169, 197, 126, 0.08), inset 0 0 28px rgba(169, 197, 126, 0.05);
  animation: diagnosis-orbit 24s linear infinite reverse;
}
.diagnosis-visual-core {
  position: relative;
  display: grid;
  width: 35%;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(210, 206, 145, 0.38);
  border-radius: 27% 73% 55% 45% / 42% 42% 58% 58%;
  color: #d5da9a;
  background: radial-gradient(circle at 36% 30%, #3b5741, #1d3127 74%);
  box-shadow: 0 0 45px rgba(137, 178, 113, 0.19), inset 0 0 24px rgba(226, 205, 113, 0.1);
  transform: rotate(-12deg);
  animation: diagnosis-core-float 5s ease-in-out infinite;
}
.diagnosis-visual-core > svg { transform: rotate(12deg); filter: drop-shadow(0 0 10px rgba(192, 220, 127, 0.25)); }
.diagnosis-scan-beam {
  position: absolute;
  right: -15%;
  left: -15%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #e6d57e, #a4d788, transparent);
  box-shadow: 0 0 12px rgba(198, 211, 125, 0.7);
  animation: diagnosis-scan 3.2s ease-in-out infinite;
}
.diagnosis-visual-tag {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.42rem 0.55rem;
  border: 1px solid rgba(196, 218, 147, 0.16);
  border-radius: 8px;
  color: #cad2bd;
  background: rgba(14, 23, 18, 0.88);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
  font-size: 0.52rem;
  font-weight: 750;
  letter-spacing: 0.07em;
  white-space: nowrap;
}
.tag-top { top: 16%; right: 0; color: #c5d998; }
.tag-bottom { bottom: 17%; left: -1%; }
.tag-bottom > span { background: #e5c968; box-shadow: 0 0 9px rgba(229, 201, 104, 0.55); }
.diagnosis-visual-spark {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #e7d47b;
  box-shadow: 0 0 12px rgba(231, 212, 123, 0.8);
  animation: diagnosis-sparkle 2.2s ease-in-out infinite alternate;
}
.spark-one { top: 27%; left: 19%; }
.spark-two { right: 16%; bottom: 31%; animation-delay: -0.8s; }
.spark-three { top: 46%; right: 12%; width: 3px; height: 3px; animation-delay: -1.4s; }

.diagnosis-workspace,
.diagnosis-guide {
  min-width: 0;
  padding: clamp(1rem, 2vw, 1.5rem);
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 20px;
  background: linear-gradient(145deg, rgba(25, 33, 25, 0.78), rgba(17, 24, 19, 0.68));
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.13), inset 0 1px rgba(255, 255, 255, 0.025);
}
.diagnosis-section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin: 0.2rem 0 1.15rem;
}
.diagnosis-section-heading h2 {
  margin: 0.32rem 0 0;
  color: #f0efe5;
  font-size: clamp(1.2rem, 2vw, 1.55rem);
  font-weight: 700;
  letter-spacing: -0.035em;
}
.diagnosis-section-heading > p {
  max-width: 430px;
  margin: 0;
  color: var(--diagnosis-muted);
  font-size: 0.76rem;
  line-height: 1.55;
  text-align: right;
}
.diagnosis-section-kicker { font-size: 0.57rem; }

.diagnosis-scanner { animation: diagnosis-content-enter 0.55s 0.08s both; }
.diagnosis-scanner :deep(.multispectral-scanner > div:first-child),
.diagnosis-scanner :deep(.multispectral-scanner > div:last-child > section) {
  border-color: rgba(196, 218, 147, 0.15);
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.2), inset 0 1px rgba(255, 255, 255, 0.025);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}
.diagnosis-scanner :deep(.multispectral-scanner > div:last-child > section:hover) {
  border-color: rgba(196, 218, 147, 0.25);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.25), inset 0 1px rgba(255, 255, 255, 0.035);
}

.diagnosis-guide { animation: diagnosis-content-enter 0.6s 0.16s both; }
.guide-heading { margin-bottom: 1rem; }
.diagnosis-guide-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.8rem; }
.diagnosis-guide-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 1rem;
  border: 1px solid rgba(196, 218, 147, 0.12);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(29, 39, 29, 0.82), rgba(15, 22, 17, 0.75));
  transition: transform 0.24s ease, border-color 0.24s ease, background 0.24s ease;
  animation: diagnosis-content-enter 0.5s both;
}
.diagnosis-guide-card:nth-child(2) { animation-delay: 0.06s; }
.diagnosis-guide-card:nth-child(3) { animation-delay: 0.12s; }
.diagnosis-guide-card:nth-child(4) { animation-delay: 0.18s; }
.diagnosis-guide-card::after {
  position: absolute;
  top: 0;
  right: 1rem;
  left: 1rem;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--guide-color), transparent);
  content: "";
  opacity: 0.68;
}
.diagnosis-guide-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--guide-color) 36%, transparent);
  background: linear-gradient(145deg, rgba(34, 45, 33, 0.94), rgba(17, 25, 19, 0.9));
}
.guide-area { --guide-color: #77c99a; }
.guide-vigor { --guide-color: #c6d96f; }
.guide-temperature { --guide-color: #eba262; }
.guide-scenarios { --guide-color: #d5a77c; }
.guide-index {
  display: block;
  color: #8e9a87;
  font-size: 0.54rem;
  font-weight: 800;
  letter-spacing: 0.13em;
}
.guide-icon {
  display: grid;
  width: 38px;
  height: 38px;
  margin: 0.8rem 0 0.75rem;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--guide-color) 26%, transparent);
  border-radius: 11px;
  color: var(--guide-color);
  background: color-mix(in srgb, var(--guide-color) 9%, transparent);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.diagnosis-guide-card:hover .guide-icon { transform: scale(1.06) rotate(-4deg); box-shadow: 0 0 20px color-mix(in srgb, var(--guide-color) 17%, transparent); }
.diagnosis-guide-card h3 { margin: 0; color: #e8ebdf; font-size: 0.88rem; font-weight: 700; }
.diagnosis-guide-card p { min-height: 3.2rem; margin: 0.45rem 0 0.8rem; color: #a2ad9b; font-size: 0.69rem; line-height: 1.55; }
.guide-tech {
  display: inline-flex;
  padding: 0.3rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--guide-color) 15%, transparent);
  border-radius: 6px;
  color: var(--guide-color);
  background: color-mix(in srgb, var(--guide-color) 6%, transparent);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.025em;
}
.scenario-icon-stack { display: inline-flex; align-items: center; gap: 2px; }
.scenario-flame { color: #ee9a5d; }
.scenario-water { color: #67b9d2; }
.scenario-bug { color: #e47f73; }

@keyframes diagnosis-page-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes diagnosis-content-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes diagnosis-visual-arrive {
  from { opacity: 0; transform: scale(0.9) rotate(-5deg); }
  to { opacity: 1; transform: scale(1) rotate(0); }
}
@keyframes diagnosis-orbit { to { transform: rotate(360deg); } }
@keyframes diagnosis-core-float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -7px; }
}
@keyframes diagnosis-scan {
  0%, 100% { top: 24%; opacity: 0.25; }
  50% { top: 76%; opacity: 0.9; }
}
@keyframes diagnosis-sparkle {
  from { opacity: 0.35; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1.25); }
}

@media (max-width: 900px) {
  .diagnosis-hero { grid-template-columns: minmax(0, 1fr) 190px; }
  .diagnosis-hero-visual { width: 190px; }
  .diagnosis-guide-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .diagnosis-hero {
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    padding: 1.35rem;
    border-radius: 18px;
  }
  .diagnosis-hero-visual { display: none; }
  .diagnosis-hero h1 { margin-top: 1rem; font-size: clamp(1.9rem, 9vw, 2.5rem); }
  .diagnosis-intro { font-size: 0.83rem; }
  .diagnosis-workspace,
  .diagnosis-guide { padding: 0.85rem; border-radius: 15px; }
  .diagnosis-section-heading { align-items: flex-start; flex-direction: column; gap: 0.4rem; }
  .diagnosis-section-heading > p { text-align: left; }
  .diagnosis-guide-grid { gap: 0.55rem; }
  .diagnosis-guide-card { padding: 0.8rem; }
  .diagnosis-guide-card p { min-height: 0; }
  .guide-tech { font-size: 0.52rem; }
}

@media (prefers-reduced-motion: reduce) {
  .diagnosis-page *,
  .diagnosis-page *::before,
  .diagnosis-page *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
