# Demo data for the defense: plan and progress

Last updated: 2026-10-03. To continue in a new Claude session, say:
"Read PLAN-demo-data.md and continue from the current step."

Goal: fill the live site (phil-freela.pages.dev) with believable made-up
people, posts, projects, ratings and chats, so every graded function has
something to show at the defense. No real person's data is used or changed.

## Why (counted on the live database, 2026-10-03)

11 accounts (10 freelancers and 1 client) plus 1 admin, 3 of the accounts
verified, 4 services, 2 job posts, 0 job applications, 0 projects, 0 ratings,
0 bookings, 6 chats (62 messages), 2 portfolio projects. With that little
data:

1. "Recommended for you" has little to choose from, and the new rating and
   completed-projects scoring has nothing to score.
2. The new Performance boxes and Completed Projects lists show zeros and
   dashes.
3. Booking, Projects and Ratings have never been run with real accounts on
   the live site, only against a fake backend.

## What the demo will show (by function in PhilFreela-System-Functions.md)

1. Feature 1, Hybrid recommendation: posts to search ("logo", "website",
   "promo video", "wedding invitation", "voiceover"), people with profile
   descriptions and skills, chats and applications that make "people like
   you" patterns, and owners with different records, so the ranking has
   something to order (Highly rated, Experienced, Replies within an hour,
   Verified, New).
2. Feature 4, eKYC: verified and unverified freelancers side by side. The
   demo accounts are marked verified without real ID photos; the real
   verification flow is still shown live with your own ID and face.
3. Feature 5, Profile transparency: freelancers and clients with different
   records: an experienced one, a mixed one, a slow one, a late delivery, a
   newcomer, and a client who rates badly.
4. Booking, Projects and Ratings: bookings in each state, projects started,
   waiting for review and done.
5. Features 2, 3 and 6 need no seed data (see "Not included" for pictures).

## The cast (made-up names, all usernames start with `demo_`)

Freelancers (record = completed projects, on time, average stars; reply =
how long they usually take to answer in a chat):

1. `demo_juan`, Juan Dela Cruz, video editing. Verified. 6 completed, 5 on
   time, 4.8. Replies in about 15 minutes. 2 services.
2. `demo_ana`, Ana Reyes, graphic design. Verified. 4 completed, 3 on time,
   4.3. Replies in about 2 hours. 2 services.
3. `demo_pedro`, Pedro Santos, web development. Verified. 2 completed, both
   on time, 5.0. About 40 minutes. 2 services.
4. `demo_liza`, Liza Garcia, UI/UX. Verified. 1 completed (late), 4.0. About
   3 hours. 2 services.
5. `demo_marco`, Marco Bautista, photography. Verified. New account, no
   record, no chats. 2 services.
6. `demo_bea`, Bea Ramos, social media. Verified. 3 completed, 3.7. Slow:
   about a day. 1 service.
7. `demo_noel`, Noel Aquino, voiceover and music. Verified. 2 completed, 4.5.
   About 1 hour. 1 service.
8. `demo_rico`, Rico Villanueva, copywriting. NOT verified, so his one
   service stays hidden from Browse Services (shows the rule).

Clients (record = completed projects and the average trust stars the
freelancers gave):

1. `demo_maria`, Maria Lopez, owns a coffee shop. 7 completed, 4.7. About 30
   minutes. 2 job posts. The main client to log in as.
2. `demo_diego`, Diego Fernandez, startup founder. 4 completed, 4.8. About 2
   hours. 2 job posts.
3. `demo_sofia`, Sofia Cruz, boutique owner. 3 completed, 2.7 (a client who
   rates badly). About a day. 1 job post.
4. `demo_grace`, Grace Tan, event planner. 3 completed, 4.3. About 1 hour. 2
   job posts.
5. `demo_paolo`, Paolo Navarro, new client. 1 completed. 1 job post.

In all: 13 accounts, about 13 services, 8 job posts, 18 completed projects
(36 ratings, some with feedback text), 3 projects still going (started, or
submitted and waiting for the client's review), 5 bookings (pending,
accepted, declined, cancelled), about 14 chats with about 110 messages, and
verification rows for the 7 verified freelancers. The numbers add up on both
sides: the 18 completed projects are the 6 + 4 + 2 + 1 + 3 + 2 of the
freelancers and the 7 + 4 + 3 + 3 + 1 of the clients.

## How it gets added

Part 1, the history (SQL, backdated): one script adds the accounts, profiles
with descriptions and skills, verification rows, services, job posts,
projects, ratings, bookings, chats and messages, with dates spread over the
last 2 to 4 months (chats within the last 25 days, because the response time
only looks at the last 30). Accounts are real logins (email and password), so
you can sign in as any of them.

Part 2, a live walkthrough through the real website: a script signs in as the
demo accounts in a browser and does the things only the real screens do:
freelancers apply to jobs with a real PDF resume file, a client hires an
applicant, a client books a service, the freelancer accepts, submits the
work (a link), the client marks it done and both rate. This leaves a few
fresh records from today, and it is the first end-to-end test of Booking,
Projects and Ratings on the live site (including their notifications).

Part 3, warm-up and checks: signing in as demo accounts makes the AI service
create the meaning numbers for all the new posts and profiles (it does this
by itself on the first search or "Recommended for you"; the first time is
slower). Then the pages are checked as a real user would see them.

## Safety

1. Every demo account has a username starting `demo_` and an email like
   `demo.juan@example.com` (a reserved address that never receives mail), and
   "email me when I'm offline" is turned off, so nobody is ever emailed.
2. Real accounts and posts are not changed: the scripts only add rows.
3. One removal script deletes every demo account, and the database removes
   everything that belongs to them with it (profiles, posts, projects,
   ratings, chats, meaning numbers). It is `database/demo_data_remove.sql`;
   run it in the Supabase SQL Editor after the defense. (The database tool
   used by Claude asks for confirmation before any DELETE, which can't be
   given while Claude works alone, so the removal is yours to run. Admins can
   also delete a demo account one by one in the admin panel.) Resume files
   uploaded in Part 2 stay in storage (a few tiny PDFs); they are harmless.
4. The password is not stored in the repository (it is public). Claude
   creates it when the script runs and tells you in the chat.
5. The demo person's names are common made-up Filipino names; no real
   person is meant.

## Defaults picked (the user can change these)

- Names look real (no "(demo)" label); only the username shows `demo_`.
  Classmates using the live site will see these posts until the removal.
- Dates are measured from the day the script runs. Re-run it (remove, then add)
  within a week before the defense so the chats stay inside the 30-day window.
- The demo clients are not verified (client verification is still an open
  item in PhilFreela-System-Functions.md), so their pages show "Not verified".
- The rating notifications the database makes for the seeded ratings show the
  time the script ran. That is fine.
- The demo verification rows have no ID photos or face scans (the admin
  Verifications page will show them without pictures).

## Not included

- Portfolio pictures and Moodboard Match. They need real pictures that go
  through the upload pipeline (checks, watermark, meaning numbers). The 2
  portfolio projects already on the site stay as they are. If you give me about
  20 pictures (your own or free to use), they can be uploaded through demo
  freelancers as an extra step.
- Admin moderation examples (reports, appeals, suspensions).
- Calls, voice messages and chat files.

## What the user does outside the code

1. Says OK, and tells me the defense date if you know it.
2. Keeps the demo password that Claude gives in the chat.
3. After the defense, runs `database/demo_data_remove.sql` in the Supabase SQL
   Editor.

## Step 1: Prove the method with one account (Easy)

Add one demo account, sign in with it through the live site's real login, and
read its Profile. If signing in doesn't work, stop and fix the method before
adding anything else.

## Step 2: The history script and the removal script (Medium)

New files `database/demo_data.sql` and `database/demo_data_remove.sql`. The
adding script stops with a message if demo accounts are already there. It is
tested first as a dry run that rolls back everything (counts, the numbers of
every person above against `profile_stats`, the row rules), then run for real.

## Step 3: The live walkthrough (Medium)

Part 2 above, run by Claude against the live site, with the demo accounts.

## Step 4: Warm-up, checks and the guide (Easy)

Part 3 above, then a short `DEMO-GUIDE.md`: the accounts (not the password),
and a 10-minute script for the defense (which account to show for which
function, and what to click). Checked as the demo accounts in a browser:
Browse Services lists the services (and hides the unverified one), the AI
search finds the right posts, "Recommended for you" shows reasons including
Highly rated and Experienced, profiles and client pages show the numbers and
lists above, and the project and booking pages show each state.

## Current step

The LITE version is built and on the live site (2026-10-05), after the
owner's OK. The full plan above was cut down to fit the weekly usage that was
left. Everything above this section describes the full plan; this section
says what actually exists.

What the lite version added (one script, `database/demo_data.sql`):

1. 6 accounts instead of 13: freelancers `demo_juan` (strong record),
   `demo_ana` (mixed record), `demo_marco` (verified, brand new), `demo_rico`
   (not verified); clients `demo_maria` (the main one) and `demo_sofia` (rated
   low, slow to reply).
2. 6 services, 3 job posts, 8 finished projects with 16 ratings, 2 projects
   still going (one waiting for Maria's review, one started from a booking), 3
   bookings (accepted, pending, declined), 4 chats with 23 messages, and
   verification rows for Juan, Ana and Marco.
3. `database/demo_data_remove.sql` (the owner runs it in the SQL Editor) and
   `DEMO-GUIDE.md` (who the accounts are and a 10-minute path).

Left out of the lite version: the other 7 accounts, job applications, the
live walkthrough through the real website (Step 3), the AI warm-up and the
page-by-page browser check (Step 4).

How it was checked:

1. The script checks its own numbers before it keeps anything (each person's
   finished projects, on-time count, stars, listings, reply time, and who is
   verified) and adds nothing if one is off. It passed on the first run.
2. All 6 accounts sign in through the live site's real sign-in service, and
   each one's profile numbers read back as designed: Juan 5 done, 4 on time,
   4.8 stars, 15 minutes; Ana 3, 2, 4.0, about 2 hours; Marco and Rico
   nothing yet; Maria 5 done, 4.8, 30 minutes; Sofia 3 done, 2.7, a day.
3. Signed in as Maria, the database lists Marco's service but not Rico's (the
   not-verified rule), her 7 projects, 2 bookings and 2 chats.
4. Counted afterwards: 16 rating notifications, all carrying the rating's own
   date; no email was queued for anyone.

Not checked: the pages themselves in a browser with these accounts, and the
AI search and "Recommended for you" with the new posts (the AI service reads
new posts the first time someone searches).

Changes from the plan: the password is typed into the script when it runs and
is never saved in the repository (it was given to the owner in the chat); the
removal is one `delete` of the six logins, since the database removes
everything that belongs to an account with it.
