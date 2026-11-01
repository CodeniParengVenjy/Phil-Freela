# Resume check: plan

Status (2026-11-02): the plan was approved ("ok build"; the user chose "block"
for a file that doesn't look like a resume). Step 1 is BUILT, tested and pushed
(the database change is live as the migration `resume_formats`). Step 2 (the AI
check for PDF and Word) is BUILT, tested and pushed. Step 3 (pictures and scanned
PDFs, a text reader) is BUILT and tested (the user said "okie" to start it); see
"Step 3 test results" below for how the Vercel deploy went. All three steps are
done. To continue in a new Claude session, say: "Read PLAN-resume-check.md and
tell me what is left."

Fix after the user's first live test (2026-11-02, "it still accepts a not
resume"): the user's real files were used as test data, read only (a random
sample of 45 documents and 25 pictures from Downloads, and the user's own
resumes). Every one of the 45 documents was refused (the highest score was 15),
and the user's own resumes were all "yes" (67 to 74). The only leaks were 2
photos that had 4 lines of text but only 2 readable words: they were "not sure",
and "not sure" goes through. So: a picture or scanned PDF with lines but fewer
than 25 readable words is now "no" (a sign, an ID card, a blurry page), and a
Word file with almost no text and no picture inside is "no". The measurements
below were repeated: all 12 + 10 other documents are refused in every
picture run now, and the only resume refused anywhere is a 29-word resume
photographed at low quality (14 readable words; a known limit, the message says
to send a clearer picture or a PDF). The website also says so on screen when a
resume was sent without a clear "yes" ("We couldn't be sure this is a resume..."
or "The resume check couldn't run..."), waits up to 30 seconds (was 20) and
tries once more when a try fails fast, and wakes the AI service when the apply
page opens (a service that has been idle needs several seconds). The leak could
also have been a check that did not run (the AI service idle, slow or broken):
that is now said out loud instead of hidden.

Step 3 test results (2026-11-02): the text reader is PaddleOCR's PP-OCRv3
English model (9 MB, SHA-256 in `ai-service/get_models.py`; its list of letters
is inside the file), run through onnxruntime, with the text finder that was
already in the service marking the lines (`ai-service/resume_ocr.py`). A
picture is read in about a second on the laptop. Rules: a picture or scanned
PDF with fewer than 4 lines of text is "no" (a photo of a person or a view, a
logo, a blank page: "We couldn't find any text in this picture..."); print that
can't be made out is "not sure"; a reading that runs out of its 15 seconds, or a
reader that breaks, is never "no". Measured with `ai-service/test_resume_ocr.py`
on the same made-up documents drawn onto pages, CLEAN and PHOTOGRAPHED (turned,
skewed, shaded, soft, noisy, shrunk, low quality JPEG); nothing was tuned on
pictures. SET A clean: 12 resumes (9 yes, 3 not sure, none refused), 12 other
documents all refused. SET A photographed: 8 yes, 4 not sure, none refused; all
12 others refused. SET B clean: 5 yes, 3 not sure, none refused; all 10 others
refused. SET B photographed: 3 yes, 5 not sure, none refused; 9 of 10 others
refused, and 1 let through as "not sure" (a barangay form that is mostly blank
lines, with too few readable words). `test_resume_check.py` is now 42 of 42
(scanned PDFs of a resume and of an invoice, a blank page, pictures with no
text, a broken picture, a picture of 36 megapixels, the reader running out of
time or breaking). Real browser, the real website code against the real checker:
24 of 24 (the picture is shrunk first, and the AI is given the very same JPEG
that is saved; a phone-like photo and a scanned PDF of a resume sent; a picture
and a scanned PDF of an invoice stopped; a picture with no text stopped with its
own message); the Step 1 browser test is still 33 of 33. The other AI service
tests still pass (skills 136, document previews 30, page blur 19, watermarks 28,
ranking 33). A resume photographed on its side is not handled (the reader reads
level lines only); the website turns phone photos upright first.

Step 2 test results (2026-11-02): `ai-service/test_resume_check.py`, 30 of 30.
Measured on made-up files (`ai-service/resume_samples.py`): SET A, which the
numbers were chosen from: 12 resumes, 9 "yes", 3 "not sure", none refused (the
lowest scored 23); 12 other documents, all refused (the highest scored 16). SET
B, written after the numbers were fixed and never used to choose one: 8 resumes,
5 "yes", 3 "not sure", none refused (the lowest scored 32); 10 other documents,
all refused (the highest scored 10), including a company job description, a
freelancer's service offer and an application letter. The three "not sure"
resumes of set B are not refused because of unusual heading names ("Clinical
Experience", "Voice Over Experience"); that is the thing to improve first if it
is ever needed. Real browser, the real website code against the real checker
running on the laptop: 18 of 18 (a resume as PDF and as Word sent; an invoice
as PDF and Word, and a contract, stopped with the plain message and nothing
uploaded or saved; a zip with a Word file's name stopped; a doubtful document
and a picture sent; a file over 4 MB refused by the page; the AI service off,
broken (500), without the route (404, an old deploy) or answering with the
website's own page: the application is sent anyway; the button says "Checking
your resume..." while it works; an AI that takes more than 20 seconds is given
up on and the application is sent). The Step 1 browser test still passes, 33 of
33. Not tried: the live AI service on Vercel, and a real phone.

Step 1 test results (2026-11-01): `database/test_resume_formats.sql` on the live
database, rolled back: 18 of 18 passed (pdf, docx and jpg accepted; exe, zip,
png, webp, doc, capital PDF, no ending, no dot, double ending, a time that is
not numbers, someone else's folder and another job's id refused; the rule and the
bucket as planned), and afterwards no test row was left. Real browser against a
pretend backend: 33 of 33 passed (a PDF, a Word file, a PNG, a WebP and a 12 MB
phone photo sent, with the saved name, type and bytes checked, the photo shrunk
to 2,000 px and 1.3 MB; nine kinds of wrong file refused with their message and
nothing uploaded; the "My resume" icons; a Word resume downloaded in place, named
resume.docx, or after the applicant for the client; no empty tab). One known gap
on purpose: a zip renamed `.docx` passes Step 1 (a Word file is a zip); Step 2
reads it for real.

## Why

The user (2026-11-01): freelancers should be able to send their resume in any
kind of file (a picture of a resume too, not only a PDF), and asked whether AI
can tell that a file really is a resume, and to build it if it can.

## What exists today (checked 2026-11-01)

- Website (`lib/applications.js`, `checkResumeFile`): PDF only, checked by name,
  type, size (5 MB) and the first bytes (`%PDF-`). The file is saved as
  `<freelancer id>/<job id>-<time>.pdf` in the private `resumes` bucket.
- Live database (read-only look): the rule `job_applications_resume_path` only
  accepts a name ending in `.pdf`; the `resumes` bucket is private, 5 MB, type
  `application/pdf` only; 1 application and 1 stored file so far (a PDF).
- AI service (`ai-service`, FastAPI on Vercel) already has: PDF text (pypdf),
  Word text (python-docx), PDF pages as pictures (pypdfium2), the MiniLM text
  model, a text FINDER for pictures (PP-OCR "DB", used for IDs in
  `photo_checks.py`) and onnxruntime. It has no text READER yet. Vercel takes
  4.5 MB per request (`MAX_DOCUMENT_BYTES` is 4 MB in `main.py`).

## What people will see

1. Apply form: "Your resume (PDF, Word or a picture, up to 5 MB)". From Step 2
   the limit is 4 MB.
2. From Step 2, after "Send Application" the button says "Checking your
   resume..." for a second or a few:
   - looks like a resume: sent, as today;
   - not sure: sent;
   - doesn't look like one: NOT sent (the user chose this on 2026-11-01: block,
     no "Send anyway" button). A plain message: "This doesn't look like a resume.
     A resume lists your experience, education and skills. Please choose your
     resume."
3. If the AI service can't be reached, the application is sent without the
   check. An outage never blocks anybody from applying.
4. Clients: "View resume" opens it. A Word file downloads (the page stays put).

## Which files

PDF, Word (.docx), and pictures (JPG, PNG, WebP). NOT literally any file: a
client opens these files, and programs, zips and scripts are dangerous (the
standing rule is to validate every upload). Old .doc can't be read: the message
says "save it as a PDF or DOCX". The file's first bytes decide the real type,
not its name. A picture is always shrunk to a JPEG of at most 2,000 pixels
(`lib/shrinkImage.js`, usually 300 to 800 KB) and saved as `.jpg`, so the
database only needs three endings: pdf, docx, jpg.

## Build steps (each one: its own OK, build, test, commit and push)

### Step 1: file types (SQL, then website; no AI yet)

Database, file `database/supabase_resume_formats_schema.sql` (no new table;
applied BEFORE the website that uses it, because allowing more is safe for the
old site):

1. Drop and add again the rule `job_applications_resume_path`: the name stays
   `<freelancer id>/<job id>-<digits>.` and ends in `pdf`, `docx` or `jpg`. A
   rule can't be edited, so this has one DROP (the connector asks for a
   confirm). The 1 existing application ends in `.pdf` and still passes.
2. `update storage.buckets` for `resumes`: allowed types become
   `application/pdf`, the Word type
   (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
   and `image/jpeg`. The size limit stays 5 MB for now, so the old site can't
   break on a PDF between 4 and 5 MB while the new one is deploying.
3. The policies need no change (they never look at the ending).

Test `database/test_resume_formats.sql`, in ONE rolled-back call on the live
database: each ending accepted (pdf, docx, jpg) and refused (exe, zip, png,
uppercase PDF, no ending), the folder and job id still enforced, the bucket row
as expected, the database left as it was.

Website:

1. `lib/applications.js`: a table of the allowed types (ending, type for
   Storage, first bytes). `checkResumeFile` reads the first 12 bytes: `%PDF-`,
   `PK\x03\x04` with a `.docx` name (a Word file is a zip), `FF D8 FF` (JPEG),
   the PNG signature, `RIFF....WEBP`. `.doc` gets its own message. `applyToJob`
   shrinks a picture (JPEG, 2,000 px), saves it as `.jpg`, and sends the right
   type. `openResume`: a Word file is downloaded in place with
   `createSignedUrl(path, 60, { download: "resume.docx" })` (no empty tab); PDF
   and pictures open in a tab as now. A small `resumeIcon(path)` for the buttons.
2. `views/JobDetailsView.jsx`: the label, the `accept` list.
3. `components/ApplicationsPanel.jsx`: the icon follows the file type.
4. `lib/welcomeGuide.js`: the tour says "(a PDF)": say "a PDF, Word file or
   picture". `lib/ownPosts.js`: a comment only.

Browser test (pretend backend): each type accepted, the others refused with
their message, a big picture shrunk, the saved name's ending and type, the two
buttons, the Word download; lint, build; then the live site.

### Step 2: the check for PDF and Word (readable text)

New `ai-service/resume_check.py` and the route below; `lib/aiService.js`
(`checkResume`); `JobDetailsView.jsx` ("Checking your resume...", the message,
the 4 MB limit). Test file `ai-service/test_resume_check.py`.

### Step 3: pictures and scanned PDFs (a text reader)

Built: `resume_ocr.py` (the finder and the reader), `get_models.py` (the 9 MB
model), `resume_check.py` (a picture, or a PDF with no words of its own, is read
and judged like text), and the website shrinks a picture BEFORE the check. It
came last because it adds a model and Vercel's size limit has been tight before.
If Vercel refuses the size, pictures go back to "not sure = sent" until space is
made (the old deploy stays live while a new one fails).

## How the AI decides (Steps 2 and 3; no training, only pretrained parts)

1. Get the words:
   - PDF: its text (pypdf). Word: paragraphs and tables (python-docx).
   - Picture, or a PDF with no text (a scan): the PDF's first 2 pages become
     pictures (pypdfium2). The text FINDER already in the service marks the
     lines; a text READER, PaddleOCR PP-OCRv3 English
     (`en_PP-OCRv3_rec_infer.onnx`, 9 MB, from the RapidOCR collection on
     Hugging Face, SHA-256 checked like the other models), reads each line
     through onnxruntime. Its character list is PaddleOCR's `en_dict.txt`.
2. Points from 0 to 100, each one explained in a short "found" list:
   - headings: Experience / Work history, Education, Skills, Summary /
     Objective / Profile, Certifications / Trainings, References, Projects,
     Achievements, and the Philippine "Personal Data" block (birthdate, civil
     status, citizenship);
   - contact details: an email, a phone number (09.. or +63), a LinkedIn,
     GitHub or Behance link;
   - date ranges: "2019 - 2023", "June 2020 - Present";
   - skills: the words that are in the site's own skill list (`skills.py`);
   - meaning: the MiniLM text model (already in the service) compares the text
     with a few sentences that describe a resume and with sentences that
     describe other documents (invoice, letter, contract, certificate, job
     description);
   - length: about 80 to 1,500 words.
   Extra spaces inside a heading ("E XPERIENCE", which some PDFs have) are
   ignored.
3. 55 and over = yes, 20 to 54 = not sure, under 20 = no. The numbers were set
   by measuring 12 resumes of different styles and 12 other documents (set A),
   like the ID check was (see photo_checks.py), and then checked once on 8
   resumes and 10 other documents written afterwards (set B). See "Step 2 test
   results" at the top. The meaning check's example sentences have no field of
   work in them (a first try with "graphic designer" made a job post for a
   graphic designer look like a resume).
4. Time cap: a picture or scan that takes too long to read gives "not sure".
5. The file is read in memory only. It is not saved by the service, not logged,
   and no outside AI company sees it (a resume is personal data, RA 10173).

## AI service route (Step 2)

    POST /resumes/check      multipart: file          Authorization: Bearer <login>
    -> { "verdict": "yes" | "unsure" | "no", "score": 0-100,
         "found": ["Experience", "Education", "Email", ...], "message": "..." }

A file that can't be read at all answers "no" with "We couldn't read that file.
Please save your resume as a PDF or DOCX." `test_resume_check.py` uses sample
files made by a script (text PDFs and pictures printed from HTML with the
project's Chrome, DOCX with python-docx) and prints a measured report: how many
resumes passed, how many other documents were wrongly passed.

## Test files

A sample resume (made up: "Jamie L. Villanueva", a logo designer, made for
Elena Santa Ana's open job "Logo Designer for a Small Business") is in the
user's `Downloads` folder as a one-page PDF and a picture of the same page. It has the headings, contact details, dates and skills the
check looks for, and a PDF text layer that reads cleanly. A Word version and
some non-resume files (an invoice, a letter) are made when they are needed for
the tests of Steps 1 and 2.

## Not included

- Enforcing the check in the database. It runs on the website before sending, so
  someone who skips the website could still send any file of the allowed types
  (the allowed-types rule in the database still holds). Enforcing it needs a
  table of verdicts and a rule on the application: not planned.
- Reading languages other than English and Filipino/Taglish words.
- Telling the client "AI says this is a resume" (no badge).
- Old .doc, .rtf, .txt, .odt, .zip or any other file type.
