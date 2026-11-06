from typing import Optional

from pydantic import BaseModel


class Prediction(BaseModel):
    label: str
    confidence: float


class ImageMeta(BaseModel):
    width: int
    height: int
    file_kb: float


class PredictResponse(BaseModel):
    status: str  # "confident" | "not_sure"
    top1: Prediction
    top_k: list[Prediction]
    model_name: str
    inference_ms: float
    s3_key: Optional[str] = None
    image: Optional[ImageMeta] = None
    warnings: list[str] = []
    low_confidence: bool = False


class ExplainResponse(PredictResponse):
    heatmap_png_base64: str  # Grad-CAM overlay, PNG


class ModelInfo(BaseModel):
    model_name: str
    backend: str
    input_size: int
    preprocess: str
    conf_threshold: float
    is_temporary: bool
