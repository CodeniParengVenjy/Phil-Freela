"""Tests the ePhilID support: reading the ePhilID's QR code (id_qr.py) and turning
sideways ID photos upright (photo_checks.py). From the ai-service folder, run:

    .venv\\Scripts\\python test_ephilid.py

It needs the models folder filled by get_models.py. Every check prints PASS or
FAIL, and the script exits with 1 if any failed.

Three parts:
  A. the QR text, no pictures: Base45, CBOR, the signed packet, the name inside
  B. made-up ePhilID pictures with a made-up QR, read by OpenCV, then judged
  C. sideways photos turned upright (a made-up face finder for the front, the
     real text finder for the back)

Everything is invented (names, numbers, pictures). The QR is built the way a
real ePhilID's is ("PH1:" and Base45 text holding a signed CBOR packet); a real
ePhilID photo should also be tried by hand (PLAN-ephilid.md).
"""

import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import id_qr
import photo_checks

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail and not ok else ""))


# ---------------------------------------------------------------------------
# Test-side encoders (the service only needs to read these formats)
# ---------------------------------------------------------------------------

B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"


def base45_encode(data):
    out = ""
    for i in range(0, len(data), 2):
        chunk = data[i:i + 2]
        if len(chunk) == 2:
            n = chunk[0] * 256 + chunk[1]
            out += B45[n % 45] + B45[(n // 45) % 45] + B45[n // 2025]
        else:
            out += B45[chunk[0] % 45] + B45[chunk[0] // 45]
    return out


def cbor_head(kind, size):
    if size < 24:
        return bytes([kind << 5 | size])
    if size < 256:
        return bytes([kind << 5 | 24, size])
    if size < 65536:
        return bytes([kind << 5 | 25]) + size.to_bytes(2, "big")
    return bytes([kind << 5 | 26]) + size.to_bytes(4, "big")


def cbor_encode(value):
    if isinstance(value, int):
        return cbor_head(0, value) if value >= 0 else cbor_head(1, -1 - value)
    if isinstance(value, bytes):
        return cbor_head(2, len(value)) + value
    if isinstance(value, str):
        raw = value.encode("utf-8")
        return cbor_head(3, len(raw)) + raw
    if isinstance(value, list):
        return cbor_head(4, len(value)) + b"".join(cbor_encode(item) for item in value)
    if isinstance(value, dict):
        return cbor_head(5, len(value)) + b"".join(cbor_encode(k) + cbor_encode(v) for k, v in value.items())
    raise TypeError(value)


def make_packet(claims):
    """A signed message (COSE_Sign1, tag 18): [protected, unprotected, payload, signature]."""
    return bytes([0xD2]) + cbor_encode([bytes([0xA1, 0x01, 0x27]), {}, cbor_encode(claims), bytes(64)])


def make_claims(first="JUAN", middle="SANTOS", last="DELA CRUZ", suffix=""):
    return {
        1: "PH",
        6: 1779000000,
        8: {3: "key"},
        169: {
            "d": "2026-01-01",
            "i": "PSA",
            "sb": {"s": "MALE", "BF": "O+", "fn": first, "ln": last, "mn": middle, "sf": suffix,
                   "DOB": "2000-01-01", "PCN": "1234567890123456", "POB": "MANILA"},
            "img": b"RIFF" + bytes(300),
        },
    }


def make_qr_text(prefix="PH1", **names):
    return f"{prefix}:{base45_encode(make_packet(make_claims(**names)))}"


# ---------------------------------------------------------------------------
# A. The QR text
# ---------------------------------------------------------------------------

print("--- A. QR text ---")
# The test vectors from the Base45 standard (RFC 9285).
for text, expected in [("BB8", b"AB"), ("QED8WEX0", b"ietf!"), ("UJCLQE7W581", b"base-45"), ("%69 VD92EX0", b"Hello!!")]:
    check(f"Base45 decodes {text!r}", id_qr._base45_decode(text) == expected)
for text in ["GGW", "A", "abc", "ZZZZ"]:
    try:
        id_qr._base45_decode(text)
        check(f"Base45 refuses {text!r}", False)
    except ValueError:
        check(f"Base45 refuses {text!r}", True)

sample = {1: "a", 2: [0, 23, 24, 255, 256, 65535, 65536, -1, -25, -300], 3: b"xy", 4: {"k": "v", "n": {"x": [1, [2, [3]]]}}, 5: "ñandú"}
check("CBOR reads what a CBOR writer wrote (numbers of every size, text, bytes, lists, maps)", id_qr._cbor(cbor_encode(sample))[0] == sample)
try:
    id_qr._cbor(cbor_encode([[[[[[[[[[1]]]]]]]]]]))
    check("CBOR refuses lists nested too deep", False)
except ValueError:
    check("CBOR refuses lists nested too deep", True)
try:
    id_qr._cbor(bytes([0x9A, 0xFF, 0xFF, 0xFF, 0xFF, 0x01]))  # "a list of 4 billion items", 1 byte of data
    check("CBOR refuses a list longer than its data", False)
except ValueError:
    check("CBOR refuses a list longer than its data", True)

for label, names, expected in [
    ("first, middle and last name", {}, "JUAN SANTOS DELA CRUZ"),
    ("no middle name", {"middle": ""}, "JUAN DELA CRUZ"),
    ("a suffix", {"suffix": "JR"}, "JUAN SANTOS DELA CRUZ JR"),
    ("accents", {"first": "JOSÉ", "last": "PEÑA"}, "JOSÉ SANTOS PEÑA"),
]:
    check(f"ePhilID name: {label}", id_qr._ephilid_name(make_qr_text(**names)) == expected, id_qr._ephilid_name(make_qr_text(**names)))

full = make_qr_text()
broken_claims = make_claims()
del broken_claims[169]
list_claims = make_claims()
list_claims[169] = ["not", "a", "map"]
for label, text in [
    ("plain words", "hello"),
    ("just the prefix", "PH1:"),
    ("no prefix", full.split(":", 1)[1]),
    ("a prefix that is too long", "TOOLONGPREFIX:" + full.split(":", 1)[1]),
    ("not Base45", "PH1:not base45 ~~"),
    ("cut in half", full[: len(full) // 2]),
    ("no details claim", "PH1:" + base45_encode(make_packet(broken_claims))),
    ("details that are a list", "PH1:" + base45_encode(make_packet(list_claims))),
    ("a payload that is not CBOR", "PH1:" + base45_encode(bytes([0xD2]) + cbor_encode([b"", {}, b"\xff\xff\xff", b""]))),
    ("JSON, not an ePhilID", '{"fname": "JUAN", "lname": "DELA CRUZ"}'),
]:
    check(f"not an ePhilID, read as no name: {label}", id_qr._ephilid_name(text) == "")

check("the card's JSON name is still found", id_qr._name_in_qr('{"Subject": {"fname": "JUAN", "mname": "SANTOS", "lname": "DELA CRUZ"}}') == "JUAN SANTOS DELA CRUZ")
check("an ePhilID's name is found by the common reader", id_qr._name_in_qr(full) == "JUAN SANTOS DELA CRUZ")
check("neither format gives no name", id_qr._name_in_qr("12345") == "")

# ---------------------------------------------------------------------------
# B. Made-up pictures
# ---------------------------------------------------------------------------


def font(size):
    for name in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def qr_picture(text, module_pixels=8):
    """A QR code as a picture (black modules on white, with a quiet border)."""
    params = cv2.QRCodeEncoder.Params()
    params.mode = cv2.QRCodeEncoder_MODE_ALPHANUMERIC if all(c in B45 for c in text) else cv2.QRCodeEncoder_MODE_AUTO
    params.correction_level = cv2.QRCodeEncoder_CORRECT_LEVEL_M
    small = cv2.QRCodeEncoder.create(params).encode(text)
    modules = np.where(small > 127, 255, 0).astype(np.uint8)
    size = (modules.shape[1] * module_pixels, modules.shape[0] * module_pixels)
    return Image.fromarray(cv2.resize(modules, size, interpolation=cv2.INTER_NEAREST)).convert("RGB")


FRONT_LINES = [
    "REPUBLIKA NG PILIPINAS", "Republic of the Philippines", "PAMBANSANG PAGKAKAKILANLAN", "Philippine Identification",
    "PCN: 1234-5678-9012-3456", "Apelyido/Last Name", "DELA CRUZ", "Mga Pangalan/Given Names", "JUAN",
    "Gitnang Apelyido/Middle Name", "SANTOS", "Suffix",
]
BACK_LINES = [
    "Kasarian/Sex", "MALE", "Araw ng Kapanganakan/Date of Birth", "JANUARY 1, 2000", "Lugar ng Kapanganakan/Place of Birth",
    "MANILA", "Tirahan/Address", "123 SAMPLE STREET, MANILA", "ePhilID Generation Date", "1 JANUARY 2026",
    "Authenticate this ePhilID using PhilSys Check at verify.philsys.gov.ph",
]


def card(lines, qr_text=None, size=(1600, 1100)):
    """A made-up card: lines of text down the left, a grey box for the photo, and a QR on the right."""
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    y = 40
    for line in lines:
        draw.text((40, y), line, fill="black", font=font(46))
        y += 82
    if qr_text:
        qr = qr_picture(qr_text)
        image.paste(qr, (size[0] - qr.width - 30, 40))
    return image


print("--- B. pictures ---")
front = card(FRONT_LINES, make_qr_text())
back = card(BACK_LINES)
print(f"      (QR picture {qr_picture(make_qr_text()).size}, front {front.size})")

status, name = id_qr.check_philsys_qr([front, back], "Juan Dela Cruz")
check("ePhilID front with a QR for this person: match", status == "match" and name == "JUAN SANTOS DELA CRUZ", f"{status} {name}")
status, name = id_qr.check_philsys_qr([front, back], "Juan Cruz")
check("a profile with only some of the name words still matches", status == "match", f"{status} {name}")
status, name = id_qr.check_philsys_qr([front, back], "Maria Clara")
check("ePhilID QR for someone else: mismatch", status == "mismatch" and name == "JUAN SANTOS DELA CRUZ", f"{status} {name}")
status, name = id_qr.check_philsys_qr([front.rotate(90, expand=True), back], "Juan Dela Cruz")
check("the QR is read even when the photo is sideways", status == "match", f"{status} {name}")
status, name = id_qr.check_philsys_qr([front, None], "Juan Dela Cruz")
check("a missing back photo doesn't matter for the front's QR", status == "match", f"{status} {name}")
status, name = id_qr.check_philsys_qr([card(FRONT_LINES, "PH1:" + "ABC123 " * 40), back], "Juan Dela Cruz")
check("a QR that isn't an ePhilID packet: unreadable", status == "unreadable" and name is None, f"{status} {name}")
status, name = id_qr.check_philsys_qr([card(FRONT_LINES), back], "Juan Dela Cruz")
check("no QR at all: not_found", status == "not_found" and name is None, f"{status} {name}")
card_qr = '{"Subject": {"fname": "JUAN", "mname": "SANTOS", "lname": "DELA CRUZ"}, "alg": "EDDSA", "signature": "' + "A" * 200 + '"}'
status, name = id_qr.check_philsys_qr([card(FRONT_LINES), card(BACK_LINES, card_qr)], "Juan Dela Cruz")
check("the PhilSys card's JSON QR on the back still works", status == "match", f"{status} {name}")

# ---------------------------------------------------------------------------
# C. Sideways photos
# ---------------------------------------------------------------------------

print("--- C. sideways photos ---")
real_face_finder = photo_checks._biggest_face


def fake_face_finder(image, side_view=False):
    """A made-up face finder: a "face" is a dark square in the top-left corner."""
    corner = np.asarray(image.convert("L"))[:60, :60]
    return {"box": (0, 0, 60, 60), "turn": 0.0} if corner.mean() < 60 else None


photo_checks._biggest_face = fake_face_finder
upright_front = Image.new("RGB", (1200, 800), "white")
ImageDraw.Draw(upright_front).rectangle((0, 0, 99, 99), fill="black")
for turned_by, undo_by in [(0, 0), (90, 270), (270, 90), (180, 180)]:
    photo = upright_front.rotate(turned_by, expand=True)
    fixed, angle = photo_checks.straighten_front(photo)
    check(f"front photo turned {turned_by} degrees is put upright", np.array_equal(np.asarray(fixed), np.asarray(upright_front)) and angle == undo_by, f"angle {angle}")
untouched = Image.new("RGB", (1200, 800), "white")
fixed, angle = photo_checks.straighten_front(untouched)
check("a front with no face in any direction comes back untouched", fixed is untouched and angle == 0)
upright_object = upright_front.copy()
fixed, angle = photo_checks.straighten_front(upright_object)
check("an upright front is not copied or turned", fixed is upright_object and angle == 0)
photo_checks._biggest_face = real_face_finder

# The real text finder on a made-up back.
upright_back = card(BACK_LINES)
lines = photo_checks._text_lines(upright_back)
check("the made-up back has enough text lines", lines >= photo_checks.MIN_BACK_TEXT_LINES, f"{lines} lines")
for turned_by in (90, 270):
    sideways = upright_back.rotate(turned_by, expand=True)
    sideways_lines = photo_checks._text_lines(sideways)
    fixed = photo_checks.straighten_back(sideways)
    fixed_lines = photo_checks._text_lines(fixed)
    check(f"back photo turned {turned_by} degrees: sideways text isn't counted, then it's turned upright",
          sideways_lines < photo_checks.MIN_BACK_TEXT_LINES and fixed_lines >= photo_checks.MIN_BACK_TEXT_LINES,
          f"{sideways_lines} lines sideways, {fixed_lines} after")
fixed = photo_checks.straighten_back(upright_back)
check("an upright back is not copied or turned", fixed is upright_back)
blank = Image.new("RGB", (1600, 1100), "white")
check("a blank back comes back untouched", photo_checks.straighten_back(blank) is blank)

# Which way a sideways back is turned: the same as the front was, else 90.
real_turned, real_lines = photo_checks._turned, photo_checks._text_lines
asked = []
photo_checks._turned = lambda image, angle: (asked.append(angle), real_turned(image, angle))[1]
photo_checks._text_lines = lambda image: 10 if image.width > image.height else 0
portrait = Image.new("RGB", (800, 1200), "white")
for front_angle, expected in [(0, 90), (90, 90), (270, 270), (180, 90)]:
    asked.clear()
    photo_checks.straighten_back(portrait, front_angle)
    check(f"a sideways back after a front turned {front_angle}: turned {expected}", asked == [expected], f"turned {asked}")
photo_checks._turned, photo_checks._text_lines = real_turned, real_lines

# Both sides together.
photo_checks._biggest_face = fake_face_finder
fixed_front, fixed_back = photo_checks.straighten_id(upright_front.rotate(90, expand=True), upright_back.rotate(270, expand=True))
check("both sides of a sideways ID are put upright", np.array_equal(np.asarray(fixed_front), np.asarray(upright_front))
      and photo_checks._text_lines(fixed_back) >= photo_checks.MIN_BACK_TEXT_LINES)
fixed_front, fixed_back = photo_checks.straighten_id(upright_front)
check("a passport-style front alone (no back) is fine", fixed_back is None and fixed_front is not None)
photo_checks._biggest_face = real_face_finder

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
