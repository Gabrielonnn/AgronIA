FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLANT_MODEL_PATH=/models/model_float16_quant.tflite \
    PLANT_CLASS_MAP_PATH=/app/class_indices.json

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py class_indices.json download_model.py THIRD_PARTY_NOTICES.md ./
RUN python download_model.py

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
