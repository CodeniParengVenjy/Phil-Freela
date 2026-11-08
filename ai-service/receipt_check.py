"""Reads a GCash receipt screenshot and looks for signs of a fake
(PLAN-receipt-ai.md). The client only adds the screenshot; nobody types the
reference number or the amount any more.

Two parts:

1. READING (pretrained AI, nothing trained here): the same text finder and
   text reader as the resume check (resume_ocr.py: OpenCV's PP-OCR "DB" finder
   and PaddleOCR's PP-OCRv3 English reader). They turn the screenshot into
   pieces of text with their places. Pieces at the same height are put back on
   one row, so a label ("Ref No.") and its value ("4021 358 091742") stay
   together.
2. JUDGING (plain rules a person can check): from those rows it takes the
   reference number, the amount sent, the date and time, the name GCash printed
   (partly hidden, like "J***n D.") and, when shown, the last 4 digits of the
   number paid. judge() then compares them with the freelancer's saved GCash and
   with PhilFreela's own records, and gives a verdict:
     ok         every check passed
     check      it can be sent, but the freelancer is asked to look carefully
     blocked    a sign of a fake or a wrong receipt: it can't be sent
     unreadable blurry, cut off or too small: "use a clear, full screenshot"

Nothing here can see GCash itself. A careful fake can still pass, so the
freelancer looking at their own GCash before "Confirm received" stays the real
check; this catches the easy fakes and the mistakes, and gives reasons.
"""

import io
import re
from datetime import datetime, timedelta, timezone

from PIL import Image

from resume_ocr import UnreadablePicture, decode_picture, read_boxes

MAX_RECEIPT_BYTES = 4 * 1024 * 1024   # Vercel takes about 4.5 MB per request
SECONDS = 12.0                         # the most time one screenshot may take to read
PH_TIME = timezone(timedelta(hours=8))  # GCash prints Philippine time (no daylight saving)
MIN_ROWS = 3                           # fewer rows of text than this: too blurry or small to read

# How far a receipt's date may be from what PhilFreela knows: a phone clock a
# little ahead, and a payment made a little before the project was opened.
FUTURE_GRACE = timedelta(minutes=10)
EARLY_GRACE = timedelta(days=1)

# Apps that write their name into the pictures they save. A receipt saved by
# one of them was opened in an editor, which a real screenshot never is.
EDITORS = (
    "photoshop", "illustrator", "lightroom", "gimp", "picsart", "canva", "snapseed",
    "pixlr", "fotor", "meitu", "polarr", "photoroom", "affinity", "paint.net",
    "photopea", "picmonkey", "befunky", "photodirector", "inshot", "remini",
)

MONTHS = {name: number for number, names in enumerate([
    ("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"),
    ("may",), ("jun", "june"), ("jul", "july"), ("aug", "august"),
    ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"), ("dec", "december"),
], start=1) for name in names}

# ---------------------------------------------------------------------------
# Patterns for the pieces of a receipt
# ---------------------------------------------------------------------------

# "Ref No.", "Ref. No.", "InstaPay Ref No.", "Reference No.", "Ref #"
REF_LABEL = re.compile(r"\bref(?:erence)?\b\.?\s*(?:no\b|number\b|#)?\.?\s*:?", re.IGNORECASE)
# 13 digits, as GCash spaces them (4021 358 091742) or run together.
REF_DIGITS = re.compile(r"(?<!\d)(\d{4})\s?(\d{3})\s?(\d{6})(?!\d)")
# An amount always has 2 decimals ("1,500.00", "₱500.00", "P 15,750.50"); the
# peso sign is often read as a P, or not at all. Times (11:23) and years don't match.
AMOUNT = re.compile(r"(?<![\d.,:])(?:₱|PHP|P)?\s?(\d{1,3}(?:,\d{3})+|\d{1,7})\.(\d{2})(?![\d:])(?!\s?[AaPp]\.?[Mm]\b)")
# The time after a date: 11:23, 11:23:45, with AM/PM or 24-hour.
_TIME = r"[,\s]*(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?[Mm]\.?)?"
DATES = [
    # Nov 8, 2026 11:23 AM / November 08, 2026, 11:23 AM
    # (the reader sometimes sees the comma as a dot: "Nov 8.2026")
    ("mdy", re.compile(r"\b([A-Za-z]{3,9})\.?\s*(\d{1,2})[,.]?\s*(\d{4})" + _TIME)),
    # 08 Nov 2026 11:23 AM
    ("dmy", re.compile(r"\b(\d{1,2})\s*([A-Za-z]{3,9})[.,]?\s*(\d{4})" + _TIME)),
    # 11/08/2026 11:23 AM (month first, the way phones in the Philippines write it)
    ("num", re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})" + _TIME)),
    # 2026-11-08 11:23:45
    ("iso", re.compile(r"\b(\d{4})-(\d{2})-(\d{2})[T\s]*(\d{1,2}):(\d{2})(?::(\d{2}))?()")),
]
# A number on the receipt, with hidden digits: +63 917 *** 4567, 0917 *** 4567.
PHONE = re.compile(r"(?:\+\s?63|(?<!\d)0)\s?9[\d*•xX]{2}[\s-]?[\d*•xX]{3}[\s-]?(\d{4})(?!\d)")
# A name as GCash prints it, partly hidden: J***n D., JU**N DE** C.
HIDDEN_NAME = re.compile(r"^[A-Za-zÀ-ÿñÑ*•.' -]{2,80}$")


# ---------------------------------------------------------------------------
# 1. Reading
# ---------------------------------------------------------------------------

def _rows(boxes):
    """Puts the pieces of text found at the same height back on one row, left
    to right. Returns [{"text", "height"}] from the top of the picture down."""
    rows = []
    for box in sorted(boxes, key=lambda b: b["middle"]):
        last = rows[-1] if rows else None
        if last and abs(box["middle"] - last["middle"]) <= 0.5 * max(box["height"], last["height"]):
            last["pieces"].append(box)
            last["height"] = max(last["height"], box["height"])
        else:
            rows.append({"middle": box["middle"], "height": box["height"], "pieces": [box]})
    return [
        {"text": " ".join(p["text"] for p in sorted(row["pieces"], key=lambda p: p["left"])), "height": row["height"]}
        for row in rows
    ]


def _money(match):
    return round(float(match.group(1).replace(",", "") + "." + match.group(2)), 2)


def find_reference(rows):
    """The 13-digit reference number: first on a row with a "Ref No." label (or
    the row under it), otherwise any number spaced the way GCash spaces it.
    Returns (reference or None, whether the label was found)."""
    label_found = False
    for index, row in enumerate(rows):
        label = REF_LABEL.search(row["text"])
        if not label:
            continue
        label_found = True
        after = row["text"][label.end():]
        nearby = [after] + ([rows[index + 1]["text"]] if index + 1 < len(rows) else [])
        for text in nearby:
            # The reader sometimes sees a 0 as an O or a 1 as an l inside a number.
            cleaned = text.translate(str.maketrans({"O": "0", "o": "0", "D": "0", "I": "1", "l": "1", "|": "1"}))
            match = REF_DIGITS.search(cleaned)
            if match:
                return "".join(match.groups()), True
    for row in rows:
        if PHONE.search(row["text"]):
            continue
        match = REF_DIGITS.search(row["text"])
        if match:
            return "".join(match.groups()), label_found
    return None, label_found


def _amount_label(text):
    lowered = text.lower()
    if "balance" in lowered or "available" in lowered:
        return "balance"
    if "fee" in lowered or "charge" in lowered:
        return "fee"
    if "total" in lowered:
        return "total"
    if "amount" in lowered:
        return "amount"
    return None


def find_amounts(rows):
    """Every amount on the receipt with what its label says ("amount", "total",
    "fee", "balance" or None for the big amount at the top), and the height of
    its row (the amount sent is printed biggest)."""
    found = []
    for index, row in enumerate(rows):
        if any(pattern.search(row["text"]) for _, pattern in DATES):
            continue  # the date's row: its numbers are not money
        for match in AMOUNT.finditer(row["text"]):
            label = _amount_label(row["text"])
            # A value alone on its row takes the label of the row above it.
            if label is None and index > 0 and not AMOUNT.search(rows[index - 1]["text"]):
                if not re.sub(AMOUNT, "", row["text"]).strip(" ₱P:-"):
                    label = _amount_label(rows[index - 1]["text"])
            found.append({"value": _money(match), "label": label, "height": row["height"]})
    return found


def amount_sent(amounts):
    """(the amount sent to the freelancer, whether the receipt disagrees with
    itself). The "Amount" line wins, then the big amount at the top, then the
    total minus any fee. Every other amount (not a fee or a balance) must be the
    amount sent, or the amount sent plus the fee; anything else means the
    receipt shows two different amounts, which happens when a number is edited."""
    fee = round(sum(a["value"] for a in amounts if a["label"] == "fee"), 2)
    money = [a for a in amounts if a["label"] not in ("fee", "balance")]
    if not money:
        return None, False
    labeled = [a for a in money if a["label"] == "amount"]
    totals = [a for a in money if a["label"] == "total"]
    plain = sorted((a for a in money if a["label"] is None), key=lambda a: -a["height"])
    if labeled:
        sent = labeled[0]["value"]
    elif plain:
        sent = plain[0]["value"]
        if fee and totals and abs(sent - totals[0]["value"]) < 0.005:
            sent = round(sent - fee, 2)  # the top shows the total taken from the wallet
    else:
        sent = round(totals[0]["value"] - fee, 2)
    allowed = {round(sent, 2), round(sent + fee, 2)}
    disagree = any(round(a["value"], 2) not in allowed for a in money)
    return (sent if sent > 0 else None), disagree


def find_paid_at(rows):
    """The date and time on the receipt, in Philippine time, or None."""
    text = " ".join(row["text"] for row in rows)
    for kind, pattern in DATES:
        for match in pattern.finditer(text):
            parts = match.groups()
            try:
                if kind == "mdy":
                    month, day, year = MONTHS.get(parts[0].lower()), int(parts[1]), int(parts[2])
                elif kind == "dmy":
                    day, month, year = int(parts[0]), MONTHS.get(parts[1].lower()), int(parts[2])
                elif kind == "num":
                    month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
                else:
                    year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                if not month:
                    continue
                hour, minute, second = int(parts[3]), int(parts[4]), int(parts[5] or 0)
                half = (parts[6] or "").replace(".", "").lower()
                if half:
                    if not 1 <= hour <= 12:
                        continue
                    hour = (hour % 12) + (12 if half == "pm" else 0)
                return datetime(year, month, day, hour, minute, second, tzinfo=PH_TIME)
            except ValueError:
                continue  # not a real date (like 31 Feb): look further
    return None


def find_name(rows):
    """The name GCash printed for the person paid: after "Sent to" / "To", or
    the first row that looks like a partly hidden name. Returns (name, initials
    as letters) or (None, [])."""
    def clean(text):
        text = PHONE.sub("", text).strip(" :-")
        if not text or re.search(r"\d", text) or "gcash" in text.lower() or not HIDDEN_NAME.match(text):
            return None
        return text

    candidate = None
    for index, row in enumerate(rows):
        label = re.match(r"^\s*(?:sent\s+to|send\s+to|to|recipient)\b\s*:?\s*", row["text"], re.IGNORECASE)
        if label:
            rest = row["text"][label.end():]
            candidate = clean(rest) or (clean(rows[index + 1]["text"]) if index + 1 < len(rows) else None)
            if candidate:
                break
    if not candidate:
        for row in rows:
            if ("*" in row["text"] or "•" in row["text"]) and clean(row["text"]):
                candidate = clean(row["text"])
                break
    if not candidate:
        return None, []
    letters = [word[0].upper() for word in candidate.split() if word[0].isalpha()]
    return candidate, letters


def find_number_end(rows):
    """The last 4 digits of the number paid, when the receipt shows it."""
    for row in rows:
        match = PHONE.search(row["text"])
        if match:
            return match.group(1)
    return None


def editor_used(image):
    """The name of an editing app written inside the picture, or None."""
    notes = []
    for key in ("Software", "software", "XML:com.adobe.xmp", "xmp", "Comment", "comment"):
        value = image.info.get(key)
        if value:
            notes.append(value.decode("utf-8", "ignore") if isinstance(value, bytes) else str(value))
    try:
        exif = image.getexif()
        for tag in (0x0131, 0x013B, 0x010E):  # Software, Artist, ImageDescription
            if exif.get(tag):
                notes.append(str(exif.get(tag)))
    except Exception:
        pass
    joined = " ".join(notes).lower()
    for name in EDITORS:
        if name in joined:
            return name.capitalize() if name != "paint.net" else "Paint.NET"
    return None


def read_receipt(data):
    """Everything this module reads from a screenshot (bytes of a JPEG, PNG or
    WebP). Raises UnreadablePicture for a file that isn't a picture."""
    try:
        picture = Image.open(io.BytesIO(data))
        picture.load()
    except Exception:
        raise UnreadablePicture()
    image = decode_picture(data)
    boxes, timed_out = read_boxes(image, seconds=SECONDS)
    rows = _rows(boxes)
    text = "\n".join(row["text"] for row in rows)
    reference, ref_label = find_reference(rows)
    amount, disagree = amount_sent(find_amounts(rows))
    name, initials = find_name(rows)
    lowered = text.lower()
    return {
        "rows": len(rows),
        "text": text,
        "timed_out": timed_out,
        "is_gcash": "gcash" in lowered.replace(" ", "") or (ref_label and ("sent" in lowered or "send" in lowered)),
        "reference": reference,
        "amount": amount,
        "amounts_disagree": disagree,
        "paid_at": find_paid_at(rows),
        "name": name,
        "initials": initials,
        "number_end": find_number_end(rows),
        "editor": editor_used(picture),
        "sideways": picture.width > picture.height,
    }


# ---------------------------------------------------------------------------
# 2. Judging
# ---------------------------------------------------------------------------

def peso(amount):
    return f"₱{amount:,.2f}"


def when(moment):
    local = moment.astimezone(PH_TIME)
    return f"{local:%b} {local.day}, {local.year} {local.hour % 12 or 12}:{local:%M} {'PM' if local.hour >= 12 else 'AM'}"


def initials_text(letters):
    return " ".join(f"{letter}." for letter in letters)


def account_initials(account_name):
    """"Ana R. Santos" -> ["A", "R", "S"], like name_initials() in the database."""
    return [word[0].upper() for word in (account_name or "").split() if word[:1].isalpha()]


def initials_match(receipt, account):
    """True/False, or None when one side is unknown. The first letters must be
    the same, and the receipt's last letter must be one of the account's other
    letters (GCash may print a shorter name than the one saved on PhilFreela)."""
    if not receipt or not account:
        return None
    if receipt[0] != account[0]:
        return False
    return len(receipt) == 1 or receipt[-1] in account[1:]


def judge(reading, *, account_name, gcash_number, earliest, earliest_what, requested_amount, reuse, now=None):
    """(verdict, reasons) for one reading. Reasons are short sentences without a
    capital letter or full stop, so the database can put the first one into the
    freelancer's notification.
      account_name, gcash_number: the freelancer's saved GCash (None if not saved)
      earliest: when the project started or the payment was asked for
      earliest_what: "the project started" / "the payment was asked for"
      requested_amount: the amount asked for in a chat request, else None
      reuse: {"reference_used", "picture_used", "same_minute"} from the database"""
    now = now or datetime.now(timezone.utc)

    if reading["rows"] < MIN_ROWS:
        return "unreadable", ["the picture is too blurry or too small to read; use a clear, full screenshot"]
    if not reading["is_gcash"]:
        return "blocked", ["this doesn't look like a GCash receipt"]
    missing = [what for what, value in (("reference number", reading["reference"]), ("amount", reading["amount"]),
                                        ("date and time", reading["paid_at"])) if value is None]
    if missing:
        return "unreadable", [f"couldn't read the {' and the '.join(missing)}; use a clear, full screenshot of the receipt"]

    hard, soft = [], []
    if reuse.get("reference_used"):
        hard.append("the reference number on it was already recorded on PhilFreela")
    if reuse.get("picture_used"):
        hard.append("this same screenshot was already used for another payment")
    if reading["amounts_disagree"]:
        hard.append("the receipt shows two different amounts, which happens when a number is edited")

    paid_at = reading["paid_at"]
    if paid_at > now + FUTURE_GRACE:
        hard.append(f"the date on it ({when(paid_at)}) is in the future")
    elif earliest and paid_at < earliest - EARLY_GRACE:
        hard.append(f"the date on it ({when(paid_at)}) is before {earliest_what}")

    name_ok = initials_match(reading["initials"], account_initials(account_name))
    number_ok = None
    if reading["number_end"] and gcash_number:
        number_ok = reading["number_end"] == gcash_number[-4:]
    if name_ok is False and number_ok is False:
        hard.append(f"it was sent to someone else: the initials ({initials_text(reading['initials'])}) and the number "
                    f"ending in {reading['number_end']} don't match the freelancer's GCash")
    elif name_ok is False:
        soft.append(f"the initials on it ({initials_text(reading['initials'])}) don't match the freelancer's GCash name "
                    f"({initials_text(account_initials(account_name))})")
    elif number_ok is False:
        soft.append(f"the number on it ends in {reading['number_end']}, not in {gcash_number[-4:]} like the freelancer's GCash")

    if reading["editor"]:
        soft.append(f"the picture was saved by an editing app ({reading['editor']})")
    if reading["sideways"]:
        soft.append("the picture is wider than it is tall, unlike a phone screenshot")
    if reuse.get("same_minute"):
        soft.append("a payment of the same amount at the same minute was already recorded for this freelancer")
    if requested_amount is not None and abs(float(requested_amount) - reading["amount"]) >= 0.005:
        soft.append(f"the amount ({peso(reading['amount'])}) is different from the {peso(float(requested_amount))} asked for")

    if hard:
        return "blocked", hard
    if soft:
        return "check", soft
    return "ok", []
