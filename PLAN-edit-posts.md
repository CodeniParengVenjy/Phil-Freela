# Edit and delete your own posts: plan and progress

Status (2026-10-20): approved ("ok"). Steps 1-3 and 5 first; photo/video editing
(step 4) and Close/Pause come after. To continue in a new Claude session, say:
"Read PLAN-edit-posts.md and continue from the current step."

## Why

The user asked that clients and freelancers can edit the text of their own posts
and delete them. What was there:

- Freelancer services: delete only from My Projects > My Published Services; no
  edit; the Post a Service page's "Your Active Services" box had no buttons.
- Client job posts: no edit, no delete ("Your Active Listings" was read-only).
- The database already let the owner update and remove their own post; only the
  buttons were missing. AI search re-reads a post by itself when its text changes
  (text_hash), so edits need nothing there.

## What people see

1. Edit on the card and on the post's own page. It opens the same form, filled in.
   Jobs: title, category, description, skills, due date, budget. Services: title,
   category, description, skill, price.
2. Delete on the same two places, with the existing confirm pop-up. For a job it
   says how many applicants lose their application. A hired project and a booking
   stay (their link to the post is set to empty).
3. "Edited 3 days ago" on the card and on the page.
4. Someone blocked from posting (spam, scam...) can't edit.
5. Admin > Reports: a report about a post that is gone still shows its title and
   owner, so the admin can act.

## Defaults I chose

- Editing stays allowed after people applied or booked; the "Edited" label is the
  safeguard. A hired job can still be deleted (the project keeps running).
- The Admin Log only records what an ADMIN does (write_admin_log returns when the
  caller is not an admin), so an owner's own delete is not logged there. That is
  why a report keeps its own copy (title + owner) instead of reading the log.

## Steps

1. DONE (database, `database/supabase_post_edit_schema.sql`, test
   `database/test_post_edit.sql`, 17 checks, rolled back): a trigger sets
   `updated_at` on a real change only (a date sent by the browser is ignored);
   the update rule for services and job_posts also refuses a person blocked from
   posting; `reports` got `target_title` and `target_owner_id`, filled by the
   database when a report about a service or job is sent (older reports filled
   in; the one older post report already points at a removed service, so it has
   no copy). No new tables.
2. DONE: Delete buttons, shared by `lib/ownPosts.js` (deleteService,
   deleteJobPost, countApplicants) and `components/DeletePostDialog.jsx`.
   Services: the card on Post a Service (Your Active Services), the card on My
   Projects (it already had one, now the same pop-up), and a Delete button on
   the offer's own page (owner only; goes back to Post a Service). Jobs: a
   trash button on each row of Your Active Listings (the title now opens the
   job's page) and a Delete button on the job's own page (goes back to Post
   What You Need). The job pop-up says how many freelancers applied. Found on
   the way: a job's applications go with it but their resume PDFs sit in the
   private "resumes" bucket where only the freelancer could remove them, so
   they would stay forever with nobody able to see them. New storage rule
   (`database/supabase_post_remove_resumes_schema.sql`, applied) lets the job's
   client remove the resumes sent to their own job; the website removes them
   first, then the job. Its test (`database/test_post_remove_resumes.sql`)
   contains delete statements, so the connector refused it: NOT RUN, the user
   runs it in the SQL Editor. Browser check against a fake backend, laptop and
   phone: 54 checks.
3. DONE: Edit text (both kinds) and the "Edited" label. One way in: a pencil is
   a link to `/dashboard/services?edit=<id>` or `/dashboard/post-need?edit=<id>`;
   those pages fill the same form from that post (while rendering, no effect)
   and "Save changes" sends an update instead of an insert, "Cancel" goes back.
   Pencils: the cards in Your Active Services / Your Active Listings, the card
   on My Projects, and an Edit button next to Delete on the post's own page.
   An id that isn't yours just opens the normal empty form. Service edit hides
   the slide picker ("stay as they are", step 4). Job edit keeps an old past due
   date if it isn't changed (the database rule compares with the posting day);
   a NEW past date is refused. A refused save (account blocked from posting)
   shows "Couldn't save your changes" and keeps the form and the typed text.
   Deleting the post being edited closes the form. "Edited <date>" (a date in
   the same format as the posted date, not "3 days ago") shows on the cards,
   the offer's page, the job's page and the freelancer's public list; nothing
   shows when the save changed nothing (the trigger leaves updated_at empty).
   Browse Services / Find Jobs cards show no dates at all, so no label there.
   Browser check against a fake backend, laptop and phone: 95 checks (the
   Delete one still passes: 54).
4. (later) Edit photos and videos of a service through the existing upload and
   ownership check.
5. Admin > Reports shows the saved title and owner for a post that is gone.
6. (later, optional) Close / Pause without deleting.
