"""Reads the name in a passport's two code lines and compares it with the profile.

The photo page of a passport ends with two lines of capital letters, digits and
"<" signs (the MRZ, "machine readable zone"), made so a machine can read them.
The first line holds the owner's name: P<PHLSURNAME<<GIVEN<NAMES<<<<<<<<<<<
("P" for passport, the country code, then the surname, "<<", the given names,
and "<" to fill the line up). Anyone can read it; a passport chip's signature
is what proves a passport is real, and that needs the issuing country's key.
So this can't prove a passport is real: like the PhilSys QR check (id_qr.py),
it is a flag for the admin. A fake or someone else's passport photo often has
no readable code lines, or a name that isn't the profile's.

Uses the same pretrained text reader as the resume and receipt checks
(resume_ocr.py). Only the name is kept. The country code on the first line is
read too (freelancers must have a Philippine passport) but not saved. The
passport number, birthday and expiry date on the second line are never looked at.

The reader doesn't always read a line the same way at every photo size (on a
sample passport it dropped two "<" signs at full size but not when the photo
was shrunk). So when the name doesn't match, the photo is read again at other
sizes, and only when none of them match is the admin warned.
"""

import time

from PIL import Image

from face_check import to_pixels
from id_qr import names_match
from resume_ocr import read_boxes

# The most time all the readings together may take. One reading of a photo
# page takes a second or two.
SECONDS = 12.0
# The photo is read shrunk to this long side first (the reader did best there),
# then as it is, then shrunk smaller. A size bigger than the photo is skipped.
READ_SIDES = (1000, None, 700)
# The first code line is 44 characters long. The reader may drop a few "<"
# (it reads the same letter twice in a row as one), so this is kept low.
MIN_LINE_LENGTH = 20
# The first line has no digits (the second has about 20), but the reader may
# take a letter for a digit now and then.
MAX_DIGITS = 3
# 4 or more of the same letter in a row is the "<<<<" filler read as letters
# (K, C or L), not a name.
FILLER_RUN = 4


def _first_line(rows):
    """The text row that looks like the passport's first code line, or None.
    It starts with P and has "<" signs but (almost) no digits, which tells it
    from the second line (which starts with the passport number)."""
    best = None
    for row in rows:
        text = row.upper().replace(" ", "")
        if len(text) < MIN_LINE_LENGTH or text[0] != "P" or not (text[1] == "<" or text[1].isalpha()):
            continue
        if sum(char.isdigit() for char in text) > MAX_DIGITS or "<" not in text[2:]:
            continue
        # If more than one row looks like it, the one with the most "<" signs is it.
        if best is None or text.count("<") > best.count("<"):
            best = text
    return best


def _name_after(line, header_length):
    """The full name in the first code line ("GIVEN NAMES SURNAME"), taken
    after its first header_length characters, or ""."""
    body = line[header_length:]
    surname, _, given = body.partition("<<")
    # Given names first, like a profile name; if the "<<" was misread, the words stay in line order.
    parts = (given + "<" + surname) if given.strip("<") else body
    words = []
    for word in parts.replace("<", " ").split():
        letters = "".join(char for char in word if char.isalpha())
        # Drop leftover digits or symbols and the filler read as letters ("KKKKK").
        is_filler = len(letters) >= FILLER_RUN and len(set(letters)) == 1
        if len(letters) > 1 and not is_filler:
            words.append(letters)
    return " ".join(words)


def _names_in_line(line):
    """The names the first code line can hold. The header is "P", "<" and a
    3-letter country code (5 characters); if the reader dropped the "<", it is
    4, so both are tried. The usual one comes first."""
    names = []
    for header_length in (5, 4):
        name = _name_after(line, header_length)
        if name and name not in names:
            names.append(name)
    return names


def _country(line):
    """Which country issued the passport, from its first code line (panel
    revision, PLAN-panel-revisions.md: freelancers must be Filipino).

    Returns "PHL" when the country code is the Philippines' (or one misread
    letter away from it, like "PHI"), "other" when it is clearly another
    country's, and None when it can't be told. It only says "other" when the
    "<" after the "P" was read, so the code's place in the line is certain:
    when in doubt, the passport goes on to the admin instead of being refused."""
    # After "P<", or right after "P" if the reader dropped the "<".
    for code in (line[2:5], line[1:4]):
        if len(code) == 3 and sum(a != b for a, b in zip(code, "PHL")) <= 1:
            return "PHL"
    if len(line) >= 5 and line[1] == "<" and line[2:5].isalpha():
        return "other"
    return None


def _versions(photo):
    """The photo at the sizes in READ_SIDES (a bigger size than the photo is skipped)."""
    side = max(photo.size)
    sides = [wanted or side for wanted in READ_SIDES if wanted is None or wanted <= side]
    for wanted in dict.fromkeys(sides):  # no size twice
        if wanted == side:
            yield photo
        else:
            scale = wanted / side
            yield photo.resize((max(1, round(photo.width * scale)), max(1, round(photo.height * scale))), Image.LANCZOS)


def check_passport_mrz(photo, profile_name, with_country=False):
    """Looks for the code lines on the passport's photo page (a Pillow image).

    Returns (status, name_in_the_code), the same words id_qr.py uses:
      "match":      the name in the code lines matches the profile name
      "mismatch":   it doesn't (a warning sign for the admin)
      "unreadable": the first code line was found but no name could be read from it
      "not_found":  no code lines could be read in the photo
    With with_country=True it also returns the issuing country as a third value
    ("PHL", "other" or None, see _country()).
    """
    deadline = time.monotonic() + SECONDS
    found_a_line = False
    first_names = []  # the names the first reading that could read one said
    country = None  # the first reading that could tell the country decides it

    def answer(status, name):
        return (status, name, country) if with_country else (status, name)

    for version in _versions(photo):
        left = deadline - time.monotonic()
        if left <= 0:
            break
        rows, _ = read_boxes(to_pixels(version), seconds=left)
        line = _first_line([row["text"] for row in rows])
        if line is None:
            continue
        found_a_line = True
        # A reading that says Philippines wins over one that said "other",
        # so one misread line can't refuse a Filipino.
        line_country = _country(line)
        if line_country == "PHL" or country is None:
            country = line_country or country
        names = _names_in_line(line)
        for name in names:
            if names_match(profile_name or "", name):
                return answer("match", name[:200])
        first_names = first_names or names

    if not found_a_line:
        return answer("not_found", None)
    if not first_names:
        return answer("unreadable", None)
    return answer("mismatch", first_names[0][:200])
