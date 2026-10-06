"""A PDF's pages as watermarked pictures (watermarking system, step 11).

A document used to be kept as text only, so its layout, fonts and pictures
were lost. A PDF's first pages are now also turned into pictures: viewers see
the real pages, but never get the PDF file itself. Each page picture carries

1. the freelancer's name, repeated faintly across the whole page (it can't be
   cropped off, and the text under it stays readable), and
2. the document's invisible code (HiDDeN, see hidden_watermark.py), so a
   screenshot of a page can be traced with Check Ownership.

The pages are drawn by PDFium, the PDF reader inside Google Chrome, through
the pypdfium2 package.
"""

import threading

import pypdfium2 as pdfium
from PIL import ImageStat

from hidden_watermark import STRENGTHS, protect_photo
from visible_watermark import draw_visible_watermark

# Only the first pages become pictures: each one takes as long to watermark
# as a photo. The whole text is still kept (see read_document in main.py).
MAX_PAGES = 5
# The longer side of a page picture, in pixels (the same as photo slides):
# normal text stays readable, and it is never print quality.
PAGE_MAX_SIDE = 1200
# How strong the name across the page is, in percent. Faint on purpose: at the
# photo watermark's 60% the text under it would be hard to read.
PAGE_WATERMARK_OPACITY = 15
# The hidden code's pattern strengths for pages: the photo ones, plus one
# stronger try. White paper has little texture to hide a pattern in, so in
# tests 2 of 52 pages didn't hold the code at the photo strengths; all 52 did
# with this one (it looks nearly the same as the step before it).
PAGE_STRENGTHS = STRENGTHS + (5.5,)

# PDFium can only draw one document at a time.
_pdfium_lock = threading.Lock()


def render_pages(pdf_bytes):
    """The first pages of a PDF as pictures (RGB), each at most 1200 pixels
    wide or tall."""
    with _pdfium_lock:
        pdf = pdfium.PdfDocument(pdf_bytes)
        try:
            pictures = []
            for number in range(min(len(pdf), MAX_PAGES)):
                page = pdf[number]
                # A page's size is in points (72 per inch); scale turns them into pixels.
                width, height = page.get_size()
                pictures.append(page.render(scale=PAGE_MAX_SIDE / max(width, height)).to_pil().convert("RGB"))
            return pictures
        finally:
            pdf.close()


def page_style(settings, picture):
    """The watermark's look on a page. The words and the on/off switch are the
    freelancer's own (Settings > Watermark Settings), but the layout is always
    the same: small, faint and repeated across the page, dark on light paper
    and white on a dark page. (Their photo style, by default white in one
    corner, would be invisible on white paper and easy to crop off.)"""
    light_paper = ImageStat.Stat(picture.convert("L")).mean[0] >= 128
    return {
        **(settings or {}),
        "position": "tiled",
        "size": "small",
        "opacity": PAGE_WATERMARK_OPACITY,
        "color": "black" if light_paper else "white",
        "show_badge": False,
    }


def watermark_page(picture, code, settings, username, full_name):
    """One page picture with the name across it and the code hidden in it.
    Returns (jpeg_bytes, has_code): has_code is False for a page too plain to
    hold the code (a nearly empty page), which is then saved without it."""
    shown = draw_visible_watermark(picture, page_style(settings, picture), username, full_name)
    return protect_photo(shown, code, PAGE_STRENGTHS)
