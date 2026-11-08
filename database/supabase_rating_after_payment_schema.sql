-- Rate only after a successful payment (PLAN-rating-after-payment.md, approved
-- by the user on 2026-11-08 with "ok").
--
-- "A successful payment" is the moment a project is unlocked
-- (projects.unlocked_at, set by unlock_project_files() in
-- supabase_short_payment_schema.sql): the freelancer pressed Confirm received,
-- and when there is an agreed one-time price, the whole price has been paid.
-- It is the same moment the original file opens for the client.
--
-- Who waits for it:
--   * The CLIENT. They rate the freelancer, and the offer they booked, only
--     once the project is Done AND paid. Their 14 days start from whichever
--     came later, Done or paid, so paying late doesn't lose the chance.
--   * Not the FREELANCER. They rate the client once the project is Done, paid
--     or not, as before, so a client who never pays can still get a low
--     rating that warns other freelancers (the user's "ok" to this choice).
--
-- Ratings that were already given stay as they are.
-- Run it in the Supabase SQL Editor (or as a migration). Safe to run again.
-- Test: database/test_rating_after_payment.sql.


-- 1. Who may add a project rating. ALTER POLICY changes the rule in place
--    (no drop needed); the name stays the same.
alter policy "project_ratings: rate the other person once a project is done"
  on public.project_ratings
  with check (
    rater_id = (select auth.uid())
    and exists (
      select 1
      from public.projects p
      where p.id = project_ratings.project_id
        and p.status = 'done'
        and (
          -- The client rates the freelancer once the payment went through,
          -- within 14 days of Done or of being paid, whichever is later.
          (p.client_id = (select auth.uid())
            and p.freelancer_id = project_ratings.ratee_id
            and p.unlocked_at is not null
            and greatest(p.completed_at, p.unlocked_at) > now() - public.rating_window())
          -- The freelancer rates the client within 14 days of Done, paid or not.
          or (p.freelancer_id = (select auth.uid())
            and p.client_id = project_ratings.ratee_id
            and p.completed_at > now() - public.rating_window())
        )
    )
  );


-- 2. When a blind rating becomes visible: once both sides have rated, or once
--    the time for rating is over. That time is 14 days after Done, moved to 14
--    days after the payment when the payment came within those first 14 days
--    (so the client's rating stays blind while they can still give it).
--    A payment that comes later does not hide again a rating that was
--    already showing: then the time stays 14 days after Done.
create or replace function public.rating_is_visible(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.project_ratings r where r.project_id = target_project) >= 2
    or exists (
      select 1
      from public.projects p
      where p.id = target_project
        -- greatest() skips the empty value, so an unpaid project uses Done only.
        and greatest(
              p.completed_at,
              case when p.unlocked_at <= p.completed_at + public.rating_window() then p.unlocked_at end
            ) <= now() - public.rating_window()
    );
$$;


-- 3. Rating an offer: the client needs a project from booking it that is Done
--    AND paid. Everything else is the same as supabase_offer_review_done_schema.sql.
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

  -- ...and only after it is paid: the freelancer confirmed the payment (the
  -- whole agreed one-time price), which unlocked the project.
  if not exists (
    select 1
    from public.bookings b
    join public.projects p on p.booking_id = b.id
    where b.service_id = target_service
      and b.client_id = me
      and p.status = 'done'
      and p.unlocked_at is not null
  ) then
    raise exception 'You can rate this offer once your payment for the project is confirmed.';
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
