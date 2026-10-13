"""The preview of a document (document previews, see PLAN-document-previews.md).

Visitors never get a document's whole text. The public file holds only the
start of it (the preview), and the whole text is kept apart, in the slide_texts
table that only its writer and the admins can read. The website blurs the rest.

The rule: the first 30% of the text, at most 1,500 characters, cut at a word.
A very short text still shows a little: at least 200 characters, or half of it
when it is shorter than 400. Only visible characters count. The invisible code
(text_watermark.py) is made of invisible characters, so the preview keeps the
code of every sentence it contains and is never cut in the middle of one.

The website has the same rule for old pasted writing, which is still in the
portfolio_items table: client/src/lib/documentPreview.js. Keep them the same.
"""

import re

from text_watermark import HIDDEN_CHARACTERS

SHARE_PERCENT = 30
MAX_SHOWN = 1500
MIN_SHOWN = 200
# Backing up to the space before a cut word only happens for words up to this long.
LONGEST_WORD = 40


def preview_length(visible):
    """How many visible characters the preview holds, for a text of this length."""
    return min(MAX_SHOWN, max(visible * SHARE_PERCENT // 100, min(MIN_SHOWN, visible // 2)))


def make_preview(text):
    """Returns (shown, hidden_chars): the start of the text, and how many
    visible characters were left out of it (0 when nothing needed hiding)."""
    visible = len(HIDDEN_CHARACTERS.sub("", text))
    limit = preview_length(visible)
    if limit >= visible:
        return text, 0

    # Walk to the first visible character past the limit. Everything before it
    # stays, with the invisible characters between its letters, so a code is
    # never cut in half.
    seen = 0
    cut = len(text)
    for index, char in enumerate(text):
        if HIDDEN_CHARACTERS.match(char):
            continue
        if seen == limit:
            cut = index
            break
        seen += 1
    shown = text[:cut]

    # Don't end in the middle of a word: back up to the space before it.
    if not text[cut].isspace() and not shown[-1:].isspace():
        word = re.search(r"\s\S*$", shown)
        if word and len(word.group()) <= LONGEST_WORD:
            shown = shown[: word.start()]
    shown = shown.rstrip()
    return shown, visible - len(HIDDEN_CHARACTERS.sub("", shown))
