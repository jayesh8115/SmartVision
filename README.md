# SmartVision - AI Image Classifier

Upload an image, get top-3 predictions with confidence, a "Not sure" fallback and a Grad-CAM heatmap.
Stack: React, FastAPI, TensorFlow/Keras ResNet-50, AWS S3 + EC2, Docker.

## Structure
```
smartvision/
├── AGENTS.md                  # rules for Antigravity agents
├── .agent/rules/              # same rules in Antigravity's workspace-rules folder
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── main.py            # app factory, CORS, model loaded once at startup
│   │   ├── config.py          # settings from .env
│   │   ├── schemas.py         # response models
│   │   ├── api/routes.py      # /health /model-info /predict /explain
│   │   └── services/
│   │       ├── preprocess.py  # single preprocessing function
│   │       ├── model_service.py
│   │       ├── gradcam.py
│   │       └── storage.py     # optional S3
│   ├── models/                # put resnet50_cifar100.keras + cifar100_classes.json here
│   ├── tests/test_api.py
│   ├── requirements.txt  Dockerfile  .env.example  pytest.ini
├── frontend/                  # your existing React app + src/services/api.js
├── notebooks/                 # Step 1: ImageNet test, Step 2: CIFAR-100 training
├── docs/                      # ARCHITECTURE.md, DEPLOYMENT_AWS.md
└── scripts/run_dev.sh
```

## Run locally
```bash
bash .\scripts\run_dev.sh          # backend on http://localhost:8000  (docs at /docs)
cd frontend && npm install && npm run dev
```
Test: `curl -F "file=@dog.jpg" http://localhost:8000/predict`

## Train and switch to the CIFAR-100 model
1. Run `notebooks/SmartVision_Step2_Train_CIFAR100.ipynb` on a GPU (Colab/Kaggle T4, about 1.5-3 h).
2. Copy the produced `resnet50_cifar100.keras` into `backend/models/` (`cifar100_classes.json` is already there and matches the notebook).
3. In `backend/.env` set `MODEL_BACKEND=custom`, `INPUT_SIZE=224`, `PREPROCESS=resnet`. Restart.

If a teammate trains the model instead, their class order, input size and preprocessing must match these settings.

## Tests
`cd backend && pytest`

## Roadmap
1 local demo, 2 top-3, 3 Grad-CAM, 4 BLIP caption, 5 S3, 6 EC2, 7 AI-generated-image detection.
