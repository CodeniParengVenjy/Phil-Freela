# Ranking with real records: plan and progress

Last updated: 2026-10-03. To continue in a new Claude session, say:
"Read PLAN-ranking-real-records.md and continue from the current step."

Feature 1 in PhilFreela-System-Functions.md, the ranking / scoring algorithm
of the Hybrid recommendation system. The paper says it "orders matching
freelancers by credibility and performance so the most reliable and
qualified appear first", using ratings, completed projects, response time
and the relevance score.

## Where it stands (checked 2026-10-03)

1. `ai-service/recommendations.py` gives every candidate one score from five
   factors: relevance 0.40, collaborative 0.25, response time 0.15, verified
   0.10, new 0.10. Its own comment says ratings and completed projects "will
   take part of these weights once [Feature 5] exists".
2. Feature 5 exists now (projects, ratings, the real profile numbers), so two
   of the paper's four named factors, ratings and completed projects, are
   still missing from the formula.
3. The "Recommended for you" cards explain themselves with small reason
   chips: match, similar users, verified, replies within an hour, new.
4. The ranking asks the database for each post's owner through
   `ranking_signals` (supabase_recommendations_schema.sql). It works and
   isn't touched by this plan.

## What it builds

1. Two new factors in the score, worked out from the post owner's record in
   the role the post is for: a freelancer's record for a service, a client's
   record for a job post. They are the same numbers a person's profile shows
   (only projects marked Done count).
2. New weights, adding up to 1: relevance 0.30, collaborative 0.15, rating
   0.15, completed projects 0.10, response time 0.10, verified 0.10, new
   0.10. The paper's four named factors (relevance, rating, completed
   projects, response time) add up to 0.65.
3. Two new reason chips on the cards: "Highly rated" and "Experienced".
4. A small test file that checks the scoring without a database.

Everything else stays as it is: the content-based and collaborative
candidates, how many are shown, and the rule that posts hidden from a viewer
stay hidden.

## How the new factors are scored (for the defense)

1. Rating score, 0 to 1: the owner's average stars, pulled toward the middle
   by three imaginary 3-star ratings, so one 5-star rating can't beat a long
   good record. smoothed = (count x average + 3 x 3.0) / (count + 3), then
   score = (smoothed - 1) / 4. No ratings at all gives 0.5, a neutral score
   (the same idea as "no chats yet" for response time). Examples: one rating
   of 5 stars gives 0.63; five ratings of 5 give 0.81; twenty ratings
   averaging 4.8 give 0.89; two ratings of 1 star give 0.30.
2. Completed score, 0 to 1: completed projects divided by 10, at most 1. None
   gives 0, five give 0.5, ten or more give 1.
3. Reasons: "Highly rated" = 3 or more ratings averaging 4.5 or higher.
   "Experienced" = 5 or more completed projects.

## Defaults picked (the user can change these)

- Only projects marked Done count, and only the ratings on them, exactly like
  the profile numbers.
- The weights are a judgment call, not trained (the plan has no data to
  train on). They live in one place, `WEIGHTS`, so they are easy to change
  and to explain.
- Relevance stays the biggest single factor (0.30): the best match for what
  someone wrote still leads, and the record decides between similar matches.
- Newcomers aren't punished by much: a person with no record scores a neutral
  0.5 on ratings, 0 on completed projects, and still gets the "new" and
  "verified" points.

## Not included

- On-time delivery. It isn't one of the paper's factors; it stays on
  profiles only.
- Booking reply speed in the response time. It would change the reply-time
  rule in two places (the profile's `typical_reply_minutes` and the
  ranking's `ranking_signals`), and there are no real bookings yet. The
  bookings table keeps `responded_at` for it, so it can be added later.
- Using the new skills in the content-based part (a later step).
- Using the ranking to order the AI search box results too (listed as
  "Later" in PLAN-hybrid-recommendation.md).
- Demo data for the defense.
- Known limit, good to know for the defense: two accounts working together
  could inflate each other's rating. Identity verification (eKYC) makes that
  harder; the ranking doesn't try to detect it.

## What the user does outside the code

Nothing for the database: the Supabase connector works, so Claude runs the
SQL and checks the live database first. The AI service on Vercel and the
website on Cloudflare redeploy from the push by themselves. After the push,
the user opens "Recommended for you" on the live site (a real record is
needed to see the new chips).

## Step 1: Database (Easy)

New file `database/supabase_ranking_records_schema.sql`.

1. Function `ranking_records(post_ids)`: for each post (a service or a job
   post), the owner's record in the post's role: `completed_count`,
   `rating_count` and `avg_stars` (not rounded), counting only projects marked
   Done and the ratings on them. Run with extra privilege, and only the AI
   service's role may call it (like the other ranking functions). Unknown ids
   are ignored.

Tests (SQL in a transaction that is rolled back afterward; no DELETE
statements, which the database tool refuses without someone to confirm):

1. A service uses its owner's freelancer record, and a job post uses its
   owner's client record, even for a person who has been both.
2. The numbers are the same as `profile_stats` for the same person and role
   (rounded to one decimal), so the profile and the ranking agree.
3. An owner with no projects gets 0, 0 and no average; started and submitted
   projects don't count; a rating on a project that isn't Done doesn't count.
4. Unknown ids give no rows; the browser (signed-in or not) can't call it.

## Step 2: The scoring, the chips and the tests (Medium)

Code:

1. `ai-service/recommendations.py`:
   - New `WEIGHTS`, `rating_score(average, count)` and
     `completed_score(count)`.
   - The scoring loop moves into one small function that only does the math
     (no database), so it can be tested. `recommend()` calls it.
   - `recommend()` asks for `ranking_records` next to `ranking_signals` and
     joins them by post id. If that call fails (for example the SQL hasn't
     been run yet), it logs the problem and the records count as empty, so
     recommendations keep working either way.
   - New reason codes `rated` and `experienced`.
2. New `ai-service/test_ranking.py`: plain Python, run with
   `python test_ranking.py` (no extra packages). It checks the weights add up
   to 1, the example scores above, the reasons' limits, and a few made-up
   rankings: a well-rated experienced owner beats an unrated one with the same
   relevance, a clearly more relevant post still beats a better-rated but
   unrelated one, and a post with no record at all still ranks sensibly.
3. `client/src/pages/dashboard/components/RecommendedForYou.jsx`: the two new
   chips, and the subtitle says the picks also consider each person's record.

Tests: the Python file (run here with the service's own virtual
environment), then the browser (Playwright with a fake backend, as in the
earlier plans) with a made-up AI answer: the new chips show next to the old
ones, unknown reason codes are still ignored, laptop and phone.

## Current step

Plan approved by the user on 2026-10-03 ("all step"), so both steps are built
one after another, each pushed when done.

Step 1 (Database): built and pushed (2026-10-03). Its SQL has been run on
Supabase (migration "ranking_records"), so don't run it again. Tested in
transactions that were rolled back afterward (nothing left behind, checked
afterward): a service uses its owner's freelancer record (2 completed, 2
ratings, average 4.5, ignoring a started project, a submitted one and a
rating on a project that isn't Done); a job post uses the same person's client
record (1 completed, 1 rating, average 2.0); a second service of the same
owner gets the same record; an owner with no projects gets 0, 0 and no
average, for a service and for a job post; five real posts give five rows
and an id that isn't a post gives none; an empty list gives no rows; the
numbers match `profile_stats` for the same person and role (to one decimal),
so the profile and the ranking agree; a signed-in user and a signed-out
visitor can't call it (only the AI service's role can).

Step 1 file: `database/supabase_ranking_records_schema.sql`.

Step 2 (The scoring, the chips and the tests): built and pushed
(2026-10-03). No new SQL. Tested three ways:

1. `python test_ranking.py` (run here with the AI service's own virtual
   environment, no database, no model): 33/33 passed. It checks the weights
   add up to 1 and the paper's four factors to 0.65; the rating examples (none
   0.5, one 5-star 0.63, five 5-star 0.81, twenty averaging 4.8 0.89, two
   1-star 0.30), that more ratings are worth more and an average that arrives
   as text is read; completed projects (0, 0.5, 1); made-up rankings (a
   well-rated experienced owner beats an owner with no record at the same
   relevance, a bad record ranks below no record, one 5-star rating doesn't
   beat a long good record, with equal records the better match leads, a
   clearly better match with no record beats an unrelated post with a decent
   record, a post with no record row is scored without a problem, verified and
   fast replies help); the reasons' limits and their steady order; and the
   whole `recommend()` flow with a fake database client: the owners' records
   are asked for and put the credible owner first among equal matches, and if
   the records can't be read (for example the SQL isn't run yet) the ranking
   still works without them.
2. The whole AI service still loads (`import main`, with its
   `/recommendations` route) and the changed files compile.
3. The browser (Playwright, the fake backend, with a made-up AI answer):
   10/10 passed, no page errors. Both new chips show next to the old ones in
   the AI's order, an unknown reason code is skipped, job cards for
   freelancers read "Matches your work / Highly rated / 5+ projects done", the
   subtitles mention each person's record, the "New and trusted on
   PhilFreela" fallback still shows the chips, and on a 390 px phone seven
   chips wrap inside the card. The earlier browser suites (Booking and
   profiles) were run again and still pass.

Not tested: the live AI service itself, since asking it needs a signed-in
user. Still needs the user to open "Recommended for you" on the live site
once there are real completed and rated projects (the new chips only appear
for owners with a record).

Changes from the plan:
- The scoring loop is now `score_posts(signals, records, content,
  collaborative)` in `recommendations.py`, pure math with no database, plus
  `fetch_records(supabase, post_ids)`; `recommend()` calls both.
- The test file also tests `recommend()` with a fake database client, to
  check the "carry on without records" safety net.

Step 2 files: `ai-service/recommendations.py`, `ai-service/test_ranking.py`
(new), `client/src/pages/dashboard/components/RecommendedForYou.jsx`.

Both steps in this plan are built. This plan is done.
