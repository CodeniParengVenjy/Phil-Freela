"""The hidden watermark: an invisible 48-bit code in every photo, using HiDDeN
(watermarking system, step 3).

HiDDeN ("Hiding Data with Deep Networks") is Meta's pretrained model, turned
into two ONNX files by export_hidden.py (nothing is trained here):
- the encoder makes a faint pattern that carries the 48 bits, and
- the decoder reads the 48 bits back from a picture.

How a photo gets its code:
1. The photo is shrunk to 256x256 (the size the model was trained on) and the
   encoder makes the pattern for the code.
2. JND ("just noticeable difference", Meta's formula) decides how strong the
   pattern may be at each spot: stronger in busy, textured parts, weaker in
   flat, smooth parts, so people can't see it.
3. The pattern is stretched back to the photo's size and added to it.
To read a code, the photo is shrunk to 256x256 again and the decoder reads it.

Self-check: every photo is read back right after it's watermarked, from the
saved JPEG and from an extra-compressed copy. If the code doesn't come back
well enough, the pattern is made a bit stronger and tried again. Very plain
pictures (one flat color, very smooth computer graphics) have nowhere to hide
the pattern invisibly; those are saved without the code rather than rejected.

Tested on 29 photos and posters (see PLAN-watermarking.md): 25 got a code,
which still read back after JPEG compression, resizing, and screenshots.
"""

import io
import os
import secrets

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
NUM_BITS = 48
SIZE = 256  # the model's own picture size

# The normalization the model was trained with (ImageNet mean and spread).
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# Pattern strengths to try, faintest first (multipliers on the JND limit).
STRENGTHS = (1.5, 2.5, 4.0)
# Self-check: how many of the 48 bits may come back wrong. A code is still
# recognized with up to 6 wrong bits (Check Ownership, step 4), so these keep
# a safety margin.
MAX_WRONG_BITS_SAVED = 4       # from the saved photo
MAX_WRONG_BITS_COMPRESSED = 6  # from a copy re-saved as a lower-quality JPEG
SAVED_QUALITY = 90
CHECK_QUALITY = 70

# JND filters, as in Meta's hidden/attenuations.py.
KERNEL_LUMINANCE = np.array(
    [[1, 1, 1, 1, 1], [1, 2, 2, 2, 1], [1, 2, 0, 2, 1], [1, 2, 2, 2, 1], [1, 1, 1, 1, 1]], dtype=np.float32
) / 32
KERNEL_X = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
KERNEL_Y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)

_sessions = {}


def _session(name):
    """Loads an ONNX model the first time it's needed (keeps start-up fast)."""
    if name not in _sessions:
        _sessions[name] = ort.InferenceSession(os.path.join(MODELS, name), providers=["CPUExecutionProvider"])
    return _sessions[name]


def new_code():
    """A random 48-bit code (about 281 trillion possibilities)."""
    return secrets.randbits(NUM_BITS)


def wrong_bits(code_a, code_b):
    """How many of the 48 bits differ between two codes."""
    return bin(code_a ^ code_b).count("1")


def _code_to_message(code):
    """The code as the model's input: 48 numbers, -1 for a 0 bit and +1 for a 1 bit."""
    bits = [(code >> (NUM_BITS - 1 - i)) & 1 for i in range(NUM_BITS)]
    return (np.array(bits, dtype=np.float32) * 2 - 1)[None, :]


def _to_model_input(pixels):
    """256x256x3 pixels (0-255) -> the normalized 1x3x256x256 array the model takes."""
    x = (pixels / 255 - MEAN) / STD
    return np.ascontiguousarray(x.transpose(2, 0, 1)[None], dtype=np.float32)


def _jnd(pixels):
    """How much each spot of a 256x256x3 picture (0-255) can change unnoticed,
    in the same units as the model's normalized input (Meta's JND formula)."""
    gray = 0.299 * pixels[..., 0] + 0.587 * pixels[..., 1] + 0.114 * pixels[..., 2]
    # Luminance masking: changes are harder to see in very dark or bright areas.
    lum = cv2.filter2D(gray, -1, KERNEL_LUMINANCE, borderType=cv2.BORDER_CONSTANT)
    la = np.where(lum <= 127, 17 * (1 - np.sqrt(np.maximum(lum, 0) / 127)) + 3, 3 / 128 * (lum - 127) + 3)
    # Contrast masking: changes are harder to see where there are edges and texture.
    gx = cv2.filter2D(gray, -1, KERNEL_X, borderType=cv2.BORDER_CONSTANT)
    gy = cv2.filter2D(gray, -1, KERNEL_Y, borderType=cv2.BORDER_CONSTANT)
    cm = np.sqrt(gx ** 2 + gy ** 2)
    cm = 0.117 * (16 * cm ** 2.4 / (cm ** 2 + 26 ** 2))
    return ((la + cm - 0.3 * np.minimum(la, cm)) / 255).astype(np.float32)


def _add_code(image, code, strength):
    """The photo (RGB) with the code's pattern added, at the given strength."""
    pixels = np.asarray(image, dtype=np.float32)
    height, width = pixels.shape[:2]
    small = cv2.resize(pixels, (SIZE, SIZE), interpolation=cv2.INTER_AREA)
    pattern = _session("hidden_encoder.onnx").run(
        None, {"image": _to_model_input(small), "message": _code_to_message(code)}
    )[0][0].transpose(1, 2, 0)  # 256x256x3, values -1..1
    # Normalized units -> pixel units (0-255), limited by JND at each spot.
    change = pattern * _jnd(small)[..., None] * strength * STD * 255
    change = cv2.resize(change, (width, height), interpolation=cv2.INTER_CUBIC)
    return Image.fromarray(np.clip(pixels + change, 0, 255).round().astype(np.uint8))


def read_code(image):
    """Reads the 48-bit code from a photo (any size). Returns the code as a number."""
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32)
    small = cv2.resize(pixels, (SIZE, SIZE), interpolation=cv2.INTER_AREA)
    scores = _session("hidden_decoder.onnx").run(None, {"image": _to_model_input(small)})[0][0]
    code = 0
    for score in scores:
        code = (code << 1) | int(score > 0)
    return code


def _jpeg(image, quality):
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def protect_photo(image, code):
    """Hides the code in the photo, using the faintest pattern that passes the
    self-check. Returns (jpeg_bytes, has_code): has_code is False when even
    the strongest pattern doesn't read back (a very plain picture), and the
    photo is then returned without the code."""
    for strength in STRENGTHS:
        data = _jpeg(_add_code(image, code, strength), SAVED_QUALITY)
        saved = Image.open(io.BytesIO(data)).convert("RGB")
        if wrong_bits(read_code(saved), code) > MAX_WRONG_BITS_SAVED:
            continue
        compressed = Image.open(io.BytesIO(_jpeg(saved, CHECK_QUALITY)))
        if wrong_bits(read_code(compressed), code) <= MAX_WRONG_BITS_COMPRESSED:
            return data, True
    return _jpeg(image, SAVED_QUALITY), False
