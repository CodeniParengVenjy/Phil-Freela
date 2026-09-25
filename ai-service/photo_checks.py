"""Quick photo checks for identity verification.

These take well under a second and don't train anything. They use:
  - OpenCV's "Laplacian variance" to measure sharpness. It measures how much
    the brightness jumps between neighbouring pixels: sharp photos have crisp
    edges (big jumps), blurry photos have soft edges (small jumps).
  - YuNet, the same pretrained face finder the face check uses. Besides each
    face's box, it returns 5 points: both eyes, the nose tip and the mouth
    corners. When a head turns, the nose moves toward one side of the eyes,
    which shows which way (and how far) it's turned.

The numbers below were picked by measuring sample photos: sharp ones, the
same ones blurred on purpose, and faces looking straight or turned.
"""

import os
import threading

import cv2
import numpy as np
from deepface import DeepFace
from deepface.commons import folder_utils

# Front of the ID: the face must be at least this wide (in pixels)...
MIN_ID_FACE_WIDTH = 120
# ...and this sharp. Sharp faces scored 175 or more; blurred ones 4 to 60.
MIN_FACE_SHARPNESS = 25
# Back of the ID: sharp photos scored 83 or more; blurred ones 2 to 24.
MIN_PHOTO_SHARPNESS = 15
# Head turn: 0 means looking straight. Straight faces measured -0.14 to +0.14
# and turned faces about ±0.25 or more.
MAX_STRAIGHT_TURN = 0.2
MIN_TURN = 0.2
# Front and back count as "the same photo" when their tiny versions differ by
# less than this (on a 0 to 255 brightness scale).
SAME_PHOTO_DIFFERENCE = 12


class PhotoProblem(Exception):
    """A photo isn't good enough; the message tells the user what to do."""


def _load_detector():
    # Asking DeepFace for YuNet downloads its model file the first time.
    DeepFace.build_model(model_name="yunet", task="face_detector")
    model_file = os.path.join(folder_utils.get_deepface_home(), ".deepface", "weights", "face_detection_yunet_2023mar.onnx")
    return cv2.FaceDetectorYN.create(model_file, "", (320, 320), 0.8)


_detector = _load_detector()
# The detector isn't safe to use from several requests at once, so they take turns.
_lock = threading.Lock()


def _biggest_face(image):
    """The biggest face in a photo as {"box": (x, y, w, h), "turn": number}, or None."""
    pixels = np.array(image)[:, :, ::-1].copy()  # OpenCV wants BGR color order
    with _lock:
        _detector.setInputSize((pixels.shape[1], pixels.shape[0]))
        _, faces = _detector.detect(pixels)
    if faces is None:
        return None

    face = max(faces, key=lambda f: f[2] * f[3])
    x, y, w, h = face[:4]
    right_eye_x, _, left_eye_x, _, nose_x = face[4:9]
    eyes_middle = (right_eye_x + left_eye_x) / 2
    eyes_apart = max(abs(left_eye_x - right_eye_x), 1)
    # How far the nose sits from the middle of the eyes, compared with the
    # distance between the eyes: 0 = straight, + or - = turned one way or the other.
    turn = (nose_x - eyes_middle) / eyes_apart
    return {"box": (int(x), int(y), int(w), int(h)), "turn": float(turn)}


def _sharpness(gray_image, width):
    """Laplacian variance, measured at a fixed width so photo size doesn't change the score."""
    resized = gray_image.resize((width, max(1, round(width * gray_image.height / gray_image.width))))
    return float(cv2.Laplacian(np.array(resized), cv2.CV_64F).var())


def _looks_like_same_photo(a, b):
    tiny_a = np.asarray(a.convert("L").resize((32, 32)), dtype=float)
    tiny_b = np.asarray(b.convert("L").resize((32, 32)), dtype=float)
    return float(np.abs(tiny_a - tiny_b).mean()) < SAME_PHOTO_DIFFERENCE


def check_id_front(image):
    """Front of the ID: a face is found, big enough, and sharp."""
    face = _biggest_face(image)
    if face is None:
        raise PhotoProblem("We couldn't find the photo on your ID. Make sure the whole front of the ID is visible, then retake it.")

    x, y, w, h = face["box"]
    if w < MIN_ID_FACE_WIDTH:
        raise PhotoProblem("Your ID looks too far away. Hold it closer so it fills most of the photo, then retake it.")

    face_crop = image.crop((max(0, x), max(0, y), x + w, y + h)).convert("L")
    if _sharpness(face_crop, 200) < MIN_FACE_SHARPNESS:
        raise PhotoProblem("The photo is blurry. Hold the ID still and make sure it's in focus, then retake it.")


def check_id_back(front, back):
    """Back of the ID: sharp, and not just the front photo again."""
    if _sharpness(back.convert("L"), 1000) < MIN_PHOTO_SHARPNESS:
        raise PhotoProblem("The photo of the back is blurry. Hold the ID still and make sure it's in focus, then retake it.")
    if _looks_like_same_photo(front, back):
        raise PhotoProblem("This looks like the same photo as the front. Turn your ID over and take a photo of the back.")


def check_face_scan(straight, turn_a, turn_b):
    """The 3 face scan frames: looking straight, then turned both ways.

    A printed photo or a picture on a screen can't turn its head, so this is
    a basic "liveness" check. Some phones mirror selfies, so "left" can look
    like "right"; what matters is that the two turns go opposite ways.
    """
    faces = [_biggest_face(frame) for frame in (straight, turn_a, turn_b)]
    if any(face is None for face in faces):
        raise PhotoProblem("Your face wasn't clear in the face scan. Please scan again in good light.")

    straight_turn, first_turn, second_turn = (face["turn"] for face in faces)
    if abs(straight_turn) > MAX_STRAIGHT_TURN:
        raise PhotoProblem("Please look straight at the camera at the start of the face scan, then scan again.")
    if abs(first_turn) < MIN_TURN or abs(second_turn) < MIN_TURN or (first_turn > 0) == (second_turn > 0):
        raise PhotoProblem("We couldn't see your head turn to both sides. Please scan again and turn a little further each way.")
