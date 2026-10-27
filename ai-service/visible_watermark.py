"""The visible watermark: the freelancer's name drawn into their photo
(watermarking system, step 3).

It's drawn in the style they picked in Settings > Watermark Settings. The
website draws the same thing for the live preview
(client/src/lib/watermarkPreview.js), so if you change the layout here,
change it there too.

Premium (PLAN-premium.md) adds any color (#rrggbb), extra small and extra
large, and 3 more fonts. The database only lets Premium members pick them;
someone whose Premium ended keeps them saved, and main.py passes their style
through free_style() so their photos get the nearest free look meanwhile.
"""

import math
import os

from PIL import Image, ImageDraw, ImageFont

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
# The website's own font, and Premium's 3 more (all SIL Open Font License, see
# assets/OFL*.txt). The website's preview uses the same files
# (client/public/watermark-fonts).
FONT_PATHS = {
    "jakarta": os.path.join(ASSETS, "PlusJakartaSans-Bold.ttf"),
    "serif": os.path.join(ASSETS, "DMSerifDisplay-Regular.ttf"),
    "mono": os.path.join(ASSETS, "SpaceMono-Bold.ttf"),
    "script": os.path.join(ASSETS, "Pacifico-Regular.ttf"),
}
LOGO_PATH = os.path.join(ASSETS, "philfreela-logo.png")

# Used when a freelancer never saved their own style (same as the database defaults).
DEFAULTS = {
    "visible_enabled": True,
    "text_mode": "username",
    "custom_text": None,
    "position": "bottom_right",
    "opacity": 60,
    "size": "medium",
    "color": "white",
    "font": "jakarta",
    "show_badge": True,
}

# Text height as a share of the photo's shorter side. (Made bigger: at 5%
# the mark was easy to miss on a service card.) Same numbers as
# client/src/lib/watermarkPreview.js. xsmall and xlarge are Premium's.
SIZE_RATIOS = {"xsmall": 0.035, "small": 0.05, "medium": 0.08, "large": 0.11, "xlarge": 0.15}
COLORS = {"white": (255, 255, 255), "black": (17, 17, 17), "orange": (255, 107, 0)}
# Premium's extra sizes, and the free size each one becomes without Premium.
FREE_SIZES = {"xsmall": "small", "xlarge": "large"}
TILE_ANGLE = 30  # degrees, for the tiled pattern

_logo = None


def free_style(settings):
    """The same style with only the free choices: the site's font, one of the
    3 colors (white instead of a color of their own) and small to large. For
    someone without Premium (see the top of this file)."""
    if not settings:
        return settings
    return {
        **settings,
        "font": "jakarta",
        "color": settings.get("color") if settings.get("color") in COLORS else "white",
        "size": FREE_SIZES.get(settings.get("size"), settings.get("size")),
    }


def _rgb(color):
    """A color name (white, black, orange) or "#rrggbb" as (r, g, b); white if
    it is neither."""
    if color in COLORS:
        return COLORS[color]
    try:
        if len(color) == 7 and color[0] == "#":
            return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
    except (TypeError, ValueError):
        pass
    return COLORS["white"]


def _is_dark(rgb):
    """True for a dark color, which then gets a light outline (and the other
    way round). Black is dark; white and orange are not."""
    r, g, b = rgb
    return 0.299 * r + 0.587 * g + 0.114 * b < 128


def watermark_text(settings, username, full_name):
    """The words the watermark shows: @username, the full name, or their own text."""
    if settings["text_mode"] == "custom" and (settings.get("custom_text") or "").strip():
        return settings["custom_text"].strip()
    if settings["text_mode"] == "full_name" and full_name:
        return full_name
    return f"@{username}"


def _load_logo():
    global _logo
    if _logo is None:
        _logo = Image.open(LOGO_PATH).convert("RGBA")
    return _logo


def _draw_mark(text, font_px, color, show_badge, font_name="jakarta"):
    """The watermark itself (logo + text) on a see-through picture, at full strength."""
    font = ImageFont.truetype(FONT_PATHS.get(font_name, FONT_PATHS["jakarta"]), font_px)
    stroke = max(1, round(font_px / 18))
    text_width = math.ceil(font.getlength(text)) + 2 * stroke

    height = round(font_px * 1.3)
    logo = None
    if show_badge:
        logo_height = round(font_px * 1.25)
        source = _load_logo()
        logo = source.resize((round(source.width * logo_height / source.height), logo_height), Image.LANCZOS)
        height = max(height, logo_height)
    gap = round(font_px * 0.35) if logo else 0

    mark = Image.new("RGBA", ((logo.width + gap if logo else 0) + text_width, height), (0, 0, 0, 0))
    if logo:
        mark.alpha_composite(logo, (0, (height - logo.height) // 2))

    # A thin outline in the opposite shade keeps it readable on any background.
    rgb = _rgb(color)
    outline = (255, 255, 255, 110) if _is_dark(rgb) else (0, 0, 0, 110)
    x = (logo.width + gap if logo else 0) + stroke
    ImageDraw.Draw(mark).text(
        (x, height / 2), text, font=font, fill=rgb + (255,),
        anchor="lm", stroke_width=stroke, stroke_fill=outline,
    )
    return mark


def _set_opacity(mark, opacity):
    """Makes the whole mark see-through: 10 = faint ... 80 = strong."""
    mark.putalpha(mark.getchannel("A").point(lambda a: round(a * opacity / 100)))


def _tiled_layer(mark, width, height, font_px):
    """Rows of marks, every other row shifted, turned 30 degrees and covering the photo."""
    side = math.ceil(math.hypot(width, height))
    step_x = mark.width + font_px * 3
    step_y = mark.height + font_px * 3
    size = side + 2 * step_x
    big = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for row, y in enumerate(range(0, size - mark.height, step_y)):
        shift = step_x // 2 if row % 2 else 0
        for x in range(shift, size - mark.width, step_x):
            big.alpha_composite(mark, (x, y))
    big = big.rotate(TILE_ANGLE, resample=Image.BICUBIC)
    left, top = (size - width) // 2, (size - height) // 2
    return big.crop((left, top, left + width, top + height))


def draw_visible_watermark(image, settings, username, full_name):
    """Returns a copy of the photo with the freelancer's watermark drawn on it,
    or the photo unchanged if they turned the visible watermark off."""
    layer = watermark_layer(image.size, settings, username, full_name)
    if layer is None:
        return image
    return Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")


def watermark_layer(size, settings, username, full_name):
    """Just the watermark, on a see-through picture of the given (width,
    height), or None if the freelancer turned it off. Videos draw it once and
    lay it over every frame."""
    settings = {**DEFAULTS, **{k: v for k, v in (settings or {}).items() if v is not None}}
    if not settings["visible_enabled"]:
        return None

    width, height = size
    text = watermark_text(settings, username, full_name)
    font_px = max(12, round(min(width, height) * SIZE_RATIOS.get(settings["size"], SIZE_RATIOS["medium"])))
    mark = _draw_mark(text, font_px, settings["color"], settings["show_badge"], settings["font"])
    # Long text on a small photo: shrink it so it fits.
    room = width - 2 * round(font_px * 0.8)
    if settings["position"] != "tiled" and mark.width > room:
        font_px = max(10, math.floor(font_px * room / mark.width))
        mark = _draw_mark(text, font_px, settings["color"], settings["show_badge"], settings["font"])
    _set_opacity(mark, settings["opacity"])

    if settings["position"] == "tiled":
        layer = _tiled_layer(mark, width, height, font_px)
    else:
        margin = round(font_px * 0.8)
        x, y = {
            "top_left": (margin, margin),
            "top_right": (width - margin - mark.width, margin),
            "bottom_left": (margin, height - margin - mark.height),
            "bottom_right": (width - margin - mark.width, height - margin - mark.height),
            "center": ((width - mark.width) // 2, (height - mark.height) // 2),
        }[settings["position"]]
        layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        layer.alpha_composite(mark, (max(0, x), max(0, y)))

    return layer
