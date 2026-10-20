# Admin > Users: one Filters button, Reset, online/offline in order (plan)

Last updated: 2026-10-20. Status: BUILT (plan approved with "ok"; defaults kept:
no line of active choices, Users page only). Tested in the browser against a
fake backend, laptop 1366 and phone 390: 100 checks. The admin panel has only a
dark look (no light mode), so there was no second theme to check.

Request from the owner (2026-10-20): the Users page has too many boxes. Put the
sorting and filtering behind one icon that opens a pop-up, add a Reset button
that goes back to the default, and keep a way to see who is online and offline
in order.

## What is there today (from the code, commit 086bea1)

1. Above the table there are 6 controls in two rows: search, Roles, Statuses,
   Verification, Online (All activity / Online now / Offline), Sort by, and the
   Ascending/Descending button. Plus the "N of N users shown" line.
2. The Overview cards open this page with choices in the address (?role=,
   ?status=, ?verified=, ?presence=, ?sort=, ?dir=). These only decide where the
   boxes start.
3. Sort by Online already puts the most recently seen first, then older
   offline people, and people never seen last. Direction flips it.
4. There is no way to go back to the start except reloading the page.

## What it will do

1. The control area becomes ONE row: the search box, a Filters icon button
   (sliders icon, label "Filters" on a laptop, icon only on a phone), and a
   Reset button.
2. The Filters icon has a small orange number on it: how many choices are away
   from the default (0 = no number). So a closed pop-up still tells you the
   list is filtered.
3. Pressing the icon opens a pop-up (the same look as the other admin pop-ups:
   dark card, Escape / click outside / X closes it, on a phone the buttons stay
   pinned at the bottom). Inside, in this order:
   - Online: three round buttons "All" / "Online now" / "Offline".
   - Role: "All" / "Freelancers" / "Clients".
   - Status: "All" / "Active" / "Suspended" / "Banned".
   - Verification: "All" / "Verified" / "Not verified".
   - Sort by: "Joined" / "Online" / "Name A-Z", and the direction button with
     the same words as today ("Newest first", "Online first", "A to Z", ...).
   - Bottom buttons: "Reset" (left) and "Done" (right).
4. Choices apply at once (the list behind the pop-up changes as you press), so
   there is no Apply button to forget.
5. Reset puts EVERYTHING back to the default: search empty, Online All, Role
   All, Status All, Verification All, Sort by Joined, Newest first. The Reset
   button beside the Filters icon does the same without opening the pop-up. It
   is greyed out when nothing is changed.
6. Online and offline "in order": a shortcut so it is one press. In the
   pop-up, "Online now" and "Offline" are filters, and under Sort by,
   "Online" lists the most recently seen first. When the Overview's
   "N online now" link opens the page it already sets Online now + Sort by
   Online, as it does today.
7. The "N of N users shown" line stays under the row. A short line of the
   active choices ("Online now, Freelancers") next to it is OPTIONAL, see
   question below.
8. Light mode and the accent colors: use the Bootstrap color classes and the
   existing admin classes, no fixed colors, and check both themes.

## Files

1. client/src/pages/admin/views/AdminUsersView.jsx: replace the 6 boxes with
   the one row, add the pop-up, add a resetAll() function, add the "choices away
   from default" count. The state, the filtering and the sorting stay exactly
   as they are, so the Overview's address choices keep working.
2. client/src/pages/admin/admin.css: a few small classes (the round choice
   buttons, the count badge). Reuse admin-modal and admin-modal-backdrop.
3. No database change, no new tables, no new endpoints.

## How it will be tested (browser, fake backend, laptop 1366 + phone 390)

1. The row shows only search, Filters, Reset; the 6 old boxes are gone.
2. The icon opens and closes the pop-up (button, Escape, click outside).
3. Each choice filters correctly, alone and together with the search.
4. The orange number counts choices away from the default (and ignores the
   search text).
5. Reset (in the pop-up and beside the icon) returns everything to the default
   including the search, and is greyed out when already default.
6. The address choices (?presence=online&sort=online&dir=desc) still start the
   page filtered, and the number shows 2.
7. The old checks still pass (44): Active + "Online now" / "Seen 29m ago",
   table fits at 1366, phone page doesn't scroll sideways.
8. Both themes (dark and light) look right.

## Questions for the owner (defaults I chose in brackets)

1. "Online and offline in order": I read it as "let me show only online or only
   offline, and sort online first". Both already exist and move into the
   pop-up. [Default: keep as above.]
2. Show a line of active choices under the row? [Default: no, just the
   number on the icon.]
3. Same pop-up for the other admin lists (Listings, Reports, Activity Log)?
   [Default: Users only for now.]
