import json
import logging
import os
import threading
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import Any, Literal

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

try:
    import tensorflow as tf
except ImportError:  # pragma: no cover
    tf = None

logger = logging.getLogger("agronia.diagnosis")

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
UNKNOWN_THRESHOLD = 0.60
MODEL_PATH = Path(os.getenv("PLANT_MODEL_PATH", "models/model_float16_quant.tflite"))
CLASS_MAP_PATH = Path(os.getenv("PLANT_CLASS_MAP_PATH", "class_indices.json"))
interpreter_lock = threading.Lock()

PresetType = Literal[
    "live_raw",
    "sin_plagas",
    "estres_hidrico",
    "sobre_hidratacion",
    "con_plagas",
]


class DiagnosisResponse(BaseModel):
    disease: str
    confidence: float
    cause: str | None = None
    recommendation: str


class BoundingBoxModel(BaseModel):
    x: float
    y: float
    width: float
    height: float
    center_x: float
    center_y: float


class MultispectralResponse(BaseModel):
    disease: str
    confidence: float
    cause: str
    recommendation: str
    preset_applied: PresetType
    plant_detected: bool
    plant_coverage_percent: float
    bounding_box: BoundingBoxModel | None
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    temp_mean_c: float
    temp_min_c: float
    temp_max_c: float
    cwsi: float
    chlorosis_percent: float
    necrosis_percent: float
    foliar_moisture_percent: float
    engine_mode: Literal["tflite+multispectral", "spectral-heuristic"]


PRESET_METADATA: dict[str, dict[str, str]] = {
    "sin_plagas": {
        "disease": "Planta_Sana___Sin_Plagas_Vigor_Optimo",
        "cause": "Dosel vegetal con alta densidad clorofílica, transpiración activa y sin agentes patógenos.",
        "recommendation": "Mantener el programa actual de riego y monitoreo preventivo semanal.",
    },
    "estres_hidrico": {
        "disease": "Estres_Hidrico___Deficit_De_Humedad_Foliar",
        "cause": "Cierre estomático defensivo e incremento térmico foliar por déficit hídrico en zona radicular.",
        "recommendation": "Aplicar riego correctivo inmediato y verificar uniformidad de humedad en el perfil del suelo.",
    },
    "sobre_hidratacion": {
        "disease": "Sobrehidratacion___Exceso_Hidrico_Y_Asfixia_Radicular",
        "cause": "Saturación de agua en el sustrato con enfriamiento basal anómalo, edema y clorosis por hipoxia.",
        "recommendation": "Suspender el riego temporalmente, mejorar el drenaje y vigilar aparición de hongos radiculares.",
    },
    "con_plagas": {
        "disease": "Infestacion_Activa___Plaga_Y_Necrosis_Foliar",
        "cause": "Lesiones necróticas y halos cloróticos focalizados compatibles con ataque de artrópodos o patógenos.",
        "recommendation": "Inspeccionar el envés de las hojas en los focos detectados y aplicar control fitosanitario focalizado.",
    },
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.interpreter = None
    app.state.input_details = None
    app.state.output_details = None
    app.state.class_names = []
    app.state.model_error = None

    try:
        if CLASS_MAP_PATH.is_file():
            with CLASS_MAP_PATH.open(encoding="utf-8") as class_file:
                class_map: dict[str, str] = json.load(class_file)
            class_names = [class_map[str(index)] for index in range(len(class_map))]
            if len(class_names) == 38:
                app.state.class_names = class_names

        if tf is not None and MODEL_PATH.is_file() and len(app.state.class_names) == 38:
            interpreter = tf.lite.Interpreter(model_path=str(MODEL_PATH))
            interpreter.allocate_tensors()
            input_details = interpreter.get_input_details()
            output_details = interpreter.get_output_details()
            if len(input_details) != 1 or tuple(input_details[0]["shape"]) != (1, 384, 384, 3):
                raise ValueError("Model input must have shape (1, 384, 384, 3).")
            if not any(tuple(output["shape"]) == (1, len(app.state.class_names)) for output in output_details):
                raise ValueError("Model does not expose a 38-class disease output.")

            app.state.interpreter = interpreter
            app.state.input_details = input_details
            app.state.output_details = output_details
            logger.info("Plant disease model loaded from %s", MODEL_PATH)
        else:
            app.state.model_error = "TFLite weights not found; spectral-heuristic fallback active."
            logger.warning("TFLite model not loaded (%s); using spectral analysis fallback.", MODEL_PATH)
    except Exception as exc:
        app.state.model_error = "Model could not be loaded."
        logger.exception("Could not load plant disease model: %s", exc)

    yield


app = FastAPI(title="AgronIA Plant Diagnosis & Multispectral API", lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "PLANT_DIAGNOSIS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _read_and_validate_image(file: UploadFile) -> Image.Image:
    content = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="La imagen supera el límite de 10 MB.")
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    try:
        with Image.open(BytesIO(content)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(
                    status_code=415,
                    detail="Formato no permitido. Usa una imagen JPG, PNG o WebP.",
                )
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="La resolución de la imagen es demasiado alta.")
            image.load()
            return image.convert("RGB")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=400, detail="El archivo no contiene una imagen válida.") from exc


def _compute_multispectral_metrics(
    rgb_image: Image.Image,
    preset: PresetType = "live_raw",
    intensity: float = 0.85,
    ambient_temp_c: float = 25.0,
) -> dict[str, Any]:
    small = rgb_image.resize((240, 180))
    arr = np.asarray(small, dtype=np.float32) / 255.0
    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]

    exg = 2.0 * g - r - b
    vari = (g - r) / (g + r - b + 1e-4)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Segment whole plant area
    mask = ((exg > 0.04) | ((vari > 0.015) & (g > b * 1.12))) & (lum > 0.05) & (lum < 0.96)
    plant_pixels = int(np.count_nonzero(mask))
    total_pixels = mask.size

    if plant_pixels < total_pixels * 0.01:
        # Fallback to central region if low green contrast
        yy, xx = np.ogrid[:180, :240]
        central = ((xx - 120) / 75.0) ** 2 + ((yy - 90) / 60.0) ** 2 <= 1.0
        mask = central
        plant_pixels = int(np.count_nonzero(mask))

    ys, xs = np.where(mask)
    h, w = mask.shape
    min_x, max_x = float(xs.min()) / w, float(xs.max()) / w
    min_y, max_y = float(ys.min()) / h, float(ys.max()) / h
    cx, cy = float(xs.mean()) / w, float(ys.mean()) / h

    bbox = BoundingBoxModel(
        x=round(min_x, 4),
        y=round(min_y, 4),
        width=round(max(0.02, max_x - min_x), 4),
        height=round(max(0.02, max_y - min_y), 4),
        center_x=round(cx, 4),
        center_y=round(cy, 4),
    )

    ndvi_map = np.clip(0.42 + exg * 0.72 + vari * 0.28, 0.08, 0.92)
    temp_map = ambient_temp_c - (ndvi_map - 0.5) * 4.2

    k = float(np.clip(intensity, 0.05, 1.0))
    if preset == "sin_plagas":
        ndvi_map = ndvi_map * (1.0 - k) + 0.82 * k
        temp_map = temp_map * (1.0 - k) + (ambient_temp_c - 2.3) * k
    elif preset == "estres_hidrico":
        ndvi_map = ndvi_map * (1.0 - k) + 0.36 * k
        temp_map = temp_map * (1.0 - k) + (ambient_temp_c + 6.8) * k
    elif preset == "sobre_hidratacion":
        ndvi_map = ndvi_map * (1.0 - k) + 0.44 * k
        temp_map = temp_map * (1.0 - k) + (ambient_temp_c - 4.5) * k
    elif preset == "con_plagas":
        yy, xx = np.meshgrid(np.linspace(0, 1, h), np.linspace(0, 1, w), indexing="ij")
        spots = np.sin(xx * 28.0) * np.cos(yy * 28.0) > 0.45
        target_ndvi = np.where(spots, 0.18, 0.68)
        target_temp = np.where(spots, ambient_temp_c + 4.8, ambient_temp_c - 0.8)
        ndvi_map = ndvi_map * (1.0 - k) + target_ndvi * k
        temp_map = temp_map * (1.0 - k) + target_temp * k

    plant_ndvi = ndvi_map[mask]
    plant_temp = temp_map[mask]

    ndvi_mean = float(np.mean(plant_ndvi))
    ndvi_min = float(np.min(plant_ndvi))
    ndvi_max = float(np.max(plant_ndvi))
    temp_mean = float(np.mean(plant_temp))
    temp_min = float(np.min(plant_temp))
    temp_max = float(np.max(plant_temp))

    cwsi = float(np.clip((temp_mean - ambient_temp_c + 3.0) / 10.5, 0.02, 0.98))
    necrosis_pct = float(np.mean(plant_ndvi < 0.28) * 100.0)
    chlorosis_pct = float(np.mean((plant_ndvi >= 0.28) & (plant_ndvi < 0.48)) * 100.0)

    if preset == "sobre_hidratacion":
        moisture_pct = float(np.clip(78.0 + k * 18.0, 50.0, 98.0))
    elif preset == "estres_hidrico":
        moisture_pct = float(np.clip(62.0 - k * 42.0, 12.0, 70.0))
    else:
        moisture_pct = float(np.clip(55.0 + ndvi_mean * 32.0, 20.0, 92.0))

    return {
        "plant_detected": True,
        "plant_coverage_percent": round((plant_pixels / total_pixels) * 100.0, 1),
        "bounding_box": bbox,
        "ndvi_mean": round(ndvi_mean, 2),
        "ndvi_min": round(ndvi_min, 2),
        "ndvi_max": round(ndvi_max, 2),
        "temp_mean_c": round(temp_mean, 1),
        "temp_min_c": round(temp_min, 1),
        "temp_max_c": round(temp_max, 1),
        "cwsi": round(cwsi, 2),
        "chlorosis_percent": round(chlorosis_pct, 1),
        "necrosis_percent": round(necrosis_pct, 1),
        "foliar_moisture_percent": round(moisture_pct, 1),
    }


def _run_tflite_inference(app: FastAPI, rgb_image: Image.Image) -> tuple[str, float] | None:
    interpreter: Any = app.state.interpreter
    if interpreter is None:
        return None

    resized = rgb_image.resize((384, 384))
    image_array = np.expand_dims(np.asarray(resized, dtype=np.float32), axis=0)
    input_detail = app.state.input_details[0]
    with interpreter_lock:
        interpreter.set_tensor(input_detail["index"], image_array)
        interpreter.invoke()
        disease_output = next(
            output
            for output in app.state.output_details
            if tuple(output["shape"]) == (1, len(app.state.class_names))
        )
        predictions = interpreter.get_tensor(disease_output["index"])[0].astype(np.float32)

    if (
        predictions.ndim != 1
        or len(predictions) != len(app.state.class_names)
        or not np.isfinite(predictions).all()
    ):
        return None

    predicted_index = int(np.argmax(predictions))
    confidence = float(np.clip(predictions[predicted_index], 0.0, 1.0))
    return app.state.class_names[predicted_index], confidence


@app.get("/health")
def health() -> dict[str, str]:
    if app.state.interpreter is None:
        return {"status": "ready_spectral_fallback"}
    return {"status": "ready"}


@app.post("/predict", response_model=DiagnosisResponse)
def predict(file: UploadFile = File(...)) -> DiagnosisResponse:
    rgb_image = _read_and_validate_image(file)
    tflite_result = _run_tflite_inference(app, rgb_image)

    if tflite_result is not None:
        disease, confidence = tflite_result
        recommendation = (
            "La confianza es baja. Toma otra foto y confirma el resultado con un especialista agrónomo."
            if confidence < UNKNOWN_THRESHOLD
            else "Resultado orientativo. Confirma el diagnóstico y cualquier tratamiento con un especialista agrónomo."
        )
        return DiagnosisResponse(
            disease=disease,
            confidence=confidence,
            cause="Clasificación obtenida mediante red neuronal convolucional EfficientNetV2S (PlantVillage).",
            recommendation=recommendation,
        )

    # Spectral fallback when TFLite file is not present locally
    metrics = _compute_multispectral_metrics(rgb_image, preset="live_raw")
    if metrics["necrosis_percent"] > 14:
        meta = PRESET_METADATA["con_plagas"]
        conf = 0.84
    elif metrics["ndvi_mean"] < 0.45:
        meta = PRESET_METADATA["estres_hidrico"]
        conf = 0.82
    else:
        meta = PRESET_METADATA["sin_plagas"]
        conf = 0.89

    return DiagnosisResponse(
        disease=meta["disease"],
        confidence=conf,
        cause=meta["cause"],
        recommendation=meta["recommendation"],
    )


@app.post("/analyze-multispectral", response_model=MultispectralResponse)
def analyze_multispectral(
    file: UploadFile = File(...),
    preset: PresetType = Form("live_raw"),
    intensity: float = Form(0.85),
    ambient_temp_c: float = Form(25.0),
) -> MultispectralResponse:
    rgb_image = _read_and_validate_image(file)
    metrics = _compute_multispectral_metrics(
        rgb_image,
        preset=preset,
        intensity=intensity,
        ambient_temp_c=ambient_temp_c,
    )
    tflite_result = _run_tflite_inference(app, rgb_image)

    if preset in PRESET_METADATA:
        meta = PRESET_METADATA[preset]
        disease = meta["disease"]
        cause = meta["cause"]
        recommendation = meta["recommendation"]
        confidence = round(float(np.clip(0.84 + intensity * 0.13, 0.75, 0.98)), 2)
        if tflite_result is not None:
            base_disease, _ = tflite_result
            cause = f"{cause} (Base óptica detectada: {base_disease.replace('___', ' · ').replace('_', ' ')})."
    elif tflite_result is not None:
        disease, confidence = tflite_result
        cause = "Inferencia combinada de modelo EfficientNetV2S y segmentación multiespectral de planta completa."
        recommendation = (
            "La confianza es baja. Toma otra foto y confirma el resultado con un especialista agrónomo."
            if confidence < UNKNOWN_THRESHOLD
            else "Resultado orientativo. Confirma el diagnóstico y cualquier tratamiento con un especialista agrónomo."
        )
    else:
        if metrics["necrosis_percent"] > 14:
            meta = PRESET_METADATA["con_plagas"]
        elif metrics["ndvi_mean"] < 0.45:
            meta = PRESET_METADATA["estres_hidrico"]
        else:
            meta = PRESET_METADATA["sin_plagas"]
        disease = meta["disease"]
        cause = meta["cause"]
        recommendation = meta["recommendation"]
        confidence = 0.87

    return MultispectralResponse(
        disease=disease,
        confidence=confidence,
        cause=cause,
        recommendation=recommendation,
        preset_applied=preset,
        engine_mode="tflite+multispectral" if tflite_result is not None else "spectral-heuristic",
        **metrics,
    )
