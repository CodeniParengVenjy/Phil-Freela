"""Pictures for testing the resume check (test_resume_check.py and
test_resume_ocr.py): a text drawn onto a page, and the same page as if it had
been photographed. Only the tests use this; the service doesn't.

Pillow's own built-in font is used, so no font file is needed.
"""

import io

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def render_page(text, width=1240, size=25, margin=70):
    """The text drawn on a white page (an A4 sheet at about 150 dots per inch),
    wrapped to the page; short ALL CAPS lines are drawn bigger, like headings."""
    body, head = ImageFont.load_default(size=size), ImageFont.load_default(size=size + 4)
    rows = []
    for raw in text.split("\n"):
        font = head if raw.isupper() and len(raw) < 45 else body
        row = ""
        for word in raw.split(" "):
            trial = (row + " " + word).strip()
            if font.getlength(trial) > width - 2 * margin and row:
                rows.append((row, font))
                row = word
            else:
                row = trial
        rows.append((row, font))
    height = max(1754, int(2 * margin + len(rows) * size * 1.5))
    page = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(page)
    y = margin
    for row, font in rows:
        draw.text((margin, y), row, fill=(20, 20, 20), font=font)
        y += int(size * 1.5)
    return page


def png_bytes(picture):
    buffer = io.BytesIO()
    picture.save(buffer, "PNG")
    return buffer.getvalue()


def scanned_pdf(pages):
    """A PDF made only of pictures of pages (no text of its own), like a scan."""
    buffer = io.BytesIO()
    pages[0].save(buffer, "PDF", save_all=True, append_images=pages[1:], resolution=150)
    return buffer.getvalue()


def photographed(page, seed):
    """The page as a phone photo of paper lying on a table: a little turned and
    skewed, unevenly lit, soft, noisy, shrunk, and saved as a low quality JPEG.
    The same seed gives the same photo."""
    rng = np.random.default_rng(seed)
    image = cv2.cvtColor(np.asarray(page), cv2.COLOR_RGB2BGR)
    h, w = image.shape[:2]
    pad = int(0.08 * w)
    table_color = (70, 95, 120)  # brown, in BGR
    table = np.full((h + 2 * pad, w + 2 * pad, 3), table_color, dtype=np.uint8)
    table[pad:pad + h, pad:pad + w] = image
    height, width = table.shape[:2]
    corners = np.float32([[0, 0], [width, 0], [width, height], [0, height]])
    jitter = rng.uniform(-0.02, 0.02, (4, 2)) * np.float32([width, height])
    out = cv2.warpPerspective(table, cv2.getPerspectiveTransform(corners, (corners + jitter).astype(np.float32)), (width, height), borderValue=table_color)
    turn = cv2.getRotationMatrix2D((width / 2, height / 2), rng.uniform(-2.5, 2.5), 1.0)
    out = cv2.warpAffine(out, turn, (width, height), borderValue=table_color)
    shade = np.linspace(rng.uniform(0.78, 0.9), 1.0, width, dtype=np.float32)[None, :, None]
    out = np.clip(out.astype(np.float32) * shade, 0, 255)
    out = cv2.GaussianBlur(out, (0, 0), 0.9)
    out = np.clip(out + rng.normal(0, 6, out.shape), 0, 255).astype(np.uint8)
    out = cv2.resize(out, None, fx=0.62, fy=0.62, interpolation=cv2.INTER_AREA)
    _, jpeg = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 55])
    return jpeg.tobytes()
