-- GCash payments, Step 1: the database (see PLAN-gcash-payments.md). Run this in
-- the Supabase SQL Editor after supabase_projects_schema.sql and
-- supabase_bookings_schema.sql (it uses profiles, projects and
-- user_notifications).
--
-- PhilFreela never touches the money. A freelancer saves a GCash number (and
-- optionally a QR picture). The client of a project pays in the GCash app, then
-- records the payment here: amount, the 13-digit GCash reference number and the
-- receipt screenshot (the proof on record). The freelancer checks their own
-- GCash and answers Confirm received or Not received. Nothing here can see GCash,
-- so the freelancer's answer is the check.
--
-- This file is only the database. Payments from a chat come later (Step 5).

-- ---------------------------------------------------------------------------
-- 1. The freelancer's GCash details. One row per freelancer, private to them.
-- ---------------------------------------------------------------------------

create table public.gcash_accounts (
  freelancer_id uuid primary key references public.profiles(id) on delete cascade,
  -- 09 and 9 more digits, e.g. 09171234567 (the page shows it as 0917 123 4567).
  gcash_number text not null check (gcash_number ~ '^09[0-9]{9}$'),
  -- The name on the GCash account, so the client can compare it with the name
  -- GCash shows before sending. Letters (accents too), spaces, dots, hyphens and
  -- apostrophes; 2 to 60 characters; no double spaces.
  account_name text not null check (
    account_name ~ '^[A-Za-zÀ-ÖØ-öø-ɏ][A-Za-zÀ-ÖØ-öø-ɏ .''-]{1,59}$'
    and account_name !~ '  '
    and account_name = btrim(account_name)
  ),
  -- The QR picture in the private gcash-qr bucket: "<freelancer id>/<file>".
  qr_path text,
  updated_at timestamptz not null default now(),
  constraint gcash_accounts_qr_own_folder
    check (qr_path is null or split_part(qr_path, '/', 1) = freelancer_id::text)
);

alter table public.gcash_accounts enable row level security;

-- Only the owner can see or change their own row. Clients get what they need
-- through get_pay_details() below, never by reading this table.
create policy "gcash_accounts: the owner can read"
  on public.gcash_accounts for select
  to authenticated
  using (freelancer_id = (select auth.uid()));

create policy "gcash_accounts: the owner can add"
  on public.gcash_accounts for insert
  to authenticated
  with check (freelancer_id = (select auth.uid()));

create policy "gcash_accounts: the owner can change"
  on public.gcash_accounts for update
  to authenticated
  using (freelancer_id = (select auth.uid()))
  with check (freelancer_id = (select auth.uid()));

create policy "gcash_accounts: the owner can remove"
  on public.gcash_accounts for delete
  to authenticated
  using (freelancer_id = (select auth.uid()));

revoke all on public.gcash_accounts from anon;

-- Keeps updated_at honest.
create or replace function public.touch_gcash_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.touch_gcash_account() from public, anon, authenticated;

create trigger gcash_accounts_touch
  before update on public.gcash_accounts
  for each row execute function public.touch_gcash_account();

-- ---------------------------------------------------------------------------
-- 2. The payments. One row per recorded payment on a project.
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Who paid and who was paid, copied from the project.
  client_id uuid not null references public.profiles(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0 and amount <= 1000000),
  -- The 13 digits on the GCash receipt, saved without spaces.
  reference_no text not null check (reference_no ~ '^[0-9]{13}$'),
  -- The receipt screenshot in the private receipts bucket: "<client id>/<file>".
  receipt_path text not null,
  -- sent -> confirmed or not_received (the freelancer's answer). Chat requests
  -- add 'requested' and 'cancelled' later.
  status text not null default 'sent' check (status in ('sent', 'confirmed', 'not_received')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  constraint payments_two_people check (client_id <> freelancer_id),
  constraint payments_receipt_own_folder
    check (split_part(receipt_path, '/', 1) = client_id::text),
  constraint payments_answered_check check ((status = 'sent') = (answered_at is null))
);

create index payments_project_id_idx on public.payments (project_id);
create index payments_client_id_idx on public.payments (client_id);
create index payments_freelancer_id_idx on public.payments (freelancer_id);

-- A reference number can be recorded only once, so one receipt can't be reused
-- on another payment. Once a payment is answered "Not received" its reference is
-- free again, so the client can record the same payment properly if it was only
-- a delay on the freelancer's side.
create unique index payments_reference_open_idx
  on public.payments (reference_no)
  where status <> 'not_received';

alter table public.payments enable row level security;

-- Only the client and the freelancer on a payment can see it.
create policy "payments: the client and freelancer can view"
  on public.payments for select
  to authenticated
  using (client_id = (select auth.uid()) or freelancer_id = (select auth.uid()));

-- There are no insert, update or remove rules: the browser can only READ
-- payments. Every change goes through a function below, which checks who is
-- asking and what status the payment is in (the same pattern as bookings).
revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private storage: the QR pictures and the receipt screenshots.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gcash-qr', 'gcash-qr', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- QR pictures: a freelancer uploads, replaces and removes only in their own
-- folder: gcash-qr/<freelancer id>/...
create policy "gcash-qr: freelancers can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'gcash-qr' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "gcash-qr: freelancers can replace their own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'gcash-qr' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'gcash-qr' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "gcash-qr: freelancers can remove their own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'gcash-qr' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Opening a QR: its owner, or a client who has a project with that freelancer.
create policy "gcash-qr: the owner and a client of theirs can open"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'gcash-qr'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.projects p
        where p.client_id = (select auth.uid())
          and p.freelancer_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- Receipts: a client uploads only into their own folder: receipts/<client id>/...
create policy "receipts: clients can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Opening a receipt: the person who uploaded it, or either person on a payment
-- that uses it.
create policy "receipts: the uploader and the two people on a payment can open"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.payments pay
        where pay.receipt_path = objects.name
          and (pay.client_id = (select auth.uid()) or pay.freelancer_id = (select auth.uid()))
      )
    )
  );

-- A client can remove their own upload only while no payment uses it, so a
-- receipt that is on record stays as the evidence.
create policy "receipts: clients can remove an unused upload"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.payments pay where pay.receipt_path = objects.name)
  );

-- ---------------------------------------------------------------------------
-- 4. New kinds of notifications (keeps every kind already live).
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
                  'payment_sent', 'payment_confirmed', 'payment_not_received'));

-- ---------------------------------------------------------------------------
-- 5. The functions the buttons call. Problems are raised with a plain message
-- that the page shows as is.
-- ---------------------------------------------------------------------------

-- "Pay via GCash": where to send the money. Only the client of that project
-- gets the freelancer's name, number and QR path. No rows come back when the
-- freelancer has not saved any details yet.
create or replace function public.get_pay_details(target_project uuid)
returns table (account_name text, gcash_number text, qr_path text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.projects p where p.id = target_project and p.client_id = auth.uid()
  ) then
    raise exception 'Only the client of this project can see where to pay.';
  end if;

  return query
    select a.account_name, a.gcash_number, a.qr_path
      from public.gcash_accounts a
      join public.projects p on p.freelancer_id = a.freelancer_id
     where p.id = target_project;
end;
$$;

revoke execute on function public.get_pay_details(uuid) from public, anon;
grant execute on function public.get_pay_details(uuid) to authenticated;

-- "I've paid". Only the client of the project. The amount is more than 0 and at
-- most 1,000,000 with up to 2 decimals. The reference is 13 digits (spaces are
-- ignored) and must be new. The receipt must be a file the client really
-- uploaded into their own folder. Saves the payment as "sent" and tells the
-- freelancer. Returns the new payment's id.
create or replace function public.record_payment(target_project uuid, pay_amount numeric, pay_reference text, pay_receipt_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
  ref text := regexp_replace(coalesce(pay_reference, ''), '\s', '', 'g');
  client_name text;
  new_payment uuid;
begin
  select id, title, client_id, freelancer_id into proj
    from public.projects where id = target_project;

  if not found or proj.client_id <> auth.uid() then
    raise exception 'Only the client of this project can record a payment.';
  end if;
  if pay_amount is null or pay_amount <= 0 or pay_amount > 1000000 then
    raise exception 'The amount must be more than 0 and at most 1,000,000 pesos.';
  end if;
  if pay_amount <> round(pay_amount, 2) then
    raise exception 'The amount can have up to 2 decimals.';
  end if;
  if ref !~ '^[0-9]{13}$' then
    raise exception 'The GCash reference number is 13 digits.';
  end if;
  if pay_receipt_path is null
     or pay_receipt_path !~ ('^' || auth.uid()::text || '/[^/]+$')
     or not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'receipts' and o.name = pay_receipt_path
     ) then
    raise exception 'Attach your receipt screenshot to continue.';
  end if;
  if exists (
    select 1 from public.payments where reference_no = ref and status <> 'not_received'
  ) then
    raise exception 'This reference number was already recorded.';
  end if;

  begin
    insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path)
    values (proj.id, proj.client_id, proj.freelancer_id, pay_amount, ref, pay_receipt_path)
    returning id into new_payment;
  exception when unique_violation then
    -- Two records of the same reference at the same moment.
    raise exception 'This reference number was already recorded.';
  end;

  select coalesce(nullif(full_name, ''), username, 'A client') into client_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    proj.freelancer_id, 'payment_sent', 'Payment sent',
    client_name || ' says they sent ₱' || to_char(pay_amount, 'FM999,999,990.00')
      || ' for "' || proj.title || '".'
      || E'\n\n' || 'Check your GCash, then confirm it on the project page.',
    '/dashboard/project-details/' || proj.id
  );

  return new_payment;
end;
$$;

revoke execute on function public.record_payment(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_payment(uuid, numeric, text, text) to authenticated;

-- "Confirm received". Only the freelancer who was paid, only while the payment
-- is "sent". The row is locked first, so two clicks can't answer it twice. Tells
-- the client.
create or replace function public.confirm_payment(target_payment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
  proj_title text;
  freelancer_name text;
begin
  select * into pay from public.payments where id = target_payment for update;

  if not found or pay.freelancer_id <> auth.uid() then
    raise exception 'Only the freelancer who was paid can answer this payment.';
  end if;
  if pay.status <> 'sent' then
    raise exception 'This payment was already answered.';
  end if;

  update public.payments set status = 'confirmed', answered_at = now() where id = pay.id;

  select title into proj_title from public.projects where id = pay.project_id;
  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    pay.client_id, 'payment_confirmed', 'Payment confirmed',
    freelancer_name || ' confirmed your payment of ₱' || to_char(pay.amount, 'FM999,999,990.00')
      || ' for "' || coalesce(proj_title, 'the project') || '".',
    '/dashboard/project-details/' || pay.project_id
  );
end;
$$;

revoke execute on function public.confirm_payment(uuid) from public, anon;
grant execute on function public.confirm_payment(uuid) to authenticated;

-- "Not received". The same rules as above. Tells the client, who can message the
-- freelancer, record the payment again with the right details, or use Report.
create or replace function public.mark_payment_not_received(target_payment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
  proj_title text;
  freelancer_name text;
begin
  select * into pay from public.payments where id = target_payment for update;

  if not found or pay.freelancer_id <> auth.uid() then
    raise exception 'Only the freelancer who was paid can answer this payment.';
  end if;
  if pay.status <> 'sent' then
    raise exception 'This payment was already answered.';
  end if;

  update public.payments set status = 'not_received', answered_at = now() where id = pay.id;

  select title into proj_title from public.projects where id = pay.project_id;
  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    pay.client_id, 'payment_not_received', 'Payment not received',
    freelancer_name || ' says your payment of ₱' || to_char(pay.amount, 'FM999,999,990.00')
      || ' for "' || coalesce(proj_title, 'the project') || '" did not arrive.'
      || E'\n\n' || 'Message them to sort it out. If you really paid, record the payment again with the right details.',
    '/dashboard/project-details/' || pay.project_id
  );
end;
$$;

revoke execute on function public.mark_payment_not_received(uuid) from public, anon;
grant execute on function public.mark_payment_not_received(uuid) to authenticated;

-- ===========================================================================
-- Part 2 (added after part 1 was applied, Step 3): live updates
-- Run it on its own, after part 1.
-- ===========================================================================

-- So the project page and the chat show the other person's answer without a
-- reload. Live updates follow the same row level security as a normal read: a
-- person is only told about payments they can see.
alter publication supabase_realtime add table public.payments;
