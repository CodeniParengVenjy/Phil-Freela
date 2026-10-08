-- "Available for work" (Settings > Profile Settings, freelancers only). Run
-- this once in the Supabase SQL Editor, after supabase_bookings_schema.sql.
--
-- A freelancer can switch themselves to "not available" when they have enough
-- work or are away. While it is off, their profile and service cards say
-- "Not available right now" and clients cannot send them a new booking. They
-- can still be messaged, and bookings and projects they already have go on as
-- usual. No new rules are needed for the switch itself: users can already
-- update only their own profile row, and signed-in users can already read
-- every profile.

-- On for everyone to start with, so nothing changes until a freelancer turns it off.
alter table public.profiles
  add column if not exists available_for_work boolean not null default true;

-- The booking rule, with one more check: the freelancer is taking new work.
-- It is the same function as in supabase_bookings_schema.sql with that check
-- added (after "This freelancer can't take bookings right now."), so the
-- website cannot get around it by simply showing a Book button.
create or replace function public.create_booking(target_service uuid, booking_note text, booking_due_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  svc record;
  client_name text;
  new_booking uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and account_type = 'client') then
    raise exception 'Only clients can book a service.';
  end if;

  select s.id, s.title, s.freelancer_id
    into svc
    from public.services s
   where s.id = target_service;

  if not found then
    raise exception 'That service isn''t available anymore.';
  end if;
  if svc.freelancer_id = auth.uid() then
    raise exception 'You can''t book your own service.';
  end if;
  if public.is_posting_blocked(auth.uid()) then
    raise exception 'Your account can''t book right now because of a suspension.';
  end if;
  if not public.is_verified(svc.freelancer_id) or public.is_posting_blocked(svc.freelancer_id) then
    raise exception 'This freelancer can''t take bookings right now.';
  end if;
  -- The freelancer switched "Available for work" off.
  if not exists (select 1 from public.profiles where id = svc.freelancer_id and available_for_work) then
    raise exception 'This freelancer isn''t taking new bookings right now. You can still message them.';
  end if;
  if exists (
    select 1 from public.bookings
     where client_id = auth.uid() and service_id = target_service and status = 'pending'
  ) then
    raise exception 'You already have a pending booking for this service.';
  end if;
  if booking_due_date is null or booking_due_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The date can''t be in the past.';
  end if;
  if char_length(coalesce(booking_note, '')) > 1000 then
    raise exception 'The note can be up to 1000 characters.';
  end if;

  insert into public.bookings (client_id, freelancer_id, service_id, title, note, due_date)
  values (auth.uid(), svc.freelancer_id, svc.id, svc.title, nullif(btrim(booking_note), ''), booking_due_date)
  returning id into new_booking;

  select coalesce(nullif(full_name, ''), username, 'A client') into client_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    svc.freelancer_id, 'booking_requested', 'New booking request',
    client_name || ' wants to book "' || svc.title || '" for '
      || to_char(booking_due_date, 'FMMonth FMDD, YYYY') || '.'
      || E'\n\n' || 'Open Bookings to accept or decline. You can message them first if you have questions.',
    '/dashboard/bookings'
  );

  return new_booking;
end;
$$;
