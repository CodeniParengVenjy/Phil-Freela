-- Edit and remove your own post (PLAN-edit-posts.md, step 1: database).
-- Run this in the Supabase SQL Editor after supabase_marketplace_schema.sql,
-- supabase_admin_schema.sql (is_posting_blocked) and supabase_reports_schema.sql.
-- No new tables. The owner could already change or remove their own service or
-- job post (the update and remove rules in supabase_marketplace_schema.sql);
-- the website had no buttons for it. This file adds the three things those
-- buttons need from the database.

-- ---------------------------------------------------------------------------
-- 1. The "Edited" date
-- ---------------------------------------------------------------------------

-- Sets updated_at, so a card can say "Edited 3 days ago". Only a real change
-- counts: saving the form without changing anything leaves the date alone, and
-- a date typed in by the browser is ignored (the database writes it).
create or replace function public.touch_post_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create trigger services_touch_updated_at
  before update on public.services
  for each row execute function public.touch_post_updated_at();

create trigger job_posts_touch_updated_at
  before update on public.job_posts
  for each row execute function public.touch_post_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Someone blocked from posting can't edit either
-- ---------------------------------------------------------------------------

-- Posting a new service or job already refuses a person who is suspended for
-- a posting violation (spam, scam...). Editing a live post only checked who
-- owns it, so they could have rewritten a live post. Same check now.
alter policy "services: owner can update" on public.services
  with check (freelancer_id = auth.uid() and not public.is_posting_blocked(auth.uid()));

alter policy "job_posts: owner can update" on public.job_posts
  with check (client_id = auth.uid() and not public.is_posting_blocked(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. A report keeps a copy of what was reported
-- ---------------------------------------------------------------------------

-- A report only stores the id of the post. If the owner takes the post down
-- after being reported, the admin would see an empty line and not know whose
-- post it was. So the report keeps the title and the owner as they were when
-- the report was sent.
alter table public.reports
  add column target_title text,
  add column target_owner_id uuid;

-- Filled by the database when a report is sent, never by the browser: whatever
-- the browser sends in these two columns is replaced.
create or replace function public.remember_reported_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.target_title := null;
  new.target_owner_id := null;
  if new.target_type = 'service' then
    select s.title, s.freelancer_id into new.target_title, new.target_owner_id
    from public.services s where s.id = new.target_id;
  elsif new.target_type = 'job_post' then
    select j.title, j.client_id into new.target_title, new.target_owner_id
    from public.job_posts j where j.id = new.target_id;
  end if;
  return new;
end;
$$;

create trigger reports_remember_post
  before insert on public.reports
  for each row execute function public.remember_reported_post();

-- The reports that were already sent get their copy now, while their posts
-- still exist.
update public.reports r
set target_title = s.title, target_owner_id = s.freelancer_id
from public.services s
where r.target_type = 'service' and s.id = r.target_id;

update public.reports r
set target_title = j.title, target_owner_id = j.client_id
from public.job_posts j
where r.target_type = 'job_post' and j.id = r.target_id;
