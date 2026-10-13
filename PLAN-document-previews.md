# Document previews: plan and progress

Status (2026-10-13): approved ("ok") together with the offer page (see the end
of PLAN-booking.md). To continue in a new Claude session, say:
"Read PLAN-document-previews.md and continue from the current step."

## Why

A document in a service or a portfolio project (PDF, DOCX or TXT) was saved as
one public .txt file with ALL of its text, and the document reader had a
"Text" view that showed it all, ready to select and copy. The user was worried
about plagiarism: "remove that text mode, prevent copy-paste, and what if the
text is blurred and only part of it shows?"

Blur by itself is only styling: the full text would still be in the page and in
a public file link. So the hidden part is kept off the page, too.

## What visitors will see

1. No "Text" tab. A PDF still shows its first pages as pictures (name across
   them), now without the "Switch to Text" sentence.
2. A DOCX or TXT shows a **preview**: the first part of the text, then blurred
   filler, and a note: "Preview only. The rest is hidden to protect the
   writer's work. Message the writer to ask for the full file."
3. The text can't be selected, copied, cut, dragged, right-clicked or printed,
   and the writer's @name is drawn faintly across it (like on photos), because
   a screenshot can't be blocked.
4. The same preview box on the card's slide, in the reader and for old
   portfolio writing. The writer sees the same preview as everyone.

## How it works (defaults I chose)

1. Preview = the first 30% of the text (counting only visible characters), at
   most 1,500 characters, cut at a word. A very short text still shows a
   little: at least 200 characters, or half of it if it is shorter than 400.
2. The public file `<user id>/<slide id>.txt` in `slide-media` holds ONLY the
   preview (with the invisible watermark code in it). The whole text goes in a
   new private table, `slide_texts`, that only its writer and the admins can
   read. Admin > Flagged Content reads the whole text from there.
3. The blurred filler is random letters made by the page (it is not the hidden
   text: the page never receives that). It is sized from `media_slides.hidden_chars`
   (how many characters were left out), capped so the box stays small.
4. Photos, videos, the copy check and the Original badge don't change.

## Database (file `database/supabase_document_privacy_schema.sql`)

Nothing in it uses DROP or DELETE. Must be applied BEFORE the website and the
AI service that use it go live (the website's slide query asks for
`hidden_chars`).

1. `media_slides.hidden_chars` (whole number, 0 or more, default 0).
2. New table `slide_texts (slide_id, body)`: removed with its slide; row level
   security on; signed-in people can only SELECT, and only their own slides'
   rows (admins: all); nobody can insert, update or delete from the browser
   (the AI service does, with its own key).

Test: `database/test_document_privacy.sql` (rolled back).

## AI service (`ai-service/main.py`, new `document_preview.py`)

No new endpoint. `POST /slides` for a document: builds the preview, saves it as
the public .txt, saves the whole text in `slide_texts`, and saves
`hidden_chars` (only for documents, so photos and videos keep working even if
the SQL is applied late). If saving the whole text fails the slide is undone.
A one-time script splits the documents that already exist (1 PDF on 2026-10-13);
it changes live storage, so the user is asked first.

## Website

`lib/slides.js` (select `hidden_chars`, upload hint), new
`components/ProtectedText.jsx`, `components/MediaCarousel.jsx` (no Text tab),
`components/slides.css`, `components/PortfolioViewer.jsx` (old writing),
`views/AdminFlaggedView` (whole text from `slide_texts`).

## Not included

- Blurring parts of a PDF's page pictures.
- A way for the writer to share the full text with one client (they use chat).
- Removing the old pasted-writing code (`portfolio_items.kind = 'document'`):
  none exist and the site can't create them any more.

## Current step

Step B1 (database): built, applied to the live project (migration
"document_privacy", 2026-10-13) and pushed. Its SQL has been run, so don't run
it again. Tested before applying: the schema and `database/test_document_privacy.sql`
(13 checks) were sent together in one call that rolled back, all passed, and
nothing was left behind (checked afterwards: no table, no column, no test rows,
the user number counter still at 17 so the next sign-up is still PF-0018). The
test borrows real accounts only to act as them, so it burns no user numbers.
Checked after applying: `media_slides.hidden_chars` is there, `slide_texts` has
row level security with one read rule, signed-in people can only SELECT, anon
gets "permission denied", and the website's slide query with `hidden_chars`
resolves against the live API.

Step B2 (AI service): built and pushed (2026-10-13). New `ai-service/document_preview.py`
(the rule) and `ai-service/test_document_preview.py` (30 checks, run with
`python test_document_preview.py`); `main.py` `POST /slides` now saves only the
preview as the public file, the whole text in `slide_texts`, `hidden_chars` on
the slide (documents only: a photo or video doesn't send the column, so those
keep working even if the SQL were missing), and undoes the slide if the whole
text can't be saved. The reply also has `hidden_chars`. Tested with the real
text model, real PDF code and a fake database in memory (22 checks): long TXT,
a copy of it is still held by the text check (its numbers come from the whole
text), a short pasted text, a PDF, a photo, and a failed save is undone with no
leftovers. Not tested: a real upload on the live service (it needs the Vercel
deploy of this push first).

Step B3 (website): built and pushed (2026-10-13). New `components/ProtectedText.jsx`
(preview, blurred filler of random letters, no select / copy / cut / drag /
right-click / print, the writer's @name across it) and `lib/documentPreview.js`
(the same rule in JavaScript, for old pasted writing only; checked against the
Python rule on 50 texts: identical). `MediaCarousel.jsx`: no Text/Pages tabs;
a PDF's slide no longer fetches its text; other documents show the preview in
the slide and the reader. `lib/slides.js` asks for `hidden_chars`;
`PortfolioViewer.jsx` (old writing) and `AdminFlaggedView.jsx` (whole text from
`slide_texts`, falling back to the public file for older documents) changed;
`slides.css`/`portfolio.css` lost the two full-text boxes; Post a Service and
the portfolio form tell the freelancer visitors only see a preview. Tested in
the browser against a fake backend, desktop and phone, dark and light (65
checks; plus the offer page test again, 84 checks): the hidden sentence is not
anywhere on the page, selecting (triple-click, select-all) gets none of the
text, copy / cut / right-click / drag are stopped, the reader is left out of
printing, a visitor never asks for `slide_texts`, a PDF's text file is not
fetched, and the admin sees the whole text. Not tested: a real upload and a
real page on the live site (needs the Vercel deploy of step B2 and the user).

Checked on the live site and AI service after the push (2026-10-13): the
website's bundle has the offer page and the preview note, and the AI service's
API description mentions document previews, so both deploys picked it up.

Step B4 (the one existing PDF): done on 2026-10-13, after the user said yes.
The script `ai-service/split_old_documents.py` was tested first (11 checks
against a fake database: a trial changes nothing; applying saves the whole
text in `slide_texts` and reads it back BEFORE the public file is replaced;
running it twice is safe; a failure half way leaves the public file untouched
and the next run finishes it). Then on the live project: the trial, then
`--apply`, then a second trial that said "already done". Checked afterwards:
the one document ("I will create your activity", a PDF) has its whole text
(5,129 characters with the footer and the invisible code) in `slide_texts`,
`hidden_chars` is 1,641, its public file serves only the preview (688 visible
characters, the code still in it, no footer), and its two page pictures are
untouched. Seen on the way: right after the overwrite the public link still
served the OLD whole text for a few minutes (a stale copy at the storage's
cache; a request with `?fresh=...` showed the new file at once, and the plain
link updated by itself). So after replacing a public file, check it with a
cache-busting parameter.
To run it again some day (from the ai-service folder, with its own Python):
`python split_old_documents.py` is the trial, `python split_old_documents.py --apply` does it.

All steps of this plan are built, pushed and live. Not included (see above):
blurring parts of a PDF's page pictures, and a way for a writer to share the
whole text with one client. Still to do by the user: try an upload of a DOCX
or TXT in Post a Service on the live site and open it (the upload route has
only been tested with a fake database, and Admin > Flagged Content has never
seen a real row with the new code).
