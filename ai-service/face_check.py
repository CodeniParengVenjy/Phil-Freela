"""Face check for identity verification (eKYC).

Compares the face on a government ID with the live face scan, using two
small pretrained models that come with OpenCV (nothing is trained here):
  - YuNet finds faces in a photo. Besides each face's box it gives 5 points:
    both eyes, the nose tip and the mouth corners.
  - SFace turns a face into 128 numbers (an "embedding"). Two photos of the
    same person give similar numbers, so a small distance between the two
    embeddings means "same person".
Both files are in the models folder (0.2 MB and 37 MB), light enough to run on
a free cloud host. The SFace file is downloaded by get_models.py.
"""

import os
import threading

import cv2
import numpy as np
from PIL import ImageOps

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

# How sure YuNet must be that something is a face. 0.8 still found the small
# face printed on an ID card in our tests, without mistaking the card's text
# or patterns for a face.
FACE_SCORE = 0.8
# A head turned fully to one side (a side view) looks less like a textbook
# face, so YuNet is less sure about it. Face scan frames that may be side
# views get a second try with this lower bar.
SIDE_VIEW_SCORE = 0.5

# YuNet can miss a face that fills most of a big photo. In our sample photos,
# every face it missed was found (and none were invented) when the photo was
# shrunk to this size, so that's the backup try.
BACKUP_SIDE = 640

# Cosine distance at or below this = the same person. This is OpenCV's
# recommended SFace cut-off (similarity 0.363). On our sample photos it made
# no mistakes: the same person scored 0.49 or lower, different people 0.64 or higher.
MATCH_THRESHOLD = 0.637

# Big phone photos (4000+ pixels wide) are slow to scan and don't make the
# check more accurate, so photos are shrunk to at most this many pixels.
MAX_SIDE = 1600

SFACE_FILE = os.path.join(MODELS, "face_recognition_sface_2021dec.onnx")
if not os.path.exists(SFACE_FILE):
    raise RuntimeError("The SFace model file is missing. Run get_models.py once (see README.md).")

_YUNET_FILE = os.path.join(MODELS, "face_detection_yunet_2023mar.onnx")
_detector = cv2.FaceDetectorYN.create(_YUNET_FILE, "", (320, 320), FACE_SCORE)
_side_detector = cv2.FaceDetectorYN.create(_YUNET_FILE, "", (320, 320), SIDE_VIEW_SCORE)
_recognizer = cv2.FaceRecognizerSF.create(SFACE_FILE, "")
# The models aren't safe to use from several requests at the same time, so
# they take turns. Each check takes well under a second.
_lock = threading.Lock()


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


def to_pixels(image):
    """A Pillow image as an OpenCV pixel array (BGR color order)."""
    return np.array(image)[:, :, ::-1].copy()


def _detect(detector, pixels):
    detector.setInputSize((pixels.shape[1], pixels.shape[0]))
    _, faces = detector.detect(pixels)
    return faces


def _detect_with_backup(detector, pixels):
    """Tries the full photo, then (if nothing was found) the photo shrunk."""
    faces = _detect(detector, pixels)
    scale = BACKUP_SIDE / max(pixels.shape[:2])
    if faces is None and scale < 1:
        faces = _detect(detector, cv2.resize(pixels, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA))
        if faces is not None:
            faces = faces.copy()
            faces[:, :14] /= scale  # box and points back to full-size positions
    return faces


def find_biggest_face(pixels, side_view=False):
    """YuNet's result for the biggest face in the photo, or None.

    The result is 15 numbers: the box (x, y, width, height), the 5 points
    (right eye, left eye, nose tip, right and left mouth corner, as x, y
    pairs) and the score. The biggest face is the one we want: an ID can also
    have a small see-through "ghost" copy of the photo, and a selfie can have
    someone in the background. side_view=True (face scan frames of a turned
    head) also tries the lower bar for side views.
    """
    with _lock:
        faces = _detect_with_backup(_detector, pixels)
        if faces is None and side_view:
            faces = _detect_with_backup(_side_detector, pixels)
    if faces is None:
        return None
    return max(faces, key=lambda face: face[2] * face[3])


def _embedding(image, photo_name, side_view=False):
    """The SFace embedding of the biggest face in a photo."""
    pixels = to_pixels(image)
    face = find_biggest_face(pixels, side_view)
    if face is None:
        raise NoFaceError(f"No face found in the {photo_name}. Please retake it.")
    with _lock:
        # alignCrop uses the eye, nose and mouth points to straighten the face
        # into the small square SFace expects.
        return _recognizer.feature(_recognizer.alignCrop(pixels, face)).flatten()


def _cosine_distance(a, b):
    """0 = identical direction, bigger = more different."""
    return 1 - float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def check_faces(id_image, straight, turn_a, turn_b, half_a=None, half_b=None):
    """Compares the ID photo with the face scan.

    - Face match: the ID face vs. the "looking straight" scan frame.
    - Same person: the head during each turn vs. the straight frame, so nobody
      can swap in someone else's face partway through the scan.

    The scan sends two extra "halfway" frames (half_a, half_b), taken while
    the head was turning. SFace compares faces reliably when they look mostly
    toward the camera, but not full side views, so the same-person check uses
    the halfway frames when they're sent; the fully turned frames prove the
    head really turned (see photo_checks.check_face_scan).

    Returns {"match": True/False, "distance": number, "same_person": True/False}.
    Raises NoFaceError if a photo has no face.
    """
    id_embedding = _embedding(id_image, "ID photo")
    straight_embedding = _embedding(straight, "face scan")
    during_turns = (half_a, half_b) if half_a is not None and half_b is not None else (turn_a, turn_b)
    turned_embeddings = [_embedding(frame, "face scan", side_view=True) for frame in during_turns]

    distance = _cosine_distance(id_embedding, straight_embedding)
    same_person = all(_cosine_distance(straight_embedding, turned) <= MATCH_THRESHOLD for turned in turned_embeddings)
    return {"match": distance <= MATCH_THRESHOLD, "distance": round(distance, 4), "same_person": bool(same_person)}
