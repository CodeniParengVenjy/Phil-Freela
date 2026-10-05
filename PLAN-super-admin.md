# Super admin: plan

Status (2026-10-05): approved ("continue"). Step 1 done: the SQL
(database/supabase_super_admin_schema.sql) is applied to the live database and
database/test_super_admin.sql passed 19/19 (rolled back, nothing left behind).
Step 2 done (admin setup, layout, Admins page). Step 3 (Users page delete
button) and step 4 (browser check) are next.

Change from the plan below: the separate "last super admin" guards were left
out. Nobody can remove or re-role themselves, and only a super admin can call
those functions, so one super admin always remains.
Asked for by the adviser (2026-10-03). The capstone paper does not define the
role, so the split below is a proposal to check with the adviser.

Today every admin is equal: the `admins` table has no role, and any admin can
add or remove other admins. Day-to-day moderation (reports, verifications,
appeals, flagged content, listings, suspensions, announcements) stays open to
every admin and is not touched by this plan.

## What a super admin can do that a regular admin cannot (first version)

1. Add a new admin account.
2. Remove an admin account.
3. Promote an admin to super admin, and demote one back.
4. Permanently delete a user's account. Regular admins can still suspend or
   ban. (The database function `delete_user` already exists but no button
   uses it today; bans are deleted automatically after 100 days.)

## Not in the first version (new features, would each need their own plan)

- Admin activity log (who suspended, approved or deleted what).
- Overturning another admin's decision.
- Handling data privacy requests (RA 10173).

## Database (new file: database/supabase_super_admin_schema.sql)

1. Add a column to `admins`: `role` text, not null, default `'admin'`,
   allowed values `'admin'` and `'super_admin'`.
2. Make the existing first admin a super admin (the oldest `admins` row), so
   nobody is locked out.
3. New function `is_super_admin()`: same pattern as `is_admin()` (security
   definer, stable), true when the caller's `admins.role` is `'super_admin'`.
4. Change the rule "admins can add admins" so only a super admin can insert,
   and the new row's role must be `'admin'` (a super admin is made by
   promoting, never by inserting). The first-admin bootstrap rule now inserts
   with role `'super_admin'`.
5. Change `remove_admin()` to check `is_super_admin()`. Keep the existing
   guard against removing yourself, and add: a super admin cannot remove the
   last remaining super admin.
6. New function `set_admin_role(target_id, new_role)`: super admin only; cannot
   change your own role; cannot demote the last super admin.
7. Change `delete_user()` to check `is_super_admin()`.
8. Block direct edits of `role`: no update rule on `admins`, so only
   `set_admin_role()` can change it.

## Client (files to change)

1. `AdminSetup.jsx`: the first admin is inserted with role `super_admin`.
2. `AdminLayout.jsx`: also load `role` from the admin's row and pass
   `isSuperAdmin` down through the outlet context. Show the "Admins" sidebar
   item to every admin, but only a super admin sees the buttons that change
   things (see next item). Show a small "Super admin" badge by the name in the
   top bar.
3. `AdminAdminsView.jsx`: list each admin's role. For a super admin: show the
   "Add admin" form, a "Remove" button, and "Promote" / "Demote". For a regular
   admin: the list is read-only.
4. `AdminUsersView.jsx`: add a "Delete account" button with a confirm pop-up,
   shown only to super admins, calling `delete_user`.
5. `AdminOverviewView.jsx`: no change.

Hiding buttons is only for looks. The real protection is the database rules
above, so a regular admin calling the functions directly is still refused.

## Endpoints

None new. The client calls the database functions through Supabase
(`remove_admin`, `delete_user`, `set_admin_role`). The Python AI service is
not involved.

## Build steps (each one committed and pushed)

1. Database file: role column, `is_super_admin()`, changed rules and
   functions, `set_admin_role()`. Apply to the live project and test with
   rolled-back SQL.
2. Admin setup, layout and Admins page: roles shown, add/remove/promote/demote
   only for super admins.
3. Users page: super-admin-only "Delete account" button.
4. Check in the browser that a regular admin sees a read-only Admins page and
   no Delete button.

## Open questions

1. Exactly one super admin, or several? This plan allows several, with at
   least one always left.
2. Should a super admin also be able to do everything a regular admin does?
   This plan says yes.
3. Is the first-version list above enough for the adviser, or should the
   activity log be included?
