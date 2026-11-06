# SmartVision - agent instructions

Project: image classifier web app. React frontend -> FastAPI backend -> Keras ResNet-50 model. Cloud: AWS S3 + EC2.

## Rules
- Do NOT rebuild or restyle the existing React UI. Only integrate via `frontend/src/services/api.js`.
- The frontend never talks to the model. All inference goes through the FastAPI `/predict` and `/explain` endpoints.
- Preprocessing lives ONLY in `backend/app/services/preprocess.py` and must match training exactly.
- Model is swapped through `.env` (MODEL_BACKEND, MODEL_PATH, LABELS_PATH, INPUT_SIZE, PREPROCESS). No code change needed.
- Never fabricate predictions. If a temporary/demo model is used, label it clearly (`is_temporary`).
- Never commit `.env`, model files (.keras/.h5) or AWS keys. Use the EC2 IAM role for S3.
- Run `cd backend && pytest` before finishing any backend change.

## Build order
1 local demo -> 2 top-3 -> 3 Grad-CAM -> 4 BLIP caption -> 5 S3 -> 6 EC2 -> 7 AI-generated-image detection (separate model).
