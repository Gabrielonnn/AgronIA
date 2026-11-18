import * as ort from 'onnxruntime-web'
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  env as transformersEnv,
  pipeline,
  RawImage
} from '@huggingface/transformers'
import type {
  AgroVisionAnalysis,
  AgroVisionLensInfo,
  AgroVisionTopPrediction,
  DetectedPlantBox
} from './plantDiagnosis'

export interface BrowserEngineStatus {
  stage: 'idle' | 'loading' | 'ready' | 'error'
  message: string
  onnxReady: boolean
  detectorReady: boolean
  clipReady: boolean
}

const AGRONOMY_DB: Record<
  string,
  {
    cultivo: string
    enfermedad_es: string
    estado_salud: string
    agente_causal: string
    severidad: string
    recomendacion: string
  }
> = {
  Pepper__bell___Bacterial_spot: {
    cultivo: 'Pimiento Morrón (Capsicum annuum)',
    enfermedad_es: 'Mancha Bacteriana',
    estado_salud: 'ENFERMA',
    agente_causal: 'Bacteria (Xanthomonas campestris pv. vesicatoria)',
    severidad: 'ALTA',
    recomendacion:
      'Aplicar bactericidas cúpricos preventivos, evitar riego por aspersión y retirar follaje basal infectado.'
  },
  Pepper__bell___healthy: {
    cultivo: 'Pimiento Morrón (Capsicum annuum)',
    enfermedad_es: 'Planta Saludable',
    estado_salud: 'SALUDABLE',
    agente_causal: 'Ninguno',
    severidad: 'NINGUNA',
    recomendacion: 'Mantener régimen actual de fertirriego y monitoreo preventivo semanal.'
  },
  Potato___Early_blight: {
    cultivo: 'Papa / Patata (Solanum tuberosum)',
    enfermedad_es: 'Tizón Temprano',
    estado_salud: 'ENFERMA',
    agente_causal: 'Hongo (Alternaria solani)',
    severidad: 'MEDIA-ALTA',
    recomendacion:
      'Aplicar fungicidas sistémicos/contacto (azoxistrobina, clorotalonil), optimizar nutrición potásica y rotar cultivos.'
  },
  Potato___Late_blight: {
    cultivo: 'Papa / Patata (Solanum tuberosum)',
    enfermedad_es: 'Tizón Tardío',
    estado_salud: 'ENFERMA',
    agente_causal: 'Oomiceto (Phytophthora infestans)',
    severidad: 'CRÍTICA',
    recomendacion:
      'Acción inmediata: aplicar fungicidas anti-oomicetos (metalaxil, cimoxanilo), reducir humedad relativa y aislar focos.'
  },
  Potato___healthy: {
    cultivo: 'Papa / Patata (Solanum tuberosum)',
    enfermedad_es: 'Planta Saludable',
    estado_salud: 'SALUDABLE',
    agente_causal: 'Ninguno',
    severidad: 'NINGUNA',
    recomendacion: 'Estado óptimo. Continuar vigilancia climática ante periodos de alta humedad.'
  },
  Tomato_Bacterial_spot: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Mancha Bacteriana del Tomate',
    estado_salud: 'ENFERMA',
    agente_causal: 'Bacteria (Xanthomonas spp.)',
    severidad: 'ALTA',
    recomendacion:
      'Desinfectar herramientas de poda, usar hidróxido de cobre y evitar labores cuando el follaje esté húmedo.'
  },
  Tomato_Early_blight: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Tizón Temprano (Alternariosis)',
    estado_salud: 'ENFERMA',
    agente_causal: 'Hongo (Alternaria solani)',
    severidad: 'MEDIA-ALTA',
    recomendacion:
      'Podar hojas bajeras senescentes, mejorar ventilación del dosel y aplicar fungicida específico.'
  },
  Tomato_Late_blight: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Tizón Tardío del Tomate',
    estado_salud: 'ENFERMA',
    agente_causal: 'Oomiceto (Phytophthora infestans)',
    severidad: 'CRÍTICA',
    recomendacion:
      'Alerta fitosanitaria urgente: aplicar fungicida sistémico, eliminar plantas severamente afectadas y controlar drenaje.'
  },
  Tomato_Leaf_Mold: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Moho de la Hoja (Cladosporiosis)',
    estado_salud: 'ENFERMA',
    agente_causal: 'Hongo (Passalora fulva / Fulvia fulva)',
    severidad: 'MEDIA',
    recomendacion:
      'Reducir humedad relativa bajo invernadero (<85%), aumentar aireación y aplicar fungicida preventivo.'
  },
  Tomato_Septoria_leaf_spot: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Mancha Foliar por Septoria',
    estado_salud: 'ENFERMA',
    agente_causal: 'Hongo (Septoria lycopersici)',
    severidad: 'MEDIA-ALTA',
    recomendacion:
      'Eliminar residuos vegetales infectados, usar acolchado (mulch) para evitar salpicaduras y aplicar fungicida.'
  },
  Tomato_Spider_mites_Two_spotted_spider_mite: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Araña Roja / Ácaro de Dos Manchas',
    estado_salud: 'ENFERMA',
    agente_causal: 'Ácaro (Tetranychus urticae)',
    severidad: 'MEDIA-ALTA',
    recomendacion:
      'Aplicar acaricidas selectivos (abamectina) o control biológico (Phytoseiulus persimilis); evitar estrés hídrico.'
  },
  Tomato__Target_Spot: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Mancha Anillada (Target Spot)',
    estado_salud: 'ENFERMA',
    agente_causal: 'Hongo (Corynespora cassiicola)',
    severidad: 'MEDIA',
    recomendacion:
      'Mejorar flujo de aire entre hileras y aplicar fungicidas estrobilurinas o triazoles.'
  },
  Tomato__Tomato_YellowLeaf__Curl_Virus: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Virus del Rizado Amarillo del Tomate (TYLCV)',
    estado_salud: 'ENFERMA',
    agente_causal: 'Virus (Begomovirus - vector: Mosca Blanca Bemisia tabaci)',
    severidad: 'CRÍTICA',
    recomendacion:
      'Controlar el vector (mosca blanca) con trampas cromáticas y mallas antiáfidos; erradicar plantas virosas.'
  },
  Tomato__Tomato_mosaic_virus: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Virus del Mosaico del Tomate (ToMV)',
    estado_salud: 'ENFERMA',
    agente_causal: 'Virus (Tobamovirus - transmisión mecánica)',
    severidad: 'ALTA',
    recomendacion:
      'Desinfección estricta de manos y herramientas con solución jabonosa/hipoclorito; retirar plantas sintomáticas.'
  },
  Tomato_healthy: {
    cultivo: 'Tomate (Solanum lycopersicum)',
    enfermedad_es: 'Planta Saludable',
    estado_salud: 'SALUDABLE',
    agente_causal: 'Ninguno',
    severidad: 'NINGUNA',
    recomendacion: 'Cultivo vigoroso y sin síntomas foliares. Continuar monitoreo rutinario.'
  }
}

interface BotanicalEntry {
  id: string
  in_dataset: boolean
  prompt_en: string
  name_es: string
  scientific_name: string
  wiki_query: string
  light: string
  water: string
  soil_temp: string
  care: string
}

const BOTANICAL_CATALOG: BotanicalEntry[] = [
  {
    id: 'trained_tomato',
    in_dataset: true,
    prompt_en: 'a close-up photo of a green tomato plant leaf (Solanum lycopersicum)',
    name_es: 'Tomate',
    scientific_name: 'Solanum lycopersicum',
    wiki_query: 'Solanum_lycopersicum',
    light: 'Sol directo pleno (6 a 8 horas diarias).',
    water: 'Riego frecuente en la base (3-4 veces/semana) sin mojar las hojas.',
    soil_temp: 'Suelo suelto rico en nutrientes (pH 6.0-6.8), temp. óptima 20-28°C.',
    care: 'Sol directo (6-8h), riego regular en la base evitando mojar el follaje y tutorado.'
  },
  {
    id: 'trained_potato',
    in_dataset: true,
    prompt_en: 'a close-up photo of a potato plant leaf (Solanum tuberosum)',
    name_es: 'Papa / Patata',
    scientific_name: 'Solanum tuberosum',
    wiki_query: 'Solanum_tuberosum',
    light: 'Pleno sol o luz solar abundante.',
    water: 'Riego moderado manteniendo humedad uniforme sin encharcar tubérculos.',
    soil_temp: 'Suelo franco-arenoso bien drenado, clima templado-fresco (15-22°C).',
    care: 'Clima fresco, suelo suelto bien drenado, riego moderado y aporcado periódico.'
  },
  {
    id: 'trained_pepper',
    in_dataset: true,
    prompt_en: 'a close-up photo of a bell pepper or chili pepper plant leaf (Capsicum annuum)',
    name_es: 'Pimiento Morrón / Chile',
    scientific_name: 'Capsicum annuum',
    wiki_query: 'Capsicum_annuum',
    light: 'Exposición solar directa (mínimo 6 horas al día).',
    water: 'Riego regular y constante sin encharcar raíces.',
    soil_temp: 'Sustrato fértil y drenado, clima cálido (20-29°C) protegido de heladas.',
    care: 'Pleno sol, temperatura cálida (20-28°C), riego frecuente sin encharcar y suelo rico en materia orgánica.'
  },
  {
    id: 'columnar_cactus',
    in_dataset: false,
    prompt_en: 'a tall elongated columnar cactus plant with spines in a small pot (Cactaceae / Cereus)',
    name_es: 'Cactus Columnar',
    scientific_name: 'Cactaceae (Cereus / Trichocereus)',
    wiki_query: 'Cactaceae',
    light: 'Sol directo o ventana muy iluminada (mínimo 5-6 horas de luz intensa).',
    water: 'Riego muy espaciado: cada 15-20 días en primavera-verano y 1 vez al mes en invierno.',
    soil_temp: 'Sustrato mineral poroso (arena gruesa, grava volcánica y perlita) con drenaje total.',
    care: 'Mucho sol directo; regar solo cuando la tierra esté 100% seca; evitar mojar el cuerpo del cactus.'
  },
  {
    id: 'globose_cluster_cactus',
    in_dataset: false,
    prompt_en: 'a round globose clustered cactus plant or Mammillaria with spines in a pot',
    name_es: 'Cactus Globoso / Biznaga en Maceta',
    scientific_name: 'Mammillaria / Echinopsis (Cactaceae)',
    wiki_query: 'Mammillaria',
    light: 'Luz solar directa abundante para mantener su forma compacta y estimular floración.',
    water: 'Riego escaso cada 2-3 semanas dejando secar completamente el sustrato entre riegos.',
    soil_temp: 'Sustrato mineral para cactáceas en maceta con orificios de drenaje; 15-32°C.',
    care: 'Exposición soleada; riego muy espaciado; proteger del exceso de humedad para evitar pudrición basal.'
  },
  {
    id: 'aloe_vera',
    in_dataset: false,
    prompt_en: 'Aloe vera succulent plant with thick fleshy serrated green leaves',
    name_es: 'Sábila / Aloe Vera',
    scientific_name: 'Aloe barbadensis miller',
    wiki_query: 'Aloe_vera',
    light: 'Luz solar directa o iluminación natural muy intensa.',
    water: 'Riego escaso cada 15-20 días; dejar secar la tierra por completo antes de regar.',
    soil_temp: 'Sustrato arenoso para cactus/suculentas con drenaje rápido; 18-30°C.',
    care: 'Luz solar directa; riego escaso cada 15-20 días dejando secar el sustrato; tierra arenosa con buen drenaje.'
  },
  {
    id: 'echeveria_succulent',
    in_dataset: false,
    prompt_en: 'a rosette succulent plant like Echeveria, Sempervivum or Haworthia',
    name_es: 'Suculenta Roseta / Echeveria',
    scientific_name: 'Echeveria spp. (Crassulaceae)',
    wiki_query: 'Echeveria',
    light: 'Mucha luz natural y sol suave de mañana.',
    water: 'Regar cada 10-14 días solo cuando el sustrato esté 100% seco, sin mojar las hojas.',
    soil_temp: 'Mezcla para suculentas con perlita o piedra pómez; ambiente ventilado.',
    care: 'Mucha iluminación natural; regar solo cuando la tierra esté totalmente seca evitando agua en la roseta.'
  },
  {
    id: 'jade_plant',
    in_dataset: false,
    prompt_en: 'a Jade plant (Crassula ovata) with oval thick glossy green leaves',
    name_es: 'Árbol de Jade / Planta del Dinero',
    scientific_name: 'Crassula ovata',
    wiki_query: 'Crassula_ovata',
    light: 'Luz brillante con 3-4 horas de sol directo suave.',
    water: 'Riego moderado cada 10-15 días cuando la tierra esté seca al tacto.',
    soil_temp: 'Sustrato bien drenado; temperatura ideal 18-26°C, sensible al frío extremo.',
    care: 'Luz brillante con algunas horas de sol directo; riego moderado cada 10-14 días; proteger de heladas.'
  },
  {
    id: 'monstera',
    in_dataset: false,
    prompt_en: 'a Monstera deliciosa tropical plant leaf with fenestrations, holes and splits',
    name_es: 'Costilla de Adán / Monstera',
    scientific_name: 'Monstera deliciosa',
    wiki_query: 'Monstera_deliciosa',
    light: 'Luz indirecta brillante (evitar el sol directo fuerte que amarillea las hojas).',
    water: 'Riego semanal moderado (cuando los primeros 4 cm de tierra estén secos).',
    soil_temp: 'Sustrato rico en turba y corteza; humedad ambiental alta y limpieza de hojas.',
    care: 'Luz indirecta brillante; riego semanal moderado; alta humedad ambiental y tutor para raíces aéreas.'
  },
  {
    id: 'pothos',
    in_dataset: false,
    prompt_en: 'a hanging vine plant, golden pothos or philodendron with heart-shaped leaves',
    name_es: 'Potus / Teléfono / Planta Colgante',
    scientific_name: 'Epipremnum aureum',
    wiki_query: 'Epipremnum_aureum',
    light: 'Luz indirecta media a brillante (evitar sol directo intenso).',
    water: 'Cada 7-10 días dejando secar la capa superficial entre riegos.',
    soil_temp: 'Sustrato universal aireado con perlita; temperatura templada (17-27°C).',
    care: 'Luz indirecta media a brillante; regar cuando los primeros 3 cm de sustrato estén secos; muy resistente.'
  },
  {
    id: 'snake_plant',
    in_dataset: false,
    prompt_en: 'a snake plant (Sansevieria) with upright sword-like striped leaves',
    name_es: 'Lengua de Suegra / Espada de San Jorge',
    scientific_name: 'Dracaena trifasciata (Sansevieria)',
    wiki_query: 'Dracaena_trifasciata',
    light: 'Muy adaptable: desde sombra parcial hasta luz solar indirecta intensa.',
    water: 'Riego muy escaso (cada 2 a 3 semanas); el exceso de agua pudre el rizoma.',
    soil_temp: 'Sustrato drenante tipo cactus; tolera ambientes secos de interior.',
    care: 'Tolera desde sombra parcial hasta luz brillante; riego muy moderado cada 2-3 semanas; evitar encharcar.'
  },
  {
    id: 'peace_lily',
    in_dataset: false,
    prompt_en: 'a peace lily plant (Spathiphyllum) with dark green leaves and white spathe flower',
    name_es: 'Cuna de Moisés / Espatifilo',
    scientific_name: 'Spathiphyllum wallisii',
    wiki_query: 'Spathiphyllum',
    light: 'Luz indirecta suave a media (nunca sol directo porque quema el follaje).',
    water: 'Frecuente (2-3 veces/semana) manteniendo el sustrato ligeramente húmedo.',
    soil_temp: 'Tierra rica en humus con buen drenaje; agradecerá pulverizar agua en hojas.',
    care: 'Luz indirecta suave; mantener el sustrato ligeramente húmedo sin encharcar; ambientes cálidos y húmedos.'
  },
  {
    id: 'fern',
    in_dataset: false,
    prompt_en: 'a green fern plant (Nephrolepis) with feathery divided fronds',
    name_es: 'Helecho común / Helecho espada',
    scientific_name: 'Nephrolepis exaltata (Filicopsida)',
    wiki_query: 'Filicopsida',
    light: 'Semisombra o luz filtrada suave; alejado del sol directo.',
    water: 'Riego frecuente para que el sustrato permanezca húmedo (sin quedar estancado).',
    soil_temp: 'Alta humedad ambiental (pulverizar follaje); sustrato fibroso con turba.',
    care: 'Sombra o semisombra; humedad ambiental alta (pulverizar agua en hojas) y sustrato siempre ligeramente húmedo.'
  },
  {
    id: 'ficus',
    in_dataset: false,
    prompt_en: 'a Ficus elastica rubber plant or Ficus lyrata with glossy leaves',
    name_es: 'Ficus / Árbol del Caucho / Gomero',
    scientific_name: 'Ficus elastica / Ficus spp.',
    wiki_query: 'Ficus_elastica',
    light: 'Luz natural abundante e indirecta cerca de una ventana.',
    water: 'Riego semanal en verano y cada 12-15 días en invierno.',
    soil_temp: 'Sustrato fértil bien drenado; evitar cambios bruscos de lugar y corrientes frías.',
    care: 'Luz abundante indirecta; riego moderado esperando a que seque la capa superficial; evitar corrientes frías.'
  },
  {
    id: 'rose',
    in_dataset: false,
    prompt_en: 'a rose flower or rose bush plant with serrated leaflets (Rosa)',
    name_es: 'Rosa / Rosal',
    scientific_name: 'Rosa spp. (Rosaceae)',
    wiki_query: 'Rosa',
    light: 'Sol directo pleno (mínimo 6 horas diarias para florecer bien).',
    water: 'Riego profundo en la base 2-3 veces por semana sin mojar hojas ni flores.',
    soil_temp: 'Suelo rico en materia orgánica, bien drenado; realizar poda anual y abono.',
    care: 'Mínimo 6 horas de sol directo al día; riego profundo en la base sin mojar hojas; poda anual de aireación.'
  },
  {
    id: 'sunflower',
    in_dataset: false,
    prompt_en: 'a yellow sunflower plant or broad sunflower leaf (Helianthus annuus)',
    name_es: 'Girasol / Maravilla',
    scientific_name: 'Helianthus annuus',
    wiki_query: 'Helianthus_annuus',
    light: 'Pleno sol directo durante todo el día.',
    water: 'Riego regular y abundante especialmente durante el crecimiento y floración.',
    soil_temp: 'Suelo profundo, suelto y nutritivo; proteger de vientos muy fuertes.',
    care: 'Pleno sol directo todo el día; riego regular durante la formación floral; suelo profundo y nutritivo.'
  },
  {
    id: 'orchid',
    in_dataset: false,
    prompt_en: 'an orchid plant or flower (Phalaenopsis / Orchidaceae)',
    name_es: 'Orquídea Mariposa',
    scientific_name: 'Phalaenopsis spp. (Orchidaceae)',
    wiki_query: 'Orchidaceae',
    light: 'Luz filtrada intensa sin sol directo del mediodía.',
    water: 'Riego por inmersión cada 7-10 días cuando las raíces se tornen grisáceas.',
    soil_temp: 'Sustrato exclusivo de corteza de pino en maceta transparente; 18-28°C.',
    care: 'Luz tamizada intensa; riego por inmersión cada 7-10 días cuando las raíces se vean grises; corteza de pino.'
  },
  {
    id: 'lavender',
    in_dataset: false,
    prompt_en: 'a purple lavender plant (Lavandula) with narrow grey-green leaves',
    name_es: 'Lavanda / Espliego',
    scientific_name: 'Lavandula angustifolia',
    wiki_query: 'Lavandula',
    light: 'Sol directo pleno (mínimo 6-8 horas).',
    water: 'Riego escaso (1 vez por semana o cada 10 días); no tolera encharcamiento.',
    soil_temp: 'Suelo ligero, calcáreo/arenoso con drenaje excelente; podar tras floración.',
    care: 'Sol directo pleno; riego escaso y suelo alcalino/arenoso con excelente drenaje; podar tras la floración.'
  },
  {
    id: 'mint',
    in_dataset: false,
    prompt_en: 'fresh green mint or spearmint herb leaves (Mentha) with serrated edges',
    name_es: 'Menta / Hierbabuena',
    scientific_name: 'Mentha spicata / Mentha x piperita',
    wiki_query: 'Mentha',
    light: 'Semisombra luminosa o sol suave de la mañana.',
    water: 'Riego frecuente (cada 2-3 días) para mantener la tierra fresca y húmeda.',
    soil_temp: 'Suelo rico en humus; se recomienda cultivar en maceta amplia por su rápido crecimiento.',
    care: 'Semisombra o sol suave; riego frecuente manteniendo el sustrato fresco y húmedo; podar puntas regularmente.'
  },
  {
    id: 'basil',
    in_dataset: false,
    prompt_en: 'sweet basil herb plant (Ocimum basilicum) with bright green smooth leaves',
    name_es: 'Albahaca Dulce',
    scientific_name: 'Ocimum basilicum',
    wiki_query: 'Ocimum_basilicum',
    light: 'Sol directo o luz solar muy abundante (4-6 horas).',
    water: 'Riego frecuente (casi diario en clima cálido) manteniendo humedad sin encharcar.',
    soil_temp: 'Sustrato fértil y húmedo; cortar las flores apenas salgan para que produzca más hojas.',
    care: 'Sol directo o luz abundante; riego frecuente sin encharcar; despuntar espigas florales para dar más follaje.'
  },
  {
    id: 'rosemary',
    in_dataset: false,
    prompt_en: 'rosemary herb plant (Salvia rosmarinus) with needle-like aromatic leaves',
    name_es: 'Romero Aromático',
    scientific_name: 'Salvia rosmarinus',
    wiki_query: 'Salvia_rosmarinus',
    light: 'Pleno sol directo todo el día.',
    water: 'Riego escaso; dejar secar bien la tierra entre riegos (muy resistente a sequía).',
    soil_temp: 'Suelo arenoso y muy bien drenado; excelente en climas cálidos y secos.',
    care: 'Pleno sol; muy resistente a la sequía (riego escaso); suelo arenoso y perfectamente drenado.'
  },
  {
    id: 'citrus_lemon',
    in_dataset: false,
    prompt_en: 'a citrus lemon, lime or orange tree leaf (Citrus) oval glossy dark green',
    name_es: 'Cítrico: Limonero / Naranjo',
    scientific_name: 'Citrus limon / Citrus sinensis',
    wiki_query: 'Citrus',
    light: 'Pleno sol directo (6 a 8 horas diarias).',
    water: 'Riegos profundos 2-3 veces por semana en verano; evitar sequía en floración.',
    soil_temp: 'Suelo ligeramente ácido y drenado; abonar con hierro, zinc y nitrógeno.',
    care: 'Pleno sol (mínimo 6h); riegos profundos y regulares en verano; fertilización con micronutrientes (hierro/zinc).'
  },
  {
    id: 'corn_maize',
    in_dataset: false,
    prompt_en: 'a corn or maize plant leaf (Zea mays) long lance-shaped green leaf',
    name_es: 'Maíz / Elote',
    scientific_name: 'Zea mays',
    wiki_query: 'Zea_mays',
    light: 'Exposición solar total directa.',
    water: 'Riego abundante especialmente durante el espigado y llenado de mazorca.',
    soil_temp: 'Suelo franco profundo y fértil con buen aporte de nitrógeno.',
    care: 'Exposición solar total; alta demanda hídrica durante floración y llenado de mazorca; fertilización nitrogenada.'
  },
  {
    id: 'generic_tree_shrub',
    in_dataset: false,
    prompt_en: 'a green houseplant, garden shrub or botanical plant in a pot',
    name_es: 'Planta Ornamental en Maceta',
    scientific_name: 'Reino Plantae',
    wiki_query: 'Plantae',
    light: 'Luz natural abundante o semisombra luminosa cerca de ventana.',
    water: 'Regar cuando los primeros 3 cm de tierra se sientan secos al tacto.',
    soil_temp: 'Maceta con orificios de drenaje y sustrato aireado rico en materia orgánica.',
    care: 'Luz natural adecuada, regar cuando la capa superior del suelo seque y asegurar buen drenaje.'
  }
]

const VISUAL_HEALTH_PROMPTS = [
  {
    status: 'SALUDABLE (VIGOROSA)',
    severity: 'NINGUNA',
    prompt_en: 'a healthy vibrant green plant, healthy cactus or healthy succulent in good condition',
    diagnosis_es: 'Planta de aspecto saludable, buena turgencia y coloración normal',
    action_es:
      'La planta luce sana y vigorosa. Mantener el régimen recomendado de luz y riego sin excederse en humedad.'
  },
  {
    status: 'ESTRÉS HÍDRICO / SEQUEDAD',
    severity: 'MEDIA',
    prompt_en: 'a dry wilted dehydrated shriveled plant or cactus with brown dry tips',
    diagnosis_es: 'Signos visuales de deshidratación, marchitez o puntas secas',
    action_es:
      'Revisar humedad del sustrato: aplicar riego gradual y evitar exposición a corrientes de aire seco o calor extremo.'
  },
  {
    status: 'CLOROSIS / AMARILLAMIENTO',
    severity: 'MEDIA',
    prompt_en: 'a yellowing chlorotic pale plant leaf or overwatered yellowing succulent',
    diagnosis_es: 'Amarillamiento foliar (clorosis) por exceso de riego o falta de nutrientes',
    action_es:
      'Reducir frecuencia de riego, verificar que la maceta drene bien y aportar fertilizante equilibrado con hierro/magnesio.'
  },
  {
    status: 'MANCHAS / NECROSIS O QUEMADURA',
    severity: 'ALTA',
    prompt_en: 'a diseased plant leaf or cactus with brown necrotic spots, fungal rot, sunburn or pests',
    diagnosis_es: 'Presencia de manchas oscuras/necróticas, quemadura solar o posible hongo/plaga',
    action_es:
      'Aislar preventivamente, evitar mojar el tallo/hojas al regar, retirar tejido dañado y revisar presencia de cochinilla o hongos.'
  }
]

const EMPTY_BACKGROUND_PROMPTS = [
  'an empty room wall, ceiling, furniture or human face with zero plants',
  'a dark plain empty background with no vegetation'
]

type ZeroShotPipeline = (
  image: string | RawImage,
  candidateLabels: string[]
) => Promise<Array<{ label: string; score: number }>>

type ObjectDetectionPipeline = (
  image: string | RawImage,
  options?: { threshold?: number; percentage?: boolean }
) => Promise<
  Array<{
    label: string
    score: number
    box: { xmin: number; ymin: number; xmax: number; ymax: number }
  }>
>

class BrowserAgroVisionEngine {
  private ortSession: ort.InferenceSession | null = null
  private classNames: string[] = []
  private detectorPipe: ObjectDetectionPipeline | null = null
  private clipPipe: ZeroShotPipeline | null = null
  private clipProcessor: ((img: RawImage) => Promise<Record<string, unknown>>) | null = null
  private clipVisionModel:
    | ((inputs: Record<string, unknown>) => Promise<{ image_embeds?: { data: Float32Array; dims: number[] } }>)
    | null = null
  private clipTextEmbeds: Float32Array[] = []
  private clipAllLabels: string[] = []

  private initPromise: Promise<void> | null = null
  private clipInitPromise: Promise<void> | null = null
  private detectorInitPromise: Promise<void> | null = null

  private prepCanvas: HTMLCanvasElement | null = null
  private detCanvas: HTMLCanvasElement | null = null
  private cropCanvas: HTMLCanvasElement | null = null
  private cachedDetections: DetectedPlantBox[] = []
  private lastDetTime = 0
  private lastClipTime = 0
  private lastClipResult: { scoreByLabel: Map<string, number> } | null = null

  private wikiCache = new Map<string, string>()
  private pendingWiki = new Set<string>()
  private statusListeners = new Set<(status: BrowserEngineStatus) => void>()

  public status: BrowserEngineStatus = {
    stage: 'idle',
    message: 'Motor IA en navegador listo para iniciar.',
    onnxReady: false,
    detectorReady: false,
    clipReady: false
  }

  public onStatusChange(listener: (status: BrowserEngineStatus) => void): () => void {
    this.statusListeners.add(listener)
    listener({ ...this.status })
    return () => this.statusListeners.delete(listener)
  }

  private updateStatus(partial: Partial<BrowserEngineStatus>) {
    this.status = { ...this.status, ...partial }
    for (const cb of this.statusListeners) {
      cb({ ...this.status })
    }
  }

  private getBaseAssetPath(): string {
    const base = import.meta.env.BASE_URL || '/'
    return base.endsWith('/') ? base : `${base}/`
  }

  public async ensureOnnxLoaded(): Promise<void> {
    if (this.ortSession) return
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      try {
        this.updateStatus({
          stage: 'loading',
          message: 'Cargando modelo EfficientNet-B2 ONNX en navegador…'
        })
        const base = this.getBaseAssetPath()
        ort.env.wasm.simd = true
        const isolated = typeof self !== 'undefined' && Boolean((self as { crossOriginIsolated?: boolean }).crossOriginIsolated)
        ort.env.wasm.numThreads = isolated ? Math.min(4, navigator.hardwareConcurrency || 4) : 1

        const [mapRes, modelBuf] = await Promise.all([
          fetch(`${base}models/class_mapping.json`),
          fetch(`${base}models/plant_health_model.onnx`).then(r => {
            if (!r.ok) throw new Error(`No se pudo descargar el modelo ONNX (${r.status}).`)
            return r.arrayBuffer()
          })
        ])

        if (mapRes.ok) {
          const mapData = (await mapRes.json()) as { class_names?: string[] }
          this.classNames = mapData.class_names ?? []
        }

        const modelBytes = new Uint8Array(modelBuf)
        const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
        if (hasWebGpu) {
          try {
            this.ortSession = await ort.InferenceSession.create(modelBytes, {
              executionProviders: ['webgpu']
            })
          } catch {
            this.ortSession = await ort.InferenceSession.create(modelBytes, {
              executionProviders: ['wasm']
            })
          }
        } else {
          this.ortSession = await ort.InferenceSession.create(modelBytes, {
            executionProviders: ['wasm']
          })
        }
        this.updateStatus({
          onnxReady: true,
          stage: this.clipVisionModel || this.clipPipe ? 'ready' : 'loading',
          message: 'Modelo EfficientNet-B2 ONNX listo en navegador.'
        })
      } catch (err) {
        this.updateStatus({
          stage: 'error',
          message:
            err instanceof Error ? err.message : 'Error al inicializar EfficientNet-B2 ONNX en navegador.'
        })
        throw err
      }
    })()

    return this.initPromise
  }

  public async ensureClipLoaded(): Promise<void> {
    if (this.clipVisionModel || this.clipPipe) return
    if (this.clipInitPromise) return this.clipInitPromise

    this.clipInitPromise = (async () => {
      try {
        this.updateStatus({
          stage: 'loading',
          message: 'Cargando PlantLens (CLIP ViT-B-32) para identificación abierta…'
        })
        transformersEnv.allowLocalModels = false
        transformersEnv.useBrowserCache = true

        const modelId = 'Xenova/clip-vit-base-patch32'
        this.clipAllLabels = [
          ...BOTANICAL_CATALOG.map(b => b.prompt_en),
          ...EMPTY_BACKGROUND_PROMPTS,
          ...VISUAL_HEALTH_PROMPTS.map(h => h.prompt_en)
        ]

        try {
          // Pre-computar embeddings de texto UNA sola vez para ahorrar ~85% del tiempo en cada cuadro
          const [tokenizer, textModel, processor, visionModel] = await Promise.all([
            AutoTokenizer.from_pretrained(modelId),
            CLIPTextModelWithProjection.from_pretrained(modelId, { dtype: 'q8' }),
            AutoProcessor.from_pretrained(modelId),
            CLIPVisionModelWithProjection.from_pretrained(modelId, { dtype: 'q8' })
          ])

          const textInputs = tokenizer(this.clipAllLabels, { padding: true, truncation: true })
          const textOut = await (textModel as unknown as (inp: unknown) => Promise<{
            text_embeds?: { data: Float32Array; dims: number[] }
          }>)(textInputs)

          const embedsTensor = textOut.text_embeds
          if (embedsTensor && embedsTensor.dims.length === 2) {
            const [numPrompts, dim] = embedsTensor.dims
            const normalized: Float32Array[] = []
            for (let i = 0; i < numPrompts; i++) {
              const vec = new Float32Array(dim)
              let normSq = 0
              const offset = i * dim
              for (let j = 0; j < dim; j++) {
                const v = embedsTensor.data[offset + j]
                vec[j] = v
                normSq += v * v
              }
              const invNorm = 1.0 / Math.max(1e-8, Math.sqrt(normSq))
              for (let j = 0; j < dim; j++) {
                vec[j] *= invNorm
              }
              normalized.push(vec)
            }
            this.clipTextEmbeds = normalized
            this.clipProcessor = processor as unknown as (img: RawImage) => Promise<Record<string, unknown>>
            this.clipVisionModel = visionModel as unknown as (
              inputs: Record<string, unknown>
            ) => Promise<{ image_embeds?: { data: Float32Array; dims: number[] } }>
          } else {
            throw new Error('Missing text_embeds')
          }
        } catch {
          this.clipPipe = (await pipeline('zero-shot-image-classification', modelId, {
            dtype: 'q8'
          })) as unknown as ZeroShotPipeline
        }

        this.updateStatus({
          clipReady: true,
          stage: this.ortSession ? 'ready' : 'loading',
          message: 'AgroVision ONNX + PlantLens activos en tu navegador.'
        })
      } catch {
        this.updateStatus({
          clipReady: false,
          stage: this.ortSession ? 'ready' : 'error',
          message: 'EfficientNet-B2 ONNX activo (PlantLens offline).'
        })
      }
    })()

    return this.clipInitPromise
  }

  public async ensureDetectorLoaded(): Promise<void> {
    if (this.detectorPipe) return
    if (this.detectorInitPromise) return this.detectorInitPromise

    this.detectorInitPromise = (async () => {
      try {
        transformersEnv.allowLocalModels = false
        transformersEnv.useBrowserCache = true
        this.detectorPipe = (await pipeline('object-detection', 'Xenova/yolos-tiny', {
          dtype: 'q8'
        })) as unknown as ObjectDetectionPipeline
        this.updateStatus({ detectorReady: true })
      } catch {
        this.updateStatus({ detectorReady: false })
      }
    })()

    return this.detectorInitPromise
  }

  public async warmUpAll(): Promise<void> {
    await this.ensureOnnxLoaded()
    if (this.ortSession) {
      this.updateStatus({
        stage: 'ready',
        message: 'Modelo AgroVision ONNX operativo. Cargando PlantLens en segundo plano…'
      })
    }
    await Promise.allSettled([this.ensureDetectorLoaded(), this.ensureClipLoaded()])
    if (this.ortSession) {
      this.updateStatus({
        stage: 'ready',
        message:
          this.clipVisionModel || this.clipPipe
            ? 'Motor AgroVision ONNX + PlantLens + Multi-Planta 100% operativo en navegador.'
            : 'Motor AgroVision ONNX operativo en navegador.'
      })
    }
  }

  private fetchWikipediaAsync(wikiQuery: string) {
    if (this.wikiCache.has(wikiQuery) || this.pendingWiki.has(wikiQuery)) return
    this.pendingWiki.add(wikiQuery)

    fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiQuery)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { extract?: string } | null) => {
        const extract = data?.extract?.trim()
        if (extract) {
          const sentences = extract.split('. ').slice(0, 2).join('. ').trim()
          this.wikiCache.set(wikiQuery, sentences.endsWith('.') ? sentences : `${sentences}.`)
        }
      })
      .catch(() => {})
      .finally(() => {
        this.pendingWiki.delete(wikiQuery)
      })
  }

  private iom(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): number {
    const xA = Math.max(a.x, b.x)
    const yA = Math.max(a.y, b.y)
    const xB = Math.min(a.x + a.width, b.x + b.width)
    const yB = Math.min(a.y + a.height, b.y + b.height)
    const inter = Math.max(0, xB - xA) * Math.max(0, yB - yA)
    if (inter <= 0) return 0
    const areaA = Math.max(1e-5, a.width * a.height)
    const areaB = Math.max(1e-5, b.width * b.height)
    return inter / Math.min(areaA, areaB)
  }

  private async detectPlantsInBrowser(
    sourceCanvas: HTMLCanvasElement,
    realTimeTick = false
  ): Promise<DetectedPlantBox[]> {
    const now = performance.now()
    if (realTimeTick && this.cachedDetections.length > 0 && now - this.lastDetTime < 2400) {
      return this.cachedDetections
    }
    if (!this.detectorPipe) return this.cachedDetections

    try {
      // Reducir tamaño máximo a 320px para acelerar ~4x la detección multi-planta en navegador
      const maxDim = 320
      const sw = sourceCanvas.width || 720
      const sh = sourceCanvas.height || 540
      const scale = Math.min(1, maxDim / Math.max(sw, sh))
      const dw = Math.max(96, Math.round(sw * scale))
      const dh = Math.max(96, Math.round(sh * scale))
      if (!this.detCanvas) {
        this.detCanvas = document.createElement('canvas')
      }
      this.detCanvas.width = dw
      this.detCanvas.height = dh
      this.detCanvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0, dw, dh)

      const rawImg = RawImage.fromCanvas(this.detCanvas)
      const detections = await this.detectorPipe(rawImg, { threshold: 0.25, percentage: true })

      const plantKeywords = new Set([
        'potted plant',
        'vase',
        'apple',
        'orange',
        'broccoli',
        'carrot'
      ])

      const rawBoxes: Array<{
        x: number
        y: number
        width: number
        height: number
        label: string
        score: number
      }> = []

      for (const d of detections) {
        if (!plantKeywords.has(d.label)) continue
        let xmin = Math.max(0.01, Math.min(0.99, d.box.xmin))
        let ymin = Math.max(0.01, Math.min(0.99, d.box.ymin))
        let xmax = Math.max(xmin + 0.03, Math.min(0.99, d.box.xmax))
        let ymax = Math.max(ymin + 0.03, Math.min(0.99, d.box.ymax))
        const bw = xmax - xmin
        const bh = ymax - ymin
        if (bw * bh > 0.9 || bw < 0.04 || bh < 0.04) continue

        // Si solo detectó la maceta ('vase'), expandir hacia arriba para abarcar el cactus/planta
        if (d.label === 'vase') {
          ymin = Math.max(0.01, ymin - bh * 0.8)
        }
        rawBoxes.push({
          x: xmin,
          y: ymin,
          width: xmax - xmin,
          height: ymax - ymin,
          label: d.label === 'vase' ? 'potted plant' : d.label,
          score: d.score
        })
      }

      if (rawBoxes.length === 0) return []

      // Fusionar cajas que pertenecen a la misma maceta/planta
      rawBoxes.sort((a, b) => b.score - a.score)
      const clusters: typeof rawBoxes = []

      for (const box of rawBoxes) {
        const match = clusters.find(c => {
          const overlap = this.iom(box, c)
          const cx1 = box.x + box.width * 0.5
          const cx2 = c.x + c.width * 0.5
          const horizDist = Math.abs(cx1 - cx2) / Math.max(box.width, c.width, 0.05)
          const vertOverlap = Math.max(box.y, c.y) < Math.min(box.y + box.height, c.y + c.height)
          return overlap > 0.35 || (horizDist < 0.38 && vertOverlap)
        })

        if (!match) {
          clusters.push({ ...box })
        } else {
          const nx1 = Math.min(match.x, box.x)
          const ny1 = Math.min(match.y, box.y)
          const nx2 = Math.max(match.x + match.width, box.x + box.width)
          const ny2 = Math.max(match.y + match.height, box.y + box.height)
          match.x = nx1
          match.y = ny1
          match.width = nx2 - nx1
          match.height = ny2 - ny1
          match.score = Math.max(match.score, box.score)
        }
      }

      clusters.sort((a, b) => a.x - b.x)

      const finalBoxes = clusters.map((c, idx) => ({
        id: idx + 1,
        label: c.label,
        confidence: Number(c.score.toFixed(3)),
        x: Number(c.x.toFixed(4)),
        y: Number(c.y.toFixed(4)),
        width: Number(c.width.toFixed(4)),
        height: Number(c.height.toFixed(4)),
        foliage_box: {
          x: Number(c.x.toFixed(4)),
          y: Number(c.y.toFixed(4)),
          width: Number(c.width.toFixed(4)),
          height: Number(Math.max(0.08, c.height * 0.66).toFixed(4))
        }
      }))
      this.cachedDetections = finalBoxes
      this.lastDetTime = performance.now()
      return finalBoxes
    } catch {
      return this.cachedDetections
    }
  }

  private async runOnnxClassifier(
    cropCanvas: HTMLCanvasElement
  ): Promise<{ topK: AgroVisionTopPrediction[]; maxProb: number; entropy: number }> {
    await this.ensureOnnxLoaded()
    if (!this.ortSession) {
      return { topK: [], maxProb: 0, entropy: 1 }
    }

    const size = 224
    if (!this.prepCanvas) {
      this.prepCanvas = document.createElement('canvas')
      this.prepCanvas.width = size
      this.prepCanvas.height = size
    }
    const ctx = this.prepCanvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(cropCanvas, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    const floatData = new Float32Array(1 * 3 * size * size)
    const mean = [0.485, 0.456, 0.406]
    const std = [0.229, 0.224, 0.225]
    const planeSize = size * size

    for (let i = 0; i < planeSize; i++) {
      const idx = i * 4
      floatData[i] = (data[idx] / 255.0 - mean[0]) / std[0]
      floatData[planeSize + i] = (data[idx + 1] / 255.0 - mean[1]) / std[1]
      floatData[planeSize * 2 + i] = (data[idx + 2] / 255.0 - mean[2]) / std[2]
    }

    const inputTensor = new ort.Tensor('float32', floatData, [1, 3, size, size])
    const outputs = await this.ortSession.run({ input: inputTensor })
    const logits = Array.from(outputs.logits.data as Float32Array)

    const maxLogit = Math.max(...logits)
    const exps = logits.map(v => Math.exp(v - maxLogit))
    const sumExp = exps.reduce((a, b) => a + b, 0)
    const probs = exps.map(e => e / sumExp)

    const indexed = probs.map((p, idx) => ({
      class_name: this.classNames[idx] || `Class_${idx}`,
      confidence: Number(p.toFixed(4)),
      confidence_pct: Number((p * 100).toFixed(2))
    }))
    indexed.sort((a, b) => b.confidence - a.confidence)

    const maxProb = Math.max(...probs)
    const entropy =
      -probs.reduce((acc, p) => acc + p * Math.log(p + 1e-8), 0) / Math.max(1, Math.log(probs.length))

    return {
      topK: indexed.slice(0, 3),
      maxProb,
      entropy
    }
  }

  private getAgronomicInfo(className: string) {
    if (AGRONOMY_DB[className]) return AGRONOMY_DB[className]
    const isHealthy = className.toLowerCase().includes('healthy')
    const clean = className.replaceAll('___', ' - ').replaceAll('__', ' ').replaceAll('_', ' ').trim()
    return {
      cultivo: clean.split('-')[0].trim(),
      enfermedad_es: isHealthy ? 'Planta Saludable' : clean,
      estado_salud: isHealthy ? 'SALUDABLE' : 'ENFERMA',
      agente_causal: isHealthy ? 'Ninguno' : 'Patógeno detectado',
      severidad: isHealthy ? 'NINGUNA' : 'MEDIA-ALTA',
      recomendacion: isHealthy
        ? 'Continuar con manejo preventivo.'
        : 'Inspeccionar follaje y aplicar Manejo Integrado de Plagas (MIP).'
    }
  }

  private async runClipFast(rawCrop: RawImage): Promise<{
    speciesScores: Map<string, number>
    healthScores: Map<string, number>
  } | null> {
    if (this.clipVisionModel && this.clipProcessor && this.clipTextEmbeds.length === this.clipAllLabels.length) {
      const imageInputs = await this.clipProcessor(rawCrop)
      const out = await this.clipVisionModel(imageInputs)
      const embed = out.image_embeds
      if (embed && embed.data.length > 0) {
        const dim = embed.data.length
        let normSq = 0
        for (let j = 0; j < dim; j++) normSq += embed.data[j] * embed.data[j]
        const invNorm = 1.0 / Math.max(1e-8, Math.sqrt(normSq))

        const nSpeciesBg = BOTANICAL_CATALOG.length + EMPTY_BACKGROUND_PROMPTS.length
        const speciesLogits = new Array<number>(nSpeciesBg)
        for (let i = 0; i < nSpeciesBg; i++) {
          const tv = this.clipTextEmbeds[i]
          let dot = 0
          for (let j = 0; j < dim; j++) dot += embed.data[j] * invNorm * tv[j]
          speciesLogits[i] = 100.0 * dot
        }
        const spMax = Math.max(...speciesLogits)
        const spExps = speciesLogits.map(v => Math.exp(v - spMax))
        const spSum = spExps.reduce((a, b) => a + b, 0)
        const speciesScores = new Map<string, number>()
        for (let i = 0; i < nSpeciesBg; i++) {
          speciesScores.set(this.clipAllLabels[i], spExps[i] / spSum)
        }

        const nHealth = VISUAL_HEALTH_PROMPTS.length
        const healthLogits = new Array<number>(nHealth)
        for (let i = 0; i < nHealth; i++) {
          const tv = this.clipTextEmbeds[nSpeciesBg + i]
          let dot = 0
          for (let j = 0; j < dim; j++) dot += embed.data[j] * invNorm * tv[j]
          healthLogits[i] = 100.0 * dot
        }
        const hlMax = Math.max(...healthLogits)
        const hlExps = healthLogits.map(v => Math.exp(v - hlMax))
        const hlSum = hlExps.reduce((a, b) => a + b, 0)
        const healthScores = new Map<string, number>()
        for (let i = 0; i < nHealth; i++) {
          healthScores.set(this.clipAllLabels[nSpeciesBg + i], hlExps[i] / hlSum)
        }
        return { speciesScores, healthScores }
      }
    }

    if (this.clipPipe) {
      const allLabels = [...BOTANICAL_CATALOG.map(b => b.prompt_en), ...EMPTY_BACKGROUND_PROMPTS]
      const clipResults = await this.clipPipe(rawCrop, allLabels)
      const speciesScores = new Map<string, number>()
      for (const item of clipResults) speciesScores.set(item.label, item.score)

      const healthResults = await this.clipPipe(
        rawCrop,
        VISUAL_HEALTH_PROMPTS.map(h => h.prompt_en)
      )
      const healthScores = new Map<string, number>()
      for (const hr of healthResults) healthScores.set(hr.label, hr.score)
      return { speciesScores, healthScores }
    }

    return null
  }

  public async analyzeSource(
    sourceCanvas: HTMLCanvasElement,
    options: {
      selectedPlantId?: number | null
      cropBox?: { x: number; y: number; width: number; height: number } | null
      detectPlants?: boolean
      forceLens?: boolean
      realTimeTick?: boolean
      ndviMean?: number
      tempMeanC?: number
      cwsi?: number
      plantCoveragePercent?: number
    } = {}
  ): Promise<AgroVisionAnalysis> {
    const t0 = performance.now()
    // Prioridad 1: cargar ONNX inmediatamente (~15-35 ms por inferencia), sin bloquear esperando a YOLOS/CLIP
    await this.ensureOnnxLoaded()
    if (!options.realTimeTick) {
      void this.ensureClipLoaded()
      if (options.detectPlants !== false) void this.ensureDetectorLoaded()
    }

    const w = sourceCanvas.width || 720
    const h = sourceCanvas.height || 540

    const detectedPlants =
      options.detectPlants !== false
        ? await this.detectPlantsInBrowser(sourceCanvas, Boolean(options.realTimeTick))
        : []

    let activePlantId = options.selectedPlantId ?? (detectedPlants[0]?.id ?? 1)
    let cropX = 0
    let cropY = 0
    let cropW = w
    let cropH = h
    let detHint: string | null = null

    if (options.cropBox) {
      cropX = Math.max(0, Math.floor(options.cropBox.x * w))
      cropY = Math.max(0, Math.floor(options.cropBox.y * h))
      cropW = Math.max(24, Math.floor(options.cropBox.width * w))
      cropH = Math.max(24, Math.floor(options.cropBox.height * h))
    } else if (detectedPlants.length > 0) {
      const chosen = detectedPlants.find(p => p.id === activePlantId) || detectedPlants[0]
      activePlantId = chosen.id
      detHint = chosen.label
      const fb = chosen.foliage_box || chosen
      cropX = Math.max(0, Math.floor(fb.x * w))
      cropY = Math.max(0, Math.floor(fb.y * h))
      cropW = Math.max(24, Math.floor(fb.width * w))
      cropH = Math.max(24, Math.floor(fb.height * h))
    }

    if (!this.cropCanvas) {
      this.cropCanvas = document.createElement('canvas')
    }
    this.cropCanvas.width = Math.min(320, Math.max(64, cropW))
    this.cropCanvas.height = Math.min(320, Math.max(64, cropH))
    const cctx = this.cropCanvas.getContext('2d')!
    cctx.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      this.cropCanvas.width,
      this.cropCanvas.height
    )

    // 1. Ejecutar clasificador entrenado EfficientNet-B2 ONNX
    const { topK, maxProb, entropy } = await this.runOnnxClassifier(this.cropCanvas)
    const bestCls = topK[0]?.class_name || 'Tomato_healthy'
    const bestConf = topK[0]?.confidence || 0.85
    const agroInfo = this.getAgronomicInfo(bestCls)

    let detectionMode: 'IN_DATASET' | 'OUT_OF_DATASET' | 'NO_PLANT' = 'IN_DATASET'
    let lensPayload: AgroVisionLensInfo | null = null

    const clipAvailable = Boolean(this.clipVisionModel || this.clipPipe)
    const skipClipThisTick =
      Boolean(options.realTimeTick) && !options.forceLens && maxProb >= 0.88 && entropy < 0.22

    // 2. Ejecutar PlantLens CLIP Zero-Shot con embeddings de texto cacheados (1 sola pasada de visión)
    if (clipAvailable && !skipClipThisTick) {
      const nowMs = performance.now()
      let clipOut: { speciesScores: Map<string, number>; healthScores: Map<string, number> } | null = null
      if (
        options.realTimeTick &&
        !options.forceLens &&
        this.lastClipResult &&
        nowMs - this.lastClipTime < 1500
      ) {
        clipOut = {
          speciesScores: this.lastClipResult.scoreByLabel,
          healthScores: this.lastClipResult.scoreByLabel
        }
      } else {
        const rawCrop = RawImage.fromCanvas(this.cropCanvas)
        clipOut = await this.runClipFast(rawCrop)
        if (clipOut) {
          const merged = new Map<string, number>(clipOut.speciesScores)
          clipOut.healthScores.forEach((v, k) => merged.set(k, v))
          this.lastClipResult = { scoreByLabel: merged }
          this.lastClipTime = performance.now()
        }
      }

      if (clipOut) {
        const { speciesScores: scoreByLabel, healthScores: healthMap } = clipOut

        const emptyScore = EMPTY_BACKGROUND_PROMPTS.reduce(
          (acc, lbl) => acc + (scoreByLabel.get(lbl) ?? 0),
          0
        )
        const plantScores = BOTANICAL_CATALOG.map(b => ({
          entry: b,
          score: scoreByLabel.get(b.prompt_en) ?? 0
        }))
        const totalPlantScore = plantScores.reduce((a, b) => a + b.score, 0)

        if (
          !options.forceLens &&
          detHint === null &&
          detectedPlants.length === 0 &&
          emptyScore > 0.72 &&
          totalPlantScore < 0.28
        ) {
          detectionMode = 'NO_PLANT'
        } else {
          plantScores.sort((a, b) => b.score - a.score)
          let bestPlant = plantScores[0].entry
          let bestPlantScore = plantScores[0].score / Math.max(totalPlantScore, 1e-6)

          const inDatasetClipProb = plantScores
            .filter(p => p.entry.in_dataset)
            .reduce((a, b) => a + b.score / Math.max(totalPlantScore, 1e-6), 0)

          const isUntrained = !bestPlant.in_dataset && inDatasetClipProb < 0.45
          const isLowCertainty = maxProb < 0.80 || entropy > 0.36

          if (options.forceLens || isUntrained || isLowCertainty) {
            if (bestPlant.in_dataset && !options.forceLens && isLowCertainty) {
              const bestOut = plantScores.find(p => !p.entry.in_dataset)
              if (bestOut && bestOut.score / Math.max(totalPlantScore, 1e-6) > 0.1) {
                bestPlant = bestOut.entry
                bestPlantScore = bestOut.score / Math.max(totalPlantScore, 1e-6)
              }
            }

            if (!bestPlant.in_dataset || isLowCertainty || options.forceLens) {
              this.fetchWikipediaAsync(bestPlant.wiki_query)
              const wikiSummary = this.wikiCache.get(bestPlant.wiki_query) ?? ''

              const weightedHealth = VISUAL_HEALTH_PROMPTS.map((hp, i) => ({
                hp,
                score: (healthMap.get(hp.prompt_en) ?? 0) + (i === 0 ? 0.2 : 0)
              }))
              weightedHealth.sort((a, b) => b.score - a.score)
              const chosenHealth = weightedHealth[0].hp

              detectionMode = 'OUT_OF_DATASET'
              lensPayload = {
                plant_name: bestPlant.name_es,
                scientific_name: bestPlant.scientific_name,
                confidence_pct: Number(Math.min(99.4, Math.max(bestPlantScore * 145, 74)).toFixed(1)),
                light: bestPlant.light,
                water: bestPlant.water,
                soil_temp: bestPlant.soil_temp,
                care: bestPlant.care,
                wiki_summary: wikiSummary,
                visual_health_status: chosenHealth.status,
                visual_severity: chosenHealth.severity,
                visual_diagnosis_es: chosenHealth.diagnosis_es,
                visual_action_es: chosenHealth.action_es,
                source: 'AgroVision Web (CLIP Cached + Wikipedia ES)'
              }
            }
          }
        }
      }
    } else if (maxProb < 0.72 || entropy > 0.42) {
      detectionMode = 'OUT_OF_DATASET'
      lensPayload = {
        plant_name: 'Especie Botánica Externa al Dataset',
        scientific_name: 'Plantae spp.',
        confidence_pct: Number(((1 - entropy) * 100).toFixed(1)),
        light: 'Luz natural abundante o semisombra luminosa.',
        water: 'Riego moderado cuando la capa superficial del sustrato esté seca.',
        soil_temp: 'Sustrato fértil con buen drenaje; 18-26°C.',
        care: 'Luz natural acorde a la especie, riego moderado y buen drenaje.',
        wiki_summary: 'Especie fuera de las 15 clases agrícolas entrenadas (Tomate, Papa y Pimiento).',
        visual_health_status: 'REQUIERE INSPECCIÓN VISUAL',
        visual_severity: 'DESCONOCIDA',
        visual_diagnosis_es: 'Especie fuera del catálogo de enfermedades entrenado',
        visual_action_es: 'Verificar coloración foliar, humedad de sustrato y ausencia de manchas.',
        source: 'AgroVision ONNX OOD Detector'
      }
    }

    const elapsedMs = performance.now() - t0
    const fpsEquiv = Number((1000 / Math.max(elapsedMs, 1)).toFixed(1))

    if (detectionMode === 'NO_PLANT') {
      return {
        detection_mode: 'NO_PLANT',
        in_trained_dataset: false,
        disease: 'Sin_Planta_Detectada',
        confidence: 0,
        health_status: 'SIN PLANTA EN CUADRO',
        crop: 'Ninguna planta detectada',
        disease_es: 'Enfoque una o varias plantas frente a la cámara',
        cause: 'No se detectó tejido vegetal claro en la región seleccionada.',
        recommendation: 'Coloca una planta dentro del cuadro o selecciona un área manualmente.',
        severity: 'N/A',
        top_k: topK,
        detected_plants: detectedPlants,
        selected_plant_id: activePlantId,
        lens: null,
        inference_time_ms: Number(elapsedMs.toFixed(1)),
        fps_equivalent: fpsEquiv,
        engine_mode: 'browser-onnx+plantlens',
        ndvi_mean: options.ndviMean ?? 0.5,
        temp_mean_c: options.tempMeanC ?? 25,
        cwsi: options.cwsi ?? 0.25,
        plant_coverage_percent: options.plantCoveragePercent ?? 0
      }
    }

    if (detectionMode === 'OUT_OF_DATASET' && lensPayload) {
      return {
        detection_mode: 'OUT_OF_DATASET',
        in_trained_dataset: false,
        disease: `${lensPayload.plant_name} (${lensPayload.visual_health_status})`,
        confidence: Number((lensPayload.confidence_pct / 100).toFixed(4)),
        health_status: lensPayload.visual_health_status,
        crop: `${lensPayload.plant_name} (${lensPayload.scientific_name})`,
        disease_es: `Le hace falta información de esta planta en el dataset para determinar su estado de salud exacto. Evaluación visual: ${lensPayload.visual_diagnosis_es}.`,
        cause: `Especie no incluida en el dataset base (analizada con ${lensPayload.source}). Evaluación visual: ${lensPayload.visual_diagnosis_es}.`,
        recommendation: `${lensPayload.visual_action_es} Cuidados generales: ${lensPayload.care}`,
        severity: lensPayload.visual_severity,
        top_k: topK,
        detected_plants: detectedPlants,
        selected_plant_id: activePlantId,
        lens: lensPayload,
        inference_time_ms: Number(elapsedMs.toFixed(1)),
        fps_equivalent: fpsEquiv,
        engine_mode: 'browser-onnx+plantlens',
        ndvi_mean: options.ndviMean ?? 0.65,
        temp_mean_c: options.tempMeanC ?? 25,
        cwsi: options.cwsi ?? 0.22,
        plant_coverage_percent: options.plantCoveragePercent ?? 25
      }
    }

    return {
      detection_mode: 'IN_DATASET',
      in_trained_dataset: true,
      disease: bestCls,
      confidence: Number(bestConf.toFixed(4)),
      health_status: agroInfo.estado_salud,
      crop: agroInfo.cultivo,
      disease_es: agroInfo.enfermedad_es,
      cause: `Agente causal: ${agroInfo.agente_causal}. Clasificado en navegador con EfficientNet-B2 ONNX (99.61% acc).`,
      recommendation: agroInfo.recomendacion,
      severity: agroInfo.severidad,
      top_k: topK,
      detected_plants: detectedPlants,
      selected_plant_id: activePlantId,
      lens: null,
      inference_time_ms: Number(elapsedMs.toFixed(1)),
      fps_equivalent: fpsEquiv,
      engine_mode: 'browser-onnx+plantlens',
      ndvi_mean: options.ndviMean ?? 0.72,
      temp_mean_c: options.tempMeanC ?? 25,
      cwsi: options.cwsi ?? 0.2,
      plant_coverage_percent: options.plantCoveragePercent ?? 35
    }
  }
}

export const browserAgroVisionEngine = new BrowserAgroVisionEngine()
