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
3. Signed in on the NEW account, Settings > Account > "Move work from an old account": enter the code.
   The code proves the old account; being signed in proves the new one.
4. What moves (old id -> new id, one transaction):
   - Freelancer side: services, portfolio items, job applications, bookings/projects/payments as freelancer,
     GCash number + payment details + watermark settings (only if the new account has none),
     watermark codes, slides and AI embeddings, site verifications, ratings on the moved projects.
   - Client side: job posts, bookings/projects/payments as client, receipt checks, offer reviews written,
     ratings on the moved projects.
5. What stays with the old account: chats, notifications, profile picture, Premium, ads, reports, ID verification
   (the new account verifies its own ID).
6. Table `account_splits` (from_user, move_side, code, expires_at, to_user, done_at); functions
   `my_split_summary()`, `start_account_split()`, `finish_account_split(code)` (security definer).
7. Files: `database/supabase_account_splits_schema.sql`, `database/test_account_splits.sql`,
   `lib/accountSplit.js`, `components/SplitAccountCard.jsx`, `components/MoveWorkForm.jsx`,
   both dashboard home views, `SettingsView.jsx`.

## Defaults chosen
- The 2 two-sided accounts keep their current role; nothing is deleted.
- An admin cannot change a role on the website (only the SQL Editor).
- Same email for both roles: impossible (Supabase allows one account per email).
- Paper / study guide lines about switching: listed for the user after the build.

## Known limits
- Files of moved portfolio items stay in the old account's storage folder (they still show).
- Chats with the other side's people stay on the old account.
