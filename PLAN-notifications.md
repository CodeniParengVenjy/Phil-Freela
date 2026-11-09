# Plan: Notifications (new applicant, job post closed, due reminders, overdue notices, read/unread, clearer wording)

Written 2026-11-10 by the "best fit applicants" session for the other session to build.
Source: the user's revision list of 2026-11-09 ("notification", "reminder system for due
projects and freelancers and client sa notif"). The user picked ALL of these:
new applicant, job post closed notice, read/unread per item, fix wording of existing,
and "Notices (like overdue project delayed)".

Not in this plan (the user said "later"): Terms and Conditions, dashboard text.
Built by the other session at the same time: applicant counts + best fit applicants
(see "Working next to the best-fit session" at the end).

## Before building

1. Show the user this plan in short numbered steps and wait for their "ok"
   (memory: feature-planning-workflow). Each step still gets its exact files listed first.
2. Every migration needs the user's typed go before it is applied to live
   (a rolled-back SQL test first, see memory testing-on-live-supabase).
3. Step N6 (wording) starts with a LIST for the user to approve. No text changes before that.
4. Right before each step: `git log --oneline -5`, `git status --short`, re-read the file.

## What exists today (checked 2026-11-10)

- `user_notifications` (database/supabase_admin_schema.sql:787) holds one user's items: type, title,
  message, link. Users can only SELECT their own; rows are written by security-definer
  database functions. It is in the realtime publication (the bell updates live).
- `user_notifications.type` has a CHECK constraint (`user_notifications_type_check`) that was
  re-created in many files. Read the LIVE one before adding types:
  `select pg_get_constraintdef(oid) from pg_constraint where conname = 'user_notifications_type_check';`
- Unread = newer than `profiles.notifications_seen_at`. Opening the Notifications page or the bell
  marks EVERYTHING read (`markNotificationsSeen` in client/src/lib/notifications.js, called from
  NotificationsView.jsx:49 and TopNavNotifications.jsx:62). Announcements (admin, to everyone)
  count the same way.
- Icons and button labels per type: `notificationIcons` and `notificationLinkLabels` in
  client/src/lib/notifications.js.
- EVERY row added to user_notifications is also emailed to an offline user
  (`email_offline_on_notification`, database/supabase_email_notifications_schema.sql, no rate limit),
  unless they turned off Settings > "Email me when I'm offline".
- A client is NOT notified in the app when a freelancer applies. Only an email goes out when they
  are offline (`email_offline_on_application`, at most one per job every 30 minutes).
- Projects: `projects.due_date date not null`, status `started` -> `submitted` -> `done`.
  "Overdue" today is only red text "(overdue)": ProjectsPanel.jsx:78, ProjectDetailsView.jsx:321,
  DueDateCalendar.jsx:140. Nothing reminds anyone.
- Job posts: open / filled / expired is worked out by `job_state()` (never stored); filled =
  hired projects >= `freelancers_needed`; expired = due date passed (Manila midnight).
  Nobody is told when their post fills or expires.
- pg_cron (Supabase's scheduler) is on. Times are UTC: 8:00 AM Manila = `'0 0 * * *'`.
  Existing jobs: delete-expired-bans, delete-expired-archives, finish-stale-calls.

## Steps

### N1. New applicant notification (client)

- What the client sees: "New applicant: Juan Dela Cruz applied to your job "Logo for my shop"."
  Button "View applicants".
- Database: trigger `after insert on job_applications` -> one user_notifications row,
  type `application_new`, link `/dashboard/projects?job=<job id>` (the best-fit session makes the
  Applications box open that job when `?job=` is in the address).
- Emails: the old throttled application email stays. Make `email_offline_on_notification` SKIP
  type `application_new`, or a busy post sends one email per applicant.
- Files: database/supabase_notifications_more_schema.sql (new, Section 1), test_notifications_more.sql,
  client/src/lib/notifications.js (icon `bi-person-plus-fill`, label "View applicants").

### N2. Job post filled (client)

- "Your job post "Logo for my shop" is filled: you hired the 2 freelancers it needed. It no longer
  shows on Find Jobs." Button "View post".
- Database: trigger `after insert on projects` when `job_post_id` is not null and the hired count
  becomes EQUAL to `freelancers_needed` (equal, so it fires once; reopening with a higher number
  and filling again fires again). Type `job_filled`, link `/dashboard/job-details/<id>`.

### N3. Job post expired (client)

- "Your job post "Logo for my shop" closed because its due date passed. Edit it to reopen it."
  Button "View post".
- Database: the daily job (N4) also finds posts that are `expired` (not filled) and sends
  type `job_expired` once per post and due date (sent log below). Editing the dates and
  expiring again sends a new one.

### N4. Due-date reminders and overdue notices (freelancer and client)

- Daily job at 8:00 AM Manila: `select public.send_due_reminders()`.
- A small sent log so nothing is sent twice:
  `scheduled_notices (kind text, target_id uuid, due_date date, sent_at timestamptz default now(),
  primary key (kind, target_id, due_date))`. RLS on, no policies (only the functions use it).
  `due_date` is in the key, so a project or post with a new date gets fresh reminders.
- Use ranges + the log (not exact days), so a skipped day still sends:

  | kind | when (days left = due_date - Manila today) | started project | submitted project |
  |---|---|---|---|
  | due_3 | 2 or 3 days left | freelancer + client | nobody |
  | due_1 | 1 day left | freelancer + client | nobody |
  | due_0 | due today | freelancer + client | client: "Juan's work is waiting for your review" |
  | overdue_1 | 1+ days late | freelancer + client | nobody (work was delivered) |
  | overdue_7 | 7+ days late | freelancer + client | nobody |

  Done projects get nothing.
- Example text (final wording goes through N6):
  freelancer "Logo for my shop is due in 3 days (November 13). Submit your work on the project page.";
  client "Logo for my shop is due in 3 days. Juan is working on it.";
  overdue freelancer "Logo for my shop is 1 day late. Submit your work or message the client.";
  overdue client "Logo for my shop is 1 day late. Message Juan or agree on a new date."
- Types: `project_due_soon`, `project_due_today`, `project_overdue`, `project_review_reminder`;
  link `/dashboard/project-details/<id>`, label "Open project".
- On screen ("Notices"): replace "(overdue)" with a red pill "Overdue: 2 days late" in
  ProjectsPanel.jsx, ProjectDetailsView.jsx and DueDateCalendar.jsx, and a small red notice at the top
  of an overdue project's page (freelancer: "This project is 2 days late. Submit your work or message
  the client."; client: "This project is 2 days late. Message the freelancer or agree on a new date.").
  Optional soft label "Due today" / "Due in 3 days" in yellow. Check light mode and the accent color
  (memory dashboard-themes); use Bootstrap color classes.
- These ARE emailed to offline users through the existing trigger: fine, that is the point of a reminder.

### N5. Read/unread per item

- What users see: each unread item has a dot and bold title. Opening one (the pop-up,
  NotificationDialog.jsx) marks only that one read. A "Mark all as read" button clears all.
  Opening the list no longer marks everything read.
- Database: `user_notifications.read_at timestamptz`; `announcement_reads (user_id, announcement_id,
  read_at, primary key (user_id, announcement_id))` (check the announcements id type); a security-definer
  function `mark_notification_read(kind text, item_id ...)` that only touches the caller's own item;
  keep `notifications_seen_at` as "everything before this is read" (so old items stay read), and
  "Mark all as read" moves it forward (the existing `markNotificationsSeen`, now only on the button).
  Unread = newer than notifications_seen_at AND read_at is null / no announcement_reads row.
- Files: client/src/lib/notifications.js (`countUnreadNotifications`, new `markNotificationRead`),
  NotificationsView.jsx, TopNavNotifications.jsx, NotificationDialog.jsx.

### N6. Clearer wording of the existing notifications

1. Collect every current title and message from the LIVE function bodies (functions were redefined
   across many files, so the live one is the truth):
   `select p.proname, pg_get_functiondef(p.oid) from pg_proc p where pg_get_functiondef(p.oid) ilike '%insert into public.user_notifications%';`
2. Give the user a list: type, who gets it, current text, proposed text. Short, plain, says what to do
   next, names the project or post. Wait for their approval.
3. One migration that re-creates those functions with ONLY the string literals changed (diff each
   against `pg_get_functiondef` before applying).
4. Include the still-unapplied Section 4 of database/supabase_rating_after_payment_schema.sql
   (migration `rating_after_payment_notice`, "A rating is waiting for you") in this list.

## Order and tests

N1 -> N2 + N3 -> N4 -> N5 -> N6. For each: schema file in database/, a rolled-back test file
(`begin; ... rollback;` with numbered checks, like test_rating_after_payment.sql), website changes,
`vite build` + lint, commit with explicit paths, push, then ask for the go to apply the migration.
For N4, test `send_due_reminders()` by inserting projects with due dates relative to today inside the
rolled-back test and calling the function twice (the second call must add nothing).

## Working next to the best-fit session

The best-fit session (applicant counts + best fit applicants) is changing at the same time:
client/src/pages/dashboard/components/ApplicationsPanel.jsx (job picker, `?job=<id>` support),
FindJobsView.jsx and JobDetailsView.jsx (the "12 applied" count), client/src/lib/aiService.js,
ai-service/best_fit.py + main.py, and a new database/supabase_best_fit_schema.sql. Don't edit those
files; if N1 needs something there, send that session a message (ListAgents, SendMessage).

## Progress

- 2026-11-10: the user approved the plan with "ok", and added to N1: "if someone applies, it notifies
  and it counts, to inform there is someone applied". So N1 also has a "new applicants" count.
- N1 built and LIVE: website pushed (719ccbf); database applied 2026-11-10 after the user's "go go go"
  (migration `notifications_new_applicant`), then test_notifications_more.sql 15/15 against the live rule
  (rolled back, nothing left), and the API refuses mark_applicants_seen for signed-out visitors (401).
  - Database (supabase_notifications_more_schema.sql, Section 1): notification type `application_new`;
    `job_applications.seen_at` (empty = new; old applications count as seen); `mark_applicants_seen(job)`
    (only the post's owner; no job = all their posts); trigger `notify_new_applicant`;
    `email_offline_on_notification` skips `application_new` (the throttled application email stays).
    Rolled-back trial on live: test_notifications_more.sql 15/15, nothing left behind.
  - Website: bell icon + "View applicants"; a live number on "Projects & Resumes" (clients);
    "3 new" on each post in Post a Project; in Applications & Resumes a "New" tag per applicant,
    "N new" in the post picker, and opening a post marks its applicants seen (the number goes down,
    the tags stay for that visit). Mocked-network check 25/25 (dark, light, light + yellow accent).
    ApplicationsPanel.jsx was edited after the best-fit session's commit ac4ff16, as agreed with it.
  - Until the SQL is applied the new requests fail quietly: no number, no tags, nothing breaks.
- N2 + N3 LIVE: Section 2 applied 2026-11-10 after the user's "go go go dont wait for me" (migration
  `notifications_job_filled_expired`), 14/14 again on live; the sent log has the 4 posts that were already
  expired; pg_cron `daily-notices` is active.
- N4 LIVE (the user: "dont wait for me", and no answer on the two late projects, so the suggested default:
  they DO get a late notice): Section 3 applied (migration `notifications_due_reminders`), trial 10/10 and
  10/10 again on live. `send_daily_notices()` now also sends due_3 (3 or 2 days left), due_1, due_0, and
  for submitted work due today a review reminder to the client; late: overdue_1 (1 to 6 days) and overdue_7
  (7+), non-overlapping, so one notice a day at most. Project due dates can't be changed, so the client's
  late notice says "Message <freelancer> to ask about it." (not "agree on a new date"). On 2026-11-10 one
  real Started project was 6 days late: the first run (11-11, 8:00 AM) sends it "7 days late" to both.
  Website: red "Overdue: 2 days late" / yellow "Due today", "Due tomorrow", "Due in 3 days" pill
  (components/DueBadge.jsx, lib/projects.js dueInfo) on My Projects, the calendar list and the project
  page, a red notice at the top of a late project's page, bell icons. Only STARTED projects count as late
  now (submitted work was delivered), on screen too: the old "(overdue)" also showed on submitted ones.
  Mocked check 14/14 (client + freelancer, dark + light).
- N2 + N3 built (website pushed, database Section 2 then waited for the user's go):
  - Database (Section 2): types `job_filled`, `job_expired`; trigger `notify_job_filled` after insert on
    projects (fires when hired = freelancers_needed); table `scheduled_notices` (the sent log, RLS on, no
    policies; when it is first made the posts ALREADY expired are written in as told, so the first run sends
    no old news: 4 posts on 2026-11-10); `send_daily_notices()` (named so because N4 adds the reminders to
    the same function; the plan called it send_due_reminders); pg_cron job `daily-notices` at `0 0 * * *`
    (8:00 AM Manila). Rolled-back trial on live: Section 2 test 14/14, nothing left behind.
  - Website: bell icons + "View post" for both (client/src/lib/notifications.js).
- Found while testing (not part of this plan): Supabase Vault on live is EMPTY (no `email_function_url`,
  no `email_hook_secret`), and `email_log` has no rows, so "Email me when I'm offline" has never sent
  an email. Told the user.
