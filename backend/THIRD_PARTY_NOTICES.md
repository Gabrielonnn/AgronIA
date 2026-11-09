# Third-party model notice

AgronIA downloads the following model during the backend Docker build:

- **Plant Disease Detection — EfficientNetV2S**, by Animesh Kumar.
- Model card: https://huggingface.co/animeshakr/plant-disease-efficientnetv2s
- Pinned revision: `5965b98c122f28b3154241e9d6d10b7a367cac0f`
- Model card license declaration: MIT.
- The pinned model weights are SHA-256 verified by `download_model.py`.
- The model card identifies PlantVillage as its training dataset. It reports controlled laboratory images and explicitly says field generalization is not validated and the model is not intended for commercial crop-management decisions.

The model card declares MIT but the pinned model repository does not include a separate `LICENSE` file. The dataset's terms are separate from the model's declared license; verify dataset rights and get legal review before commercial use or consequential crop-treatment decisions. AgronIA does not redistribute the training dataset.
