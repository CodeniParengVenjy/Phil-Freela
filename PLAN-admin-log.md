# Admin default password and Activity Log: plan and progress

Last updated: 2026-10-05. To continue in a new Claude session, say:
"Read PLAN-admin-log.md and continue from the current step."

Two requests from the owner, both on top of the super admin feature
(PLAN-super-admin.md, built and live).

## What it builds

### A. Default password for new admins

1. The super admin no longer types a password. The Add Admin form asks for
   Full Name, Username and Email only.
2. The new admin's login is created with the default password `Admin123`.
3. The first time they sign in, the Admin Panel shows only a "Create your
   password" screen. They must choose their own (same strength rules as
   everywhere else, and not `Admin123`). Nothing else in the panel opens until
   they do.
4. This is enforced in the database, not only on the page: while the flag
   `must_change_password` is on, `is_admin()` and `is_super_admin()` answer
   "no", so the admin's database rights stay off even if they skip the screen.
5. Only the first admin (made on the setup page) and admins who already exist
   are unaffected. They chose their own passwords.

### B. Activity Log (a new Admin Panel page)

A page that lists, newest first, what each admin did, as a plain sentence with
the date and time:

1. "Elena suspended Keanne for 7 days (Harassment)." · Oct 5, 2026, 3:42 PM
2. "Elena banned Keanne permanently (Scam)."
3. "Elena lifted the ban on Keanne." / "Elena ended Keanne's suspension."
4. "Elena resolved a report against Keanne." / "Elena dismissed a report ..."
5. "Elena approved Keanne's ID verification." / "... rejected ..."
6. "Elena accepted Keanne's appeal." / "... rejected ..."
7. "Elena posted the announcement "Maintenance tonight"." / "... deleted ..."
8. "Elena removed a flagged photo by Keanne." / "... kept ..."
9. "Elena deleted the listing "Logo design" by Keanne."
10. "Elena added Mark as an admin." / "removed" / "promoted ... to super
    admin" / "demoted ..."
11. "Elena permanently deleted Keanne's account."

The page has a search box, a filter by admin and a filter by kind of action,
and "Load more" (50 at a time).

## How the log is written (so it can't be skipped or faked)

1. A new table `admin_log` (admin id, admin name, kind of action, the sentence,
   the target's id, created_at). The sentence and both names are saved as text
   at the moment it happens, so the log still reads correctly after someone is
   renamed, removed or deleted.
2. The rows are written by database triggers on the tables the admin pages
   change (suspensions, reports, verifications, appeals, announcements,
   flagged content, listings, admins), and by `remove_admin`, `set_admin_role`
   and `delete_user`. A trigger only logs when the signed-in person is an
   admin, so a user's own actions are never logged.
3. Nobody can insert, edit or delete log rows from the browser. Admins can only
   read them. That makes it a permanent record.

## Defaults picked (the owner can change these)

1. Every admin can read the log (transparency). A "super admin only" log is a
   one-line change.
2. The log starts empty. Nothing that happened before it was built is
   recorded.
3. The default password is a constant in the page's code, as asked. The risk is
   the short window between "super admin adds them" and "they first sign in".
   Point 4 above is what keeps that window safe.

## Not included

1. A "reset to default password" button for an admin who forgot their
   password (they can use the normal forgot-password link). Can be added.
2. Logging reads (who looked at what). Only changes are logged.
3. Exporting the log to CSV.

## Steps (SQL is applied to the live database and tested before the page that
uses it is pushed)

1. **Database (Medium):** `database/supabase_admin_log_schema.sql`:
   `admins.must_change_password`, the stricter `is_admin()` / `is_super_admin()`,
   `admin_password_changed()`, the `admin_log` table, the triggers, and the
   updated `remove_admin` / `set_admin_role` / `delete_user`. Applied to the
   live project and tested in rolled-back SQL blocks
   (`database/test_admin_log.sql`).
2. **Default password (Easy):** `views/AdminAdminsView.jsx` (no password field,
   creates the login with `Admin123`, inserts with the flag on),
   `layout/AdminLayout.jsx` (shows the new `components/AdminCreatePassword.jsx`
   screen while the flag is on).
3. **Activity Log page (Easy):** `views/AdminLogView.jsx`, a route in
   `App.jsx` and an "Activity Log" link in the sidebar.
4. **Browser check (Easy):** Playwright with the fake backend, laptop and
   phone: the form has no password field, a flagged admin only sees the
   password screen and can't reuse `Admin123`, the log lists sentences with
   dates and the filters work.

## What the owner does outside the code

Nothing, as long as the Supabase connection works. Otherwise paste the SQL file
into the Supabase SQL Editor.

## Current step

Plan approved by the owner on 2026-10-05 ("ok").

Step 1 (Database): the file `database/supabase_admin_log_schema.sql` is
written. Applying it through the Supabase connector was declined by the
permission check (same as `delete_my_account` earlier), so it is NOT yet on the
live database. The owner pastes the file into the Supabase SQL Editor and runs
it; then the rolled-back tests (`database/test_admin_log.sql`) are written and
run. The client steps (2 and 3) wait for this, because the Add Admin form would
fail against a database without the new column.
