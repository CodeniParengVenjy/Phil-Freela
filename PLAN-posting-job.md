# Posting a job: type, budget basis, dates, openings, AI skills (plan and progress)

Status (2026-10-24): approved ("yeyes"). Three steps, in order. To continue in a
new Claude session, say: "Read PLAN-posting-job.md and continue from the current
step."

## Why

The user asked that Post What You Need (client job posts) ask for:

1. The type of work first: a one-time project or an ongoing job.
2. A budget with its basis: per project, per day or per month.
3. A start date and a due date, both required. When the freelancers the client
   needed are hired, the post must not be visible any more.
4. Required skills handled by the AI.
5. A recommendation for what happens when the due date passes.

## What people see

- Client form, in this order: two cards "One-time Project" / "Ongoing Job"; title;
  category; description; required skills (AI suggestions as tap-to-add chips);
  budget amount (optional) with "per project / per day / per month"; start date
  and due date (both required); freelancers needed (1 to 10, default 1).
- A post is Open, Filled or Expired (worked out, never stored, see
  `job_state()` in `database/supabase_job_post_details_schema.sql`):
  - Filled: as many freelancers were hired as it needed.
  - Expired: its due date passed (the day ends at midnight, Philippine time).
- Filled and expired posts are hidden from Find Jobs, the AI search and
  Recommended for you. Hidden from everyone except the owner, admins and the
  freelancers who applied (their My Applications and project pages keep working).
  The database refuses new applications and new hires for them.
- The owner sees them in Your Active Listings with an Open / Filled / Expired
  badge, "1 of 2 hired", and a Reopen button: edit, pick new dates (or raise
  "freelancers needed") and the post is live again. Nothing is removed, and
  projects already started keep their own due date.

## Defaults I chose

- A post expires after the end of its due date, not at its start date.
- "Freelancers needed" is new (my reading of "depends if already what freelancers
  needed"); 1 unless the client changes it, so most posts hide after the first hire.
- The budget basis is not locked to the type: Project preselects "per project",
  Job preselects "per month", all three are allowed for both.
- Budget and skills stay optional; the AI only suggests skills, the client decides.
- Labels: "One-time Project" and "Ongoing Job" (so "Job" is not confused with "job post").
- Old posts: start = the day they were posted; the 4 that had no due date got
  30 days from 2026-10-24 (2026-11-23). The 4 whose due date had already passed
  are Expired now (hidden from freelancers; the owner still sees them).
- "Skills handled with AI" was read as: the AI suggests skills from the title and
  description and tidies typed ones to a standard name (the user answered "yeyes"
  to that reading).

## Steps

1. DONE (2026-10-24, database): `database/supabase_job_post_details_schema.sql`,
   test `database/test_job_post_details.sql` (40 checks, tried first in one call
   with the schema and rolled back, 0 failed). New `job_posts` columns
   `job_type`, `budget_type`, `freelancers_needed`, `start_date`; rules
   `job_posts_start_date_check`, `job_posts_dates_order_check`; functions
   `job_state()`, `applied_to_job()`, `recent_open_jobs()`; the view rule of
   job_posts, the apply rule of job_applications and `hire_applicant()` (refuses
   filled and expired); `listings_to_embed` (skills are part of a job's AI text),
   `closest_listings`, `content_candidates`, `collaborative_candidates` skip
   closed posts; `ai-service/recommendations.py` `recent_posts` uses
   `recent_open_jobs`. Applied live as `job_post_details_columns`,
   `job_post_details_state_and_rules`, `job_post_details_ai_functions`. NOT yet
   applied: section 8 of the schema file (start_date and due_date NOT NULL),
   because the live website of that moment still posted without dates; it goes
   live right after step 2 is deployed (`job_post_details_dates_required`). Six
   older SQL files that insert job posts got the two date columns (demo_data,
   test_admin_log, test_archives, test_blind_ratings, test_post_edit,
   test_post_remove_resumes). Re-run `test_post_edit.sql` on live: 17 checks pass.
2. (website) `PostNeedView.jsx` form and Your Active Listings, `FindJobsView.jsx`,
   `JobDetailsView.jsx`, `SearchResultsView.jsx`, new `lib/jobTerms.js`,
   `lib/privacy.js` export. Then apply section 8.
3. (AI skills) `ai-service/skills.py` with a hand-made list of about 300 skills,
   `POST /skills/suggest` and `POST /skills/match`, calls in `lib/aiService.js`,
   chips in the form; accuracy test on about 20 made-up jobs. If the AI service is
   offline the form still lets the client type skills.

## Later (optional)

- "You have 3 of 5 of the skills" on the job page.
- A notification to the owner on the day a post expires (needs a daily job like
  the archives one).
