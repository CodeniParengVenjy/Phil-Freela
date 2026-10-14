"""Checks the page blur rule in page_blur.py (document previews, step B5). No
database and no AI model is used. From the ai-service folder, run:

    python test_page_blur.py

(the service's own virtual environment is fine). Every check prints PASS or
FAIL, and the script exits with 1 if any check failed.
"""

import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

import page_blur
from page_blur import blur_pages, clear_height

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok or not detail else f"  -> {detail}"))


def page(width=930, height=1200, seed=0):
    """A white page with lines of small black text all the way down."""
    picture = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(picture)
    for line in range(0, height - 20, 18):
        draw.text((40, line + 4), f"Line {seed}-{line}: the quick brown fox jumps over the lazy dog again and again", fill="black")
    return picture


def detail(picture, box):
    """How much fine detail (small print) a part of a picture has: the average
    size of its edges."""
    part = picture.crop(box).convert("L")
    edges = part.filter(ImageFilter.FIND_EDGES)
    return ImageStat.Stat(edges).mean[0]


def rows_equal(a, b, top, bottom):
    return ImageChops.difference(a.crop((0, top, a.width, bottom)), b.crop((0, top, b.width, bottom))).getbbox() is None


# ---------------------------------------------------------------------------
print("== How much stays clear ==")
check("a 1-page PDF keeps a third (35%) of its page", abs(clear_height([1200]) - 420) < 0.001, clear_height([1200]))
check("a 2-page PDF keeps 60% of page 1", abs(clear_height([1200, 1200]) - 720) < 0.001)
check("a 3-page PDF keeps 90% of page 1", abs(clear_height([1200] * 3) - 1080) < 0.001)
check("a 4- or 5-page PDF keeps all of page 1, and no more", clear_height([1200] * 4) == 1200 and clear_height([1200] * 5) == 1200)
check("pages of different heights count by pixels", abs(clear_height([1000, 500]) - 450) < 0.001, clear_height([1000, 500]))
check("a very short single page still shows a third of itself", abs(clear_height([300]) - 105) < 0.001, clear_height([300]))
check("a short first page with long pages after it stays whole (30% of everything is more than it)", clear_height([300, 1200, 1200]) == 300, clear_height([300, 1200, 1200]))
check("no pages gives nothing", blur_pages([]) == [])

# ---------------------------------------------------------------------------
print("\n== A 2-page PDF ==")
pages = [page(seed=1), page(seed=2)]
out = blur_pages(pages)
check("same number of pages, same sizes", len(out) == 2 and all(o.size == p.size for o, p in zip(out, pages)))
check("the top 60% of page 1 is exactly as it was", rows_equal(out[0], pages[0], 0, 720))
original_detail = detail(pages[0], (0, 800, 930, 1200))
check("the rest of page 1 is blurred (about a tenth of the fine detail is left, from the rows of text as shapes)", detail(out[0], (0, 800, 930, 1200)) < original_detail * 0.12, f"{detail(out[0], (0, 800, 930, 1200)):.2f} vs {original_detail:.2f}")
check("page 2 is blurred all the way", detail(out[1], (0, 0, 930, 1200)) < detail(pages[1], (0, 0, 930, 1200)) * 0.12)
soft = detail(out[0], (0, 725, 930, 790))
check("a soft edge: just under the clear part the detail fades (more than fully blurred, less than clear)",
      detail(out[0], (0, 1000, 930, 1200)) < soft < detail(pages[0], (0, 725, 930, 790)), f"{detail(out[0], (0, 1000, 930, 1200)):.2f} < {soft:.2f} < {detail(pages[0], (0, 725, 930, 790)):.2f}")
check("the input pictures were not changed", rows_equal(pages[0], page(seed=1), 0, 1200))

# ---------------------------------------------------------------------------
print("\n== One page, and a long PDF ==")
single = blur_pages([page(seed=3)])[0]
check("a 1-page PDF: the top 35% is as it was and the rest is blurred", rows_equal(single, page(seed=3), 0, 420) and detail(single, (0, 600, 930, 1200)) < detail(page(seed=3), (0, 600, 930, 1200)) * 0.12)
five = blur_pages([page(seed=n) for n in range(5)])
check("a 5-page PDF: page 1 stays whole and pages 2 to 5 are blurred", rows_equal(five[0], page(seed=0), 0, 1200) and all(detail(p, (0, 0, 930, 1200)) < 3.5 for p in five[1:]), [round(detail(p, (0, 0, 930, 1200)), 2) for p in five])
landscape = blur_pages([page(1200, 800, seed=9), page(1200, 800, seed=10)])
check("a landscape PDF works the same way (top 60% of page 1 stays)", rows_equal(landscape[0], page(1200, 800, seed=9), 0, 480) and landscape[0].size == (1200, 800))

# ---------------------------------------------------------------------------
print("\n== The blur can't be undone ==")
# Small print should leave nothing behind in the blurred part: compare the fine
# detail of the original and the blurred picture, after taking away the broad
# shapes. If anything of the text were left, they would still match.
def high_pass(picture):
    gray = picture.convert("L")
    return ImageChops.difference(gray, gray.filter(ImageFilter.GaussianBlur(3)))

region = (0, 900, 930, 1200)
a, b = high_pass(pages[0]).crop(region), high_pass(out[0]).crop(region)
mean_a, mean_b = ImageStat.Stat(a).mean[0], ImageStat.Stat(b).mean[0]
check("the fine detail of the small print is gone from the blurred part (under 5% of it is left)", mean_b < mean_a * 0.05, f"{mean_b:.3f} of {mean_a:.3f}")
blocks = pages[0].resize((93, 120), Image.Resampling.BOX).resize((930, 1200), Image.Resampling.NEAREST)
same_blocks = blur_pages([blocks, blocks])
# Two different pages that have the same 10x10 block averages must come out the same:
check("only the 10x10 block averages are kept (a page rebuilt from them gives the same blurred part)",
      ImageStat.Stat(ImageChops.difference(out[0].crop(region), same_blocks[0].crop(region))).mean[0] < 3,
      round(ImageStat.Stat(ImageChops.difference(out[0].crop(region), same_blocks[0].crop(region))).mean[0], 2))

print(f"\n{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
