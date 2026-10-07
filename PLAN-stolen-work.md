# Stolen work: plan and progress

Last updated: 2026-10-07. To continue in a new Claude session, say:
"Read PLAN-stolen-work.md and continue from the current step."

The copy check is already built (PLAN-watermarking.md, steps 5 to 9): an
upload that is nearly the same as another freelancer's work on PhilFreela,
or carries their hidden code, is hidden until an admin reviews it. This plan
makes the check on upload as complete as the Check Ownership page, and
closes the two gaps that were left for "later" on 2026-09-28.

Graded function this supports: Feature 3, Portfolio protection (ViT, HiDDeN,
Extraction API).

## The three gaps today (checked 2026-10-07)

1. **The check on upload is lighter than the Check Ownership page.** The
   user asked on 2026-10-07 that Check Ownership be "a complete package,
   automatically" when uploading to the portfolio and when posting a
   service. Both already go through the same upload (`POST /slides`), which
   reads the hidden code and runs the look-alike check on every file. But
   the Check Ownership page does three things the upload does not:
   - Photos: it also reads the picture 9 more times as if its edges had
     been cropped off (a thief often crops the visible watermark away).
     The upload reads it once, as it is.
   - Videos: it reads the code from 16 frames. The upload reads 5.
   - PDFs: a screenshot of a page can be checked there as a picture. On
     upload, a PDF's page pictures are not read for a hidden code at all,
     only its text is checked.
2. **Work stolen from outside PhilFreela** (Behance, Pinterest, Google).
   The copy check has nothing to compare it with, so it passes. The Report
   button has no "Stolen work" reason, and a portfolio project can't be
   reported at all (only a user, a service or a job post can).
3. **The thief posts first.** When the real owner uploads later, the real
   owner's file is the one held back. On Flagged Content the admin can show
   it ("Looks fine") or delete it, but can't remove the thief's earlier
   post from that page. And a screenshot of the thief's post would still
   name the thief on Check Ownership.

## How it will work

The full ownership check on every upload (portfolio and services):

1. The upload and the Check Ownership page use one shared function, so
   they can never differ again.
2. Photo: the hidden code is read as it is, then the look-alike check runs
   (both as today). New: if the picture looks at least a bit like another
   freelancer's (70% or more; a copy is held at 88%), it is also read the
   9 "cropped" ways. A hidden code found that way holds the file as a sure
   match, with the owner named for the admin.
3. Video: the hidden code is read from up to 16 frames, like the page.
4. PDF: each page picture (up to 5) is read for a hidden code before it
   gets its own. Another freelancer's code holds the file.
5. Nothing changes for the person uploading, except a few more seconds on
   pictures that look like someone else's.

Reporting stolen work:

1. The Report popup gets a new reason, **Stolen work / plagiarism**. When
   it is picked, the details box is required and asks "Where is the
   original? Paste a link, or say whose work it is." Screenshots stay
   optional (up to 3), as today.
2. An opened portfolio project gets a **Report** button for visitors (not
   for its owner). Services and profiles already have one.
3. On Admin > Reports the admin sees the project's title, cover picture and
   owner next to the reporter's link and screenshots, then picks
   **Remove Project**, **Suspend Owner**, **Ban Owner**, Resolve or
   Dismiss. Suspend starts on the new "Stolen work" violation.
4. The reporter gets the usual "Your report was reviewed" notification.

Keeping the real owner's upload:

1. On Admin > Flagged Content, a card with a "N% similar" match gets a third
   button: **Keep this one, remove the other**.
2. One click does all of this together: the held-back upload becomes
   visible, the earlier post it matched is deleted with its files, and the
   deleted post's hidden code is handed to the real owner. So a screenshot
   of the thief's old post now names the real owner on Check Ownership.
3. The button is not shown on "Carries the other freelancer's hidden code"
   cards. A file with someone's hidden code was downloaded from their
   PhilFreela post, so it can't be the original.

## Defaults picked (the user can change these)

- The 9 "cropped" readings run only when the picture is 70% or more like
  another freelancer's, not on every photo. Measured on the laptop: one
  reading takes 0.4 seconds, the 9 extra take 7 seconds, and Vercel is
  several times slower. Running them on every photo would add minutes to a
  10-photo post for honest users. The other choice is "always, on every
  photo": simpler to explain, much slower.
- Penalty for "Stolen work": 14 days, can't post (can still message). A ban
  is always its own button.
- "Stolen work" is not offered when reporting a job post.
- Nobody is suspended automatically. The admin decides, from the report or
  from Admin > Users.
- The copier's service or project stays; only the copied file is removed
  (the same as "Remove the copy" today).

## Not included

- Searching the internet for the original (reverse image search). Outside
  work is caught by people reporting it.
- Handing over the hidden code when the admin uses today's "Remove the
  copy" button. That copy was never public, so it matters less.
- A notification to the person whose post was removed.
- Catching copies hidden under a big tiled watermark or turned grayscale
  (21 of 300 test copies were missed). That is a cutoff question for the
  ViT, not part of this plan.
- A stolen picture placed small inside a PDF page. The hidden code only
  reads when the picture fills most of the page. Reporting covers the rest.
- The look-alike check (ViT) on PDF pages. Left out on purpose in
  watermarking step 11: text pages on white paper all look alike to it.

## Another session is working in the same files

On 2026-10-07 another Claude session had unsaved changes that make the
upload say "Uploading and checking ownership: 2 of 5..." and "Ownership
check passed" (`lib/slides.js`, `PortfolioSection.jsx`,
`PortfolioUploadDialog.jsx`, `views/ServicesView.jsx`). This plan does not
repeat that. Step 3 here also changes `PortfolioSection.jsx`, so it is built
on top of that session's version once it is committed, and only this plan's
own changes are committed.

## What the user does outside the code

Nothing. (The plan first said the user had to run the SQL file in the
Supabase SQL Editor, because the connector had refused such files before.
On 2026-10-08 the user said "go run", and the connector accepted it: the
file is on the live database as migration `stolen_work`. Don't run it
again; running it twice does no harm, but there is no need.)

## Step 1: The full ownership check on upload (Medium)

AI service only. No database change, no new endpoint, no website change.
It can go live before the SQL file is run.

1. `ai-service/main.py`:
   - New function `find_code_owner(picture)`: the reading as it is (6 wrong
     bits or fewer), then the 9 "cropped" readings (5 or fewer), each
     needing a clear gap to the next code. These are the Check Ownership
     page's own rules, moved into one place.
   - `POST /watermarks/extract` (the page) calls it. Its answers don't
     change.
   - `POST /slides`, photo: as today, then the "cropped" readings when the
     look-alike score is 0.70 or more (`FULL_CHECK_FROM`) and no code was
     found yet. `copy_check` also returns its closest score for this.
   - `POST /slides`, video: the code is read from up to 16 key frames
     (`EXTRACT_VIDEO_FRAMES`) instead of 5. The look-alike check stays on 5.
   - `POST /slides`, PDF: each page picture is read for another
     freelancer's code before `watermarked_pages` adds the uploader's.
2. `ai-service/README.md`: the upload section lists the checks.
3. `PLAN-watermarking.md`: a short "Step 12" note pointing here.

These are watermarking-system functions in `main.py`; this plan is the
request to change them. `hidden_watermark.py`, `similarity.py` and
`watermark_video.py` are not changed.

Step 1: built and pushed 2026-10-07. What was built differs from the list
above in three small ways:
- The look-alike check now runs first and the hidden-code reading second
  (`find_code_owner(picture, cropped_too=closest >= FULL_CHECK_FROM)`), so
  the upload makes one call to the shared function. A code match wins.
- `saved_code(readings)` holds the matching rule: one reading may be 6 bits
  off; several readings of one file (the 9 "cropped" ones, or the pages of
  a PDF) must be within 5.
- One website change after all: `admin/views/AdminFlaggedView.jsx` shows a
  held PDF's page pictures (not its text) next to the photo it matched,
  labelled "A page carries this photo's hidden code". `SlideCard`'s
  `showPage` became `showPages` (all pages, scrolling sideways).

Step 1 test results (the real routes with a fake database and real photos,
on the laptop; 34 of 34 checks passed):
- 16 cropped downloads of 4 photos posted by someone else (bottom 12%,
  bottom 20%, 10% off every side, right 15%), in portfolio projects and in
  services: before, 4 were held by the hidden code and 12 as look-alikes;
  now 8 by the hidden code and 8 as look-alikes. None got through either
  way, and every code match named the right owner's photo. (The codes are
  random, so the split moves a little from run to run: 10 to 14 and 11 to
  15 of 24 in two earlier runs.)
- An uncropped download: held by the code, no slow readings.
- A clearly different picture (look-alike 0.36): saved, no slow readings.
  Two different pictures in the same style as the owner's (0.74 and 0.78):
  saved, but they did get the slow readings.
- Time per photo on the laptop: 2 to 4 seconds without the slow readings,
  about 8 seconds with them. Not measured on Vercel.
- The owner re-posting their own cropped photo: saved as normal.
- Check Ownership page: the same answer as the old reading for a download,
  two cropped copies, a half-size copy and a picture never posted; "your
  own work" for the owner; the right service or project named.
- Video: someone else's download of a 24-second video is held by the code;
  a smaller, re-compressed copy is held (by the code in one run, as a
  look-alike in two); a different video and the owner's own re-post are
  saved. The code is now read from 12 frames of that video instead of 5,
  but that changed nothing in these tests (a download: 3 wrong bits from 5
  frames, 4 from 16; a re-compressed copy: 13 and 13). It costs about 0.7
  seconds per extra frame on the laptop. If video uploads feel slow on the
  live site, `EXTRACT_VIDEO_FRAMES` in `watermark_video_upload` can go back
  to `VIDEO_CHECK_FRAMES`.
- PDF: someone else's downloaded photo as a full page is held by the code,
  as the only page and as page 2 of a longer PDF, in a portfolio project
  and in a service; its page pictures are still saved for the admin. A
  PDF with the uploader's own picture, a text-only PDF and the owner's own
  photo in their own PDF are saved. A copied text PDF is still held by the
  text check. Not caught, as expected: the photo placed smaller on an A4
  page with margins.
- Not tested: the changed Flagged Content card in a browser (it builds and
  passes the linter; Step 4 tests that page).

## Step 2: The database (Medium)

No new tables and no new columns. New file
`database/supabase_stolen_work_schema.sql` (run after the admin, reports,
admin log, copy check and documents files).

1. `reports.reason` also allows `stolen_work` (check
   `reports_reason_check`).
2. `reports.target_type` also allows `portfolio_item` (check
   `reports_target_type_check`).
3. `user_suspensions.violation` also allows `stolen_work` (check
   `user_suspensions_violation_check`).
4. Words for the admin log and notifications (`create or replace`, nothing
   else in them changes):
   - `log_report_target`: "the portfolio project "X" by Maria".
   - `log_suspension_change`: the label "Stolen work".
   - `notify_report_reviewed`: "a portfolio project".
5. New trigger function `log_portfolio_delete` on `portfolio_items`: when an
   admin deletes a project, the log gets "deleted the portfolio project "X"
   by Maria." (An owner deleting their own project writes nothing, like
   services today.)
6. New function `keep_flagged_remove_other(item_type, item_id)`, admins
   only, runs with the owner's rights because it touches the private
   `watermark_codes` table:
   - finds the held-back photo, video or document and the one it matched;
   - refuses if it is not held back, if the match is a hidden-code match,
     or if the other one is already gone;
   - points the other one's rows in `watermark_codes` at the kept upload
     and its owner;
   - sets the kept one to `active` and deletes the other one;
   - writes the admin log line;
   - returns the deleted file's path and page count, so the page can delete
     the files from storage.

The existing rules already let admins delete any slide, any portfolio
project and any file in `slide-media` (checked on the live database).

New file `database/test_stolen_work.sql`: the checks from "Tests" below.

Step 2: written and pushed 2026-10-08, and applied to the live database the
same day as migration `stolen_work` (the user said "go run"; sent without
the `begin` / `commit` lines, since a migration is one transaction already).
What was built differs from the list above in three ways:
- Admin roles (PLAN-admin-roles.md) went live the same day: a regular
  admin's "Remove" on a report is now a request a super admin approves. So
  the file also lets `admin_requests.listing_table` be `portfolio_items`
  (check `admin_requests_listing_table_check`).
- The removed post's hidden code is handed to the real owner
  (`freelancer_id`), but not pointed at the kept upload: the live table
  allows one code per slide (`watermark_codes_slide_id_key`). Check
  Ownership then names the real owner and says the post it came from was
  deleted.
- `log_portfolio_delete` also covers an older writing item an admin
  deletes ("deleted the portfolio document ..."), and skips one held by the
  copy check, which already gets its own line.
The file is wrapped in `begin` / `commit` and can be run twice.

Step 2 test results: 28 of 28 checks passed on a stand-in Postgres (PGlite,
with small copies of the live tables and rules, the existing functions
copied out of the repo's schema files, and the real `admin_requests` part
of the admin roles file). The schema file was run twice there.

Then on the live database, after the migration: `database/test_stolen_work.sql`
passed 28 of 28 (made-up accounts, everything rolled back). Checked
afterwards: no test users, admins, hidden codes or log lines left behind;
the four checks have the new values; the two new functions and the trigger
exist; a signed-in person may call `keep_flagged_remove_other` (it lets only
admins through) and someone not signed in may not.

## Step 3: Reporting stolen work on the website (Easy)

Changed 2026-10-08 to fit admin roles: "Remove Project" works like "Remove
Listing". A super admin removes it at once; a regular admin sends it for
approval, and `admin/views/AdminApprovalsView.jsx` carries it out.
`lib/adminListings.js` (`removeListing`) learns to remove a portfolio
project with its files.

Until the SQL file is run, the new reason and the Report button on a
project answer "This kind of report isn't switched on yet."

No new endpoints. No change in the AI service.

1. `lib/reports.js`: the reason "Stolen work / plagiarism" (left out for
   job posts) and the target name "Portfolio project".
2. `lib/violations.js`: "Stolen work", 14 days, blocks posting.
3. `components/ReportDialog.jsx`: with "Stolen work" picked, the details
   box is required and its label and hint change.
4. `components/PortfolioViewer.jsx` and `PortfolioSection.jsx`: the Report
   button for visitors, opening the same Report popup.
5. `admin/views/AdminReportsView.jsx`: loads reported portfolio projects
   (title, owner, cover picture), shows "Remove Project" for them (the same
   delete the owner's own Delete button uses, files included).
6. `pages/legal/TermsOfService.jsx`: "Your work and ownership" also says
   that posting someone else's work as your own is not allowed and how to
   report it.

`PortfolioViewer.jsx`, `PortfolioSection.jsx` and `AdminFlaggedView.jsx`
belong to the watermarking system; this plan is the request to change them.

Step 3: built and pushed 2026-10-08. Beyond the list above:
- `lib/reports.js` has `reasonsFor(targetType)` and `reportListingTables`;
  `lib/adminRequests.js` has `requestText(request)` ("Remove project").
- The admin report card shows up to 4 small pictures of the reported
  project's or service's own files ("What was reported:"), so the admin can
  compare them with the reporter's link and screenshots.
- `admin/views/AdminApprovalsView.jsx` names the project and carries out
  "Remove project".
- In the Report popup the proof must be at least 10 characters.
- In an opened project, Escape closes the Report popup first, then the
  project.

## Step 4: "Keep this one, remove the other" (Easy)

1. `admin/views/AdminFlaggedView.jsx`:
   - the third button, only on "N% similar" cards whose match still exists;
   - a confirm box naming both people ("Keep Juan's photo and remove
     Maria's? This cannot be undone.");
   - calls `keep_flagged_remove_other`, then deletes the removed files from
     storage;
   - the top paragraph explains the three choices.
2. `PLAN-watermarking.md`: the "LATER" reminder points here.

Step 4: built and pushed 2026-10-08. Any admin can use the button, regular
or super: PLAN-admin-roles.md leaves Flagged Content review out of super
admin approval. After a keep, other held-back files that matched the same
post show it as deleted and lose the button. Until the SQL file is run the
button answers "This button isn't switched on yet".

Steps 3 and 4 test results: 61 of 61 browser checks passed (the real
components in Chromium against a fake backend that refuses columns the real
tables don't have; laptop width, plus phone width for the project viewer
and the Flagged Content buttons; the Report popup and viewer also in light
mode with a light accent color). Covered: the reason list per target, the
required proof, the saved report, the "not switched on yet" answers, the
Report button for a visitor and not for the owner, the admin report card
and Remove Project as a super admin (project, files, report note) and as a
regular admin (a request, nothing deleted), the Approvals page carrying it
out, and Flagged Content (which cards get the button, the confirm box, the
function call, the files deleted, a PDF's pages next to the photo it
matched). The new `portfolio_items` query was also sent to the live API
with the public key and was accepted. Not tested: the pages themselves
against the live database with real accounts (when this was written the
SQL file was not on it yet; it is now, see Step 2).

## Tests

The upload check (the AI service with a fake database, two made-up
freelancers; nothing touches the live project):

1. Someone else posts the owner's photo with the bottom 12% cropped off, in
   a portfolio project and in a service: held as a hidden-code match and
   linked to the owner's photo.
2. A clearly different photo: the 9 extra readings do not run, and the
   upload takes as long as today.
3. The owner re-posting their own cropped photo: saved as normal.
4. Someone else's download of the owner's video: held by the code.
5. A PDF whose page is the owner's downloaded photo: held by the code. A
   normal PDF: saved as normal.
6. The Check Ownership page gives the same answers as before for a
   download, a cropped copy, a plain picture and the owner's own file.
7. How long a photo upload takes with and without the extra readings.

The database, on a stand-in Postgres first (the file can't be run from
here), then on the live database once the user has run it, in one test that
rolls itself back:

1. A report with reason `stolen_work` on a portfolio project is saved; an
   unknown reason or target is still refused.
2. A "Stolen work" suspension is saved and logged with its label.
3. Keep/remove: the held-back photo becomes visible to everyone, the other
   one is gone, its hidden code now belongs to the kept photo's owner, and
   the log has the line.
4. Refused: a non-admin, an item that is not held back, a hidden-code
   match, a match that was already deleted.
5. An admin deleting a project is logged; the owner deleting their own is
   not.

The website (Playwright with the fake backend), laptop and phone: the
Report popup with the new reason (dark mode and light mode with a light
accent color), the Report button in an opened project (hidden for the
owner), the admin report card for a portfolio project with Remove Project,
and the Flagged Content card with the third button (hidden on a hidden-code
card).

## Current step

Plan written 2026-10-07, and Step 1 (the full check on upload) added the
same day after the user asked for it. The user said "ok ok" to the whole
plan.

- Step 1: done and pushed (2026-10-07), live on Vercel.
- Step 2 (the database file): done, pushed and applied to the live
  database (2026-10-08, migration `stolen_work`); its test passed 28 of 28
  there.
- Step 3 (reporting on the website): done and pushed (2026-10-08).
- Step 4 ("Keep this one, remove the other"): done and pushed (2026-10-08).

All four steps are live. Left to do: the user tries them on the live site
with real accounts (the pages themselves were tested with a fake backend,
the database with made-up rows). How long uploads take on Vercel is still
not measured.
