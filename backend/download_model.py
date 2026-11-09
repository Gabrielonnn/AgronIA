import hashlib
import os
from pathlib import Path
from urllib.request import urlopen

MODEL_URL = (
    "https://huggingface.co/animeshakr/plant-disease-efficientnetv2s/"
    "resolve/5965b98c122f28b3154241e9d6d10b7a367cac0f/model_float16_quant.tflite"
)
MODEL_SHA256 = "c94c4b1dd60d8d5c3b2e621105cf790b95584b49b7820e127ef68bc942f0f6f6"
MODEL_PATH = Path(os.getenv("PLANT_MODEL_PATH", "/models/model_float16_quant.tflite"))


def main() -> None:
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with urlopen(MODEL_URL, timeout=60) as response, MODEL_PATH.open("wb") as model_file:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            model_file.write(chunk)

    if digest.hexdigest() != MODEL_SHA256:
        MODEL_PATH.unlink(missing_ok=True)
        raise RuntimeError("Downloaded model checksum does not match the pinned model revision.")

    print(f"Downloaded and verified model at {MODEL_PATH}")


if __name__ == "__main__":
    main()
