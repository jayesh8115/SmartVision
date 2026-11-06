"""
SmartVision - AI-Generated Image Detector Training Script (v2-sq256-jpeg85)

Rebuilt with:
  - Imports ai_detector as core (looks in train.py's folder, then backend, ignoring .venv/site-packages)
  - Auto-locates dataset directory containing real_pool in /kaggle/input and dataset/
  - Pools: real_pool (label 0), gan_pool/sd_pool/mj_pool (label 1), optional extra-dir and own-dir
  - Each item = (path, label, source)
  - Image.open().verify() check on all files; seeded shuffle; no fixed-number slicing, no undersampling
  - Exact cut() implementation for proportional splitting
  - Three views (train_a, train_b, eval) ending in core.normalize_image
  - ThreadPoolExecutor(4) for image prep + core.ClipEncoder(64)
  - Stacked train_a + train_b for training set
  - Balanced sample_weights() by class and source
  - LogisticRegression tuning across C in [0.1, 0.5, 1, 2, 5, 10, 50] minimizing weighted log_loss on val
  - Exact pick_thresholds() for calibrated real_max and ai_min
  - Rich evaluation: AUC, accuracy@0.5, % uncertain, accuracy when confident, cross-class error rates, per-source breakdown
  - Heldout AUC with rule-of-thumb rating
  - Saves metrics JSON in results/ next to cache folder
"""

import argparse
import hashlib
import io
import json
import math
import os
import random
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ------------------------------------------------------------------------------
# 1. RESOLVE CORE IMPORT
# ------------------------------------------------------------------------------
# Look for ai_detector.py in train.py's own folder first, then under backend (ignore .venv/site-packages)
_train_dir = Path(__file__).resolve().parent
_candidates = [
    _train_dir,
    _train_dir.parent.parent / "backend",
    _train_dir.parent / "backend",
]
_target_dir = None
for _c in _candidates:
    if (_c / "ai_detector.py").is_file() and ".venv" not in _c.parts and "site-packages" not in _c.parts:
        _target_dir = _c
        break

if _target_dir is None:
    for _p in _train_dir.resolve().parents:
        _backend_cand = _p / "backend"
        if _backend_cand.is_dir() and (_backend_cand / "ai_detector.py").is_file():
            if ".venv" not in _backend_cand.parts and "site-packages" not in _backend_cand.parts:
                _target_dir = _backend_cand
                break

if _target_dir is not None and str(_target_dir) not in sys.path:
    sys.path.insert(0, str(_target_dir))

import ai_detector as core

import joblib
import matplotlib.pyplot as plt
import numpy as np
import torch
from PIL import Image, ImageFilter
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from tqdm import tqdm

# ==============================================================================
# CONFIGURATION BLOCK (Defaults)
# ==============================================================================
DEFAULT_CACHE_DIR = (
    "/kaggle/working/cache"
    if Path("/kaggle/working").exists()
    else str(Path(__file__).resolve().parent / "_out" / "cache")
)
DEFAULT_CLIP_MODEL = getattr(core, "CLIP_ID", "openai/clip-vit-base-patch32")
DEFAULT_BATCH_SIZE = 64
DEFAULT_SEED = 42
C_GRID = [0.1, 0.5, 1, 2, 5, 10, 50]

CLASS_NAMES = getattr(core, "CLASS_NAMES", ["Real", "AI-generated"])


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


# ==============================================================================
# IMAGE PREPARATION (Three views: train_a, train_b, eval)
# ==============================================================================

def degrade(img: Image.Image, rng: random.Random) -> Image.Image:
    w, h = img.size
    if rng.random() < 0.6:
        s = rng.uniform(0.5, 1.0)
        img = img.resize((max(32, int(w * s)), max(32, int(h * s))), core.RESAMPLE)
        if rng.random() < 0.5:
            img = img.resize((w, h), core.RESAMPLE)
    if rng.random() < 0.3:
        img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.2)))
    for _ in range(rng.choice([1, 1, 2])):
        img = core.jpeg_roundtrip(img, rng.randint(40, 95))
    return img


def prep(view: str, path: Path, idx: int, seed: int) -> Image.Image:
    img = core.load_rgb(path)
    rng = random.Random(f"{seed}-{view}-{idx}")
    if view == "train_a" and rng.random() < 0.5:
        img = core.jpeg_roundtrip(img, rng.randint(60, 95))
    elif view == "train_b":
        img = degrade(img, rng)
    return core.normalize_image(img)  # view "eval" = no extra step


# ==============================================================================
# DATA LOADING & SPLITTING
# ==============================================================================

def cut(files, fr):
    n = len(files); counts = [int(n * f) for f in fr]
    last = max(i for i, f in enumerate(fr) if f > 0)
    counts[last] += n - sum(counts)
    parts, start = [], 0
    for c in counts: parts.append(files[start:start + c]); start += c
    return parts


def sample_weights(items):
    y = np.array([it[1] for it in items]); src = np.array([it[2] for it in items])
    w = np.zeros(len(items))
    for cls in (0, 1):
        counts = Counter(src[y == cls].tolist())
        if not counts: continue
        shares = {s: math.sqrt(n) for s, n in counts.items()}; total = sum(shares.values())
        for s, n in counts.items(): w[(y == cls) & (src == s)] = (shares[s] / total) / n
    return w * (len(w) / w.sum())


def pick_thresholds(p_val, y_val):
    grid = np.linspace(0.02, 0.98, 97)
    p_real, p_ai = p_val[y_val == 0], p_val[y_val == 1]
    ai_min = next((float(t) for t in grid if np.mean(p_real >= t) <= 0.03), None)
    real_max = next((float(t) for t in grid[::-1] if np.mean(p_ai <= t) <= 0.10), None)
    if ai_min is None or real_max is None:
        print("WARNING: weak separation, using defaults")
        return core.DEFAULT_REAL_MAX, core.DEFAULT_AI_MIN
    return round(min(real_max, 0.40), 2), round(max(ai_min, 0.60), 2)


def find_dataset_dir(candidate: Optional[str] = None) -> Path:
    """Auto-find the folder containing real_pool in /kaggle/input and dataset/."""
    if candidate:
        p = Path(candidate)
        if (p / "real_pool").is_dir():
            return p
        if p.exists():
            for sub in p.rglob("real_pool"):
                if sub.is_dir():
                    return sub.parent

    search_roots = [
        Path("/kaggle/input"),
        Path("dataset"),
        Path(__file__).resolve().parent.parent.parent / "dataset",
        Path.cwd() / "dataset",
    ]
    for root in search_roots:
        if root.exists():
            if (root / "real_pool").is_dir():
                return root
            for sub in root.rglob("real_pool"):
                if sub.is_dir():
                    return sub.parent

    return Path("dataset/archive")


def get_default_output_model_path(smoke: bool = False) -> Path:
    filename = "ai_detector_smoke.joblib" if smoke else "ai_detector.joblib"
    if Path("/kaggle/working").exists():
        return Path("/kaggle/working/export") / filename
    return Path("backend/models") / filename


def load_pool_files(
    pool_dir: Path,
    label: int,
    source: str,
    seed: int,
    smoke: bool = False,
) -> Tuple[List[Tuple[Path, int, str]], Dict[str, int], List[str]]:
    """
    Scans pool_dir for images, verifies each with Image.open().verify(),
    applies seeded shuffle, and records extensions and sample image sizes.
    If smoke: limits to at most 100 verified images.
    Returns (items, ext_counts, sample_sizes). Each item = (path, label, source).
    """
    if not pool_dir.exists():
        return [], {}, []

    valid_exts = getattr(core, "IMAGE_EXTS", {".jpg", ".jpeg", ".png", ".webp", ".bmp"})
    raw_files = [p for p in pool_dir.rglob("*") if p.is_file() and p.suffix.lower() in valid_exts]
    raw_files.sort()

    rng = random.Random(seed)
    rng.shuffle(raw_files)

    verified: List[Tuple[Path, int, str]] = []
    ext_counts: Dict[str, int] = {}
    sample_sizes: List[str] = []

    for p in raw_files:
        try:
            with Image.open(p) as img:
                img.verify()
        except Exception:
            continue

        if len(sample_sizes) < 3:
            try:
                with Image.open(p) as img:
                    sample_sizes.append(f"{img.size[0]}x{img.size[1]}")
            except Exception:
                pass

        ext = p.suffix.lower()
        ext_counts[ext] = ext_counts.get(ext, 0) + 1
        verified.append((p, label, source))

        if smoke and len(verified) >= 100:
            break

    return verified, ext_counts, sample_sizes


def prepare_data_splits(
    dataset_dir: Path,
    extra_dir: Optional[str] = None,
    own_dir: Optional[str] = None,
    final: bool = False,
    smoke: bool = False,
    seed: int = DEFAULT_SEED,
) -> Tuple[
    List[Tuple[Path, int, str]],  # train
    List[Tuple[Path, int, str]],  # val
    List[Tuple[Path, int, str]],  # test
    List[Tuple[Path, int, str]],  # heldout
    List[Tuple[Path, int, str]],  # own
]:
    """
    Builds data splits based on pool specifications:
      - real_pool: train .60 / val .10 / test .15 / heldout .15  (with --final: .70/.10/.20/0)
      - gan_pool, sd_pool: train .70 / val .10 / test .20
      - mj_pool: 100% heldout (never trained on). With --final: split like gan/sd.
      - extra-dir: extra/real/** (.70/.10/.20), extra/ai/<name>/** (.70/.10/.20)
      - own-dir: own/real/ and own/ai/ (evaluation only; never trained on)
    """
    pool_stats = {}

    # 1. Main pools
    real_items, real_exts, real_sizes = load_pool_files(dataset_dir / "real_pool", 0, "real_pool", seed, smoke)
    gan_items, gan_exts, gan_sizes = load_pool_files(dataset_dir / "gan_pool", 1, "gan_pool", seed + 1, smoke)
    sd_items, sd_exts, sd_sizes = load_pool_files(dataset_dir / "sd_pool", 1, "sd_pool", seed + 2, smoke)
    mj_items, mj_exts, mj_sizes = load_pool_files(dataset_dir / "mj_pool", 1, "mj_pool", seed + 3, smoke)

    if not real_items:
        raise FileNotFoundError(f"No valid real images found in {dataset_dir / 'real_pool'}")
    if not (gan_items or sd_items or mj_items):
        raise FileNotFoundError(f"No valid AI images found in gan_pool, sd_pool, or mj_pool in {dataset_dir}")

    pool_stats["real_pool"] = (real_items, real_exts, real_sizes)
    pool_stats["gan_pool"] = (gan_items, gan_exts, gan_sizes)
    pool_stats["sd_pool"] = (sd_items, sd_exts, sd_sizes)
    pool_stats["mj_pool"] = (mj_items, mj_exts, mj_sizes)

    # Cut real_pool
    if final:
        real_train, real_val, real_test, real_heldout = cut(real_items, [0.70, 0.10, 0.20, 0.0])
    else:
        real_train, real_val, real_test, real_heldout = cut(real_items, [0.60, 0.10, 0.15, 0.15])

    # Cut gan_pool and sd_pool (.70 / .10 / .20)
    gan_train, gan_val, gan_test = cut(gan_items, [0.70, 0.10, 0.20])
    sd_train, sd_val, sd_test = cut(sd_items, [0.70, 0.10, 0.20])

    # Cut mj_pool
    if final:
        mj_train, mj_val, mj_test = cut(mj_items, [0.70, 0.10, 0.20])
        mj_heldout = []
    else:
        mj_train, mj_val, mj_test = [], [], []
        mj_heldout = list(mj_items)

    train_splits = [real_train, gan_train, sd_train, mj_train]
    val_splits = [real_val, gan_val, sd_val, mj_val]
    test_splits = [real_test, gan_test, sd_test, mj_test]
    heldout_splits = [real_heldout, mj_heldout]

    # 2. Extra directory: extra/real/** and extra/ai/<name>/**
    if extra_dir and Path(extra_dir).exists():
        ep = Path(extra_dir)
        extra_real_dir = ep / "real"
        if extra_real_dir.is_dir():
            ex_real, ex_exts, ex_sizes = load_pool_files(extra_real_dir, 0, "extra_real", seed + 4, smoke)
            if ex_real:
                pool_stats["extra_real"] = (ex_real, ex_exts, ex_sizes)
                tr, va, te = cut(ex_real, [0.70, 0.10, 0.20])
                train_splits.append(tr)
                val_splits.append(va)
                test_splits.append(te)

        extra_ai_dir = ep / "ai"
        if extra_ai_dir.is_dir():
            for idx_ai, sub in enumerate(sorted(extra_ai_dir.iterdir())):
                if sub.is_dir():
                    src_name = f"extra_{sub.name}"
                    ex_ai, ex_exts, ex_sizes = load_pool_files(sub, 1, src_name, seed + 10 + idx_ai, smoke)
                    if ex_ai:
                        pool_stats[src_name] = (ex_ai, ex_exts, ex_sizes)
                        tr, va, te = cut(ex_ai, [0.70, 0.10, 0.20])
                        train_splits.append(tr)
                        val_splits.append(va)
                        test_splits.append(te)

    # 3. Own directory (evaluated only if real/ and ai/ subfolders exist; NEVER trained on)
    own_set: List[Tuple[Path, int, str]] = []
    if own_dir and Path(own_dir).exists():
        op = Path(own_dir)
        own_real_dir = op / "real"
        own_ai_dir = op / "ai"
        if own_real_dir.is_dir() and own_ai_dir.is_dir():
            own_real, ex_exts, ex_sizes = load_pool_files(own_real_dir, 0, "own_real", seed, smoke)
            own_ai, ex_exts_ai, ex_sizes_ai = load_pool_files(own_ai_dir, 1, "own_ai", seed, smoke)
            own_set.extend(own_real)
            own_set.extend(own_ai)
            pool_stats["own_real"] = (own_real, ex_exts, ex_sizes)
            pool_stats["own_ai"] = (own_ai, ex_exts_ai, ex_sizes_ai)

    # Assemble sets
    train_set = [item for sub in train_splits for item in sub]
    val_set = [item for sub in val_splits for item in sub]
    test_set = [item for sub in test_splits for item in sub]
    heldout_set = [item for sub in heldout_splits for item in sub]

    # Deterministic shuffle within splits
    rng = random.Random(seed)
    rng.shuffle(train_set)
    rng.shuffle(val_set)
    rng.shuffle(test_set)
    rng.shuffle(heldout_set)
    rng.shuffle(own_set)

    # Leak checks
    all_train = {item[0] for item in train_set}
    all_val = {item[0] for item in val_set}
    all_test = {item[0] for item in test_set}
    all_heldout = {item[0] for item in heldout_set}
    all_own = {item[0] for item in own_set}

    assert all_train.isdisjoint(all_val), "Data leakage between train and val!"
    assert all_train.isdisjoint(all_test), "Data leakage between train and test!"
    assert all_val.isdisjoint(all_test), "Data leakage between val and test!"
    if heldout_set:
        assert all_train.isdisjoint(all_heldout), "Data leakage between train and heldout!"
        assert all_val.isdisjoint(all_heldout), "Data leakage between val and heldout!"
        assert all_test.isdisjoint(all_heldout), "Data leakage between test and heldout!"
    if own_set:
        assert all_train.isdisjoint(all_own), "CRITICAL: own images leaked into train!"
        assert all_val.isdisjoint(all_own), "CRITICAL: own images leaked into val!"

    if not final:
        assert not any(item[2] == "mj_pool" for item in train_set), "Midjourney leaked into train without --final!"
        assert not any(item[2] == "mj_pool" for item in val_set), "Midjourney leaked into val without --final!"
        assert not any(item[2] == "mj_pool" for item in test_set), "Midjourney leaked into test without --final!"

    # 4. Print stats per pool, extensions, sample image sizes, and split summaries
    print("\n--- Verified Pools Inventory & Statistics ---")
    for pool_name, (items, exts, sizes) in pool_stats.items():
        ext_str = ", ".join(f"{k}: {v}" for k, v in sorted(exts.items())) if exts else "none"
        sizes_str = ", ".join(sizes) if sizes else "n/a"
        print(f"Pool: {pool_name:<15} | Valid: {len(items):>5} images | Exts: {{{ext_str}}} | Sample sizes: [{sizes_str}]")

    print("\n======================= Dataset Splits & Sources Summary =======================")
    for split_name, items in [("train", train_set), ("val", val_set), ("test", test_set), ("heldout", heldout_set), ("own", own_set)]:
        if not items:
            print(f"Split: {split_name.upper():<8} | Total:     0 images")
            continue
        n_real = sum(1 for _, lbl, _ in items if lbl == 0)
        n_ai = sum(1 for _, lbl, _ in items if lbl == 1)
        source_counts: Dict[str, int] = {}
        for _, _, src in items:
            source_counts[src] = source_counts.get(src, 0) + 1
        src_str = ", ".join(f"{src}: {cnt}" for src, cnt in sorted(source_counts.items()))
        print(f"Split: {split_name.upper():<8} | Total: {len(items):>5} images (Real: {n_real:>5}, AI: {n_ai:>5})")
        print(f"       Sources: {src_str}")
    print("================================================================================\n")

    return train_set, val_set, test_set, heldout_set, own_set


# ==============================================================================
# FEATURE EXTRACTION & CACHING
# ==============================================================================

def compute_cache_key(view: str, seed: int, paths: List[Path]) -> str:
    """Cache key = md5(view + core.PIPELINE_VERSION + seed + all paths)."""
    payload = f"{view}{core.PIPELINE_VERSION}{seed}" + "".join(str(p) for p in paths)
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


def extract_view_features(
    items: List[Tuple[Path, int, str]],
    view: str,
    seed: int,
    encoder: core.ClipEncoder,
    batch_size: int = 64,
    desc: str = "Extracting Features",
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Prepares images in parallel using ThreadPoolExecutor(4) and encodes via encoder.encode(batch).
    """
    embeddings_list = []
    labels_list = []
    paths_list = []

    for i in tqdm(range(0, len(items), batch_size), desc=desc):
        batch_items = items[i : i + batch_size]

        def _worker(item_tuple):
            idx, item = item_tuple
            path, label, _ = item
            try:
                processed_img = prep(view, path, idx, seed)
                return processed_img, label, str(path)
            except Exception as e:
                print(f"\n[Warning] Skipping corrupt image {path}: {e}")
                return None, None, None

        with ThreadPoolExecutor(max_workers=4) as executor:
            worker_inputs = [(i + j, it) for j, it in enumerate(batch_items)]
            results = list(executor.map(_worker, worker_inputs))

        batch_imgs = []
        batch_lbls = []
        batch_paths = []
        for img, lbl, p in results:
            if img is not None:
                batch_imgs.append(img)
                batch_lbls.append(lbl)
                batch_paths.append(p)

        if not batch_imgs:
            continue

        feats = encoder.encode(batch_imgs)
        embeddings_list.append(feats)
        labels_list.extend(batch_lbls)
        paths_list.extend(batch_paths)

    X = np.vstack(embeddings_list) if embeddings_list else np.zeros((0, 512), np.float32)
    y = np.array(labels_list, dtype=np.int64)
    return X, y, paths_list


def get_or_compute_view_features(
    items: List[Tuple[Path, int, str]],
    view: str,
    seed: int,
    encoder: core.ClipEncoder,
    cache_dir: Path,
    batch_size: int = 64,
    force_recompute: bool = False,
    desc: Optional[str] = None,
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Caches features as .npy files keyed by md5(view + PIPELINE_VERSION + seed + all paths).
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    paths = [item[0] for item in items]
    cache_key = compute_cache_key(view, seed, paths)

    x_file = cache_dir / f"X_{view}_{cache_key}.npy"
    y_file = cache_dir / f"y_{view}_{cache_key}.npy"
    paths_file = cache_dir / f"paths_{view}_{cache_key}.json"

    if not force_recompute and x_file.exists() and y_file.exists():
        print(f"Loading cached {view} features (key: {cache_key[:8]}...)")
        X = np.load(x_file)
        y = np.load(y_file)
        paths_str = [str(p) for p in paths]
        if paths_file.exists():
            try:
                with open(paths_file, "r") as f:
                    paths_str = json.load(f)
            except Exception:
                pass
        if len(X) == len(items):
            return X, y, paths_str
        print(f"Cached item count ({len(X)}) != expected ({len(items)}). Recomputing...")

    X, y, saved_paths = extract_view_features(
        items,
        view=view,
        seed=seed,
        encoder=encoder,
        batch_size=batch_size,
        desc=desc or f"Extracting {view}",
    )
    np.save(x_file, X)
    np.save(y_file, y)
    try:
        with open(paths_file, "w") as f:
            json.dump(saved_paths, f)
    except Exception:
        pass

    return X, y, saved_paths


# ==============================================================================
# EVALUATION & DETAILED SPLIT REPORTING
# ==============================================================================

def evaluate_split_metrics(
    items: List[Tuple[Path, int, str]],
    p: np.ndarray,
    real_max: float,
    ai_min: float,
    split_name: str,
) -> Dict[str, Any]:
    """
    Evaluates split with:
      n, AUC, accuracy@0.5, % uncertain, accuracy when confident,
      rate real->likely AI, rate AI->likely real, and PER SOURCE breakdown:
      mean P(AI) plus fractions correct / uncertain / wrong.
    """
    y = np.array([it[1] for it in items], dtype=np.int64)
    sources = np.array([it[2] for it in items])
    n = len(y)

    # 1. AUC
    if len(np.unique(y)) == 2:
        auc = float(roc_auc_score(y, p))
    else:
        auc = None

    # 2. Accuracy @ 0.5
    preds_50 = (p >= 0.50).astype(int)
    acc_50 = float(np.mean(preds_50 == y)) if n > 0 else 0.0

    # 3. % uncertain (real_max < p < ai_min)
    is_uncertain = (p > real_max) & (p < ai_min)
    pct_uncertain = float(np.mean(is_uncertain) * 100.0) if n > 0 else 0.0

    # 4. Accuracy when confident (on subset where p <= real_max or p >= ai_min)
    is_confident = (p <= real_max) | (p >= ai_min)
    n_conf = int(np.sum(is_confident))
    if n_conf > 0:
        pred_conf = (p[is_confident] >= ai_min).astype(int)
        acc_confident = float(np.mean(pred_conf == y[is_confident]))
    else:
        acc_confident = 0.0

    # 5. Rate real -> likely AI (y == 0 with p >= ai_min)
    real_mask = (y == 0)
    n_real = int(np.sum(real_mask))
    rate_real_to_likely_ai = float(np.mean(p[real_mask] >= ai_min)) if n_real > 0 else 0.0

    # 6. Rate AI -> likely real (y == 1 with p <= real_max)
    ai_mask = (y == 1)
    n_ai = int(np.sum(ai_mask))
    rate_ai_to_likely_real = float(np.mean(p[ai_mask] <= real_max)) if n_ai > 0 else 0.0

    # 7. PER SOURCE breakdown
    per_source = {}
    for s in sorted(list(set(sources.tolist()))):
        s_mask = (sources == s)
        y_s = y[s_mask]
        p_s = p[s_mask]
        n_s = len(y_s)
        mean_p_s = float(np.mean(p_s))
        if y_s[0] == 0:  # Real class
            corr = (p_s <= real_max)
            unc = (p_s > real_max) & (p_s < ai_min)
            wrg = (p_s >= ai_min)
        else:  # AI class
            corr = (p_s >= ai_min)
            unc = (p_s > real_max) & (p_s < ai_min)
            wrg = (p_s <= real_max)
        per_source[s] = {
            "n": n_s,
            "mean_p_ai": round(mean_p_s, 4),
            "frac_correct": round(float(np.mean(corr)), 4),
            "frac_uncertain": round(float(np.mean(unc)), 4),
            "frac_wrong": round(float(np.mean(wrg)), 4),
        }

    # Print Report
    auc_str = f"{auc:.4f}" if auc is not None else "N/A"
    print(f"\n================================================================================")
    print(f"Metrics for: {split_name.upper()} (Thresholds: real_max={real_max:.2f}, ai_min={ai_min:.2f})")
    print(f"  n:                         {n}")
    print(f"  AUC:                       {auc_str}")
    print(f"  accuracy@0.5:              {acc_50 * 100:.2f}%")
    print(f"  % uncertain:               {pct_uncertain:.2f}%")
    print(f"  accuracy when confident:   {acc_confident * 100:.2f}% (on {n_conf}/{n} images)")
    print(f"  rate real->likely AI:      {rate_real_to_likely_ai * 100:.2f}%")
    print(f"  rate AI->likely real:      {rate_ai_to_likely_real * 100:.2f}%")
    print(f"  --- Per Source Breakdown ---")
    for s, stats in per_source.items():
        print(f"    - {s:<15} (n={stats['n']:>4}): mean P(AI) = {stats['mean_p_ai']:.3f} | "
              f"correct: {stats['frac_correct']*100:.1f}% | "
              f"uncertain: {stats['frac_uncertain']*100:.1f}% | "
              f"wrong: {stats['frac_wrong']*100:.1f}%")

    # Rule of thumb for heldout
    if split_name.lower() in ("heldout", "held_out") and auc is not None:
        if auc >= 0.90:
            thumb = "good"
        elif auc >= 0.75:
            thumb = "weak"
        else:
            thumb = "poor"
        print(f"\n  >>> Heldout Generator AUC: {auc:.4f} ({thumb}) [Rule of thumb: >=0.90 good, 0.75-0.90 weak, <0.75 poor] <<<")

    print(f"================================================================================\n")

    return {
        "n": n,
        "auc": round(auc, 4) if auc is not None else None,
        "accuracy_at_05": round(acc_50, 4),
        "pct_uncertain": round(pct_uncertain, 2),
        "accuracy_when_confident": round(acc_confident, 4),
        "rate_real_to_likely_ai": round(rate_real_to_likely_ai, 4),
        "rate_ai_to_likely_real": round(rate_ai_to_likely_real, 4),
        "per_source": per_source,
    }


# ==============================================================================
# MAIN TRAINING PIPELINE
# ==============================================================================

def train_and_evaluate(args: argparse.Namespace) -> None:
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using compute device: {device}")

    if args.smoke:
        print("\n**************************************************")
        print("  SMOKE run - do not deploy")
        print("**************************************************\n")

    # Auto-find dataset directory containing real_pool
    dataset_dir = find_dataset_dir(args.dataset_dir)
    print(f"Resolved dataset directory: {dataset_dir}")

    cache_dir = Path(args.cache_dir)
    # Results directory next to the cache folder
    results_dir = cache_dir.parent / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    if args.output_model is None:
        output_model_path = get_default_output_model_path(smoke=args.smoke)
    else:
        output_model_path = Path(args.output_model)
        if args.smoke and output_model_path.name == "ai_detector.joblib":
            output_model_path = output_model_path.parent / "ai_detector_smoke.joblib"

    # Step 1: Splits
    train_set, val_set, test_set, heldout_set, own_set = prepare_data_splits(
        dataset_dir=dataset_dir,
        extra_dir=args.extra_dir,
        own_dir=args.own_dir,
        final=args.final,
        smoke=args.smoke,
        seed=args.seed,
    )

    # Step 2: Initialize encoder via core
    print(f"\nInitializing CLIP encoder: {args.clip_model} ...")
    encoder = core.ClipEncoder(clip_id=args.clip_model, device=str(device), batch_size=args.batch_size)

    # Step 3: Feature Extraction
    # Training set = train_a + train_b stacked (duplicate labels)
    print("\n--- Feature Extraction: Training Set (train_a + train_b stacked) ---")
    X_train_a, y_train_a, _ = get_or_compute_view_features(
        train_set, view="train_a", seed=args.seed, encoder=encoder,
        cache_dir=cache_dir, batch_size=args.batch_size, force_recompute=args.force_recompute,
        desc="Extracting train_a",
    )
    X_train_b, y_train_b, _ = get_or_compute_view_features(
        train_set, view="train_b", seed=args.seed, encoder=encoder,
        cache_dir=cache_dir, batch_size=args.batch_size, force_recompute=args.force_recompute,
        desc="Extracting train_b",
    )
    X_train = np.vstack([X_train_a, X_train_b])
    y_train = np.concatenate([y_train_a, y_train_b])
    print(f"Stacked training set: {X_train.shape[0]} samples (Real: {(y_train == 0).sum()}, AI: {(y_train == 1).sum()})")

    # Validation set (view = "eval")
    print("\n--- Feature Extraction: Validation Set (eval) ---")
    X_val, y_val, _ = get_or_compute_view_features(
        val_set, view="eval", seed=args.seed, encoder=encoder,
        cache_dir=cache_dir, batch_size=args.batch_size, force_recompute=args.force_recompute,
        desc="Extracting val (eval)",
    )

    # Test set (view = "eval")
    print("\n--- Feature Extraction: Test Set (eval) ---")
    X_test, y_test, _ = get_or_compute_view_features(
        test_set, view="eval", seed=args.seed, encoder=encoder,
        cache_dir=cache_dir, batch_size=args.batch_size, force_recompute=args.force_recompute,
        desc="Extracting test (eval)",
    )

    # Held-out test set (view = "eval", if non-empty)
    X_heldout, y_heldout = None, None
    if heldout_set:
        print("\n--- Feature Extraction: Held-out Test Set (eval) ---")
        X_heldout, y_heldout, _ = get_or_compute_view_features(
            heldout_set, view="eval", seed=args.seed, encoder=encoder,
            cache_dir=cache_dir, batch_size=args.batch_size, force_recompute=args.force_recompute,
            desc="Extracting heldout (eval)",
        )

    # Own custom test set (view = "eval", if non-empty)
    X_own, y_own = None, None
    if own_set:
        print("\n--- Feature Extraction: Custom Own Set (eval) ---")
        X_own, y_own, _ = get_or_compute_view_features(
            own_set, view="eval", seed=args.seed, encoder=encoder,
            cache_dir=cache_dir, batch_size=args.batch_size, force_recompute=args.force_recompute,
            desc="Extracting own (eval)",
        )

    # Step 4: Sample Weights & Hyperparameter Tuning on Validation LogLoss
    print("\n--- Hyperparameter Tuning: C in [0.1, 0.5, 1, 2, 5, 10, 50] (Weighted LogLoss on Val) ---")
    train_items_stacked = list(train_set) + list(train_set)
    w_train = sample_weights(train_items_stacked)
    w_val = sample_weights(val_set)

    best_c = None
    best_val_loss = float("inf")
    best_clf = None

    for c_val in C_GRID:
        clf_candidate = LogisticRegression(
            C=c_val, max_iter=3000, solver="lbfgs", random_state=args.seed,
        )
        clf_candidate.fit(X_train, y_train, sample_weight=w_train)
        probs_val = clf_candidate.predict_proba(X_val)
        val_loss = float(log_loss(y_val, probs_val, sample_weight=w_val, labels=[0, 1]))

        preds_val = (probs_val[:, 1] >= 0.50).astype(int)
        val_f1 = f1_score(y_val, preds_val, zero_division=0)
        val_acc = accuracy_score(y_val, preds_val)
        w_norm = np.linalg.norm(clf_candidate.coef_)
        print(f"C={c_val:<6} | Weight Norm: {w_norm:.2f} | Weighted LogLoss: {val_loss:.4f} | Val Acc: {val_acc * 100:.2f}% | Val F1: {val_f1 * 100:.2f}%")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_c = c_val
            best_clf = clf_candidate

    print(f"\nBest C selected: {best_c} (Weighted Val LogLoss: {best_val_loss:.4f})")

    # Step 5: Pick Calibrated Thresholds
    print("\n--- Picking Separation Thresholds (pick_thresholds) ---")
    p_val_ai = best_clf.predict_proba(X_val)[:, 1]
    real_max, ai_min = pick_thresholds(p_val_ai, y_val)
    print(f"Selected thresholds: real_max = {real_max:.2f}, ai_min = {ai_min:.2f}")

    # Step 6: Full Evaluation on val, test, heldout (if non-empty) and own (if non-empty)
    print("\n--- Model Evaluation ---")
    metrics_summary: Dict[str, Any] = {
        "pipeline_version": core.PIPELINE_VERSION,
        "clip_model": args.clip_model,
        "best_C": best_c,
        "best_val_loss": round(best_val_loss, 4),
        "real_max": real_max,
        "ai_min": ai_min,
        "seed": args.seed,
        "final": args.final,
        "smoke": args.smoke,
        "training_views": ["train_a", "train_b"],
        "splits": {},
    }

    # Validation
    p_val_all = best_clf.predict_proba(X_val)[:, 1]
    metrics_summary["splits"]["validation"] = evaluate_split_metrics(
        val_set, p_val_all, real_max, ai_min, "val"
    )

    # Test
    p_test_all = best_clf.predict_proba(X_test)[:, 1]
    metrics_summary["splits"]["test"] = evaluate_split_metrics(
        test_set, p_test_all, real_max, ai_min, "test"
    )

    # Heldout (if non-empty)
    if X_heldout is not None and len(X_heldout) > 0:
        p_heldout_all = best_clf.predict_proba(X_heldout)[:, 1]
        metrics_summary["splits"]["heldout"] = evaluate_split_metrics(
            heldout_set, p_heldout_all, real_max, ai_min, "heldout"
        )

    # Own (if non-empty; never trained on)
    if X_own is not None and len(X_own) > 0:
        p_own_all = best_clf.predict_proba(X_own)[:, 1]
        metrics_summary["splits"]["own"] = evaluate_split_metrics(
            own_set, p_own_all, real_max, ai_min, "own"
        )

    # Save metrics JSON in results/ next to the cache folder
    metrics_file = results_dir / "metrics.json"
    with open(metrics_file, "w") as f:
        json.dump(metrics_summary, f, indent=2)
    print(f"\nSaved metrics JSON to: {metrics_file}")

    # Step 7: Save ONE joblib bundle dictionary
    output_model_path.parent.mkdir(parents=True, exist_ok=True)
    mode_str = "final" if args.final else "standard"
    sources_list = sorted(list({src for _, _, src in train_set}))
    heldout_gen = "none" if args.final else "Midjourney"
    train_date = datetime.now().isoformat()

    bundle = {
        "classifier": best_clf,
        "clip_model_name": getattr(core, "CLIP_ID", "openai/clip-vit-base-patch32"),
        "pipeline_version": core.PIPELINE_VERSION,
        "classes": getattr(core, "CLASS_NAMES", ["Real", "AI-generated"]),
        "class_order": [0, 1],
        "best_C": best_c,
        "real_max": real_max,
        "ai_min": ai_min,
        "trained_with": {
            "mode": mode_str,
            "sources": sources_list,
            "heldout_generator": heldout_gen,
            "date": train_date,
        },
        "metrics": metrics_summary,
        "smoke_run": bool(args.smoke),
    }

    joblib.dump(bundle, output_model_path)
    print(f"Saved trained detector model bundle to: {output_model_path}")
    if args.smoke:
        print("SMOKE run - do not deploy")


def main():
    parser = argparse.ArgumentParser(description="Train SmartVision AI-generated image detector")
    parser.add_argument("--dataset-dir", type=str, default=None, help="Root path containing real_pool (auto-detected if None)")
    parser.add_argument("--extra-dir", type=str, default=None, help="Optional extra images root with real/ and ai/<name>/")
    parser.add_argument("--own-dir", type=str, default=None, help="Optional own test images root (must contain real/ and ai/)")
    parser.add_argument("--final", action="store_true", default=False, help="Final training: real .70/.10/.20/0, mj_pool split like gan/sd")
    parser.add_argument("--smoke", action="store_true", default=False, help="Smoke test run: max 100 images per pool")
    parser.add_argument("--output-model", type=str, default=None, help="Target path for .joblib artifact")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Inference batch size")
    parser.add_argument("--clip-model", type=str, default=DEFAULT_CLIP_MODEL, help="HuggingFace CLIP model identifier")
    parser.add_argument("--cache-dir", type=str, default=DEFAULT_CACHE_DIR, help="Path to cached feature embeddings")
    parser.add_argument("--force-recompute", action="store_true", default=False, help="Force recomputation of feature embeddings")

    args = parser.parse_args()
    train_and_evaluate(args)


if __name__ == "__main__":
    main()
