# Transaction tracking: agreed price, history, admin trail, pay-to-unlock (plan, NOT approved yet)

Saved 2026-10-25 after the user's ideas on top of the GCash payments (see
`PLAN-gcash-payments.md`, all 7 steps built). Step A is built and live (2026-10-25);
B to H are not. To continue
in a new Claude session, say: "Read PLAN-transaction-tracking.md and continue
from the current step." Each step gets the user's OK before code.

## What the user asked (their words, 2026-10-25)

1. A payment request in a chat must not set its own price: the price must come
   from the project or service.
2. "Does PhilFreela determine what is a fake and a real GCash receipt?" (answer
   below: no)
3. After the client sends a receipt, the system asks the freelancer "did you
   already receive the payment?"
4. How to track and monitor the transaction. Idea: a project history for the
   users with Name, Project, Output and Transaction.
5. The client can see the output before paying, but with a watermark; the clean
   file comes after the payment.
6. (Earlier) the system reading the receipt screenshot and matching it to the
   request.

## Answers

- **Fake or real receipt:** PhilFreela cannot tell. It cannot ask GCash, and a
  screenshot can be edited. It can only check that the receipt agrees with the
  request (amount, 13-digit reference, recipient, date, not used before). The real
  check is the freelancer's own GCash, which is what the question in point 3 asks.
  The site must never say "verified"; only "matches the request".
- **The question to the freelancer** already exists (Payment sent, then Confirm
  received or Not received, each with a second question). Step C below makes it
  harder to miss and adds reminders.
- **File escrow, not money escrow:** with pay-to-unlock PhilFreela holds the
  original FILE until the freelancer confirms the payment. It still never holds,
  moves or guarantees money.

## Where things stand today (checked in the code, 2026-10-25)

- A project has NO price (`projects` has title, note, status, due date, one
  submitted file, link and message). `services.price` and `job_posts.budget` are
  both optional, so either can be empty. Job posts also have `budget_type`
  (project, day, month). A booking has no price.
- A payment's amount is typed by the client (project) or by the freelancer (chat
  request, 1 to 1,000,000). A payment belongs to a project OR a chat.
- The submitted output sits in the private `deliverables` bucket and the client
  can open it at once. Nothing is watermarked there. The visible-watermark code in
  `ai-service/` (`visible_watermark.py`, `watermark_video.py`, the freelancer's own
  Watermark Settings) belongs to the other session (Feature 3).
- The admin sees only counts of payments. It can read a payment only through a
  report. The Job hiring trail (`HiringTrail.jsx`, `admin_job_trail()`) is the
  pattern for an admin trail.

## Recommended design

1. **One agreed price per project** (`projects.agreed_amount` and its basis:
   project, day or month). Copied from the job's budget when the client hires, or
   from the service's price when the freelancer accepts a booking. If the source
   has no price, the freelancer proposes one on the project page and the client
   taps Agree. Nobody can request payment before a price is agreed.
2. **A request always comes from a project.** The amount is worked out by the
   database (one-time project: agreed price minus what is already confirmed;
   ongoing job: one day or month at the agreed rate). The browser never sends an
   amount. The chat button stays, but it asks "Which project?" and posts the same
   card. The chat-only payment route is retired (no live payments exist yet).
3. **The question** shows as a banner/pop-up for the freelancer ("Carlo says
   they paid ₱5,000 for Logo design. Did the money arrive in your GCash?" Yes,
   received / Not yet) and reminders go out if it stays unanswered.
4. **Project history** for each user, one table: Name (the other person) |
   Project | Output | Transaction. It is a tab inside the existing project
   pages, not a new menu item.
5. **Admin trail**: the same table for everyone plus filters, and a pop-up
   timeline per project: hired or booked, price agreed, work submitted, payment
   requested, client recorded, freelancer confirmed, files unlocked, done.
6. **Pay-to-unlock**: the freelancer submits the work; the system makes a
   watermarked, lower-quality PREVIEW from the real file; the client sees only the
   preview until the freelancer confirms ANY payment on the project (the user's
   choice, 2026-10-25); then the original unlocks by itself. A payment confirmed
   before the work is submitted means the work is sent unlocked. Enforced by the
   database and storage rules, not only by the page.

## The plan, in order

| Step | What | Size | Needs |
|---|---|---|---|
| A | Agreed price on the project (database + project page + hire and booking accept) | Medium | database, tests |
| B | Request payment from a project only: amount from the database; chat button picks the project; project page gets the button; retire the typed-amount chat request | Medium | database, ChatView, PaymentCard |
| C | "Did the money arrive?" prompt for the freelancer + reminders (and "waiting" flag for the admin) | Easy | notifications, one cron job |
| D | Project history table for each user (Name, Project, Output, Transaction) | Medium | one database function, a tab |
| E | Admin Transactions page: the same table WITHOUT amounts or references, filters (status, waiting more than 3 days, not received) and the trail pop-up | Medium | admin-only database functions |
| F1 | Pay-to-unlock, database: lock rule, previews bucket, storage rules, auto-unlock on Confirm | Hard | database, tests |
| F2 | Pay-to-unlock, preview maker: makes the watermarked preview from the real file (image, PDF first pages, short video clip) with the freelancer's own watermark settings. Spike first on the live AI service | Hard | `ai-service` (new file; ask before touching the other session's files) |
| F3 | Pay-to-unlock, screens: lock choice on submit, "Locked, pay ₱X to unlock" for the client, unlocked state | Medium | submit form, project page |
| G | Receipt reading (optional): fill in and match amount, reference, recipient, date; same picture on two payments flagged | Medium | needs 3 to 5 real GCash screenshots to test |
| H | Wording (Terms, Privacy, Functions doc, study guide lines), tests, plan updates | Easy | |

Order: A, B, C, D, E, then F1, F2, F3, then G if wanted. A comes first because
B, E and F all depend on the price. D and E answer "how do you monitor the
transaction" and come before the big F.

## Defaults I would pick (the user can change these)

- No payment request without an agreed price. No more chat-only requests.
- Unlock when the freelancer confirms ANY payment on the project (decided by the
  user). No "Unlock anyway" button. A deposit therefore unlocks the whole work.
- Ongoing jobs (paid per day or month) are not locked; only one-time projects.
- A file that cannot be previewed (ZIP, Blender) or a link cannot be locked unless
  the freelancer attaches a preview picture; otherwise it is sent unlocked and the
  submit form says so.
- The preview is made by the system from the real file, so the freelancer cannot
  show one thing and deliver another.
- The admin sees names, project, output (yes or no, date) and the payment's status
  and times, but NO amounts (decided by the user), and never the receipt or the
  reference unless a report carries them.
- "Done" does not wait for payment. Payment and Done stay separate.
- If the freelancer never confirms, the client reports it (the report flow exists).

## Risks and limits (say them in the defense)

- The site never decides if a receipt is genuine. The freelancer's Confirm is the
  check, and a dishonest freelancer who never confirms blocks the unlock; the
  client's remedy is a report.
- A client can photograph the preview; that is why it is watermarked and reduced.
- Previews of big videos on the free AI-service plan may be too slow or too big;
  that is why F2 starts with a spike on the live service.
- A price can be empty in the service or the job; the propose-and-agree step covers
  it but adds one more action for those projects.

## Decisions the user made (2026-10-25), do not ask again

1. The price cannot be typed or edited in "Request payment": it must come from the
   project. (Step B: the database works the amount out; the browser sends none.)
2. Unlock when the freelancer confirms ANY payment, not only when paid in full.
3. The admin does NOT see amounts.
4. A new file in `ai-service/` may use the other session's visible-watermark
   functions (read only), with one line added to `main.py`.
5. Receipt reading: the user only asked "receipt reading?"; my recommendation is to
   keep it last (Step G), optional, and not start it before A to F. It is a helper,
   never a check, and it needs 3 to 5 real GCash screenshots to test.

## Step A in detail: the agreed price on the project (Medium) (DONE 2026-10-25, see its result below)

What people see:

1. Project page, a "Price" box above Payments. Four states: agreed (amount with its
   unit, e.g. "₱5,000 per project" or "₱800 per day", where it came from, the
   date); not set (the box says so and either person can type a price and send
   it); proposed (the other person sees "Carlo proposed ₱5,000 per project" with
   one Agree button; the person who proposed sees "Waiting for Carlo to agree" and
   can send a different amount meanwhile).
2. Once agreed, the price is locked. Changing it later is not built.
3. The Book window (service) and the Hire window (job) get one read-only line:
   "Price: ₱X (from the service)" or "No price set yet. You can agree one on the
   project page after it starts." No new input in those windows.
4. Payments section on the project page shows the agreed price where it showed the
   job budget as a hint. (Step A does not yet stop the client typing another
   amount; Step B does.)
5. Two new notifications: price_proposed ("View project") and price_agreed.

Database (new `database/supabase_project_price_schema.sql`, new
`database/test_project_price.sql`):

1. `projects` gets `agreed_amount` (more than 0, up to 1,000,000), `price_basis`
   (project, day or month), `price_status` (none, proposed, agreed; starts none),
   `price_proposed_by` (empty if that person's account goes) and
   `price_agreed_at`. A check keeps them consistent: none means no amount;
   proposed or agreed means an amount.
2. `bookings` gets `price`, the service's price copied when the client books, so
   the freelancer editing the service later does not change what the client
   agreed to.
3. `create_booking()`, `accept_booking()` and `hire_applicant()` are replaced
   (same rules as now plus the price): a booking carries the service's price into
   the project as agreed (basis: project); a hire carries the job post's budget and
   `budget_type` as agreed. If the source has no price, the project starts with
   price_status none.
4. `propose_project_price(project, amount)`: only the two people, only while
   the price is none or proposed (not agreed), amount 0.01 to 1,000,000; sets
   proposed and tells the other person.
5. `agree_project_price(project)`: only the person who did NOT propose, only while
   proposed; sets agreed and tells the proposer.
6. Notification kinds price_proposed and price_agreed added to
   `user_notifications_type_check` (all 22 existing kinds kept).
7. The browser still cannot change `projects` directly; only these functions can.
   Existing projects stay "none" (no backfill: nobody agreed to anything).

Client files: new `lib/projectPrice.js` (words, formatting, propose, agree) and
`components/ProjectPriceBox.jsx`; edits to `views/ProjectDetailsView.jsx` (new
columns, the box), `components/PaymentsSection.jsx` (agreed price replaces the
budget hint), `components/BookDialog.jsx` and `components/HireDialog.jsx` (the
read-only line), `lib/notifications.js` (icons and the "View project" button).

Test: the SQL file in one rolled-back call (hire with and without a budget, a
day or month job, booking with and without a service price, a booking that keeps
its price after the service changes, propose and agree by the right and wrong
people, a second proposal replacing the first, nothing after agreed, strangers
and signed-out refused, amount limits, notifications); a browser test against a
pretend Supabase (all four box states for both people, refusals, the lines in the
two windows, the Payments hint, Notifications page, phone width, light mode);
lint and build.

Needs: the Supabase connector signed in again (it asks for authorization in the
claude.ai connector settings) to apply and test live. Without it I build and test
on the local stand-in and the user runs the SQL file in the SQL Editor.

## Step A result (2026-10-25) (DONE)

Built as planned, database live. `database/supabase_project_price_schema.sql`,
applied live as the migration `project_price` (after the Step 7 function was also
applied live as `admin_payments`): six columns on `projects` and one on `bookings`
with a check that keeps them telling one story; `price_text()`; `create_booking()`,
`accept_booking()` and `hire_applicant()` replaced (same rules plus the price; a
service price or a budget that is empty, 0 or over 1,000,000 counts as "no price");
`propose_project_price()` and `agree_project_price()`; the notification kinds are now
26 (all 24 live ones kept). The three notifications also say the price when a booking
is accepted or a freelancer is hired. Existing projects (4 on the live database) stay
"none".

Website: new `lib/projectPrice.js` and `components/ProjectPriceBox.jsx` (the Price
box on the project page: agreed / none / proposed by me / proposed by them, one
button each); edits to `ProjectDetailsView.jsx`, `lib/projects.js` (new columns),
`PaymentsSection.jsx` (the agreed price replaces the job-budget hint and its job post
request), `BookDialog.jsx` + `ServiceDetailsView.jsx` and `HireDialog.jsx` +
`ApplicationsPanel.jsx` + `lib/applications.js` (one read-only price line each; the
old "Talk about the price in chat" is gone), `lib/notifications.js` (icons, "Open
project").

Differences from the plan text: any failed "Send price" also refreshes the box (the
price may have been agreed in another tab); an old error is hidden once the box is
agreed. Not built on purpose: changing an agreed price (locked).

Tested: `database/test_project_price.sql`, 53 checks, tried together with the schema
in ONE rolled-back call on the live database, 0 failed (also on the local stand-in
first); checked live afterwards: columns, both new functions refused to signed-out
visitors, 26 kinds, 4 existing projects still "none", nothing left behind, user
number counter unchanged. Browser test against a pretend Supabase, 62 checks, 0
failed: every box state for the client and for the freelancer, the six refused
amounts (nothing sent), propose, change, the same amount twice, Cancel, a counter
proposal, Agree, the database refusing (already agreed, in another tab), a job paid
per month, a reload, phone width, light mode, the Payments hint (and no job post
request any more), the Book window (price, none, zero), the Hire window (project,
per day, none), the Notifications page. The new query shapes were checked against the
real API with the public key (real columns pass, a made-up one gives 42703); lint
(only the two old warnings) and build clean. Not tested: the realtime arrival of the
other person's proposal (the box reads the project again after your own action or a
reload).

Note for the other session: both sessions rebuild `user_notifications_type_check`
from a copy of the list; whoever applies last must start from the live list (now 26
kinds, including price_proposed and price_agreed).

## Current step

Step A is done. Next: Step B (request payment from a project only; the amount comes
from the database), which needs its own detailed plan and the user's OK first.
