# GCash payments: plan and progress

Saved 2026-10-25 after the user said "ok". All seven steps are built (2026-10-25).
The SQL of every step is live (Step 7's `supabase_admin_payments_schema.sql` was
applied on 2026-10-25 as the migration `admin_payments`, after trying it with its
test on the real database: 14 checks, 0 failed, rolled back). To continue in a new
Claude session, say: "Read PLAN-gcash-payments.md and continue from the current step."

Each step had its own detailed plan before any code; each "result" block says what
was built and how it was tested.

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

### Step 4: Report with a payment (Medium) (DONE 2026-10-25)

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

#### Step 4 result (2026-10-25)

Built as planned. Database: `database/supabase_report_payments_schema.sql`
(`reports.payment_id`, the trigger `reports_check_payment`, and the two admin
read policies on `payments` and on `receipts`) and `database/test_report_payments.sql`,
applied live as the migration `report_payments` after a rolled-back trial with
the schema and the test in one call (18 checks, 0 failed, none skipped: a
stranger can't send someone else's payment, the payment must be with the person
reported, only a report about a person can carry one, a missing payment is
refused, a normal report still works, the client and the freelancer can each
report with the payment, an admin can't read an unreported payment or its
receipt but can once a report points at it, and still not the other payments of
the same project, a stranger still can't, the user counter did not move).
Checked live afterwards: the column, the trigger and both policies exist, the
trigger function is not callable by signed-in users, nothing was left behind.
The new query shapes were also checked against the real API with the public key
(the `payment:payments(...)` embed on reports resolves, and the Step 2 and 3
queries for `payments`, `gcash_accounts`, `job_posts` and `get_pay_details` too;
each answered "permission denied" or an empty list, and a made-up column gave
42703, so the columns are right).

Website: `lib/reports.js` (`paymentId`), `ReportDialog.jsx` (a ticked box "Send
this payment with the report" when the target has a payment),
`ProjectDetailsView.jsx` (holds the popup; the Report link in
`PaymentsSection.jsx` was already there from Step 3) and `AdminReportsView.jsx`
(a "GCash payment sent with this report" box with the amount, reference, status,
dates and View receipt). Tested in a real browser against a pretend Supabase
(21 checks, 0 failed): the Report link only on the "Not received" payment, the
popup about the other person with the box ticked to start with, what is sent
(with and without `payment_id`), the database's refusal and "already reported"
sentences, the freelancer reporting the client, the admin page (the request asks
for the payment, the box, View receipt in a new tab, a receipt that can't be
opened, a report without a payment shows no box), phone width; lint (only the
two old warnings) and build clean.

### Step 5: Database for payments from a chat (Medium) (DONE 2026-10-25)

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

#### Step 5 result (2026-10-25)

Built as planned: `database/supabase_chat_payments_schema.sql` and
`database/test_chat_payments.sql`, applied live as two migrations
(`chat_payments_tables`: the `payments` and `messages` changes and the 22nd
notification kind; `chat_payments_rules_and_functions`: the narrowed message
rules, the edit guard, the wider QR rule and the six functions), after a
rolled-back trial with the schema and the test in one call (62 checks, 0 failed,
none skipped).

Decisions made while building it:

- The database does not look at the account type to decide who can request:
  only a verified person who has GCash details saved, not blocked from posting or
  messaging. (People switch between client and freelancer, and only a freelancer
  can save details in the site.) The website shows the button only in
  freelancer mode.
- `payments.created_at` is when the payment was recorded: for a chat request,
  `record_chat_payment` sets it again when the other person records it (the
  request's own time is the card message's time).
- The edit guard on `messages` refuses an edit or unsend of a payment card but
  still lets `mark_messages_delivered()` set `delivered_at` on it (it updates
  every message the other person received).
- A not-received chat payment tells the person to "ask them to send a new
  request" (a project payment still says to record it again).
- Not covered by the test: removing a payment card from the browser (needs a
  statement the connector asks a person to confirm). Instead the test checks that
  the remove rule mentions payment cards, and a live check shows all three
  message rules do.

Checked live afterwards: the new columns exist on `payments` and `messages`, the
six functions run for signed-in users and not for a signed-out visitor, 22
notification kinds, the three message rules mention payment cards, nothing was
left behind (0 payments, 0 GCash rows, 0 payment cards, 0 files, 0 payment
notifications), both offline-email triggers are still on, and the user number
counter did not move. The site that is live now keeps working: nothing creates a
payment card until Step 6, and an old page would show one as a plain line of text.

### Step 6: The chat card and the request window (Medium to Hard) (DONE 2026-10-25)

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

#### Step 6 result (2026-10-25)

Built as planned: `lib/payments.js` (request, cancel, where to pay, record on a
card, list and watch the chat's payments), `components/PaymentCard.jsx`,
`components/RequestPaymentDialog.jsx`, the `payment_requested` icon and "Open
chat" button in `lib/notifications.js`, and edits to `views/ChatView.jsx` (it now
asks for `payment_id`, draws a card instead of a bubble for a payment message with
no right-click menu, keeps the cards' payments up to date, has the "Request
payment" button in the header for a verified freelancer who can message, opens
the Report popup from a card, and keeps a payment card from taking the "Sent /
Seen" label). `RecordPaymentDialog.jsx` from Step 3 is reused as it is (the
amount starts as the requested one).

Differences from the plan text: the "Request payment" button is only an icon on a
phone; the freelancer's "Cancel request" and both answers ask a second question
first; the Report popup opened from a card also lists the chat's last messages to
tick, like the header flag does.

Tested in a real browser against a pretend Supabase (51 checks, 0 failed): the
button for a verified freelancer and not for a client or an unverified freelancer;
the request window (amount refused when empty, 0 or over 1,000,000, the note stops
at 100 characters, what is sent, the database's "already has a payment waiting"
sentence, no saved GCash details: a warning with a link to Settings and Send off);
the card for the freelancer (Requested, waiting, Cancel request with its question
and Keep it, Cancelled) and a new request after a cancel; no right-click menu on a
card; the card for the person asked to pay (name, number, Copy number, QR through
a signed link, the "only pay people you trust" line, I've paid with the amount
filled in, Send off until a screenshot is attached, a short reference refused, a
reused reference refused with the upload removed again, recording with a different
amount, Payment sent); the freelancer answering (View receipt, the two questions,
Confirmed, Not received, Report with the payment's id and the chat messages that
were ticked); the payer seeing Not received and Cancelled; phone width and light
mode with no sideways scrolling; payments that can't be loaded leave the card's
text line; the Notifications page shows the new kind with "Open chat". The new
query shapes and the six function names were checked against the real API with
the public key (they exist and a made-up column gives 42703). Lint (only the two
old warnings) and build clean. Not tested: the live arrival of a new card or an
answer (the test holds the realtime socket silent, and shows a new card after a
reload).

### Step 7: Admin Overview, data and wording (Easy) (DONE 2026-10-25, SQL applied live later the same day)

1. Database, `database/supabase_admin_payments_schema.sql`: a new function
   `admin_payment_counts()` (instead of widening `admin_transactions()`, so the
   function that is live now is not touched) returns payments by status
   (requested, sent, confirmed, not_received, cancelled), archived people left
   out, counts only, no amounts. Test file `database/test_admin_payments.sql`.
2. `admin/views/AdminOverviewView.jsx`: the "Payments: Not set up yet" card
   becomes a `StatusCounts` card.
3. `lib/privacy.js`: "Download your data" includes the person's own payments and
   their own GCash details (never anyone else's).
4. Wording: `TermsOfService.jsx`, `PrivacyPolicy.jsx`, `PhilFreela-System-Functions.md`
   (Feature 5 "Scope"), `PLAN-booking.md`. The Word and PDF study guide in the
   user's OneDrive is not touched: it is listed for the user.

#### Step 7 result (2026-10-25)

Built as planned, except the function is new (`admin_payment_counts()`, admin only
through `is_admin()`, not callable by signed-out visitors) and the Overview shows
the "Payments" card with its five numbers and "N in total"; if the function is not
in the database (or fails) the card keeps the old "Not set up yet" line and the
rest of the page is unchanged. "Download your data" (`lib/privacy.js`) now has
`payments` (id, project, chat, both people, amount, note, reference, status, times)
and `gcash_account` (number, name, whether a QR is saved), never the receipt or
QR file names; the Settings text and the file's own "about" line say so. Wording:
Terms (what PhilFreela is, a new Payments section, no warranty), Privacy (GCash
details and payment records under what we collect, who can read them, when admins
can, the download, what is kept when an account is deleted), Feature 5 "Scope" in
`PhilFreela-System-Functions.md`, `PLAN-booking.md`, and the old "no money"
comments in `bookings.js`, `projects.js`, `profileStats.js` and the three schema
files. (The Privacy page says the receipt and QR picture files stay in private
storage after an account is deleted: `delete_my_account()` removes the database
rows by cascade but nothing deletes storage files, for these pictures or for
any other upload; fixing that is a separate piece of work.)

Tested: `database/test_admin_payments.sql` (14 checks) passed on a PGlite
stand-in first (the Supabase connector was offline), then, once the connector was
back, together with the schema in one rolled-back call on the real database (14
checks, 0 failed), and the schema was applied live as the migration
`admin_payments` (checked afterwards: signed-out visitors can't call it, signed-in
users can). Browser test
against a pretend Supabase (31 checks, 0 failed): the card with its five numbers,
order and total, counts only (no peso sign), all zeros, the function missing (the
card falls back and Bookings, Projects, Job posts and Ratings still load), phone
width; "Download your data" for a freelancer with two payments and a QR (the
receipt column is never asked for, no file names in the file), a client with no
GCash details, a person with no payments; the Terms and Privacy pages (new
sections present, old "does not process payments" sentences gone, no sideways
scrolling). Lint (only the two old warnings) and build clean.

## Wording to change when it is built (all done in Step 7 except the last item)

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

## Change asked 2026-10-25: no QR upload, name shown as initials (BUILT, its SQL waits for the user to run it)

The user: "remove the qr upload in gcash, just name and number only, if I were to
recommend, only initials". Why: a real GCash QR can only come from the GCash app,
PhilFreela can't make one (no official format found, nothing to test with), and
GCash itself now hides part of a recipient's name when sending money. My reading of
"only initials": the freelancer still types the name on their GCash account in
Settings (kept private, only they can read it), and everyone else (the client on
the project page or the payment card) sees only its initials ("A. R. S.") and the
number.

Live state checked 2026-10-25: 1 GCash account, none with a QR, 0 files in the
`gcash-qr` bucket, so nothing is lost.

What people see: Settings > GCash Payment has the number and the name only, and
says what others will see (the initials and the number, only on a project or a
payment card with them). The client's pay box and the chat payment card show
"Send to A. R. S." and the number with Copy number, and "GCash hides part of the
name when you send. The first letters should match these initials. If they don't,
don't send: message {name} first." The record window says "Paid to {profile
name}" (it used the GCash name before).

Database (new `database/supabase_gcash_initials_schema.sql`, test
`database/test_gcash_initials.sql`):

1. `get_pay_details(project)` and `get_request_pay_details(payment)` are replaced
   (their answer changes shape, so they are dropped and made again): they return
   `initials` and `gcash_number`, never the name and never a QR. The initials are
   worked out in the database, so the full name never reaches another person's
   browser.
2. `gcash_accounts.qr_path` (and its folder check) is dropped.
3. The four `gcash-qr` storage rules are dropped and the empty bucket is removed
   (an empty one only; if it has files by then, it is left and I say so).
4. The QR checks in `database/test_payments.sql` and `database/test_chat_payments.sql`
   are taken out so they still pass when run again.

Website: `lib/payments.js` (the QR upload, remove and link functions go; the saved
details and the pay details lose `qr_path`; `checkQrFile` STAYS because the earning
plan's Admin > Site page uses it), `components/GcashSettingsForm.jsx` (QR part
removed), `components/PaymentsSection.jsx` and `components/PaymentCard.jsx` (no QR,
initials and the matching hint), `components/RequestPaymentDialog.jsx` (its text),
`payments.css` (the QR tile styles), `lib/privacy.js` (no `has_qr`), and the
Terms/Privacy page (QR picture and its storage lines).

Left alone on purpose: PhilFreela's OWN GCash number and QR for fees (the earning
plan, `site_gcash`, Admin > Site) belong to the other session's feature.

Test: the new SQL test (initials for several names, who may call, no name and no
QR in the answer, the column, rules and bucket gone, signed-out refused), the two
older SQL tests re-run, a browser test (Settings, project pay box, chat card, phone
width, light mode, no QR anywhere, the Terms/Privacy lines), lint and build.

#### Result (2026-10-25)

Built as planned; the user chose to run the SQL file themselves. Why: the database
tool refuses statements that delete things (DROP FUNCTION, DROP POLICY, DELETE of the
bucket) and the user chose the clean result over an approach without deletes.

Done and tested: `database/supabase_gcash_initials_schema.sql` and
`database/test_gcash_initials.sql` (29 checks, 0 failed, on the local stand-in
only; NOT yet tried on the live database); the QR checks were taken out of
`database/test_payments.sql` and `database/test_chat_payments.sql` (to be re-run
live after the schema); the website (`lib/payments.js` without the QR upload, remove
and link functions and with `nameInitials()`; `GcashSettingsForm.jsx` with the
number, the name and a live "Others will see only the initials: A. R. S." line;
`PaymentsSection.jsx` and `PaymentCard.jsx` showing the initials and the "first
letters should match" hint; "Paid to {PhilFreela name}" in the record window; the
Request payment window text; the QR styles; `lib/privacy.js`; the Terms and Privacy
page). Browser test against a pretend Supabase, 31 checks, 0 failed: Settings (no
QR anywhere, no file box, the initials line for several names, refused number and
name, save sends only number and name, no storage request, reload, remove, phone
width), the project pay box (initials, number, Copy number, hint, no name in the box,
no picture request, the record window, no details saved, phone width, light mode),
the payer's card in a chat, the Request payment window, the Terms/Privacy lines. Lint
(only the two old warnings) and build clean. `checkQrFile` stays in `lib/payments.js`
for the earning plan's own QR (Admin > Site).

To finish: the user runs `database/supabase_gcash_initials_schema.sql` in the
Supabase SQL Editor; then try `test_gcash_initials.sql`, `test_payments.sql` and
`test_chat_payments.sql` live (each rolls back), check the live state, and push.
Until it is run, do NOT push: the old database still answers with `account_name` and
`qr_path`, which the new page does not read.

## Current step

Steps 1 to 7 are built and their SQL is live (2026-10-25). What is left is the
user's own check on the live site with a real GCash app (see above), and the Word
and PDF defense guide's no-payments lines. The follow-up ideas (agreed price,
payment requests only from a project, history, admin trail, pay-to-unlock) are in
`PLAN-transaction-tracking.md`. Re-check `git log` and the live database first:
another Claude session works in this folder.
