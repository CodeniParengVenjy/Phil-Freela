# Admin Overview: pick what to look at, and graphs for the rest

Status (2026-10-29): approved in chat ("ok"). Step 1 (the dropdown) is built and
tested. Step 2 (the graphs) is next; its new database function is applied to the
live database only after the user says go.

The admin found the Overview too overwhelming: one long page with the growth
graph, 11 number cards, Ratings, Top rated, Transactions, Job hiring and
Earnings. They asked for a dropdown at the top, like the "All Categories" box on
Browse Freelancer, that shows one part at a time, and for transactions, bookings,
job hiring and the like to be graphs, not only numbers.

## Step 1: the dropdown (no database change), built

Under the page title a dropdown with five choices, one part shown at a time:

1. **Overview** (the default): the Growth graph, the two share bars and the 11
   number cards (what used to be the top of the page).
2. **Ratings**: the stars for freelancers and clients, the offer reviews line, Top rated.
3. **Transactions**: Bookings, Projects, Payments (still numbers; Step 2 draws them).
4. **Job hiring**: Job posts, Applications and hires, Hired freelancers.
5. **Earnings**: Earned, Running now, Where it came from.

The choice is kept in the address: `?view=ratings`, `transactions`, `jobs` or
`earnings` (none = Overview), so a refresh comes back to the same part, and an
unknown value means the Overview. Choosing a part replaces the address instead of
adding a step to Back. The side menu's Overview link and the logo go back to the
plain Overview.

Each part asks the database for its numbers when it is opened, and again each
time it is opened, so they are fresh. Before this, six requests ran on every
visit whether or not their part was on screen. A part that fails shows its own
message (and the Overview's failure no longer hides the other parts); opening the
part again tries again.

Files:
1. `client/src/pages/admin/views/AdminOverviewView.jsx`: the part list, `?view=`,
   one loading effect per part, and each part wrapped in its own condition.
2. `client/src/pages/admin/admin.css`: `.admin-view-select` (320px wide at most,
   full width on a phone, with its arrow drawn again because `.admin-input`
   removes Bootstrap's).
3. `client/src/pages/admin/layout/AdminLayout.jsx`: the logo only reloads when on
   the plain Overview; on a part it goes back to the Overview.

Testing: Playwright against the real site with a pretend Supabase (81 checks):
the five choices and their values, each part shows only its own numbers (bookings,
projects, payments, job posts, hires, earnings), the parts that are not open are
not on the page and their requests are not made, the address (open a part
directly, refresh, unknown value, side menu link, logo), one part failing and
trying again, and 390 / 768 / 1440px wide with no sideways scrolling.

## Step 2: graphs for the numbers (planned)

One new read-only database function, `admin_activity_trends(p_days)`, in
`database/supabase_admin_activity_schema.sql`. Like `admin_trends` it is
admin-only, counts days in Philippine time, sends every day (zeros on quiet days),
leaves out archived accounts, and keeps p_days between 1 and 365. It returns
`{ days: [...], totals: {...} }`: per day how many NEW of each thing, and the
totals right now, so the page draws a running total the same way the Growth graph
does (today's total minus what came later). No table changes. The dates already
exist:

- bookings made: `bookings.created_at`; accepted: `responded_at` where status = accepted
- projects started: `projects.started_at`; submitted: `submitted_at`; done: `completed_at`
- payments recorded: `payments.created_at`; confirmed: `answered_at` where confirmed
- applications: `job_applications.created_at`; hires: projects with a `job_post_id`, by `started_at`
- pesos earned: the same rows `admin_promo_earnings` adds up (approved, real-money
  promotions by `decided_at`, and paid sponsored billboards)

On the page (the Growth graph is reused: 7 / 30 / 90 days, hover, keys, "View as table"):

1. **Transactions**: a line graph with tabs Bookings / Projects / Payments, and
   under it a share bar for where they stand (pending, accepted, declined, cancelled; started, submitted, done; the five payment steps).
2. **Job hiring**: a line graph of Applications against Hired, and a share bar for Open / Filled / Expired (each part still opens Listings).
3. **Earnings**: a line graph of pesos earned (a peso format option on the chart),
   and a share bar for where it came from (Featured offers, Featured job posts, Premium, Sponsored billboards, Community ads).

Numbers stay readable beside every bar and part (label, number, percent), so no
meaning depends on a color.

Files: the SQL file and a rolled-back test (`database/test_admin_activity.sql`),
`GrowthChart.jsx` (peso format, taller tick steps), `SplitBar.jsx` if it needs more
than two parts, a small tabbed graph component for the three parts, and
`AdminOverviewView.jsx`.

Testing: the SQL in a rolled-back trial before it is applied (totals equal the
numbers the existing functions give, days add up); the page in the browser with a
pretend backend, as in Step 1.
