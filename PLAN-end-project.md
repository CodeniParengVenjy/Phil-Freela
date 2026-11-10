# Plan: End project (a freelancer who disappears)

Written 2026-11-11. The user said "yes plss" when I offered to plan the two gaps left after PLAN-delays.md: a late
project's due date that can't move, and no way to end a project whose freelancer never sends anything (item A there).

Status (2026-11-11): the user said "apply and ok": the four decisions at the bottom are confirmed as written.
Step 1 (database) is APPLIED to live as migration `end_project` and proved. Step 2 (website) and Step 3 (Terms and
System Functions row) are built and checked; see "As built" at the end.

The first gap is already closed by the other session: "Asking for more time" (PLAN-delay-requests.md) is LIVE since
2026-11-11 (migration `delay_requests` at 00:51 Manila, website commit 9c79aa2 at 00:55, found in the live bundle at
01:09). So this plan is only about ending.

## Why (what is wrong today)

- A freelancer who never sends the work leaves the project Started for ever. The late notices stop after "7 days
  late", the project keeps counting as a hire (`job_state` counts every project of the post), so the post stays
  Filled. The only way for the client to hire someone else is to raise "freelancers needed", and then the numbers say
  two were hired although one is gone.
- Nothing records that the client gave up. The admin trail still says Started.
- It is mostly housekeeping plus a clear record, not a new penalty (the principle of PLAN-delays.md still holds: a
  delay alone is not a violation, no fee, no automatic penalty, admins only through a report).

## The idea

The client of a Started project that was never sent and is MORE than 7 days late can press "End project". The project
becomes Ended, both people are told (bell, number and Gmail like every notice), and the job post's place opens again.

## The rules

- Only the client of the project.
- The status must be Started (not Submitted, Done or Ended) and the freelancer must never have sent anything
  (`first_submitted_at is null`). Work that was sent once and sent back with "Ask for changes" can't be ended this way,
  because the freelancer did deliver something (and otherwise a client could ask for changes and end the project
  three days later). That case goes through Report.
- More than 7 days late: today in Manila is at least 8 days after `due_date`. The freelancer has then had the "late"
  notice and the "7 days late" notice (sent the morning of day 7). The function also checks that the 7 days late notice
  is really in the sent log (`scheduled_notices`, kind overdue_7 for this project and due date), so nobody is ended
  without a warning, the same idea as the automatic acceptance. If it isn't there yet the error says to try after 8:00
  AM.
- No request for more time waiting (the client answers it first). A date moved by an accepted request counts from the
  new date, because every rule reads `due_date`.
- Final: no undo. The window says so.

## What ending does

- `status = 'ended'`, `ended_at = now()`.
- Notice to both (new kind `project_ended`). Freelancer: "Juan ended "Logo for my shop" because it was 9 days late and
  no work was sent. It shows as Ended on both your histories. You can message Juan." Client: "You ended "Logo for my
  shop". Its place on your job post is open again." (no second sentence for a booked project).
- The daily job ignores it (late and review reminders already read only started/submitted).
- The job post: `job_state` and "N of M hired" stop counting it, so the post is open again (if its own dates passed it
  shows Expired as today and the client edits the dates). Hiring someone else works as usual (`hire_applicant` asks
  `job_state`).
- Stays as it is: the late-freelancer block (`missed_deadline` stays true, so the freelancer can't apply to this
  client's other posts until "Allow to apply again"), and the payments (readable; a payment nobody answered is still
  reminded and can still be reported after 7 days).

## What ending does NOT do

- No rating (ratings are for Done projects only) and no change in the freelancer's profile numbers (completed counts
  and the best-fit ranking only read Done projects).
- No money moves. PhilFreela never holds money. If the client already paid something, the End window says so: it
  can't be returned here, report it as Scam / Fraud (the Terms already name "taking a payment and never delivering").
- No penalty, no admin part.

## Database (migration `end_project`, database/supabase_end_project_schema.sql, database/test_end_project.sql)

Checked on live 2026-11-11: `projects.status` is limited to started/submitted/done (3 projects started or submitted,
2 done); 26 functions read the status and all but four only test `done`, `started` or `started/submitted`, so a new
value is ignored by them; the one policy that reads the status is the ratings one (done).

1. `projects.status` check gets `'ended'`; new column `projects.ended_at timestamptz`.
2. `user_notifications_type_check` gets `project_ended` (the live list has 41 kinds, so 42).
3. `end_project(target_project uuid)`, security definer, granted to signed-in users, every rule above with plain error
   messages ("You can end a project that is more than 7 days late and was never sent.").
4. Spliced into the LIVE functions (same technique as PLAN-delays.md: an anchor that must occur exactly once, the md5 of
   the old text comes back when only my lines are removed, `create or replace` keeps the grants):
   - `job_state(uuid)`: the count of projects leaves out ended ones.
   - `notify_job_filled()`: same, otherwise the "Job post filled" notice of the replacement hire never fires (it
     tests `hired = freelancers_needed`).
   - `admin_job_hires()` (and `admin_job_trail()` if it counts hires, to be read in Step 1): "hired" leaves out ended
     ones; the list keeps the row with its status Ended.
   - `admin_transactions()`: one more count, Ended (small, optional).

## Website

- lib/projects.js: `projectStatuses.ended` (without it the My Projects list breaks on an unknown status), `endInfo()`
  (can I end it, and if not, why or from which day), selects add `ended_at` and `first_submitted_at`, `endProject()`.
- components/EndProjectCard.jsx (client only, on the project page under the late notice) and EndProjectDialog.jsx
  (the confirm window: ends it for both, can't be undone, the place on the job post opens again, and if you paid
  something it can't be returned here, report it). Hidden when it isn't allowed; "You can end it from November 12" when
  it is close.
- ProjectDetailsView.jsx: an Ended notice for both people with the date, the Status box and work box words (today any
  status that is not started says "See the submitted work below"), no late notice. PaymentsSection.jsx line 266 says
  "The rest is due 7 days after Done" for every project that is not Done, so it needs an Ended wording.
- ProjectsPanel and the calendar list: the Ended label, no due pill, not in the calendar's coming dates.
- Job post pages (PostNeedView.jsx line 34, JobDetailsView.jsx line 62): `hired:projects(count)` must not count ended
  ones; the list of hires marks them Ended.
- Admin HiredList.jsx and HiringTrail.jsx read `projectStatuses`, so they get the Ended label with it.
- lib/notifications.js: icon and button label for `project_ended`.
- Terms: one bullet in "Delays and reports"; PhilFreela-System-Functions.md: one row in the Delays table.
- The selects ask for a column that exists only after the migration, so the website is pushed only AFTER the
  migration is applied (same order as the notifications and the delay requests).

## Tests

- test_end_project.sql, rolled back on live and run again after applying: only the client may end it (the freelancer
  and an outsider are refused), only a Started project, never-sent rule (a project sent once is refused), 7 days is
  not enough and 8 is, the sent-log rule, a waiting request for more time blocks it and an accepted one moves the
  count, both notices, the post's place opens (`job_state` open again, another applicant can be hired, the filled
  notice comes for the replacement), a booked project (no job post) works, the late block stays, the daily job writes
  nothing for an ended project, payments stay readable, only `end_project` is callable.
- Mocked-network browser check: the client sees the button only when allowed and the reason when not, the window, both
  people see the Ended notice, the lists, the calendar and the job post count, phone and light mode, the Terms.

## Steps

1. Database (the file, the rolled-back test, then the user's typed "apply").
2. Website (committed and pushed after Step 1 is applied).
3. Terms, System Functions row and the admin Ended count.

## Decisions I need (the default is what I would build)

1. Who can end: **the client only**. A freelancer "Withdraw from the project" is not in this plan.
2. When: **never sent, more than 7 days late, no request for more time waiting**. (A freelancer who sent a draft once
   and vanished can't be ended this way, because the client could abuse it; that case is a report.)
3. The freelancer's profile: **no public "ended" mark and no new number** (the late block and the admin trail are the
   only traces).
4. A reason box: **none**; the facts (late, never sent) are the reason.

## Not in this plan (say so if you want one)

- An automatic ending with no client action, a freelancer Withdraw, a reason box, a public mark on the profile, ending
  after a draft was sent, a report that carries the project timeline (PLAN-delays.md C), booking expiry (B).
- To check while building: whether `create_booking` lets the client book the same freelancer again after an ended
  booked project (it should, like after any other end).

## As built (2026-11-11)

- Step 1, database: `database/supabase_end_project_schema.sql`, applied as migration `end_project` after the
  rolled-back trial (42/42) and the user's "apply". Proof: taking only my inserted text out of `job_state(uuid)`,
  `notify_job_filled()`, `admin_job_hires()` and `admin_job_hiring()` gives back their old md5 (4efd7ae8, f30e90a6,
  739f03f6, b1bd02d3). `admin_job_trail()` needed no change (it only shows the project's status). `admin_transactions()`
  and its admin card were NOT changed (the optional Ended count): an ended project is simply not in those numbers.
  `database/test_end_project.sql` ran again on the applied version, 42/42, rolled back, nothing left behind
  (no ZZ rows, no ended rows, the sent log and the email trigger as before).
- Step 2, website: lib/projects.js (`projectStatuses.ended`, `END_AFTER_DAYS`, `endInfo`, `endedDaysLate`, `endProject`,
  `getProject` also reads `first_submitted_at` and `ended_at`), EndProjectCard.jsx and EndProjectDialog.jsx, the
  Ended notice, work box and hidden price box in ProjectDetailsView.jsx, no balance / pay box / due line for an ended
  project in PaymentsSection.jsx (what was recorded stays listed), the calendar leaves ended projects out
  (ProjectsPanel.jsx), `hiredCount()` in lib/jobTerms.js leaves ended hires out of the list it counts, icon and
  button label for `project_ended` in lib/notifications.js. Browser check against the pretend backend: 74/74 (laptop,
  phone, light mode, both people, refusals, lists, helpers, Terms).
- Step 3: the Terms bullet "Ending a project that was never sent." in "Delays and reports", and a row in the Delays
  table of PhilFreela-System-Functions.md.
- Still the same afterwards: a freelancer "Withdraw", an automatic ending, a reason box, a public mark, ending after a
  draft was sent, a report that carries the project timeline, booking expiry.

## Round 2 (2026-11-11): the four things left out

The user said "build all" after the list of what was not built. Defaults chosen (change the numbers if you want other ones):

1. Reason box: optional, 3 to 300 characters, through the word filter (a second trigger, `projects_mask_end_reason`, same
   `mask_columns()`), saved in `projects.end_reason`, shown on the project page to both people. It is NOT in the notice text,
   because the notice is repeated in the email as the database wrote it.
2. Freelancer Withdraw: `withdraw_from_project(project, reason)`, any time while the project is Started (also late, also after
   a first sending that was sent back for changes). Submitted work waits for the client's review; Done and Ended are refused. A
   waiting request for more time is cancelled. If the client had recorded a payment, the notices say the freelancer must give
   it back directly and the client may report it as Scam / Fraud. The window says the same.
3. Automatic ending: `auto_end_projects()`, called by `send_daily_notices()` (one line spliced before `return sent;`). A Started
   project that was never sent: the morning it is 29 days late (or the first morning the job sees it later) both people get
   "Project will be ended tomorrow" (kind project_overdue, sent log kind `end_warn`); on a later morning, at 30 days or more, it
   is ended by the system. The 30 is only in SQL (`auto_end_days`) and in lib/projects.js `AUTO_END_DAYS`. A waiting request
   for more time is cancelled with it. A project sent once, or Submitted, is never touched.
4. Admin Ended count: `admin_transactions()` gets one more key, `ended`, and the Projects bar on the admin Transactions card
   shows Ended (a missing key counts 0, so the page also works before the SQL is applied).

New: `projects.ended_by` (client, freelancer or system; projects ended in round 1 are filled in as client), one internal
`end_project_row(project, who, note)` that all three ways use, `clean_end_note()`, and `end_project(project, reason)` now takes
the optional reason (the one-argument function is dropped; a call with only the project still works).

Files: database/supabase_end_project_more_schema.sql, database/test_end_project_more.sql (database/test_end_project.sql now
checks `end_project(uuid, text)`), client/src/lib/projects.js, EndProjectDialog.jsx (reason box), EndProjectCard.jsx (the
automatic ending line), WithdrawProjectCard.jsx, WithdrawProjectDialog.jsx, EndReasonBox.jsx, ProjectDetailsView.jsx (three
kinds of Ended notice, Withdraw for the freelancer), AdminOverviewView.jsx, the Terms bullet, the System Functions row.

Status when written: built and tested but NOT applied and NOT committed. The Supabase connector dropped (ENOTFOUND) before the
live trial, so the SQL was run on a standalone Postgres (PGlite) with stand-ins for the live tables and functions: schema applied
twice, both splices prove "my text only", the test file 48/48. The browser checks on the pretend backend: 74/74 (round 1, updated)
and 70/70 (round 2). Lint clean (2 old warnings), build OK.

To ship it (in this order): (1) run supabase_end_project_more_schema.sql + test_end_project_more.sql in ONE rolled-back
transaction on live and read the PASS list (the stand-in run is not the live database); (2) the user's typed "apply", apply as
migration `end_project_more`, prove the two splices (md5 with only my text removed: send_daily_notices and admin_transactions
must give back their md5 from just before), run test_end_project_more.sql and test_end_project.sql again, check no leftovers;
(3) commit with explicit paths and push the website. **The website must NOT go live before the migration**: getProject now asks
for `ended_by` and `end_reason`, so every project page would say "This project wasn't found" until the columns exist.

Round 2 APPLIED (2026-11-11) as migration `end_project_more`, after the user's "apply" and a live rolled-back trial. The
first trial was refused by the connector ("SQL execution was declined") because of the `drop function` line: the old
one-argument end_project is now RENAMED to end_project_round1_unused and locked (no one can call it) instead of dropped. The
second trial caught a real bug the stand-in run missed: the parameter "note" of end_project_row clashed with the column
projects.note ("column reference is ambiguous"); it is now `reason_text`. Then the trial passed 48/48, the migration was
applied, both splices were proved (only my text added: send_daily_notices and admin_transactions give back 4dfbc005 and
2195cfb0), test_end_project_more.sql passed 48/48 again and the round 1 checks 26/26, all rolled back, nothing left behind.
