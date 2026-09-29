# Hybrid Recommendation System: plan and progress

Last updated: 2026-09-29. To continue in a new Claude session, say:
"Read PLAN-hybrid-recommendation.md and continue from the current step."

Feature 1 in PhilFreela-System-Functions.md: content-based filtering,
collaborative filtering and a ranking/scoring algorithm. Each step gets a
detailed plan approved by the user before any code.

## Part 1: AI search box (content-based filtering): built

Live since 2026-09-29. Details (tests, cut-offs, files) are in
PLAN-hard-features.md, Step 1. The meaning numbers of every service and job
post are kept in `listing_embeddings` (all-MiniLM-L6-v2, pgvector) and reused
below.

## Part 2: "Recommended for you" (collaborative filtering + ranking)

Plan approved by the user on 2026-09-29 ("ok"), with the defaults below.

What the user sees:

1. A "Recommended for you" row at the top of the dashboard home:
   freelancers get jobs (View job), clients get services (freelancer name,
   Message).
2. Each card shows short reasons: "Matches your profile/services",
   "Freelancers like you applied here" / "Clients like you contacted them",
   "Verified", "Replies within an hour", "New".
3. New users with nothing to go on get "New and trusted on PhilFreela" and
   a tip to write a profile description or post something.

How it works (for the defense):

1. Content-based filtering: the user's "taste" is the average of the
   meaning numbers of their profile description, their own posts, and (for
   freelancers) the jobs they applied to. Posts of the other kind closest to
   it are candidates. (Addition to the approved plan: the profile
   description, because the paper says content-based filtering matches
   freelancer profiles with job posts, so a new user with a description
   already gets real recommendations.)
2. Collaborative filtering (user-based, Jaccard similarity): users whose
   choices overlap with yours (clients who contacted the same freelancers,
   freelancers who applied to or contacted the same clients' jobs); their
   other choices become candidates, weighted by how alike they are.
3. Ranking: one score per candidate, top 8 shown.
4. The AI service returns only post ids; the website loads the posts under
   the normal database rules, so hidden posts stay hidden.

Defaults (the user said ok):

- Activity used for collaborative filtering: messaging someone, applying to
  a job. Page views are not tracked (less personal data under RA 10173).
- Ranking weights: relevance 40%, collaborative 25%, response time 15%,
  verified identity 10%, new post 10%. Ratings and completed projects: 0%
  until feature 5 (profile transparency) exists.
- Response time: the owner's typical (median) wait before replying over the
  last 30 days: under 1 hour = full, same day = partial, slower or no reply
  after a day = low, no chats yet = neutral.
- New post: full for the first 7 days, fading to zero by 60 days.
- Posts the user already applied to, or whose owner they already contacted,
  are left out.

Files:

1. New `database/supabase_recommendations_schema.sql`: `profile_embeddings`
   table, `profiles_to_embed`, `recommendation_interactions`,
   `content_candidates`, `collaborative_candidates`, `ranking_signals`
   (service role only).
2. New `ai-service/recommendations.py` (weights in one place),
   `GET /recommendations` in `ai-service/main.py`; `listing_search.py` also
   fills in profile numbers.
3. `client/src/lib/aiService.js` (`getRecommendations`), new
   `components/RecommendedForYou.jsx`, and the panel on the two home pages
   (`FreelancerFYPView.jsx`, `ClientHomepageView.jsx`, both small wrappers,
   so Find Jobs and Browse Services stay untouched).

Tests: made-up accounts with profiles, posts, messages and applications:
each part alone (content, collaborative, ranking order, reasons, new-user
fallback), then a browser test on both home pages.

## Later (not planned yet)

- Ratings and completed projects in the ranking (needs feature 5).
- Using the ranking to order search results too.
- Demo data for the defense (the live site has very few posts and chats).

## Current step

Part 2: built and pushed live (2026-09-30). Migration "recommended_for_you"
has been run, so don't run `supabase_recommendations_schema.sql` again.

Test results (laptop against the live database, 9 made-up accounts: 5
freelancers, 4 clients, with profiles, services, job posts, chats and
applications; deleted afterwards):

- Endpoint checks 15/15: clients get services and freelancers get jobs;
  already-contacted freelancers and already-applied jobs are left out;
  collaborative picks ("Clients like you contacted them": C2 also contacted
  F1, then F3; "Freelancers like you applied": F5 also applied to the logo
  job, then the store job); a freelancer with only a profile description
  gets the logo and tarpaulin jobs first; a brand-new client gets "New and
  trusted" (not personalized) with the verified fast replier first and the
  slow replier last; logged out is refused.
- Browser checks 14/14 on both home pages: panel and reasons, "View job"
  opens the job page, Message opens a chat, the usual lists still show
  below, phone layout.
- Tuning: the "Matches your ..." reason needs relevance 0.40 (related posts
  scored 0.43-0.78 against a taste, unrelated 0.18-0.25).
- Fixed on the way: dates with 5 digits of fractions of a second broke the
  "new post" score on the laptop's Python 3.10.

Files: `database/supabase_recommendations_schema.sql`,
`ai-service/recommendations.py`, `ai-service/main.py` (`GET
/recommendations` + 1 import), `client/src/lib/aiService.js`
(`getRecommendations`), `components/RecommendedForYou.jsx`,
`views/FreelancerFYPView.jsx`, `views/ClientHomepageView.jsx`.

Next: when feature 5 (another session: PLAN-projects-and-ratings.md) adds
ratings and completed projects, add them to `WEIGHTS` in
`recommendations.py` and to `ranking_signals`.
