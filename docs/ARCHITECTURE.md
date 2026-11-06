# Architecture

```
React (browser) --multipart--> FastAPI (/predict, /explain) --> ModelService --> ResNet-50 (.keras)
                                        |
                                        +--> AWS S3 (uploads, Grad-CAM images, results)
```

| Layer | Folder | Responsibility |
|---|---|---|
| UI | `frontend/` | Upload image, show top-3, confidence, Grad-CAM |
| API | `backend/app/api` | Validate upload, call service, return JSON |
| Service | `backend/app/services` | preprocess, model, Grad-CAM, S3 |
| Config | `backend/app/config.py` + `.env` | All tunable values, swap models without code edits |

## Two model modes
- `MODEL_BACKEND=imagenet` : pretrained ResNet-50, 1000 classes, works today (validated in the Step-1 notebook).
- `MODEL_BACKEND=custom`   : your `resnet50_cifar100.keras`. Needs the exact class order (`cifar100_classes.json`, a JSON list of 100 names), input size and preprocessing used in training.

## API
| Method | Path | Returns |
|---|---|---|
| GET | `/health` | server + model status |
| GET | `/model-info` | model name, input size, threshold |
| POST | `/predict` | status, top1, top_k, inference_ms |
| POST | `/explain` | same + Grad-CAM heatmap (base64 PNG) |

## Grad-CAM note
Default layer `conv5_block3_out` works for the Keras ResNet-50 built with `applications.ResNet50`. If your friend's model wraps ResNet-50 as a nested layer, pass the inner model or change the layer name in `gradcam.py`.
