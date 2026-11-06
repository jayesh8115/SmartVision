# SmartVision - AI Image Classifier

Upload an image, get top-3 predictions with confidence, a "Not sure" fallback and a Grad-CAM heatmap.
Stack: React, FastAPI, TensorFlow/Keras ResNet-50, AWS S3 + EC2, Docker.

## Features

- **Image Classification:** Classifies uploaded images using a ResNet-50-based deep learning model.
- **Top-3 Predictions:** Displays the three most likely classes with confidence scores.
- **Uncertainty Handling:** Provides a "Not sure" fallback when the model is not sufficiently confident.
- **Grad-CAM Explainability:** Visualizes image regions that contribute to the model's prediction using heatmaps.
- **FastAPI Backend:** Provides REST API endpoints for health checks, model information, prediction, and image explanation.
- **React Frontend:** Provides an interactive interface for image uploads and classification results.
- **AWS EC2 Deployment:** Deployed the application infrastructure on Amazon EC2 instances with an Elastic IP for a consistent public IP address.
- **Amazon S3 Image Storage:** Configured an S3 bucket to store uploaded images in cloud storage.
- **Cloud-Integrated Architecture:** Connects the image classification workflow with AWS infrastructure for remote access and image storage.
- **Docker Support:** Provides containerization through Docker and Docker Compose, where configured.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Check backend health |
| `GET /model-info` | Retrieve model information |
| `POST /predict` | Generate image classification predictions |
| `POST /explain` | Request a Grad-CAM explanation |

## Model and Dataset

SmartVision uses TensorFlow/Keras with a ResNet-50 architecture. The project includes an ImageNet testing workflow and a CIFAR-100 training workflow.

The custom CIFAR-100 model uses the corresponding class-label mapping, input size, and preprocessing configuration. The model checkpoint must be placed in `backend/models/` before switching to the custom model backend.

## Future Enhancements

- Image caption generation using BLIP
- AI-generated versus real-image detection
- Further improvements to model accuracy and prediction reliability
- Expanded cloud deployment and storage capabilities

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

## AWS Cloud Deployment

SmartVision includes an AWS cloud deployment setup to support remote application access and image storage.

### AWS Services Used

- **Amazon EC2:** Hosts the application infrastructure.
- **Elastic IP:** Provides a consistent public IP address for accessing the deployed instance.
- **Amazon S3:** Stores uploaded images in a cloud storage bucket.

### Cloud Workflow

1. The user accesses the deployed SmartVision application.
2. The user uploads an image through the frontend.
3. The backend processes the image and performs model inference.
4. Uploaded images are stored in the configured Amazon S3 bucket.
5. The classification results and available Grad-CAM visualizations are returned to the user.

### Deployment Configuration

The deployment uses EC2, an Elastic IP, and an S3 bucket. Configure AWS credentials and resource settings through environment variables or an appropriate AWS IAM role.

**Security considerations:**
- Keep AWS access keys and secrets out of source control.
- Apply least-privilege permissions to EC2 and S3 access.
- Restrict public access to the S3 bucket unless public access is explicitly required.
- Configure security groups to expose only the necessary application ports.
- Avoid exposing database credentials or other sensitive configuration in the frontend.

## Train and switch to the CIFAR-100 model
1. Run `notebooks/SmartVision_Step2_Train_CIFAR100.ipynb` on a GPU (Colab/Kaggle T4, about 1.5-3 h).
2. Copy the produced `resnet50_cifar100.keras` into `backend/models/` (`cifar100_classes.json` is already there and matches the notebook).
3. In `backend/.env` set `MODEL_BACKEND=custom`, `INPUT_SIZE=224`, `PREPROCESS=resnet`. Restart.

If a teammate trains the model instead, their class order, input size and preprocessing must match these settings.

## Tests
`cd backend && pytest`

## Roadmap

- [x] Local application setup
- [x] Top-3 image classification predictions
- [x] AWS EC2 deployment and Elastic IP configuration
- [x] Amazon S3 bucket setup for uploaded images
- [ ] BLIP-based image caption generation
- [ ] AI-generated versus real-image detection
- [ ] Further model evaluation and performance improvements
