"""Grad-CAM explainability. Default layer is the last conv block of Keras ResNet-50."""
import base64
import io

import numpy as np
from PIL import Image


def make_heatmap(model, x: np.ndarray, class_index: int, last_conv: str = "conv5_block3_out") -> np.ndarray:
    import tensorflow as tf

    grad_model = tf.keras.models.Model(model.inputs, [model.get_layer(last_conv).output, model.output])
    with tf.GradientTape() as tape:
        conv_out, preds = grad_model(x[None, ...])
        score = preds[:, class_index]
    grads = tape.gradient(score, conv_out)
    weights = tf.reduce_mean(grads, axis=(0, 1, 2))
    cam = tf.reduce_sum(conv_out[0] * weights, axis=-1)
    cam = tf.nn.relu(cam)
    cam = cam / (tf.reduce_max(cam) + 1e-8)
    return cam.numpy()


def overlay_png_base64(base_img: Image.Image, cam: np.ndarray, alpha: float = 0.45) -> str:
    from matplotlib import colormaps

    resample_method = getattr(Image, "Resampling", Image).BILINEAR
    cam_img = Image.fromarray(np.uint8(255 * cam)).resize(base_img.size, resample_method)
    colored = colormaps["jet"](np.asarray(cam_img) / 255.0)[..., :3]
    blended = (1 - alpha) * np.asarray(base_img, dtype="float32") + alpha * (colored * 255)
    out = Image.fromarray(np.uint8(np.clip(blended, 0, 255)))
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()
