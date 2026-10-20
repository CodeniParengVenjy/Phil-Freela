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
2. Delete buttons (both kinds, card and own page).
3. Edit text (both kinds) and the "Edited" label.
4. (later) Edit photos and videos of a service through the existing upload and
   ownership check.
5. Admin > Reports shows the saved title and owner for a post that is gone.
6. (later, optional) Close / Pause without deleting.
