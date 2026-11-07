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
   really shrunk on a phone, not by screen size. DONE: touch, laid out 768px or
   wider, and `visualViewport.scale` below 0.9 when the page opens (the old
   screen-size test is kept only for browsers without visualViewport). Tested: no
   bar on tablets 1024x600, 960x600, 800x1280, 1250x780, a phone in its normal
   layout or a laptop; the bar on a phone showing the page 980px wide and shrunk
   (the viewport tag removed, as Chrome's Desktop site does), its text enlarged,
   Got it hides it for the tab; 17 checks.
3. Finger-sized buttons and readable text (`dashboard.css` only): on touch
   screens buttons at least 40px (icons 44px); smallest text 12px. Computers look
   the same. DONE: under `@media (pointer: coarse)` and `body.fixed-layout`:
   `.btn-sm` at least 40x40, the top bar's search button 40x40, the camera button
   36px, Billboard dots 32px to tap (10px dot), an invisible tap area (`::after`,
   -10px) on Back links (`a:has(> .bi-arrow-left)`), "Advertise here" and every
   `.btn-close`, the photo picker's remove button 36px. Text: `.fs-9` and the
   menu's role label 0.75rem, badges and `<small>` never under 12px unless they
   have their own fs- class, the small trust ring 44px so "100%" fits at 12px,
   the 0.68/0.7/0.72rem labels in portfolio.css, slides.css and calls.css 0.75rem.
   Only the notification count bubbles and the calendar's "+n" stay smaller.
   Tested: 38 checks (touch phone 390 and tablets 1250x510 and 800, laptop 1366
   unchanged), and the 18-page check: small taps on a phone 80 -> 24 (the rest are
   links the measuring can't see the invisible area of, and checkboxes with
   labels), no text under 12px left.
4. Home page: the Billboard picture whole on phones (nothing cropped), a one-line
   welcome card on short screens, the Community Billboard stacked on phones and side
   by side on tablets. DONE: the phones-only 16:7 box is gone (the picture keeps its
   4:1 shape everywhere); from 768px on a short screen the Billboard picture sits
   beside its text (the rule wide screens already had, `min(68%, 110vh)`); on short
   screens the welcome card is one compact line (no PHILFREELA PORTAL tag, no second
   line, title 1.1 to 1.4rem); the "Sponsored by" and "Ad by" labels have 12px
   corners instead of a pill (two lines looked like a fat pill). The Community
   Billboard was already stacked on phones and side by side from 768px. Tested for
   both roles at 390, 844x390, 800x1170, 1024x530, 1250x510 and 1366x650: 56 checks.
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
