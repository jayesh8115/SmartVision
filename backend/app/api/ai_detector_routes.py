"""
SmartVision - Separate router for AI-Generated Image Detector.
Existing routes (/predict, /explain, /health, /model-info) remain untouched.
"""

from typing import Optional
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

import sys
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import ai_detector

from app.api.routes import read_upload
from app.schemas import ImageMeta

router = APIRouter(tags=["AI Detector"])


class AIProbabilities(BaseModel):
    real: float
    ai: float


class AIThresholds(BaseModel):
    real_max: float
    ai_min: float


class AIDetectResponse(BaseModel):
    label: str
    confidence: float
    probabilities: AIProbabilities
    verdict: Optional[str] = None
    ai_probability: Optional[float] = None
    threshold: Optional[float] = None
    thresholds: Optional[AIThresholds] = None
    image: Optional[ImageMeta] = None
    warnings: list[str] = []


def _warnings(meta: ImageMeta) -> list[str]:
    w = []
    if min(meta.width, meta.height) < 256:
        w.append("low_resolution")
    return w


@router.post("/detect-ai", response_model=AIDetectResponse)
async def detect_ai_endpoint(
    request: Request,
    file: UploadFile = File(..., description="Image file to analyze for AI generation traces"),
):
    """
    Analyzes an uploaded image to determine if it is Real or AI-generated.
    Uses a frozen CLIP vision encoder with a calibrated classifier.
    """
    data, _, meta = await read_upload(file)
    warnings = _warnings(meta)

    # Check that the AI detector is actually loaded; 503 must never affect /predict or /explain
    detector = ai_detector.detector_service
    if not detector.is_loaded:
        raise HTTPException(
            status_code=503,
            detail=detector.error_reason
            or "The AI detector has not been trained yet.",
        )

    try:
        result = ai_detector.detect_ai(data)
        raw_thresholds = result.get("thresholds")
        thresholds_obj = AIThresholds(**raw_thresholds) if raw_thresholds else None
        return AIDetectResponse(
            label=result["label"],
            confidence=result["confidence"],
            probabilities=AIProbabilities(**result["probabilities"]),
            verdict=result.get("verdict"),
            ai_probability=result.get("ai_probability"),
            threshold=result.get("threshold"),
            thresholds=thresholds_obj,
            image=meta,
            warnings=warnings,
        )
    except RuntimeError as e:
        # Raised if model file is missing or not trained yet
        raise HTTPException(
            status_code=503,
            detail=f"Detector unavailable: {str(e)}",
        )
    except ValueError as e:
        # Raised on corrupted or unreadable image bytes
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image file: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Inference error: {str(e)}",
        )
