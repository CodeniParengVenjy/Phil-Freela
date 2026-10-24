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
  budget amount (optional) counted per project (a One-time Project, locked) or
  per day / per month (an Ongoing Job); start date and due date (both
  required); freelancers needed (1 to 10, default 1).
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
- The budget basis follows the type (the user corrected my first default, which
  allowed all three for both, on 2026-10-24): a One-time Project is per project
  ONLY (the box is locked), an Ongoing Job is per day or per month ("per month"
  first, no "per project"). The database refuses any other pair
  (`job_posts_type_budget_check`, migration `job_post_details_type_budget_rule`,
  applied after the form was live). Switching the type in the form changes the
  basis to one that fits.
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
   `job_post_details_state_and_rules`, `job_post_details_ai_functions`. A
   freelancer who APPLIED can still see a post that filled or expired (so My
   Applications keeps working), which would have kept it listed as an opening in
   Find Jobs; found while planning the browser test, fixed with a second
   function `job_state(job_posts)` that the web API exposes as a column
   (`job_post_details_state_column`), so lists ask `.eq("job_state", "open")`.
   Section 8 (start_date and due_date NOT NULL) was applied AFTER step 2 was
   live (`job_post_details_dates_required`), so the old form never broke. Six
   older SQL files that insert job posts got the two date columns (demo_data,
   test_admin_log, test_archives, test_blind_ratings, test_post_edit,
   test_post_remove_resumes). Final run of `test_job_post_details.sql` on live:
   42 checks, 0 failed, rolled back, nothing left behind. `test_post_edit.sql`
   still 17 of 17. Later the same day the budget-basis rule above was added
   (section 3b of the schema file) and the test grew to 46 checks (all pass). The
   test now needs only ONE verified freelancer (the second applicant's
   applications are added as the owner): people switch between client and
   freelancer, and on 2026-10-24 the number of verified people currently in the
   freelancer role dropped from 2 to 1 while it was being run.
2. DONE (2026-10-24, website; commit ea1cc8e): `PostNeedView.jsx` (type cards that
   reuse the Settings `.mode-choice` look, budget with basis, required start and
   due dates, freelancers needed, Open / Filled / Expired badges, "1 of 2 hired",
   Reopen with a note that is checked to be really visible after the scroll),
   `FindJobsView.jsx` (type badge, "₱5,000 per project", dates, All / Projects /
   Jobs pills, open-only filter except for admins), `JobDetailsView.jsx` (type,
   budget basis, dates, "Needs N freelancers", owner lines), `SearchResultsView.jsx`
   (open-only, budget wording), new `lib/jobTerms.js`, `lib/privacy.js` export.
   The page's own copy of the open / filled / expired rule (`jobState` in
   `lib/jobTerms.js`) is only for the owner's badges; the database's `job_state()`
   is the one that decides who sees what. Browser check against a fake backend
   that imitates the new database rules and refuses columns the real table
   lacks, laptop and phone: 126 checks, 0 failed (the script is not saved in
   the repo; the commit message lists what it covered).
3. DONE (2026-10-24, AI skills): `ai-service/skills_list.py` (348 skills in the 18
   categories, each with other ways people write it), `ai-service/skills.py`,
   `POST /skills/suggest` and `POST /skills/match` in `ai-service/main.py`,
   `suggestSkills` and `matchSkill` in `client/src/lib/aiService.js`, and the form:
   once there are a title and a description, "AI suggests:" shows up to 6 tap-to-add
   chips (asked again after a pause, and again after each tap, with the chosen
   skills in `have`; a slow older answer is ignored); a typed skill is added at once
   and then tidied to its standard name ("vid editng" -> "Video Editing", dropped
   if the standard one is already there); a skill the AI doesn't know stays as
   typed; when the AI service is offline the form says so and typing works as before.
   How suggestions are chosen (all in `skills.py`): meaning (the same pretrained
   MiniLM as the search box: job text vs the skill's name) + words (the skill or
   another spelling is really in the text: +0.30 / +0.14) + category (+0.10);
   a skill needs meaning >= 0.25 and >= 70% of the best one, or a words hit; a
   skill named by an everyday word ("Swift", "Notion", "Sales", "Editing") is only
   suggested in its own category. Numbers chosen from a grid over 33 made-up job
   posts: 90% of the expected skills are among the 6 suggested (72 of 80), about
   1.8 others per post, "Walk my dog" gets nothing. Typed-skill tidying uses
   spelling, not meaning: meaning alone merged "data analytics" into "Google
   Analytics". Known limit: a typo rule can't tell "Canvas" from a typo of "Canva".
   `ai-service/test_skills.py`: 124 checks (list integrity, the made-up posts, the
   rules, typed skills, the two endpoints with the login check replaced), run with
   `python test_skills.py` in the service's venv. Browser check of the form with
   a fake AI service, laptop and phone: 171 checks in total with the earlier ones.
   Goes live when the push is deployed (the Vercel AI service redeploys from
   main; until then the form just says the AI ideas aren't available).

## Later (optional)

- "You have 3 of 5 of the skills" on the job page.
- A notification to the owner on the day a post expires (needs a daily job like
  the archives one).
