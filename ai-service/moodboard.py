"""AI Moodboard Matching (feature 2 in PhilFreela-System-Functions.md): a
client uploads a reference image and gets the freelancers whose portfolio
work looks closest to it.

The model is OpenAI's pretrained CLIP (MIT license), as the ONNX export
Hugging Face's Xenova/clip-vit-base-patch32 provides (only the vision half;
get_models.py downloads it). Nothing is trained here.

CLIP was taught to describe a picture's visual style -- color, composition,
mood -- in a way that doesn't depend on its subject, using 512 numbers (an
"embedding"). Two pictures are compared with cosine similarity: 1.0 means
the same style, lower means less alike.
"""

import io
import logging
import os

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_FILE = "clip_vision_quantized.onnx"
SLIDE_BUCKET = "slide-media"

SIZE = 224  # the model's own picture size
# CLIP's own normalization (not the same numbers ImageNet models like DINO
# use, since CLIP was taught on different training pictures).
MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)

# CLIP's cosine similarity runs high for any two ordinary pictures (they
# share "photo-ness"), so a low floor would exclude almost nothing useful
# either way -- the ranking itself (a freelancer's own style vs. everyone
# else's) is what actually tells related work from unrelated, not the raw
# number. Chosen from tests: the true match for a reference image scored
# 0.94-0.97 and clearly led the next-best freelancer (a gap of 0.03-0.13),
# while completely unrelated pictures (a flat UI screenshot against
# photographic portfolios) still scored 0.74-0.87. MIN_SCORE only excludes
# the rare, truly unrelated case; STRONG_SCORE is shown as "Strong match".
MIN_SCORE = 0.50
STRONG_SCORE = 0.90
MAX_RESULTS = 12
CATCH_UP_BATCH = 100  # slides given numbers per search, at most

log = logging.getLogger("moodboard")
_session = None


def _model():
    global _session
    if _session is None:
        _session = ort.InferenceSession(os.path.join(MODELS, MODEL_FILE), providers=["CPUExecutionProvider"])
    return _session


def image_embedding(image):
    """The picture's 512 numbers, scaled to length 1 (so cosine similarity is
    just the dot product)."""
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32)
    small = cv2.resize(pixels, (SIZE, SIZE), interpolation=cv2.INTER_AREA)
    x = ((small / 255 - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    out = _model().run(None, {"pixel_values": x})[0][0]
    return out / np.linalg.norm(out)


def vector_text(numbers):
    """The numbers in the text form the database's vector type reads."""
    return "[" + ",".join(f"{x:.6f}" for x in numbers) + "]"


def catch_up(supabase):
    """Gives portfolio images from verified freelancers their style numbers,
    for slides uploaded before this feature existed or a freelancer's
    verification since came through. Returns how many were done."""
    slides = supabase.rpc("slides_to_embed", {"max_rows": CATCH_UP_BATCH}).execute().data or []
    storage = supabase.storage.from_(SLIDE_BUCKET)
    rows = []
    for slide in slides:
        try:
            data = storage.download(slide["file_path"])
            embedding = image_embedding(Image.open(io.BytesIO(data)))
        except Exception:
            log.exception("Couldn't read slide %s for moodboard matching", slide["slide_id"])
            continue
        rows.append({"slide_id": slide["slide_id"], "freelancer_id": slide["freelancer_id"], "embedding": vector_text(embedding)})
    if rows:
        supabase.table("style_embeddings").upsert(rows, on_conflict="slide_id").execute()
    return len(slides)


def match_moodboard(supabase, reference_image):
    """Freelancers whose portfolio work looks closest to `reference_image`
    (a PIL Image), best first: [{"freelancer_id", "slide_id", "score",
    "strong"}]. Only ids and a score: the website loads the freelancer and
    the slide itself, under the normal database rules."""
    try:
        catch_up(supabase)
    except Exception:
        # Matching still works with the numbers already saved.
        log.exception("Couldn't update the moodboard numbers")

    query = image_embedding(reference_image)
    rows = supabase.rpc("closest_styles", {"query": vector_text(query), "how_many": MAX_RESULTS}).execute().data or []
    return [
        {
            "freelancer_id": r["freelancer_id"],
            "slide_id": r["slide_id"],
            "score": round(r["similarity"], 3),
            "strong": r["similarity"] >= STRONG_SCORE,
        }
        for r in rows
        if r["similarity"] >= MIN_SCORE
    ]
