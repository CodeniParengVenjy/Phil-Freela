# AI reads the GCash receipt: plan, approved 2026-11-08 ("gooo")

The user approved with "gooo" and did not send a real GCash screenshot, so the
reader was built and tested on made-up receipts (receipt_samples.py), and a
likely fake is BLOCKED (the recommended choice for checks 1-6).

## What the user asked (2026-11-08)

"Using an AI for these, where AI determine the payment in the gcash receipt: Name
initials, Amount sent, reference number, and date... Remove putting reference
number manually, can you? And also determine also a fake receipt."

## What happens today (checked in the code and the live database, 2026-11-08)

1. The record window (`RecordPaymentDialog.jsx`) has three things to fill: the
   amount (typed), the 13-digit reference (typed) and the receipt screenshot.
2. Nothing reads the screenshot. The database only checks that the reference has
   13 digits and was not used before (`record_payment`, `record_chat_payment`).
3. Nobody checks that the receipt is for the right person, the right amount or a
   sensible date, or that it is a GCash receipt at all.
4. Live database: 0 recorded payments (only 1 cancelled chat request), so the
   functions can change shape without touching anyone's records.

## The idea in one line

The client only adds the screenshot. The AI service reads it (initials of the
person paid, amount sent, reference number, date and time), checks it for signs
of a fake, and the database saves what the AI read, not what someone typed.

## What the AI checks (the "fake receipt" part)

Blocked, the client cannot send it (a plain sentence says why):
1. Not a GCash receipt: no GCash words, no 13-digit Ref No. or no amount found.
2. The reference number was already recorded on PhilFreela.
3. The very same screenshot file was already used (see "Changes" below).
4. Sent to someone else: the initials AND the visible digits of the number on the
   receipt both differ from the freelancer's saved GCash.
5. The date is in the future, or before the project (or the chat request) existed.
6. The receipt disagrees with itself: "Amount" and "Total Amount Sent" differ (a
   common mistake when a number is edited).

"Check carefully" (sent, but the freelancer sees an amber note with the reasons):
7. Only one of initials / number digits matches.
8. The picture was saved by an editing app (Photoshop, PicsArt, Canva, ...).
9. The picture is wider than it is tall, unlike a phone screenshot (pasted
   onto something else).
10. The amount differs from the requested amount (chat request).

Can't read: blurry, cut off or too small: "Use a clear, full screenshot."

## Step 1: database (Medium)

1. New table `receipt_checks`: who checked, which project or chat request, the
   saved picture's path, picture fingerprint, what was read (reference, amount,
   date and time, initials as printed), verdict (`ok`, `check`, `blocked`,
   `unreadable`), reasons, when used. Only the AI service writes it; the client
   can read their own rows.
2. `payments` gets: `paid_at` (date on the receipt), `receipt_initials`,
   `ai_verdict`, `ai_reasons`, `receipt_check_id`.
3. `record_payment(target_project, receipt_check)` and
   `record_chat_payment(target_payment, receipt_check)`: no amount or reference
   from the browser; they copy everything from the check (must be the caller's,
   the same project or request, not blocked, not used, under 1 hour old).
4. The old four-value versions are kept as names but only answer "Update the
   page", so nobody can still type a reference (no DROP needed).
5. Test file `database/test_receipt_check.sql`, run rolled back on live first.

Files: `database/supabase_receipt_check_schema.sql`, `database/test_receipt_check.sql`.

## Step 2: the AI service (Hard)

1. New `ai-service/receipt_check.py`: reads the screenshot with the same
   pretrained text reader as the resume check (`resume_ocr.read_picture`,
   PaddleOCR PP-OCRv3), finds the fields, runs checks 1-10.
2. New route `POST /receipts/read` (login required): the screenshot (4 MB max,
   JPG/PNG/WebP) and the project id or chat request id. It checks the caller is
   that project's or request's client, saves a clean JPEG copy in the private
   `receipts` bucket, saves a `receipt_checks` row, and answers:
   `{check_id, verdict, reasons, reference, amount, paid_at, initials}`.
3. Tests: `ai-service/test_receipt_check.py` with made-up sample receipts
   (`receipt_samples.py`) plus edited copies of them, and the user's own real
   GCash screenshot if they give one.

## Step 3: screens (Medium)

1. Record window: the reference and amount boxes are removed. "Add screenshot"
   -> "Reading your receipt..." -> the AI's reading: To J. D. C. / P1,500.00 /
   Ref 4021 358 091742 / Nov 8, 2026 11:23 AM, with a green, amber or red line.
   Red = no Send button, only "Change screenshot".
2. If the AI service can't be reached: "The receipt reader is busy. Your GCash
   payment is safe; record it again in a few minutes." (no typed fallback).
3. Freelancer, on the payment (project and chat card): the date, and "AI: looks
   real" or "AI: check carefully" with the reasons, plus the existing "Check your
   GCash before you confirm".
4. Admin report pop-up with a payment: the AI's verdict and reasons.

Files: `client/src/lib/payments.js`, `RecordPaymentDialog.jsx`,
`PaymentsSection.jsx`, `PaymentCard.jsx`, `payments.css`, `AdminReportsView.jsx`.

## Step 4: words (Easy)

Terms and Privacy (the AI reads the receipt; what is saved), System Functions,
study guide (one panel answer). Check both themes and phone width.

## Order of going live

Database (needs the user's go) -> AI service push (Vercel) -> website push.
The website goes last because it needs the new functions and route.

## Limits (say them in the defense)

- The AI still cannot see GCash. A careful fake (right initials, a fresh unused
  number, a believable date) can pass. The freelancer's "Confirm received" after
  looking at their own GCash stays the real check; the AI catches the easy fakes
  and mistakes and gives the freelancer and the admin reasons.
- GCash can change its receipt design; the reader then says "can't read" until
  the words it looks for are updated.

## Overlap

`PLAN-short-payment.md` (the other session, not approved yet) changes the same
window and functions. Whichever is approved first is built first; the second one
builds on it.

## Decisions needed from the user

1. A likely fake: block it (recommended for checks 1-6) or let it through with a
   red warning to the freelancer?
2. A real GCash "Send money" receipt screenshot to test with (any amount).

## Changes made while building (2026-11-08)

1. Check 3 is "the very same FILE was already used" (SHA-256 of the file),
   not a picture fingerprint: two different GCash receipts look almost the same
   to a fingerprint (same layout, only the numbers differ), so it would have
   blocked real ones. A re-saved copy of a used receipt is still caught by its
   reference number (check 2), and an edited copy that keeps the amount and the
   time is caught as "same amount at the same minute" (a "check carefully").
2. The short-payment plan was approved first and its database went live
   (migration short_payment_tips: tips, what is left to pay). So
   `record_receipt_payment(target_project, receipt_check, pay_tip)` and
   `record_chat_receipt_payment(target_payment, receipt_check, pay_tip)` CALL
   the five-value `record_payment()` / `record_chat_payment()`: the amount read
   from the receipt is the total sent, the client's Tip box splits it, and the
   balance and tip rules stay in one place.
3. Switching off typed references is a separate file,
   `database/supabase_receipt_check_finish.sql`: it REVOKES the browser's right
   to call all four old record functions (no DROP), applied only once the new
   website is live.
4. The reader groups the text it finds into rows by height (`read_boxes()` was
   added to resume_ocr.py), so a label and its value stay together.

## Progress

- Step 1 (database): written and tested rolled back on live, 25/25
  (`database/test_receipt_check.sql`). NOT applied: the first
  apply_migration was refused by Claude Code's auto-mode check, so it needs
  the user's go (migration name `receipt_check`).
- Step 2 (AI service): `receipt_check.py`, `POST /receipts/read`,
  `test_receipt_check.py` 66/66 (patterns, 24 made-up screenshots read by
  the real reader, the route with a pretend database).
- Step 2 is live on Vercel (570413c; /receipts/read is in openapi.json).
- Step 3 (screens): built on the short-payment screens (aa58b9a) and tested
  in a browser against a pretend backend, 40/40 (screenshot -> reading ->
  tip -> record; blocked, unreadable, check; reader offline; an older slow
  answer never replaces a newer one; tip only; the freelancer's note; the chat
  card; phone width in dark and light). Files: lib/aiService.js
  (readReceipt), lib/payments.js (readReceiptScreenshot, recordPayment and
  recordChatPayment take a check id, new payment columns, the old upload and
  reference helpers removed), RecordPaymentDialog.jsx (rewritten),
  new ReceiptCheckNote.jsx, PaymentsSection.jsx, PaymentCard.jsx,
  AdminReportsView.jsx, payments.css. NOT committed yet on purpose: it needs
  the Step 1 database first (it reads the new columns), and the other session's
  push would carry a commit live.
- Step 4 (words): after the short-payment session commits its words.

## Order once the user gives the go

1. apply_migration `receipt_check` (supabase_receipt_check_schema.sql), check
   the table, columns and functions exist.
2. Commit and push Step 3; check the live bundle has it.
3. apply `supabase_receipt_check_finish.sql` (the browser can no longer call
   the old typed-reference functions); check with a rolled-back probe.

## Current step

Waiting for the user's go to apply Step 1; Step 3 is ready in the working tree.
