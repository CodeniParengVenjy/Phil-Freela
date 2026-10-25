# Plan: fewer buttons, and what a new user does next

Two findings from the capstone panel:

1. The IT tester: "too many buttons, it is overwhelming" (the same action could be reached in several places).
2. The adviser: "after creating an account, what will users do next?" (a new account landed on a plain list, with no hint of a first step).

Approved order (2026-10-25): step 1, then 2, then 3. No database change in any step.

## Step 1: fewer buttons (done)

Rule: **one way to reach each thing, and one main action per card.**

- Top bar: only the menu button, logo, search (plus the camera for clients) and the account menu. Removed "Services", "Join as Freelancer" and "Become a Client". Switching role is in the account menu ("Switch to Client / Freelancer"). Before, a client's "Services" link opened the freelancer's "Post a Service" form.
- Welcome banner: greeting only. Its buttons repeated the sidebar ("Find Jobs" opened the same list the home page already is).
- Sidebar: Profile and Settings are left out (they are in the account menu; the name card at the top of the sidebar now opens My Profile). Freelancers get "My Services" (the old top-bar "Services" link). Freelancer 7 links to 6, client 8 to 6.
- Job rows (Find Jobs and the freelancer home): no buttons. The whole row opens the job (an arrow on the right says so); the job's page has Apply, Message and Report.
- Service cards (client home): one button, "View offer". The offer's page has Book, Message and Report.
- The job page's flag now reports the **job post** (it reported the client before; a person is still reported from their profile page). The card's Report button reported the post, so nothing that could be reported before is lost.
- The two sentences "Use Join as Freelancer / Become a Client at the top" now point to the account menu.
- The admin panel's Browse Jobs / Browse Services keep their Remove buttons.

Note: the sidebar starts closed on every screen size (the hamburger opens it), so the first screen was the top bar, the banner and the list; the biggest crowd was the 2 to 3 buttons on every card, which is why the cards changed.

Files: DashboardTopNav.jsx, FreelancerDashboardLayout.jsx, ClientDashboardLayout.jsx, FindJobsView.jsx, BrowseServicesView.jsx, JobDetailsView.jsx, ServiceDetailsView.jsx, dashboard.css (name card hover), and comments in FreelancerFYPView.jsx, ClientHomepageView.jsx, useDashboardShell.js.

## Step 2: "Get started" card on the dashboard home (done)

- A small card under the greeting, a checklist that ticks itself from real data and disappears when everything is done (plus a small "Hide" kept in this browser only, per person).
- Only the **next** step has a button; finished and later steps are plain text, so the card adds one button, not five.
- Freelancer (in order): verify identity, add a description, add skills, add portfolio work, post your first service. If the ID was sent and is waiting for an admin, that line shows an hourglass with no button and the next step takes the button (waiting is not "done"); if it was not approved the button says "Try again".
- Client: add a description, then post a project **or** message a freelancer **or** book an offer (any one of them finishes it). Clients are never asked to verify.
- How each step is worked out (lib/getStarted.js, reading existing tables only, no database change): ID = `is_verified` + the newest `identity_verifications` status; description and skills = the profile; portfolio, services, job posts, bookings = a count of the person's own rows; chats = a count of their `conversations`. A description of only spaces does not count.
- If any one of those can't be loaded the card stays hidden instead of guessing (so nobody is asked for something they already did).
- New files: `GetStartedCard.jsx` (dashboard/components) and `lib/getStarted.js`; placed under the greeting in both dashboard layouts; a see-through progress track in dashboard.css / theme.css (Bootstrap's own track is solid white, which made an empty bar look like "all done" in the dark theme).

## Step 3: opening guide (after step 2)

- One pop-up with 3 short slides, once, right after signup; different text for freelancers and clients.
- Buttons: Next and Skip only; the last slide has "Start", which lands on the Get started card.
- It waits for the "add your name" pop-up (never on top of it). "How PhilFreela works" in the account menu replays it.
- "Already seen" is saved in the browser. New files `WelcomeGuide.jsx` and `lib/welcomeGuide.js`; mounted in `DashboardOverlays.jsx`. No tour library.

## After building

Ask the IT tester to look at the same screens again; that is the evidence for the paper that the feedback was acted on.
