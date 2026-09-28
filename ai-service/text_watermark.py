"""The watermark for writing (watermarking system, step 6).

Invisible code: Unicode has characters that take up no space and show
nothing ("zero-width" characters). A document's random 48-bit code is written
with two of them, zero-width space = 0 and zero-width non-joiner = 1, between
two word joiners (also invisible) that mark where the code starts and ends.
It's slipped in after the first word of EVERY sentence, so the text looks
exactly the same, and copying even one sentence copies the code along.

Visible footer: "© @username · PhilFreela" at the end, unless the freelancer
turned it off in Settings > Watermark Settings.
"""

import re
from collections import Counter

NUM_BITS = 48
ZERO, ONE = "​", "‌"  # zero-width space, zero-width non-joiner
MARK = "⁠"  # word joiner: where a code starts and ends
# Invisible characters people use for tricks, removed before our own go in.
HIDDEN_CHARACTERS = re.compile("[​-‏⁠-⁤﻿]")
CODE_PATTERN = re.compile(f"{MARK}([{ZERO}{ONE}]{{{NUM_BITS}}}){MARK}")


def strip_hidden(text):
    """The text without any invisible characters (ours or anyone else's)."""
    return HIDDEN_CHARACTERS.sub("", text)


def _code_characters(code):
    bits = format(code, f"0{NUM_BITS}b")
    return MARK + "".join(ONE if bit == "1" else ZERO for bit in bits) + MARK


def add_code(text, code):
    """Hides the code after the first word of every sentence (and of every
    line), so copying any whole sentence copies the code too."""
    hidden = _code_characters(code)
    # A sentence starts at the start of a line, or after ". ", "! " or "? ".
    return re.sub(r"(^[ \t]*|[.!?][ \t]+)(\S+)", lambda m: m.group(1) + m.group(2) + hidden, text, flags=re.MULTILINE)


def read_code(text):
    """The hidden code in a piece of text, or None if there's none. If parts of
    several documents were pasted together, the code found most often wins."""
    found = [int("".join("1" if c == ONE else "0" for c in m), 2) for m in CODE_PATTERN.findall(text)]
    return Counter(found).most_common(1)[0][0] if found else None


def footer(settings, username, full_name):
    """The visible footer line: the same words the photo watermark uses."""
    settings = settings or {}
    if settings.get("text_mode") == "custom" and (settings.get("custom_text") or "").strip():
        name = settings["custom_text"].strip()
    elif settings.get("text_mode") == "full_name" and full_name:
        name = full_name
    else:
        name = f"@{username}"
    return f"© {name} · PhilFreela"


def paragraphs_for_check(text, min_words=40, max_words=150):
    """Splits a document into pieces for the copy check: paragraphs, with
    short ones joined together and long ones cut up, each about 40-150 words
    (the text model reads at most about 200 words at a time)."""
    pieces, current = [], []
    for paragraph in re.split(r"\n\s*\n|\n", strip_hidden(text)):
        words = paragraph.split()
        while len(words) > max_words:
            pieces.append(" ".join(current + words[:max_words - len(current)]))
            words = words[max_words - len(current):]
            current = []
        current += words
        if len(current) >= min_words:
            pieces.append(" ".join(current))
            current = []
    if current:
        # A short leftover joins the last piece, or is the only piece.
        if pieces and len(current) < min_words:
            pieces[-1] += " " + " ".join(current)
        else:
            pieces.append(" ".join(current))
    return pieces
