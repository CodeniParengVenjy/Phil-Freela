"""Made-up GCash-style receipt screenshots for test_receipt_check.py. Every
name, number and amount here is invented, and the pictures are drawn only to
test the receipt check (receipt_check.py); they carry no GCash logo.

draw_receipt(**fields) returns PNG bytes of a phone-sized screenshot (1080 x
2340) laid out the way the research for PLAN-receipt-ai.md describes a GCash
"Send Money" receipt: the amount in the biggest print, "Sent to" with a partly
hidden name, the number paid, the Amount / Total lines, "Ref No." with 13
digits spaced 4 3 6, and the date and time.
"""

import io
import os
from datetime import datetime

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = "C:/Windows/Fonts"
BLUE = (0, 92, 230)
GREY = (110, 118, 130)
DARK = (25, 30, 40)


def _font(size, bold=False):
    for name in (("segoeuib.ttf", "arialbd.ttf") if bold else ("segoeui.ttf", "arial.ttf")):
        path = os.path.join(FONTS, name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def when(moment, style="mdy"):
    """How the receipt prints a date and time."""
    hour = moment.hour % 12 or 12
    half = "PM" if moment.hour >= 12 else "AM"
    if style == "dmy":
        return f"{moment.day:02d} {moment:%b} {moment.year} {hour}:{moment:%M} {half}"
    if style == "num":
        return f"{moment.month:02d}/{moment.day:02d}/{moment.year} {hour}:{moment:%M} {half}"
    return f"{moment:%b} {moment.day}, {moment.year} {hour}:{moment:%M} {half}"


def spaced(reference):
    return f"{reference[:4]} {reference[4:7]} {reference[7:]}"


def draw_receipt(*, amount="1,500.00", top_amount=None, total=None, fee=None, name="J***N D.",
                 phone="+63 917 *** 4567", reference="4021358091742", ref_spaced=True,
                 paid_at=datetime(2026, 11, 8, 11, 23), date_style="mdy", title="GCash",
                 show_total=True, width=1080, height=2340):
    """A made-up receipt screenshot as PNG bytes. top_amount (the big one) and
    total default to the amount; fee adds a Fee line."""
    page = Image.new("RGB", (width, height), (236, 242, 250))
    draw = ImageDraw.Draw(page)
    s = width / 1080  # everything is laid out for 1080 wide

    def centered(y, text, font, fill):
        box = draw.textbbox((0, 0), text, font=font)
        draw.text(((width - (box[2] - box[0])) / 2, y * s), text, font=font, fill=fill)

    def left_right(y, left, right, font_left, font_right, fill_right=DARK):
        draw.text((110 * s, y * s), left, font=font_left, fill=GREY)
        box = draw.textbbox((0, 0), right, font=font_right)
        draw.text((width - 110 * s - (box[2] - box[0]), y * s), right, font=font_right, fill=fill_right)

    draw.rectangle((0, 0, width, 330 * s), fill=BLUE)
    if title:
        centered(120, title, _font(int(84 * s), True), (255, 255, 255))
    draw.rounded_rectangle((60 * s, 400 * s, width - 60 * s, 1560 * s), radius=40 * s, fill=(255, 255, 255))

    centered(450, "Express Send", _font(int(40 * s)), GREY)
    centered(520, "₱" + (top_amount or amount), _font(int(96 * s), True), DARK)
    centered(700, "Sent to", _font(int(38 * s)), GREY)
    if name:
        centered(760, name, _font(int(50 * s), True), DARK)
    if phone:
        centered(835, phone, _font(int(40 * s)), GREY)
    draw.line((110 * s, 930 * s, width - 110 * s, 930 * s), fill=(225, 230, 238), width=max(1, int(3 * s)))

    y = 975
    left_right(y, "Amount", amount, _font(int(40 * s)), _font(int(40 * s)))
    if fee:
        y += 80
        left_right(y, "Fee", fee, _font(int(40 * s)), _font(int(40 * s)))
    if show_total:
        y += 80
        left_right(y, "Total Amount Sent", "₱" + (total or amount), _font(int(40 * s)), _font(int(44 * s), True))
    y += 110
    draw.line((110 * s, y * s, width - 110 * s, y * s), fill=(225, 230, 238), width=max(1, int(3 * s)))
    y += 45
    left_right(y, "Ref No. " + (spaced(reference) if ref_spaced else reference), when(paid_at, date_style),
               _font(int(34 * s)), _font(int(34 * s)), fill_right=GREY)
    centered(1420, "Sent via GCash" if title else "Sent", _font(int(36 * s)), GREY)
    draw.rounded_rectangle((110 * s, 1680 * s, width - 110 * s, 1800 * s), radius=60 * s, fill=BLUE)
    centered(1712, "Done", _font(int(44 * s), True), (255, 255, 255))

    buffer = io.BytesIO()
    page.save(buffer, format="PNG")
    return buffer.getvalue()


def as_jpeg(png, quality=70, scale=1.0, blur=0.0, software=None):
    """The same picture saved again: as a JPEG, smaller, softer, and/or with an
    app's name written inside like an editor does."""
    image = Image.open(io.BytesIO(png)).convert("RGB")
    if scale != 1.0:
        image = image.resize((int(image.width * scale), int(image.height * scale)), Image.LANCZOS)
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(blur))
    buffer = io.BytesIO()
    exif = None
    if software:
        exif = Image.Exif()
        exif[0x0131] = software
    image.save(buffer, format="JPEG", quality=quality, **({"exif": exif} if exif else {}))
    return buffer.getvalue()


def plain_picture(text_lines, width=1080, height=1600):
    """A picture that is not a receipt: a few lines of ordinary text."""
    page = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(page)
    for index, line in enumerate(text_lines):
        draw.text((90, 120 + index * 90), line, font=_font(44), fill=DARK)
    buffer = io.BytesIO()
    page.save(buffer, format="PNG")
    return buffer.getvalue()


def sideways(png):
    """A receipt pasted onto a wide picture."""
    receipt = Image.open(io.BytesIO(png)).convert("RGB")
    receipt = receipt.resize((receipt.width // 2, receipt.height // 2))
    page = Image.new("RGB", (receipt.width * 2 + 200, receipt.height), (240, 240, 240))
    page.paste(receipt, (100, 0))
    buffer = io.BytesIO()
    page.save(buffer, format="PNG")
    return buffer.getvalue()
