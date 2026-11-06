import io
import os

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError

from app.schemas import ExplainResponse, ImageMeta, ModelInfo, PredictResponse, Prediction
from app.services import gradcam, storage

import sys
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from ai_detector import load_rgb

router = APIRouter()

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
MAX_PIXELS = 60_000_000


async def read_upload(file: UploadFile):
    """Shared upload reader for /predict, /explain and /detect-ai.

    Returns (image_bytes, pil_image, meta_dict).
    Validates by decoding — never trusts filename, extension or content-type.
    """
    limit = MAX_UPLOAD_MB * 1024 * 1024
    data = await file.read(limit + 1)

    if len(data) == 0:
        raise HTTPException(400, "Empty file.")

    if len(data) > limit:
        raise HTTPException(413, f"Image is larger than {MAX_UPLOAD_MB} MB.")

    # Validate by actually decoding — not by extension/content-type
    try:
        probe = Image.open(io.BytesIO(data))
        w, h = probe.size
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise HTTPException(
            415,
            "Unsupported or corrupted image. Use JPG, PNG, WEBP, GIF or BMP.",
        )

    if w * h > MAX_PIXELS:
        raise HTTPException(413, "Image is too large in pixels.")

    # Full decode through load_rgb (EXIF rotation, transparency compositing)
    try:
        pil_image = load_rgb(data)
    except Exception:
        raise HTTPException(
            415,
            "Unsupported or corrupted image. Use JPG, PNG, WEBP, GIF or BMP.",
        )

    meta = ImageMeta(
        width=pil_image.size[0],
        height=pil_image.size[1],
        file_kb=round(len(data) / 1024, 1),
    )
    return data, pil_image, meta


def _warnings(meta: ImageMeta) -> list[str]:
    w = []
    if min(meta.width, meta.height) < 256:
        w.append("low_resolution")
    return w


def _build(request: Request, result, s3_key, meta: ImageMeta, *, add_low_conf: bool = False):
    top = [Prediction(label=t["label"], confidence=round(t["confidence"], 4)) for t in result["top"]]
    resp = dict(
        status=result["status"],
        top1=top[0],
        top_k=top,
        model_name=request.app.state.model_service.model_name,
        inference_ms=round(result["ms"], 1),
        s3_key=s3_key,
        image=meta,
        warnings=_warnings(meta),
    )
    if add_low_conf:
        resp["low_confidence"] = (
            top[0].confidence < request.app.state.settings.conf_threshold
        )
    return resp


@router.get("/health")
def health(request: Request):
    return {"status": "ok", "model_loaded": request.app.state.model_service.model is not None}


@router.get("/model-info", response_model=ModelInfo)
def model_info(request: Request):
    s, svc = request.app.state.settings, request.app.state.model_service
    return ModelInfo(
        model_name=svc.model_name,
        backend=s.model_backend,
        input_size=s.input_size,
        preprocess=s.preprocess,
        conf_threshold=s.conf_threshold,
        is_temporary=svc.is_temporary,
    )


@router.post("/predict", response_model=PredictResponse)
async def predict(request: Request, file: UploadFile = File(...)):
    data, image, meta = await read_upload(file)
    result = request.app.state.model_service.predict(image)
    key = storage.save_upload(request.app.state.settings, data, file.filename or "", file.content_type or "")
    return _build(request, result, key, meta, add_low_conf=True)


@router.post("/explain", response_model=ExplainResponse)
async def explain(request: Request, file: UploadFile = File(...)):
    _, image, meta = await read_upload(file)
    svc = request.app.state.model_service
    result = svc.predict(image)
    cam = gradcam.make_heatmap(svc.model, result["x"], result["class_index"])
    heatmap = gradcam.overlay_png_base64(result["pil"], cam)
    storage.save_heatmap(request.app.state.settings, heatmap)
    return ExplainResponse(**_build(request, result, None, meta), heatmap_png_base64=heatmap)
