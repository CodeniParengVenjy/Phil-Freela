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
  applications, total hires).

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

## Not built (optional)

- The admin has no page for a single project, so the trail shows a project's
  status but cannot link to it.
- The live database has no hire from a job post yet (the 4 projects came from
  bookings), so the trail only shows real data after a client hires an applicant.
  `demo_data.sql` could be given a few hires if the defense needs them.
