# Booking, next steps: plan and progress

Last updated: 2026-10-03. To continue in a new Claude session, say:
"Read PLAN-booking-next.md and continue from the current step."

Booking itself is built and live (PLAN-booking.md). This plan adds the small
things that plan left out on purpose. All of them are website-only: no new
SQL, no AI service change.

## What is missing today (checked 2026-10-03)

1. A client can only Book from Browse Services, a freelancer's page and a
   chat. The AI search results, "Recommended for you" and Moodboard Match
   cards show a service or freelancer with only a Message button, so the
   client has to go somewhere else to book what they just found.
2. A freelancer has no sign on the Bookings sidebar link that requests are
   waiting. Only the bell tells them.
3. After a booking is accepted, its card only says "Accepted - Open project".
   You can't see how the project is going without opening it.

## What it builds (three small steps)

1. A **Book** button next to Message on every service the AI shows: the AI
   search results and "Recommended for you" (the service is already known, so
   the popup opens with it filled in), and on Moodboard Match cards (they show
   a freelancer, not one service, so the popup lists that freelancer's
   services to pick from). Clients only, never on your own service.
2. A number badge on the **Bookings** sidebar link for a freelancer: how many
   requests are Pending. It updates when a new notification arrives, and after
   they accept or decline.
3. On an accepted booking's card, the project's status badge (Started,
   Submitted or Done) next to "Open project", so the booking list works as a
   tracker.

## Defaults picked (the user can change these)

- Only clients see the new Book buttons (as everywhere else).
- The badge counts Pending requests only, and only for freelancers. Clients
  already see statuses on their own list.
- The badge goes away at zero.

## Not included

- A date and time picker, availability, a calendar, double-booking checks and
  reminders. That is a bigger change to what a booking is (today it has one
  "date needed" that becomes the project's due date) and would need its own
  plan. If "booking" should mean picking a time slot, say so and this plan
  gets replaced by that one.
- A freelancer sending an offer from chat.
- Booking reply speed in the ranking (its own change to the reply-time rule).

## What the user does outside the code

Nothing. After each push, test on the live site (phil-freela.pages.dev).

## Step 1: Book on the AI's cards (Easy)

Files:

1. `views/SearchResultsView.jsx`: Book button on service results (clients).
2. `components/RecommendedForYou.jsx`: Book button on service cards
   (clients), next to Message.
3. `views/MoodboardMatchView.jsx`: Book button on freelancer cards (clients),
   opening the popup without a service.
4. Each of them renders the existing `components/BookDialog.jsx` (no change to
   it) and shows the same "Booking sent" toast.

## Step 2: The Bookings badge (Easy)

Files:

1. `hooks/useDashboardShell.js`: `pendingBookings` (a count of the signed-in
   freelancer's Pending requests, read under the existing booking rules) and
   `refreshPendingBookings`, refreshed when a notification arrives. Both go
   into the shared state the layouts receive.
2. `layouts/FreelancerDashboardLayout.jsx`: the badge on the Bookings link.
3. `views/BookingsView.jsx`: calls `refreshPendingBookings` after Accept,
   Decline and when its list loads.

## Step 3: Project status on accepted bookings (Easy)

Files:

1. `views/BookingsView.jsx`: the status badge from `projectStatuses`
   (`lib/projects.js`) next to "Open project". The data is already loaded.

## Tests

The browser (Playwright with the fake backend, as in the earlier plans), laptop
and phone: the Book buttons appear for clients only and open the popup with
the right service (or the picker), booking from each place sends the right
service, the badge shows the right number and drops after Accept or Decline,
the status badge follows the project, and the earlier Booking suites still pass.

## Current step

Plan approved by the user on 2026-10-03 ("ok"), so the three steps are built
one after another, each pushed when done.

Step 1 (Book on the AI's cards): built and pushed (2026-10-03). No SQL.
Tested in a real browser (Playwright, the fake backend, with made-up AI
answers): 13/13 passed, no page errors. A service result in the AI search
and a Recommended card each have Book next to Message; a job result has
Message only; Book opens the popup with that service already chosen (no pick
list) and sends the right service with the toast; on Moodboard Match each
card has Book, View portfolio and a Message icon, Book lists that
freelancer's services to pick from, and a freelancer with none gets the
friendly message; a freelancer never sees Book; on a 390 px phone the result
card's buttons stay inside it and the page doesn't scroll sideways.

Change from the plan: on the search results card the buttons drop under the
text on narrow screens (the card now wraps), instead of squeezing the title.

Step 1 files: `views/SearchResultsView.jsx`,
`components/RecommendedForYou.jsx`, `views/MoodboardMatchView.jsx`.

Step 2 (The Bookings badge): built and pushed (2026-10-03). No SQL. Tested in
the same way: 9/9 passed, no page errors. A freelancer's Bookings link shows
the number of Pending requests (3 with 3 waiting, a declined and an accepted
one not counted), the page's own "3 waiting" agrees; after Accept it drops to
2 and after Decline to 1 without a refresh; a request made meanwhile is
counted when they move to another page; a failed Accept (the client cancelled
first) still brings the number up to date; at zero the badge goes away; a
client's Bookings link never shows a number; on a 390 px phone the number sits
inside the open menu's Bookings button.

Change from the plan: the number is also counted again whenever the person
moves to another page (one small count request), so it stays right even if a
live update is missed.

Step 2 files: `hooks/useDashboardShell.js` (`pendingBookings`,
`refreshPendingBookings`), `layouts/FreelancerDashboardLayout.jsx`,
`views/BookingsView.jsx`.
