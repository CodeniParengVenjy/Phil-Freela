# Admin Archives: plan and progress

Status (2026-10-21): website built and tested; database half applied to the live
project, half waiting for you to paste ONE file into the SQL Editor (see "What is
left"). To continue in a new Claude session, say: "Read PLAN-admin-archives.md and
continue from the current step."

## Why

The user asked: instead of deleting an account directly in the admin, what if the
account goes to the archives? Before, the red Delete button on Admin > Users erased
the login and everything in the account for good, with no way back.

## What people see

1. Admin > Users: the red **Delete** button is now **Archive**. A super admin
   archives straight away (pop-up, then "Archive account"). A regular admin gets a
   pop-up with "Send for approval", and the request waits on the Approvals page like
   a Ban does. While a request waits, that row shows "Waiting for a super admin:
   Archive" and has no Suspend, Ban or Archive button.
2. Admin > **Archives** (new, in the sidebar for every admin): a table of archived
   accounts with ID (PF number), name, username, e-mail, role, the archive date, who
   archived it and "Deleted on <date>". A search box (name, username, e-mail, PF
   number). **Restore** for every admin; **Delete forever** for super admins only,
   with the same "cannot be undone" warning the old Delete had.
3. Approvals: an archive request shows as "Archive: Ben Bato (@ben)". Approving
   archives the account; the pop-up says nothing is deleted and it can be restored.
4. The archived person: after logging in (or when already logged in) they land on
   an "Account archived" page: it says an admin archived the account, nothing has
   been deleted yet, the day it will be deleted for good, and has a Sign out button.
   They can't use anything else.
5. Everyone else: the archived person's listings are hidden, they don't show in
   people search, they can't post, apply, review, report or chat. The Users list and
   the Overview numbers leave them out. Admin > Listings still shows their listings,
   with an "Archived" badge.
6. Activity Log: "archived X's account", "restored X's account", "permanently
   deleted X's account", and the request lines ("asked to archive X (waiting for a
   super admin)", "approved ...'s request to archive X").

## How it works (defaults I chose, the user said "ok" to them)

- Deleting for good always takes two steps: `delete_user()` now refuses an account
  that isn't archived ("Archive the account first.").
- An archived account is deleted automatically **100 days** after it was archived
  (same as bans; one number to explain). A daily job does it at 12:05 AM Philippine
  time. Restoring stops the clock; archiving again starts a new one. The number is
  `ARCHIVE_DELETE_DAYS` in `client/src/lib/archives.js` and `interval '100 days'` in
  `delete_expired_archives()`.
- Archiving is super admin only; a regular admin sends a request (kind `archive` in
  `admin_requests`). Restoring is open to every admin, like lifting a ban.
- The user's own "Delete my account" in Settings is unchanged: someone who asks to be
  erased is still erased (the privacy feature's right to removal).
- An archived account's e-mail stays taken until it is deleted; then it can sign up
  again as a new account.
- Admin accounts can't be archived ("Admins are removed from the Admins page").
- A banned account that is also archived is still deleted when its 100-day ban runs
  out (the ban said so). Restoring brings back the ban, not a clean account.

## Database

Files: `database/supabase_archives_schema.sql` (everything, the record of what was
run) and `database/supabase_archives_finish.sql` (only the pieces the Supabase
connector refuses because they contain a DELETE statement).

1. `archived_users` (user_id, archived_by, archived_at). Browsers can only read it:
   admins read all rows, a person reads their own (for the "archived" page). Rows are
   added and removed only by the functions below.
2. `is_suspended()`, `is_posting_blocked()` and `is_messaging_blocked()` also say yes
   for an archived account. Every rule that already used them (listings, posting,
   applying, portfolio, reviews, reports, chat, calls, bookings, people search)
   follows with no change to those rules.
3. `archive_user(target_id)` (super admin; refuses admins; asking twice is harmless),
   `restore_user(target_id)` (any admin), `delete_user(target_id)` (changed, see
   above).
4. `admin_list_users()` leaves archived accounts out; new `admin_list_archived()`
   (admins only) returns them with e-mail, PF number and who archived them;
   `admin_stats()` counts only accounts that aren't archived.
5. `delete_expired_archives()` and the pg_cron job `delete-expired-archives`.
6. `admin_requests` accepts kind `archive`; `admin_log` accepts `user_archive` and
   `user_restore`; `log_request_phrase()` / `log_request_change()` know the new kind;
   trigger `archived_users_log` writes the archive and restore lines (and skips the
   restore line when the whole account is being deleted, like the ban lines do).

Applied to the live project on 2026-10-21 through the connector: part 1 (everything
with no DELETE statement: the table, the three blocked functions, `archive_user`, the
lists and stats, the request log functions) and part 3 (the three lists of kinds).

## What is left

**Run `database/supabase_archives_finish.sql` once in the Supabase SQL Editor.** It
has `restore_user`, the new `delete_user`, `delete_expired_archives` (+ the daily
job) and the log trigger. Until then: Restore gives an error, Delete forever still
works but skips the "archive first" rule, there is no daily clean-up, and archive /
restore lines don't reach the Activity Log. Then run `database/test_archives.sql`
(all of it) in the SQL Editor; it rolls itself back. The older
`test_super_admin.sql` and `test_admin_log.sql` were updated for the two-step delete
and need the finish file too.

## Files

New: `database/supabase_archives_schema.sql`, `database/supabase_archives_finish.sql`,
`database/test_archives.sql`, `client/src/lib/archives.js`,
`client/src/pages/admin/views/AdminArchivesView.jsx`,
`client/src/pages/archived/ArchivedPage.jsx`.

Changed: `AdminUsersView.jsx` (Delete became Archive; requests include archive),
`AdminApprovalsView.jsx`, `AdminListingsView.jsx` (Archived badge),
`AdminLogView.jsx` (two new kinds), `AdminLayout.jsx` (sidebar link), `App.jsx`
(routes `/admin/archives` and `/archived`), `lib/pageTitles.js`,
`lib/adminRequests.js`, `lib/suspensions.js` (Archived badge), `lib/profile.js`
(login sends an archived account to `/archived`), `useDashboardShell.js` (same for
someone already logged in), `admin.css` (orange icon circle), Terms of Service and
Privacy Policy (one sentence each about archiving), `test_super_admin.sql`,
`test_admin_log.sql`.

## Tests

- Database, part 1 (rolled back, run through the connector): 23 checks passed on
  2026-10-21 (who can archive; nobody writes the table directly; blocked functions;
  people search and job-post visibility; own row readable, others' not; Users list,
  Archives list and Overview total). Requests: 5 more passed (one open request per
  person, must name a person, request and approval logged under `user_archive`).
- Database, the rest (restore, delete rules, the 100-day job, delete/restore log
  lines): written in `test_archives.sql`, waiting for the finish file.
- Browser, against a fake backend (laptop 1280 wide in Manila time, phone 390 wide):
  58 checks passed (super admin and regular admin flows, Archives page, search,
  restore, delete forever, errors, Approvals approve/decline, the archived person's
  page and sign out, a normal account sent on to its dashboard, the Archived badge
  on Listings, no sideways scrolling on the phone, pop-up fits the screen).
- Lint and build clean.
