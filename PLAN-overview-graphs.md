# Admin Overview: growth graph

Status (2026-10-24): built and tested. This is the second design. The first one
(four column charts of new items per day, commit 84d8fa0) was replaced because
it was too busy, most days had 0 to 3 new things so the columns looked empty, and
it did not show the one thing an admin wants to know: is the site growing?

## What the admin sees

Under the number cards (which stay, and now read "All Users", "Current
Freelancers", "Current Clients"), a "Growth" section:

1. **One line graph: the total over time.** A tab picks what is counted:
   **Users** (freelancers and clients as two lines) or **Listings** (services and
   job posts). A choice of **7 / 30 / 90 days** (30 by default) sets how far back.
   - The big number is the total now, with "+N in the last 30 days" beside it.
   - The line ends are labelled with the current numbers (left out when the two
     lines end almost on top of each other; the legend above still has them).
   - Hovering a day (or the left / right arrow keys, Home, End, Escape, or a
     press on a phone) shows a vertical line, a dot on each line and a box with
     that day's totals and how many were added that day.
   - "View as table" swaps the graph for a table (day, totals, added that day).
2. **Two share bars** under it, from numbers the page already has:
   - **Users by role**: Current Freelancers and Current Clients, each part as
     wide as its share, with the number and percent. Each part opens the Users
     page already filtered, like the cards.
   - **Verified users**: verified against not verified, same idea.

Straight lines between days, not smoothed: smoothing would draw growth on days
nothing happened. A bar, not a donut: two slices read faster as one bar.

## How the totals are worked out (no database change)

The database sends how many NEW things there were on each day
(`admin_trends`, `supabase_admin_trends_schema.sql`, already applied) and the
totals right now (`admin_stats`). The total at the end of an earlier day is
today's total minus everything added after that day. So no history is stored.
Because it starts from today's totals, it counts the accounts and listings that
exist now: an account that was deleted does not appear in the past.

`admin_trends` still returns `reports` and `verifications` per day. The page no
longer uses them (the first design did). They are cheap and left in for later.

## Files

1. `client/src/pages/admin/components/GrowthChart.jsx` (new): `GrowthChart`
   draws the graph as SVG (no chart library), `GrowthTable` is the table view.
2. `client/src/pages/admin/components/SplitBar.jsx` (new): one share bar.
3. `client/src/pages/admin/views/AdminOverviewView.jsx`: the Growth section,
   the tabs, the range, and the card names.
4. `client/src/pages/admin/admin.css`: graph and bar styles, and the chart
   colors (`.admin-trends`). They are the dark steps of a chart palette checked
   with the validator against the admin card color: orange and blue stay apart
   under color blindness.
5. Removed: `TrendChart.jsx` (the column charts).

## Testing

1. `database/test_admin_trends.sql` (rolled back, no accounts made): 19 checks
   on the live database, unchanged from the first design.
2. Browser, fake backend (85 checks): the graph's lines have one point per day
   and only go up, hover and keyboard numbers equal "today minus what came
   later" (first day, last day, a middle day), +N only for series that grew,
   Listings tab, 7 / 30 / 90 days (and two quick clicks: the slow answer does not
   overwrite the last one), table adds up to the headline gain, share bars have
   the right widths, percents and links, lines ending together, nothing yet
   (no NaN), error and recovery with the bars still showing, regular admin, and
   a 390px phone (no sideways scroll, labels never touch, tooltip stays inside).
3. Lint and build clean.
