# Data Privacy Compliance: plan and progress

Last updated: 2026-10-02. To continue in a new Claude session, say:
"Read PLAN-privacy-compliance.md and continue from the current step."

Feature 6 in PhilFreela-System-Functions.md: keeping PhilFreela aligned with
RA 10173 (the Data Privacy Act of 2012). Not an AI feature -- no Python
service work, no new models.

Plan approved by the user on 2026-10-02 ("yes"). Checked first: there was no
consent checkbox at sign-up (only "Remember me"), the homepage footer's
"Terms of Service" / "Privacy Policy" links went nowhere (`href="#"`), and
there was no self-service account deletion (only the admin-only
`delete_user()` and the 100-day ban clean-up job).

## What this builds

1. Two new public pages, `/terms` and `/privacy`, written in plain language,
   matching the RA 10173 principles table already in
   PhilFreela-System-Functions.md. No backend.
2. Sign-up gets a required checkbox: "I agree to the Terms of Service and
   Privacy Policy" (real links, open in a new tab so the half-filled form
   isn't lost). Covers "Consent and transparency."
3. The homepage footer's two placeholder links now point to the real pages
   (the other placeholder links there -- social icons, "Enterprise", the
   LEGACY PHP links -- are out of scope, untouched).
4. Settings > Privacy & Notifications (already an existing tab, so far just
   the "email me when offline" switch) gets two new sections:
   - **Your data**: a short explainer, then "Download your data" -- one
     JSON file built from the tables a user's data already lives in (no new
     storage; the same rows their own dashboard already reads under
     existing row-level security). Covers "User rights: review."
   - **Delete your account**: type their username to confirm, then
     `delete_my_account()` removes their `auth.users` row, which cascades
     to their profile, posts, portfolio, messages and everything else
     through the "on delete cascade" rules already on those tables. Covers
     "User rights: removal."

## What's deliberately left out of the data download

Raw ID photos and the face scan (identity_verifications' private bucket
files) are not included -- only the verification's status and date. Full
message text is not included either -- a message also belongs to the other
person in the chat, so only a summary (who, how many sent/received) is
exported. Both are judgment calls for a capstone-level implementation,
explainable in the defense as a deliberate privacy-by-default choice.

## Files

1. New `database/supabase_privacy_schema.sql`: `delete_my_account()`
   (security definer, same pattern as the existing admin `delete_user()`
   and the ban clean-up job -- a normal login can't delete `auth.users`
   directly).
2. New `client/src/lib/privacy.js`: `exportMyData(userId, accountType)`,
   `deleteMyAccount()`.
3. New `pages/legal/TermsOfService.jsx`, `pages/legal/PrivacyPolicy.jsx`.
4. `pages/login/Login.jsx` (the checkbox + a validation message),
   `pages/homepage/Homepage.jsx` (the two footer links),
   `pages/dashboard/views/SettingsView.jsx` (the two new sections under the
   existing Privacy & Notifications tab), `App.jsx` (two routes),
   `lib/pageTitles.js` (two titles).

## Current step

Website side built and pushed (2026-10-02): legal pages, sign-up checkbox,
footer links, and Settings > Privacy & Notifications' "Your data" and
"Delete your account" sections.

`database/supabase_privacy_schema.sql` (`delete_my_account()`) has NOT been
run yet -- this session's Supabase connection dropped mid-task, so it
couldn't be applied directly. Until it's run, the Delete button's call
fails with a database error ("function does not exist"), caught and shown
as a message rather than crashing. Next session or the user: run that one
file, or reconnect the Supabase MCP tool and ask Claude to apply it.

Tests (2026-10-02, against the live database, one made-up account, deleted
afterward): 16/16 passed (one browser-test flake on the first run, fixed by
correcting the test's own field selectors; confirmed again by reading the
rendered page directly). Checked: /terms and /privacy render while logged
out with real, non-boilerplate content; the homepage footer's two
placeholder links now point to them; sign-up is blocked with a clear
message until the checkbox is checked, and its label links to /terms;
Download your data produces a JSON file named after the username, with the
right profile and posts, and confirmed NOT containing the raw ID
photo/face-scan file paths; Delete your account's button stays disabled
until the typed text exactly matches the username.

Not yet tested live: the delete button actually deleting an account (needs
the SQL above run first).
