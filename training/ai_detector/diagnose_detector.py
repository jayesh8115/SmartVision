"""
SmartVision - diagnose the AI detector on images you know the answer for.

Folder layout (any folder name):
  my_test/
    real/   <- photos you KNOW are real
    ai/     <- images you KNOW are AI-generated

Usage:
  python diagnose_detector.py --own-dir my_test [--model backend/models/ai_detector.joblib]

It runs the exact same steps as the training pipeline:
  EXIF transpose -> RGB -> JPEG q=90 -> CLIP -> L2 normalize -> classifier
and then prints detailed diagnostic metrics. It also runs a 'raw' variant
(no JPEG re-encode) to show how sensitive the model is to compression.
"""

import argparse
import io
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import torch
from PIL import Image, ImageFile, ImageOps
from sklearn.metrics import roc_auc_score, roc_curve
from transformers import CLIPModel, CLIPProcessor

ImageFile.LOAD_TRUNCATED_IMAGES = True
EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
CLIP_ID = "openai/clip-vit-base-patch32"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def jpeg_reencode(img: Image.Image, q: int = 90) -> Image.Image:
    """Re-encode PIL image via JPEG in-memory to strip compression history."""
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=int(q))
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def load_items(own_dir: Path) -> List[Tuple[Path, int]]:
    """Loads image paths and ground-truth labels (0: real, 1: ai)."""
    items = []
    for label, cls in [(0, "real"), (1, "ai")]:
        d = own_dir / cls
        if not d.is_dir():
            raise SystemExit(f"Missing folder: {d} (expected 'real' and 'ai' subdirectories)")
        for p in sorted(d.rglob("*")):
            if p.suffix.lower() in EXT:
                items.append((p, label))
    if not items:
        raise SystemExit(f"No valid images found in {own_dir}")
    return items


@torch.no_grad()
def predict_dataset(
    items: List[Tuple[Path, int]],
    clf: Any,
    model: CLIPModel,
    proc: CLIPProcessor,
    mode: str = "jpeg90",
    semantic_direction: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Extracts CLIP embeddings and obtains P(AI) for each image.
    mode: 'jpeg90' (matches training pipeline) or 'raw' (no JPEG re-encode).
    """
    ai_col = list(clf.classes_).index(1)  # column index representing 'AI'
    out = []
    norms = []

    for p, _ in items:
        try:
            img = Image.open(p)
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
            if mode == "jpeg90":
                img = jpeg_reencode(img, 90)
            elif mode == "jpeg85":
                img = jpeg_reencode(img, 85)

            x = proc(images=img)["pixel_values"].to(DEVICE)
            f = model.get_image_features(pixel_values=x)
            if not torch.is_tensor(f):
                f = getattr(f, "pooler_output", f[0])
            f = f.float()
            norms.append(float(f.norm(dim=-1)))
            f_norm = torch.nn.functional.normalize(f, dim=-1).cpu().numpy()

            if semantic_direction is not None:
                sem = np.dot(f_norm, semantic_direction).reshape(-1, 1)
                feats = np.hstack([f_norm, sem])
            else:
                feats = f_norm

            proba = clf.predict_proba(feats)[0, ai_col]
            out.append(proba)
        except Exception as e:
            print(f"[Warning] Failed to process {p}: {e}")
            out.append(0.5)
            norms.append(0.0)

    return np.array(out), np.array(norms)


def summarize(title: str, items: List[Tuple[Path, int]], p: np.ndarray, norms: np.ndarray, threshold: float = 0.50) -> None:
    y = np.array([lbl for _, lbl in items])
    n_real = int((y == 0).sum())
    n_ai = int((y == 1).sum())

    pred_thr = (p >= threshold).astype(int)
    acc_thr = (pred_thr == y).mean() if len(y) > 0 else 0.0

    print(f"\n{'=' * 20} {title} {'=' * 20}")
    print(f"Total images: {len(y)} (real: {n_real}, ai: {n_ai})")
    if n_real > 0:
        print(f"Mean P(AI) on real images: {p[y == 0].mean():.3f}")
    if n_ai > 0:
        print(f"Mean P(AI) on AI images:   {p[y == 1].mean():.3f}")

    print(f"Accuracy at calibrated threshold ({threshold:.2f}): {acc_thr:.3f}")
    if n_real > 0:
        print(f"  - Real correct (Specificity): {(pred_thr[y == 0] == 0).mean():.3f}")
    if n_ai > 0:
        print(f"  - AI correct (Recall / Sensitivity):   {(pred_thr[y == 1] == 1).mean():.3f}")

    if abs(threshold - 0.50) > 0.01:
        pred_50 = (p >= 0.50).astype(int)
        acc_50 = (pred_50 == y).mean() if len(y) > 0 else 0.0
        print(f"Accuracy at standard 0.50 cutoff:        {acc_50:.3f}")

    # Uncertain band (±0.10 around threshold)
    margin = 0.10
    uncertain_mask = (p >= (threshold - margin)) & (p <= (threshold + margin))
    print(f"Uncertain images (within ±{margin} of threshold): {uncertain_mask.sum()} ({uncertain_mask.mean() * 100:.1f}%)")

    print(f"Raw CLIP feature norm (mean): {norms.mean():.2f}")

    if len(set(y.tolist())) == 2:
        auc = roc_auc_score(y, p)
        print(f"AUC-ROC: {auc:.3f}")
        fpr, tpr, thr = roc_curve(y, p)
        best_idx = np.argmax(tpr - fpr)
        print(f"Optimal threshold for these specific images: {thr[best_idx]:.3f} (for diagnostic reference only)")

        if auc < 0.4:
            print("  -> AUC < 0.4: Labels or probability columns appear FLIPPED.")
        elif auc >= 0.85 and acc_thr < 0.70:
            print("  -> Good AUC but low accuracy: Calibration / threshold shift.")
        elif auc < 0.65:
            print("  -> Low AUC: Distribution shift between test images and training generators.")
        else:
            print("  -> Good separation between Real and AI images.")

    # Show worst mistakes
    wrong = np.where(pred_thr != y)[0]
    if len(wrong) > 0:
        wrong = wrong[np.argsort(-np.abs(p[wrong] - threshold))][:8]
        print("\nTop most confident errors:")
        for idx in wrong:
            true_cls = "real" if y[idx] == 0 else "ai"
            print(f"   {items[idx][0].name:<40} true={true_cls:<5} P(AI)={p[idx]:.3f}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnose SmartVision AI Detector on labeled images")
    parser.add_argument("--own-dir", required=True, help="Directory containing real/ and ai/ subdirectories")
    parser.add_argument("--model", default="backend/models/ai_detector.joblib", help="Path to .joblib model bundle")
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        # Check fallbacks
        fallbacks = [
            model_path.parent / "ai_detector_v2.joblib",
            model_path.parent / "ai_detector_v1.joblib",
        ]
        found = False
        for fb in fallbacks:
            if fb.exists():
                print(f"Specified model not found. Using fallback: {fb}")
                model_path = fb
                found = True
                break
        if not found:
            raise SystemExit(f"Model file not found: {args.model}")

    print(f"Loading model from: {model_path}")
    raw_obj = joblib.load(model_path)

    if isinstance(raw_obj, dict) and "classifier" in raw_obj:
        clf = raw_obj["classifier"]
        threshold = float(raw_obj.get("decision_threshold", 0.50))
        clip_name = raw_obj.get("clip_model_name", CLIP_ID)
        semantic_direction = raw_obj.get("semantic_direction", None)
        print(f"Model Bundle loaded: threshold={threshold:.2f}, clip={clip_name}, semantic={'yes' if semantic_direction is not None else 'no'}")
    else:
        clf = raw_obj
        threshold = 0.50
        clip_name = CLIP_ID
        semantic_direction = None
        print(f"Raw classifier loaded: default threshold={threshold:.2f}")

    classes = list(getattr(clf, "classes_", []))
    print(f"Classifier classes_: {classes} (expected [0, 1] for Real=0, AI=1)")
    if classes != [0, 1]:
        print("[Warning] Classifier classes_ is not [0, 1]. Probabilities may be inverted.")

    print(f"Loading CLIP model '{clip_name}' on {DEVICE}...")
    model = CLIPModel.from_pretrained(clip_name).to(DEVICE).eval()
    proc = CLIPProcessor.from_pretrained(clip_name)

    items = load_items(Path(args.own_dir))

    # Evaluate with JPEG-90 normalisation (matches training pipeline)
    p_norm, n_norm = predict_dataset(items, clf, model, proc, mode="jpeg90", semantic_direction=semantic_direction)
    summarize("AS TRAINED (JPEG q=90 normalisation)", items, p_norm, n_norm, threshold=threshold)

    # Evaluate RAW (no normalisation) to diagnose compression sensitivity
    p_raw, n_raw = predict_dataset(items, clf, model, proc, mode="raw", semantic_direction=semantic_direction)
    summarize("RAW (No re-encode) — Compression Sensitivity Check", items, p_raw, n_raw, threshold=threshold)

    p_diff = np.abs(p_norm - p_raw).mean()
    print(f"\nMean absolute score difference between JPEG-90 and RAW: {p_diff:.4f}")
    if p_diff > 0.15:
        print("[Warning] High difference (> 0.15): The classifier is heavily sensitive to compression artifacts.")
    else:
        print("[Info] Moderate / low compression sensitivity: The classifier is relatively stable across compression levels.")


if __name__ == "__main__":
    main()
