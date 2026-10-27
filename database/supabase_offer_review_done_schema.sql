-- Ratings and comments on an offer only after the work is done (PLAN-offer-reviews.md,
-- step 3). Run this in the Supabase SQL Editor after supabase_service_reviews_schema.sql
-- and supabase_bookings_schema.sql.
--
-- Before this, any client could rate any offer, even one they never booked. Now
-- a client can rate an offer only when they booked it, the freelancer accepted,
-- and the project that booking started is Done (the same "Done" that opens the
-- project ratings). Nothing else about offer ratings changes: one per client per
-- offer, stars required, comment optional, remove your own and write a new one.

-- ===========================================================================
-- Part 1: add_service_review checks for a finished project from this offer
-- ===========================================================================

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

  -- Only after the work is done: this client booked this offer, the freelancer
  -- accepted (that started a project), and the client marked that project Done.
  if not exists (
    select 1
    from public.bookings b
    join public.projects p on p.booking_id = b.id
    where b.service_id = target_service
      and b.client_id = me
      and p.status = 'done'
  ) then
    raise exception 'You can rate this offer after your project from it is done.';
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

-- ===========================================================================
-- Part 2 (one time): remove ratings posted before this rule by a client who
-- has no finished project from that offer. Run it once, after part 1.
-- ===========================================================================

delete from public.service_reviews r
where not exists (
  select 1
  from public.bookings b
  join public.projects p on p.booking_id = b.id
  where b.service_id = r.service_id
    and b.client_id = r.author_id
    and p.status = 'done'
);
