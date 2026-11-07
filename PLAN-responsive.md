# Responsive dashboard: phone, tablet, computer (plan, approved 2026-11-07)

The user sent a tablet screenshot of the freelancer dashboard and asked to "plan
the responsiveness for that, for an tablet, computer, and phone". The plan below was
approved with "less goooo"; the open question (should the side menu start open on
computers?) was not answered, so it keeps today's default: it starts closed.

Size groups: phone under 768px, tablet 768 to 1199px (upright and sideways),
computer 1200px and up. A "short screen" is 600px tall or less (a tablet or phone
held sideways).

## What the check found (18 pages x 7 sizes, sample data, plus the user's picture)

Good: no page scrolls sideways at any size; computers look fine.

1. Tablet upright (768-991px): the top bar broke onto a second line on every
   dashboard page (bell, chat and account button over the page). The search box
   had a fixed 380px width and showed from 768px.
2. Small tablets held sideways (short side 600px) got the "You're seeing
   PhilFreela at desktop size on your phone... untick Desktop site" bar wrongly.
3. Phones: the sponsored Billboard picture is cropped at the sides (words in a
   banner get cut).
4. Short screens: the 70px top bar, the welcome card and the Billboard fill the
   first screen; the side menu needs scrolling; chat leaves ~270px for messages.
5. Touch: buttons under 32px (All/Projects/Jobs, View offer, Feature/Extend,
   Billboard dots, the camera button, Advertise here, back links).
6. Tiny text 9-10.5px (the Freelancer/Client label, "© 2026 Version 2.0",
   category chips, "Not verified", percentages).
7. The black strip under the page in the user's picture: found and reproduced.
   On a short screen the side menu was taller than the page frame, so the frame
   (overflow: hidden) could be scrolled by the browser when a tap brought a menu
   link into view; everything moved up and an empty strip showed at the bottom.

## Steps

1. Page frame (`dashboard.css`, `DashboardTopNav.jsx`): compact top bar below
   992px (search button, picture only, name from 768px), a search box that shrinks
   from 992px, a bar that never wraps, a slim 56px bar and tighter menu on short
   screens, a frame pinned to the screen's edges that can't be scrolled, a menu
   that scrolls by itself. DONE (see below).
2. The wrong "Desktop site" bar (`DesktopSiteNotice.jsx`): only when the page is
   really shrunk on a phone, not by screen size.
3. Finger-sized buttons and readable text (`dashboard.css` only): on touch
   screens buttons at least 40px (icons 44px); smallest text 12px. Computers look
   the same.
4. Home page: the Billboard picture whole on phones (nothing cropped), a one-line
   welcome card on short screens, the Community Billboard stacked on phones and side
   by side on tablets.
5. Page by page (chat with a taller message area and the typing box always in
   view, project page, Settings, Profile, Post a Project, offer page, Find Jobs,
   Browse Services). Waits until the other session's "loaders" edits in those
   files are committed.
6. Checks after each step: phone upright and sideways, tablet upright, tablet
   sideways 1024 and 1250, laptop 1366 and 1536, desktop 1920, light mode; then
   commit and push each step.

Not in this round: the admin panel (used on computers).

## Step 1 result (2026-11-07)

- `DashboardTopNav.jsx`: the search box is `d-none d-lg-flex` with the class
  `topbar-search` (no fixed width), the search button `d-lg-none`, Switch to admin
  `d-lg-inline-flex`, the name `d-md-inline-flex` in `topbar-account-name` with the
  name in its own `text-truncate` span (the badges stay).
- `dashboard.css`: `#topNavbar > .container-fluid` never wraps (12px gaps);
  `.topbar-search` shrinks from 380px down to 160px; the name at most 200px;
  `.app-container` is `position: fixed` on all four edges with `overflow: clip`;
  `.sidebar-wrapper` scrolls by itself (`overflow-y: auto`); below 992px the menu
  has `height: auto` (it used to be a full screen tall under the bar, so its last
  70px were off-screen); `@media (max-height: 600px)`: `--navbar-h: 56px`, a 40px
  logo, menu links 45px.
- Tested in a real browser with sample data at 10 sizes (390, 844x390, 768, 800,
  991, 992, 1024x530, 1250x510, 1366, 1920): 99 checks; the strip reproduction
  went from "frame scrollable 76px, strip 19px" to 0 and 0.
