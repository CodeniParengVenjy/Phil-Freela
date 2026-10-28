# Admin Overview: pick what to look at, and graphs for the rest

Status (2026-10-29): approved in chat ("ok"). Step 1 (the dropdown) is built, tested
and pushed (ed01d72). Step 2 (the graphs) is built and tested, and its database
function passed a rolled-back trial on the live database (20 checks). The function is
NOT applied to the live database yet: that waits for the user's go. Until then the
graph slot says "The graph isn't set up yet" and every number and bar below it works.

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

## Step 2: graphs for the numbers (built; the function waits for the go)

One new read-only database function, `admin_activity_trends(p_days)`, in
`database/supabase_admin_activity_schema.sql`. Like `admin_trends` it is
admin-only, counts days in Philippine time, sends every day (zeros on quiet days),
leaves out archived accounts, and keeps p_days between 1 and 365. It returns
`{ days: [...], totals: {...} }`: per day how many NEW of each thing, and the
totals right now, so the page draws a running total the same way the Growth graph
does (today's total minus what came later). No table changes. The dates already
exist:

- bookings made: `bookings.created_at`; accepted: `responded_at` where status = accepted
- projects started: `projects.started_at`; done: `completed_at` (the Submitted step is
  only drawn in the bar: a project that is done was submitted too)
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

How it was built (what changed from the first sketch):
- Lines are running totals, "how many so far", and each part has two lines at most:
  bookings requested / accepted, projects started / done, payments recorded /
  confirmed, applications / hired, and one for pesos earned. A second line is part
  of the first (accepted bookings are some of the bookings made), so the chart takes
  a `headline` series: the big number and "added that day" count that one only, never
  the two added together (the Growth graph's users + listings are parts of a whole
  and still add up). The lines show how many REACHED a step, the bars below show how
  many are AT a step right now, so a project that is done counts in "Started" and
  "Done" on the graph and only in "Done" in the bar.
- Colors follow the step: orange = begun, blue = in between, aqua = reached; yellow
  = needs a look (declined, not received); grey = cancelled or expired; the earnings
  bar uses orange, blue, aqua, yellow, magenta for the five kinds, so Featured offers
  are orange and Featured job posts blue, as services and jobs are in the Growth
  graph. Checked with the dataviz validator against the card color #161a26: the lines
  (orange + aqua) and every bar order pass (worst neighbours 8.4 apart for
  color-blind eyes). The first idea of putting magenta next to aqua FAILED (1.6 apart)
  and is not used.
- "Applications and hires" stays as a numbers card in Job hiring (the graph's legend
  repeats it), so those numbers show even before the function is applied.
- The graph says "The graph isn't set up yet" when the database does not have the
  function (PostgREST code PGRST202) and "Failed to load the graph." for other
  failures; the bars and numbers under it are separate requests and keep working.

Files: `database/supabase_admin_activity_schema.sql` and the rolled-back test
`database/test_admin_activity.sql`; `GrowthChart.jsx` (headline, format, tick
format, wider margins for money, taller tick steps), `SplitBar.jsx` (parts without
a link, a value format), new `ActivityGraph.jsx` (tabs, days, table, loading and
errors), `AdminOverviewView.jsx`, `admin.css` (two more chart colors).

Testing:
1. SQL: schema and test sent together in one rolled-back call on the live database
   (the exception at the end takes the function back; checked afterwards that it is
   gone and the user number counter did not move): 20 checks passed. Non-admin turned
   away, signed-out visitor refused, security definer / stable / search_path, one entry
   per day, clamps (0 -> 1, 1000 -> 365, null -> 30), oldest first, no gap, totals do
   not depend on the number of days, every total equals the number the Overview
   already shows (bookings, accepted, projects, done, payments, confirmed,
   applications, hires, earned), the 365 days add up to the totals, and each of 60
   days x 9 kinds equals a separate count. Not covered: an archived person (needs
   one to borrow; it is the same not-exists rule as the other functions).
2. Website: Playwright against the real site with a pretend Supabase, 132 checks over
   Step 1 and Step 2: the tabs and days, the big number and "+N in the last N days"
   (only the headline), the legend, one point per day, lines that only go up, the
   table (today's total, the oldest day = total minus what came later, "added that
   day" for the headline only), the arrow keys, 7 / 30 / 90 days and two quick
   clicks, peso graph and table, the bars' words, numbers, percents and widths, the
   graph missing, the graph failing and trying again, and 390 / 768 / 1440px with no
   sideways scrolling and no number cut off.
3. Not tried: the page against the live function with real rows (the live database
   has only a handful of bookings, projects and payments, so its graphs will look
   sparse until there is demo data).
