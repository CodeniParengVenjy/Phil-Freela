# Booking: plan and progress

Last updated: 2026-10-03. To continue in a new Claude session, say:
"Read PLAN-booking.md and continue from the current step."

Booking is not one of the 6 functions in the paper (PhilFreela-System-Functions.md).
The user asked for it on 2026-10-03 because the site "is like a normal
messenger app": a client who likes a service can only click Message. Booking
is the missing front door to the Project pages that already exist (screens
"Started" and "Done": note, dates, Attach your files, ratings).

It feeds the graded functions:

- Feature 5, Profile transparency and transaction history: an accepted
  booking becomes a project. When the client marks it Done it is a
  "completed transaction" (no money), the same as a hired project.
- Feature 1, Hybrid recommendation system (later, not built now): how fast a
  freelancer answers a booking is a real "response time" for the ranking, and
  "clients like you booked them" is a stronger signal for collaborative
  filtering. The table keeps `responded_at` for this.

## Two front doors, one project

1. Hire (already built): the client posts a job, freelancers apply, the
   client hires one, a project starts.
2. Booking (new): the freelancer posts a service, a client books it, the
   freelancer accepts, the same kind of project starts.

## How it works

1. A client clicks **Book** on a service card (Browse Services), on a
   freelancer's public page, or in the chat header while chatting with a
   freelancer.
2. A popup asks for the service (already filled in from a card, a pick list
   from the page or chat), a note ("What do you need?") and the date needed.
3. The booking is **Pending**. The freelancer is notified: the bell, a toast,
   and an email if they're offline (the existing email trigger already sends
   one for every notification).
4. The freelancer opens **Bookings** and clicks **Accept** or **Decline**.
   - Accept: a project starts today. Its note is the client's note and its
     due date is the date needed. The client is notified and can open it.
     From there it is the project pages that exist today: Started,
     Submitted, Done, then ratings.
   - Decline: the client is told. They can message the freelancer or book
     someone else.
5. While it's Pending, the client can **Cancel** it. The freelancer is told.

Statuses: Pending, Accepted, Declined, Cancelled.

## Defaults picked (the user can change these)

- Only clients book (the same side that posts jobs and hires).
- One booking is one service from one freelancer. The freelancer must be
  Verified and not blocked from posting, the same rule that decides whether
  their service shows on Browse Services.
- A client can't book their own service, and can't have two Pending
  bookings for the same service.
- Date only. "Date needed" becomes the project's due date. No time slots and
  no availability calendar: they agree on times in chat.
- The date can't be in the past (Philippine date, like Hire). A Pending
  booking whose date has already passed can't be accepted; the page shows
  "Date passed" and the client can still cancel it.
- No money anywhere (project scope): the booking has no price. Price talk
  happens in chat.
- Declining has no reason box; they explain in chat (like "Request
  changes").
- A booking can't be edited: cancel it and book again.
- Once accepted it can't be cancelled (cancelling a project isn't built,
  same as for hired projects).
- Only the client and the freelancer on a booking can see it.

## Not included

- Time slots, calendars, availability, double-booking checks, reminders.
- A Book button on the AI search results, Recommended for you and Moodboard
  Match cards. They link to the pages that get the button.
- A number badge on the sidebar link (the notification bell already tells
  them).
- A freelancer sending an offer from chat (freelancer-started bookings).
- Changing the Hire flow or the project pages.

## What the user does outside the code

Nothing for the database: the Supabase connector works, so Claude runs each
step's SQL and checks the live database first. After each push, the user
tests on the live site (phil-freela.pages.dev).

## Step 1: Database (Medium)

New file `database/supabase_bookings_schema.sql`.

1. Table `bookings`:
   - id
   - client_id, freelancer_id: both removed with the account
   - service_id: set to empty if the service is deleted
   - title: copied from the service, so the history survives if the service
     is deleted
   - note: up to 1000 characters
   - due_date ("Date needed")
   - status: `pending` / `accepted` / `declined` / `cancelled`
   - created_at, responded_at (when the freelancer accepted or declined)
2. Client and freelancer must be different people. A unique index allows
   only one Pending booking per client per service.
3. Rules: only the booking's client and freelancer can see it. There are no
   insert, update or delete rules: the browser only reads. Every change goes
   through the functions below, like projects.
4. `projects.booking_id`: unique, set to empty if the booking is deleted.
   It is the booking an accepted project came from.
5. `user_notifications`: new kinds `booking_requested`, `booking_accepted`,
   `booking_declined`, `booking_cancelled`. Claude checks the live rule
   first (checked 2026-10-03: it has 13 kinds, ending with `project_rated`).
6. Functions, all run with extra privilege and only callable by signed-in
   users. Problems are raised in plain words and the page shows them as is,
   like Hire:
   - `create_booking(service, note, date)`: the caller must be a client; the
     service must exist and not be theirs; the caller isn't blocked from
     posting; the freelancer is verified and not blocked; no Pending
     duplicate; the date isn't in the past; the note is 1000 characters or
     less. Makes the booking and notifies the freelancer. Returns its id.
   - `accept_booking(booking)`: that booking's freelancer only, only while
     Pending, only if the date hasn't passed, and not blocked from posting.
     Locks the row so two clicks can't make two projects, makes the project,
     marks the booking Accepted, notifies the client. Returns the project's
     id.
   - `decline_booking(booking)`: that booking's freelancer only, only while
     Pending. Notifies the client.
   - `cancel_booking(booking)`: that booking's client only, only while
     Pending. Notifies the freelancer.

Tests (SQL in a transaction that is rolled back afterward):

1. A client books a verified freelancer's service: the booking is Pending
   and the freelancer gets `booking_requested`.
2. These are refused: booking your own service, an unverified freelancer's
   service, a past date, a second Pending booking for the same service, a
   freelancer booking, and a client blocked from posting.
3. Only that booking's freelancer can accept or decline, only its client
   can cancel, each only while Pending, and a stranger can't see it.
4. Accept makes exactly one project (title, note, due date, both people,
   booking_id), marks the booking Accepted and notifies the client.
   Accepting twice is refused.
5. Decline and Cancel set the status and notify the other person.
6. The browser can't insert or update a booking directly.

## Step 2: Book a service (Medium)

Code:

1. New `lib/bookings.js`: `createBooking`, `getMyBookings`, `cancelBooking`,
   `bookingStatuses` (label and color for each status). It reuses
   `todayInManila`, `formatDay` and `personName` from `lib/projects.js`.
2. New `components/BookDialog.jsx`, the same look as `HireDialog.jsx`: the
   service, the note, the date needed, a "Send booking" button. When it's
   opened without a service (freelancer page, chat), it lists that
   freelancer's services to pick from, or says they have none yet.
3. The Book button, for clients only:
   - `BrowseServicesView.jsx`: next to Message on each service card (not on
     your own service, not in the admin panel).
   - `FreelancerPortfolioView.jsx`: next to Message.
   - `ChatView.jsx`: in the header, when the other person is a freelancer
     (the chat's profile lookup also needs `account_type`).
4. New `views/BookingsView.jsx` at `/dashboard/bookings`, for both roles:
   - Client ("My Bookings"): the freelancer, the service, the note, the date
     needed, a status badge, **Cancel** while Pending, **Message**.
   - Freelancer ("Booking Requests"): the client, the service, the note, the
     date needed, a status badge, **Message**. Pending ones first. (Accept
     and Decline arrive in Step 3.)
5. `App.jsx` route, `lib/pageTitles.js` ("Bookings"), and a "Bookings" link
   in both sidebars (`ClientDashboardLayout.jsx`,
   `FreelancerDashboardLayout.jsx`).
6. `lib/notifications.js`: icons and the "Open bookings" / "Open project"
   buttons for the four new kinds.

Tests (browser, made-up accounts on the live site, deleted afterward): book
from a service card, from the freelancer's page and from the chat; a past
date is refused; My Bookings shows it; Cancel works; the freelancer sees the
notification and the request; phone layout.

## Step 3: Answer a booking (Easy)

Code:

1. `lib/bookings.js`: `acceptBooking`, `declineBooking`.
2. `BookingsView.jsx` (freelancer): **Accept** and **Decline** on Pending
   requests. Decline asks first, with `DeleteConfirmDialog` and its own
   button words. An accepted booking shows **Open project**. A Pending one
   whose date has passed shows "Date passed" and Accept is turned off.
3. `lib/privacy.js`: add the user's bookings to "Download your data".

Spotted on the way: the projects part of that same download asks for a
column `created_at`, but the projects table only has `started_at` (checked
on the live database 2026-10-03). The request fails, and the code quietly
turns that into an empty list, so projects are missing from the download.
It's a one-word fix. Claude fixes it in the same edit only if the user
agrees.

Tests (browser): Accept starts the project and opens it; Decline and Cancel
tell the other person; the whole path Book, Accept, Submit, Done, Rate works
with two made-up accounts; the data download includes bookings.

## Current step

Plan approved by the user on 2026-10-03 ("yes, if i didnt respond, continue
until ends"), so all three steps are built one after another, each pushed
when done.

Step 1 (Database): built and pushed (2026-10-03). Its SQL has been run on
Supabase (migration "bookings"), so don't run it again. Tested in a
transaction that was rolled back afterward (nothing left behind, checked
afterward): a client books a verified freelancer's service (pending, note
trimmed, title copied) and the freelancer gets `booking_requested`; refused:
a freelancer booking, booking your own service, an unverified freelancer, a
freelancer blocked from posting, a client blocked from posting, a missing
service, a past or empty date, a note over 1000 characters, a second pending
booking for the same service; a stranger can't see, accept, decline or
cancel it, the client can't accept their own booking, the freelancer can't
cancel it, and the browser can't insert or update a booking directly (and has
no delete right; signed-out visitors can't even call `create_booking`);
accepting makes exactly one project (title, note, due date, both people,
`booking_id`), marks the booking accepted and sends `booking_accepted` with a
link to the project, and accepting, declining or cancelling again is refused;
decline and cancel set their status and notify the other person; a booking
whose date passed can't be accepted; a pending booking from a client who was
suspended since can't be accepted; the database itself refuses two pending
bookings for one service, a booking with yourself, and a made-up status.
Foreign keys checked: deleting a service keeps the booking (`service_id`
becomes empty), deleting a booking keeps its project.

Change from the plan: one extra rule. Accepting is also refused when the
client is blocked from posting ("This client can't start new projects right
now."), the same rule Hire uses for clients.

Step 1 file: `database/supabase_bookings_schema.sql`.

Step 2 (Book a service): built and pushed (2026-10-03). No new SQL.
Tested in a real browser (Playwright, Chromium) against the running site,
with every Supabase request answered by a fake in memory that follows the
same rules as the real functions (no test accounts were made on the live
database; the real rules were already tested in SQL in Step 1, and the
website's booking query was checked against the live API: it resolves, and
signed-out visitors get "permission denied"). 37/37 checks passed, twice in a
row, with no page errors: a Book button on each service card (clients only),
the popup names the freelancer and the service, Send booking shows a toast
and sends the service, the trimmed note and the date; a second pending
booking for the same service shows the database's message and the popup stays
open; a past date isn't sent and the date box starts at today; Escape closes
the popup; My Bookings shows the card (service, freelancer with Verified
check, note, date needed, Pending, Cancel booking, Message) and the tab
title is "Bookings"; the freelancer page's Book button lists that
freelancer's services, refuses to send without choosing one, and a freelancer
with no services gets a friendly message with Send turned off; the chat
header has a Book button for a client chatting with a freelancer (and none
for a freelancer chatting with a client, or a freelancer looking at another
freelancer); Cancel booking asks first (Keep booking / Cancel booking), then
the card shows Cancelled; the freelancer's Booking Requests page lists the
requests, pending first, with a "1 waiting" badge; the freelancer's
notifications show the requests and the cancellation, and "Open bookings"
goes to the page; on a 390 px phone the card buttons stay inside the card,
the popup fits and the page doesn't scroll sideways. Still needs the user to
test it on the live site.

Changes from the plan:
- `DeleteConfirmDialog.jsx` got an optional `cancelLabel` (the grey button's
  words, default "Cancel"), so the popup reads "Keep booking / Cancel
  booking" instead of two buttons that both say Cancel. Nothing else that
  uses it changes.
- The row of buttons under each service card now wraps on very narrow
  cards, to make room for Book beside Report and Message.

Step 2 files: `lib/bookings.js`, `components/BookDialog.jsx`,
`views/BookingsView.jsx`, `App.jsx`, `lib/pageTitles.js`,
`lib/notifications.js`, `layouts/ClientDashboardLayout.jsx`,
`layouts/FreelancerDashboardLayout.jsx`, `views/BrowseServicesView.jsx`,
`views/FreelancerPortfolioView.jsx`, `views/ChatView.jsx` (the chat's profile
lookup also asks for `account_type`), `components/DeleteConfirmDialog.jsx`.
