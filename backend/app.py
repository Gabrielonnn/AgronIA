import json
import logging
import os
import threading
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
import tensorflow as tf

logger = logging.getLogger("agronia.diagnosis")

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
UNKNOWN_THRESHOLD = 0.60
MODEL_PATH = Path(os.getenv("PLANT_MODEL_PATH", "models/model_float16_quant.tflite"))
CLASS_MAP_PATH = Path(os.getenv("PLANT_CLASS_MAP_PATH", "class_indices.json"))
interpreter_lock = threading.Lock()


class DiagnosisResponse(BaseModel):
    disease: str
    confidence: float
    recommendation: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.interpreter = None
    app.state.input_details = None
    app.state.output_details = None
    app.state.class_names = []
    app.state.model_error = None

    try:
        with CLASS_MAP_PATH.open(encoding="utf-8") as class_file:
            class_map: dict[str, str] = json.load(class_file)
        class_names = [class_map[str(index)] for index in range(len(class_map))]
        if len(class_names) != 38:
            raise ValueError(f"Expected 38 class names, found {len(class_names)}.")
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}.")

        interpreter = tf.lite.Interpreter(model_path=str(MODEL_PATH))
        interpreter.allocate_tensors()
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()
        if len(input_details) != 1 or tuple(input_details[0]["shape"]) != (1, 384, 384, 3):
            raise ValueError("Model input must have shape (1, 384, 384, 3).")
        if not any(tuple(output["shape"]) == (1, len(class_names)) for output in output_details):
            raise ValueError("Model does not expose a 38-class disease output.")

        app.state.interpreter = interpreter
        app.state.input_details = input_details
        app.state.output_details = output_details
        app.state.class_names = class_names
        logger.info("Plant disease model loaded from %s", MODEL_PATH)
    except Exception as exc:
        app.state.model_error = "Model could not be loaded."
        logger.exception("Could not load plant disease model: %s", exc)

    yield


app = FastAPI(title="AgronIA Plant Diagnosis API", lifespan=lifespan)

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


@app.get("/health")
def health() -> dict[str, str]:
    if app.state.interpreter is None:
        return {"status": "model_unavailable"}
    return {"status": "ready"}


@app.post("/predict", response_model=DiagnosisResponse)
def predict(file: UploadFile = File(...)) -> DiagnosisResponse:
    interpreter: Any = app.state.interpreter
    if interpreter is None:
        raise HTTPException(
            status_code=503,
            detail="El modelo no está disponible. Revisa los registros del servicio.",
        )

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
            image = image.convert("RGB").resize((384, 384))
            image_array = np.expand_dims(np.asarray(image, dtype=np.float32), axis=0)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=400, detail="El archivo no contiene una imagen válida.") from exc

    try:
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
    except Exception as exc:
        logger.exception("Plant disease inference failed: %s", exc)
        raise HTTPException(status_code=500, detail="No se pudo analizar la imagen.") from exc

    if (
        predictions.ndim != 1
        or len(predictions) != len(app.state.class_names)
        or not np.isfinite(predictions).all()
        or np.any(predictions < 0)
        or np.any(predictions > 1)
        or not np.isclose(float(predictions.sum()), 1.0, atol=0.02)
    ):
        logger.error("Model returned invalid probabilities.")
        raise HTTPException(status_code=500, detail="El modelo devolvió probabilidades no válidas.")

    predicted_index = int(np.argmax(predictions))
    confidence = float(predictions[predicted_index])
    recommendation = (
        "La confianza es baja. Toma otra foto y confirma el resultado con un especialista agrónomo."
        if confidence < UNKNOWN_THRESHOLD
        else "Resultado orientativo. Confirma el diagnóstico y cualquier tratamiento con un especialista agrónomo."
    )
    return DiagnosisResponse(
        disease=app.state.class_names[predicted_index],
        confidence=confidence,
        recommendation=recommendation,
    )
