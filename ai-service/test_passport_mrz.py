"""Tests the passport check (passport_mrz.py). From the ai-service folder, run:

    .venv\\Scripts\\python test_passport_mrz.py

It needs the models folder filled by get_models.py and takes under a minute.
Every check prints PASS or FAIL, and the script exits with 1 if any failed.

Three parts:
  A. the rules, on text (no pictures): which row is the first code line, and
     how the name is taken out of it
  B. made-up passport photo pages (drawn here, with invented names and numbers)
     read by the real text reader: matching, not matching, no code lines
  C. the re-reading at other photo sizes, with a pretend text reader

The pages are drawn with a plain monospace font; a real passport prints its
code lines in the OCR-B font. On 2026-11-10 the check was also tried by hand
on public specimen passport pages from Wikimedia Commons (Norwegian, Czech
2006 and 2005, Brazilian and Indonesian): the name was read and matched on 4
of the 5 (the Norwegian one only at a smaller size; the Czech 2005 one, with a
busy background, was not found, which would be a warning for the admin). A real passport photo should still be tried by
hand before trusting this.
"""

import io
import os
import sys

# Made-up values, set BEFORE the service's modules are imported, so the real keys in .env are never used.
os.environ["SUPABASE_URL"] = "https://example.invalid"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.made-up-signature-for-tests"

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

import passport_mrz as pm  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail and not ok else ""))


# ---------------------------------------------------------------------------
# A. The rules, on text
# ---------------------------------------------------------------------------

LINE1 = "P<PHLREYES<<MARIA<LUZ<<<<<<<<<<<<<<<<<<<<<<<<"
LINE2 = "P0000000A0PHL0001010F3001010<<<<<<<<<<<<<<00"

check("the first code line is picked out of the rows", pm._first_line(["REPUBLIC OF THE PHILIPPINES", LINE1, LINE2]) == LINE1)
check("the second code line is never taken for the first", pm._first_line([LINE2]) is None)
check("ordinary text rows are not code lines", pm._first_line(["PASSPORT", "PHILIPPINES", "Surname REYES", "Date of birth 01 JAN 2000"]) is None)
check("a first line read with spaces still counts", pm._first_line(["P<PHL REYES<<MARIA<LUZ<<<<<<<<<<<<<<<<<<<<<"]) is not None)
check("lower case letters are fine", pm._first_line([LINE1.lower()]) == LINE1)
check("a row that is too short is not a code line", pm._first_line(["P<PHLREYES<<MARIA"]) is None)


def first_name(line):
    names = pm._names_in_line(line)
    return names[0] if names else ""


check("the name comes out as given names then surname", first_name(LINE1) == "MARIA LUZ REYES", first_name(LINE1))
check("a surname with two words", first_name("P<PHLDELA<CRUZ<<JUAN<MIGUEL<<<<<<<<<<<<<<<<<<<<") == "JUAN MIGUEL DELA CRUZ")
check("the filler read as letters is dropped", first_name("P<PHLREYES<<MARIA<LUZ<KKKKKKKKKKKKKKKKKKKKKKKK") == "MARIA LUZ REYES")
check("a '<<' read as one '<' still gives the words", first_name("P<PHLREYES<MARIA<LUZ<<<<<<<<<<<<<<<<<<<<<<<<") == "REYES MARIA LUZ")
check("digits and symbols are dropped", first_name("P<PHLREYE5<<MARIA<LUZ<<<<<<<<<<<<<<<<<<<<<<<<") == "MARIA LUZ REYE")
check("a line without a name gives no name", first_name("P<PHL<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<") == "")
# Seen on a sample passport: the "<" after the P was dropped, so the header is 4 characters.
dropped = pm._names_in_line("PNOROESTENBYEN<<AASAMUND<SPECIMEN<<<<<<<<<<<<<<")
check("a dropped '<' in the header gives a second way to read the name", "AASAMUND SPECIMEN OESTENBYEN" in dropped, str(dropped))

# The profile name is compared the same way as for the PhilSys QR.
import id_qr  # noqa: E402

check("a profile name with a middle name left out matches", id_qr.names_match("Maria Reyes", "MARIA LUZ REYES"))
check("another person's name does not match", not id_qr.names_match("Juan Dela Cruz", "MARIA LUZ REYES"))


# ---------------------------------------------------------------------------
# B. Made-up passport pages
# ---------------------------------------------------------------------------

def font(names, size):
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


MONO = ("consolab.ttf", "courbd.ttf", "DejaVuSansMono-Bold.ttf")
SANS = ("arial.ttf", "DejaVuSans.ttf")


def code_line(surname, given, country="PHL"):
    """The first code line, 44 characters, as a passport prints it."""
    text = "P<" + country + surname.replace(" ", "<") + "<<" + given.replace(" ", "<")
    return text.ljust(44, "<")[:44]


def passport_page(surname="REYES", given="MARIA LUZ", with_code=True, size=(1250, 880)):
    """A passport's photo page: made-up details and the two code lines at the bottom."""
    page = Image.new("RGB", size, (232, 236, 226))
    draw = ImageDraw.Draw(page)
    draw.rectangle((0, 0, size[0], 90), fill=(40, 60, 110))
    draw.text((40, 22), "REPUBLIC OF THE PHILIPPINES      PASSPORT", fill="white", font=font(SANS, 40))
    draw.rectangle((50, 130, 380, 560), fill=(150, 150, 150))  # where the owner's photo is
    labels = [("Type", "P"), ("Country code", "PHL"), ("Passport No.", "P0000000A"),
              ("Surname", surname), ("Given names", given), ("Nationality", "FILIPINO"),
              ("Date of birth", "01 JAN 2000"), ("Sex", "F"), ("Place of birth", "MANILA"),
              ("Date of expiry", "01 JAN 2030")]
    for index, (label, value) in enumerate(labels):
        top = 130 + index * 42
        draw.text((420, top), label, fill=(90, 90, 90), font=font(SANS, 18))
        draw.text((640, top - 6), value, fill=(20, 20, 20), font=font(SANS, 30))
    if with_code:
        mono = font(MONO, 40)
        draw.text((60, 710), code_line(surname, given), fill=(15, 15, 15), font=mono)
        draw.text((60, 770), LINE2, fill=(15, 15, 15), font=mono)
    return page


def photographed(page, width=None, angle=0, blur=0, border=True, quality=80):
    """The page as a phone photo might show it: on a desk, a little crooked,
    smaller, softer, and saved as a JPEG."""
    if border:
        desk = Image.new("RGB", (page.width + 240, page.height + 240), (96, 78, 62))
        desk.paste(page, (120, 120))
        page = desk
    if angle:
        page = page.rotate(angle, expand=True, fillcolor=(96, 78, 62), resample=Image.BICUBIC)
    if width:
        page = page.resize((width, round(page.height * width / page.width)), Image.LANCZOS)
    if blur:
        page = page.filter(ImageFilter.GaussianBlur(blur))
    buffer = io.BytesIO()
    page.save(buffer, format="JPEG", quality=quality)
    return Image.open(io.BytesIO(buffer.getvalue())).convert("RGB")


def run(photo, profile):
    status, name = pm.check_passport_mrz(photo, profile)
    return status, name


for label, photo in [
    ("a clean page", passport_page()),
    ("a clean page on a desk", photographed(passport_page())),
    ("a page photographed smaller", photographed(passport_page(), width=1000)),
    ("a page a little crooked", photographed(passport_page(), angle=2, quality=70)),
]:
    status, name = run(photo, "Maria Luz Reyes")
    check(f"{label}: the name is read and matches", status == "match", f"{status}, {name}")

status, name = run(photographed(passport_page(surname="DELA CRUZ", given="JUAN MIGUEL")), "Juan Dela Cruz")
check("a two-word surname matches", status == "match", f"{status}, {name}")

status, name = run(passport_page(), "Juan Dela Cruz")
check("another person's profile name is a mismatch, with the name shown", status == "mismatch" and name == "MARIA LUZ REYES", f"{status}, {name}")

status, name = run(passport_page(with_code=False), "Maria Luz Reyes")
check("a page without code lines says not found", status == "not_found" and name is None, f"{status}, {name}")

status, name = run(Image.effect_noise((900, 700), 60).convert("RGB"), "Maria Luz Reyes")
check("a photo with no text says not found", status == "not_found" and name is None, f"{status}, {name}")

status, name = run(Image.new("RGB", (40, 30), "white"), "Maria Luz Reyes")
check("a tiny picture does not crash", status == "not_found", f"{status}, {name}")


# ---------------------------------------------------------------------------
# C. Reading again at other photo sizes
# ---------------------------------------------------------------------------
# A pretend text reader gives the answers it is told to (nothing is read from
# a picture here), so the order of the readings can be checked.

real_read_boxes = pm.read_boxes


def pretend_reader(*answers):
    """Replaces the text reader: its 1st reading gives the 1st list of rows,
    the 2nd the 2nd, and so on (the last list repeats). Returns the list of
    photo widths it was asked to read."""
    widths = []

    def read(pixels, seconds=0):
        widths.append(pixels.shape[1])
        return [{"text": text} for text in answers[min(len(widths), len(answers)) - 1]], False

    pm.read_boxes = read
    return widths


big = Image.new("RGB", (1500, 1000), "white")
# Seen on a sample passport: at full size the reader dropped two "<" signs.
GARBLED = ["PNOROESTENBYEN<<AASAMUNDSPECIMENK<<KKKKK"]
CLEAN = ["P<NOROESTENBYEN<<AASAMUND<SPECIMEN<<<<<<<<<<"]

check("a big photo is read shrunk, as it is, then smaller", [v.width for v in pm._versions(big)] == [1000, 1500, 700])
check("a small photo is read once", [v.width for v in pm._versions(Image.new("RGB", (600, 400)))] == [600])
check("a photo of 800 pixels is read as it is, then smaller", [v.width for v in pm._versions(Image.new("RGB", (800, 500)))] == [800, 700])

widths = pretend_reader(CLEAN)
status = pm.check_passport_mrz(big, "Aasamund Specimen")
check("a match on the first reading stops there", status == ("match", "AASAMUND SPECIMEN OESTENBYEN") and len(widths) == 1, f"{status}, {widths}")

widths = pretend_reader(GARBLED, CLEAN)
status = pm.check_passport_mrz(big, "Aasamund Specimen Oestenbyen")
check("a name misread at one size matches when read again at another", status[0] == "match" and len(widths) == 2, f"{status}, {widths}")

widths = pretend_reader(GARBLED)
status = pm.check_passport_mrz(big, "Juan Dela Cruz")
check("a name that never matches is a mismatch after every size was tried", status[0] == "mismatch" and len(widths) == 3, f"{status}, {widths}")

widths = pretend_reader([], CLEAN)
status = pm.check_passport_mrz(big, "Aasamund Specimen")
check("a size where no code line was read is skipped", status[0] == "match" and len(widths) == 2, f"{status}, {widths}")

widths = pretend_reader(["P<PHL<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"])
status = pm.check_passport_mrz(big, "Maria Reyes")
check("a code line with no readable name is unreadable", status == ("unreadable", None), str(status))

pm.read_boxes = real_read_boxes


# ---------------------------------------------------------------------------
# D. The submit step in main.py, with a pretend database and storage
# ---------------------------------------------------------------------------
# The face and photo checks are pretended (they have their own tests); the
# passport reading is the real one, on the made-up page.

print("--- D. submit step ---")
import types  # noqa: E402

import main  # noqa: E402

USER = "11111111-1111-4111-8111-111111111111"


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.row = db, table, None

    def select(self, *_):
        return self

    eq = neq = in_ = limit = select

    def insert(self, row):
        self.row = row
        return self

    def execute(self):
        if self.row is not None:
            self.db["saved"].append(self.row)
            return Result([self.row])
        return Result(self.db.get(self.table, []))


class Bucket:
    def upload(self, path, data, options):
        pass

    def remove(self, paths):
        pass


class FakeSupabase:
    def __init__(self, full_name):
        self.db = {"profiles": [{"id": USER, "full_name": full_name}], "identity_verifications": [], "saved": []}
        self.storage = types.SimpleNamespace(from_=lambda bucket: Bucket())

    def table(self, name):
        return Query(self.db, name)


def upload_of(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return types.SimpleNamespace(file=io.BytesIO(buffer.getvalue()))


main.check_id_front = main.check_id_back = main.check_face_scan = lambda *images: None
main.check_faces = lambda *images: {"match": True, "distance": 0.4, "same_person": True, "embedding": [0.0] * 128}
main.find_duplicate = lambda *args: None
main.straighten_id = lambda front, back=None: (front, back)


def submit(id_type, full_name, page, back=None):
    """Submits with a pretend database; returns the row that was saved."""
    main.supabase = FakeSupabase(full_name)
    face = Image.new("RGB", (64, 64), "gray")
    main.handle_submission(USER, id_type, upload_of(page), upload_of(back) if back else None, upload_of(face), upload_of(face), upload_of(face))
    return main.supabase.db["saved"][-1]


page = passport_page()
row = submit("passport", "Maria Luz Reyes", page)
check("a passport with the profile's name is saved with a match", row["id_qr_status"] == "match" and row["id_qr_name"] == "MARIA LUZ REYES", str(row))

row = submit("passport", "Juan Dela Cruz", page)
check("a passport with another name is saved with a mismatch", row["id_qr_status"] == "mismatch" and row["id_qr_name"] == "MARIA LUZ REYES", str(row))

row = submit("passport", "Maria Luz Reyes", passport_page(with_code=False))
check("a passport without code lines is saved with not found", row["id_qr_status"] == "not_found" and row["id_qr_name"] is None, str(row))

row = submit("umid", "Maria Luz Reyes", page, back=page)
check("other ID types get no code-line flag", row["id_qr_status"] is None and row["id_qr_name"] is None, str(row))


def broken(*args):
    raise RuntimeError("the reader crashed")


real_check = main.check_passport_mrz
main.check_passport_mrz = broken
row = submit("passport", "Maria Luz Reyes", page)
check("if the reading crashes, the verification is still saved", row["user_id"] == USER and row["id_type"] == "passport", str(row))
check("... and carries no flag", row["id_qr_status"] is None and row["id_qr_name"] is None, str(row))
main.check_passport_mrz = real_check

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
