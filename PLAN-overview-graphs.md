# Admin Overview: graphs of new activity per day

Status (2026-10-24): approved ("yes"), built and tested.

Why: the Overview only showed totals, so an admin could not tell whether the
site was growing or quiet. The cards stay (they are links into Users, Reports and
Listings); graphs of how much happened on each day are added under them.

## What the admin sees

Under the number cards, "Activity over time":

1. One row of choices that applies to every graph: **7 / 30 / 90 days** (30 by
   default) and **Charts / Table**.
2. Four column charts, one column per day (Philippine time):
   - **New users**: freelancers (orange) and clients (blue), stacked.
   - **New posts**: services (orange) and job posts (blue), stacked.
   - **New reports**: red.
   - **Verification requests**: green (any status; the request, not the result).
   Each has a big total for the period, a legend when it has two colors, and a
   hover box (or the left/right arrow keys, or a press on a phone) with that day's
   numbers. A quiet period says "No new ... in this period."
3. **Table** swaps the four charts for one table with the same numbers, newest
   day first, so nothing depends on seeing colors or hovering.
4. While a new range loads, the old graphs stay on screen, dimmed. If the
   graphs fail to load, one sentence replaces them and the cards keep working.

Columns, not lines: most days have 0 to 3 new things, and a line through that
zigzags and suggests something in between days. Columns say "this many on this day".

## Database (`database/supabase_admin_trends_schema.sql`)

1. New function `admin_trends(p_days)`, admin-only like `admin_stats()` (anyone
   else gets an error; browsers signed out cannot call it). It returns one row
   per day, oldest first, today last, with zeros on quiet days: freelancers,
   clients, services, job_posts, reports, verifications.
2. Days are cut at midnight in Asia/Manila. `p_days` is kept between 1 and 365.
3. Archived accounts are left out of the user and verification numbers, the
   same as `admin_stats()`.
4. No new table; nothing existing changes.

## Files

1. `client/src/pages/admin/components/TrendChart.jsx` (new): `TrendChart` draws
   one chart as SVG (no chart library), `TrendTable` is the table view.
2. `client/src/pages/admin/views/AdminOverviewView.jsx`: the section and the
   `admin_trends` call.
3. `client/src/pages/admin/admin.css`: graph styles and the chart colors
   (`.admin-trends`). The colors are the dark steps of the chart palette checked
   with the validator against the admin card color: orange and blue stay apart
   under color blindness; the single-chart red and green pass on their own.
4. `database/supabase_admin_trends_schema.sql`, `database/test_admin_trends.sql`.

## Testing

1. `test_admin_trends.sql` (rolled back, borrows an existing admin, user and
   service, makes no accounts so no user numbers are used): 19 checks. Day
   counts and clamping, today last, no gaps, totals equal counting the tables
   directly, 23:59 counts on its day and 00:01 on the next (Manila), a normal
   user and a signed-out visitor are refused. All pass on the live database.
2. Browser, fake backend (89 checks): cards still link, graph totals and
   column counts match the data, legends, hover and keyboard readouts, 7 / 30 /
   90 days (also two quick clicks: the slow answer does not overwrite the last
   one), table view, empty, error and recovery, regular admin, phone at 390px
   (no sideways scroll, date labels never touch, tooltip stays inside).
3. Lint and build clean.
