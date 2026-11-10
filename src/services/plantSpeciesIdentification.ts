export type PlantCategoryType =
  | 'Hortaliza / Cultivo Hortícola'
  | 'Cereal / Gramínea Agrícola'
  | 'Árbol o Arbusto Frutal'
  | 'Leguminosa Agrícola'
  | 'Planta Ornamental de Interior / Tropical'
  | 'Suculenta / Cactácea'
  | 'Planta Aromática / Medicinal'
  | 'Planta Ornamental con Flor'
  | 'Helecho / Pteridofita'
  | ' Especie Forestal / Leñosa'

export interface BotanicalCandidate {
  id: string
  commonName: string
  scientificName: string
  plantType: string
  family: string
  confidence: number
  leafMorphology: string
  growthHabit: string
  idealNdviRange: [number, number]
  idealTempRangeC: [number, number]
  waterDemand: 'Baja' | 'Media' | 'Alta'
  summary: string
  wikipediaTitle?: string
  thumbnailUrl?: string
}

export interface PlantSpeciesIdentificationResult {
  identifiedAt: string
  source: 'google-lens-sync' | 'backend-ai' | 'vision-morphology-inaturalist'
  primary: BotanicalCandidate
  alternatives: BotanicalCandidate[]
  visualTraits: {
    canopyShape: string
    foliageTone: string
    leafComplexity: string
    floralOrFruitDetected: boolean
    aspectRatio: number
  }
  googleLensReady: boolean
}

interface SpeciesProfileTemplate {
  id: string
  commonName: string
  scientificName: string
  plantType: string
  family: string
  keywords: string[]
  cropPrefix?: string
  leafMorphology: string
  growthHabit: string
  idealNdviRange: [number, number]
  idealTempRangeC: [number, number]
  waterDemand: 'Baja' | 'Media' | 'Alta'
  summary: string
  wikipediaTitle: string
  /** Visual prototype vector: [aspectRatio, solidity, lobation, deepGreen, blueGreen, warmPigment] */
  visualSignature: [number, number, number, number, number, number]
}

const BOTANICAL_DATABASE: SpeciesProfileTemplate[] = [
  {
    id: 'solanum_lycopersicum',
    commonName: 'Tomate / Jitomate',
    scientificName: 'Solanum lycopersicum',
    plantType: 'Hortaliza Fruto (Solanácea)',
    family: 'Solanaceae',
    keywords: ['tomato', 'tomate', 'jitomate', 'solanum', 'lycopersicum', 'cherry'],
    cropPrefix: 'Tomato',
    leafMorphology: 'Hoja compuesta imparipinnada con foliolos lobulados y borde dentado glandular',
    growthHabit: 'Herbácea perenne cultivada como anual, porte erecto o guiado',
    idealNdviRange: [0.72, 0.88],
    idealTempRangeC: [20, 27],
    waterDemand: 'Alta',
    summary:
      'Cultivo hortícola de alto valor agronómico. Presenta hojas compuestas muy recortadas con tricomas glandulares aromáticos y alta sensibilidad a déficit hídrico y tizones.',
    wikipediaTitle: 'Solanum_lycopersicum',
    visualSignature: [1.1, 0.54, 0.78, 0.65, 0.15, 0.35]
  },
  {
    id: 'zea_mays',
    commonName: 'Maíz',
    scientificName: 'Zea mays',
    plantType: 'Cereal / Gramínea C4',
    family: 'Poaceae',
    keywords: ['corn', 'maize', 'maiz', 'elote', 'zea', 'mays', 'milpa'],
    cropPrefix: 'Corn_(maize)',
    leafMorphology: 'Lámina foliar larga, lanceolada y acintada con nervadura paralelinervia prominente',
    growthHabit: 'Gramínea anual robusta de tallo erecto (caña) y alta eficiencia fotosintética C4',
    idealNdviRange: [0.75, 0.91],
    idealTempRangeC: [22, 30],
    waterDemand: 'Media',
    summary:
      'Cereal estratégico de porte alto y hojas lanceoladas envolventes. Su vigor clorofílico (NDVI) responde rápidamente a la disponibilidad de nitrógeno y humedad edáfica.',
    wikipediaTitle: 'Zea_mays',
    visualSignature: [1.55, 0.42, 0.65, 0.72, 0.2, 0.05]
  },
  {
    id: 'capsicum_annuum',
    commonName: 'Chile / Pimiento Morrón',
    scientificName: 'Capsicum annuum',
    plantType: 'Hortaliza Fruto (Solanácea)',
    family: 'Solanaceae',
    keywords: ['pepper', 'bell', 'chile', 'pimiento', 'morron', 'jalapeno', 'serrano', 'capsicum', 'habanero'],
    cropPrefix: 'Pepper,_bell',
    leafMorphology: 'Hoja simple, alterna, ovada a lanceolada de margen entero y cutícula brillante',
    growthHabit: 'Planta herbácea o subarbustiva ramificada de dosel compacto a medio',
    idealNdviRange: [0.7, 0.86],
    idealTempRangeC: [21, 28],
    waterDemand: 'Media',
    summary:
      'Especie hortícola de hojas simples glabras y brillantes. Requiere buen drenaje radicular para evitar asfixia y ataques de Phytophthora.',
    wikipediaTitle: 'Capsicum_annuum',
    visualSignature: [1.05, 0.68, 0.38, 0.75, 0.12, 0.25]
  },
  {
    id: 'solanum_tuberosum',
    commonName: 'Papa / Patata',
    scientificName: 'Solanum tuberosum',
    plantType: 'Tubérculo Hortícola (Solanácea)',
    family: 'Solanaceae',
    keywords: ['potato', 'papa', 'patata', 'tuberosum'],
    cropPrefix: 'Potato',
    leafMorphology: 'Hoja compuesta pinnada con foliolos ovalados opuestos y foliolillos intercalares',
    growthHabit: 'Herbácea tuberosa de cobertura foliar densa y porte medio-bajo',
    idealNdviRange: [0.72, 0.87],
    idealTempRangeC: [16, 23],
    waterDemand: 'Alta',
    summary:
      'Cultivo tuberoso de dosel frondoso. Su temperatura foliar y el índice NDVI permiten detectar tempranamente tizón tardío (Phytophthora infestans) y estrés hídrico.',
    wikipediaTitle: 'Solanum_tuberosum',
    visualSignature: [0.92, 0.72, 0.52, 0.7, 0.18, 0.04]
  },
  {
    id: 'fragaria_ananassa',
    commonName: 'Fresa / Frutilla',
    scientificName: 'Fragaria × ananassa',
    plantType: 'Frutal de Baya / Rosácea Herbácea',
    family: 'Rosaceae',
    keywords: ['strawberry', 'fresa', 'frutilla', 'fragaria'],
    cropPrefix: 'Strawberry',
    leafMorphology: 'Hoja trifoliada con bordes gruesamente aserrados y pecíolo pubescente',
    growthHabit: 'Planta herbácea rastrera en roseta basal con emisión de estolones',
    idealNdviRange: [0.68, 0.84],
    idealTempRangeC: [17, 24],
    waterDemand: 'Alta',
    summary:
      'Cultivo de baya caracterizado por hojas trifoliadas aserradas. Muy sensible a salinidad, déficit hídrico superficial y araña roja.',
    wikipediaTitle: 'Fragaria_×_ananassa',
    visualSignature: [0.85, 0.74, 0.62, 0.68, 0.1, 0.32]
  },
  {
    id: 'vitis_vinifera',
    commonName: 'Vid / Planta de Uva',
    scientificName: 'Vitis vinifera',
    plantType: 'Frutal Leñoso Trepador (Vitácea)',
    family: 'Vitaceae',
    keywords: ['grape', 'uva', 'vid', 'vinedo', 'vitis', 'parra'],
    cropPrefix: 'Grape',
    leafMorphology: 'Hoja palmatilobada (3 a 5 lóbulos marcados), base cordada y margen dentado',
    growthHabit: 'Liana o arbusto trepador con zarcillos opuestos a las hojas',
    idealNdviRange: [0.65, 0.82],
    idealTempRangeC: [20, 29],
    waterDemand: 'Baja',
    summary:
      'Cultivo frutal y vitivinícola de hojas palmeadas lobuladas. La termografía infrarroja (CWSI) es el estándar de oro para manejar el riego deficitario controlado en viñedos.',
    wikipediaTitle: 'Vitis_vinifera',
    visualSignature: [0.98, 0.61, 0.74, 0.64, 0.14, 0.08]
  },
  {
    id: 'malus_domestica',
    commonName: 'Manzano',
    scientificName: 'Malus domestica',
    plantType: 'Árbol Frutal Caducifolio (Rosácea)',
    family: 'Rosaceae',
    keywords: ['apple', 'manzana', 'manzano', 'malus'],
    cropPrefix: 'Apple',
    leafMorphology: 'Hoja simple ovalada, ápice acuminado, borde aserrado y envés tomentoso',
    growthHabit: 'Árbol frutal de copa globosa y ramificación leñosa',
    idealNdviRange: [0.7, 0.85],
    idealTempRangeC: [18, 25],
    waterDemand: 'Media',
    summary:
      'Frutal de clima templado con hojas ovales aserradas. Requiere vigilancia fitosanitaria frente a roña del manzano (Venturia inaequalis) y roya.',
    wikipediaTitle: 'Malus_domestica',
    visualSignature: [1.08, 0.7, 0.44, 0.69, 0.16, 0.18]
  },
  {
    id: 'citrus_sinensis',
    commonName: 'Naranjo / Cítrico',
    scientificName: 'Citrus × sinensis',
    plantType: 'Árbol Frutal Perennifolio (Rutácea)',
    family: 'Rutaceae',
    keywords: ['orange', 'citrus', 'naranja', 'naranjo', 'limon', 'limonero', 'mandarina', 'citrico'],
    cropPrefix: 'Orange',
    leafMorphology: 'Hoja simple coriácea, elíptica, verde oscuro lustroso con pecíolo ligeramente alado',
    growthHabit: 'Árbol perennifolio de copa densa y redondeada con glándulas de aceite esencial',
    idealNdviRange: [0.74, 0.89],
    idealTempRangeC: [21, 29],
    waterDemand: 'Media',
    summary:
      'Árbol cítrico de follaje perenne y cutícula cerosa brillante. El monitoreo multiespectral detecta clorosis asimétrica (HLB / Dragón Amarillo) y carencias de micronutrientes.',
    wikipediaTitle: 'Citrus_×_sinensis',
    visualSignature: [1.02, 0.76, 0.32, 0.82, 0.12, 0.2]
  },
  {
    id: 'glycine_max',
    commonName: 'Soja / Soya',
    scientificName: 'Glycine max',
    plantType: 'Leguminosa Oleaginosa',
    family: 'Fabaceae',
    keywords: ['soybean', 'soja', 'soya', 'glycine', 'frijol', 'haba', 'leguminosa'],
    cropPrefix: 'Soybean',
    leafMorphology: 'Hoja trifoliada con foliolos ovales enteros y pubescencia fina en haz y envés',
    growthHabit: 'Herbácea anual erecta fijadora de nitrógeno atmosférico en simbiosis radicular',
    idealNdviRange: [0.73, 0.89],
    idealTempRangeC: [20, 28],
    waterDemand: 'Media',
    summary:
      'Leguminosa de alto contenido proteico con hojas trifoliadas. Su cierre de surco genera valores altos de NDVI (>0.80) durante la floración y llenado de vaina.',
    wikipediaTitle: 'Glycine_max',
    visualSignature: [0.95, 0.75, 0.42, 0.74, 0.14, 0.03]
  },
  {
    id: 'cucurbita_pepo',
    commonName: 'Calabaza / Calabacín',
    scientificName: 'Cucurbita pepo',
    plantType: 'Hortaliza Cucurbitácea',
    family: 'Cucurbitaceae',
    keywords: ['squash', 'calabaza', 'calabacin', 'zucchini', 'cucurbita', 'pepino', 'melon', 'sandia'],
    cropPrefix: 'Squash',
    leafMorphology: 'Hoja grande anchamente cordada y palmatilobada con pubescencia áspera',
    growthHabit: 'Planta herbácea rastrera o de mata con grandes láminas foliares',
    idealNdviRange: [0.7, 0.86],
    idealTempRangeC: [20, 28],
    waterDemand: 'Alta',
    summary:
      'Cucurbitácea de grandes hojas lobuladas que transpiran intensamente; excelente bioindicador térmico y frecuente hospedero de cenicilla (oídio).',
    wikipediaTitle: 'Cucurbita_pepo',
    visualSignature: [0.88, 0.79, 0.55, 0.71, 0.15, 0.12]
  },
  {
    id: 'prunus_persica',
    commonName: 'Duraznero / Melocotonero',
    scientificName: 'Prunus persica',
    plantType: 'Árbol Frutal de Hueso (Rosácea)',
    family: 'Rosaceae',
    keywords: ['peach', 'durazno', 'melocoton', 'prunus', 'cerezo', 'cherry'],
    cropPrefix: 'Peach',
    leafMorphology: 'Hoja simple, oblongo-lanceolada, estrecha, ligeramente arqueada y borde finamente aserrado',
    growthHabit: 'Árbol caducifolio de porte medio y hojas alargadas características',
    idealNdviRange: [0.69, 0.85],
    idealTempRangeC: [18, 26],
    waterDemand: 'Media',
    summary:
      'Frutal de carozo con hojas lanceoladas estrechas y arqueadas. Sensible a bacteriosis foliar y torque de la hoja (Taphrina deformans).',
    wikipediaTitle: 'Prunus_persica',
    visualSignature: [1.32, 0.58, 0.48, 0.73, 0.14, 0.1]
  },
  {
    id: 'monstera_deliciosa',
    commonName: 'Monstera / Costilla de Adán',
    scientificName: 'Monstera deliciosa',
    plantType: 'Planta Ornamental Tropical (Arácea)',
    family: 'Araceae',
    keywords: ['monstera', 'costilla', 'adan', 'filodendro', 'philodendron', 'tropical'],
    leafMorphology: 'Lámina foliar grande, cordada, coriácea y profundamente fenestrada (hendiduras laterales)',
    growthHabit: 'Hemiepífita trepadora tropical de follaje perenne lustroso',
    idealNdviRange: [0.74, 0.89],
    idealTempRangeC: [19, 27],
    waterDemand: 'Media',
    summary:
      'Planta tropical icónica por sus hojas perforadas (fenestradas) que optimizan la captación lumínica y el paso del viento y la lluvia en el dosel.',
    wikipediaTitle: 'Monstera_deliciosa',
    visualSignature: [1.04, 0.51, 0.88, 0.8, 0.15, 0.02]
  },
  {
    id: 'epipremnum_aureum',
    commonName: 'Pothos / Teléfono / Potus',
    scientificName: 'Epipremnum aureum',
    plantType: 'Planta Ornamental Trepadora (Arácea)',
    family: 'Araceae',
    keywords: ['pothos', 'potus', 'telefono', 'epipremnum', 'hiedra', 'interior'],
    leafMorphology: 'Hoja acorazonada (cordiforme) de ápice agudo, cutícula cerosa y frecuente variegación amarilla/crema',
    growthHabit: 'Trepadora o colgante perenne de rápido crecimiento vegetativo',
    idealNdviRange: [0.66, 0.84],
    idealTempRangeC: [18, 26],
    waterDemand: 'Media',
    summary:
      'Arácea ornamental de hojas acorazonadas muy resistente. Su índice térmico foliar refleja con gran sensibilidad el exceso de riego (pudrición radicular).',
    wikipediaTitle: 'Epipremnum_aureum',
    visualSignature: [1.0, 0.72, 0.4, 0.65, 0.1, 0.22]
  },
  {
    id: 'echeveria_elegans',
    commonName: 'Echeveria / Suculenta Rosa de Alabastro',
    scientificName: 'Echeveria elegans',
    plantType: 'Planta Suculenta / Crasulácea (CAM)',
    family: 'Crassulaceae',
    keywords: ['suculenta', 'succulent', 'echeveria', 'crasulacea', 'aloe', 'sabila', 'agave', 'cactus', 'sedum'],
    leafMorphology: 'Hojas carnosas espatuladas dispuestas en roseta simétrica compacta con pruina glauca azul-verdosa',
    growthHabit: 'Herbácea perenne suculenta acaule con metabolismo ácido de las crasuláceas (CAM)',
    idealNdviRange: [0.52, 0.74],
    idealTempRangeC: [18, 28],
    waterDemand: 'Baja',
    summary:
      'Suculenta mexicana de hojas carnosas reservantes de agua. Presenta apertura estomática nocturna (metabolismo CAM) y alta vulnerabilidad a la sobrehidratación.',
    wikipediaTitle: 'Echeveria_elegans',
    visualSignature: [0.94, 0.82, 0.35, 0.48, 0.58, 0.08]
  },
  {
    id: 'dracaena_trifasciata',
    commonName: 'Sansevieria / Lengua de Suegra',
    scientificName: 'Dracaena trifasciata',
    plantType: 'Planta Suculenta Rizomatosa / Ornamental',
    family: 'Asparagaceae',
    keywords: ['sansevieria', 'lengua', 'suegra', 'espada', 'dracaena', 'snake'],
    leafMorphology: 'Hojas ensiformes (en forma de espada) rígidas, erectas, suculentas con bandas transversales y margen amarillo',
    growthHabit: 'Herbácea perenne rizomatosa de hojas verticales arquitectónicas',
    idealNdviRange: [0.58, 0.78],
    idealTempRangeC: [18, 29],
    waterDemand: 'Baja',
    summary:
      'Especie de hojas verticales coriáceas con metabolismo CAM. Sumamente tolerante a la sequía pero sensible al encharcamiento basal.',
    wikipediaTitle: 'Dracaena_trifasciata',
    visualSignature: [1.68, 0.56, 0.45, 0.62, 0.28, 0.14]
  },
  {
    id: 'rosa_chinensis',
    commonName: 'Rosal / Rosa',
    scientificName: 'Rosa spp.',
    plantType: 'Planta Ornamental con Flor / Arbusto Rosáceo',
    family: 'Rosaceae',
    keywords: ['rosa', 'rosal', 'rose', 'flor', 'flower', 'hibisco', 'geranio', 'bugambilia'],
    leafMorphology: 'Hoja compuesta imparipinnada (5 a 7 foliolos ovales con margen finamente aserrado)',
    growthHabit: 'Arbusto leñoso espinoso de floración ornamental continua',
    idealNdviRange: [0.68, 0.85],
    idealTempRangeC: [17, 25],
    waterDemand: 'Media',
    summary:
      'Arbusto ornamental de hojas pinnadas aserradas. Requiere monitoreo constante frente a mancha negra (Diplocarpon rosae), oídio y pulgones en brotes tiernos.',
    wikipediaTitle: 'Rosa',
    visualSignature: [1.06, 0.64, 0.58, 0.62, 0.14, 0.48]
  },
  {
    id: 'ocimum_basilicum',
    commonName: 'Albahaca / Hierba Aromática',
    scientificName: 'Ocimum basilicum',
    plantType: 'Planta Aromática y Culinaria (Lamiácea)',
    family: 'Lamiaceae',
    keywords: ['albahaca', 'basil', 'ocimum', 'menta', 'hierbabuena', 'romero', 'oregano', 'aromatica'],
    leafMorphology: 'Hojas opuestas, simples, ovadas, ligeramente abombadas (cuculadas), de color verde tierno lustroso',
    growthHabit: 'Herbácea anual aromática de tallo cuadrangular y ramificación densa',
    idealNdviRange: [0.74, 0.89],
    idealTempRangeC: [20, 27],
    waterDemand: 'Alta',
    summary:
      'Lamiácea aromática de hojas tiernas ricas en aceites esenciales (linalol y eugenol). Muestra caída inmediata de turgencia y aumento térmico ante falta de humedad.',
    wikipediaTitle: 'Ocimum_basilicum',
    visualSignature: [1.02, 0.77, 0.36, 0.84, 0.1, 0.04]
  },
  {
    id: 'persea_americana',
    commonName: 'Aguacate / Palto',
    scientificName: 'Persea americana',
    plantType: 'Árbol Frutal Subtropical (Laurácea)',
    family: 'Lauraceae',
    keywords: ['aguacate', 'avocado', 'palta', 'palto', 'persea', 'mango', 'ficus'],
    leafMorphology: 'Hoja simple alterna, elíptica a oblongo-lanceolada, coriácea, borde entero y nervadura pinnada clara',
    growthHabit: 'Árbol perennifolio frondoso de sistema radicular superficial muy sensible a la hipoxia',
    idealNdviRange: [0.73, 0.88],
    idealTempRangeC: [19, 27],
    waterDemand: 'Media',
    summary:
      'Frutal lauráceo de alto valor comercial. Sus raíces carecen de pelos absorbentes abundantes, por lo que la sobrehidratación favorece rápidamente a Phytophthora cinnamomi.',
    wikipediaTitle: 'Persea_americana',
    visualSignature: [1.22, 0.71, 0.34, 0.78, 0.16, 0.05]
  },
  {
    id: 'coffea_arabica',
    commonName: 'Cafeto / Planta de Café',
    scientificName: 'Coffea arabica',
    plantType: 'Arbusto Agrícola Tropical (Rubiácea)',
    family: 'Rubiaceae',
    keywords: ['cafe', 'cafeto', 'coffee', 'coffea', 'arabica', 'cacao'],
    leafMorphology: 'Hojas opuestas, elípticas, acuminadas, de margen ondulado y cutícula verde oscuro muy brillante',
    growthHabit: 'Arbusto perennifolio de sotobosque tropical con ramas plagiotrópicas',
    idealNdviRange: [0.75, 0.9],
    idealTempRangeC: [18, 24],
    waterDemand: 'Media',
    summary:
      'Cultivo tropical rubiáceo. El análisis multiespectral permite identificar focos tempranos de roya del cafeto (Hemileia vastatrix) antes de la defoliación severa.',
    wikipediaTitle: 'Coffea_arabica',
    visualSignature: [1.15, 0.74, 0.41, 0.83, 0.12, 0.12]
  },
  {
    id: 'nephrolepis_exaltata',
    commonName: 'Helecho Espada / Helecho de Boston',
    scientificName: 'Nephrolepis exaltata',
    plantType: 'Helecho / Pteridofita Ornamental',
    family: 'Nephrolepidaceae',
    keywords: ['helecho', 'fern', 'nephrolepis', 'fronda', 'palma', 'areca'],
    leafMorphology: 'Frondas largas arqueadas y pinnadas con numerosos pinnas (foliolos) alternos de borde crenado',
    growthHabit: 'Pteridofita perenne rizomatosa sin flores ni semillas (reproducción por esporas)',
    idealNdviRange: [0.71, 0.87],
    idealTempRangeC: [18, 24],
    waterDemand: 'Alta',
    summary:
      'Planta vascular de frondas finamente divididas que requiere alta humedad relativa ambiental e iluminación indirecta para evitar necrosis marginal.',
    wikipediaTitle: 'Nephrolepis_exaltata',
    visualSignature: [0.96, 0.48, 0.85, 0.76, 0.14, 0.03]
  }
]

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/**
 * Extracts a clean RGB image from a video, image, or canvas and submits it directly
 * to Google Lens (`https://lens.google.com/v3/upload?hl=es`) via a browser multipart form POST.
 */
export async function submitImageToGoogleLens(
  source: File | Blob | HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<boolean> {
  let fileToUpload: File

  if (source instanceof File) {
    fileToUpload = source
  } else if (source instanceof Blob) {
    fileToUpload = new File([source], `agronia-planta-${Date.now()}.jpg`, {
      type: source.type || 'image/jpeg'
    })
  } else {
    // Render clean RGB frame from HTMLVideoElement, HTMLImageElement, or HTMLCanvasElement
    const tempCanvas = document.createElement('canvas')
    const srcW =
      source instanceof HTMLVideoElement
        ? source.videoWidth || 960
        : source instanceof HTMLImageElement
          ? source.naturalWidth || source.width || 960
          : source.width || 960
    const srcH =
      source instanceof HTMLVideoElement
        ? source.videoHeight || 600
        : source instanceof HTMLImageElement
          ? source.naturalHeight || source.height || 600
          : source.height || 600

    const maxDim = 1024
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH, 1))
    tempCanvas.width = Math.max(320, Math.round(srcW * scale))
    tempCanvas.height = Math.max(240, Math.round(srcH * scale))

    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(source, 0, 0, tempCanvas.width, tempCanvas.height)

    const blob = await new Promise<Blob | null>(resolve =>
      tempCanvas.toBlob(resolve, 'image/jpeg', 0.92)
    )
    if (!blob) return false
    fileToUpload = new File([blob], `agronia-lens-${Date.now()}.jpg`, { type: 'image/jpeg' })
  }

  try {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(fileToUpload)

    const form = document.createElement('form')
    form.method = 'POST'
    form.enctype = 'multipart/form-data'
    form.action = `https://lens.google.com/v3/upload?hl=es&re=df&st=${Date.now()}`
    form.target = '_blank'
    form.style.display = 'none'

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.name = 'encoded_image'
    fileInput.files = dataTransfer.files
    form.appendChild(fileInput)

    document.body.appendChild(form)
    form.submit()

    window.setTimeout(() => {
      form.remove()
    }, 1500)
    return true
  } catch {
    window.open('https://lens.google.com/', '_blank', 'noopener')
    return false
  }
}

/**
 * Queries the public iNaturalist Taxon API + Spanish Wikipedia REST API (both open CORS, no key required)
 * to enrich or search any plant species by name or scientific taxon.
 */
export async function searchBotanicalTaxonOnline(
  query: string
): Promise<BotanicalCandidate | null> {
  const cleanQuery = query.trim()
  if (!cleanQuery) return null

  try {
    // 1. Search iNaturalist plant taxa (iconic_taxa=Plantae, locale=es)
    const inatUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(cleanQuery)}&iconic_taxa=Plantae&locale=es&per_page=3`
    const inatResponse = await fetch(inatUrl)
    if (inatResponse.ok) {
      const inatData = (await inatResponse.json()) as {
        results?: Array<{
          id: number
          name: string
          preferred_common_name?: string
          rank?: string
          iconic_taxon_name?: string
          ancestors?: Array<{ rank: string; name: string; preferred_common_name?: string }>
          default_photo?: { medium_url?: string; square_url?: string }
          wikipedia_url?: string
        }>
      }

      const bestTaxon = inatData.results?.[0]
      if (bestTaxon) {
        const scientificName = bestTaxon.name
        const commonName =
          bestTaxon.preferred_common_name
            ? bestTaxon.preferred_common_name.charAt(0).toUpperCase() +
              bestTaxon.preferred_common_name.slice(1)
            : cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1)

        const familyAncestor = bestTaxon.ancestors?.find(a => a.rank === 'family')
        const orderAncestor = bestTaxon.ancestors?.find(a => a.rank === 'order')
        const family = familyAncestor?.name || orderAncestor?.name || 'Plantae (Angiospermae)'

        // Fetch Spanish Wikipedia summary if available
        let wikiSummary = ''
        const wikiSlug = scientificName.replaceAll(' ', '_')
        try {
          const wikiRes = await fetch(
            `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiSlug)}`
          )
          if (wikiRes.ok) {
            const wikiJson = (await wikiRes.json()) as { extract?: string }
            if (wikiJson.extract) {
              wikiSummary = wikiJson.extract
            }
          }
        } catch {
          // Optional enrichment
        }

        // Check if we have agronomic parameters in local DB for this family/species
        const localMatch = BOTANICAL_DATABASE.find(
          item =>
            item.scientificName.toLowerCase() === scientificName.toLowerCase() ||
            item.family.toLowerCase() === family.toLowerCase()
        )

        return {
          id: `inat_${bestTaxon.id}`,
          commonName,
          scientificName,
          plantType:
            localMatch?.plantType ||
            `Especie Botánica · Familia ${family}`,
          family,
          confidence: 0.94,
          leafMorphology:
            localMatch?.leafMorphology ||
            'Dosel vascular identificado mediante taxonomía botánica y morfología foliar.',
          growthHabit:
            localMatch?.growthHabit ||
            `Taxón verificado (${bestTaxon.rank || 'especie'}) en catálogo botánico global.`,
          idealNdviRange: localMatch?.idealNdviRange || [0.68, 0.86],
          idealTempRangeC: localMatch?.idealTempRangeC || [18, 27],
          waterDemand: localMatch?.waterDemand || 'Media',
          summary:
            wikiSummary ||
            localMatch?.summary ||
            `${commonName} (${scientificName}) perteneciente a la familia ${family}. Identificación botánica verificada.`,
          wikipediaTitle: wikiSlug,
          thumbnailUrl: bestTaxon.default_photo?.medium_url || bestTaxon.default_photo?.square_url
        }
      }
    }
  } catch {
    // Fallback to local database matching below
  }

  // Fallback search in local database
  const lower = cleanQuery.toLowerCase()
  const match = BOTANICAL_DATABASE.find(
    p =>
      p.commonName.toLowerCase().includes(lower) ||
      p.scientificName.toLowerCase().includes(lower) ||
      p.keywords.some(k => lower.includes(k))
  )

  if (match) {
    return templateToCandidate(match, 0.9)
  }

  return null
}

function templateToCandidate(tpl: SpeciesProfileTemplate, confidence: number): BotanicalCandidate {
  return {
    id: tpl.id,
    commonName: tpl.commonName,
    scientificName: tpl.scientificName,
    plantType: tpl.plantType,
    family: tpl.family,
    confidence: Number(clamp(confidence, 0.55, 0.98).toFixed(2)),
    leafMorphology: tpl.leafMorphology,
    growthHabit: tpl.growthHabit,
    idealNdviRange: tpl.idealNdviRange,
    idealTempRangeC: tpl.idealTempRangeC,
    waterDemand: tpl.waterDemand,
    summary: tpl.summary,
    wikipediaTitle: tpl.wikipediaTitle
  }
}

/**
 * Analyzes an image, video stream, or synthetic canvas to determine the plant species,
 * common name, scientific name, and plant type, and enriches the top match with
 * Wikipedia / iNaturalist metadata when online.
 */
export async function identifyPlantSpecies(options: {
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null
  fileName?: string
  backendDiseaseLabel?: string
  boundingBox?: { width: number; height: number } | null
  polygonContour?: Array<{ x: number; y: number }>
  plantCoveragePercent?: number
}): Promise<PlantSpeciesIdentificationResult> {
  const {
    source,
    fileName = '',
    backendDiseaseLabel = '',
    boundingBox,
    polygonContour = [],
    plantCoveragePercent = 32
  } = options

  // 1. Extract visual features from the source frame
  let aspectRatio = boundingBox && boundingBox.width > 0.05 ? boundingBox.height / boundingBox.width : 1.05
  aspectRatio = clamp(aspectRatio, 0.55, 1.9)

  // Contour lobation / complexity (variance of radial distance from contour centroid)
  let lobation = 0.52
  if (polygonContour.length >= 8) {
    let cx = 0
    let cy = 0
    for (const pt of polygonContour) {
      cx += pt.x
      cy += pt.y
    }
    cx /= polygonContour.length
    cy /= polygonContour.length

    const radii = polygonContour.map(pt => Math.hypot(pt.x - cx, pt.y - cy))
    const meanR = radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length)
    let diffSum = 0
    for (let i = 0; i < radii.length; i++) {
      const nextR = radii[(i + 1) % radii.length]
      diffSum += Math.abs(radii[i] - nextR) / Math.max(0.05, meanR)
    }
    lobation = clamp((diffSum / radii.length) * 3.6, 0.25, 0.92)
  }

  let deepGreenRatio = 0.7
  let blueGreenRatio = 0.16
  let warmPigmentRatio = 0.08
  let solidity = clamp((plantCoveragePercent / 100) / Math.max(0.18, boundingBox ? boundingBox.width * boundingBox.height : 0.45), 0.35, 0.88)

  if (source) {
    try {
      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = 96
      sampleCanvas.height = 96
      const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(source, 0, 0, 96, 96)
        const data = ctx.getImageData(0, 0, 96, 96).data
        let vegPixels = 0
        let deepGreenCount = 0
        let blueGreenCount = 0
        let warmCount = 0

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const exg = 2 * g - r - b

          if (exg > 14 && g > 40) {
            vegPixels++
            if (g > r * 1.25 && g < 155) deepGreenCount++
            if (b > r * 1.06 && g > r * 1.1) blueGreenCount++
          } else if (r > 135 && r > g * 1.28 && b < 110) {
            warmCount++
          }
        }

        const safeVeg = Math.max(1, vegPixels)
        deepGreenRatio = clamp(deepGreenCount / safeVeg, 0.25, 0.92)
        blueGreenRatio = clamp(blueGreenCount / safeVeg, 0.05, 0.75)
        warmPigmentRatio = clamp((warmCount / (96 * 96)) * 4.5, 0.01, 0.65)
      }
    } catch {
      // Keep default geometric features if canvas is tainted
    }
  }

  const normalizedName = fileName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const backendCropPrefix = backendDiseaseLabel.includes('___')
    ? backendDiseaseLabel.split('___')[0]
    : ''

  // 2. Score every species in our botanical database
  const scored = BOTANICAL_DATABASE.map(tpl => {
    const [tAspect, tSolidity, tLobation, tDeepG, tBlueG, tWarm] = tpl.visualSignature

    const dist =
      Math.abs(aspectRatio - tAspect) * 0.24 +
      Math.abs(solidity - tSolidity) * 0.18 +
      Math.abs(lobation - tLobation) * 0.26 +
      Math.abs(deepGreenRatio - tDeepG) * 0.14 +
      Math.abs(blueGreenRatio - tBlueG) * 0.1 +
      Math.abs(warmPigmentRatio - tWarm) * 0.08

    let score = clamp(0.91 - dist * 0.65, 0.52, 0.93)

    // Strong boost if backend TFLite model matched the crop family
    if (backendCropPrefix && tpl.cropPrefix && tpl.cropPrefix.toLowerCase() === backendCropPrefix.toLowerCase()) {
      score = 0.96
    }

    // Strong boost if uploaded filename contains the plant's Spanish or English name
    if (normalizedName && tpl.keywords.some(kw => normalizedName.includes(kw))) {
      score = Math.max(score, 0.95)
    }

    return {
      tpl,
      score
    }
  })

  scored.sort((a, b) => b.score - a.score)

  const topThree = scored.slice(0, 3).map(item => templateToCandidate(item.tpl, item.score))
  const primary = topThree[0]

  // 3. Asynchronously enrich primary candidate with Wikipedia ES summary + thumbnail if online
  if (primary.wikipediaTitle) {
    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 2200)
      const wikiRes = await fetch(
        `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(primary.wikipediaTitle)}`,
        { signal: controller.signal }
      )
      window.clearTimeout(timer)
      if (wikiRes.ok) {
        const wikiData = (await wikiRes.json()) as {
          extract?: string
          thumbnail?: { source?: string }
        }
        if (wikiData.extract && wikiData.extract.length > 40) {
          primary.summary = wikiData.extract
        }
        if (wikiData.thumbnail?.source) {
          primary.thumbnailUrl = wikiData.thumbnail.source
        }
      }
    } catch {
      // Offline or blocked; keep local botanical summary
    }
  }

  const canopyShape =
    aspectRatio > 1.3
      ? 'Porte erecto / lámina alargada'
      : aspectRatio < 0.88
        ? 'Roseta basal / cobertura extendida'
        : 'Dosel herbáceo equilibrado'

  const foliageTone =
    blueGreenRatio > 0.36
      ? 'Verde glauco / pruinoso'
      : deepGreenRatio > 0.72
        ? 'Verde clorofílico intenso'
        : 'Verde medio laminar'

  const leafComplexity =
    lobation > 0.66
      ? 'Borde lobulado, compuesto o fenestrado'
      : lobation > 0.45
        ? 'Borde aserrado / nervadura marcada'
        : 'Lámina entera continua'

  return {
    identifiedAt: new Date().toLocaleTimeString(),
    source: backendCropPrefix ? 'backend-ai' : 'vision-morphology-inaturalist',
    primary,
    alternatives: topThree.slice(1),
    visualTraits: {
      canopyShape,
      foliageTone,
      leafComplexity,
      floralOrFruitDetected: warmPigmentRatio > 0.18,
      aspectRatio: Number(aspectRatio.toFixed(2))
    },
    googleLensReady: true
  }
}
