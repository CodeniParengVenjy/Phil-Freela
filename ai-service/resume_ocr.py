"""Reads the words in a picture (the resume check, step 3 of PLAN-resume-check.md):
a photo or screenshot of a resume, or a scanned PDF page. Two pretrained parts;
nothing is trained here:

1. The text FINDER marks where the lines of text are, without reading them. It
   is OpenCV's PP-OCR "DB" model (text_detection_en_ppocrv3_2023may.onnx), the
   same file photo_checks.py uses to tell an ID from a selfie.
2. The text READER reads one line at a time: PaddleOCR's PP-OCRv3 English
   model (en_PP-OCRv3_rec_infer.onnx, 9 MB, Apache 2.0, the ONNX copy in the
   RapidOCR collection on Hugging Face; get_models.py downloads it). For each
   slice of a line's picture it says which letter it sees, or none, and the
   same letter twice in a row counts once ("CTC" reading). The list of letters
   is stored inside the model file.

The lines come out from the top of the picture to the bottom, one per line, and
resume_check.py then judges them like the text of a PDF. A picture is read in
about a second or two; a time limit stops a slow one (the answer is then
"not sure", never "no").
"""

import io
import math
import os
import threading
import time

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from document_pages import render_pages

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
FINDER_FILE = "text_detection_en_ppocrv3_2023may.onnx"
READER_FILE = "en_PP-OCRv3_rec_infer.onnx"

# The finder looks at the picture at most this many pixels on its longer side,
# and a smaller picture is made bigger first (small print can't be found in a
# picture the size of a stamp).
FINDER_SIDE = 1280
SMALL_PICTURE_SIDE = 1000
MAX_PIXELS = 30_000_000            # a picture of 30 megapixels is far past any photo of a page
MAX_LINES = 150
# A box has to be a line of text to count: wider than tall, and at least this
# share of the picture wide, so the pattern of a shirt or a wall isn't read.
MIN_LINE_SHARE = 0.03
READER_HEIGHT = 48                 # every line is made this many pixels tall for the reader
MAX_LINE_WIDTH = 1600
SECONDS = 15.0                     # the most time a picture may take

# Scanned PDFs: the first pages, drawn this big (the pages of a portfolio are
# drawn at 1200, which is too small to read a resume's print).
SCAN_PAGES = 2
SCAN_SIDE = 1800

_MEAN = (122.67891434, 116.66876762, 104.00698793)  # the colors the finder was trained with
_finder = None
_finder_lock = threading.Lock()   # the finder's settings are shared, so requests take turns with it
_reader = None
_letters = None


class UnreadablePicture(Exception):
    """The bytes are not a picture that can be opened (or it is far too big)."""


def _load():
    global _finder, _reader, _letters
    if _reader is None:
        finder = cv2.dnn_TextDetectionModel_DB(cv2.dnn.readNet(os.path.join(MODELS, FINDER_FILE)))
        finder.setBinaryThreshold(0.3)
        finder.setPolygonThreshold(0.5)
        finder.setUnclipRatio(2.0)
        finder.setMaxCandidates(300)
        reader = ort.InferenceSession(os.path.join(MODELS, READER_FILE), providers=["CPUExecutionProvider"])
        # Index 0 is "no letter", then the model's own list of letters, then a space (what the model was trained with).
        letters = ["blank"] + reader.get_modelmeta().custom_metadata_map["character"].splitlines() + [" "]
        if len(letters) != reader.get_outputs()[0].shape[-1]:
            raise RuntimeError("The text reader's list of letters doesn't fit the model: get_models.py may have fetched the wrong file.")
        _finder, _reader, _letters = finder, reader, letters
    return _finder, _reader, _letters


def decode_picture(data):
    """A JPEG, PNG or WebP as a color picture (BGR), turned upright the way a
    phone says. Raises UnreadablePicture."""
    try:
        width, height = Image.open(io.BytesIO(data)).size
    except Exception:
        raise UnreadablePicture()
    if width * height > MAX_PIXELS:
        raise UnreadablePicture()
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise UnreadablePicture()
    return image


def _find_lines(image):
    """The boxes of the lines of text in the picture (a list of 4 corners each)."""
    finder, _, _ = _load()
    height, width = image.shape[:2]
    scale = min(1.0, FINDER_SIDE / max(height, width))
    size = (max(32, round(width * scale / 32) * 32), max(32, round(height * scale / 32) * 32))
    with _finder_lock:
        finder.setInputParams(1.0 / 255.0, size, _MEAN, True)
        boxes, _ = finder.detect(image)
    lines = []
    for box in boxes:
        box_width = box[:, 0].max() - box[:, 0].min()
        box_height = box[:, 1].max() - box[:, 1].min()
        if box_width >= MIN_LINE_SHARE * width and box_width > box_height:
            lines.append(box)
    # From the top of the picture down, and from the left on the same height.
    lines.sort(key=lambda box: (float(box[:, 1].mean()), float(box[:, 0].mean())))
    return lines[:MAX_LINES]


def _straighten(image, box):
    """The pixels inside a box, cut out as an upright rectangle."""
    points = np.array(box, dtype=np.float32)
    total = points.sum(axis=1)
    difference = np.diff(points, axis=1).ravel()
    # top left, top right, bottom right, bottom left
    corners = np.array([points[np.argmin(total)], points[np.argmin(difference)], points[np.argmax(total)], points[np.argmax(difference)]], dtype=np.float32)
    width = max(1, int(round(max(np.linalg.norm(corners[0] - corners[1]), np.linalg.norm(corners[3] - corners[2])))))
    height = max(1, int(round(max(np.linalg.norm(corners[0] - corners[3]), np.linalg.norm(corners[1] - corners[2])))))
    target = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(corners, target)
    return cv2.warpPerspective(image, matrix, (width, height), borderMode=cv2.BORDER_REPLICATE, flags=cv2.INTER_CUBIC)


def _read_line(line):
    """The letters in one cut-out line."""
    _, reader, letters = _load()
    height, width = line.shape[:2]
    if height > 1.5 * width:  # a line of text turned on its side
        line = np.rot90(line)
        height, width = line.shape[:2]
    new_width = max(8, min(MAX_LINE_WIDTH, int(math.ceil(READER_HEIGHT * width / height))))
    resized = cv2.resize(line, (new_width, READER_HEIGHT), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    pixels = ((resized / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)[None]
    steps = reader.run(None, {"x": pixels})[0][0].argmax(axis=1)
    text, before = [], 0
    for step in steps:
        if step != 0 and step != before:
            text.append(letters[step])
        before = step
    return "".join(text).strip()


def read_picture(image, seconds=SECONDS):
    """(text, lines, timed_out) for a color picture (BGR): the words one line to a
    row, how many lines of text were found, and whether the time ran out (the
    text is then only the top part of the picture)."""
    started = time.monotonic()
    height, width = image.shape[:2]
    if max(height, width) < SMALL_PICTURE_SIDE:
        image = cv2.resize(image, None, fx=FINDER_SIDE / max(height, width), fy=FINDER_SIDE / max(height, width), interpolation=cv2.INTER_CUBIC)
    boxes = _find_lines(image)
    rows = []
    timed_out = False
    for box in boxes:
        if time.monotonic() - started > seconds:
            timed_out = True
            break
        row = _read_line(_straighten(image, box))
        if row:
            rows.append(row)
    return "\n".join(rows), len(boxes), timed_out


def read_boxes(image, seconds=SECONDS):
    """Like read_picture, but keeps where each piece of text was found, for
    pictures where the place matters (the GCash receipt check, receipt_check.py,
    puts a label and its value back on one row). Returns (boxes, timed_out);
    each box is {"text", "left", "right", "middle", "height"} in pixels of the
    picture it was read from, from the top of the picture down."""
    started = time.monotonic()
    height, width = image.shape[:2]
    if max(height, width) < SMALL_PICTURE_SIDE:
        scale = FINDER_SIDE / max(height, width)
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    found = []
    timed_out = False
    for box in _find_lines(image):
        if time.monotonic() - started > seconds:
            timed_out = True
            break
        text = _read_line(_straighten(image, box))
        if text:
            found.append({
                "text": text,
                "left": float(box[:, 0].min()),
                "right": float(box[:, 0].max()),
                "middle": float(box[:, 1].mean()),
                "height": float(box[:, 1].max() - box[:, 1].min()),
            })
    return found, timed_out


def read_scanned_pdf(data, seconds=SECONDS):
    """The same for a PDF made of pictures: its first pages are drawn and read.
    Returns (text, lines, timed_out)."""
    started = time.monotonic()
    texts, lines, timed_out = [], 0, False
    for page in render_pages(data, max_pages=SCAN_PAGES, max_side=SCAN_SIDE):
        left = seconds - (time.monotonic() - started)
        if left <= 0:
            timed_out = True
            break
        text, found, late = read_picture(cv2.cvtColor(np.asarray(page), cv2.COLOR_RGB2BGR), seconds=left)
        texts.append(text)
        lines += found
        timed_out = timed_out or late
    return "\n".join(texts), lines, timed_out
