# Admin Overview: Ratings and Transactions

Two sections added under the number cards on Admin > Overview (the Growth graph
stays first). No table is added and nothing existing is changed.

## What the admin sees

1. **Ratings**
   - Two cards, Freelancers and Clients: the average stars as a big number
     ("4.3 out of 5"), how many ratings it comes from, and a row per star level
     (5 down to 1) with a bar as wide as its share and the count.
   - One line under them for offer reviews (the stars clients gave a service):
     average and count.
   - No ratings gives "No ratings yet." (no 0.0 and no NaN).
   - Only ratings that are already revealed count. Project ratings are blind
     (shown once both sides rated, or 14 days after the project was completed),
     and the admin numbers follow the same rule, so they never show something
     nobody on the site could see yet.
2. **Transactions** (payments are not built, so this shows what exists)
   - Bookings: pending, accepted, declined, cancelled, with the total.
   - Projects: started, submitted, done, with the total.
   - A quiet Payments card that says "Not set up yet", marking where payment
     numbers will go if payments are added later. It shows no number.
   - Plain numbers only, no colors, so nothing depends on telling colors apart.

If one of the two fails to load, one sentence replaces that section; the other
section and the cards keep working.

## Database (database/supabase_admin_ratings_schema.sql)

- `admin_ratings()`: admin-only like `admin_stats()`. Returns
  `{ freelancers, clients: { count, average, stars[5] }, offers: { count, average } }`.
  Project ratings come from `project_ratings` and are filtered with
  `rating_is_visible(project_id)`. A rating goes in the Freelancers or the
  Clients list by the role the person had ON THAT PROJECT (the freelancer or the
  client of the project), the same as the Performance box on a profile, not by
  their account type today: people can switch account type, and grouping by the
  current type moved their old ratings to the wrong card (seen on the live
  Overview on 2026-10-24: Freelancers 0 and Clients 4, when 2 and 2 were right).
  Offer reviews come from `service_reviews`.
- `admin_transactions()`: admin-only. Returns
  `{ bookings: { pending, accepted, declined, cancelled }, projects: { started, submitted, done } }`.
- Archived accounts are left out, the same as `admin_stats()`: a rating, offer
  review, booking or project is not counted when either person on it is archived.
- Applied live as the migrations `admin_ratings_transactions`,
  `admin_ratings_account_type_cast` and `admin_ratings_by_project_role` (no DROP
  or DELETE). The second one fixed `account_type`, which is an enum; the third
  replaced it by the role on the project (above).

## Website

- `AdminOverviewView.jsx`: calls both functions once; draws the two sections.
- `components/RatingCard.jsx`: one rating card with its star bars.
- `components/StatusCounts.jsx`: one card of plain numbers per status.
- `admin.css`: the star-bar rows. Bars reuse the Growth colors (orange for
  freelancers, blue for clients, from `.admin-trends`).

## Tests

- `database/test_admin_ratings.sql` (rolled back, borrows existing accounts so
  no user numbers are used): shape, star counts add up to the count, average is
  the mean, numbers match counting the tables directly, bookings and projects add
  up, a hidden blind rating is counted only once revealed, a rating of an
  archived person is left out, a normal user and a signed-out visitor are refused.
- Browser (fake backend, 36 checks): order of the sections, averages, singular
  and plural words, bar widths and colors, empty state, each section failing on
  its own, the cards still linking, phone width at 390px with no sideways
  scrolling.

## Later, if payments are built

Add a `payments` count and total to `admin_transactions()` and show them in the
Payments card in place of "Not set up yet".
