-- Ratings and comments on an offer. Plan: PLAN-offer-reviews.md. Run this in the
-- Supabase SQL Editor (or apply it as a migration), part 1 first.
--
-- A signed-in client can give an offer 1 to 5 stars and write a comment. It is
-- not tied to a finished project (the project ratings of Feature 5 are a
-- different thing and are not changed). One rating per client per offer. The
-- website only reads this table; the only way to add a rating is the function
-- add_service_review, which checks who is asking and explains a refusal in
-- plain words, like create_booking.

-- ===========================================================================
-- Part 1: the table, who can read and remove, and the function
-- ===========================================================================

create table public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint service_reviews_one_per_client unique (service_id, author_id)
);

create index service_reviews_service_idx on public.service_reviews (service_id, created_at desc);

alter table public.service_reviews enable row level security;

-- People can read and remove; adding goes through the function below, and
-- nobody can change a rating after it is posted.
revoke all on public.service_reviews from anon, authenticated;
grant select, delete on public.service_reviews to authenticated;

-- Everyone signed in reads the comments of an offer they can see. Comments from
-- someone who is suspended are hidden while it lasts (their author and the
-- admins still see them).
create policy "service_reviews: signed-in users can read"
  on public.service_reviews for select
  to authenticated
  using (
    exists (select 1 from public.services s where s.id = service_reviews.service_id)
    and (not public.is_suspended(author_id) or author_id = auth.uid() or public.is_admin())
  );

-- You remove your own rating (and can write a new one).
create policy "service_reviews: authors can remove their own"
  on public.service_reviews for delete
  to authenticated
  using (author_id = auth.uid());

-- A super admin removes any comment (a regular admin asks for it, see
-- admin_requests; the Approvals page does it as the super admin).
create policy "service_reviews: super admins can remove any"
  on public.service_reviews for delete
  to authenticated
  using (public.is_super_admin());

-- Adds a rating. Returns its id. Problems are raised in plain words and the
-- page shows them as they are.
create or replace function public.add_service_review(target_service uuid, review_stars integer, review_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  -- Spaces and line breaks at both ends are cut off (btrim alone only cuts spaces).
  clean text := nullif(regexp_replace(coalesce(review_comment, ''), '^\s+|\s+$', '', 'g'), '');
  new_id uuid;
begin
  if me is null then
    raise exception 'Please log in first.';
  end if;
  if not exists (select 1 from public.profiles where id = me and account_type = 'client') then
    raise exception 'Only client accounts can rate and comment on an offer.';
  end if;
  if public.is_posting_blocked(me) then
    raise exception 'You can''t post right now because of a suspension.';
  end if;

  -- The offer must be one this person can see (a verified freelancer's, not
  -- blocked from posting), the same rule as the Browse Services list.
  select s.freelancer_id into owner
  from public.services s
  where s.id = target_service
    and ((not public.is_posting_blocked(s.freelancer_id) and public.is_verified(s.freelancer_id)) or s.freelancer_id = me);
  if owner is null then
    raise exception 'That offer wasn''t found.';
  end if;
  if owner = me then
    raise exception 'You can''t rate your own offer.';
  end if;

  if review_stars is null or review_stars < 1 or review_stars > 5 then
    raise exception 'Please pick 1 to 5 stars.';
  end if;
  if clean is not null and char_length(clean) > 1000 then
    raise exception 'The comment can be up to 1,000 characters.';
  end if;

  begin
    insert into public.service_reviews (service_id, author_id, stars, comment)
    values (target_service, me, review_stars, clean)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'You already rated this offer. Remove your rating first to write a new one.';
  end;
  return new_id;
end;
$$;

revoke execute on function public.add_service_review(uuid, integer, text) from public, anon;
grant execute on function public.add_service_review(uuid, integer, text) to authenticated;

-- The admin activity log gets a line when an admin removes a comment. (The log
-- function writes nothing when the person isn't an admin, like an author
-- removing their own comment, and nothing when the comment goes along with its
-- offer or its author's whole account.)
create or replace function public.log_review_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_title text;
begin
  select s.title into offer_title from public.services s where s.id = old.service_id;
  if offer_title is not null and exists (select 1 from public.profiles where id = old.author_id) then
    perform public.write_admin_log('listing', 'deleted the comment by ' || public.log_name(old.author_id) || ' on the service "' || offer_title || '".', old.id);
  end if;
  return old;
end;
$$;

revoke execute on function public.log_review_delete() from public, anon, authenticated;

create trigger service_reviews_log
  after delete on public.service_reviews
  for each row execute function public.log_review_delete();

-- ===========================================================================
-- Part 2: reports and removal requests learn about comments
-- (this changes two existing rules, so run it on its own)
-- ===========================================================================

-- A comment can be reported ("service_review"), and a regular admin's request to
-- remove one names its table ("service_reviews").
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('user', 'service', 'job_post', 'portfolio_item', 'profile_picture', 'cover_photo', 'service_review'));

alter table public.admin_requests drop constraint if exists admin_requests_listing_table_check;
alter table public.admin_requests add constraint admin_requests_listing_table_check
  check (listing_table in ('services', 'job_posts', 'portfolio_items', 'service_reviews'));

-- What the admin log says about a reported thing, now also for a comment.
create or replace function public.log_report_target(t text, tid uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item_title text;
  owner_id uuid;
begin
  if t = 'user' then
    return public.log_name(tid);
  elsif t = 'profile_picture' then
    return 'the profile picture of ' || public.log_name(tid);
  elsif t = 'cover_photo' then
    return 'the cover photo of ' || public.log_name(tid);
  elsif t = 'service' then
    select s.title, s.freelancer_id into item_title, owner_id from public.services s where s.id = tid;
    if item_title is null then
      return 'a service that no longer exists';
    end if;
    return 'the service "' || item_title || '" by ' || public.log_name(owner_id);
  elsif t = 'portfolio_item' then
    select p.title, p.freelancer_id into item_title, owner_id from public.portfolio_items p where p.id = tid;
    if item_title is null then
      return 'a portfolio project that no longer exists';
    end if;
    return 'the portfolio project "' || item_title || '" by ' || public.log_name(owner_id);
  elsif t = 'service_review' then
    select s.title, r.author_id into item_title, owner_id
    from public.service_reviews r join public.services s on s.id = r.service_id
    where r.id = tid;
    if item_title is null then
      return 'a comment that no longer exists';
    end if;
    return 'the comment by ' || public.log_name(owner_id) || ' on the service "' || item_title || '"';
  else
    select j.title, j.client_id into item_title, owner_id from public.job_posts j where j.id = tid;
    if item_title is null then
      return 'a job post that no longer exists';
    end if;
    return 'the job post "' || item_title || '" by ' || public.log_name(owner_id);
  end if;
end;
$$;

-- The message to the reporter once an admin has reviewed the report, now also
-- for a comment. (Everything else in it is as before. Part 3 is further down.)
create or replace function public.notify_report_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  about text := case new.target_type
    when 'user' then 'a user'
    when 'service' then 'a service'
    when 'portfolio_item' then 'a portfolio project'
    when 'profile_picture' then 'a profile picture'
    when 'cover_photo' then 'a cover photo'
    when 'service_review' then 'a comment'
    else 'a job post'
  end;
  sent_on text := to_char(new.created_at at time zone 'Asia/Manila', 'Mon FMDD, YYYY');
begin
  if new.status = 'resolved' then
    insert into public.user_notifications (user_id, type, title, message)
    values (
      new.reporter_id, 'report_resolved', 'Your report was reviewed',
      'Thanks for your report about ' || about || ' (sent ' || sent_on || '). '
        || 'An admin reviewed it and took action.'
    );
  else
    insert into public.user_notifications (user_id, type, title, message)
    values (
      new.reporter_id, 'report_dismissed', 'Your report was reviewed',
      'An admin reviewed your report about ' || about || ' (sent ' || sent_on || ') '
        || 'and didn''t find a rule being broken. Thanks for helping keep PhilFreela safe.'
    );
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- Part 3: the average for many offers at once (the cards in Browse, Search and
-- on profiles). Run it on its own, after parts 1 and 2.
-- ===========================================================================

-- Gives the average stars and the number of ratings of each listed offer; an
-- offer with no ratings is not in the answer. It reads the table as the person
-- asking, so it counts the same ratings they can read on the offer's page (a
-- suspended person's hidden comments are left out). One call for a whole list,
-- like rating_summaries does for people.
create or replace function public.service_rating_summaries(ids uuid[])
returns table (service_id uuid, avg_stars numeric, rating_count integer)
language sql
stable
set search_path = public
as $$
  select r.service_id, round(avg(r.stars)::numeric, 1), count(*)::integer
  from public.service_reviews r
  where r.service_id = any (ids)
  group by r.service_id;
$$;

revoke execute on function public.service_rating_summaries(uuid[]) from public, anon;
grant execute on function public.service_rating_summaries(uuid[]) to authenticated;
