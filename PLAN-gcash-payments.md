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

### Step 2: Settings, "GCash Payment" (Easy)

1. `lib/payments.js` (new): read and save my GCash details, upload the QR.
2. `views/SettingsView.jsx`: a new sub-menu item "GCash Payment", shown only to
   freelancers, with the number, the name, the optional QR (Upload QR / Remove)
   and Save Changes.

### Step 3: Payments section on the project page (Medium)

1. `lib/payments.js`: pay details, record, confirm, not received, list.
2. `components/PaymentsSection.jsx` (new) and `components/RecordPaymentDialog.jsx`
   (new): the Pay via GCash box for the client, the record window (empty state:
   an "Add screenshot" button and "Attach your receipt screenshot to continue"),
   the list of records with status badges, and Confirm received / Not received
   for the freelancer.
3. `views/ProjectDetailsView.jsx`: render the section.
4. Notification text for the three new kinds in the notifications list.

### Step 4: Report with a payment (Medium)

Not received can end in a Report. A user report can carry one payment (like it
already carries chat messages): `reports.payment_id`, a check that the payment is
between the reporter and the person reported, and an admin-only read of the
record and the receipt through the report. The report popup gets "Attach the
payment" when opened from a payment; Admin > Reports shows the record and the
receipt. Details when this step is next.

### Step 5: Database for payments from a chat (Medium)

`payments` gets `conversation_id` (a payment has a project or a conversation,
exactly one), the statuses `requested` and `cancelled`, and `request_payment`,
`cancel_payment_request` and a `record_payment` that can answer a request. The
chat message list gets a payment card kind and the inbox preview "Payment
request". New notification kind `payment_requested`. Look at the live messages
and conversations tables first.

### Step 6: The chat card and the request window (Medium to Hard)

`ChatView.jsx` header button, `RequestPaymentDialog.jsx`, a payment card in the
message list with the five states, the record window reused.

### Step 7: Admin Overview, wording and data (Easy)

1. The Admin Overview "Payments" card shows counts by status (from an extension
   of `admin_transactions()`; no amounts).
2. "Download your data" includes payments.
3. Reword everything that says there is no money (list below).

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
