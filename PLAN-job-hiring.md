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
2. Admin Listings > Job Posts: badge, numbers, filter pills and the Hiring trail in
   the View pop-up.
3. Client: "Hired freelancers" under each post and on the owner's job page.
4. Admin Overview: the Hiring card.
