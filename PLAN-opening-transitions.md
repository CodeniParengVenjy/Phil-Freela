# Opening animation and page transitions (plan, picked A + 4 on 2026-11-07)

The user asked (2026-11-07): "can you do the animation fade in and fade out
transitions and opening of the philfreela? plan it first some animation 100x
cooler, make me some choice".

Live preview of every choice (private link, slow motion button, phone size works):
https://claude.ai/artifact/CD2eH6PT6rtaKsdH9g9dnn

This also answers the "opening that starts with the cursor" (the TikTok idea)
that the animated loaders work left open: that is choice B.

**The pick (2026-11-07):** "I want the A and 4 respectively lesgoooo": opening
A (Signature) and page transition 4 (Accent Wipe). Built step by step below.

## What exists today

1. No animation between pages: a click swaps the page at once. The dashboard
   home and the other dashboard pages are separate routes, so the whole frame
   (top bar, side menu) is built again on that switch.
2. Nothing plays when the site opens. Until the code runs, the screen is
   Bootstrap's grey-black (#212529, from `<body class="bg-dark">`); the site's
   own near-black is #090a0f.
3. The loading splash (`PageLoader` in `components/Loaders.jsx`) shows on
   `/dashboard/...` pages and in the admin panel while they check who is signed
   in. The two dashboard home pages, where sign-in lands (`/dashboard-freelancer`,
   `/dashboard-client`), skip it: they show the frame at once with the name
   "User" for a moment.
4. React 19.3.0 (in `package-lock.json`) has the built-in `<ViewTransition>`,
   and React Router 7.18 already wraps every page change in a React transition
   (`BrowserRouter` calls `startTransition`). So page transitions can be
   switched on in a few places, without touching any link. Current Chrome,
   Edge, Safari and Firefox support it; any other browser switches pages
   instantly, like today.

## The choices (watch them in the preview)

Opening:
- A. Signature (3.3 s): the logo writes itself letter by letter, fills with
  gold, a light glides over it, the tagline appears, the logo flies into the
  top bar.
- B. Cursor Click (2.5 s): a pretend mouse pointer glides in and clicks the
  logo; a glowing circle grows from the click and shows the homepage.
- C. Spark Assemble (3.0 s, recommended): sparks fly in from everywhere and
  form the logo ("talents coming together"), then burst outward and open the
  site.
- D. Hyperspace (2.9 s): stars stretch into light streaks, the logo lands with
  a flash and a shock wave, the homepage zooms into place.

Page transition (the top bar and side menu stay still in all four):
1. Soft Fade (0.4 s): old page fades up and away, new one fades in from below.
2. Glass Blur (0.45 s, recommended): old page melts into a blur, new one comes
   into focus.
3. Slide Fade (0.4 s): sideways; Back slides the other way.
4. Accent Wipe (0.6 s): a band in the person's accent color sweeps across.

## Steps (after the pick)

1. Page transitions. DONE (Accent Wipe), with these findings while building:
   - The browser's Back and Forward buttons can't sweep: React handles them at
     once, outside a transition (so the browser can restore the scroll
     position), so they switch pages instantly. The reverse sweep shown in the
     preview was dropped.
   - The dashboard home and the other dashboard pages are separate routes, so
     moving between them built a fresh frame that showed the loading screen
     (or "User") while it checked the account again. `useDashboardShell.js`
     now remembers the signed-in person for the tab (forgotten on sign-out or
     when sent away), so the fresh frame shows at once and keeps the side menu
     open or closed as it was.
   - The band lives on `<html>`'s layer, which can't see the colors on
     `<body>`: a click copies the accent (and the colors behind the page area
     and the whole page) to `<html>`. The pictures are drawn on the color
     behind them, so see-through pages (the admin panel) don't show the band
     through themselves. The admin top bar gets its own picture so the
     sweeping page never covers it. Pages switch at once during the opening
     tour, so its outline stays on target.
   - Instead of `App.jsx`, `main.jsx` wraps the site (same effect, smaller change).
   - New `client/src/components/PageTransition.jsx`: wraps a page in React's
     `<ViewTransition>` with one key per page, so the old page leaves and the
     new one arrives in the chosen style. Changes inside one page (search
     words, a tab in the address, one chat to another) don't animate. The
     browser's Back button plays the reverse direction (only visible in 3 and 4).
   - New `client/src/styles/transitions.css`: the chosen movements for the old
     and new page (`::view-transition-old` / `::view-transition-new`), the
     browser's whole-screen cross-fade turned off so the frame stays still, and
     a short plain fade for devices set to reduce motion.
   - `App.jsx`: one transition around the routes for moving between parts of
     the site (homepage, sign-in pages, dashboard, admin). Dashboard home and
     the other dashboard pages count as the same part.
   - `FreelancerDashboardLayout.jsx`, `ClientDashboardLayout.jsx`,
     `AdminLayout.jsx`: the page area (`<main>`) is wrapped, so only the page
     animates. Side effect: each new page opens at its top (today the scroll
     position can carry over to the next page).
   - `main.jsx`: loads the style file. `package.json`: React `^19.3.0` (the
     lock file already has 19.3.0; this stops a fresh install from picking
     19.2, which has no `<ViewTransition>`).
2. The opening. DONE (Signature), with these details:
   - About 3.1 s until the homepage takes clicks (the cover is gone), then the
     homepage finishes settling and the opening is taken away at about 3.9 s
     (ending earlier cut the homepage's own entrance short, a visible jump).
   - The homepage's words rise only once the logo is on its way, so they don't
     show under the logo. The flying logo lands exactly on the top bar's
     picture (measured: 0 px off, laptop and phone).
   - The first dark screen in `index.html` is taken off by `App.jsx` once the
     first page is drawn.
   - New `client/src/components/OpeningIntro.jsx` and
     `client/src/styles/opening.css`: the chosen opening as a cover over the
     homepage. It plays the first time in a visit (remembered in
     sessionStorage, so closing the tab resets it) and ends with the logo
     flying into the homepage top bar. A Skip button, a tap or click anywhere,
     or any key ends it at once. Reduce motion: a 0.4 s fade instead. The
     homepage loads underneath, so nobody waits longer.
   - `Homepage.jsx`: shows `<OpeningIntro />`.
   - `client/index.html`: a plain #090a0f screen from the very first moment,
     removed when the code starts, so the opening doesn't begin after a grey
     flash.
3. The sign-in opening
   - `DashboardFreelancerRoute.jsx`, `DashboardClientRoute.jsx`: show the
     loading splash until the account is known, like `/dashboard/...` pages
     already do (no more "User" for a moment).
   - `Loaders.jsx` (`PageLoader`) and `DashboardTopNav.jsx`: the splash logo
     and the top bar logo share one name, so the browser moves the logo from
     the middle into the top bar.
   - `DashboardLayout.jsx` and the two route files: the switch from splash to
     dashboard happens inside a React transition so that move plays.
     `AdminLayout.jsx` gets the same for the admin panel.

Each step: lint, build, a look in a real browser (laptop and phone, dark and
light mode, a light accent), then commit and push, then check the live site.

## Not touched

No database, no Supabase functions, no AI service. The existing loading
animations stay as they are.

## Defaults I chose (say if any is wrong)

- The opening plays on the homepage only, once per visit. Signed-in people
  who open the dashboard directly see the sign-in opening instead.
- The same page transition everywhere (dashboard, admin, sign-in pages).
- The admin panel keeps its own logo picture; it flies the same way.
