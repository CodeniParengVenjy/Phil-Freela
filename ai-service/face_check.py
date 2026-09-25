"""Face check for identity verification (eKYC).

Compares the face on a government ID with a selfie using pretrained models
from the DeepFace library (nothing is trained here):
  - YuNet finds the face in each photo. It's fast (well under a second).
  - RetinaFace is the backup finder, used only when YuNet finds no face.
    It's much slower but very accurate, even on tiny faces.
  - ArcFace turns each face into 512 numbers (an "embedding"). Two photos of
    the same person give similar numbers, so a small distance between the
    two embeddings means "same person".
"""

import os
import threading

import numpy as np
from deepface import DeepFace
from PIL import ImageOps

MODEL_NAME = "ArcFace"

# Face finders, tried in this order: fast first, accurate backup second.
DETECTORS = ["yunet", "retinaface"]

# How sure YuNet must be that something is a face (DeepFace's default is 0.9).
# 0.8 still found the small face printed on an ID card in our tests, without
# mistaking the card's text or patterns for a face.
os.environ.setdefault("yunet_score_threshold", "0.8")

# DeepFace's recommended cutoff for ArcFace with cosine distance: at or below
# this, the two faces are treated as the same person.
MATCH_THRESHOLD = 0.68

# Big phone photos (4000+ pixels wide) are slow to scan and don't make the
# check more accurate, so photos are shrunk to at most this many pixels.
MAX_SIDE = 1600

# The AI models aren't safe to run from several requests at the same time, so
# checks take turns. Each one only takes a few seconds.
_model_lock = threading.Lock()


class NoFaceError(Exception):
    """A photo has no face the detector can find; the message says which one."""


def prepare_image(image):
    """Turns an opened upload into an upright, reasonably sized RGB image."""
    # Phones often save photos sideways and store "rotate me" as hidden
    # info (EXIF); this applies the rotation so the face is upright.
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    return image


def _largest_face_embedding(image, photo_name):
    """Finds every face in the photo and returns the embedding of the biggest.

    The biggest face is the one we want: an ID can also have a small
    see-through "ghost" copy of the photo, and a selfie can have someone
    in the background.
    """
    # DeepFace expects a numpy array in BGR color order (OpenCV style).
    pixels = np.array(image)[:, :, ::-1]

    for detector in DETECTORS:
        try:
            faces = DeepFace.represent(
                pixels,
                model_name=MODEL_NAME,
                detector_backend=detector,
                enforce_detection=True,
            )
        except ValueError:
            continue  # this finder saw no face; try the next one

        biggest = max(faces, key=lambda face: face["facial_area"]["w"] * face["facial_area"]["h"])
        return np.array(biggest["embedding"])

    raise NoFaceError(f"No face found in the {photo_name}. Please retake it.")


def _cosine_distance(a, b):
    """0 = identical direction, bigger = more different."""
    return 1 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def check_faces(id_image, straight, turn_a, turn_b):
    """Compares the ID photo with the face scan.

    - Face match: the ID face vs. the "looking straight" scan frame.
    - Same person: the two turned-head frames vs. the straight one, so nobody
      can swap in someone else's face partway through the scan.

    Returns {"match": True/False, "distance": number, "same_person": True/False}.
    Raises NoFaceError if a photo has no face.
    """
    with _model_lock:
        id_embedding = _largest_face_embedding(id_image, "ID photo")
        straight_embedding = _largest_face_embedding(straight, "face scan")
        turned_embeddings = [_largest_face_embedding(frame, "face scan") for frame in (turn_a, turn_b)]

    distance = float(_cosine_distance(id_embedding, straight_embedding))
    same_person = all(_cosine_distance(straight_embedding, turned) <= MATCH_THRESHOLD for turned in turned_embeddings)
    return {"match": distance <= MATCH_THRESHOLD, "distance": round(distance, 4), "same_person": bool(same_person)}
