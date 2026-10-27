# Job hiring: monitor it and trace the hired freelancers (plan and progress)

Status (2026-10-25): approved ("gooo"). Four steps, in order. To continue in a new
Claude session, say: "Read PLAN-job-hiring.md and continue from the current step."

## Why

The adviser's weekly-form comments (a photo of the handwritten form):

1. "How are you going to monitor job hiring from posted jobs?"
2. "Can you trace the hired freelancers from the posted job?"

## What was already there

The trail exists in the data: a hire (`hire_applicant()`) starts a project that
keeps the job post's id (`projects.job_post_id`) and the application it came from
(`projects.application_id`). The project page already links back to its post. What
was missing was showing it: the owner saw only "1 of 2 hired", applicants were one
flat list in Projects & Resumes, and the admin's Job Posts tab showed only title,
category and budget. The admin can't read projects or applications directly (RLS:
only the two people on them), so the admin side needs functions.

On 2026-10-25 the live database had 11 job posts, 1 application, 4 projects and
none of the 4 came from a job post (they came from bookings), so there is no real
hire to look at yet; the tests make their own.

## What people see

- Admin > Listings > Job Posts: a status badge (Open / Filled / Expired), "N
  applicants - X of Y hired" on each row, filter pills (All / Open / Filled /
  Expired), and a "Hiring trail" in the View pop-up: each applicant, Applied or
  Hired, the project's status (started, submitted, done) and a link to the project.
- Client: under each post in Your Active Listings, and in the owner view of the job
  page, a "Hired freelancers" list (name linked to their profile, project status,
  link to the project).
- Admin > Overview: a small "Hiring" card (posts open / filled / expired, total
  applications, total hires), whose Open / Filled / Expired numbers open Listings
  already filtered, and (Step 6) a "Hired freelancers" list of every hire.

## Defaults I chose

- Resumes and cover notes stay private: the admin trail returns names and
  statuses only.
- A post's own numbers (applicants, hired) are its full record, so "Filled" always
  agrees with "hired" (nobody is left out). The totals for the Overview follow the
  other Overview numbers: an archived account is left out (a post of an archived
  client, or an application or hire with an archived person on it, is not counted).
  In the trail an archived applicant is still listed, marked archived.
- Only hires made from a job post count as hires; a project that came from a
  booking (an offer) is not one.

## Steps

1. DONE (2026-10-25, database): `database/supabase_admin_job_hiring_schema.sql`
   (two admin-only functions, no table, nothing existing changed) and
   `database/test_admin_job_hiring.sql`.
   - `admin_job_hiring()` returns `{ posts: [{ id, state, applicants, hired }],
     totals: { open, filled, expired, applications, hired } }`.
   - `admin_job_trail(target_job)` returns the applicants of one post, hired ones
     first (earliest hire first), then the others by the day they applied:
     `{ application_id, freelancer_id, full_name, username, avatar_path, archived,
     applied_at, project_id, project_status, hired_at, due_date }`.
   - Tested: schema and test sent together in one call, rolled back, 38 checks, 0
     failed (shape, the four made-up posts open / filled / expired / nobody applied,
     state equals `job_state()`, numbers equal counting the tables, newest first,
     totals move by exactly the made-up data, trail order and fields, no resume or
     cover note returned, an archived applicant / hired freelancer / client, a
     normal user, the post's own client and a signed-out visitor refused). Applied
     live as the migration `admin_job_hiring` (no DROP or DELETE); live now: 11
     posts, 6 open, 5 expired, 1 application, 0 hires; the user number counter was
     not used.
2. DONE (2026-10-25, website): `AdminListingsView.jsx` (Job Posts tab: State and
   Hiring columns, the budget now says its basis, state pills All / Open / Filled /
   Expired with counts that work together with the search and the category, a
   sentence if the hiring numbers can't load while the list keeps working, and in
   the View pop-up the type, dates, state, "2 of 3 hired - 3 applicants" and the
   trail), new `admin/components/HiringTrail.jsx` (each applicant: picture or
   letter, name linking to Admin > Users with the username in the search box,
   Hired / Applied, the project's status, hire date and due date or applied date,
   an Archived badge), a few lines in `admin.css`. The admin has no project page
   to link to (a project is private to its two people), so the trail shows the
   project's status instead of a link. Browser check against a fake backend,
   laptop and phone (390px): 57 checks, 0 failed (the 8 columns, every state and
   its numbers, singular and plural, pills and counts, filter plus search, the
   filter resetting when you change tab, trail order and fields, the name link,
   loading, an empty trail, a failed trail, hiring numbers failing, very long names
   staying inside their rows, no sideways scrolling). The script is not saved in
   the repo. Lint and build clean.
3. DONE (2026-10-25, website): new `dashboard/components/HiredFreelancers.jsx`
   (picture, name linking to their public page, "Hired <date>", the project's
   status badge and a round button that opens the project; "Freelancer" with no
   link if a profile can't be read; "Nobody hired yet." on the job page when there
   is no one), `lib/jobTerms.js` (`HIRES_FIELD`, the query piece
   `hires:projects(id, status, started_at, due_date, freelancer:profiles!projects_freelancer_id_fkey(...))`,
   and `hiresOf()`, earliest hire first), `PostNeedView.jsx` (the list under each
   post in Your Active Listings), `JobDetailsView.jsx` (the owner's box). No
   database change: the owner can already read their own projects. The query shape
   was checked against the live API (a wrong relationship name is refused with
   PGRST200, this one is accepted). Browser check against a fake backend, laptop,
   phone (390px), dark and light: 30 checks, 0 failed (two hires in the right order
   when the API sends them the other way round, statuses and colors, both links,
   a hire without a readable profile, nobody hired, the filled post, a very long
   name, light-mode contrast, no sideways scrolling). Lint and build clean.
4. DONE (2026-10-25, website): `AdminOverviewView.jsx` has a "Job hiring" part
   after Transactions: a "Job posts" card (Open / Filled / Expired, "N in total")
   and an "Applications and hires" card (Applications, Freelancers hired, no "in
   total" because the two numbers are not parts of one whole), with a link to
   Listings. It is its own part: if the hiring numbers fail one sentence replaces
   its cards and everything else stays, and the other way round. `StatusCounts.jsx`
   got a `showTotal` prop (on by default, so Bookings and Projects are unchanged).
   Uses `totals` of `admin_job_hiring()`. Browser check against a fake backend,
   laptop and phone: 18 checks, 0 failed (order of the sections, the numbers, zeros,
   very big numbers, the Listings link, each part failing on its own, no sideways
   scrolling). Lint and build clean.

## Step 5 (PROPOSED 2026-10-25, waiting for the user's OK): sample hires in demo_data.sql

Why: the live database has 11 job posts, 1 application and 0 hires from a post
(counted 2026-10-25), and the 6 demo accounts are NOT on the live site now (0
demo logins), so there is nothing to show in the trail at the defense. Only
`database/demo_data.sql` changes. `demo_data_remove.sql` stays as it is: removing
the demo logins already removes their posts, applications and projects.

The story (5 posts, 6 applications, 3 hires; only verified freelancers apply, so
Juan, Ana and Marco; Rico is not verified):

1. Maria, "Logo and menu design for a new coffee shop branch": needs 2. Ana
   applied and was hired (project started, due in 10 days); Marco applied, not
   hired. Open, "1 of 2 hired - 2 applicants".
2. Maria, "Holiday promo video" (the existing anniversary post, renamed so it
   matches the existing project): needs 1. Juan applied and was hired; that is the
   existing "Holiday promo video" project (submitted, waiting for Maria's
   review), now linked to the post. Filled, "1 of 1 hired".
3. Maria, "Logo for our coffee shop" (new, posted ~95 days ago): needs 1. Ana
   applied and was hired; that is the existing finished "Coffee shop logo"
   project (done, rated 5 and 5), linked to the post. Filled, trail shows Done.
4. Maria, "Flyers for our cafe's opening weekend" (new, posted 45 days ago, due 15
   days ago): Ana applied, nobody hired. Expired.
5. Sofia, "Product photos for a boutique's online store" (existing): Marco
   applied, not hired yet. Open, "0 of 1 hired - 1 applicant".

Changes inside demo_data.sql:
- The 3 job posts get `freelancers_needed`; post 2 gets its new title and words;
  two new posts (3 and 4) are added; posts 1 and 2 and 5 are kept.
- Six rows into `job_applications` (resume_path in the required shape).
- The projects for hires 1-3 carry `application_id` and `job_post_id`: hires 2
  and 3 are the projects the script already makes (two columns added to those
  inserts, nothing new), hire 1 is one new `started` project for Ana. No new
  `done` project, so the ratings and "on time" numbers do not move.
- The final self-check: Maria's listings become 4 (Sofia stays 1); new checks that
  `job_state()` gives open / filled / filled / expired / open, and that there are
  6 applications and 3 hires. Anything off stops the script and adds nothing.
- The header comment (counts of posts, projects) updated.

Limits to know:
- The 6 applications have no real PDF behind them, so "View resume" on a demo
  applicant fails to open. The admin trail and the client's "Hired freelancers"
  list never open resumes, so they are unaffected.
- The hires are inserted directly, not through `hire_applicant()`, so Ana and Juan
  get no "You were hired!" notification.

Steps:
1. Edit `demo_data.sql` as above (and a line in PLAN-demo-data.md).
2. Dry run on the live database inside one rolled-back call (the user-number
   counter checked before and after, like the other tests): the script's own
   checks plus a read of `admin_job_hiring()` / `admin_job_trail()` for the five
   posts as an admin. Nothing is left behind.
3. NOT part of the plan until the user says so: running it for real on the live
   site (it adds 6 made-up accounts that classmates would see until
   `demo_data_remove.sql` is run, see PLAN-demo-data.md).

## Step 6 (DONE 2026-10-28, database + website): who was hired, on the Overview

The user (2026-10-28): when a post is Filled it disappears from freelancers, so the
admin must still be able to track it: "in the overview hired in the overall hired,
in the by posts hired in a specific number of getting hired". A post is never
deleted by a hire: it only becomes Filled (hidden from Find Jobs and search, still
seen by the freelancers who applied, by its client and by every admin). The
per-post number ("2 of 3 hired") and the Filled filter were already in Listings
(Step 2); what was missing was the overall list on the Overview.

- Database: `database/supabase_admin_job_hires_schema.sql` (one admin-only
  function, no table, nothing existing changed), applied live as the migration
  `admin_job_hires`, and `database/test_admin_job_hires.sql`.
  - `admin_job_hires()` returns every hire made from a job post, newest first (the
    newest 200 at most): `{ project_id, job_post_id, job_title, job_state, hired,
    needed, freelancer_id, full_name, username, avatar_path, client_name,
    project_status, hired_at, due_date }`. An archived freelancer or client is left
    out, so it agrees with "Freelancers hired" above it; a project from a booking
    is not a hire; no resume or cover note.
  - Tried live in one rolled-back call with the schema (24 checks, 0 failed: shape,
    three made-up hires with their post state and "hired / needed", names and dates
    from the real rows, newest first, the length equals `admin_job_hiring()`'s
    hired total and counting the projects directly, archiving f2, f1 and the client
    takes their hires out, and a normal user, the client, a hired freelancer and a
    signed-out visitor are refused). Then applied; checked afterwards: the function
    exists, anon can't run it, signed-in can, no "Test hires" rows left, the two
    e-mail triggers on again, the user-number counter 40 = max 40. The live
    database has 0 hires from a job post, so the list says "Nobody has been hired
    from a job post yet." until a client hires someone (the 4 other projects came
    from bookings).
- Website:
  - new `admin/components/HiredList.jsx`: the "Hired freelancers" card under the two
    Job hiring cards of the Overview (its own request, own loading / failed / empty
    sentences). Each row: picture, name (opens Users searching for them), the post's
    title (opens that post in Listings with its hiring trail), the project's status,
    the post's state (Open / Filled / Expired), "1 of 3 hired", the hire date and the
    due date. The 10 newest show, then "Show all (N)" / "Show fewer".
  - `StatusCounts.jsx`: an item can have `to`, making its number a link. The Job
    posts card's Open / Filled / Expired link to `/admin/listings?state=...`.
  - `AdminListingsView.jsx` reads the address: `?state=open|filled|expired` opens
    the Job Posts tab with that pill on (an unknown value is ignored; if the hiring
    numbers failed the filter is not applied, so the list is not emptied), and
    `?post=<id>` opens the Job Posts tab with that post's pop-up (nothing opens if
    the post was removed).
  - `HiringTrail.jsx` exports its `Picture` so the list can reuse it; a few lines in
    `admin.css`.
  - Browser check against a fake backend, laptop and phone (390px): 49 checks, 0
    failed (10 then 12 rows, newest first, every badge and color, exact wording,
    the number links, Filled opening Listings already filtered, a hire's post title
    opening that post's pop-up and asking for its trail, the name opening Users,
    Listings opened directly or with an unknown state or post, the hiring numbers
    failing, empty / exactly 10 / one hire, loading, the list failing while the
    numbers stay and the other way round, long names and titles, no sideways
    scrolling, no page errors). The script is not saved in the repo. Lint (only the
    two old warnings in useDashboardShell.js) and build clean. Not tried on the live
    site.

## Not built (optional)

- The admin has no page for a single project, so the trail shows a project's
  status but cannot link to it.
- The live database has no hire from a job post yet (the 4 projects came from
  bookings), so the trail only shows real data after a client hires an applicant
  (Step 5 above would give the defense some).
