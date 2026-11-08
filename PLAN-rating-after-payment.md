# Rate only after a successful payment: plan, approved 2026-11-08 ("ok")

## What the user asked (2026-11-08)

"What if after the payment, it must have a successful transaction first before
rating."

## What happened before (checked in the code and the live database)

1. Rating opened as soon as a project was marked Done (14 days, blind ratings).
   Rating an offer also needed only a Done project from booking it.
2. The database already marks a successful payment: `projects.unlocked_at` is
   set when the freelancer presses Confirm received, and with an agreed one-time
   price only once the whole price is paid (`unlock_project_files()`, the same
   moment the original file opens).
3. Live: 4 Done projects, none paid; 7 project ratings and 2 offer ratings, all
   given before payments existed (kept as they are).

## Decisions (the user's "ok" to the recommended choice)

1. "Successful" = the project is unlocked (freelancer confirmed; an agreed
   one-time price fully paid).
2. Only the CLIENT waits for it (rating the freelancer and the offer). The
   freelancer rates the client once it's Done, paid or not, so a client who
   never pays can still get a low rating that warns other freelancers.
3. The client's 14 days start from whichever came later, Done or paid.
4. The blind timer: 14 days after Done, moved to 14 days after the payment when
   it came within those first 14 days. A later payment never hides again a
   rating that was already showing.
5. Old ratings stay. A freelancer who never answers a real payment: the client
   reports the payment.

## Step 1: database

`database/supabase_rating_after_payment_schema.sql` (no DROP):
1. ALTER POLICY on `project_ratings` (insert): the client needs `unlocked_at`
   and `greatest(completed_at, unlocked_at)` within 14 days; the freelancer
   keeps `completed_at` within 14 days.
2. `rating_is_visible()` uses the moved blind timer.
3. `add_service_review()` refuses a Done but unpaid project: "You can rate this
   offer once your payment for the project is confirmed."

Test: `database/test_rating_after_payment.sql` (23 checks). The older tests
(`test_blind_ratings.sql`, `test_offer_review_done.sql`,
`test_service_reviews.sql`) and `demo_data.sql` now mark their projects paid.

## Step 2: screens

1. `lib/projects.js`: `ratingDeadline(project, iAmClient)` (waitingForPayment
   for an unpaid client), new `ratingReveal(project)`, `ratingStep(..., iAmClient)`
   with "Rating opens once your payment is confirmed"; My Projects reads
   `unlocked_at`.
2. `ProjectDetailsView.jsx`: an unpaid client sees "You can rate X once the
   agreed price is fully paid and X confirms it" (or "once X confirms your
   payment") and a Go to payment button; the freelancer sees "X can rate you once
   you confirm their payment"; "Hidden from X until ..." uses the blind timer;
   "didn't rate" only once both times are over; "Rate this offer" only when paid;
   a confirmed payment reloads the project so the rating opens right away.
3. `FeedbackView.jsx`: the same reason, no form, for an unpaid client.
4. `lib/serviceReviews.js` + `ServiceReviews.jsx`: "unpaid" progress and its line.
5. `ProjectsPanel.jsx`: the client's badge.

## Step 3: words

Terms (Ratings), System Functions (Scope paragraph), study guide.

## Progress

- Step 1: APPLIED on live as migration `rating_after_payment` after the user's
  "go" (2026-11-08). Checked on live: the insert rule has the payment part,
  rating_is_visible and add_service_review are the new ones, who may call them
  is unchanged, the 7 + 2 old ratings are untouched; test_rating_after_payment.sql
  23/23 and test_blind_ratings.sql 29/29 against the live rule (rolled back, no
  leftovers).
- Step 1b (found while testing): the "A rating is waiting for you"
  notification still gave a date 14 days after Done and told an unpaid client to
  rate back. Section 4 of the schema file fixes it (date = the blind timer, plus
  "You can rate them once your payment for this project is confirmed." for an
  unpaid client); rolled-back trial 4/4. NOT applied: apply_migration was
  refused by Claude Code's auto-mode check, so it needs the user's typed go
  (migration name `rating_after_payment_notice`).
- Step 2: built and live (ae33352); browser test against a pretend database
  32/32 (unpaid client with and without an agreed price, paid late,
  hidden-until date, freelancer unpaid/never paid/both times over, reload after
  a confirmed payment, rating page, offer box, My Projects cards, light mode,
  phone width). Lint: only the two old warnings; build clean.
- Step 3: Terms and System Functions done; study guide next.
