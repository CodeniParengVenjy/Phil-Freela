-- The agreed price of a project (PLAN-transaction-tracking.md, Step A). Run this
-- in the Supabase SQL Editor after supabase_bookings_schema.sql,
-- supabase_availability_schema.sql, supabase_job_post_details_schema.sql,
-- supabase_payments_schema.sql and supabase_promotions_schema.sql (the list of
-- notification kinds below keeps all 24 kinds those files made, and adds 2).
--
-- Until now a project had no price: the client typed any amount when paying.
-- From now on a project carries ONE agreed price that every payment request will
-- come from (Step B). Where it comes from:
--   * a booking carries the service's price (copied when the client books, so the
--     freelancer editing the service later does not change what was booked),
--   * a hire carries the job post's budget and what it counts (project, day, month),
--   * if the service or the job has no price, either person proposes one on the
--     project page and the OTHER person agrees to it.
-- Once agreed, the price is locked. No money is held or moved: it is a number both
-- people said yes to.

-- ---------------------------------------------------------------------------
-- 1. The columns.
-- ---------------------------------------------------------------------------

alter table public.projects
  -- The price. Empty until one exists.
  add column agreed_amount numeric(10,2)
    constraint projects_agreed_amount_check check (agreed_amount > 0 and agreed_amount <= 1000000),
  -- What the amount counts: the whole project, one day, or one month.
  add column price_basis text
    constraint projects_price_basis_check check (price_basis in ('project', 'day', 'month')),
  -- none: no price yet. proposed: one person named a price, the other has not agreed.
  -- agreed: both said yes (a price copied from a service or a job counts as agreed).
  add column price_status text not null default 'none'
    constraint projects_price_status_check check (price_status in ('none', 'proposed', 'agreed')),
  -- Where the price came from: the booked service, the job post, or a proposal.
  add column price_source text
    constraint projects_price_source_check check (price_source in ('service', 'job', 'proposal')),
  -- Who proposed it (only for source "proposal"). Not checked, so deleting an
  -- account can never be blocked by it.
  add column price_proposed_by uuid references public.profiles(id) on delete set null,
  add column price_agreed_at timestamptz;

-- The columns must tell one story: no price means no amount, basis or source; a
-- price means all three; agreed means there is a date.
alter table public.projects
  add constraint projects_price_consistent check (
    (price_status = 'none') = (agreed_amount is null)
    and (price_status = 'none') = (price_basis is null)
    and (price_status = 'none') = (price_source is null)
    and (price_status = 'agreed') = (price_agreed_at is not null)
  );

-- The price of the service when it was booked. Empty if the service had none.
alter table public.bookings
  add column price numeric(10,2)
    constraint bookings_price_check check (price is null or (price > 0 and price <= 1000000));

-- ---------------------------------------------------------------------------
-- 2. A sentence for a price: "₱5,000.00 for the whole project", "₱800.00 per day".
-- ---------------------------------------------------------------------------

create or replace function public.price_text(amount numeric, basis text)
returns text
language sql
stable
set search_path = public
as $$
  select '₱' || to_char(amount, 'FM999,999,990.00')
         || case basis when 'day' then ' per day' when 'month' then ' per month' else ' for the whole project' end;
$$;

revoke execute on function public.price_text(numeric, text) from public, anon;
grant execute on function public.price_text(numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Booking: the service's price is copied to the booking, and from the
--    booking to the project. Same rules as before (supabase_availability_schema.sql)
--    plus the price.
-- ---------------------------------------------------------------------------

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

  select s.id, s.title, s.freelancer_id, s.price
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

  -- A service price that is empty, zero or beyond the limit is "no price".
  insert into public.bookings (client_id, freelancer_id, service_id, title, note, due_date, price)
  values (auth.uid(), svc.freelancer_id, svc.id, svc.title, nullif(btrim(booking_note), ''), booking_due_date,
          case when svc.price > 0 and svc.price <= 1000000 then svc.price end)
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

  -- The booked price becomes the project's agreed price (the client booked at it
  -- and the freelancer accepted it). No price on the booking: the project starts
  -- with none, and the two agree one on the project page.
  insert into public.projects (booking_id, client_id, freelancer_id, title, note, due_date,
                               agreed_amount, price_basis, price_status, price_source, price_agreed_at)
  values (b.id, b.client_id, b.freelancer_id, b.title, b.note, b.due_date,
          b.price,
          case when b.price is not null then 'project' end,
          case when b.price is not null then 'agreed' else 'none' end,
          case when b.price is not null then 'service' end,
          case when b.price is not null then now() end)
  returning id into new_project;

  update public.bookings set status = 'accepted', responded_at = now() where id = b.id;

  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    b.client_id, 'booking_accepted', 'Booking accepted',
    freelancer_name || ' accepted your booking for "' || b.title || '". The project has started, and it''s due on '
      || to_char(b.due_date, 'FMMonth FMDD, YYYY') || '.'
      || case when b.price is not null then ' The price is ' || public.price_text(b.price, 'project') || '.' else '' end
      || E'\n\n' || 'Open the project to follow it. You can message them from there too.',
    '/dashboard/project-details/' || new_project
  );

  return new_project;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Hire: the job post's budget becomes the project's agreed price. Same rules
--    as before (supabase_job_post_details_schema.sql) plus the price.
-- ---------------------------------------------------------------------------

create or replace function public.hire_applicant(target_application uuid, project_note text, project_due_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  app record;
  client_name text;
  new_project uuid;
  job_status text;
  job_price numeric(10,2);
begin
  select a.id, a.freelancer_id, j.id as job_id, j.title, j.client_id, j.budget, j.budget_type
    into app
    from public.job_applications a
    join public.job_posts j on j.id = a.job_post_id
   where a.id = target_application;

  if not found or app.client_id <> auth.uid() then
    raise exception 'Only the client who posted this job can hire for it.';
  end if;
  if public.is_posting_blocked(auth.uid()) then
    raise exception 'Your account can''t hire right now because of a suspension.';
  end if;
  if exists (select 1 from public.projects where application_id = target_application) then
    raise exception 'You already hired this freelancer for this job.';
  end if;

  perform 1 from public.job_posts where id = app.job_id for update;
  job_status := public.job_state(app.job_id);
  if job_status = 'filled' then
    raise exception 'This job already has all the freelancers it needed. Edit the job post and raise "Freelancers needed" to hire one more.';
  elsif job_status = 'expired' then
    raise exception 'This job''s due date has passed. Edit the job post and pick new dates to hire for it.';
  end if;

  if project_due_date is null or project_due_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The due date can''t be in the past.';
  end if;
  if char_length(coalesce(project_note, '')) > 1000 then
    raise exception 'The note can be up to 1000 characters.';
  end if;

  -- A budget that is empty, zero or beyond the limit is "no price".
  job_price := case when app.budget > 0 and app.budget <= 1000000 then app.budget end;

  insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, note, due_date,
                               agreed_amount, price_basis, price_status, price_source, price_agreed_at)
  values (app.id, app.job_id, app.client_id, app.freelancer_id, app.title, nullif(btrim(project_note), ''), project_due_date,
          job_price,
          case when job_price is not null then app.budget_type end,
          case when job_price is not null then 'agreed' else 'none' end,
          case when job_price is not null then 'job' end,
          case when job_price is not null then now() end)
  returning id into new_project;

  select coalesce(nullif(full_name, ''), username, 'A client') into client_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    app.freelancer_id, 'project_hired', 'You were hired!',
    client_name || ' hired you for "' || app.title || '". The project has started, and it''s due on '
      || to_char(project_due_date, 'FMMonth FMDD, YYYY') || '.'
      || case when job_price is not null then ' The price is ' || public.price_text(job_price, app.budget_type) || '.' else '' end
      || E'\n\n' || 'Open the project to read the client''s note. You can message the client from there too.',
    '/dashboard/project-details/' || new_project
  );

  return new_project;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Propose and agree, for a project that has no price yet.
-- ---------------------------------------------------------------------------

-- Either person names a price. Allowed while there is none or one is waiting for
-- an answer (so the proposer can change their mind); never after it is agreed.
create or replace function public.propose_project_price(target_project uuid, new_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  amt numeric(10,2);
  basis text;
  other_person uuid;
  my_name text;
begin
  select * into p from public.projects where id = target_project for update;

  if not found or auth.uid() is null or auth.uid() not in (p.client_id, p.freelancer_id) then
    raise exception 'Only the two people on this project can set its price.';
  end if;
  if p.price_status = 'agreed' then
    raise exception 'The price is already agreed.';
  end if;

  if new_amount is null or new_amount > 1000000 then
    raise exception 'The price must be more than ₱0 and at most ₱1,000,000.';
  end if;
  amt := round(new_amount, 2);
  if amt <= 0 then
    raise exception 'The price must be more than ₱0 and at most ₱1,000,000.';
  end if;
  if p.price_status = 'proposed' and p.price_proposed_by = auth.uid() and p.agreed_amount = amt then
    raise exception 'You already proposed that price. Wait for the other person to agree.';
  end if;

  -- A hire keeps what the job post counts (a job paid per day or month); anything
  -- else is a price for the whole project.
  basis := coalesce(p.price_basis, (select j.budget_type from public.job_posts j where j.id = p.job_post_id), 'project');

  update public.projects
     set agreed_amount = amt, price_basis = basis, price_status = 'proposed',
         price_source = 'proposal', price_proposed_by = auth.uid(), price_agreed_at = null
   where id = p.id;

  other_person := case when auth.uid() = p.client_id then p.freelancer_id else p.client_id end;
  select coalesce(nullif(full_name, ''), username, 'Someone') into my_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    other_person, 'price_proposed', 'Price proposed',
    my_name || ' proposed a price for "' || p.title || '": ' || public.price_text(amt, basis) || '.'
      || E'\n\n' || 'Open the project to agree to it, or message them if you want a different price.',
    '/dashboard/project-details/' || p.id
  );
end;
$$;

-- The OTHER person says yes. The proposer cannot agree to their own price.
create or replace function public.agree_project_price(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  my_name text;
begin
  select * into p from public.projects where id = target_project for update;

  if not found or auth.uid() is null or auth.uid() not in (p.client_id, p.freelancer_id) then
    raise exception 'Only the two people on this project can agree to its price.';
  end if;
  if p.price_status = 'agreed' then
    raise exception 'The price is already agreed.';
  end if;
  if p.price_status <> 'proposed' then
    raise exception 'Nobody has proposed a price yet.';
  end if;
  if p.price_proposed_by = auth.uid() then
    raise exception 'You proposed this price. The other person has to agree to it.';
  end if;

  update public.projects set price_status = 'agreed', price_agreed_at = now() where id = p.id;

  select coalesce(nullif(full_name, ''), username, 'Someone') into my_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    p.price_proposed_by, 'price_agreed', 'Price agreed',
    my_name || ' agreed to ' || public.price_text(p.agreed_amount, p.price_basis) || ' for "' || p.title || '".',
    '/dashboard/project-details/' || p.id
  );
end;
$$;

revoke execute on function public.propose_project_price(uuid, numeric) from public, anon;
revoke execute on function public.agree_project_price(uuid) from public, anon;
grant execute on function public.propose_project_price(uuid, numeric) to authenticated;
grant execute on function public.agree_project_price(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Two new kinds of notifications (keeps every kind already live).
-- ---------------------------------------------------------------------------

alter table public.user_notifications drop constraint user_notifications_type_check;
alter table public.user_notifications add constraint user_notifications_type_check
  check (type in ('verification_approved', 'verification_rejected', 'suspension',
                  'suspension_lifted', 'appeal_accepted', 'appeal_rejected',
                  'report_resolved', 'report_dismissed',
                  'project_hired', 'project_submitted', 'project_done', 'project_changes',
                  'project_rated',
                  'booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled',
                  'school_id_pass',
                  'payment_sent', 'payment_confirmed', 'payment_not_received', 'payment_requested',
                  'promotion_approved', 'promotion_rejected',
                  'price_proposed', 'price_agreed'));
