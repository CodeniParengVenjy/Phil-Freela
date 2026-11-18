# PLAN: Separate Freelancer and Client accounts

Panel revision (2026-11-18): "When creating an account, freelancer and client must be separated."
The user chose **two separate accounts**: one email = one role, forever. Someone who wants
to both work and hire makes two accounts with two emails. No switching.
The user added: existing accounts that already have both sides are **split in two, not deleted**,
and the opening tour (tutorial guide) is fixed to match.

## What was there before

- Create Account: one form with a small Freelancer/Client toggle (`Login.jsx`).
- New Google users picked the role on Complete Profile.
- Sign In did not ask for a role.
- "Switch to Client / Freelancer" in the avatar menu flipped `profiles.account_type`.
- The database let a user change their own `account_type`.
- Live on 2026-11-18: 24 freelancers, 19 clients. 2 accounts had work on both sides
  (@Ellen: client with freelancer work; @venjokes: freelancer with client work).

## Steps

### Step 1: Separate Create Account pages (website only)
1. `/signup` shows two big cards: I'm a Freelancer / I'm a Client.
2. `/signup/freelancer` (orange) and `/signup/client` (blue) are separate pages, no toggle.
3. Each page says the account will always be that role; to do the other, make a second account with another email.
4. Homepage "Join as Freelancer" / "Become a Client" open those pages; old `/login?mode=signup&role=...` links still work.
5. Google on a sign-up page keeps the role; Complete Profile shows it locked.
6. Files: `Login.jsx`, `CompleteProfile.jsx`, `App.jsx`, `Homepage.jsx`, `lib/profile.js`, `styles/auth.css`.

### Step 2: Separate Sign In (website only)
1. Sign In has a Freelancer | Client picker (remembered on the device).
2. Wrong side = not let in: "This email has a Client account. Sign in on the Client side." + one button.
3. Same check for Google.
4. Files: `Login.jsx`, `lib/profile.js`.

### Step 3: Remove switching + fix the opening tour (website only)
1. Remove the menu item, the confirm pop-up and the switch code. "Switch to admin" stays (admins only).
2. Job details / Offer details hints point to making a separate account instead of switching.
3. Opening tour (`lib/welcomeGuide.js`): the "Your account" step no longer mentions switching.
4. Files: `DashboardTopNav.jsx`, `DashboardOverlays.jsx`, `useDashboardShell.js`, both layouts,
   `JobDetailsView.jsx`, `ServiceDetailsView.jsx`, `PublicProfileView.jsx`, `App.jsx` (comments), `welcomeGuide.js`.

### Step 4: Lock the role in the database
1. Trigger `profiles_lock_account_type`: a signed-in user's update that changes `account_type` is refused.
   The SQL Editor (postgres) can still fix a mistake.
2. Files: `database/supabase_account_type_lock_schema.sql`, `database/test_account_type_lock.sql`.

### Step 5: Split existing two-sided accounts (nothing deleted)
1. An account with work on both sides sees a "Split your account" card on its dashboard.
   It keeps the role it has now; the other side's work moves to a new account.
2. The person makes the new account (other side, another email), then on the OLD account taps
   "Get my move code" (8 letters, 7 days, one use).
3. Signed in on the NEW account, Settings > Account Security > "Move work from an old account": enter the code.
   The code proves the old account; being signed in proves the new one.
4. What moves (old id -> new id, one transaction):
   - Freelancer side: services, portfolio items, job applications, bookings/projects/payments as freelancer,
     GCash number + payment details + watermark settings (only if the new account has none),
     watermark codes, slides and AI embeddings, site verifications, ratings on the moved projects.
   - Client side: job posts, bookings/projects/payments as client, receipt checks, offer reviews written,
     ratings on the moved projects.
5. What stays with the old account: chats, notifications, profile picture, Premium, ads, reports, ID verification
   (the new account verifies its own ID; the admin sees "same face" on it and can approve it).
   Rows tied to a FILE in the old account's private folder stay too, because the database checks that
   such a file is in its owner's folder and SQL can't move files: a job application with a resume,
   a payment / receipt check with a receipt picture, a watermark with its own picture.
6. Table `account_splits` (from_user, move_side, code, expires_at, to_user, done_at); functions
   `my_split_summary()`, `start_account_split()`, `finish_account_split(code)` (security definer).
7. Files: `database/supabase_account_splits_schema.sql`, `database/test_account_splits.sql`,
   `lib/accountSplit.js`, `components/SplitAccountCard.jsx`, `components/MoveWorkForm.jsx`,
   both dashboard home views, `SettingsView.jsx`.

### Step 6: Split all 4 two-sided accounts for them (the user, 2026-11-18: "all accounts, not only mine")
The user chose: only the 4 accounts with work on both sides (not all 43). Done by us, not by each person:
1. Make the second account for each, the OTHER role:
   - @Ellen (client) -> @Ellen_freelancer
   - @venjokes (freelancer) -> @venjokes_client
   - @testingVG1 (freelancer) -> @testingVG1_client
   - @tinetestingnganeh (freelancer) -> @tinetestingnganeh_client
   Email = the same Gmail plus "+freelancer" / "+client" (same inbox). Same name and gender.
   Already confirmed (no email sent), random password nobody knows: the person sets their own
   with "Forgot password" on the +address.
   Made with the Supabase admin API (service key in ai-service/.env) by a one-time script:
   `make-twins.mjs` in the session scratchpad. Safe to run twice (skips accounts that exist).
2. Move each old account's other-side work into its new account with the live, tested functions
   (start_account_split as the old account, finish_account_split as the new one, in SQL).
3. Check: each old account has nothing left from the other side; the new one has it all.

Status: DONE 2026-11-18. The first try of the script was blocked by Claude Code's safety check
(making logins on other people's emails with the admin key); after the user's "go go go" it ran.
Moved (account_splits rows, done_at 2026-11-18 14:27 UTC):
- @Ellen -> @Ellen_freelancer: 4 offers, 1 portfolio piece, 4 bookings, 3 projects, 4 ratings
- @venjokes -> @venjokes_client: 3 job posts, 1 booking, 1 project, 2 ratings
- @testingVG1 -> @testingVG1_client: 1 offer review
- @tinetestingnganeh -> @tinetestingnganeh_client: 1 job post
Check after: 0 accounts with work on both sides (47 accounts now). Stayed on purpose: Ellen's
1 job application (it has a resume file in her folder).
To use a new account: "Forgot password" with the Gmail +freelancer / +client address.

## Status (2026-11-18)
- Steps 1-3 live on the website (09eb8fc, 2184f89). Step 4 applied (migration account_type_lock, 4/4 PASS).
- Step 5 applied (migration account_splits): rolled-back trials 14/14 PASS (freelancer side, moved
  4 offers, 4 bookings, 3 projects, 1 portfolio piece, 4 ratings) and 2/2 PASS (client side).
- Accounts that see the card on 2026-11-18: @Ellen (freelancer work), @venjokes (client work),
  @testingVG1 (1 offer review written as a client), @tinetestingnganeh (1 job post).
- Not tried by a real person yet: a real split, a real wrong-side sign-in, a real Google sign-up on a side page.

## Defaults chosen
- The 2 two-sided accounts keep their current role; nothing is deleted.
- An admin cannot change a role on the website (only the SQL Editor).
- Same email for both roles: impossible (Supabase allows one account per email).
- Paper / study guide lines about switching: listed for the user after the build.

## Known limits
- Files of moved portfolio items stay in the old account's storage folder (they still show).
- Chats with the other side's people stay on the old account.
