# Admin accounts, names and switching: plan

Status (2026-10-08): all five parts are built, tested and pushed (part 5, switching, was the last).

Asked for by the user, in five parts. Each part is built, tested, committed and
pushed on its own, in the order below.

## Part 1. "Name" instead of "Full Name"

1. Change the label (and its error messages) to "Name" in:
   - Sign-up form: `pages/login/Login.jsx` ("Full Name must not exceed 100
     characters" becomes "Name must not exceed 100 characters").
   - `pages/login/CompleteProfile.jsx` (label and "Please enter your full name").
   - Admin pages: the table column in `AdminUsersView.jsx` and
     `AdminAdminsView.jsx`, the Add admin form label in `AdminAdminsView.jsx`,
     and `AdminSetup.jsx`.
2. Only wording changes. Nothing in the database changes.

## Part 2. Name and username cooldowns (freelancers and clients)

1. A person can change their **Name** once every **7 days** and their
   **username** once every **30 days**, counted from their last change. Their
   first change is always allowed. Signing up does not start a cooldown.
2. Database (new file `database/supabase_name_cooldown_schema.sql`, no DROP):
   - Add `name_changed_at` and `username_changed_at` (both empty at first) to
     `profiles`.
   - A "before update" trigger on `profiles`: if the name changed and the last
     change was under 7 days ago, refuse with "You can change your name again
     on <date>."; otherwise stamp `name_changed_at`. The same for the
     username with 30 days. The check is in the database, so editing the
     website can't skip it.
   - Super admins and the service role are not blocked (for fixing mistakes).
3. Website, in Settings:
   - The existing Display Name box is renamed **Name**. Under it: "You can
     change this again on <date>" and the Save button is off while locked.
   - A new **Username** box, same idea with 30 days. It checks for taken
     usernames and shows "That username is already taken." like sign-up does.
   - Both also update the sign-in's saved copy (the emails use it), like the
     name already does (`lib/profile.js`).
4. I will check before building that nothing else stores the username in a way
   that a change would break (the watermark settings and the delete-account
   confirmation read it live).

## Part 3. Admin profile page ("My Profile")

1. New page `/admin/profile`, opened from the admin's name in the top bar.
2. What goes on it (my recommendation):
   - Email (read only) and a "Super admin" or "Admin" badge.
   - **Name** (7 days) and **Username** (30 days), same cooldowns as users,
     enforced by the same kind of trigger on the `admins` table
     (`name_changed_at`, `username_changed_at`).
   - **Change password**: type the current password, then the new one, with
     the same strength rules. This reuses the Account Security form users
     already have, so it also gets "Sign out my other devices".
   - **Switch accounts** (Part 5).
3. Not on it: avatar, theme or appearance. Admins don't need them.
4. New file `database/supabase_admin_profile_schema.sql`: the two columns and
   the cooldown trigger on `admins`. Admins can already read their own row;
   they get permission to update only their name and username (not their role).

## Part 4. Admin "Forgot password"

1. New page `/admin/forgot-password`: type your email, get a reset link (the
   same Supabase email users get). The message never says whether the email is
   an admin's.
2. The admin sign-in page gets a **Forgot password?** link under the password
   box. A wrong password there still shows "Incorrect email or password" with
   the link beside it.
3. The reset link opens the existing `/reset-password` page. After the new
   password is saved, if the person is an admin they are sent to
   `/admin/login` (users still go to the user sign-in).
4. Wrong password on the **user** sign-in page: if the email belongs to an
   admin, send them to `/admin/login` (email filled in) with the message "That
   is an admin account. Sign in here, or use Forgot password." To know that,
   a new database function `is_admin_email(email)` answers yes or no, the same
   way `was_deleted_after_ban(email)` already does for deleted accounts.
   Trade-off: anyone can ask whether an email belongs to an admin. The admin
   page address is not secret in the code, and the reply is only yes or no, but
   if you'd rather not allow it, I can leave this one out and keep the link on
   the admin page only.
5. Database file: `database/supabase_admin_forgot_password_schema.sql` with
   `is_admin_email()` (callable by anyone signed out, yes/no only).

## Part 5. Switching between admin and user account

How it works for the admin:

1. Each admin links one real freelancer or client account of theirs (they need
   a separate email for it, because one login can't be both). On My Profile
   they click **Link my user account** and type that account's email and
   password once. That account is checked, then the two are linked.
2. After that, in the admin panel's top bar: **Switch to my user account**.
   In the user's dashboard menu: **Switch to admin**. The button shows only for
   a linked account; nobody else ever sees it. One click, no password.
3. **Unlink** is on My Profile.

How it is built (and kept safe):

1. New table `admin_user_links` (admin id, user id, both unique) in
   `database/supabase_admin_switch_schema.sql`. Nobody can write to it from the
   browser. Two database functions do it:
   - `make_admin_link_code()`: callable only by an admin; returns a one-time
     code that works for 10 minutes.
   - `claim_admin_link(code)`: callable by the user account; checks the code,
     that the account has a profile and isn't an admin, then saves the link.
   So the link only exists if the same person proved both accounts.
2. `my_admin_link()` tells the signed-in person whether they are linked, and
   to what (yes/no and an id, nothing else).
3. Switching: the site keeps the *other* account's sign-in in this browser
   (local storage, like the current one already is). Switching swaps the two
   and goes to the right dashboard. If the saved one is missing (a new browser
   or cleared data), the button asks for that account's password once.
4. Signing out of one account does not sign out of the other.
5. The admin activity log gets a line when an admin links or unlinks.

## Build order and testing

1. Part 1 (labels). Build check.
2. Part 2: SQL file, tested with a rolled-back block on live; then Settings.
   Browser test with a fake backend (locked, unlocked, taken username).
3. Part 3: admin profile page and its SQL.
4. Part 4: forgot password pages and `is_admin_email`.
5. Part 5: switching.
6. After each: build, lint, commit, push.

## Open questions

1. Part 4 item 4 (the yes/no "is this an admin email" answer): keep it, or
   leave it out?
2. Admin cooldowns: same 7 and 30 days as users, as written?
3. Switching: is "link once per browser" fine, or should an admin be able to
   switch on any browser with just a password prompt?
