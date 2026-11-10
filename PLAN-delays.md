# Plan: Delays (late payment, unanswered payment, unreviewed work) and what happens to the one who delays

Written 2026-11-10. Source: the user's groupmate sent a payment-policy table (payment due date,
payment reminder, late payment notice, service suspension, late payment penalty, payment confirmation,
dispute resolution). The user asked "do you know the violations if there is something a delay, in any
aspect?" and then "so what's the plan, how can we deal with these?".

Status (2026-11-11, Manila): Steps 1, 2, 3 and 4 are LIVE, database and website (migrations `payment_due_reminders`,
`unpaid_client_block`, `payment_waiting_reminders`, `auto_accept_work`; website commits d735603, 7cc23e9 and the Step 4
one). Each migration was proved on live after applying (removing only its own lines from each changed function gave the
old checksum back) and its test was run again, rolled back (26/26, 38/38, 20/20, 21/21, nothing left behind). Still to do:
Step 5. Step 4 started on 2026-11-11 with the one project already waiting (sent Oct 20) counted from that day: its warning
comes on Nov 17 and its acceptance on the next run. Note for later changes: `hire_applicant` and `create_booking` must keep their `block_if_client_owes` call,
and `send_daily_notices` has three parts added by this plan (payments due/late, the waiting payments, and the limit
sentences in the late notices); always start from the live definition.

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
database/test_unpaid_client_block.sql), as built 2026-11-10:
1. `projects.pay_allowed_at timestamptz` (the freelancer's forgiveness, empty = not allowed). Same idea as
   `late_allowed_at`.
2. `payment_overdue(target_project uuid) returns boolean`: Step 1's rule in one place (Done + agreed one-time + today
   after `payment_due_date(p)` + money left, waiting counted as paid). Internal: users can't call it. (The plan said a
   computed column users could read; an internal function is safer, because the page works the rule out itself.)
3. `block_if_client_owes(target_freelancer uuid)` (internal, security definer, only about `auth.uid()`): raises the
   plain sentence ("You still owe Juan ₱1,200.00 for "Logo", and its payment day has passed. Pay what is left on that
   project first, or ask Juan to allow you to hire again.") for the signed-in client's project that has been late the
   longest and is not allowed. (This replaces the plan's `owes_freelancer`, so each live function needs only ONE added
   line.)
4. One call, `perform public.block_if_client_owes(...)`, right after the suspension check of the LIVE `hire_applicant`
   (the applicant's freelancer) and the LIVE `create_booking` (the offer's freelancer). The website already shows the
   P0001 sentence from both. The lines are added by reading the live function and splicing, with an "exactly once"
   check on the place to add them, so nothing else in those functions can be lost. The same way, the two "Payment is
   late" notices of Step 1 got one sentence each about the limit.
5. `allow_unpaid_client(target_project uuid)`: only the project's freelancer, only while the payment is late; sets
   `pay_allowed_at = now()`; pressing it twice changes nothing.

Website (as built):
- New client/src/lib/payBlock.js: `getOwedProject(freelancerId)` (works the rule out from the client's Done projects with
  that freelancer and their payments, like Step 1), `getPayAllowance(projectId)`, `allowUnpaidClient(projectId)`. Soft
  failure before the SQL is applied: nothing is shown.
- New components/PayBlockNotice.jsx on the project page (both people; the client gets "Go to payment", the freelancer
  "Allow to hire again" with a confirm step, and "Report"). ProjectDetailsView.jsx keeps the payments the Payments
  section reads, for it.
- New components/OwesNotice.jsx, shown by HireDialog.jsx and BookDialog.jsx instead of the form (the popup opens, asks
  quietly, and swaps to the notice). ApplicationsPanel.jsx passes the applicant's freelancerId to the Hire popup.
- Terms bullet ("A late payment limits hiring", with "PhilFreela charges no late fee and can't collect one"). Memory
  note after it ships (like late-freelancer-block): any later `create or replace` of `hire_applicant` or
  `create_booking` must keep the call.

Tests:
- test_unpaid_client_block.sql (rolled back on live, 38/38): what counts as late (9 cases), who can call what, the
  check one person at a time, Book and Hire refused for the late client with the sentence and nothing created, the
  older Hire and Book rules still work, another client and another freelancer unaffected, "Allow to hire again" (only
  the project's freelancer, only while late, twice changes nothing), a part payment still stops them and shows what is
  left, paying the rest lifts it, and the late notices say the new sentences.
- Mocked-network browser check: the project page for both people, the Hire and Book popups, the Terms bullet.

### Step 3. A payment the freelancer does not answer

What people see:
- Freelancer, day 2 and day 5: "A payment of ₱1,200 from Maria for "Logo" is waiting for your answer. Check your
  GCash, then confirm it."
- Client, day 7: "Juan has not answered your payment of ₱1,200 for 7 days. You can report it." and the
  payment card shows the Report button, with the payment attached.

Database (migration `payment_waiting_reminders`, database/supabase_payment_waiting_schema.sql,
database/test_payment_waiting.sql), as built 2026-11-10:
1. New kind `payment_waiting` in the type check (read from the live list: 37 kinds, so 38).
2. The live `send_daily_notices()` gets the new part spliced in (read the live function, add only my lines, "exactly
   once" check on each place): payments with `status = 'sent'`, days waiting = today - Manila date of `created_at`
   (a chat request gets a new `created_at` when the client records it, checked in `record_chat_payment`): 2 to 4 ->
   `wait_2` (freelancer), 5 to 6 -> `wait_5` (freelancer), 7 or more -> `wait_7` (BOTH people: the client is told they
   can report it, the freelancer is told the client can now. The plan had the client only; this also covers a
   freelancer who was never nudged because the job caught up late). Project payments link to the project page, chat
   payments to the chat. Sent log: target = the payment, `due_date` = the Manila day it was recorded. A chat can have
   only one open payment at a time (unique index), so the test uses three chats.
3. Nothing changes in the payment rules. PhilFreela never auto-confirms money it can't see.

Website (as built):
- lib/payments.js: `PAYMENT_REPORT_AFTER_DAYS = 7`, `waitingDays(payment)`, `canReportUnanswered(payment)` (the 7 is in
  SQL and JS, each says so).
- PaymentsSection.jsx (project page) and PaymentCard.jsx (chat): for the client/payer, a payment still waiting after 7
  days says "X hasn't answered for N days: you can message them, or report it", with Message (project page) and
  Report buttons. The report popup already offers to send the payment with the report (checked: it works for a
  waiting payment, the database only checks that the payment is between the two people).
- lib/notifications.js: icon (hourglass) and label ("View payment") for `payment_waiting`. Terms bullet.

Tests:
- test_payment_waiting.sql (rolled back on live, 20/20): 1 day nothing, 2 to 4 days the first reminder, 5 to 6 days the
  second, 7+ days both people, a payment never reminded before gets one notice (not the early ones), answered / chat
  requested / cancelled payments get nothing, chat payments link to the chat and say "in the chat", the sent log has
  one row each, a second run sends nothing.
- Mocked-network browser check: the 7 / 6 / 1 day boundary on the project page and the chat card, the freelancer sees
  no Report, the report popup, the notification, phone and light mode, the Terms.

### Step 4. Work the client does not review (the user kept it, at 7 days: "7 days lets go", 2026-11-11)

Decided with the user: 7 days, and work that was already waiting when this goes live is counted from that day (so it
gets its full 7 days and its warning, instead of being accepted at the first run). As built:
- Two columns on `projects`: `auto_accepted` and `review_counted_from` (the one-time update sets it to the go-live day for
  work already waiting 6 days or more; on 2026-11-11 that is the one live project that has waited since Oct 20).
- `auto_accept_project(uuid)` is internal. The daily job is spliced (guarded, exactly-once) right before Step 1's payments
  part: a warning once per sending (sent log kind `review_6`, keyed by the day it is counted from), and the acceptance only
  AFTER that warning, at least one run later (so a missed day 6 never skips the warning). `remind_unpaid_on_done` gets its
  first sentence swapped for an automatic variant.
- Website: lib/reviewClock.js (`REVIEW_DAYS`, `getReviewClock`, `reviewDeadline`), components/ReviewNotice.jsx on the project
  page ("Review the work before <date> ..." for the client, "If X doesn't ... before <date> ..." for the freelancer, and a
  quiet "accepted automatically" line afterwards; nothing before the SQL is applied), Terms bullet in "Due dates and late
  work". No new notification kinds (it reuses project_review_reminder and project_done).
- Tests: database/test_auto_accept.sql (21 checks, rolled back on live, nothing left behind); mocked browser check.

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
