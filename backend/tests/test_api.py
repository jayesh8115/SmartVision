import io
import numpy as np

from fastapi.testclient import TestClient
from PIL import Image

from app.config import get_settings
from app.main import create_app


class FakeService:
    model = object()
    model_name = "fake"
    is_temporary = False

    def predict(self, image):
        top = [{"label": "dog", "confidence": 0.9}, {"label": "cat", "confidence": 0.05}, {"label": "car", "confidence": 0.01}]
        return {"status": "confident", "top": top, "ms": 1.0, "pil": image, "x": None, "class_index": 0}


def make_client():
    app = create_app(with_lifespan=False)  # no lifespan -> TensorFlow is never loaded in tests
    app.state.model_service = FakeService()
    return TestClient(app)


def png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), "red").save(buf, format="PNG")
    return buf.getvalue()


def test_health():
    assert make_client().get("/health").json()["status"] == "ok"


def test_predict_ok():
    r = make_client().post("/predict", files={"file": ("a.png", png_bytes(), "image/png")})
    assert r.status_code == 200
    assert r.json()["top1"]["label"] == "dog"
    assert len(r.json()["top_k"]) == 3


def test_predict_rejects_non_image():
    r = make_client().post("/predict", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_detect_ai_not_trained_returns_503(monkeypatch):
    from ai_detector import detector_service
    monkeypatch.setattr(detector_service, "is_loaded", False)
    monkeypatch.setattr(detector_service, "error_reason", "The AI detector has not been trained yet.")
    r = make_client().post("/detect-ai", files={"file": ("test.png", png_bytes(), "image/png")})
    assert r.status_code == 503
    assert "not been trained yet" in r.json()["detail"]


def test_detect_ai_rejects_non_image():
    r = make_client().post("/detect-ai", files={"file": ("notes.txt", b"hello world", "text/plain")})
    assert r.status_code == 415


def test_detect_ai_corrupted_image(monkeypatch):
    from ai_detector import detector_service
    monkeypatch.setattr(detector_service, "is_loaded", True)
    monkeypatch.setattr(detector_service, "classifier", object())
    monkeypatch.setattr(detector_service, "clip_model", object())
    r = make_client().post("/detect-ai", files={"file": ("bad.png", b"not-a-real-image-payload", "image/png")})
    assert r.status_code == 415


def test_detect_ai_success(monkeypatch):
    import ai_detector
    from ai_detector import detector_service
    monkeypatch.setattr(detector_service, "is_loaded", True)
    monkeypatch.setattr(detector_service, "classifier", object())
    monkeypatch.setattr(
        ai_detector,
        "detect_ai",
        lambda img_bytes: {
            "label": "AI-generated",
            "confidence": 0.9412,
            "verdict": "AI-generated",
            "ai_probability": 0.9412,
            "threshold": 0.50,
            "probabilities": {"real": 0.0588, "ai": 0.9412},
        },
    )
    r = make_client().post("/detect-ai", files={"file": ("sample.png", png_bytes(), "image/png")})
    assert r.status_code == 200
    data = r.json()
    assert data["label"] == "AI-generated"
    assert data["confidence"] == 0.9412
    assert data["verdict"] == "AI-generated"
    assert data["ai_probability"] == 0.9412
    assert data["threshold"] == 0.50
    assert data["probabilities"]["ai"] == 0.9412
    assert data["probabilities"]["real"] == 0.0588


def test_detect_ai_uncertain(monkeypatch):
    import ai_detector
    from ai_detector import detector_service
    monkeypatch.setattr(detector_service, "is_loaded", True)
    monkeypatch.setattr(detector_service, "classifier", object())
    monkeypatch.setattr(
        ai_detector,
        "detect_ai",
        lambda img_bytes: {
            "label": "Uncertain",
            "confidence": 0.52,
            "verdict": "Uncertain",
            "ai_probability": 0.48,
            "thresholds": {"real_max": 0.30, "ai_min": 0.70},
            "probabilities": {"real": 0.52, "ai": 0.48},
        },
    )
    r = make_client().post("/detect-ai", files={"file": ("sample.png", png_bytes(), "image/png")})
    assert r.status_code == 200
    data = r.json()
    assert data["label"] == "Uncertain"
    assert data["verdict"] == "Uncertain"
    assert data["thresholds"] == {"real_max": 0.30, "ai_min": 0.70}
def test_ai_detector_service_normalize():
    from ai_detector import AIDetectorService
    svc = AIDetectorService()
    img = Image.new("RGBA", (100, 100), (255, 0, 0, 128))
    norm_img = svc._normalize_image(img)
    assert norm_img.mode == "RGB"
    # normalize_image() square-resizes to BASE_SIZE=256, matching training preprocessing.
    assert norm_img.size == (256, 256)


def test_ai_detector_empty_bytes():
    import pytest
    from ai_detector import AIDetectorService
    svc = AIDetectorService()
    svc.is_loaded = True
    svc.classifier = object()
    svc.clip_model = object()
    with pytest.raises(ValueError, match="Empty image payload"):
        svc.detect_ai(b"")


def test_ai_detector_image_too_small():
    import pytest
    from ai_detector import AIDetectorService
    svc = AIDetectorService()
    svc.is_loaded = True
    svc.classifier = object()

    # Create a 16x16 image (< 32px minimum)
    small_img = Image.new("RGB", (16, 16), (255, 255, 255))
    buf = io.BytesIO()
    small_img.save(buf, format="PNG")

    with pytest.raises(ValueError, match="too small"):
        svc.detect_ai(buf.getvalue())


def test_ai_detector_pipeline_version_mismatch(monkeypatch, tmp_path):
    import joblib
    from ai_detector import AIDetectorService

    fake_bundle = {"pipeline_version": "v1-old", "classifier": object()}
    model_file = tmp_path / "model.joblib"
    joblib.dump(fake_bundle, model_file)

    svc = AIDetectorService(model_path=model_file)
    svc.load()
    assert svc.is_loaded is False
    assert svc.error_reason == "Model was trained with a different pipeline. Retrain with train.py."


def test_ai_detector_detect_ai_schema():
    from ai_detector import AIDetectorService
    svc = AIDetectorService()
    svc.is_loaded = True

    class FakeClassifier:
        classes_ = np.array([0, 1])

        def predict_proba(self, feats):
            return np.array([[0.15, 0.85]])

    class FakeEncoder:
        def encode(self, images):
            return np.zeros((len(images), 512), dtype=np.float32)

    svc.classifier = FakeClassifier()
    svc.encoder = FakeEncoder()
    svc.real_max = 0.30
    svc.ai_min = 0.70

    img = Image.new("RGB", (64, 64), (100, 100, 100))
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    res = svc.detect_ai(buf.getvalue())
    assert res["ai_probability"] == 0.85
    assert res["verdict"] == "likely_ai"
    assert res["label"] == "AI-generated"
    assert res["thresholds"] == {"real_max": 0.30, "ai_min": 0.70}
    assert res["confidence"] == 0.85
    assert res["probabilities"] == {"real": 0.15, "ai": 0.85}




