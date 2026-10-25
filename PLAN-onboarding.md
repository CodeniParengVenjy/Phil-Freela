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

## Step 3: opening guide (done)

- One pop-up with 3 short slides, once for each person in each browser, the first time their dashboard opens; different words for freelancers and clients (`GUIDE_SLIDES` in lib/welcomeGuide.js). Freelancer: get verified first, show your work, find jobs and get booked. Client: find the right freelancer, post what you need, chat and follow the work.
- Buttons: Skip and Next on slides 1 and 2; the last slide has only "Start", which closes it and leaves the Get started card right behind it. Escape also closes it. No tour library, just a normal pop-up.
- It never sits on top of the "add your name" pop-up: it waits until the name is saved. It also waits until the dashboard has loaded the profile (the role is known, and a ban or archive redirect has had its chance), so it can't flash up early with the wrong role's words or count as seen.
- "How PhilFreela works" in the account menu (above Sign out) opens it again from slide 1, on any dashboard page. It is a menu item, not a new visible button. The menu asks the guide to open with a browser event (`openWelcomeGuide()`), so no state is passed through the layouts.
- "Already seen" is saved in this browser only (`philfreela-welcome-guide-seen-<userId>`), from the moment it is shown. A browser that refuses to keep it (private window) is treated as "seen", so the guide doesn't pop up on every page load; the menu still opens it. Existing accounts see it once too.
- New files `WelcomeGuide.jsx` and `lib/welcomeGuide.js`; mounted in `DashboardOverlays.jsx` (which now also gets `accountType` from both layouts); one menu item in `DashboardTopNav.jsx`. No database change.

## After building

Ask the IT tester to look at the same screens again; that is the evidence for the paper that the feedback was acted on.
