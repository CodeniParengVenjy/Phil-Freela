"""Is this file a resume? (Resume check, steps 2 and 3 of PLAN-resume-check.md.)

The apply form asks this before a resume is sent, so a wrong file (an invoice,
a contract, a school paper) is stopped with a plain message instead of
reaching the client. Nothing is trained and nothing is saved: the file is read
in memory and forgotten, and no outside AI company sees it (a resume is
personal data, RA 10173).

How it works, in three parts:
1. Read the words: the text of a PDF (pypdf) or of a Word file (its XML; text
   boxes count too). A picture, or a PDF made of pictures (a scan), is read by
   resume_ocr.py: it finds the lines of text and reads them. A picture with
   almost no text in it (a photo of a person, a landscape) is not a resume.
2. Give points for what almost every resume has: headings (Experience,
   Education, Skills...), contact details (an email, a phone number, a link),
   date ranges ("June 2023 - Present") and skills that are in the site's own
   skill list (skills.py).
3. A meaning check with the pretrained MiniLM text model (text_embedder.py): is
   the start of the text closer to a few sentences that describe a resume, or
   to sentences that describe other documents (an invoice, a letter, a
   contract...)? It adds points when it looks like a resume and takes points
   away when it looks like something else, which catches a resume without the
   usual headings and a job post that uses the same words.

The points make a score from 0 to 100. YES_FROM or more is "yes", under
NO_BELOW is "no" (the only one the website blocks), and in between is "not
sure", which goes through, so an honest applicant isn't stopped by a mistake.

The numbers below were picked by measuring made-up resumes and other
documents, not guessed: see test_resume_check.py, which also checks them on
files it was NOT tuned on. It can't stop someone who writes fake headings on
purpose; it is there to catch honest mistakes, like sending the wrong file.
"""

import io
import logging
import re
import zipfile
from xml.etree import ElementTree

import numpy as np
from pypdf import PdfReader

from resume_ocr import UnreadablePicture, decode_picture, read_picture, read_scanned_pdf
from skills import skills_in_text
from text_embedder import embed_texts

# Under Vercel's 4.5 MB per request, like the portfolio documents.
MAX_RESUME_BYTES = 4 * 1024 * 1024
MAX_PAGES = 5            # a resume is one to three pages: only the first five are read
MAX_CHARACTERS = 20000   # ... and only this much text
MAX_XML_BYTES = 20 * 1024 * 1024   # a Word file's text, unpacked (a zip can hide a huge file)
MIN_WORDS = 25           # less text than this can't be judged: a scan, or a page with only a title

YES_FROM = 55
NO_BELOW = 20

# A picture with fewer lines of text than this is not a resume (a resume page
# has dozens): a photo of a person or a view, a logo, a blank page.
MIN_PICTURE_LINES = 4

logger = logging.getLogger("uvicorn.error")

UNREADABLE = "We couldn't read that file. Please save your resume as a PDF or DOCX and try again."
UNREADABLE_PICTURE = "We couldn't open that picture. Please send a JPG or PNG picture, or your resume as a PDF."
NO_TEXT_IN_PICTURE = "We couldn't find any text in this picture. A resume picture should show your whole resume, sharp enough to read. Please send a clearer picture, or your resume as a PDF."
NO_TEXT_IN_PDF = "We couldn't find any text in this PDF. A resume should show your whole resume, sharp enough to read. Please save it as a PDF again, or send a clear picture of it."
NOT_A_RESUME = "This doesn't look like a resume. A resume lists your experience, education and skills. Please choose your resume."


class ResumeProblem(Exception):
    """The file can't be read at all; the message tells the person what to do."""


# ---------------------------------------------------------------------------
# 1. Reading the words
# ---------------------------------------------------------------------------

def file_kind(data):
    """What the file really is, from its first bytes (not its name): "pdf",
    "word" (a Word file is a zip), "picture" or "" for anything else."""
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[:4] == b"PK\x03\x04":
        return "word"
    if data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        return "picture"
    return ""


def _pdf_text(data):
    try:
        reader = PdfReader(io.BytesIO(data))
        # A PDF "locked" only against editing opens with an empty password.
        if reader.is_encrypted and not reader.decrypt(""):
            raise ResumeProblem("This PDF is locked with a password. Please send a PDF without one.")
        return "\n".join((page.extract_text() or "") for page in reader.pages[:MAX_PAGES])
    except ResumeProblem:
        raise
    except Exception:
        raise ResumeProblem(UNREADABLE)


_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _run_text(run):
    """The text of one run: its words, with a tab or a line break as a space."""
    return "".join((part.text or "") if part.tag == _W + "t" else " " if part.tag in (_W + "tab", _W + "br") else "" for part in run)


def _word_text(data):
    """The text of a Word file, one paragraph per line. It reads the file's XML
    itself instead of using python-docx, because python-docx skips text
    boxes, which many resume templates are made of."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            with archive.open("word/document.xml") as part:
                xml = part.read(MAX_XML_BYTES + 1)
    except (KeyError, zipfile.BadZipFile):
        raise ResumeProblem("That file isn't a real Word file. Please save your resume as a DOCX again.")
    if len(xml) > MAX_XML_BYTES:
        raise ResumeProblem(UNREADABLE)
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        raise ResumeProblem(UNREADABLE)

    lines = []
    for paragraph in root.iter(_W + "p"):
        words = []
        for child in paragraph:
            # Runs, and runs inside a link. (Text boxes are paragraphs of their own further on.)
            runs = [child] if child.tag == _W + "r" else child.findall(_W + "r") if child.tag == _W + "hyperlink" else []
            words.extend(_run_text(run) for run in runs)
        lines.append("".join(words))
    return "\n".join(lines)


def _text_from_pictures(read):
    """(text, seen) from a reading function of resume_ocr.py. `seen` is (the
    number of lines of text found, whether the time ran out), or None when the
    reader itself failed (then nothing can be said, and the file goes through)."""
    try:
        text, lines, timed_out = read()
        return text, (lines, timed_out)
    except Exception:
        logger.exception("Reading a picture for the resume check failed")
        return "", None


def read_text(data):
    """(kind, text, seen) of a file. `seen` is None when the words were in the
    file itself; for a picture, or a PDF made of pictures (a scan), the words
    are READ from the picture and `seen` is (lines of text found, time ran out)
    or None if the reader failed."""
    kind = file_kind(data)
    seen = None
    if kind == "pdf":
        text = _pdf_text(data)
        if len(text.split()) < MIN_WORDS:
            # A PDF with no words of its own is a scan: its first pages are read like pictures.
            text, seen = _text_from_pictures(lambda: read_scanned_pdf(data))
    elif kind == "word":
        text = _word_text(data)
    elif kind == "picture":
        try:
            image = decode_picture(data)
        except UnreadablePicture:
            raise ResumeProblem(UNREADABLE_PICTURE)
        text, seen = _text_from_pictures(lambda: read_picture(image))
    else:
        raise ResumeProblem("Please send a PDF, a Word file (.docx) or a picture.")
    text = text.replace("\u00a0", " ").replace("\r", "\n")
    return kind, text[:MAX_CHARACTERS], seen


# ---------------------------------------------------------------------------
# 2. Points for what a resume has
# ---------------------------------------------------------------------------

# Headings of a resume, written as the letters only ("Work Experience:" ->
# "workexperience"), so capitals, spaces, dots and a letter-spaced "E XPERIENCE"
# (some PDFs) all read the same. The number is what finding it adds.
HEADINGS = {
    "Experience": (12, ("workexperience", "experience", "professionalexperience", "employmenthistory", "workhistory", "employment",
                        "relevantexperience", "careerhistory", "experiences", "workexperiences", "internship", "ojt", "onthejobtraining",
                        "academicappointments", "teachingexperience", "researchexperience", "appointments",
                        "karanasan", "karanasansatrabaho", "karanasansapagtatrabaho")),
    "Education": (12, ("education", "educationalbackground", "educationalattainment", "academicbackground", "academicqualifications",
                       "educationandtraining", "educationalqualifications", "edukasyon", "pinagaralan")),
    "Skills": (10, ("skills", "technicalskills", "keyskills", "coreskills", "skillsandabilities", "skillset", "corecompetencies",
                    "competencies", "expertise", "areasofexpertise", "toolsandsoftware", "abilities", "professionalskills", "softwareskills", "kasanayan", "mgakasanayan", "kakayahan", "mgakakayahan")),
    "Summary": (7, ("summary", "professionalsummary", "profile", "professionalprofile", "careerobjective", "objective", "objectives",
                    "aboutme", "careersummary", "personalstatement", "careerprofile", "summaryofqualifications", "layunin", "mgalayunin", "tungkolsaakin")),
    "Personal data": (7, ("personaldata", "personalinformation", "personaldetails", "personalprofile", "personalbackground", "biodata", "personalinfo", "personalnaimpormasyon", "personalnadata")),
    "Certifications": (5, ("certifications", "certification", "certificates", "licensesandcertifications", "trainings", "trainingsandseminars",
                           "seminarsattended", "seminarsandtrainings", "trainingsattended", "professionaldevelopment", "coursesandcertifications",
                           "pagsasanay", "mgapagsasanay", "mgasertipiko")),
    "References": (4, ("references", "characterreferences", "professionalreferences", "referee", "referees", "reperensya", "mgareperensya", "sanggunian")),
    "Projects": (3, ("projects", "selectedprojects", "keyprojects", "personalprojects", "notableprojects")),
    "Achievements": (3, ("achievements", "awards", "awardsandachievements", "honors", "honorsandawards", "accomplishments", "recognitions", "grantsandawards", "awardsandgrants")),
    "Publications": (3, ("publications", "selectedpublications", "presentations", "researchinterests", "researchandpublications")),
    "Languages": (2, ("languages", "languagesspoken", "languageproficiency")),
    "Interests": (2, ("interests", "hobbies", "hobbiesandinterests", "interestsandhobbies")),
    "Contact": (2, ("contact", "contactdetails", "contactinformation", "contactinfo", "contacts")),
}
HEADINGS_MAX = 45

# A line that says what the page is: "Resume", "Curriculum Vitae", "CV".
TITLE_WORDS = ("resume", "curriculumvitae", "cv", "biodata")
TITLE_STARTS = ("resumeof", "curriculumvitaeof", "cvof")
TITLE_POINTS = 6

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# 0917 123 4567, +63 917 123 4567, 09171234567, a landline like (02) 8123 4567, or +63 2 8123 4567.
PHONE = re.compile(r"(?:\+?63|0)\s?9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|\(?0\d{1,2}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}|\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}")
LINK = re.compile(r"linkedin\.com|github\.com|behance\.net|dribbble\.com|upwork\.com|onlinejobs\.ph|facebook\.com|portfolio|https?://|www\.", re.I)
CONTACT_POINTS = {"Email": 6, "Phone number": 6, "Link": 3}

_MONTH = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
_YEAR = r"(?:19|20)\d{2}"
# "2019 - 2023", "June 2020 - Present", "Sept. 2021 to May 2023".
DATE_RANGE = re.compile(rf"(?:{_MONTH}\s+)?{_YEAR}\s*(?:[-\u2013\u2014]|to|until)\s*(?:(?:{_MONTH}\s+)?{_YEAR}|present|current|now|date|ongoing)", re.I)
DATE_POINTS = {1: 5, 2: 9, 3: 13}

SKILL_POINT_EACH = 3
SKILLS_MAX = 15

# Labels that are only on a Filipino "personal data" block (or on a form).
PERSONAL_LABELS = ("date of birth", "birthdate", "birthday", "place of birth", "civil status", "citizenship", "nationality", "religion")
PERSONAL_POINTS = 5   # two or more of them, without a heading for it

# Too little or too much text for a resume.
SHORT_WORDS = ((80, -15), (120, -5))
LONG_WORDS = 2200
LONG_POINTS = -10


def _squeeze(text):
    return re.sub(r"[^a-z]", "", text.lower())


def _heading_of(line):
    """The kind of heading a line is ("Experience", "Education"...) or None. A
    heading is a short line, or the capital letters that start a line
    ("EDUCATION Bachelor of Science..."), or the words before a colon."""
    label = re.split(r"[:(|\d]| - | \u2013 ", line, maxsplit=1)[0]
    candidates = [label]
    if len(line) <= 60:
        candidates.extend(re.findall(r"\(([^)]{3,40})\)", line))  # "KARANASAN (Work Experience)"
    capitals = re.match(r"[A-Z][A-Z &/,]{3,40}", line)
    if capitals:
        candidates.append(capitals.group(0))
    for candidate in candidates:
        squeezed = _squeeze(candidate)
        if not 2 <= len(squeezed) <= 40:
            continue
        for name, (_, phrases) in HEADINGS.items():
            for phrase in phrases:
                if squeezed == phrase or (squeezed.startswith(phrase) and len(squeezed) <= len(phrase) + 12 and len(line) <= 60):
                    return name
    return None


def count_points(text):
    """(points, found, details) for the words of a document, before the meaning check."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    found = []
    points = 0

    headings = {}
    title = False
    for line in lines:
        squeezed_line = _squeeze(line)
        if squeezed_line in TITLE_WORDS or (len(line.split()) <= 6 and squeezed_line.startswith(TITLE_STARTS)):
            title = True
        name = _heading_of(line)
        if name:
            headings.setdefault(name, HEADINGS[name][0])
    lowered = text.lower()
    # A "personal data" block with no heading of its own.
    if "Personal data" not in headings and sum(label in lowered for label in PERSONAL_LABELS) >= 2:
        headings["Personal data"] = PERSONAL_POINTS
    heading_points = min(HEADINGS_MAX, sum(headings.values()))
    points += heading_points
    found.extend(headings)
    if title:
        points += TITLE_POINTS
        found.append("Title")

    flat = " ".join(lines)
    contact = {"Email": bool(EMAIL.search(flat)), "Phone number": bool(PHONE.search(flat)), "Link": bool(LINK.search(flat))}
    for name, present in contact.items():
        if present:
            points += CONTACT_POINTS[name]
            found.append(name)

    ranges = len(DATE_RANGE.findall(flat))
    if ranges:
        points += DATE_POINTS[min(ranges, 3)]
        found.append(f"Dates ({ranges})")

    skills = skills_in_text(flat)
    if skills:
        points += min(SKILLS_MAX, SKILL_POINT_EACH * len(skills))
        found.append(f"Skills from our list ({len(skills)})")

    words = len(flat.split())
    for limit, change in SHORT_WORDS:
        if words < limit:
            points += change
            break
    if words > LONG_WORDS:
        points += LONG_POINTS
    return points, found, {"words": words, "headings": len(headings), "skills": len(skills), "ranges": ranges}


# ---------------------------------------------------------------------------
# 3. The meaning check
# ---------------------------------------------------------------------------

RESUME_SENTENCES = [
    "Resume. Contact details. Objective. Work experience: job title, company, dates and duties. Education: degree, school, years. Skills. References available upon request.",
    "Curriculum vitae: professional summary, employment history, education, trainings and certifications, skills and languages.",
    "Personal data: date of birth, civil status, citizenship. Educational background: elementary, high school, college. Work experience. Seminars attended. Character references.",
    "Experienced professional with several years of experience in the field. Skills and tools. Worked at companies in different roles. Graduate of a bachelor's degree program.",
    "Name, phone, email. Summary. Skills: list of tools and abilities. Experience: positions held, with dates and achievements. Education.",
]
# No field of work in the resume sentences, on purpose: with "graphic designer"
# in them, a job post for a graphic designer looked more like a resume than
# like a job post. The other side has the look-alikes (job posts, a portfolio
# case study, a proposal) as well as the plainly different documents.
OTHER_SENTENCES = [
    "Invoice. Bill to, item description, quantity, unit price, total amount due, payment terms, due date.",
    "Official receipt: amount received, payment method, reference number, thank you for your payment.",
    "Dear Hiring Manager, I am writing to apply for the position advertised. I believe my background makes me a strong candidate. Thank you for your time. Sincerely.",
    "Job vacancy: we are hiring. Job description, responsibilities, requirements, qualifications, salary and benefits. Send your application to our email.",
    "We are hiring a new team member. The job description lists responsibilities, requirements and qualifications for the position, with salary and benefits. Send your application to apply.",
    "Vacancy: looking for an experienced candidate to join our company. Requirements: skills, years of experience, degree. How to apply.",
    "Service agreement between the client and the freelancer. Terms and conditions, scope of work, payment schedule, confidentiality, termination, signatures of both parties.",
    "Certificate of completion. This is to certify that the student has successfully finished the course. Awarded on this day.",
    "School report or essay with an introduction, discussion and conclusion, about a topic from class.",
    "Menu and price list of food and drinks with prices in pesos.",
    "Letter of recommendation. I am pleased to recommend this person, who worked under my supervision, for further studies or employment.",
    "Design project proposal or case study: the client's problem, the design process, mockups and the final results of the project.",
    "A portfolio project showing the problem, the approach, the tools used and the results for a client. Case study with mockups and outcomes.",
    "Project proposal with objectives, scope, timeline, deliverables and budget for the client.",
    "Meeting minutes: date, attendees, agenda, discussion points and action items.",
    "Government application form with fields for name, address, signature and date.",
    "Terms of service and privacy policy of a website.",
    "News article or blog post telling a story about recent events.",
    "Lesson plan or study notes with objectives, activities and homework.",
]
MEANING_WORDS = 200   # the model reads about 256 word pieces: the start of the text decides

# How the closeness to a resume (minus the closeness to the other documents)
# becomes points: MEANING_ZERO is a tie, each MEANING_STEP above it adds
# MEANING_POINTS, and the result is kept between the two limits.
MEANING_ZERO = 0.0
MEANING_STEP = 0.1
MEANING_POINTS = 12
MEANING_LIMITS = (-25, 15)

_prototypes = None


def _prototype_vectors():
    """The meaning numbers of the sentences above, worked out once."""
    global _prototypes
    if _prototypes is None:
        _prototypes = (embed_texts(RESUME_SENTENCES), embed_texts(OTHER_SENTENCES))
    return _prototypes


def meaning_margin(text):
    """How much closer the start of the text is to the resume sentences than to
    the other documents' sentences (cosine similarity, so about -0.3 to +0.3)."""
    resume, other = _prototype_vectors()
    start = " ".join(text.split()[:MEANING_WORDS])
    vector = embed_texts([start])[0]
    return float((resume @ vector).max() - (other @ vector).max())


def meaning_points(margin):
    points = (margin - MEANING_ZERO) / MEANING_STEP * MEANING_POINTS
    return int(round(float(np.clip(points, *MEANING_LIMITS))))


# ---------------------------------------------------------------------------
# The answer
# ---------------------------------------------------------------------------

def score_text(text):
    """(score, found, details) for a text: points from what it has, plus the
    meaning check, kept between 0 and 100."""
    points, found, details = count_points(text)
    margin = meaning_margin(text)
    details["margin"] = round(margin, 3)
    details["points_before_meaning"] = points
    return int(np.clip(points + meaning_points(margin), 0, 100)), found, details


def check_resume(data):
    """Does this file look like a resume? {"verdict": "yes" | "unsure" | "no",
    "score": 0-100 or None, "found": [what it has], "message": a sentence for
    the person (empty for "yes")}."""
    try:
        kind, text, seen = read_text(data)
    except ResumeProblem as problem:
        return {"verdict": "no", "score": None, "found": [], "message": str(problem)}

    timed_out = False
    if seen is not None:
        lines, timed_out = seen
        # Almost no lines of text in the picture: it is not a resume. (Not when
        # the time ran out: that only means the picture was slow to read.)
        if lines < MIN_PICTURE_LINES and not timed_out:
            return {"verdict": "no", "score": None, "found": [], "message": NO_TEXT_IN_PICTURE if kind == "picture" else NO_TEXT_IN_PDF}

    if len(text.split()) < MIN_WORDS:
        # Too little to judge by (a page with only a title, a picture whose print
        # could not be made out, or a reader that failed): it goes through
        # rather than being refused on a guess.
        return {"verdict": "unsure", "score": None, "found": [], "message": "We couldn't find enough text in this file to check it, so it was sent as it is."}

    score, found, _ = score_text(text)
    if score >= YES_FROM:
        return {"verdict": "yes", "score": score, "found": found, "message": ""}
    if score >= NO_BELOW or timed_out:
        return {"verdict": "unsure", "score": score, "found": found, "message": "We couldn't be sure this is a resume, so it was sent as it is."}
    return {"verdict": "no", "score": score, "found": found, "message": NOT_A_RESUME}
