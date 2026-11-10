"""Reads the QR code on a PhilSys ID and compares its name with the profile.

The PhilID card has its QR code on the back; the printed ePhilID has it on
the front. The card's QR holds the ID's details as plain JSON (name, birthday,
card number) plus the PSA's digital signature. The ePhilID's QR is a newer
format: "PH1:" and then Base45 text holding a signed CBOR packet (the same
kind of packet as the EU's COVID certificates) with the same details inside.
Anyone can read the details; only checking the signature needs the PSA's
public key, which the PSA gives to approved organizations. So this can't prove
an ID is real: it's a flag for the admin, who can check the QR for real on the
PSA's PhilSys Check site. A fake ID often has no QR, an unreadable one, or one
copied from someone else's ID, whose name then doesn't match the profile.
Only the name is read and kept: the birthday, card number and the tiny photo
inside the ePhilID's QR are ignored.

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


# The ePhilID's QR text is "PH1:" and then Base45 (RFC 9285): the 45 characters
# a QR code stores most compactly (digits, capital letters, and space $ % * + - . / :).
BASE45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
# In the signed packet, this claim holds the card's details; "sb" (the subject)
# has fn, mn, ln and sf (first, middle, last name and suffix) next to the
# birthday and card number, which are never read.
EPHILID_DETAILS_CLAIM = 169


def _base45_decode(text):
    """Base45 text as bytes (ValueError if it isn't valid Base45).
    Every 3 characters make 2 bytes, and a last pair makes 1 byte."""
    values = [BASE45.index(char) for char in text]
    data = bytearray()
    for start in range(0, len(values), 3):
        group = values[start:start + 3]
        if len(group) == 1:
            raise ValueError("bad Base45 length")
        number = sum(value * 45 ** place for place, value in enumerate(group))
        if number > (0xFFFF if len(group) == 3 else 0xFF):
            raise ValueError("bad Base45 group")
        data += number.to_bytes(len(group) - 1, "big")
    return bytes(data)


def _cbor(data, start=0, depth=0):
    """Reads one CBOR value (RFC 8949) from bytes: returns (value, where it
    ends). Enough for a signed ePhilID packet: numbers, text, bytes, lists and
    maps. A tag (like 18, "signed message") is skipped, and true/false/null/
    floats come back as None. Anything odd raises ValueError."""
    if depth > 8 or start >= len(data):
        raise ValueError("bad CBOR")
    kind, extra = data[start] >> 5, data[start] & 31
    position = start + 1
    if extra < 24:
        size = extra
    elif extra < 28:
        width = 1 << (extra - 24)  # the size is in the next 1, 2, 4 or 8 bytes
        if position + width > len(data):
            raise ValueError("bad CBOR")
        size = int.from_bytes(data[position:position + width], "big")
        position += width
    else:
        raise ValueError("unsupported CBOR")  # endless lists or texts aren't used here
    if kind == 0:
        return size, position
    if kind == 1:
        return -1 - size, position
    if kind in (2, 3):
        end = position + size
        if end > len(data):
            raise ValueError("bad CBOR")
        chunk = bytes(data[position:end])
        return (chunk if kind == 2 else chunk.decode("utf-8")), end
    if kind in (4, 5):
        count = size * (2 if kind == 5 else 1)
        if count > len(data) - position:  # every item takes at least one byte
            raise ValueError("bad CBOR")
        items = []
        for _ in range(count):
            item, position = _cbor(data, position, depth + 1)
            items.append(item)
        if kind == 4:
            return items, position
        return dict(zip(items[0::2], items[1::2])), position  # TypeError if a key can't be a key
    if kind == 6:
        return _cbor(data, position, depth + 1)
    return None, position


def _ephilid_name(text):
    """The full name inside an ePhilID's QR text, or "" if the text isn't one."""
    prefix, colon, body = text.partition(":")
    if not colon or not 1 <= len(prefix) <= 6 or not prefix.isalnum():
        return ""
    try:
        # A signed message: [protected, unprotected, payload, signature], and
        # the payload is CBOR again.
        packet, _ = _cbor(_base45_decode(body))
        claims, _ = _cbor(packet[2])
        subject = claims[EPHILID_DETAILS_CLAIM]["sb"]
        parts = [subject.get(key) for key in ("fn", "mn", "ln", "sf")]
        return " ".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
    except (ValueError, TypeError, KeyError, IndexError, AttributeError):
        return ""


def _name_in_qr(text):
    """The name in one QR code's text, from the card's JSON or from an
    ePhilID's signed packet; "" if it holds neither."""
    try:
        name = _find_name(json.loads(text))
    except (ValueError, TypeError):
        name = ""
    return name or _ephilid_name(text)


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
    """Looks for the PhilSys QR in the ID photos (front, then back): a PhilID
    card's JSON QR on the back, or an ePhilID's signed QR on the front.

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
        name = _name_in_qr(text)
        if name:
            return ("match" if names_match(profile_name or "", name) else "mismatch"), name[:200]
    return "unreadable", None
