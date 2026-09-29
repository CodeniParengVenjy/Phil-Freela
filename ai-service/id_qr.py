"""Reads the QR code on a PhilSys ID and compares its name with the profile.

The PhilID card has its QR code on the back; the printed ePhilID has it on
the front. The QR holds the ID's details as plain JSON (name, birthday, card
number) plus the PSA's digital signature. Anyone can read the details; only
checking the signature needs the PSA's public key, which the PSA gives to
approved organizations. So this can't prove an ID is real: it's a flag for
the admin. A fake ID often has no QR, an unreadable one, or one copied from
someone else's ID, whose name then doesn't match the profile.

Uses OpenCV's built-in QR reader (no AI model needed).
"""

import difflib
import json
import unicodedata

import cv2

from face_check import to_pixels

# Two names count as the same word at this similarity (0 to 1), so small
# differences like "VENJ" and "VENJY", or a missing accent, still match.
SAME_WORD = 0.8

# Keys the PhilSys QR (and similar JSON) use for name parts, in lowercase.
GIVEN_NAME_KEYS = {"fname", "firstname", "first_name", "givenname", "given_name", "givennames"}
MIDDLE_NAME_KEYS = {"mname", "middlename", "middle_name"}
LAST_NAME_KEYS = {"lname", "lastname", "last_name", "surname", "familyname"}
SUFFIX_KEYS = {"suffix"}
FULL_NAME_KEYS = {"name", "fullname", "full_name"}

_readers = [cv2.QRCodeDetectorAruco(), cv2.QRCodeDetector()]


def _read_qr_texts(image):
    """The text of every QR code OpenCV can read in a photo (maybe none)."""
    pixels = to_pixels(image)
    texts = []
    # Dense QR codes read better when the photo is enlarged, small blurry ones
    # when it's shrunk, so a few sizes are tried.
    for scale in (1.0, 1.5, 0.75):
        sized = pixels if scale == 1.0 else cv2.resize(pixels, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        for reader in _readers:
            try:
                found, decoded, _, _ = reader.detectAndDecodeMulti(sized)
            except cv2.error:
                continue
            if found:
                texts += [text for text in decoded if text]
        if texts:
            return texts
    return texts


def _find_name(data):
    """The full name inside the QR's JSON, or "" if there's none."""
    parts = {"given": "", "middle": "", "last": "", "suffix": "", "full": ""}

    def walk(value):
        if isinstance(value, dict):
            for key, item in value.items():
                lowered = str(key).lower()
                if isinstance(item, str):
                    if lowered in GIVEN_NAME_KEYS:
                        parts["given"] = item
                    elif lowered in MIDDLE_NAME_KEYS:
                        parts["middle"] = item
                    elif lowered in LAST_NAME_KEYS:
                        parts["last"] = item
                    elif lowered in SUFFIX_KEYS:
                        parts["suffix"] = item
                    elif lowered in FULL_NAME_KEYS:
                        parts["full"] = item
                else:
                    walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(data)
    name = " ".join(part for part in (parts["given"], parts["middle"], parts["last"], parts["suffix"]) if part.strip())
    return (name or parts["full"]).strip()


def _words(name):
    """A name as plain uppercase words, without accents or punctuation."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return [word for word in "".join(c if c.isalpha() else " " for c in plain.upper()).split() if len(word) > 1]


def names_match(profile_name, id_name):
    """True when the profile name looks like the name on the ID. The ID has
    the full legal name (with middle name) and a profile may leave some out,
    so it's enough that 2 of the profile's words are on the ID (or its only
    word, for a one-word name)."""
    profile_words, id_words = _words(profile_name), _words(id_name)
    if not profile_words or not id_words:
        return False
    found = sum(1 for word in profile_words if any(difflib.SequenceMatcher(None, word, other).ratio() >= SAME_WORD for other in id_words))
    return found >= min(2, len(profile_words))


def check_philsys_qr(photos, profile_name):
    """Looks for the PhilSys QR in the ID photos (front, then back).

    Returns (status, name_on_qr):
      "match":      the QR's name matches the profile name
      "mismatch":   it doesn't (a warning sign for the admin)
      "unreadable": a QR was found but it has no name we can read
      "not_found":  no QR code could be read in the photos
    """
    texts = []
    for photo in photos:
        if photo is not None:
            texts += _read_qr_texts(photo)
    if not texts:
        return "not_found", None

    for text in texts:
        try:
            name = _find_name(json.loads(text))
        except (ValueError, TypeError):
            continue
        if name:
            return ("match" if names_match(profile_name or "", name) else "mismatch"), name[:200]
    return "unreadable", None
