"""The copy check: how alike two pictures are, using a Vision Transformer
(watermarking system, step 5).

The model is Meta's pretrained DINO ViT-S/16 (facebook/dino-vits16, Apache 2.0
license), as the ONNX file Hugging Face's Xenova/dino-vits16 provides;
get_models.py downloads it. Nothing is trained here.

A Vision Transformer cuts a picture into 16x16-pixel squares, and its layers
of "attention" let every square look at every other square. DINO taught it,
without labels, to describe a picture by what's in it, so a picture and an
edited copy of it (resized, cropped a little, recompressed, watermarked) get
almost the same description, while different pictures get different ones.

The description is 384 numbers (an "embedding"). Two pictures are compared
with cosine similarity: 1.0 means the same direction (same picture), lower
means less alike.
"""

import os

import cv2
import numpy as np
import onnxruntime as ort

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_FILE = "dino_vits16_model_quantized.onnx"
SIZE = 224  # the model's own picture size
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_session = None


def _model(model_file=MODEL_FILE):
    global _session
    if _session is None or model_file != MODEL_FILE:
        session = ort.InferenceSession(os.path.join(MODELS, model_file), providers=["CPUExecutionProvider"])
        if model_file != MODEL_FILE:
            return session
        _session = session
    return _session


def image_embedding(image, model_file=MODEL_FILE):
    """The picture's 384 numbers, scaled to length 1 (so cosine similarity is
    just the dot product)."""
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32)
    small = cv2.resize(pixels, (SIZE, SIZE), interpolation=cv2.INTER_AREA)
    x = ((small / 255 - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    # The first token of the output ("CLS") sums up the whole picture.
    cls = _model(model_file).run(None, {"pixel_values": x})[0][0, 0]
    return cls / np.linalg.norm(cls)


def similarity(a, b):
    """Cosine similarity of two embeddings: 1.0 = the same picture."""
    return float(np.dot(a, b))
