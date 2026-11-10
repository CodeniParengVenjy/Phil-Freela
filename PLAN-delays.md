# Plan: Delays (late payment, unanswered payment, unreviewed work) and what happens to the one who delays

Written 2026-11-10. Source: the user's groupmate sent a payment-policy table (payment due date,
payment reminder, late payment notice, service suspension, late payment penalty, payment confirmation,
dispute resolution). The user asked "do you know the violations if there is something a delay, in any
aspect?" and then "so what's the plan, how can we deal with these?".

Nothing is built yet. No database change yet.

## The idea

A delay alone is not a violation. It breaks an agreement between two people, so it is handled in
three levels, using parts PhilFreela already has:

1. Reminders: the 8:00 AM daily job (`send_daily_notices()`) and its sent log.
2. An automatic limit between those two people only: a copy of the late-freelancer rule
   ("Allow to apply again"), this time for a client who owes.
3. An admin penalty only through a report, only when it becomes bad faith (taking the work and never
   paying, or being paid and never delivering = Scam / Fraud, 30 days or a ban, from the penalty chart).

No late fee: PhilFreela never holds the money, so it cannot collect one.

## Before building

1. Show the user the short numbered steps and wait for their "ok" (memory: feature-planning-workflow).
2. Every migration needs the user's typed go before it is applied to live. Test it first on live inside a
   rolled-back DO block (memory: testing-on-live-supabase).
3. Right before each step: `git log --oneline -5`, `git status --short`, re-read the files
   (memory: second-session-same-folder).
4. Step 4 (auto-accept) is built only if the user keeps it. It is the one real trade-off.
5. Read every live function with `pg_get_functiondef` before changing it. The repo's schema files are OLDER than
   live (the wording migration `notifications_wording` swapped sentences on the live functions), so never
   re-run an old file: swap in only the lines of this plan.

## What exists today (checked 2026-11-10)

- Daily job: `send_daily_notices()` (database/supabase_notifications_more_schema.sql, Sections 2 and 3),
  pg_cron `daily-notices` at `0 0 * * *` (8:00 AM Manila). Sent log `scheduled_notices (kind, target_id,
  due_date)`, primary key on all three, only the functions use it. Every `user_notifications` row is also
  emailed to a user who is offline.
- `user_notifications_type_check` lists the allowed kinds (35 in the repo file, maybe more live): read the
  LIVE list before adding kinds.
- Late freelancer rule (database/supabase_late_block_schema.sql): `projects.first_submitted_at`,
  `projects.late_allowed_at`, `missed_deadline(p)`, `blocked_for_lateness(job)` (security definer, only about
  `auth.uid()`), `allow_late_freelancer(project)`. Website: client/src/lib/lateBlock.js and
  client/src/pages/dashboard/components/LateBlockNotice.jsx. This is the pattern to copy.
- Money: `payments.status` is sent -> confirmed or not_received (`answered_at` is set on the answer).
  `project_paid_amount(project, with_waiting)` (database/supabase_short_payment_schema.sql, not callable by
  users). A balance exists only on a one-time project with an agreed price (`price_status = 'agreed'`,
  `price_basis = 'project'`, `agreed_amount`). The website works out the same numbers in `projectMoney()`
  (client/src/lib/payments.js:129): `left` = price - confirmed, `leftForNew` = left - waiting.
- Done: `mark_project_done` (client only, Submitted -> Done, sets `completed_at`). The trigger
  `projects_remind_unpaid_on_done` sends `payment_unpaid` once, when a project is marked Done with money left.
- Submitted work: the only reminder is `review_0` on the due day. Nothing after it.
- Bookings: status check is pending / accepted / declined / cancelled. A pending booking never expires.
- Reports: a payment can be attached to a report about a person (`reports.payment_id`; the trigger only checks
  that the payment is between the two people). The Report button shows only on payments answered
  "Not received" or "Received less" (PaymentCard.jsx:258, PaymentsSection.jsx:386).
- Penalty chart: client/src/lib/violations.js (Scam / Fraud = 30 days, blocks posting and messaging; a ban is
  possible for any reason).
- Terms: "Due dates and late work" and "Who pays first" in client/src/pages/legal/TermsAndPrivacy.jsx.

## The rules (defaults I chose, the user confirms)

1. Payment is due 7 days after the project is marked Done. Only for a one-time project with an agreed
   price and money left.
2. For "is the client late", a payment the freelancer has not answered yet counts as paid (confirmed +
   waiting). "Not received" does not count. So a freelancer's silence never makes a client late.
   (Website: `leftForNew > 0`. Database: `project_paid_amount(id, true)`.)
3. Notices: the client 3 days before and on the last day; both people when 1 to 6 days late and again at 7+ days.
4. Limit: a late client can't hire or book THAT freelancer until the balance is paid or the freelancer taps
   "Allow to hire again". Other freelancers are not affected. Never a site-wide automatic suspension.
5. A payment the freelancer has not answered: freelancer reminded at day 2 and day 5; at day 7 the client sees a
   Report button with the payment attached.
6. Work the client has not answered: warning on day 6 after sending, accepted automatically on day 7.
   (Fiverr does it after 3 days, Upwork after 14: not opened by me, see the last section.)
7. No late fee. Admin penalty only through a report.

## Steps

### Step 1. Payment due date, reminders and late notices

What people see:
- Client, project page, Payments box: "Pay the rest by November 24" and, when late, a red "3 days late"
  (same look as the project's Overdue pill). The My Projects list gets the same small pill.
- Notices (bell, and email when offline), examples (the final words go to the user first):
  client 3 days before / due today: "Payment for "Logo" is due in 3 days. ₱1,200 is still unpaid. Pay in GCash,
  then record it on the project page."
  client when late: "Payment for "Logo" is 1 day late. ₱1,200 is still unpaid."
  freelancer when late: "Maria has not paid ₱1,200 for "Logo" yet (1 day late). You can message them."
  freelancer at 7+ days: "...is a week late. If it stays unpaid you can report it."

Database (migration `payment_due_reminders`, files database/supabase_payment_due_schema.sql and
database/test_payment_due.sql):
1. `payment_due_date(p public.projects) returns date`, a computed column like `missed_deadline`:
   Done + agreed one-time price -> `(completed_at at time zone 'Asia/Manila')::date + 7`, otherwise null.
   The 7 lives only here.
2. Two new kinds in `user_notifications_type_check`: `payment_due_soon`, `payment_overdue`
   (re-create the check from the LIVE list).
3. Extend the live `send_daily_notices()` with a payments part. For each Done project with an agreed one-time
   price and `agreed_amount - project_paid_amount(id, true) > 0`, `days_left = payment_due_date - today`:
   1 to 3 -> `pay_due_3` (client), 0 -> `pay_due_0` (client), -6 to -1 -> `pay_late_1` (both),
   -7 or less -> `pay_late_7` (both). Ranges plus the sent log (target = the project, `due_date` = the payment
   due date), so a skipped day is caught up and nothing is sent twice.

Website (as built, 2026-11-10):
- client/src/lib/payments.js: `PAYMENT_DUE_DAYS = 7`, `paymentDueDate(project)`, `payDueInfo(project, money, today)`
  (returns `{ late, soon, days, dueDate, text }`; null unless Done + agreed one-time + `money.leftForNew > 0`),
  `paymentNearOrLate(project)` and `listPaymentsOfProjects(ids)`. The page works out the due day itself from
  `completed_at`, like `dueInfo()` does for the work, so it doesn't depend on the new database function (the plan said
  to add `payment_due_date` to the project selects; this is safer, nothing can break before the migration is applied).
  The 7 is in two places (SQL `payment_due_date`, JS `PAYMENT_DUE_DAYS`); each says so in a comment.
- client/src/lib/projects.js: `agreed_amount, price_basis, price_status` added to the My Projects list select.
- PaymentsSection.jsx: the line under the balance bar (and, before Done, "The rest is due 7 days after you mark the
  project Done"). New PayDueBadge.jsx + ProjectsPanel.jsx: the pill on the list. It reads the payments only of Done
  projects near or past their payment day (one extra request, none when there are none), and shows nothing if that
  request fails. ProjectDetailsView.jsx needs no change.
- client/src/lib/notifications.js: icons and button labels for the 2 kinds.
- Terms ("Who pays first"): one bullet with the 7 days, the reminders, and "a payment the freelancer has not
  answered yet counts as paid".

Tests:
- test_payment_due.sql (rolled back): notices at 3 days before, due day, 1 day late and 7 days late, each once;
  nothing when fully paid; a waiting payment counts as paid; "Not received" does not; a per-day or no-price project
  gets nothing; a second run the same day sends nothing; a Done project with an old `completed_at` is late at once.
- Before applying: a read-only count of live Done projects with a balance, so the user knows who would get
  "late" notices on the first run (same care as N4).
- Mocked-network browser check of the line and pill at 1280 / 1536 wide, dark and light mode, with an accent color
  (memory: dashboard-themes, admin-table-widths).

### Step 2. The limit: a client who owes can't hire or book that freelancer ("Allow to hire again")

What people see:
- The client opening Hire (HireDialog.jsx) or Book (BookDialog.jsx) for that freelancer sees a notice instead of
  the form: "You still owe Juan ₱1,200 for "Logo" (3 days late). Pay it first, or ask Juan to allow it."
  Button "Open project".
- The freelancer, on that project's page, sees: "Maria is 3 days late paying ₱1,200." Buttons "Allow to hire
  again" and "Report". Paying the balance lifts the limit by itself.

Database (migration `unpaid_client_block`, database/supabase_unpaid_client_block_schema.sql,
database/test_unpaid_client_block.sql):
1. `projects.pay_allowed_at timestamptz` (the freelancer's forgiveness, empty = not allowed). Same idea as
   `late_allowed_at`.
2. `payment_overdue(p public.projects) returns boolean` (security definer, stable, computed column): Done +
   agreed one-time + today after `payment_due_date(p)` + money left (waiting counted as paid, rule 2).
3. `owes_freelancer(target_freelancer uuid) returns boolean` (security definer, only about `auth.uid()`, like
   `blocked_for_lateness`): the signed-in client has a project with that freelancer where `payment_overdue` is true
   and `pay_allowed_at` is null.
4. One check at the top of the LIVE `hire_applicant` (the applicant's freelancer) and the LIVE `create_booking`
   (the service's freelancer): `if public.owes_freelancer(...) then raise exception '...'`. The message is plain
   words; the website already shows P0001 messages from both functions. Swap in only this check.
5. `allow_unpaid_client(target_project uuid)`: only the project's freelancer, only while `payment_overdue`; sets
   `pay_allowed_at = now()`.

Website:
- New client/src/lib/payBlock.js (copy of lateBlock.js): `getOwedProject(clientId, freelancerId)` and
  `allowUnpaidClient(projectId)`.
- New client/src/pages/dashboard/components/PayBlockNotice.jsx (copy of LateBlockNotice.jsx) on the project page for
  the freelancer.
- HireDialog.jsx and BookDialog.jsx show the notice when the client owes.
- Terms bullet. Memory note after it ships (like late-freelancer-block): any later `create or replace` of
  `hire_applicant` or `create_booking` must keep the check.

Tests:
- test_unpaid_client_block.sql (rolled back): hire and book are refused with the message while overdue; allowed
  after paying; allowed after "Allow to hire again"; another freelancer is unaffected; the client can't call
  `allow_unpaid_client`; a stranger can't; `owes_freelancer` says nothing about anyone else.
- Mocked-network browser check of the two dialogs and the freelancer's notice.

### Step 3. A payment the freelancer does not answer

What people see:
- Freelancer, day 2 and day 5: "A payment of ₱1,200 from Maria for "Logo" is waiting for your answer. Check your
  GCash, then confirm it."
- Client, day 7: "Juan has not answered your payment of ₱1,200 for 7 days. You can report it." and the
  payment card shows the Report button, with the payment attached.

Database (migration `payment_waiting_reminders`, database/supabase_payment_waiting_schema.sql,
database/test_payment_waiting.sql):
1. New kind `payment_waiting` in the type check (live list first).
2. Extend the live `send_daily_notices()`: payments with `status = 'sent'`, days waiting = today - Manila date of
   `created_at`: 2 to 4 -> `wait_2` (freelancer), 5 to 6 -> `wait_5` (freelancer), 7 or more -> `wait_7` (client).
   Sent log: target = the payment, `due_date` = the Manila date it was recorded.
3. Nothing changes in the payment rules. PhilFreela never auto-confirms money it can't see.

Website:
- PaymentCard.jsx and PaymentsSection.jsx: the Report button also on a waiting payment older than 7 days, client
  only. First check that ReportDialog attaches a payment in that state (the database already allows it).
- lib/notifications.js: icon and label for `payment_waiting`. Terms bullet.

Tests: test_payment_waiting.sql (rolled back): day 2, 5 and 7 notices once each, none after the payment is answered
or cancelled, a chat request (status requested) gets none.

### Step 4. Work the client does not review (only if the user keeps it)

What people see:
- Client, day 6 after the work was sent: "Last day to review "Logo". If you don't answer, the work is accepted
  tomorrow." (the existing `project_review_reminder` kind).
- Day 7: the project becomes Done by itself. Both are told "...was accepted automatically because the client did
  not answer in 7 days." (the existing `project_done` kind). The project page shows a small "Accepted
  automatically" label. The client can still ask for changes any time before day 7.
- Project page while Submitted: "Review by November 17, or it is accepted automatically."
- This starts the payment clock of Step 1.

Database (migration `auto_accept_work`, database/supabase_auto_accept_schema.sql, database/test_auto_accept.sql):
1. `projects.auto_accepted boolean not null default false`.
2. `auto_accept_project(project)` (internal, not callable by users): same effect as `mark_project_done` (status done,
   `completed_at = now()`), sets `auto_accepted`, writes the `project_done` notices.
3. Extend the live `send_daily_notices()`: Submitted projects, days since sending = today - Manila date of
   `submitted_at` (the LATEST sending, so sending again after "Ask for changes" restarts it): 6 -> warning once
   (sent log), 7 or more -> `auto_accept_project`.
4. Swap one sentence in `remind_unpaid_on_done`: it says "You marked ... as done", wrong for an automatic one.
5. Before applying: a read-only count of live Submitted projects older than 7 days (they would be accepted on the
   first run). Tell the user the number first.

Website: project page labels (client/src/lib/projects.js `reviewInfo()`, ProjectDetailsView.jsx), Terms bullet.

Tests: test_auto_accept.sql (rolled back): warning on day 6 once; day 7 accepts (status, completed_at, flag,
notices); "Ask for changes" before day 7 restarts the count; a Done project is never touched; the payment due date
counts from the automatic Done.

### Step 5. Terms, docs and the paper

- Terms: one short part saying a delay alone is not a violation, which cases can be reported as Scam / Fraud
  (taking delivered work and never paying; being paid and never delivering; repeating a delay after the reminders),
  and that PhilFreela charges no late fee and can't collect one (a fee the two agree on in the chat is between them).
- client/src/lib/violations.js: a comment only, no new category (the adviser's "Fake profile" lesson: don't add
  categories that argue against the system's own checks).
- PhilFreela-System-Functions.md: add the delay handling. The study guide (outside the repo) and a short RRL on
  delays only if the user asks.

## Not in this plan (say so if you want one)

- A. "End project" for a freelancer who disappears. A new `cancelled` status touches many functions and screens.
  Today the client can raise the job's "freelancers needed" and hire someone else.
- B. Pending bookings that expire after 7 days.
- C. A report that carries a project timeline (due date, sent date, payments, notices) so the admin judges a delay
  with facts. New `reports.project_id` and an admin card.
- D. A "pay by" date typed and agreed together with the price, instead of the fixed 7 days.

## Not doing, on purpose

- A late fee or interest. PhilFreela never holds the money, so it can't collect it, and a court can cut an unfair
  one anyway.
- An automatic site-wide suspension for an unpaid balance. PhilFreela can't see GCash, so "unpaid" always comes
  from someone's answer. Site-wide penalties stay with admins, through a report with the receipts.
- Auto-confirming a payment, or letting admins read payments outside a report (the Terms promise they can't).

## Watch out

- Everything about money depends on the freelancer's answers. That is why waiting payments count as paid, the limit
  is per freelancer, and the admin only acts through a report.
- `hire_applicant`, `create_booking`, `send_daily_notices` and the type check have been replaced several times.
  Always start from the live definition.
- All dates are Manila dates. More notices means more emails to offline users; the reminders here are few
  (at most 4 per late project, 3 per unanswered payment).
- If the other session is in the same files, re-check before each step.

## Outside facts used (searched 2026-11-10, official pages not opened by me; check before the paper)

- Fiverr: an order completes by itself 3 days after delivery if the buyer does not answer (Fiverr help center).
- Upwork: a fixed-price milestone is approved after 14 days without an answer (Upwork community posts only).
  Both hold the money in escrow; PhilFreela does not, so for it auto-accept only marks the project Done.
- Civil Code: Art. 1169 (delay starts at demand; in a two-way agreement, once one side has done their part, the
  other side's delay begins), Arts. 1226 and 1229 (a penalty must be agreed; a court can reduce an unfair one),
  Art. 2209 with BSP-MB Circular 799 (6% a year when no interest was agreed). The reminders are the written record
  of the demand.
