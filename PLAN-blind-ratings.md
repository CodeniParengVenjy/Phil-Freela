# Blind ratings: plan and progress

Last updated: 2026-10-07. To continue in a new Claude session, say:
"Read PLAN-blind-ratings.md and continue from the current step."

Ratings are already built (PLAN-projects-and-ratings.md, Step 4): once a
project is Done, the client rates the freelancer (stars + optional
feedback) and the freelancer rates the client (stars only). This plan makes
those ratings **blind**, and matches the ratings page to the mockups.

Graded function this supports: Feature 5, Profile transparency. A rating is
more honest when it can't be copied from, or answer back to, the other
person's rating.

## What is not blind today (checked 2026-10-07)

1. The moment one side rates, the other side gets a notification with the
   stars and the feedback in it.
2. The rating shows right away in the average stars, the Completed Projects
   list, the Performance box and the recommendation ranking.
3. Any signed-in user can read every rating in the database.
4. There is no time limit, so someone can wait, read the other rating, and
   then rate.

## How it will work

1. A rating stays **hidden** until both sides have rated, or 14 days have
   passed since the project was marked Done.
2. Rating **closes** 14 days after Done. After that, a rating that was
   never answered becomes visible on its own.
3. You can always see the rating you gave.
4. A hidden rating does not count anywhere: not in the average stars, the
   Completed Projects list, the Performance box, or the ranking.
5. Notifications:
   - First rating on a project: "Maria rated you for "Promo video". Rate
     them within 14 days to see it." No stars, no feedback.
   - Second rating: the first person gets "Juan rated you 5★ for ..." with
     the feedback, as today. Both ratings are visible from that moment.

## Defaults picked (the user can change these)

- The limit is 14 days, counted from when the client marked it Done.
- The freelancer still rates with stars only, as in the mockup.
- Ratings still can't be edited or removed.
- A hidden rating shows as "Not rated yet" on a profile, so nobody can tell
  a hidden one from a missing one.
- No notification when the 14 days end (that would need a scheduled job).
  The rating just becomes visible.

## Not included

- Hiding who gave a rating. A project has only two people, so the name is
  always known.
- A feedback box for the freelancer.
- Reminders to rate before the 14 days end.
- Admin tools for removing a rating.

## What it changes for today's data

Nothing. Checked on the live database: 8 Done projects, 16 ratings, every
project rated by both sides, so all of them stay visible.

## What the user does outside the code

Nothing. Claude runs the SQL on Supabase. After each push, test on the
live site (phil-freela.pages.dev).

## Step 1: The blind rule in the database (Medium)

No new tables and no new columns. New file
`database/supabase_blind_ratings_schema.sql` (run after the projects,
profiles and ranking-records files). Nothing in it removes anything.

1. New function `rating_is_visible(target_project)`: true when the project
   has both ratings, or its Done date is 14 days ago or more. It runs with
   the owner's rights, because the read rule below calls it and a rule
   can't read its own table through itself.
2. Read rule on `project_ratings` (changed with `alter policy`): you can
   read a rating if you gave it, or if `rating_is_visible` is true. Today
   it is "everyone can read everything".
3. Insert rule on `project_ratings` (changed with `alter policy`): the same
   checks as today, plus the project must have been marked Done less than
   14 days ago.
4. Four functions count only visible ratings (one extra line in each):
   - `rating_summaries` (the "★ 4.8 (5)" badge)
   - `profile_stats` (the Performance box)
   - `profile_history` (the Completed Projects list)
   - `ranking_records` (the AI ranking; no change in the AI service)
5. Trigger function `notify_project_rated`: the two messages above. It
   still sends one notification per rating, to the person who was rated,
   with the same kind (`project_rated`), so the notification rule and
   `lib/notifications.js` don't change.

New file `database/test_blind_ratings.sql`: the checks from "Tests" below.

## Step 2: The website (Easy)

No new endpoints.

1. `lib/projects.js`:
   - `RATING_WINDOW_DAYS = 14` and `ratingClosesAt(project)`.
   - `getRatingOfMe(userId, projectId)`: the other person's rating of you.
     The database only returns it once it is visible.
   - `rateProject`: a clear message when the 14 days have ended.
2. `views/FeedbackView.jsx`:
   - A short note: "Blind rating: Maria won't see this until they rate you
     too, or on Oct 21."
   - "The rating period for this project has ended" after 14 days.
   - The mockup layout: title on the left with no "CONTRACT EVALUATION"
     badge, "Give a feedback:" with "(optional)" inside the box, stars on
     the left under their label with no box around them, and a "Submit"
     button. Kept from today: the dark theme, the line saying who and which
     project you are rating, and the character counter.
3. `views/ProjectDetailsView.jsx`, on a Done project:
   - Not rated yet: the button, plus "You have until Oct 21".
   - Not rated and the 14 days ended: "The rating period has ended."
   - You rated, they haven't: "You rated 5/5. Hidden from Maria until they
     rate you, or on Oct 21."
   - Both visible: "You rated 5/5" and "Maria rated you 4/5" with her
     feedback.
4. `pages/legal/TermsOfService.jsx`: the Ratings paragraph says ratings are
   hidden until both sides rate or 14 days pass.
5. `DEMO-GUIDE.md`, step 4: after Maria rates Juan, his numbers no longer
   change right away. The step becomes: Maria rates Juan, sign in as Juan
   (his notification shows no stars), Juan rates Maria, and then both
   ratings and his new numbers appear.

No change needed: `components/CompletedProjects.jsx`,
`components/PerformanceBox.jsx`, `components/StarRating.jsx`,
`lib/ratings.js`, `lib/privacy.js`, `lib/notifications.js`, the AI service.

## Tests

The database, in one test that rolls itself back (made-up users, nothing
left behind):

1. After the client rates: the freelancer can't read that rating, a third
   user can't either, the client can read their own.
2. The freelancer's notification has no stars and no feedback.
3. The client's average, Performance box, Completed Projects row and
   ranking numbers are unchanged while it is hidden.
4. After the freelancer rates: both ratings are readable by everyone, both
   count, and the client's notification has the stars.
5. Only one side rated and the Done date is 15 days ago: the rating is
   visible and counts, and the other side is refused when they try to rate.
6. Still refused, as before: rating before Done, rating yourself, rating a
   project you are not on, rating twice.

The website (Playwright with the fake backend), laptop and phone, in dark
mode and in light mode with a light accent color: the client's page and the
freelancer's page match the mockup layout, the blind note shows the right
date, the four states of the project page, and the "period has ended" page.

## Current step

Plan approved by the user on 2026-10-07 ("ok I guess??"), so both steps are
built one after the other.

Step 1 (the blind rule in the database): built and pushed (2026-10-07). Its
SQL has been run on Supabase (migration "blind_ratings"), so don't run it
again. Tested first as a trial on the live database: the whole schema file
plus `database/test_blind_ratings.sql` in one go, which rolled itself back
(checked afterward: no new functions, no test users, the old read rule).
29/29 passed: a hidden rating can't be read by the other person or by anyone
else, the notification has no stars and no feedback, and the star badge,
Performance box, Completed Projects and ranking don't count it; once the
other side rates, both show everywhere and the notification has the stars; a
one-sided rating shows after 14 days and the other side can no longer rate;
rating before Done, rating yourself, rating someone else's project and rating
twice are still refused. Then the same SQL was applied. After applying: all
16 existing ratings are still visible, and who may call each function is
unchanged.

Changes from the plan:
- The 14 days lives in one small function, `rating_window()`, so the number
  is changed in one place (plus `RATING_WINDOW_DAYS` on the website).
- The first notification says until when instead of "within 14 days":
  "Maria rated you for "Promo video". It stays hidden until you rate them
  too, or until October 21." Its title is "A rating is waiting for you".
  The offline email carries the same text, so it doesn't leak the stars.

Step 1 files: `database/supabase_blind_ratings_schema.sql`,
`database/test_blind_ratings.sql`, `database/supabase_projects_schema.sql`
(one pointer comment).

Step 2 (the website): built and pushed (2026-10-07). No SQL. Tested in a real
browser (Playwright, the fake backend, which applies the same blind rule):
33/33 passed, no page errors. The client's page and the freelancer's page
match the mockups (title on the left, no badge, "(optional)" inside the box,
stars on the left, "Submit"); the blind note names the other person and the
right closing date; the right rating is sent (the freelancer's with stars
only); a star can be picked with the keyboard; the project page shows the
four states (button + blind line, "hidden from ... until", both ratings with
the feedback, period ended); the ratings page refuses a second rating and
closes after 14 days; on a 390 px phone nothing scrolls sideways; in light
mode with a yellow accent all the text is dark and readable. The site also
builds.

Changes from the plan:
- The stars are real buttons now (they were icons), so they work with the
  keyboard and a screen reader.
- The "(optional)" hint was too dark to read on the dark box, so the
  feedback box got its own hint color (`.feedback-box` in `dashboard.css`).
  The same faint hint text is on the other dashboard text boxes in dark mode
  (Post a Need, Services, Settings...); that was left alone, it is not part
  of this plan.
- On the project page, when the 14 days end and the other person never
  rated, it says "Juan didn't rate this project."

Step 2 files: `lib/projects.js` (`RATING_WINDOW_DAYS`, `ratingDeadline`,
`getRatingOfMe`), `views/FeedbackView.jsx`, `views/ProjectDetailsView.jsx`,
`pages/dashboard/dashboard.css`, `pages/legal/TermsOfService.jsx`,
`DEMO-GUIDE.md`.

Both steps in this plan are built. This plan is done. Still needs the user
to test it on the live site: mark a project Done as the client, rate, then
sign in as the freelancer and rate back.
