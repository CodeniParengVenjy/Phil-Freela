-- Booking (see PLAN-booking.md). Run this in the Supabase SQL Editor after
-- supabase_projects_schema.sql and supabase_admin_schema.sql (it uses
-- is_verified() and is_posting_blocked() from there).
--
-- A client books one of a freelancer's services. The freelancer accepts or
-- declines. An accepted booking starts a project (the same projects table
-- that Hire uses), so everything after that is the Project pages that
-- already exist: Started, Submitted, Done, then ratings. Like Hire, no money
-- is involved anywhere: a booking has no price.

-- ---------------------------------------------------------------------------
-- The bookings table.
-- ---------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  -- The service that was booked. It becomes empty if the freelancer deletes
  -- the service later; the booking stays as history.
  service_id uuid references public.services(id) on delete set null,
  -- Copied from the service, so the history keeps its name if the service is deleted.
  title varchar(150) not null,
  -- What the client needs, e.g. "A 1-minute ad video for my coffee shop".
  note text check (note is null or char_length(note) <= 1000),
  -- "Date needed". If the freelancer accepts, this becomes the project's due date.
  due_date date not null,
  -- pending -> accepted (a project started) / declined (by the freelancer) /
  -- cancelled (by the client, while it was still pending).
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  -- When the freelancer accepted or declined. The time between created_at and
  -- this is how fast they answer, which the recommendation ranking's
  -- "response time" (Feature 1) can use later.
  responded_at timestamptz,
  constraint bookings_two_people check (client_id <> freelancer_id)
);

-- For each person's Bookings list, and for the service they point at.
create index bookings_client_id_idx on public.bookings (client_id);
create index bookings_freelancer_id_idx on public.bookings (freelancer_id);
create index bookings_service_id_idx on public.bookings (service_id);

-- One pending booking per client per service, so a client can't flood a
-- freelancer with the same request.
create unique index bookings_one_pending_per_service
  on public.bookings (client_id, service_id)
  where status = 'pending';

alter table public.bookings enable row level security;

-- Only the two people on a booking can see it.
create policy "bookings: the client and freelancer can view"
  on public.bookings for select
  to authenticated
  using (client_id = (select auth.uid()) or freelancer_id = (select auth.uid()));

-- There are no insert, update or delete rules: the browser can only READ
-- bookings. Every change goes through a function below, which checks who is
-- asking and what status the booking is in (the same pattern as projects).
revoke all on public.bookings from anon;
revoke insert, update, delete on public.bookings from authenticated;

-- The project an accepted booking started (empty for projects that came from
-- Hire). One booking can start at most one project.
alter table public.projects
  add column booking_id uuid unique references public.bookings(id) on delete set null;

-- ---------------------------------------------------------------------------
-- New kinds of notifications (keeps all the kinds already live).
-- ---------------------------------------------------------------------------

alter table public.user_notifications drop constraint user_notifications_type_check;
alter table public.user_notifications add constraint user_notifications_type_check
  check (type in ('verification_approved', 'verification_rejected', 'suspension',
                  'suspension_lifted', 'appeal_accepted', 'appeal_rejected',
                  'report_resolved', 'report_dismissed',
                  'project_hired', 'project_submitted', 'project_done', 'project_changes',
                  'project_rated',
                  'booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled'));

-- ---------------------------------------------------------------------------
-- The functions the buttons call. Problems are raised with a plain message
-- that the page shows as is.
-- ---------------------------------------------------------------------------

-- The "Book" button. Only a client can book, never their own service, and
-- only a freelancer who is verified and not blocked from posting (the same
-- rule that decides whether their service shows on Browse Services). The date
-- can't be in the past (Philippine date, like Hire). Makes the booking and
-- tells the freelancer. Returns the new booking's id.
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

revoke execute on function public.create_booking(uuid, text, date) from public, anon;
grant execute on function public.create_booking(uuid, text, date) to authenticated;

-- The freelancer's "Accept". Only the booked freelancer, only while the
-- booking is pending, and only if the date hasn't passed. The row is locked
-- first, so two clicks at once can't make two projects. Makes the project
-- (title, the client's note, and the date needed as its due date), marks the
-- booking accepted and tells the client. Returns the new project's id.
create or replace function public.accept_booking(target_booking uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  freelancer_name text;
  new_project uuid;
begin
  select * into b from public.bookings where id = target_booking for update;

  if not found or b.freelancer_id <> auth.uid() then
    raise exception 'Only the freelancer who was booked can accept this booking.';
  end if;
  if b.status <> 'pending' then
    raise exception 'This booking isn''t pending anymore.';
  end if;
  if public.is_posting_blocked(auth.uid()) then
    raise exception 'Your account can''t accept bookings right now because of a suspension.';
  end if;
  if public.is_posting_blocked(b.client_id) then
    raise exception 'This client can''t start new projects right now.';
  end if;
  if b.due_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The date needed has already passed. Message the client to book again.';
  end if;

  insert into public.projects (booking_id, client_id, freelancer_id, title, note, due_date)
  values (b.id, b.client_id, b.freelancer_id, b.title, b.note, b.due_date)
  returning id into new_project;

  update public.bookings set status = 'accepted', responded_at = now() where id = b.id;

  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    b.client_id, 'booking_accepted', 'Booking accepted',
    freelancer_name || ' accepted your booking for "' || b.title || '". The project has started, and it''s due on '
      || to_char(b.due_date, 'FMMonth FMDD, YYYY') || '.'
      || E'\n\n' || 'Open the project to follow it. You can message them from there too.',
    '/dashboard/project-details/' || new_project
  );

  return new_project;
end;
$$;

revoke execute on function public.accept_booking(uuid) from public, anon;
grant execute on function public.accept_booking(uuid) to authenticated;

-- The freelancer's "Decline". Only the booked freelancer, only while pending.
create or replace function public.decline_booking(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  freelancer_name text;
begin
  select * into b from public.bookings where id = target_booking for update;

  if not found or b.freelancer_id <> auth.uid() then
    raise exception 'Only the freelancer who was booked can decline this booking.';
  end if;
  if b.status <> 'pending' then
    raise exception 'This booking isn''t pending anymore.';
  end if;

  update public.bookings set status = 'declined', responded_at = now() where id = b.id;

  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    b.client_id, 'booking_declined', 'Booking declined',
    freelancer_name || ' can''t take your booking for "' || b.title || '" right now.'
      || E'\n\n' || 'You can message them to ask why, or book someone else.',
    '/dashboard/bookings'
  );
end;
$$;

revoke execute on function public.decline_booking(uuid) from public, anon;
grant execute on function public.decline_booking(uuid) to authenticated;

-- The client's "Cancel". Only the client who booked, only while pending.
create or replace function public.cancel_booking(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  client_name text;
begin
  select * into b from public.bookings where id = target_booking for update;

  if not found or b.client_id <> auth.uid() then
    raise exception 'Only the client who made this booking can cancel it.';
  end if;
  if b.status <> 'pending' then
    raise exception 'This booking isn''t pending anymore.';
  end if;

  update public.bookings set status = 'cancelled' where id = b.id;

  select coalesce(nullif(full_name, ''), username, 'The client') into client_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    b.freelancer_id, 'booking_cancelled', 'Booking cancelled',
    client_name || ' cancelled their booking request for "' || b.title || '".',
    '/dashboard/bookings'
  );
end;
$$;

revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;
