"""
SmartVision - AI Detector Inference Module (v2-sq256-jpeg85)
Loads CLIP encoder and trained LogisticRegression classifier once at startup.
Inference only; strictly produces real model predictions.
"""

import io
import os
import threading
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
from PIL import Image, ImageFile, ImageOps, UnidentifiedImageError

ImageFile.LOAD_TRUNCATED_IMAGES = True
PIPELINE_VERSION = "v2-sq256-jpeg85"
CLIP_ID = "openai/clip-vit-base-patch32"
BASE_SIZE, FINAL_JPEG_Q = 256, 85
CLASS_NAMES = ["Real", "AI-generated"]
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
DEFAULT_REAL_MAX, DEFAULT_AI_MIN = 0.25, 0.75
RESAMPLE = getattr(Image, "Resampling", Image).BICUBIC


def load_rgb(source):
    if isinstance(source, (bytes, bytearray)):
        source = io.BytesIO(source)
    img = Image.open(source)
    img.load()
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return img.convert("RGB")


def square_resize(img, size=BASE_SIZE):
    w, h = img.size
    s = size / float(min(w, h))
    nw, nh = max(size, int(round(w * s))), max(size, int(round(h * s)))
    img = img.resize((nw, nh), RESAMPLE)
    l, t = (nw - size) // 2, (nh - size) // 2
    return img.crop((l, t, l + size, t + size))


def jpeg_roundtrip(img, quality):
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=int(quality))
    buf.seek(0)
    out = Image.open(buf)
    out.load()
    return out.convert("RGB")


def normalize_image(img):
    return jpeg_roundtrip(square_resize(img), FINAL_JPEG_Q)


class ClipEncoder:
    def __init__(self, clip_id=CLIP_ID, device=None, batch_size=64):
        import torch
        from transformers import CLIPModel, CLIPProcessor
        self.torch = torch
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        self.processor = CLIPProcessor.from_pretrained(clip_id)
        self.model = CLIPModel.from_pretrained(clip_id).to(self.device).eval()
        self.batch_size = batch_size

    def encode(self, images):
        torch = self.torch
        out = []
        with torch.no_grad():
            for i in range(0, len(images), self.batch_size):
                px = self.processor.image_processor(
                    images=images[i:i + self.batch_size],
                    return_tensors="pt"
                )["pixel_values"].to(self.device)
                f = self.model.get_image_features(pixel_values=px)
                if not torch.is_tensor(f):
                    f = f.pooler_output if hasattr(f, "pooler_output") else f[0]
                f = f.float()
                f = f / f.norm(dim=-1, keepdim=True)
                out.append(f.cpu().numpy().astype(np.float32))
        return np.vstack(out) if out else np.zeros((0, 512), np.float32)


def verdict_from_probability(p, real_max, ai_min):
    return "likely_ai" if p >= ai_min else ("likely_real" if p <= real_max else "uncertain")


# Default model location — reads v1 or v2 bundles
MODEL_PATH = Path(__file__).resolve().parent / "models" / "ai_detector.joblib"


class AIDetectorService:
    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_PATH
        self.classifier = None
        self.encoder: Optional[ClipEncoder] = None
        self.clip_model = None
        self.clip_processor = None
        self.device = None
        self.is_loaded = False
        self.error_reason = None
        self.real_max = DEFAULT_REAL_MAX
        self.ai_min = DEFAULT_AI_MIN
        self.lock = threading.Lock()

    def load(self) -> None:
        """Loads CLIP encoder and saved classifier once at application startup."""
        env_path = os.getenv("AI_DETECTOR_PATH")
        if env_path:
            candidates = [Path(env_path)]
        else:
            candidates = [
                self.model_path,
                self.model_path.parent / "ai_detector_v2.joblib",
                self.model_path.parent / "ai_detector_v1.joblib",
            ]

        bundle_path = None
        for p in candidates:
            if p.exists():
                bundle_path = p
                break

        if bundle_path is None:
            self.error_reason = (
                f"Model file not found. Checked: {', '.join(p.name for p in candidates)}. "
                "The AI detector has not been trained yet. Please run training/ai_detector/train.py first."
            )
            self.is_loaded = False
            return

        try:
            import joblib
        except ImportError as e:
            self.error_reason = f"Required ML dependency missing: {e}."
            self.is_loaded = False
            return

        try:
            bundle = joblib.load(bundle_path)
            if not isinstance(bundle, dict) or bundle.get("pipeline_version") != PIPELINE_VERSION:
                self.is_loaded = False
                self.error_reason = "Model was trained with a different pipeline. Retrain with train.py."
                return

            self.classifier = bundle["classifier"]
            self.real_max = float(os.getenv("AI_DETECTOR_REAL_MAX", bundle.get("real_max", DEFAULT_REAL_MAX)))
            self.ai_min = float(os.getenv("AI_DETECTOR_AI_MIN", bundle.get("ai_min", DEFAULT_AI_MIN)))
            clip_model_name = bundle.get("clip_model_name", CLIP_ID)

            self.encoder = ClipEncoder(clip_model_name)
            self.clip_model = self.encoder.model
            self.clip_processor = self.encoder.processor
            self.device = self.encoder.device

            gray_img = Image.new("RGB", (256, 256), (128, 128, 128))
            probe = self.encoder.encode([gray_img])
            expected_feats = getattr(self.classifier, "n_features_in_", probe.shape[1])
            if probe.shape[1] != expected_feats:
                self.is_loaded = False
                self.error_reason = (
                    f"Feature dimension mismatch: encoder produced {probe.shape[1]}, "
                    f"classifier expects {expected_feats}."
                )
                return

            self.is_loaded = True
            self.error_reason = None
            print(f"[SmartVision] AI Detector loaded from {bundle_path.name} "
                  f"(Pipeline: {PIPELINE_VERSION}, real_max: {self.real_max:.2f}, ai_min: {self.ai_min:.2f})")
        except Exception as e:
            self.error_reason = f"Failed to load AI detector model: {e}"
            self.is_loaded = False
            print(f"[SmartVision] Warning: Failed to load AI detector: {e}")

    def _normalize_image(self, pil_img: Image.Image) -> Image.Image:
        """Use the exact same pipeline as training: square_resize → jpeg_roundtrip(FINAL_JPEG_Q).
        This ensures inference preprocessing perfectly matches what the CLIP encoder saw
        during CLIP feature extraction at training time (FINAL_JPEG_Q=85, BASE_SIZE=256).
        """
        pil_img = ImageOps.exif_transpose(pil_img).convert("RGB")
        return normalize_image(pil_img)  # square_resize(256) + jpeg_roundtrip(85)


    def detect_ai(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Runs inference on raw image bytes.
        """
        if not self.is_loaded or self.classifier is None:
            raise RuntimeError(
                self.error_reason
                or "The AI detector has not been trained yet. Please run training/ai_detector/train.py first."
            )

        if not image_bytes:
            raise ValueError("Empty image payload received.")

        try:
            img = load_rgb(image_bytes)
        except Exception as e:
            raise ValueError(f"Could not read image file or corrupted image data: {e}") from e

        if min(img.size) < 32:
            raise ValueError(f"Image is too small ({img.size[0]}x{img.size[1]}); minimum dimension is 32px.")

        if self.encoder is None:
            raise RuntimeError(self.error_reason or "CLIP encoder not loaded.")

        with self.lock:
            feats = self.encoder.encode([normalize_image(img)])

        classes = list(self.classifier.classes_)
        idx_ai = classes.index(1) if 1 in classes else 1
        probs = self.classifier.predict_proba(feats)[0]
        p_ai = float(probs[idx_ai])

        verdict = verdict_from_probability(p_ai, self.real_max, self.ai_min)

        label_map = {
            "likely_ai": "AI-generated",
            "likely_real": "Real",
            "uncertain": "Uncertain",
        }

        return {
            "ai_probability": round(p_ai, 4),
            "verdict": verdict,
            "thresholds": {"real_max": self.real_max, "ai_min": self.ai_min},
            "label": label_map[verdict],
            "confidence": round(max(p_ai, 1 - p_ai), 4),
            "probabilities": {
                "real": round(1 - p_ai, 4),
                "ai": round(p_ai, 4),
            },
        }


# Global detector service instance loaded once at startup
detector_service = AIDetectorService()


def detect_ai(image_bytes: bytes) -> Dict[str, Any]:
    """Inference wrapper function for the AI detector."""
    return detector_service.detect_ai(image_bytes)
