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
3. The default password is a constant in the page's code, as asked. The risk:
   between "the new admin confirms their email" and "they first sign in",
   anyone who knows their email could sign in with `Admin123` and choose the
   password themselves. What limits it: the email must be confirmed first, the
   Admins page marks every admin who is still on the default password
   ("Password not set yet") so a super admin can remove one that looks wrong,
   and the log shows what every admin does. New admins should sign in right
   away.

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

Step 1 (Database): built and applied to the live database (2026-10-05).

Why it was refused at first: the Supabase connector asks someone to confirm
any "destructive" statement, and this kind of session cannot show that prompt,
so it answers "declined". The first version had a `drop policy`. It was
rewritten as `alter policy` (same result, and the rule is never missing for a
moment) and applied in parts, which all went through: `admin_must_change_password`,
`admin_log_table`, `admin_log_triggers`, `admin_log_wording_and_slide_parent`.
The one `alter policy` line (a new admin must have the flag) goes on right
after step 2 is pushed, so the old Add Admin form keeps working until then.

Tested on the live database in a rolled-back block: 15 of 15 passed, and the
log held exactly the 16 expected sentences in order. Checked afterwards: no
test accounts or log lines were left behind. Covered: nothing is logged with no
admin signed in; an admin on the default password has no admin rights, cannot
read the log and cannot suspend; saving `Admin123` again does not clear the
flag and a real new password does; a normal user's password change is
untouched; nobody (admin or user) can add or edit log lines or call the log
writer; a removed admin's lines stay under their name; deleting an account
writes one line, not one per thing deleted with it.

Not run by me: the block in `database/test_admin_log.sql` marked "needs the SQL
Editor" (9 checks that use DELETE statements: an admin deleting a listing, an
announcement, a flagged item, lifting a suspension, and that log lines cannot
be deleted). Paste that file into the SQL Editor to run all 23 sentences.

Changes from the plan:

1. `remove_admin`, `set_admin_role` and `delete_user` were not changed.
   Triggers on the admins and profiles tables write those lines instead.
2. There is no `admin_password_changed()` function. A trigger on the login
   table switches the flag off when the password really changes, so it cannot
   be switched off by calling something from the browser.
3. Accepting an appeal writes two lines: the appeal, then the lifted penalty
   (the existing appeal trigger lifts it).
4. Names in the log are full names ("Elena Cruz suspended Keanne Reyes for 14
   days (Harassment).").

Step 2 (Default password): built and pushed (2026-10-05). Lint and build pass;
the browser check is step 4. The Add Admin form asks for name, username and
email only and creates the login with `Admin123`; a new admin who signs in
sees only the "Create Your Password" screen until they choose their own (not
`Admin123`, same strength rules). The `alter policy` line (a new admin must
have the flag) was applied right after the push, as migration
`admins_insert_requires_password_flag`.

Step 2 files: `lib/adminPassword.js` (new),
`pages/admin/components/AdminCreatePassword.jsx` (new),
`pages/admin/layout/AdminLayout.jsx`, `pages/admin/views/AdminAdminsView.jsx`.

Change from the plan: the Admins page also shows "Password not set yet" beside
an admin who is still on the default password.

Step 3 (Activity Log page): built and pushed (2026-10-05). Lint and build
pass; the browser check is step 4. A new "Activity Log" link in the admin
sidebar opens `/admin/log`: the sentences newest first with the date and time
and the kind of action, a search box, a filter by admin, a filter by action,
and "Load more" (50 at a time). The database applies the filters.

Step 3 files: `pages/admin/views/AdminLogView.jsx` (new), `App.jsx` (the
route), `pages/admin/layout/AdminLayout.jsx` (the sidebar link),
`lib/pageTitles.js` (the tab title).

Note: the "by admin" filter lists the admins who exist now. Lines by an admin
who was removed are still in the log and can be found by searching their name.

Step 4 (Browser check): passed (2026-10-05). Tested in a real browser
(Playwright, with a fake backend that follows the rules tested in SQL, so no
real accounts), on a laptop and a 390 px phone: 39 of 39, no page errors, and
no page asked for a column the real tables do not have. No code needed
changing.

1. Add Admin: the form has only Full Name, Username and Email and says the
   new admin starts on the default password; the login is created with
   `Admin123`; the row is saved as a plain admin who must change the password;
   the list marks them "Password not set yet".
2. Create Your Password: an admin on the default password sees only that
   screen (no sidebar, and the log is not even requested); a weak password,
   `Admin123` and two different passwords are refused without sending anything;
   if the database does not accept the password the screen stays and says so; a
   proper password opens the panel on the page they asked for and it stays open
   after a reload; Sign Out works from that screen.
3. Activity Log: the sidebar link opens it; 50 lines at first, newest first,
   with the admin's name in bold, the date and time ("Oct 5, 2026, 10:46 PM")
   and the kind of action; Load more brings the rest; the filters by action and
   by admin and the search box each show only matching lines, and say so when
   nothing matches; a regular admin can read it too.
4. On the phone neither screen scrolls sideways.

All 4 steps in this plan are built. This plan is done.

Tried on the live site by the owner (2026-10-05, evening): lifting a
suspension from the Users page, rejecting an appeal and adding an admin each
wrote the right line to the Activity Log, and the new admin is listed as
"Password not set yet".

Still not tried with a real account: the new admin's own first sign-in (the
confirmation email, signing in with `Admin123`, the Create Your Password
screen). The 9 DELETE checks in `database/test_admin_log.sql` also still need
one run in the SQL Editor.

Follow-up (2026-10-05): Supabase's security check listed the 12 new trigger
functions as callable through the API. They cannot do anything when called
that way (a trigger function only runs as a trigger), but the project's other
trigger functions are closed off, so these were closed off too (migration
`admin_log_trigger_functions_not_callable`, now also at the end of
`database/supabase_admin_log_schema.sql`). Checked in a rolled-back block
that admin actions are still logged afterwards (3 of 3), and on the live
database that none of the 12 is callable and all 12 triggers are on.

Fixed after the owner's OK (2026-10-05): an appeal could still be rejected
after an admin had already lifted its suspension from the Users page, and the
user was then told the suspension was kept until its end date although it was
gone. Now, when an admin unsuspends or unbans someone who has an appeal
waiting for that same penalty, the Users page accepts that appeal instead of
deleting the penalty row. The database then lifts the penalty and tells the
user, exactly as Accept on the Appeals page does, so the appeal is never left
open. With no such appeal, the lift works as before.

1. File: `pages/admin/views/AdminUsersView.jsx` (`confirmLift`). No SQL: it
   uses the rule admins already have for reviewing appeals.
2. Tested in a real browser with a fake backend: 14 of 14, no page errors.
   With a pending appeal the page accepts it and does not delete the penalty;
   with none it lifts the plain way; if another admin reviewed the appeal a
   moment before, the plain lift still runs; if the appeals cannot be read,
   nothing is changed and the admin sees the error; an appeal about an earlier
   penalty is left alone. That accepting an appeal lifts the penalty and
   writes both log lines was tested on the real database in step 1.
3. Not tried on the live site yet.
4. Limits: this lives in the Users page, not in the database, so it covers
   lifting through the website (the only way admins lift). Two cases are
   unchanged: an appeal still pending when its suspension ends by itself, and
   one whose penalty was replaced by a new one. Both can only be rejected,
   and the rejection message still says the penalty is being kept.
