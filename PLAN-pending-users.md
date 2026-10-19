# Pending Users (waiting for email confirmation): plan and progress

Last updated: 2026-10-19. To continue in a new Claude session, say:
"Read PLAN-pending-users.md and continue from the current step."

Request from the owner, during the testing phase: testers sign up with an
email, never get past the confirmation email, and can't get in. Admins can't
see these people at all, and the testers have no good way to ask for the
email again.

## What I found (2026-10-19, from the code, the live auth logs and a
read-only count on the live database)

1. The Overview numbers (`admin_stats()`) and the Users list
   (`admin_list_users()`) both read the `profiles` table. A person who never
   confirms never gets a profile, so no admin page shows them.
2. Right now 11 people are waiting on an email (9 clients, 2 freelancers).
   All 11 were last sent a link over an hour ago and 3 over a day ago. Links
   expire, so for most of them only a new email can help. One used an address
   ending in "gamil.com", a typo, so no email can ever reach them.
3. The Sign In page has a "Resend confirmation email" button, but it only
   appears right after a sign-up or a failed sign-in, and nothing tells the
   person to wait. Supabase lets one email go out per address per minute. On
   2026-10-19 one tester pressed Create Account or Resend more than 20 times
   in 12 minutes and was refused by that limit every time but once.
4. Every new email cancels the links in the older ones (the admin sign-in page
   already says so). So resending again and again works, but only the newest
   email's link is good. The pages must say that.
5. No new server code is needed to resend. `supabase.auth.resend` is open to
   anyone for any address; the Sign In page and the admin sign-in page already
   call it.

## What it builds

### A. Pending Users in the admin panel

1. Overview: a new card "Pending Users" with the number (11 today). It opens
   the new page. If the number is missing it shows a dash.
2. Sidebar: a "Pending Users" link under Users, with the number as a badge,
   the same way Reports shows its number.
3. The new page lists, newest first: name and @username, role (Freelancer or
   Client), email, "Signed up 3 days ago", "Last email sent 12 minutes ago",
   and a "Resend email" button. It has a search box (name, username, email) and
   a Refresh button. On a phone each row becomes a stacked card.
4. One press of "Resend email" sends a new confirmation email to that person.
   The button then reads "Resend in 59s", counts down, and works again after
   that, as many times as needed. A green line at the top says "Confirmation
   email sent to name@example.com."
5. If Supabase says to wait, the button shows the wait instead of an error. If
   the hourly email limit is reached, a plain sentence says so (the wording
   already exists in `lib/errors.js`).
6. A line under the heading says: "Each new email cancels the older ones. Tell
   them to use the newest email and to check their Spam folder."
7. When someone confirms, they drop off the list the next time it is
   refreshed.
8. Empty state: "Nobody is waiting on an email."

Why a page of its own and not rows in the Users table: pending people have no
profile, no PF number and can't be suspended, banned or messaged, so none of
the Users page's buttons apply to them.

### B. Optional: a "Resend my email" page for the testers themselves

Only if the owner says yes.

1. A new public page `/confirm-email`. It says "We sent a link to <email>. It
   can take a few minutes." It has an email box (filled in from the address
   when they arrive from sign-up) and a "Resend email" button.
2. The same countdown and the same "as many times as needed". The countdown is
   remembered in the browser per address, so a refresh doesn't reset it.
3. A short list of tips: look in Spam or Promotions, search for "PhilFreela",
   use only the newest email, and if the address was typed wrongly, create the
   account again with the right one (a resend can't change the address).
4. It is reached from three places: straight after Create Account (instead of
   dropping them on Sign In with a small message), from the "Email not
   confirmed" message ("Didn't get it? Resend the email"), and from a small
   permanent link under the Sign In form ("Didn't get your confirmation
   email?"). The inline Resend button on the Sign In page is replaced by those
   links.

Risk of B: the page is public, so anyone can ask for an email to any address.
Supabase's one-per-minute limit per address still applies, and the hourly cap
is shared with sign-up emails, so someone could use it up. It is the same call
the Sign In page already allows.

## How it stays safe and simple

1. The list comes from a new database function that only admins can call (the
   same pattern as `admin_list_users`). Signed-out visitors can't call it, and
   the email addresses never reach anyone but admins.
2. Resending uses Supabase's own resend (type "signup"). The link in the new
   email opens the Sign In page, same as the first one, which creates the
   profile.
3. No new table. "Last email sent" is Supabase's own `confirmation_sent_at`,
   which it updates on every send, so the page shows the truth even after a
   refresh or another admin's resend.
4. No "resend to everyone" button. Every send uses the shared hourly email
   limit, and one at a time keeps it under control.

## Database

New file `database/supabase_pending_users_schema.sql`. No new tables.

1. `admin_pending_users()` returns id, full_name, username, account_type (read
   from the sign-up details saved with the login), email, created_at and
   confirmation_sent_at. It lists logins whose email isn't confirmed, that have
   no profile and aren't admins, newest first, at most 500. Anyone who isn't an
   admin gets "Only admins can view pending users." It is revoked from public
   and anon and granted to authenticated.
2. `admin_stats()` is replaced by the same function plus one more number,
   `pending_users`, counted by the same rule.
3. Test in a rolled-back block, `database/test_pending_users.sql`: an admin
   sees a test unconfirmed login; a non-admin and a signed-out caller are
   refused; confirmed people, profile owners and admins never appear (checked
   against the real accounts, read-only); the count equals the list length;
   nothing is left behind and no user numbers are used up.

## Defaults picked (the owner can change these)

1. Any admin can resend, not only super admins (like the Users page).
2. 60 seconds between sends to the same person (Supabase's own rule).
3. The sidebar link has a number badge, like Reports (amber instead of red).
   Dropping the badge is a small change.
4. The list is cut at the newest 500.

## Not included

1. A "resend to everyone" button.
2. "Confirm manually": a super admin button that marks an email confirmed. The
   quickest way to let a tester in when mail won't arrive, but it skips proof
   that they own the address.
3. Deleting old pending accounts (for example the "gamil.com" one).
4. A "did you mean gmail.com?" hint on the sign-up form and on this list.
5. An automatic reminder email after 24 hours.
6. People who confirmed but have no profile (like Lady Nicole on 2026-10-19).
   They aren't waiting for an email. The fix for them is making the profile at
   sign-up, which is a separate step.

## Steps (SQL is applied to the live database and tested before the page that
uses it is pushed)

### Part A

1. **Database (Easy):** `database/supabase_pending_users_schema.sql` and
   `database/test_pending_users.sql`, applied to the live project after the
   rolled-back test.
2. **Shared resend and countdown (Easy):** `client/src/lib/resendConfirmation.js`.
   `resendConfirmation(email, redirectPath)` wraps `supabase.auth.resend` and
   reads "after N seconds" out of Supabase's reply. A small hook keeps "can
   send again at" for each person and ticks once a second, only while someone
   is counting.
3. **The page (Medium):** `pages/admin/views/AdminPendingView.jsx`; a route
   `pending` in `App.jsx` next to `users`; "/admin/pending": "Pending Users" in
   `lib/pageTitles.js`; the sidebar link and its number in
   `pages/admin/layout/AdminLayout.jsx`; the card in
   `pages/admin/views/AdminOverviewView.jsx`.
4. **Browser check (Easy):** Playwright with the fake backend, laptop and
   phone: the card number and link, the list, search, a resend shows the green
   line and the countdown, pressing again after the countdown, the wait
   message, the hourly-limit message, the empty state, and a non-admin can't
   open the page.

### Part B (only if the owner says yes)

5. **Confirm Email page (Medium):** `pages/login/ConfirmEmail.jsx`, a route
   `/confirm-email` in `App.jsx`, its title, and `pages/login/Login.jsx` (go
   there after Create Account, the link in the "Email not confirmed" message,
   the link under the form, the inline Resend button removed).
6. **Browser check (Easy):** the same fake backend: sign-up lands on the page
   with the email filled in, resend and countdown, the countdown survives a
   refresh, the tips show, the Sign In links go to it.

## What the owner does outside the code

1. Check Supabase > Authentication > Emails > SMTP Settings. A resend can't
   help if the emails never reach the inbox, and those settings can't be read
   from here. Today's logs show six confirmation emails going out within an
   hour without hitting the hourly limit, so a custom sender is probably set
   up, but whether the emails land in the inbox or in Spam can't be told from
   the logs. Ask a tester who is waiting to look in their Spam folder.
2. Nothing else, as long as the Supabase connection works. Otherwise paste the
   SQL file into the Supabase SQL Editor.

## Current step

Plan written on 2026-10-19 and approved the same day ("go go go"). The owner
did not say yes to Part B, so only Part A was built.

Part A, steps 1 to 4: built (2026-10-19).

1. Database: applied to the live project (migration `pending_users`) after a
   rolled-back trial of 14 checks (`database/test_pending_users.sql`): nothing
   left behind, no user numbers used up. 11 people were pending at that time.
2. `lib/resendConfirmation.js`: `resendConfirmation()` and `useResendWait()`.
3. `AdminPendingView.jsx`, the route, the page title, the sidebar link and the
   Overview card. Two small choices not in the plan: the sidebar number is
   amber (`bg-warning`), not red like Reports, because these people wait on
   their own email, not on an admin decision (and the number never reaches 0
   while old pending accounts stay); and the page's CSS is a few lines at the
   end of `admin.css` (`admin-pending-*`).
4. Browser check: Playwright with a fake backend, laptop and phone, 124 checks
   (62 each): the card and badge, a missing number shows a dash, the list and
   search, a resend and the 60-second wait, resending again after the minute
   (three sends to one person), Supabase's "wait N seconds", the hourly limit,
   no network, "Sending...", Refresh keeping the wait and dropping someone who
   confirmed, the empty and error states, and a non-admin sent to the admin
   sign-in. It found one real bug (the first label said 61s instead of 60s),
   fixed before committing. Never seen with real rows from the real API: the
   fake answers `admin_pending_users` with a plain list, like the real function
   does (checked with the rolled-back SQL test).

Part B (the testers' own "Resend my email" page): not built. Waiting for the
owner's yes.
