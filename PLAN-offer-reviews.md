# Ratings and comments on an offer: plan and progress

Status (2026-10-14): approved ("ok") with three other requests (PDF blur, chat
reports, the upload date; see PLAN-document-previews.md and
PLAN-chat-report-messages.md). To continue in a new Claude session, say:
"Read PLAN-offer-reviews.md and continue from the current step."

## Why

The user asked for "the date that upload the offer, and comments on it and
rates" on the offer page (Service Details, built 2026-10-13, see the end of
PLAN-booking.md). The date is done (commit a5df3aa). For the comments they
picked "a comment box on the offer" out of three ways: the stars and comments
of finished projects, the freelancer's reviews on every offer, or a comment
box on the offer itself. A project rating belongs to a finished project, and
only 2 projects came from a booking, so the offer would have shown "No
ratings" almost everywhere.

## What people see

1. On an offer's page, above the Book box: "Ratings and comments", with the
   average stars and how many ratings ("★ 4.8 · 5 ratings"), and a list (name,
   stars, date, comment), newest first. The same "★ 4.8 (5)" shows next to the
   category and price.
2. A signed-in client who hasn't rated that offer yet gets a box: pick 1 to 5
   stars (required) and write a comment (optional, up to 1,000 characters).
   They can remove their own rating and write a new one.
3. Freelancers (and the offer's own freelancer) can read everything but can't
   rate. A flag on each comment (not your own) reports it.
4. Admin > Reports shows a reported comment (stars, text, who wrote it, which
   offer) with Remove Comment. A super admin removes it at once; a regular
   admin sends a request that a super admin approves on the Approvals page,
   like for listings. Suspend / Ban apply to the author.

## Defaults I chose

- One rating per client per offer. Stars are required, the comment is not.
- Not tied to a finished project (the user's choice), so it can be faked or
  spammed; the report flag and the admins are the answer. A client who is
  suspended from posting can't rate, and a suspended person's comments are
  hidden while it lasts.
- Separate from the freelancer's project stars (the header keeps those).
- No replies, no bell or email for new comments, no rating on the cards.
- The report reasons for a comment leave out "Stolen work" and "Fake profile".

## Database (file `database/supabase_service_reviews_schema.sql`)

Part 1: the table `service_reviews` (service_id, author_id, stars, comment;
removed with its offer or author; unique per client and offer); everyone
signed in can read, nobody writes directly; authors remove their own, super
admins any; the function `add_service_review` (the only way to write one, with
plain-words refusals); a log line for an admin's removal.
Part 2 (changes two existing rules, so the connector may refuse it): reports
accept the new kind `service_review`, removal requests accept the table
`service_reviews`, and two functions say it in words (`log_report_target`,
`notify_report_reviewed`).

Test: `database/test_service_reviews.sql` (rolled back; borrows real accounts
so no user numbers are used up).

## Website

`lib/serviceReviews.js`, new `components/ServiceReviews.jsx`,
`views/ServiceDetailsView.jsx` (the box, the chip, the report flag),
`lib/reports.js` (label, table, reasons), `components/ReportDialog.jsx` (note),
`views/AdminReportsView.jsx` (the comment, Remove Comment),
`views/AdminApprovalsView.jsx` and `lib/adminRequests.js` /
`lib/adminListings.js` (a request to remove a comment).

## Current step

Step 2a (database): built, applied to the live project in two migrations
("service_reviews" and "service_reviews_report_kinds", 2026-10-14) and pushed.
Its SQL has been run, so don't run it again. Tested before applying: the whole
schema and `database/test_service_reviews.sql` (33 checks) were sent together
in one call that rolled back, all passed, and nothing was left behind (checked
afterwards: no table, the two rules unchanged, no test rows, the user number
counter still 17). The test borrows real accounts, so no user numbers were
used up. One real finding: `btrim` only cuts spaces, so a comment ending in a
line break kept it; the function now cuts all white space at both ends.
Checked after applying: three rules on the table, signed-in people can only
read and remove, anon is refused, only signed-in people can call
`add_service_review`, the two rules accept the new kinds, and the website's
query shape (with the author embed) resolves against the live API.
The connector did not refuse the two constraint changes this time.
Not tested: a suspended person can't rate / their comments are hidden (a
suspension notifies the person, so it isn't made up for a borrowed account).

Step 2b (website): built and pushed (2026-10-14). New `lib/serviceReviews.js`
and `components/ServiceReviews.jsx` (summary, the box with 5 stars and an
optional comment of up to 1,000 characters, the list, Remove for your own, a
report flag on others'); `views/ServiceDetailsView.jsx` loads the ratings,
shows the "★ 4.0 (2)" chip next to the category and price, and puts the
section above the Book box; `lib/reports.js` (label "Comment", the table for
removal, no "Stolen work" or "Fake profile" reason for a comment),
`views/AdminReportsView.jsx` (the reported comment with its stars, Remove
Comment), `views/AdminApprovalsView.jsx` + `lib/adminRequests.js` +
`lib/adminListings.js` (a regular admin's request to remove a comment, carried
out by the super admin; no files to delete). Tested in the browser against a
fake backend, desktop and phone (73 checks): the box for a client, a refusal in
the database's own words, posting (trimmed comment, summary and chip update,
my rating first with "(you)"), reporting a comment, removing my own rating,
the 1,000-character stop, a freelancer and the offer's owner (no box, told
why), an offer with no ratings, the admin Reports page as a super admin
(removes at once) and as a regular admin (sends a request that names the
comment), and the Approvals page (approving deletes it and resolves the
report); plus the earlier offer-page (86) and document-preview (65) tests
again. Not tested: a real post on the live site (the fake backend follows the
database function's rules, which were tested in SQL), and the Reports page
with a real reported comment.

All of step 2 is built, pushed and live. Next: PDF blur for all text files
(PLAN-document-previews.md, step B5), then reporting a chat with its messages
(PLAN-chat-report-messages.md).
