# GCash payments: plan and progress

Saved 2026-10-25 after the user said "ok". Step 1 (database) is built and live;
Steps 2 to 7 are not started. To continue in a
new Claude session, say: "Read PLAN-gcash-payments.md and continue from the
current step."

Each step gets its own detailed plan, approved by the user, before any code (see
the steps below: Step 1 has its detail already; the others get theirs when they
are next).

## Why

On 2026-10-17 the user asked for "a simple payment system: not too complicated,
not too broad, just providing a GCash number". The old rule ("no payments")
relaxed to exactly that: the site never touches money. The freelancer gives a
GCash number, the client pays in the GCash app, and PhilFreela only records it so
both people can see what was sent and what was received (see the no-payments
rule in memory, and the wording list at the end of this file).

Pictures of the plan (private pages, opened from the user's Claude account):

- Flow, three phases, what happens next: https://claude.ai/artifact/9WEJ7uUb4CE79Mcxydn43d
- The five new screens: https://claude.ai/artifact/UE5Mg19Hu96ChgVGb5Rjjz
- The whole transaction, 11 screens: https://claude.ai/artifact/5az6wXpcgYuh31xwu5ML7o
- Paying from a chat: https://claude.ai/artifact/4d3VwXGwxAVrHbFCguYNZV

## Two ways to pay

1. **Through a project** (Booking or Hire already makes the project). The
   Payments section on the project page shows the freelancer's GCash details to
   the client of that project.
2. **From a chat** (a deal that started in a private message, with no booking).
   The freelancer sends a payment request card in the chat. Only that card shows
   the details, and only to the one person in the chat.

Both write to one `payments` table. A payment belongs to a project or to a
conversation, never both. Only projects count toward ratings and profile
history; a chat payment does not.

## How it works: through a project

1. Once, a freelancer saves their GCash number, the name on the account and,
   optionally, their GCash QR picture (Settings, "GCash Payment").
2. The client opens the project page. The new Payments section shows the number,
   the name and the QR, with a Copy number button and "I've paid".
3. The client pays in their own GCash app. The site is not part of that step.
4. The client taps "I've paid": amount, the 13-digit GCash reference number and
   the receipt screenshot (required). The payment is saved as Payment sent and
   the freelancer is notified.
5. The freelancer checks their own GCash, then taps Confirm received or Not
   received. The client is notified.
6. The record stays on the project: amount, reference, date, status, receipt.

What follows: Confirmed means the work goes on (submit, balance paid the same
way, Mark as Done, blind ratings, the project counts in both profiles). Not
received means they message each other, the client can record a new payment, and
either can Report (the admin then sees the record and the receipt).

## How it works: from a chat

1. A verified freelancer taps "Request payment" in the chat header: amount and a
   short note.
2. The client gets a payment card in the chat: amount, note, name, number, QR,
   "Only pay people you trust. PhilFreela can't check or refund this payment."
3. The client pays in GCash, then taps "I've paid" on the card (the same record
   window, amount filled in).
4. The freelancer confirms or says Not received on the card.
5. Card states: Requested, Payment sent, Confirmed, Not received, Cancelled.

## Defaults picked (the user can change these)

- Only freelancers have GCash details. A client never needs any.
- The number is saved as 09XXXXXXXXX (11 digits). The name on the account is 2 to
  60 letters, spaces, dots, hyphens and apostrophes.
- The reference number is exactly 13 digits and can be recorded only once on the
  whole site, so one receipt can't be reused. (Built: it becomes free again once
  the freelancer answers that payment "Not received".)
- The receipt screenshot is required: JPG, PNG or WEBP, up to 5 MB, private. It is
  the client's proof on record, not a check: the site cannot see GCash, so the
  freelancer's Confirm (made from their own GCash) is the check.
- The QR is optional: JPG, PNG or WEBP, up to 2 MB, private. The site stores and
  shows the picture and never reads it.
- Payments can be recorded any time after the project starts, as many as needed
  (a down payment and the balance, or monthly for an Ongoing Job). Mark as Done
  does not wait for payment (no escrow, nothing the site can enforce).
- Amount: more than 0 and at most 1,000,000 pesos. A project hired from a job
  post shows that post's budget as a hint ("Budget: 5,000 per project"); it is
  not enforced and can be left out of the build if it gets in the way.
- A record can't be edited or deleted from the browser. A Not received stays as
  history; the client records a new payment if they really paid.
- Chat way: only a verified freelancer who is not blocked from posting can
  request (the same rule as Book). One open request per chat. The freelancer can
  cancel it until it is paid. Amount and note can't be edited after sending.
- Receipts are visible only to the two people on the payment. An admin can open
  one only when it is attached to a report (Step 4).
- Payments are included in "Download your data" and go away with the account.
- A payment from a chat adds nothing to ratings, on-time rate or profile history.

## Not included

- Any payment gateway or API (PayMongo, Xendit, GCash for Business), escrow,
  fees, wallets, refunds, invoices or payouts.
- Reading the receipt automatically (OCR), reading or making QR codes, checking
  that the GCash money really moved.
- Locking the final file until payment is confirmed (an idea for later: it would
  need previews for project files, like offers have).
- A freelancer sending a booking-style offer from a chat ("Send an offer").
- Money going from a freelancer to a client.
- Showing amounts on a profile or in search.

## Already there that this uses

- `projects` (client_id, freelancer_id, status started / submitted / done,
  job_post_id) and the project page `ProjectDetailsView.jsx`.
- Private buckets and signed links work like `deliverables` and `chat-files`.
- `user_notifications` (a rule listing every kind: check the live one first).
- `is_verified()` and `is_posting_blocked()` from the admin schema.
- Reports (`target_type` user / service / job_post) and their admin page; chat
  messages already ride along with a user report (PLAN-chat-report-messages.md).
- Admin Overview has a "Payments: Not set up yet" card
  (`AdminOverviewView.jsx`), waiting for numbers.
- Job posts have a budget and a basis (per project, per day, per month), see
  PLAN-posting-job.md.

## Steps

### Step 1: Database for payments on projects (Medium) (DONE 2026-10-25)

New file `database/supabase_payments_schema.sql`. Nothing in it uses DROP or
DELETE except replacing the notification rule (the same replace the other
schemas do: check the live rule first and keep every kind).

1. Table `gcash_accounts`: `freelancer_id` (primary key, removed with the
   account), `gcash_number` (09 plus 9 digits), `account_name`, `qr_path` (empty
   allowed), `updated_at`. Row level security: only the owner can select, insert,
   update or delete their row. Nobody else can read it.
2. Table `payments`: `id`, `project_id` (removed with the project),
   `client_id`, `freelancer_id` (copied from the project), `amount`
   (numeric(10,2), over 0 and at most 1,000,000), `reference_no` (13 digits,
   unique on the whole site), `receipt_path` (required), `status` (`sent` /
   `confirmed` / `not_received`), `created_at`, `answered_at`. Row level
   security: only the client and freelancer on the payment can select. No insert,
   update or delete from the browser (like bookings).
3. Buckets, both private: `gcash-qr` (2 MB, JPG/PNG/WEBP, a freelancer uploads
   only into their own folder; the client of a project with that freelancer can
   read it) and `receipts` (5 MB, JPG/PNG/WEBP, a client uploads only into their
   own folder; the two people on a payment that uses the file can read it).
4. Notification kinds: `payment_sent`, `payment_confirmed`,
   `payment_not_received` (keeping every kind already live).
5. Functions, all `security definer`, callable only by signed-in users, plain
   messages like bookings:
   - `get_pay_details(project)`: only that project's client gets the freelancer's
     name, number and QR path (nothing if they have none saved).
   - `record_payment(project, amount, reference, receipt_path)`: only that
     project's client; checks the amount, the 13 digits, a receipt path inside
     their own folder, and that the reference is new ("This reference number was
     already recorded"); saves it as `sent` and notifies the freelancer.
   - `confirm_payment(payment)`: only the freelancer on it, only while `sent`;
     row locked first so two clicks do one thing; notifies the client.
   - `mark_payment_not_received(payment)`: same rules; notifies the client.
6. Test file `database/test_payments.sql`, rolled back: the number and reference
   rules, who can read what, the unique reference, the status moves, the two
   people only, a stranger and a signed-out visitor refused.

#### Step 1 result (2026-10-25)

Applied live as the migration `payments` (the one `alter table ... drop constraint`
for the notification rule went through the connector with no confirm). Files:
`database/supabase_payments_schema.sql` and `database/test_payments.sql`.

- Tried first with the schema and the test in one rolled-back call: 63 checks,
  0 failed.
- Checked live afterwards: both tables have row level security on, both buckets
  are private with the right limits, all 12 policies exist, the four functions
  can be run by signed-in users and not by a signed-out visitor, the
  notification rule has 21 kinds (the 18 that were live plus the three new
  ones), nothing was left behind (0 payments, 0 GCash rows, 0 files, 0 payment
  notifications), the user number counter did not move (38, the same as the
  highest user number) and the offline-email trigger is still on.
- Not run: "a client with no project with this freelancer cannot open the QR".
  The live data has no such client, so the test skipped it.
- One change from the plan above: a reference number is free again once its
  payment is answered "Not received" (a partial unique index). The client can
  then record the same payment properly if the freelancer first said not
  received because GCash was slow. A reference of a sent or confirmed payment
  stays taken.
- Nothing visible changes on the site yet. The functions are `get_pay_details`,
  `record_payment`, `confirm_payment` and `mark_payment_not_received`.

### Step 2: Settings, "GCash Payment" (Easy) (DONE 2026-10-25)

Website only. Nothing new in the database (Step 1 made the table and the bucket).

1. `client/src/lib/payments.js` (new). Shared by every later step:
   - `normalizeGcashNumber` (turns "0917 123 4567", "+63 917 123 4567" and
     "9171234567" into 09171234567), `isValidGcashNumber`, `isValidAccountName`
     (the same rules as the database: 2 to 60 letters with accents, spaces, dots,
     hyphens and apostrophes, no double spaces), `formatGcashNumber` (0917 123
     4567), `formatReference` (4021 358 091742), `formatPeso` (₱1,500.00).
   - `getMyGcash()`, `saveMyGcash({ number, name, qrPath })` (an upsert on the
     freelancer's own row), `removeMyGcash()`.
   - QR picture: `checkQrFile(file)` (JPG, PNG or WEBP, 2 MB at most, and the
     first bytes must match the type, like deliverables do), `uploadQr(userId,
     file)` (into `gcash-qr/<id>/qr-<time>.<ext>`), `removeQrFile(path)`,
     `getQrLink(path)` (a link that works for an hour).
2. `client/src/pages/dashboard/components/GcashSettingsForm.jsx` (new): the number,
   the name on the account, the optional QR (picture shown, Upload QR, Remove),
   Save Changes, and a line saying who can see the details. Plain messages for
   every refusal. The form says "Loading..." until the saved row has loaded, so
   an empty box can't be saved over the real one.
3. `views/SettingsView.jsx`: the menu gets "GCash Payment" for freelancers only,
   and the panel shows the form (small edit; the other tabs are untouched).
4. `client/src/pages/dashboard/payments.css` (new, imported by the payment
   components): the few styles Bootstrap doesn't have (the QR tile). The two big
   shared CSS files are left alone because another session is editing them.

Test: a Node check of the number, name and reference helpers, then a browser
test with a fake backend (save, refusals, QR pick and remove, loading, a
client's Settings has no GCash tab, phone width), lint and build.

#### Step 2 result (2026-10-25)

Built as planned: `lib/payments.js`, `components/GcashSettingsForm.jsx`,
`payments.css` and a small edit of `SettingsView.jsx` (the menu item and the
panel). The receipt helpers (`checkReceiptFile`, `uploadReceipt`, `getReceiptLink`)
are already in `lib/payments.js` for Step 3. Tested in a real browser against a
pretend Supabase that imitates the database's rules (32 checks, 0 failed): empty
state, a wrong number, a short number, a name with a digit or that looks like a
link (all refused before anything is sent), a good save with "+63 917 123 4567"
sent as 09171234567 and the name tidied, a GIF and a 3 MB picture refused, the QR
previewed and uploaded only on Save into the person's own folder, replacing and
removing it removes the old file, a save that fails removes the new upload, an
upload that fails saves nothing, a reload shows what is saved, Remove my GCash
details (asks first, then removes the row and the QR file), a load that fails
shows one sentence and no form, a client has no tab, phone width with no
sideways scrolling, light mode readable; lint (only the two old warnings in
`useDashboardShell.js`) and build clean. Not tried against the real database:
the real storage rules for `gcash-qr` were only tested in SQL (Step 1).

### Step 3: Payments section on the project page (Medium) (DONE 2026-10-25)

1. Database, a small Part 2 at the end of `supabase_payments_schema.sql`:
   `alter publication supabase_realtime add table public.payments`, so the other
   person's answer shows without a reload. Nothing else changes.
2. `lib/payments.js` adds: `getPayDetails(projectId)`, `listProjectPayments`,
   `uploadReceipt(userId, file)` (JPG, PNG or WEBP, 5 MB at most, first bytes
   checked, into `receipts/<id>/<time>.<ext>`), `recordPayment({ projectId, amount,
   reference, receiptFile })` (uploads, then calls `record_payment`; if that is
   refused the upload is removed again), `confirmPayment`, `markNotReceived`,
   `getReceiptLink`, and `paymentStatuses` (label and badge color per status).
3. `components/RecordPaymentDialog.jsx` (new, used again in Step 6): amount,
   reference number (spaces allowed), the receipt screenshot with an "Add
   screenshot" button and its thumbnail. Until a screenshot is attached it says
   "Attach your receipt screenshot to continue" and Send record stays off.
4. `components/PaymentsSection.jsx` (new):
   - client: the Pay via GCash box (name, number with Copy number, QR with the
     hint to check the name GCash shows), "I've paid", and the list of payments;
     when the freelancer has no details it says so and points to Message.
   - freelancer: the list of payments, each with the amount, reference, time,
     View receipt and, while "Payment sent", Confirm received / Not received.
   - a small budget hint when the project came from a job post, e.g. "Job budget:
     ₱5,000 per project" (not enforced).
   - live updates when the other person answers (realtime on `payments`).
5. `views/ProjectDetailsView.jsx`: renders the section under the work box.
6. `lib/notifications.js`: icons and button labels for `payment_sent`,
   `payment_confirmed` and `payment_not_received`.

Test: browser test with a fake backend for both people (record with a receipt, a
reused reference refused, confirm, not received, record again, loading and
errors, the freelancer with no details, phone width), lint and build.

#### Step 3 result (2026-10-25)

Built as planned. Database Part 2 (live updates: `payments` added to the
realtime publication) is at the end of `supabase_payments_schema.sql` and was
applied live as the migration `payments_realtime` (checked: `payments` is in the
`supabase_realtime` publication). Website: `lib/payments.js` (pay details, list,
record, confirm, not received, open receipt, live watch),
`components/RecordPaymentDialog.jsx`, `components/PaymentsSection.jsx`, a call to
it at the bottom of `ProjectDetailsView.jsx`, and the icons and "View payment"
button for the three notification kinds in `lib/notifications.js`. Differences
from the plan text: the freelancer's answer asks a second question first ("Is
₱750.00 in your GCash with this reference? You can't change your answer
afterwards."), because an answer can't be undone; a freelancer with no GCash
details saved is told so, with a link to Settings.

Tested in a real browser against a pretend Supabase that imitates the database's
rules (51 checks, 0 failed): the client sees the name, the number and the QR
through a signed link, Copy number, the job budget hint; the record window (Send
record off until a screenshot is attached, a GIF and a 6 MB picture refused,
amount 0 / over 1,000,000 / three decimals / a short reference refused before
anything is uploaded); a good record sends 1500, the reference without spaces and
a receipt in the client's own folder; a reused reference shows the database's
sentence and the uploaded receipt is removed again; Cancel and Escape; View
receipt opens a signed link in a new tab; after "Not received" the same reference
is recorded again; a freelancer with no details saved; a list that fails to
load; the freelancer's Confirm received / Not received with the second question,
the toast, the refresh and a refusal from the database; phone width and light
mode with no sideways scrolling; the Notifications page lists the three kinds
with their icons and "View payment". Lint (only the two old warnings in
`useDashboardShell.js`) and build clean. Not tested: the live update itself (the
test holds the realtime socket silent, so only a reload shows the other person's
answer there; the subscription is the same one the chat uses).

### Step 4: Report with a payment (Medium)

Database, new file `database/supabase_report_payments_schema.sql`, no DROP or
DELETE:
1. `reports.payment_id` (a payment, set to empty if the payment goes away).
2. A trigger on insert: a report that carries a payment must be about a person,
   the reporter must be the client or the freelancer on that payment, and the
   person reported must be the other one ("That payment isn't between you two").
3. Admins can read a payment (and open its receipt in `receipts`) only while a
   report points at it: one policy on `payments`, one on `storage.objects`.
4. Test file `database/test_report_payments.sql`, rolled back.

Website:
1. `lib/reports.js` `sendReport` takes `paymentId` and sends `payment_id`.
2. `components/ReportDialog.jsx`: when the target has a `payment`, a ticked box
   "Send this payment with the report (amount, reference and receipt). Only
   admins will see it." Nothing changes for any other report.
3. `PaymentsSection.jsx`: a Report link on a Not received payment opens the
   dialog about the other person with that payment attached;
   `ProjectDetailsView.jsx` holds the dialog.
4. `admin/views/AdminReportsView.jsx`: a report with a payment shows a box with
   the amount, reference, status, dates and a View receipt link.

### Step 5: Database for payments from a chat (Medium)

New file `database/supabase_chat_payments_schema.sql`. Applied in two named
migrations (the part with the constraint swaps first). The live messages table
has: id, conversation_id, sender_id, body, created_at, edited_at, attachment_url,
attachment_type, delivered_at, call_id, attachment_name, attachment_size,
unsent_at, with a rule that a message needs a body or a file, triggers that
update the inbox preview from `body`, a word filter on `body`, and an edit guard.
The browser inserts messages itself, so the payment message is protected.

1. `payments` changes: `project_id` may be empty; new `conversation_id` (removed
   with the chat); exactly one of the two must be set; new `note` (up to 100
   characters, through the word filter); statuses add `requested` and
   `cancelled`; `reference_no` and `receipt_path` may be empty only while a
   payment is `requested` or `cancelled`; `answered_at` stays empty while
   `requested` or `sent`. One open request per chat (a unique index on the
   conversation while `requested` or `sent`).
2. `messages` changes: new `payment_id`; `attachment_type` also allows
   `payment`; a payment message must have its `payment_id`; the browser can't
   insert, change or remove a payment message (the insert, update and remove
   policies are narrowed with `alter policy`, and the edit guard refuses it).
   The message text is "Payment request: ₱400.00", so the inbox preview and the
   offline e-mail already work without changing those triggers.
3. New notification kind `payment_requested` (22 kinds, keeping every kind).
4. Functions (all `security definer`, signed-in users only):
   - `request_payment(conversation, amount, note)`: the caller is in the chat,
     is verified, is not blocked from posting or messaging, has saved GCash
     details, there is no open request in that chat, the amount is valid; makes
     the payment as `requested`, writes the chat message, tells the client.
   - `cancel_payment_request(payment)`: the freelancer, only while `requested`.
   - `get_request_pay_details(payment)`: only the payer, only while `requested`.
   - `record_chat_payment(payment, amount, reference, receipt)`: only the payer,
     only while `requested`; the amount starts as the requested one but can be
     changed; same checks as `record_payment`; sets `sent`; tells the freelancer.
   - `confirm_payment` and `mark_payment_not_received` are replaced so they also
     work for a chat payment (the notification links to the chat, not a project).
5. The QR policy is widened (`alter policy`) so the payer of a `requested` chat
   payment can open that freelancer's QR.
6. Test file `database/test_chat_payments.sql`, rolled back, borrowing an
   existing chat: every refusal, one open request, the message appears and can't
   be edited, unsent or removed by the browser, answers, notifications.

### Step 6: The chat card and the request window (Medium to Hard)

1. `lib/payments.js` adds `requestPayment`, `cancelPaymentRequest`,
   `getRequestPayDetails`, `recordChatPayment`, `listPaymentsByIds`.
2. `components/PaymentCard.jsx` (new): the five states from the drawings
   (Requested, Payment sent, Confirmed, Not received, Cancelled), what each
   person sees and the buttons (I've paid, Cancel request, Confirm received, Not
   received, Report). It reloads when a payment changes (realtime on `payments`
   for that chat).
3. `components/RequestPaymentDialog.jsx` (new): amount, note, a line saying who
   will see the details; says so and links to Settings when the freelancer has
   no GCash details.
4. `RecordPaymentDialog.jsx` gets a variant for a request (amount filled in).
5. `views/ChatView.jsx`: asks for `payment_id`; draws the card instead of a
   bubble for a payment message (no right-click menu on it); a "₱ Request
   payment" button in the header for a verified freelancer who isn't messaging
   blocked; the Report popup from the card attaches the payment.
6. `lib/notifications.js`: `payment_requested`.

Test: browser test with a fake backend (request, card for both people, pay and
record, confirm, not received, cancel, one open request, no GCash details,
blocked messaging, phone width), lint and build.

### Step 7: Admin Overview, data and wording (Easy)

1. Database, `database/supabase_admin_payments_schema.sql`:
   `admin_transactions()` also returns payments by status (requested, sent,
   confirmed, not_received, cancelled), archived people left out, counts only,
   no amounts. Test file `database/test_admin_payments.sql`.
2. `admin/views/AdminOverviewView.jsx`: the "Payments: Not set up yet" card
   becomes a `StatusCounts` card.
3. `lib/privacy.js`: "Download your data" includes the person's own payments and
   their own GCash details (never anyone else's).
4. Wording: `TermsOfService.jsx`, `PrivacyPolicy.jsx`, `PhilFreela-System-Functions.md`
   (Feature 5 "Scope"), `PLAN-booking.md`. The Word and PDF study guide in the
   user's OneDrive is not touched: it is listed for the user.

## Wording to change when it is built

- `client/src/pages/legal/TermsOfService.jsx` (the lines saying PhilFreela does
  not process payments, and that payment is arranged outside the platform): it
  still never holds or moves money, but it records payments made through a
  project or a chat, and payments made outside them are not recorded or covered.
- `client/src/pages/legal/PrivacyPolicy.jsx`: add the GCash number, name, QR,
  amounts, reference numbers and receipts, who can see them, and the data export.
- `PhilFreela-System-Functions.md`, Feature 5 "Scope" ("The project has no payment
  or money features").
- `PLAN-booking.md` ("No money anywhere") and the comments in
  `database/supabase_bookings_schema.sql` and `supabase_projects_schema.sql`.
- The defense study guide (Word and PDF in the user's OneDrive): its no-payments
  lines.

## What the user does outside the code

- Try it once with their own GCash app: save a QR, check that the app's scan
  works with it, and check that a receipt shows a 13-digit reference number. The
  phone screens in the pictures are stand-ins, not the real app.
- After each push, test on the live site (phil-freela.pages.dev).

## Current step

Step 1 is done. Next: Step 2 (Settings, "GCash Payment"); it needs its own plan
approved first. Re-check `git log` and the
live database first: another Claude session works in this folder.
