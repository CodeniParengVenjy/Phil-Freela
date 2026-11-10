# Plan: Asking for more time (a delay request)

Written 2026-11-11. The user: "users can request the delays, like freelancer requesting a delayed payment, client
requesting for delayed output, they can notify in the gmail, and notify with the web notification as well, there is
also a button for requesting delay payment or an output". Then: "that can be paid later or send later something like
that but there's limitation". The user said "ok" to the plan and its limits (2026-11-11).

Status (2026-11-11): LIVE. Database applied as migration `delay_requests` after the rolled-back trial passed 69/69
(it ran again on the applied version: 69/69, nothing left behind); website committed and pushed after it.

## The idea

The one who owes something asks the other for more days. The other accepts or declines.
- the CLIENT asks for more time to PAY (the freelancer answers)
- the FREELANCER asks for more time to SEND the work (the client answers)
(The user's first words had it the other way round; the user confirmed this reading: "paid later or send later".)
A delay alone is still not a violation (PLAN-delays.md). No fee, no penalty, no admin part.

## The limits (agreed)

- Up to 7 more days than the current date, each time.
- 2 requests per project for each kind, whatever the answer (cancelled ones count too, so asking and cancelling
  can't be repeated to bother the other person).
- Only on or before the date. Once it is late, the late rules apply and a request can't erase them.
- One request waiting for an answer at a time, for each kind.
- A reason of 3 to 300 characters, through the word filter.
- Nobody answers = nothing changes: the old date stands and the reminders keep going. No automatic yes.
- Work request only while the project is Started (not yet sent). Payment request only on a Done project with an
  agreed one-time price and money left.

## What exists that this builds on (checked 2026-11-11)

- `projects.due_date` is fixed when the project starts. The late pill, the 8 AM reminders, `missed_deadline`, the
  on-time count and the late-freelancer block all read it, so moving it is enough.
- The payment day is not stored: `payment_due_date(p)` (SQL) and `paymentDueDate()` (lib/payments.js) work it out as 7
  days after Done. The payment reminders, the late pill and the hire/book limit read it. One new column is needed.
- Every `user_notifications` row already emails a user who is offline (`queue_offline_email`, unless they turned
  emails off), so there is no new email code, only the new notice kinds.

## Database (migration `delay_requests`, database/supabase_delay_requests_schema.sql, database/test_delay_requests.sql)

1. `projects.payment_due_override date` (the later payment day the freelancer agreed to). `payment_due_date()` reads it
   first (the live function with that one change; the live body was checked to match the repo's).
2. Table `delay_requests` (project, kind work/payment, asked_by, from_date, to_date, reason, status
   pending/accepted/declined/cancelled, created_at, answered_at). Unique index: one pending per project and kind. The
   reason goes through `mask_columns`. RLS: only the project's client and freelancer can read; nobody writes directly.
3. Three new kinds in `user_notifications_type_check` (the live list: 38 kinds, so 41): `delay_requested`,
   `delay_accepted`, `delay_declined`.
4. `request_delay(project, kind, new_date, reason)`, `answer_delay(request, accept)`, `cancel_delay_request(request)`.
   All the limits above live in `request_delay` (the 7 and the 2 are only there; lib/delayRequests.js repeats them to
   explain the page). Accepting a work request sets `due_date`; accepting a payment request sets
   `payment_due_override`. Answering is refused if the project changed meanwhile (work sent, money paid, the old date
   no longer the current one) or the new day already passed; declining always works.

## Website

- lib/delayRequests.js: the limits, `listDelayRequests`, `requestDelay`, `answerDelay`, `cancelDelayRequest`,
  `delayView` (what the signed-in person can do now; a waiting request that no longer matters is not shown).
- components/DelayRequestCard.jsx on the project page, right after the late/payment notices: the Ask button with "N of
  2 requests left", the person's own waiting request with Cancel request, the other person's request with Accept and
  Decline, and a quiet history. Shows nothing when there is nothing to do (or the table doesn't exist yet).
- components/DelayRequestDialog.jsx: new day (date box limited to the next 7 days after the current date) and reason.
- lib/payments.js `paymentDueDate()` reads `payment_due_override`; lib/projects.js (project page and My Projects
  selects) and lib/payBlock.js select the new column. **These selects ask for a column that only exists after the
  migration, so the website must be pushed only AFTER the migration is applied** (same order as the notifications N5).
- lib/notifications.js: icons and button labels for the three kinds.
- Terms (Due dates and late work): the old sentence "It can't be changed afterwards" now says it only moves when the
  client accepts a request, plus one "Asking for more time" bullet.
- PhilFreela-System-Functions.md: one row "Asking for more time" in the Delays table that PLAN-delays.md Step 5 added.

## Tests

- test_delay_requests.sql (rolled back on live, to be run with the schema file in one go): who may ask for what, the
  state rules, the days and reason limits, the word filter, one at a time and two in all (cancelled and declined count),
  answering (only the other person, accept moves the date, decline leaves it, answered ones can't be answered or
  cancelled), the notices to both people, stale requests, the new payment day beating the old one for the late rules
  and the hire/book limit, who can read and call.
- Mocked-network browser check (scratchpad delay/delay.test.mjs, 62/62): both people, ask, cancel, accept, decline,
  payment, the limits, what stays hidden, the table missing, light mode, phone, the Terms.

## Status (2026-11-11)

- Website: built, lint clean (2 old warnings in useDashboardShell.js), production build OK, browser check 62/62.
- Database: the first two tries of the rolled-back trial were refused by Claude Code (the auto-mode classifier, then
  "SQL execution was declined"); the unneeded `drop trigger` / `drop policy` lines were taken out of the schema file.
  After the user's "do it again" the trial ran: 65/69, the 4 failures were a test bug (every row in one transaction
  has the same created_at, so the "newest request" helper could pick an old cancelled one; it now picks the waiting one
  first), then 69/69. Applied as migration `delay_requests`; the test ran again on the applied version, 69/69, and
  nothing was left behind (no rows, no test projects, 41 notification kinds, RLS on).
- The other session's Step 4 (fe29344) shares ProjectDetailsView.jsx and TermsAndPrivacy.jsx with this work. It is
  committed and pushed now, so what is left uncommitted in those files is only this feature's. Re-check
  `git status` before committing in case it is working there again.

## Not in this plan

- A request button in the chat, an automatic yes after some days, longer or more requests, an admin view of requests.
