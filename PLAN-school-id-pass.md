# School ID pass: plan

Status (2026-10-08): plan approved. Step 1 files written
(database/supabase_school_id_pass_schema.sql and database/test_school_id_pass.sql)
but NOT yet applied to the live database: the Supabase tool declined the SQL
because it replaces three CHECK rules (DROP CONSTRAINT then ADD). Run both files
in the Supabase SQL Editor (schema first, then the test), or approve the call.

Database (2026-10-08): applied to the live project in two parts (the table,
functions and trigger, then the three rule swaps), and test_school_id_pass.sql
passed all 19 checks on live (rolled back, nothing left behind). The only thing
still needed is restarting the AI service.

Progress (2026-10-08): steps 2, 3 and 4 are built and pushed (the button is on
Kristine's row only, username itsme_tine). Step 5 was cut down on request: no
"granted by Super Admin" label and no Overview box. Her request is just
labelled "School ID" on the Verifications page, like any other ID type.
Still to do: apply the database file, restart the AI service, run the whole
flow, then remove the School ID code once she is done.

Change from the plan below: a database trigger, not the AI service, marks the
pass used and refuses a School ID request without a valid pass. The AI service
only checks first, so she gets the message before the face check runs.

Why: Kristine Latayan (itsme_tine) has no government ID. An admin can give
her a one-time "School ID pass". For 12 hours she can verify with a School ID
instead of a government ID, and only she sees that option. She still does the
face scan, and an admin still approves or rejects her request like any other.
After 12 hours, or after she submits, the pass closes.

This is part of Feature 4 (eKYC user verification) in
PhilFreela-System-Functions.md.

## How it will work

1. A super admin opens Users, finds her row, and clicks "School ID pass".
   Regular admins don't see the button.
2. A pop-up says: "Let Kristine Latayan verify with a School ID for the next
   12 hours?" The super admin confirms.
3. She opens Verify Identity. Her ID list now also has "School ID (temporary
   pass)" with a note saying when it ends. Nobody else's list changes.
4. She does the same steps as before: photo of the ID, face scan, review,
   submit. The AI service runs the same face checks.
5. The request goes to the admin's Verifications page, labelled "School ID:
   granted by Super Admin" so the admin knows it is the exception. The admin
   approves or rejects as usual. The admin Overview also shows a small
   "School ID passes" box with her name, "School ID: granted by Super Admin",
   and the time left (or "used" / "expired").
6. The pass is used up when her request is saved. If she doesn't submit in
   12 hours it just expires.

## Choices I made (tell me if you want any changed)

1. Only the pass is temporary. Once an admin approves her, the Verified badge
   behaves like anyone else's.
2. School ID takes a front photo only, like a passport. School ID backs often
   have no printed text, and the AI's "does this look like an ID" check on
   the back would reject them.
3. Only a super admin can grant or cancel a pass (you asked for this). The
   database function checks it, not just the hidden button.
6. The School ID code is temporary. After her 12 hours (and once she is
   approved or rejected), I remove the School ID code from the website and AI
   service with a revert commit, then push and redeploy. I can't do that on
   my own at a set time: tell me "she's done, remove it" and I will, or keep
   a Claude session open and I can schedule it. Her approved Verified badge
   stays, because it is saved as a normal approved verification.
4. One pass per person at a time. Granting again after it expired or was used
   makes a new one. An admin can also cancel an unused pass.
5. No change to the ranking or any other feature: she just becomes verified
   like anyone else if approved.

## Database (new file: database/supabase_school_id_pass_schema.sql)

1. Allow the new ID type in `identity_verifications`: change the `id_type`
   check to also accept `'school_id'`, and the "back required" check so that
   only passports and school IDs may have no back.
2. New table `verification_passes`:
   - `user_id` (primary key, the person who gets the pass),
   - `id_type` (only `'school_id'` for now),
   - `granted_by` (the admin),
   - `expires_at` (default: now + 12 hours),
   - `used_at` (empty until her request is saved),
   - `created_at`.
3. Row rules: a user can read only their own pass; admins can read all; nobody
   can write from the browser. Passes are created and cancelled only through
   the two functions below (the AI service uses the service role key, which
   skips these rules, to mark a pass used).
4. New function `grant_school_id_pass(target_id)`: super admin only
   (`is_super_admin()`); refuses unless
   the person has a profile, is not already verified, and has no pending
   request; replaces any old pass; sets the 12 hours; sends her a
   notification "An admin allowed you to verify with a School ID for 12 hours".
5. New function `cancel_school_id_pass(target_id)`: super admin only; deletes
   an unused pass.
6. Admins can read the passes (for the Overview box and the label); only
   super admins can create or cancel one.

## AI service (ai-service/main.py)

1. `handle_submission`: if the type is `school_id`, check that the caller
   has an unexpired, unused pass; if not, refuse with "You don't have a School
   ID pass, or it has expired." Treat it like a passport (no back photo).
   This is checked on the server, so a user can't just edit the website to get
   the option. The phone (QR) upload goes through the same function, so it is
   covered too.
2. After the verification row is saved, set the pass's `used_at`.
3. The AI service must be restarted or redeployed after this change.

## Client (files to change)

1. `lib/verification.js`: add the School ID type (label "School ID (temporary
   pass)", no back), plus a small function that asks whether I have a pass.
2. `VerificationWizard.jsx`: show School ID in the list only when the person
   has a pass, with "Valid until <time>"; treat School ID like a passport for
   the number of steps.
3. `AdminUsersView.jsx`: "School ID pass" button on each user row (super
   admins only), with the confirm pop-up; shows "Pass active until <time>"
   with a Cancel button while one is active.
4. `AdminVerificationsView.jsx`: show the "School ID: granted by Super Admin"
   label; the AI summary card notes that no government ID was shown.
5. `AdminOverviewView.jsx`: a small "School ID passes" box (hidden when there
   are none) with the same label.

## Build steps (each committed and pushed, tested with rolled-back SQL and a
mocked network where I can)

1. Database file: table, rules, the two functions, the new ID type. Apply to
   the live project.
2. AI service: pass check at submit and marking the pass used.
3. Wizard: School ID option for people with a pass.
4. Users page: grant and cancel button (super admins only).
5. Verifications page and Overview box: the label and note for admins.
6. Check the whole flow with a made-up account (grant, verify, approve,
   expire).
7. When you tell me she is done: revert the School ID code (steps 2 to 5),
   push, and redeploy the AI service. The database table and her approved
   verification can stay or be dropped; I'll ask.

## Open questions

1. OK with the choices above, especially front photo only?
2. After you approve her, should her badge stay for good (my assumption)?
