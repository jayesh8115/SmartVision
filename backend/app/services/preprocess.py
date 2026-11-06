"""Single source of truth for image preparation.
Must match what the model saw during training (same as the Step-1 notebook)."""
import numpy as np
from PIL import Image


def prepare(image: Image.Image, size: int, mode: str):
    """Returns (PIL image at size x size, float32 array ready for the model, no batch dim).

    Uses ImageNet evaluation protocol:
      1. Resize shorter edge to (size * 256 // 224) using LANCZOS — higher quality
      2. Center-crop to (size x size) — matches training augmentation
    This is more accurate than a simple fit/squash for ImageNet ResNet-50.

    The caller must supply an RGB PIL Image (already EXIF-transposed and
    composited onto a white background by load_rgb in ai_detector.py).
    """
    img = image

    # Step 1: resize shorter edge to slightly larger, preserving aspect ratio
    scale_size = int(size * 256 / 224)  # e.g. 256 for size=224
    w, h = img.size
    if h < w:
        new_h, new_w = scale_size, int(w * scale_size / h)
    else:
        new_h, new_w = int(h * scale_size / w), scale_size
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Step 2: center-crop to target size
    left = (new_w - size) // 2
    top = (new_h - size) // 2
    img = img.crop((left, top, left + size, top + size))

    arr = np.asarray(img, dtype="float32")

    if mode == "resnet":
        try:
            from keras.applications.resnet50 import preprocess_input  # type: ignore
        except ImportError:
            from tensorflow.keras.applications.resnet50 import preprocess_input  # type: ignore
        arr = preprocess_input(arr.copy())
    elif mode == "rescale":
        arr = arr / 255.0
    else:
        raise ValueError(f"Unknown PREPROCESS mode: {mode}")
    return img, arr
