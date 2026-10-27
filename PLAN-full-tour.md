# Plan: the full tour (new accounts only, ID first)

Request (2026-10-26): make the tour a full guide of the system, not a quick
look around; only for new users; guide them to verify their identity first;
the posting lessons (post a service / post a project) only come after the ID
is verified, then the full tutorial.

## What is there now

- The tour (commit ae75301): 6 notes on the dashboard home only (welcome, side
  menu, search, account button, Get started card, first job or service). It
  opens once for every account, old ones too ("seen" is kept in the browser).
- Verify Identity page: 5 screens (ID type, front, back, face scan, review and
  send). After sending, an admin must approve it, which can take hours. So
  "after verifying" means the tour pauses at "Waiting for review" and goes on
  during a later visit, once the ID is approved.
- Freelancers must be verified to post a service, apply to a job or ask for
  payment (the database refuses it). Clients were not: they could post a
  project without an ID check (changed the same day, Step 0 below).
- Every sidebar page is its own address, and the tour starts over when the
  page changes, so a tour across pages must remember where it is.

## The new tour: 3 parts

### Part 1: Welcome (dashboard home, right after sign-up)

1. Welcome (middle of the screen): what the tour covers, about 5 minutes in all.
2. Side menu.
3. Search box.
4. Account button (profile, settings, switch role, this tour).
5. Get started card.
6. Its "Verify now" button: "First step: verify your identity." Next opens the
   Verify Identity page.

### Part 2: Verify your identity (Verify Identity page)

7. The step bar: 5 short steps, about 3 minutes.
8. The ID list: PhilSys, Driver's License, Passport, UMID, PRC.
9. (Computer only) the QR code: do it on your phone instead.
10. "Your turn" (middle): front and back photos, the face scan (look straight,
    then turn to each side), check and send. The tour steps aside so the form
    can be used.
11. When "Waiting for review" appears: "Sent! An admin checks it soon and you
    get a notification. The rest of the tour starts when you're verified."

Later visits:
- Approved: a card in the middle, "You're verified! Now the full tour: posting
  your first service, jobs, bookings, projects and payments." Start / Later.
- Not approved: a card with the admin's reason and Try again (opens the
  Verify page, notes 7 to 11 again).
- Someone already verified (an old account replaying it) goes from Part 1
  straight to Part 3.

### Part 3: The full tour (after the ID is approved)

Each page starts with a note on its menu link ("This is My Services: ...";
Next opens it), so people learn where things are, then notes on the page.

Freelancer (about 34 notes):
- My Services: the form, title, category, description, skills, starting
  price, photos/videos, Upload & Publish (3 offers free, 15 with Pro), your
  active services (edit, delete, Feature).
- Dashboard home: Projects / Jobs filter, the Featured row, the first job
  ("open it to read it and apply with your resume").
- Bookings: Accept or Decline; an accepted booking becomes a project.
- Project: My Applications, My Projects (send your work, the client pays by
  GCash, the client's rating), My Published Services.
- Inbox: chats, files, calls, asking for payment.
- Notifications.
- Profile (from the account menu): description, skills, portfolio, the
  performance box.
- Settings (from the account menu): the tab list, GCash Payment.
- Freelancer Pro (its own page since 2026-10-27): the menu link, then the Pro
  plan card on /dashboard/pro.
- End: "That's the tour!", a card on the dashboard home.

Client (about 30 notes):
- Post a Project: the two choices (the client clicks one, the tour waits),
  title, category, description, skills (AI suggests), budget, start and due
  dates, freelancers needed, Post, your active listings.
- Dashboard home: categories, the Featured row, the first offer (View offer,
  Book, Message).
- Search: the camera button (search with a picture).
- Bookings, Projects & Resumes (applicants, Hire, My Projects, paying,
  rating), Inbox, Notifications.
- Profile and Settings (from the account menu).
- End.

## How it works

- New accounts only: it opens by itself only for accounts made on or after
  the day this goes live (profiles.created_at, already readable). Older
  accounts never get it. (Changed 2026-10-27: the user asked to remove "Take
  the tour" from the account menu, so there is no way to play it by hand.)
- Where the person is in the tour (part and note) is kept in this browser, per
  person, so it goes on after a page change or a reload. Which part fits is
  worked out from real data (verified? ID waiting?), so on another phone or
  laptop it still knows not to teach posting before the ID is approved.
- Buttons on each note: Skip, Back, Next. Skip (or Escape) ends the tour for
  good. "Later" on the "You're verified!" and "not approved" cards, and
  leaving the tour's page with the browser's Back button, pause it until the
  next visit (a new tab or window); it then goes on where it stopped.
- The tour explains each field but never posts anything for the person (no
  test posts). The only notes that wait for a click are the Post a Project
  choice (the form only appears after one is picked) and Verify's "Your turn".
- A part that isn't on the page (an empty list, a suspended account's blocked
  form) is skipped, as now.
- Same look as now (dim page, outlined part, note beside it; a strip on a
  phone), in the dark and light themes and the picked accent color.

## Files

- client/src/lib/welcomeGuide.js: rewritten: the three parts per role (every
  note with its page), saving where the person is, the new-account check,
  which part fits now.
- client/src/pages/dashboard/components/WelcomeGuide.jsx: rewritten: moves
  between pages, Back, the clickable note, waits for the ID to be sent, the
  "You're verified" and "not approved" cards.
- data-tour tags only (no change in what the pages do): GetStartedCard.jsx,
  VerificationWizard.jsx, PhoneQrPanel.jsx, IdentityVerification.jsx,
  ServicesView.jsx, PostNeedView.jsx, FindJobsView.jsx,
  BrowseServicesView.jsx, DashboardTopNav.jsx, both layouts (menu links),
  BookingsView.jsx, ApplicationsPanel.jsx, ProjectsPanel.jsx, ProjectsView.jsx,
  InboxView.jsx, NotificationsView.jsx, ProfileView.jsx, SettingsView.jsx.
- Database: no change. Endpoints: none new (is_verified, the newest
  identity_verifications row and profiles.created_at are already readable by
  the person).

## Progress

- Step 0 (clients need a verified ID to post): built and pushed (47468dc).
  Its SQL is live since 2026-10-27 (migration client_verify_to_post), after
  a rolled-back trial of the rule with database/test_client_verify.sql on
  the live database: 6 checks, 0 failed, nothing left behind. On that day
  2 of the 19 clients were verified, and 7 of the 11 job posts came from
  clients who are not (they stay up).
- Step 1 (the tour engine, Part 1 and Part 2, both roles): built. Details
  that were settled while building:
  - "New account" = the sign-in's own creation time (no request), on or
    after 2026-10-26 and less than 7 days old, so it doesn't start again
    months later on a new phone. A private window never starts it by itself.
  - Saved per person in the browser as philfreela-tour-<id>:
    { mode: on | paused | waiting | review | done, part, index, shown }.
    The old "seen" flag (philfreela-tour-seen-<id>) is no longer used.
  - "Your turn" points at the form's Back / Next row (on a computer without
    a webcam, at the big QR panel); the tour then hides and comes back by
    itself when the "Waiting for review" box appears (also when the ID was
    sent from a phone through the QR code).
  - The browser's Back button during the tour pauses it (it doesn't pull
    the person back to the page).
  - The outline no longer glides between parts: it follows the part on
    every frame, so it stays on the menu while the menu slides open.
  - The note can also go to the left of a part, and is placed by its real
    height.
- Step 2 (Part 3 for freelancers): built, 33 notes ("Full tour · 2 of 32";
  the job row is optional, it is skipped when there is no job): My Services
  (menu link, then title, category, description, skill, starting price,
  photos/videos, Upload & Publish, your offers, Check a file I found), the
  dashboard's jobs (menu link, search, Projects / Jobs, the first job),
  Bookings, Project (My Applications, My Projects), Inbox, Notifications,
  the account menu, Profile (description, skills, portfolio, your numbers),
  Settings (the tab list, GCash Payment), and the end. (2026-10-27: the
  Freelancer Pro note moved with Pro to its own page: a note on its menu link,
  then one on the Pro plan card; 33 counted notes, step 2's test run again:
  538 checks, 0 failed.)
  A part too tall for the note to fit beside it (My Projects and Your
  numbers on a phone) is outlined only down to the note, so the note never
  sits on what is outlined.
- Step 3 (Part 3 for clients): built, 31 notes ("Full tour · 2 of 29"; the
  camera note is on computers only and the first offer is optional): Post a
  Project (menu link; "What are you posting?", which the client answers by
  pressing Project or Job inside the outline; title, category, description,
  skills with the AI's ideas, budget, dates, freelancers needed, the post
  button, your posts), the dashboard's services (menu link, category and
  search, search with a picture, the first offer), Bookings, Projects &
  Resumes (applications and resumes, My projects: price, work, recording the
  GCash payment, Done, rating), Inbox, Notifications, the account menu,
  Profile (description, completed projects, your numbers), Settings, and the
  end. Back never returns to a note the person answered by pressing (the
  choice is gone once pressed); it goes to the note before it.

## What is left

- One try on the live site with a brand-new account (it needs a real sign-up
  and an admin to approve the ID).
- The paper's eKYC section still says freelancers only.

## Build order (each one tested, committed and pushed)

1. The tour engine, Part 1 and Part 2 (both roles), new accounts only, the
   approved / not approved cards.
2. Part 3 for freelancers.
3. Part 3 for clients.

Tests: a real browser against a pretend database (as before), laptop and
phone, dark and light: new vs old account, the ID waiting / approved /
not approved, moving between pages, Back, Skip and going on later, the
suspended account, the Post a Project click.

## Decided (2026-10-26)

Clients are guided to verify too, the same as freelancers: their Post a
Project lesson waits until they are verified. Plan approved with that answer.

Then a new rule from the user, the same day: "clients are not able to post
too, unless it's verified, just like freelancers". So it is a real rule, not
only the tour (Step 0 below).

## Step 0: clients need a verified ID to post (new rule)

- Database (database/supabase_client_verify_schema.sql): the insert rule
  "job_posts: clients can insert own" also asks is_verified(auth.uid()), like
  "services: freelancers can insert own". Only new posts: posts already up
  stay visible, and the owner can still edit or delete them (the edit rule
  is not changed, the same as for services).
- Post a Project page: an unverified client sees "Verify your identity to
  post projects" with Verify now instead of the choice and the form (the
  list of their posts stays, with Delete); Featured is off for them, as on
  My Services.
- Get started card: the client's first step is "Verify your identity"
  ("Needed to post a project"); while it is waiting: "you can't post a
  project, but you can message freelancers and book their services".
- Not changed: posts from clients who are not verified are NOT hidden from
  freelancers (unverified freelancers' offers are hidden from clients). Hiding
  them would empty Find Jobs for the demo clients, who are not verified.
- Order: the website first (it only adds a notice), then the SQL in the
  Supabase SQL Editor (the connector is offline in this session), then
  database/test_client_verify.sql (6 checks, rolled back).
