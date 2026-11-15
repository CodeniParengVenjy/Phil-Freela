-- Client testimonials on the homepage (panel revision, PLAN-panel-revisions.md,
-- item 11, 2026-11-15).
--
-- When a client rates a freelancer, they can tick "Let PhilFreela show this on
-- the homepage". The homepage (Homepage.jsx, open to everyone, signed in or
-- not) then shows up to 6 of those ratings, newest first, through one function
-- that returns only what the card needs: the client's first name, the stars
-- and the words. Never the full name, the freelancer or the project.
--
-- A rating is shown only when ALL of these are true:
--   - the client ticked the box (show_on_homepage),
--   - it is the client's rating of the freelancer (not the other way round),
--   - 4 or 5 stars, with at least 20 characters of feedback,
--   - the blind-rating rule already lets everyone see it (rating_is_visible),
--     so the homepage never shows a rating before the freelancer may see it,
--   - the client isn't banned, suspended or archived.
-- Bad words in the feedback are already hidden when it is saved
-- (project_ratings_mask_words).
--
-- Apply it BEFORE the website update: the rating form sends the new column.

-- 1. The client's choice, off by default (every older rating stays off).
alter table public.project_ratings
  add column if not exists show_on_homepage boolean not null default false;

-- 2. What the homepage may read. security definer: visitors who aren't signed
--    in can't read project_ratings themselves, only this short list.
create or replace function public.homepage_testimonials()
returns table (first_name text, stars smallint, feedback text, rated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(split_part(trim(pr.full_name), ' ', 1), ''), 'A client'),
         r.stars,
         r.feedback,
         r.created_at
  from public.project_ratings r
  join public.projects p on p.id = r.project_id
  join public.profiles pr on pr.id = r.rater_id
  where r.show_on_homepage
    and r.rater_id = p.client_id
    and r.stars >= 4
    and char_length(trim(coalesce(r.feedback, ''))) >= 20
    and public.rating_is_visible(r.project_id)
    and not exists (
      select 1 from public.user_suspensions s
      where s.user_id = r.rater_id and (s.ends_at is null or s.ends_at > now())
    )
    and not exists (select 1 from public.archived_users a where a.user_id = r.rater_id)
  order by r.created_at desc
  limit 6
$$;

revoke all on function public.homepage_testimonials() from public;
grant execute on function public.homepage_testimonials() to anon, authenticated;
