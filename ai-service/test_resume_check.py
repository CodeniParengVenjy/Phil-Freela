"""Checks the resume check (resume_check.py and its route in main.py). It uses
the real pretrained text model but no database: the route check replaces the
login check. From the ai-service folder, run:

    python test_resume_check.py

(the service's own virtual environment is fine). Every check prints PASS or
FAIL, and the script exits with 1 if any check failed.

Two parts:
1. Measuring. resume_samples.py has made-up resumes and other documents. SET A
   is what the numbers in resume_check.py were chosen from; SET B was written
   after the numbers were fixed and shows how the check does on texts it has
   never seen. What matters most is that no real resume is called "no" (the
   website refuses those), and that the other documents are.
2. Files. A PDF made here by hand (so no PDF library is needed), Word files
   (also one made of text boxes, like many resume templates), and the ways a
   file can be wrong: a zip that is not a Word file, a broken or locked PDF, a
   scan with no text, a picture, a program, an empty file, a file that is too big.
"""

import io
import os
import sys
import time
import zipfile

# Made-up values, set BEFORE main is imported, so the real keys in .env are never used.
os.environ["SUPABASE_URL"] = "https://example.invalid"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.made-up-signature-for-tests"

from docx import Document  # noqa: E402
from fastapi import HTTPException, UploadFile  # noqa: E402
from PIL import Image  # noqa: E402
from pypdf import PdfReader, PdfWriter  # noqa: E402

import main  # noqa: E402
import resume_check as rc  # noqa: E402
import resume_samples as samples  # noqa: E402
from resume_test_pictures import photographed, png_bytes, render_page, scanned_pdf  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail and not ok else ""))


def verdict_of(score):
    return "yes" if score >= rc.YES_FROM else "unsure" if score >= rc.NO_BELOW else "no"


# ---------------------------------------------------------------------------
# 1. Measuring
# ---------------------------------------------------------------------------

def measure(label, resumes, others):
    rows = {name: rc.score_text(text)[0] for name, text in {**resumes, **others}.items()}
    yes = [n for n in resumes if verdict_of(rows[n]) == "yes"]
    unsure = [n for n in resumes if verdict_of(rows[n]) == "unsure"]
    blocked = [n for n in resumes if verdict_of(rows[n]) == "no"]
    stopped = [n for n in others if verdict_of(rows[n]) == "no"]
    passed = [n for n in others if verdict_of(rows[n]) != "no"]
    print(f"\n{label}: {len(resumes)} resumes: {len(yes)} yes, {len(unsure)} not sure, {len(blocked)} refused | "
          f"{len(others)} other documents: {len(stopped)} refused, {len(passed)} let through")
    print("  resumes:  " + ", ".join(f"{n} {rows[n]}" for n in resumes))
    print("  others:   " + ", ".join(f"{n} {rows[n]}" for n in others))
    check(f"{label}: no real resume is refused", not blocked, f"refused: {blocked}")
    check(f"{label}: every other document is refused", not passed, f"let through: {passed}")
    check(f"{label}: the lowest resume is well above the highest other document (a gap to spare)",
          min(rows[n] for n in resumes) - max(rows[n] for n in others) >= 5,
          f"{min(rows[n] for n in resumes)} against {max(rows[n] for n in others)}")
    return yes


measure("SET A (the numbers were chosen from these)", samples.A_RESUMES, samples.A_OTHERS)
measure("SET B (never used to choose a number)", samples.B_RESUMES, samples.B_OTHERS)
print()


# ---------------------------------------------------------------------------
# 2. Files
# ---------------------------------------------------------------------------

def pdf_with_text(pages):
    """A small PDF whose pages hold the given lines of text (the standard
    Helvetica font), made by hand so this test needs no PDF library."""
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>"]
    kids = " ".join(f"{4 + 2 * i} 0 R" for i in range(len(pages)))
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for i, lines in enumerate(pages):
        page_no, content_no = 4 + 2 * i, 5 + 2 * i
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {content_no} 0 R /Resources << /Font << /F1 3 0 R >> >> >>".encode())
        stream = ["BT", "/F1 10 Tf", "13 TL", "40 760 Td"]
        for line in lines:
            safe = line.encode("latin-1", "replace").decode("latin-1").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            stream.append(f"({safe}) Tj T*")
        stream.append("ET")
        body = "\n".join(stream).encode("latin-1")
        objects.append(b"<< /Length " + str(len(body)).encode() + b" >>\nstream\n" + body + b"\nendstream")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def pdf_of(text):
    lines = text.split("\n")
    return pdf_with_text([lines[i:i + 50] for i in range(0, len(lines), 50)])


def docx_of(text):
    document = Document()
    for line in text.split("\n"):
        document.add_paragraph(line)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def docx_with_text_boxes(text):
    """A Word file whose words are ALL in a text box, the way many resume
    templates are made. python-docx can't see text boxes."""
    paragraphs = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in text.replace("&", "and").split("\n"))
    namespaces = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml"'
    document = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {namespaces}><w:body>'
                f"<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent>{paragraphs}</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>"
                "</w:body></w:document>")
    types = ('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="xml" ContentType="application/xml"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("word/document.xml", document)
    return buffer.getvalue()


def picture_bytes(kind):
    buffer = io.BytesIO()
    Image.new("RGB", (60, 40), "white").save(buffer, kind)
    return buffer.getvalue()


RESUME = samples.A_RESUMES["designer"]
INVOICE = samples.A_OTHERS["invoice"]

# --- A resume, in each kind of file
for label, data in (("a PDF", pdf_of(RESUME)), ("a Word file", docx_of(RESUME)), ("a Word file made of text boxes", docx_with_text_boxes(RESUME))):
    answer = rc.check_resume(data)
    check(f"{label} with a resume in it: yes", answer["verdict"] == "yes" and answer["message"] == "", str(answer))

# --- Something else, in each kind of file
for label, data in (("a PDF", pdf_of(INVOICE)), ("a Word file", docx_of(INVOICE))):
    answer = rc.check_resume(data)
    check(f"{label} with an invoice in it: no, with the plain message", answer["verdict"] == "no" and answer["message"] == rc.NOT_A_RESUME, str(answer))
answer = rc.check_resume(docx_with_text_boxes(INVOICE))
check("a Word file of text boxes with an invoice in it: no", answer["verdict"] == "no", str(answer))

# --- The answer carries what was found, and a score
answer = rc.check_resume(pdf_of(RESUME))
check("the answer lists what was found (headings, email, phone, dates, skills)",
      {"Experience", "Education", "Skills", "Email", "Phone number"} <= set(answer["found"]) and isinstance(answer["score"], int), str(answer["found"]))

# --- A many-page PDF: only the first pages are read, and quickly
long_pdf = pdf_with_text([[f"Line {i} of page {p} about nothing in particular." for i in range(45)] for p in range(30)])
started = time.time()
answer = rc.check_resume(long_pdf)
check("a 30-page document is read quickly (only the first 5 pages)", time.time() - started < 5 and answer["verdict"] == "no", f"{time.time() - started:.1f}s {answer['verdict']}")

# --- The ways a file can be wrong
fake_word = io.BytesIO()
with zipfile.ZipFile(fake_word, "w") as archive:
    archive.writestr("notes.txt", "this zip is not a Word file")
answer = rc.check_resume(fake_word.getvalue())
check("a zip that is not a Word file: no, and says so", answer["verdict"] == "no" and "isn't a real Word file" in answer["message"], str(answer))

answer = rc.check_resume(b"%PDF-1.4\nthis is not really a pdf at all" + b"\x00" * 50)
check("a broken PDF: no, with the reading message", answer["verdict"] == "no" and answer["message"] == rc.UNREADABLE, str(answer))

writer = PdfWriter(clone_from=PdfReader(io.BytesIO(pdf_of(RESUME))))
writer.encrypt("secret")
locked = io.BytesIO()
writer.write(locked)
answer = rc.check_resume(locked.getvalue())
check("a PDF locked with a password: no, and says so", answer["verdict"] == "no" and "password" in answer["message"], str(answer))

# --- Pictures and scans: the words are READ from the picture (resume_ocr.py)
answer = rc.check_resume(scanned_pdf([Image.new("RGB", (1240, 1754), "white")]))
check("a scanned PDF of a blank page: no (no text in it)", answer["verdict"] == "no" and answer["message"] == rc.NO_TEXT_IN_PDF, str(answer))

for kind in ("PNG", "JPEG", "WEBP"):
    answer = rc.check_resume(picture_bytes(kind))
    check(f"a {kind} picture with no text in it: no, with its own message", answer["verdict"] == "no" and answer["message"] == rc.NO_TEXT_IN_PICTURE, str(answer))

resume_page = render_page(RESUME)
invoice_page = render_page(INVOICE)
answer = rc.check_resume(png_bytes(resume_page))
check("a picture of a resume: yes", answer["verdict"] == "yes" and answer["message"] == "", str(answer))
answer = rc.check_resume(photographed(resume_page, seed=1))
check("a phone photo of a resume (turned, skewed, shaded, soft, low quality): not refused", answer["verdict"] in ("yes", "unsure"), str(answer))
answer = rc.check_resume(png_bytes(invoice_page))
check("a picture of an invoice: no, with the plain message", answer["verdict"] == "no" and answer["message"] == rc.NOT_A_RESUME, str(answer))
answer = rc.check_resume(scanned_pdf([resume_page]))
check("a scanned PDF of a resume: yes", answer["verdict"] == "yes", str(answer))
answer = rc.check_resume(scanned_pdf([invoice_page]))
check("a scanned PDF of an invoice: no", answer["verdict"] == "no" and answer["message"] == rc.NOT_A_RESUME, str(answer))
answer = rc.check_resume(scanned_pdf([resume_page, invoice_page, invoice_page]))
check("a scanned PDF reads only its first 2 pages (a resume, then an invoice, then more)", answer["verdict"] != "no", str(answer))

answer = rc.check_resume(b"\xff\xd8\xff\xe0" + b"garbage that is not a picture " * 20)
check("a broken picture (starts like a JPEG): no, with the opening message", answer["verdict"] == "no" and answer["message"] == rc.UNREADABLE_PICTURE, str(answer))
huge = io.BytesIO()
Image.new("1", (6000, 6000)).save(huge, "PNG")  # 36 megapixels, a few KB: more pixels than any photo of a page
answer = rc.check_resume(huge.getvalue())
check("a picture of 36 megapixels is refused before it is opened", answer["verdict"] == "no" and answer["message"] == rc.UNREADABLE_PICTURE, str(answer))

# A photo with a sign in it, or an ID card: lines of text are found, but only a few words can be read. Not a resume.
sign = render_page("OPEN NOW\nBIG SALE\nFREE PARKING\nVISIT US\nTHANK YOU\nSEE YOU SOON", size=70)
answer = rc.check_resume(png_bytes(sign))
check("a picture of a sign (a few big words, several lines): no", answer["verdict"] == "no" and answer["message"] in (rc.NO_TEXT_IN_PICTURE, rc.NOT_ENOUGH_TEXT_IN_PICTURE), str(answer))
real_read_picture = rc.read_picture
rc.read_picture = lambda image: ("Open now\nBig sale\nFree parking", 6, False)
answer = rc.check_resume(png_bytes(sign))
check("6 lines found but only 6 words read from a picture: no, with the 'read enough text' message", answer["verdict"] == "no" and answer["message"] == rc.NOT_ENOUGH_TEXT_IN_PICTURE, str(answer))
rc.read_picture = real_read_picture
answer = rc.check_resume(scanned_pdf([sign]))
check("the same sign as a scanned PDF: no", answer["verdict"] == "no", str(answer))

# The reader running out of time, or failing, must never refuse a file:
rc.read_picture = lambda image: (INVOICE, 40, True)
answer = rc.check_resume(png_bytes(invoice_page))
check("an invoice picture whose reading ran out of time: not sure, never no", answer["verdict"] == "unsure", str(answer))
rc.read_picture = lambda image: ("", 0, True)
answer = rc.check_resume(png_bytes(invoice_page))
check("a picture whose reading ran out of time before any line: not sure", answer["verdict"] == "unsure", str(answer))


def reader_breaks(image):
    raise RuntimeError("the reader broke")


rc.read_picture = reader_breaks
answer = rc.check_resume(png_bytes(resume_page))
check("a picture when the reader itself breaks: not sure (it goes through)", answer["verdict"] == "unsure", str(answer))
rc.read_picture = real_read_picture

for label, data in (("a program", b"MZ\x90\x00" + b"\x00" * 200), ("an empty file", b""), ("plain text", b"just some words in a text file")):
    answer = rc.check_resume(data)
    check(f"{label}: no", answer["verdict"] == "no" and "PDF" in answer["message"], str(answer))

old_limit = rc.MAX_XML_BYTES
rc.MAX_XML_BYTES = 100
answer = rc.check_resume(docx_of(RESUME))
rc.MAX_XML_BYTES = old_limit
check("a Word file that unpacks to far too much text: refused as unreadable", answer["verdict"] == "no" and answer["message"] == rc.UNREADABLE, str(answer))

short = rc.check_resume(pdf_of("Hello\nThis is a short note."))
check("a PDF with only two lines of text: no (it is looked at as a picture, and has almost no text)", short["verdict"] == "no" and short["message"] == rc.NO_TEXT_IN_PDF, str(short))
short = rc.check_resume(docx_of("Hello\nThis is a short note."))
check("a Word file with almost no text and no picture in it: no", short["verdict"] == "no" and short["message"] == rc.NO_TEXT_IN_WORD, str(short))
with_picture = Document()
with_picture.add_paragraph("My resume")
with_picture.add_picture(io.BytesIO(picture_bytes("PNG")))
buffer = io.BytesIO()
with_picture.save(buffer)
short = rc.check_resume(buffer.getvalue())
check("a Word file with almost no text but a picture in it (a template made of a picture): not sure, it goes through", short["verdict"] == "unsure", str(short))

# --- The route: the login check is replaced, nothing else
real_get_user_id = main.get_user_id
main.get_user_id = lambda authorization: "a-user"


def upload(data, name="resume.pdf"):
    return main.check_resume_upload(UploadFile(file=io.BytesIO(data), filename=name), authorization="Bearer made-up")


answer = upload(pdf_of(RESUME))
check("the route answers for a resume", answer["verdict"] == "yes", str(answer))
answer = upload(pdf_of(INVOICE))
check("the route answers for an invoice", answer["verdict"] == "no", str(answer))

try:
    upload(b"%PDF-" + b"0" * (rc.MAX_RESUME_BYTES + 10))
    check("the route refuses a file over 4 MB", False, "no error")
except HTTPException as error:
    check("the route refuses a file over 4 MB", error.status_code == 400, str(error.detail))

main.get_user_id = real_get_user_id  # back to the real login check
try:
    main.check_resume_upload(UploadFile(file=io.BytesIO(pdf_of(RESUME)), filename="resume.pdf"), authorization=None)
    check("the route needs a login", False, "no error")
except HTTPException as error:
    check("the route needs a login", error.status_code == 401, str(error.detail))

failed = results.count(False)
print(f"\n{len(results) - failed} of {len(results)} checks passed")
sys.exit(1 if failed else 0)
