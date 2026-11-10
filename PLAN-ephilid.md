# ePhilID as a government ID: plan

Status (2026-11-10): approved by the user ("ok" after the revised plan). Steps 1
to 3 (database, AI service, website) are built, tested, pushed and live; step 4
is the live check with a real ePhilID photo, which only the user can do. See the
progress notes at the bottom.

Why: the user asked "can I add another government ID to scan? ePhilID". The
ePhilID is the printed (or downloadable) version of the PhilSys national ID and
is as valid as the plastic card. Today an ePhilID owner can't verify: "PhilSys
National ID" asks for a card back and a QR code in the card's JSON format.

## What a printed ePhilID looks like (from a sample photo the user sent)

A sheet with two card-size panels between dashed cut lines.

- FRONT: header (Republika ng Pilipinas, Pambansang Pagkakakilanlan), the photo,
  the card number, last / given / middle name, suffix, and a very large QR code.
- BACK: sex, birthday, place of birth, marital status, blood type, address, the
  ePhilID generation date and "Authenticate this ePhilID using PhilSys Check at
  verify.philsys.gov.ph".

So it needs both photos (my first guess, front only, was wrong), and the QR code
is on the front.

Its QR text is "PH1:" and then Base45 text holding a signed CBOR packet (a COSE
message: protected, unprotected, payload, Ed25519 signature). The payload's claim
169 holds the details (`sb`: fn, mn, ln, sf, DOB, PCN, POB, ...) and a tiny WebP
photo. Only the name is read and kept. The signature can't be checked without
the PSA's key, so the admin still uses PhilSys Check.

## What changes

1. Database (`database/supabase_ephilid.sql`, test: `database/test_ephilid.sql`):
   the `id_type` rule also accepts 'ephilid'. The "back required" rule stays as it
   is (only passports and School IDs may have no back).
2. AI service:
   - `main.py`: accepts "ephilid" and runs the QR name check for it like for
     "philsys".
   - `id_qr.py`: reads the ePhilID's QR (Base45, CBOR) next to the card's JSON.
   - `photo_checks.py`: `straighten_id` turns sideways ID photos upright for every
     ID type (the sample photos were sideways, and every check failed on them: no
     face, no text). The front is turned until the face finder finds a face; the
     back by counting lines of text.
   - Tests: `test_ephilid.py` (made-up data only).
3. Website (after the AI service is live, so the choice never shows before the
   server accepts it):
   - `lib/verification.js`: the "ePhilID" choice (front and back), after PhilSys.
   - `VerificationWizard.jsx`: front and back wording for the ePhilID (the front
     has the big QR code; the back has the address and birthday).
   - `lib/welcomeGuide.js`: the opening tour names it.
   - `AiSummaryCard.jsx`: the admin gets the PhilSys Check link for it, pointing
     at the QR code in the FRONT photo.

## Choices I made

1. One "ePhilID" label for the printed copy and a screenshot of the digital copy
   (the checks only look at the picture). A short label keeps the admin list narrow.
2. Turning sideways photos is not ePhilID-only: it fixes the same refusal for the
   card, UMID and the rest ("We couldn't find the photo on your ID").
3. The back can't be told from upside-down (no face to go by); a sideways back is
   turned the same way as the front was.
4. Blur and size limits are unchanged. They were tuned on plastic cards, and the
   sample photos were shrunk gallery screenshots, so they can't show whether a real
   printed ePhilID photo passes. If a good ePhilID photo is refused as blurry, the
   limit for it gets loosened after trying one real photo.

## Build steps

1. Database file, applied to the live project; `test_ephilid.sql` passed 6/6 on live
   (rolled back, nothing left behind).
2. AI service: type, QR reader, straightening, tests (53/53), pushed first.
3. Website: choice, wording, tour, admin hint; checked with a pretend network.
4. Live check, then try a real ePhilID photo.

## Progress

- 2026-11-10: steps 1 and 2 built. On the user's sample photos (still sideways) the
  new code turns both photos upright, the back passes, and the QR is read (name
  found); the front check still refused the sample as too small or blurry, but the
  sample is a 720 px gallery screenshot, so that says nothing about a real photo.
- 2026-11-10: AI service pushed first (98b72e3) and Vercel reported "Deployment has
  completed". Then step 3, the website: the "ePhilID" choice, its own front and back
  wording, the tour text and the admin's PhilSys Check hint. Checked in a browser
  against a pretend backend (31 of 31): the list order, 5 steps with a back photo,
  passport still 4 steps, the card's and passport's words unchanged, the admin hint
  points at the front photo for an ePhilID and the back photo for the card.
- Still open: try a real ePhilID photo on the live site. If a good photo is refused
  as "blurry" or "too far away", loosen that limit for the ePhilID only.
