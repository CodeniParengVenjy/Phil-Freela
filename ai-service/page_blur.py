"""Blurs the lower part of a PDF's page pictures (document previews, see
PLAN-document-previews.md, step B5).

A document's text is cut to a preview (document_preview.py) and the website
blurs the rest. A PDF is shown as pictures of its first pages, so the same idea
is done in the pixels: only the top of the document stays clear, and
everything under it is blurred IN THE PICTURE ITSELF. Nobody can un-blur it by
changing the page's styling, and the clear pages are kept apart (see
preview_pages in main.py), where only the writer and the admins can open them.

The rule: counted from the top of the first page, 30% of all the pages' height
stays clear, but at least a third of the first page (a one-page PDF still shows
something) and at most the whole first page. So a 1-page PDF keeps the top 35%
of its page, a 2-page PDF the top 60% of page 1, and a PDF of 4 or 5 pages its
whole first page. Everything else is blurred.
"""

from PIL import Image, ImageFilter

CLEAR_SHARE = 0.30
CLEAR_MIN_OF_FIRST = 0.35
# The blur first shrinks the picture into blocks of this many pixels, so small
# print is gone for good (not just fuzzy and recoverable), then smooths it so it
# looks like a blur and not like squares.
BLOCK = 10
# The soft edge under the clear part, as a share of the page's height.
FADE = 0.06


def clear_height(heights):
    """How many pixels, counted from the top of the first page, stay clear."""
    first = heights[0]
    return min(first, max(CLEAR_SHARE * sum(heights), CLEAR_MIN_OF_FIRST * first))


def blurred(picture):
    """The whole picture, blurred beyond reading."""
    width, height = picture.size
    small = picture.resize((max(1, width // BLOCK), max(1, height // BLOCK)), Image.Resampling.BOX)
    return small.resize((width, height), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(radius=BLOCK / 2))


def blur_below(picture, cut):
    """The picture with everything from row `cut` down blurred, through a soft
    edge. A cut at or below the bottom leaves it as it is; a cut of 0 or less
    blurs all of it."""
    width, height = picture.size
    cut = int(cut)
    if cut >= height:
        return picture
    soft = blurred(picture)
    if cut <= 0:
        return soft
    # The mask is 0 (keep the sharp picture) down to the cut, then climbs to
    # 255 (blurred) over the soft edge, and stays 255 below it.
    fade = min(max(1, round(FADE * height)), height - cut)
    mask = Image.new("L", (width, height), 255)
    mask.paste(0, (0, 0, width, cut))
    mask.paste(Image.linear_gradient("L").resize((width, fade)), (0, cut))
    return Image.composite(soft, picture, mask)


def blur_pages(pictures):
    """The page pictures (PIL, RGB, first page first) with all but the top of
    the document blurred. Returns new pictures; the clear part is untouched."""
    if not pictures:
        return []
    remaining = clear_height([picture.height for picture in pictures])
    result = []
    for picture in pictures:
        result.append(blur_below(picture, remaining))
        remaining = max(0, remaining - picture.height)
    return result
