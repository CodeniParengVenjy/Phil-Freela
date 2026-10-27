"""Checks the visible watermark's Premium choices in visible_watermark.py
(PLAN-premium.md): the 4 fonts, any #rrggbb color, the extra sizes, and the
free look someone gets once their Premium ends. No database and no AI model is
used. From the ai-service folder, run:

    python test_visible_watermark.py

(the service's own virtual environment is fine). Every check prints PASS or
FAIL, and the script exits with 1 if any check failed.
"""

import sys

from PIL import Image

from document_pages import page_style
from visible_watermark import FONT_PATHS, SIZE_RATIOS, _draw_mark, _is_dark, _rgb, draw_visible_watermark, free_style, watermark_layer

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok or not detail else f"  -> {detail}"))


def style(**changes):
    return {"visible_enabled": True, "text_mode": "username", "custom_text": None, "position": "bottom_right",
            "opacity": 80, "size": "medium", "color": "white", "font": "jakarta", "show_badge": False, **changes}


def mark_box(settings, size=(1200, 800)):
    """The (width, height) of what was drawn on a see-through picture."""
    box = watermark_layer(size, settings, "elena", "Elena Cruz").getchannel("A").getbbox()
    return (box[2] - box[0], box[3] - box[1]) if box else (0, 0)


def has_color(picture, rgb, near=24):
    """True if some pixel of the picture is close to this color."""
    for count, (r, g, b) in picture.convert("RGB").getcolors(1 << 20) or []:
        if abs(r - rgb[0]) <= near and abs(g - rgb[1]) <= near and abs(b - rgb[2]) <= near:
            return True
    return False


# --- The 4 fonts --------------------------------------------------------------
widths = {}
for name in FONT_PATHS:
    try:
        widths[name] = _draw_mark("@elena_designs", 60, "white", False, name).width
        check(f"the {name} font loads and draws", widths[name] > 100, widths[name])
    except OSError as error:
        check(f"the {name} font loads and draws", False, error)
check("the 4 fonts look different (4 different widths)", len(set(widths.values())) == 4, widths)
check("an unknown font falls back to the site's font",
      _draw_mark("@elena_designs", 60, "white", False, "comic").width == widths.get("jakarta"))

# --- Colors -------------------------------------------------------------------
check("a color name still works", _rgb("orange") == (255, 107, 0) and _rgb("black") == (17, 17, 17))
check("#rrggbb is read", _rgb("#22cc88") == (0x22, 0xCC, 0x88))
check("a broken color is drawn white", _rgb("#12") == (255, 255, 255) and _rgb("#zzzzzz") == (255, 255, 255) and _rgb(None) == (255, 255, 255))
check("dark colors get a light outline, light ones a dark outline",
      _is_dark(_rgb("black")) and _is_dark(_rgb("#102030")) and not _is_dark(_rgb("white"))
      and not _is_dark(_rgb("orange")) and not _is_dark(_rgb("#ffee00")))
gray = Image.new("RGB", (1200, 800), (128, 128, 128))
shown = draw_visible_watermark(gray, style(color="#22cc88", opacity=80, size="large"), "elena", "Elena Cruz")
check("a photo gets the picked color (#22cc88 at 80%)",
      has_color(shown, tuple(round(0.8 * c + 0.2 * 128) for c in (0x22, 0xCC, 0x88)), near=6))
check("...and not orange", not has_color(shown, (230, 111, 26), near=6))

# --- Sizes --------------------------------------------------------------------
heights = [mark_box(style(size=size))[1] for size in ("xsmall", "small", "medium", "large", "xlarge")]
check("extra small < small < medium < large < extra large", heights == sorted(heights) and len(set(heights)) == 5, heights)
check("an unknown size is drawn medium", mark_box(style(size="huge")) == mark_box(style(size="medium")))
check("the ratios", SIZE_RATIOS["xsmall"] < SIZE_RATIOS["small"] and SIZE_RATIOS["xlarge"] > SIZE_RATIOS["large"])
long_text = style(text_mode="custom", custom_text="Elena Cruz Graphic Designs", size="xlarge", font="script")
check("long extra-large text in a wide font still fits a small photo", mark_box(long_text, (500, 400))[0] <= 500 - 2 * 10)

# --- Older rows and no row ----------------------------------------------------
old_row = style(size="medium")
del old_row["font"]
check("a style saved before fonts existed still draws", mark_box(old_row) == mark_box(style()))
check("a style with font null draws in the site's font", mark_box(style(font=None)) == mark_box(style()))
check("no saved style: the defaults", watermark_layer((1200, 800), None, "elena", "") is not None)

# --- Without Premium ----------------------------------------------------------
premium = style(color="#22cc88", size="xlarge", font="script")
free = free_style(premium)
check("free look: the site's font, white instead of an own color, large instead of extra large",
      free["font"] == "jakarta" and free["color"] == "white" and free["size"] == "large", free)
check("free look: extra small becomes small", free_style(style(size="xsmall"))["size"] == "small")
check("free look keeps the free choices and everything else",
      free_style(style(color="orange", size="medium", position="tiled", opacity=35))
      == style(color="orange", size="medium", position="tiled", opacity=35))
check("free look of no saved style is still no saved style", free_style(None) is None)
check("free look leaves the saved row alone", premium["color"] == "#22cc88" and premium["font"] == "script")
shown_free = draw_visible_watermark(gray, {**free, "opacity": 80}, "elena", "Elena Cruz")
check("a photo after Premium ended has no green", not has_color(shown_free, (0x22, 0xCC, 0x88), near=40))
check("...and is drawn like the free style", mark_box(free) == mark_box(style(size="large")))

# --- Document pages -----------------------------------------------------------
paper = Image.new("RGB", (900, 1200), "white")
page = page_style(premium, paper)
check("PDF pages keep the person's font but stay small, black on white paper and tiled",
      page["font"] == "script" and page["size"] == "small" and page["color"] == "black" and page["position"] == "tiled")
check("a PDF page draws with it", draw_visible_watermark(paper, page, "elena", "Elena Cruz").size == paper.size)

failed = results.count(False)
print(f"\n{len(results) - failed} passed, {failed} failed")
sys.exit(1 if failed else 0)
