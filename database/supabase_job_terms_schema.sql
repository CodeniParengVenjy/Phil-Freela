-- Revisions and the client's own terms on a job post (panel revision of
-- 2026-11-15, item 9: "consider drafting terms and conditions on the side of the
-- client posting jobs"; same idea as supabase_service_terms_schema.sql, which
-- does it for a freelancer's offer).
--
-- A client says how many rounds of changes they will allow (0 to 5, or
-- unlimited) and can add their own short terms (at most 500 characters). Freelancers
-- read both on the job page before applying (JobDetailsView.jsx). When the client
-- hires someone, the database copies both into the project, so a later edit of
-- the post never changes what was agreed, and nobody can type other values into
-- a project. The Contract of Service PDF reads them from the project
-- (lib/contractPdf.js).
--
-- hire_applicant is not changed: a trigger on projects does the copying.
-- Apply it BEFORE the website update: the job pages ask for the new columns.

-- 1. The columns. Empty on older posts and projects (= "not stated").
alter table public.job_posts
  add column if not exists revisions text
    constraint job_posts_revisions_check check (revisions in ('0', '1', '2', '3', '4', '5', 'unlimited')),
  add column if not exists extra_terms text
    constraint job_posts_extra_terms_check check (char_length(extra_terms) <= 500);

alter table public.projects
  add column if not exists revisions text
    constraint projects_revisions_check check (revisions in ('0', '1', '2', '3', '4', '5', 'unlimited')),
  add column if not exists extra_terms text
    constraint projects_extra_terms_check check (char_length(extra_terms) <= 500);

-- 2. Bad words in the terms are hidden, like in the description (the same
--    word filter, mask_columns, as job_posts_mask_words).
create or replace trigger job_posts_mask_terms
  before insert or update on public.job_posts
  for each row execute function public.mask_columns('extra_terms');

-- 3. A project made from a job post gets the post's revisions and terms as they
--    are at that moment, whatever was sent; afterwards they never change. A
--    project from a booked offer keeps them empty here (its terms stay on the
--    booking, see copy_service_terms).
create or replace function public.copy_job_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.job_post_id is not null then
      -- No post found (it was removed): both stay empty.
      select j.revisions, j.extra_terms into new.revisions, new.extra_terms
        from public.job_posts j where j.id = new.job_post_id;
    else
      new.revisions := null;
      new.extra_terms := null;
    end if;
  else
    new.revisions := old.revisions;
    new.extra_terms := old.extra_terms;
  end if;
  return new;
end;
$$;

revoke execute on function public.copy_job_terms() from public, anon, authenticated;

create or replace trigger projects_copy_job_terms
  before insert or update on public.projects
  for each row execute function public.copy_job_terms();
