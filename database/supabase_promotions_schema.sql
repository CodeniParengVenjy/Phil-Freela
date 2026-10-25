-- Earning plan, Step 1: the database (see PLAN-monetization.md). Run this in the
-- Supabase SQL Editor after supabase_billboard_schema.sql,
-- supabase_admin_log_schema.sql, supabase_payments_schema.sql and
-- supabase_job_post_details_schema.sql (it uses dashboard_billboards, admin_log,
-- user_notifications, services, job_posts and job_state()).
--
-- PhilFreela earns from things it sells itself, never from the money between a
-- client and a freelancer:
--   * Sponsored billboards: an admin posts a sponsor's banner with a start and an
--     end date, and it stops showing by itself.
--   * Featured posts: the owner of an offer or an open job post pays to be shown in
--     a separate "Featured" row for 3, 7 or 14 days (3 spots per list).
--   * Freelancer Pro: 30 days of a Pro badge and more room (15 offers; free is 3).
-- A fee is paid in the GCash app to PhilFreela's own number. The payer then sends
-- the 13-digit reference number and a receipt screenshot; an admin checks
-- PhilFreela's own GCash and Approves or Rejects. No gateway, nothing automatic.
-- Nothing runs on a timer: every list compares an end date with now().
--
-- The end dates live in their own tables (featured_posts, pro_members) on
-- purpose: profiles, services and job_posts let a signed-in person update their
-- own row, so a "pro_until" column there could be changed by the person.
--
-- This file is only the database. No page uses it yet.

-- ---------------------------------------------------------------------------
-- 1. PhilFreela's own GCash details. One row, readable by every signed-in
--    person (they need it to pay), changed only by a super admin.
-- ---------------------------------------------------------------------------

create table public.site_gcash (
  -- Always true, so a second row is impossible.
  id boolean primary key default true check (id),
  gcash_number text not null check (gcash_number ~ '^09[0-9]{9}$'),
  -- Same rules as a freelancer's GCash name (supabase_payments_schema.sql).
  account_name text not null check (
    account_name ~ '^[A-Za-zÀ-ÖØ-öø-ɏ][A-Za-zÀ-ÖØ-öø-ɏ .''-]{1,59}$'
    and account_name !~ '  '
    and account_name = btrim(account_name)
  ),
  -- The QR picture in the private promo-qr bucket: "<admin id>/<file>".
  qr_path text check (qr_path is null or qr_path ~ '^[0-9a-f-]{36}/[0-9A-Za-z._-]+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admins (id) on delete set null
);

alter table public.site_gcash enable row level security;

create policy "site_gcash: signed-in users can read"
  on public.site_gcash for select
  to authenticated
  using (true);

create policy "site_gcash: a super admin can add"
  on public.site_gcash for insert
  to authenticated
  with check ((select public.is_super_admin()));

create policy "site_gcash: a super admin can change"
  on public.site_gcash for update
  to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

revoke all on public.site_gcash from anon;
revoke delete on public.site_gcash from authenticated;

-- Keeps updated_at and updated_by honest.
create or replace function public.touch_site_gcash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select a.id from public.admins a where a.id = auth.uid());
  return new;
end;
$$;

revoke execute on function public.touch_site_gcash() from public, anon, authenticated;

create trigger site_gcash_touch
  before insert or update on public.site_gcash
  for each row execute function public.touch_site_gcash();

-- ---------------------------------------------------------------------------
-- 2. The price list. Four fixed options; a super admin can change the prices.
-- ---------------------------------------------------------------------------

create table public.promo_prices (
  code text primary key check (code in ('feature_3', 'feature_7', 'feature_14', 'pro_30')),
  label text not null,
  days int not null check (days between 1 and 366),
  price numeric(8,2) not null check (price > 0 and price <= 100000),
  -- What a Pro member pays instead (featuring only; empty for the Pro plan).
  pro_price numeric(8,2) check (pro_price is null or (pro_price > 0 and pro_price <= price))
);

insert into public.promo_prices (code, label, days, price, pro_price) values
  ('feature_3',  'Featured for 3 days',        3,  49.00, 25.00),
  ('feature_7',  'Featured for 7 days',        7,  99.00, 50.00),
  ('feature_14', 'Featured for 14 days',      14, 179.00, 90.00),
  ('pro_30',     'Freelancer Pro for 30 days', 30, 149.00, null);

alter table public.promo_prices enable row level security;

create policy "promo_prices: signed-in users can read"
  on public.promo_prices for select
  to authenticated
  using (true);

create policy "promo_prices: a super admin can change prices"
  on public.promo_prices for update
  to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- Only the two prices can be changed, never the options themselves.
revoke all on public.promo_prices from anon;
revoke insert, update, delete on public.promo_prices from authenticated;
grant update (price, pro_price) on public.promo_prices to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The requests. One row per payment sent for a featured post or for Pro.
-- ---------------------------------------------------------------------------

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  -- Who paid.
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('feature_service', 'feature_job', 'pro')),
  price_code text not null references public.promo_prices (code),
  -- What is featured. If the post is deleted later these become empty, but the
  -- row stays as the record of the payment, with the title saved below.
  service_id uuid references public.services (id) on delete set null,
  job_id uuid references public.job_posts (id) on delete set null,
  target_title text,
  -- Copied when the request is made, so a later price change doesn't alter it.
  days int not null check (days > 0),
  amount numeric(8,2) not null check (amount > 0),
  -- The 13 digits on the GCash receipt, saved without spaces.
  reference_no text not null check (reference_no ~ '^[0-9]{13}$'),
  -- The receipt screenshot in the private promo-receipts bucket: "<user id>/<file>".
  receipt_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) between 3 and 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.admins (id) on delete set null,
  -- The period that was given, set when approved.
  starts_at timestamptz,
  ends_at timestamptz,
  constraint promotions_target check (
    (kind = 'feature_service' and job_id is null)
    or (kind = 'feature_job' and service_id is null)
    or (kind = 'pro' and service_id is null and job_id is null)
  ),
  constraint promotions_receipt_own_folder
    check (split_part(receipt_path, '/', 1) = user_id::text),
  constraint promotions_decided check (
    (status = 'pending' and decided_at is null and starts_at is null and ends_at is null and reject_reason is null)
    or (status = 'approved' and decided_at is not null and starts_at is not null and ends_at > starts_at and reject_reason is null)
    or (status = 'rejected' and decided_at is not null and reject_reason is not null and starts_at is null and ends_at is null)
  )
);

create index promotions_user_id_idx on public.promotions (user_id);
create index promotions_status_idx on public.promotions (status, created_at);
create index promotions_service_id_idx on public.promotions (service_id);
create index promotions_job_id_idx on public.promotions (job_id);
create index promotions_decided_by_idx on public.promotions (decided_by);
create index promotions_price_code_idx on public.promotions (price_code);

-- A reference number can be recorded only once, so one receipt can't pay for two
-- things. It is free again once its request was rejected.
create unique index promotions_reference_open_idx
  on public.promotions (reference_no)
  where status <> 'rejected';

-- One waiting request per offer, per job post and per person (for Pro).
create unique index promotions_one_pending_service_idx
  on public.promotions (service_id) where status = 'pending' and service_id is not null;
create unique index promotions_one_pending_job_idx
  on public.promotions (job_id) where status = 'pending' and job_id is not null;
create unique index promotions_one_pending_pro_idx
  on public.promotions (user_id) where status = 'pending' and kind = 'pro';

alter table public.promotions enable row level security;

-- The payer sees their own requests; admins see all of them.
create policy "promotions: the payer and admins can view"
  on public.promotions for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- There are no insert, update or remove rules: the browser can only READ.
-- Every change goes through a function below (the same pattern as payments).
revoke all on public.promotions from anon;
revoke insert, update, delete on public.promotions from authenticated;

-- ---------------------------------------------------------------------------
-- 4. What is running now: featured posts and Pro members. Everyone signed in
--    can read them (the lists and badges need it); nobody can write them from
--    the browser, only approve_promotion() below does.
-- ---------------------------------------------------------------------------

create table public.featured_posts (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services (id) on delete cascade,
  job_id uuid references public.job_posts (id) on delete cascade,
  featured_until timestamptz not null,
  -- Exactly one of the two.
  constraint featured_posts_one_target check ((service_id is not null) <> (job_id is not null))
);

-- One row per post (paying again moves the end date).
create unique index featured_posts_service_idx on public.featured_posts (service_id);
create unique index featured_posts_job_idx on public.featured_posts (job_id);
create index featured_posts_until_idx on public.featured_posts (featured_until);

alter table public.featured_posts enable row level security;

create policy "featured_posts: signed-in users can read"
  on public.featured_posts for select
  to authenticated
  using (true);

revoke all on public.featured_posts from anon;
revoke insert, update, delete on public.featured_posts from authenticated;

create table public.pro_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  pro_until timestamptz not null
);

alter table public.pro_members enable row level security;

create policy "pro_members: signed-in users can read"
  on public.pro_members for select
  to authenticated
  using (true);

revoke all on public.pro_members from anon;
revoke insert, update, delete on public.pro_members from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sponsored billboards: the billboard table gets a sponsor and its dates.
-- ---------------------------------------------------------------------------

alter table public.dashboard_billboards
  -- Empty = a normal admin billboard (a welcome message). Filled = "Sponsored by ...".
  add column sponsor_name text check (
    sponsor_name is null or (char_length(sponsor_name) between 1 and 60 and sponsor_name = btrim(sponsor_name))
  ),
  -- What the sponsor paid and the GCash reference, kept as the admin's record.
  add column amount numeric(10,2) check (amount is null or (amount > 0 and amount <= 1000000)),
  add column payment_ref text check (payment_ref is null or payment_ref ~ '^[0-9]{13}$'),
  -- It shows from starts_at until ends_at (empty = no end, like the welcome ones).
  add column starts_at timestamptz not null default now(),
  add column ends_at timestamptz,
  add constraint dashboard_billboards_dates check (ends_at is null or ends_at > starts_at);

-- Users only see a billboard that is on, meant for them AND inside its dates.
-- Admins still see all of them. (ALTER POLICY keeps the policy in place.)
alter policy "users can read their billboards"
  on public.dashboard_billboards
  using (
    (
      is_active
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (
        audience = 'all'
        or audience = (select account_type::text from public.profiles where id = (select auth.uid()))
      )
    )
    or (select public.is_admin())
  );

-- Besides on / off, an admin can now move the end date (to extend a sponsorship).
-- The words, the picture and the start date still can't be quietly rewritten.
grant update (ends_at) on public.dashboard_billboards to authenticated;

-- The Activity Log also mentions the sponsor and an end date change.
create or replace function public.log_billboard_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_admin_log(
      'announcement',
      'posted the billboard "' || new.title || '" for ' ||
        case new.audience when 'freelancer' then 'freelancers' when 'client' then 'clients' else 'everyone' end ||
        case when new.sponsor_name is not null then ' (sponsored by ' || new.sponsor_name || ')' else '' end || '.',
      new.id
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_active is distinct from old.is_active then
      perform public.write_admin_log(
        'announcement',
        'turned the billboard "' || new.title || '" ' || case when new.is_active then 'on' else 'off' end || '.',
        new.id
      );
    end if;
    if new.ends_at is distinct from old.ends_at then
      perform public.write_admin_log(
        'announcement',
        case
          when new.ends_at is null then 'removed the end date of the billboard "' || new.title || '".'
          else 'set the end date of the billboard "' || new.title || '" to '
            || to_char(new.ends_at at time zone 'Asia/Manila', 'YYYY-MM-DD') || '.'
        end,
        new.id
      );
    end if;
    return new;
  end if;

  perform public.write_admin_log('announcement', 'deleted the billboard "' || old.title || '".', old.id);
  return old;
end;
$$;

revoke execute on function public.log_billboard_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Private storage: receipts and PhilFreela's QR picture.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('promo-receipts', 'promo-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('promo-qr', 'promo-qr', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Receipts: a person uploads only into their own folder: promo-receipts/<user id>/...
create policy "promo-receipts: people can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'promo-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Opening a receipt: the person who uploaded it, or an admin (to check a request).
create policy "promo-receipts: the uploader and admins can open"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'promo-receipts'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

-- An upload can be removed only while no request uses it, so a receipt that is
-- on record stays as the evidence.
create policy "promo-receipts: people can remove an unused upload"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'promo-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.promotions pr where pr.receipt_path = objects.name)
  );

-- PhilFreela's QR picture: a super admin manages it, every signed-in person can open it.
create policy "promo-qr: signed-in users can open"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'promo-qr');

create policy "promo-qr: a super admin can upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'promo-qr' and (select public.is_super_admin()));

create policy "promo-qr: a super admin can replace"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'promo-qr' and (select public.is_super_admin()))
  with check (bucket_id = 'promo-qr' and (select public.is_super_admin()));

create policy "promo-qr: a super admin can remove"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'promo-qr' and (select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- 7. New kinds of notifications and of Activity Log entries (each keeps every
--    kind already live).
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
                  'promotion_approved', 'promotion_rejected'));

alter table public.admin_log drop constraint admin_log_action_check;
alter table public.admin_log add constraint admin_log_action_check
  check (action in ('suspend', 'ban', 'lift', 'report', 'verification', 'appeal',
                    'announcement', 'flagged', 'listing', 'admin',
                    'user_delete', 'user_archive', 'user_restore',
                    'promotion'));

-- ---------------------------------------------------------------------------
-- 8. The functions the pages call. Problems are raised with a plain message
--    that the page shows as is.
-- ---------------------------------------------------------------------------

-- Is this person a Pro member right now?
create or replace function public.is_pro(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pro_members where user_id = target and pro_until > now());
$$;

revoke execute on function public.is_pro(uuid) from public, anon;
grant execute on function public.is_pro(uuid) to authenticated;

-- How many Featured spots are free in a list ('service' = Browse Services,
-- 'job' = Find Jobs). There are 3 per list. Featured posts running now use a
-- spot, and so does a waiting request for a post that is not featured yet.
create or replace function public.featured_slots_left(want text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  running int;
  waiting int;
begin
  if want not in ('service', 'job') then
    raise exception 'Choose service or job.';
  end if;

  select count(*) into running
    from public.featured_posts f
   where f.featured_until > now()
     and ((want = 'service' and f.service_id is not null) or (want = 'job' and f.job_id is not null));

  select count(*) into waiting
    from public.promotions p
   where p.status = 'pending'
     and ((want = 'service' and p.kind = 'feature_service') or (want = 'job' and p.kind = 'feature_job'))
     and not exists (
       select 1 from public.featured_posts f
        where f.featured_until > now()
          and ((p.service_id is not null and f.service_id = p.service_id)
            or (p.job_id is not null and f.job_id = p.job_id))
     );

  return greatest(0, 3 - running - waiting);
end;
$$;

revoke execute on function public.featured_slots_left(text) from public, anon;
grant execute on function public.featured_slots_left(text) to authenticated;

-- "I've paid": a featured post (own offer, or own OPEN job post) or Pro (a
-- freelancer account). The price is copied from the price list (a Pro member
-- pays the lower featuring price). The reference is 13 digits (spaces are
-- ignored) and must be new. The receipt must be a file the person really
-- uploaded into their own folder. Saves the request as pending and returns its id.
create or replace function public.request_promotion(
  p_code text, p_service uuid, p_job uuid, p_reference text, p_receipt_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  price_row public.promo_prices%rowtype;
  my_type text;
  ref text := regexp_replace(coalesce(p_reference, ''), '\s', '', 'g');
  v_kind text;
  v_title text;
  v_amount numeric(8,2);
  v_extending boolean := false;
  new_id uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;

  select * into price_row from public.promo_prices where code = p_code;
  if not found then
    raise exception 'Choose one of the listed options.';
  end if;

  select account_type::text into my_type from public.profiles where id = me;
  if my_type is null then
    raise exception 'Please finish setting up your account first.';
  end if;
  if public.is_posting_blocked(me) then
    raise exception 'Your account cannot do this right now.';
  end if;

  if p_code = 'pro_30' then
    if my_type <> 'freelancer' then
      raise exception 'Freelancer Pro is for freelancer accounts.';
    end if;
    if p_service is not null or p_job is not null then
      raise exception 'Pro is for your account, not for a post.';
    end if;
    if exists (select 1 from public.promotions where user_id = me and kind = 'pro' and status = 'pending') then
      raise exception 'You already have a Pro payment waiting for review.';
    end if;
    v_kind := 'pro';
    v_amount := price_row.price;
  else
    if (p_service is null) = (p_job is null) then
      raise exception 'Choose one post to feature.';
    end if;

    if p_service is not null then
      select title into v_title from public.services where id = p_service and freelancer_id = me;
      if not found then
        raise exception 'You can only feature your own offers.';
      end if;
      v_kind := 'feature_service';
      if exists (select 1 from public.promotions where service_id = p_service and status = 'pending') then
        raise exception 'A request for this offer is already waiting for review.';
      end if;
      v_extending := exists (
        select 1 from public.featured_posts where service_id = p_service and featured_until > now()
      );
    else
      select title into v_title from public.job_posts where id = p_job and client_id = me;
      if not found then
        raise exception 'You can only feature your own job posts.';
      end if;
      if public.job_state(p_job) <> 'open' then
        raise exception 'Only an open job post can be featured.';
      end if;
      v_kind := 'feature_job';
      if exists (select 1 from public.promotions where job_id = p_job and status = 'pending') then
        raise exception 'A request for this job post is already waiting for review.';
      end if;
      v_extending := exists (
        select 1 from public.featured_posts where job_id = p_job and featured_until > now()
      );
    end if;

    -- Paying again for a post that is already featured extends it and needs no new spot.
    if not v_extending
       and public.featured_slots_left(case v_kind when 'feature_service' then 'service' else 'job' end) < 1 then
      raise exception 'All 3 Featured spots are taken right now. Try again when one ends.';
    end if;

    v_amount := case
      when price_row.pro_price is not null and public.is_pro(me) then price_row.pro_price
      else price_row.price
    end;
  end if;

  if ref !~ '^[0-9]{13}$' then
    raise exception 'The GCash reference number is 13 digits.';
  end if;
  if p_receipt_path is null
     or p_receipt_path !~ ('^' || me::text || '/[^/]+$')
     or not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'promo-receipts' and o.name = p_receipt_path
     ) then
    raise exception 'Attach your receipt screenshot to continue.';
  end if;
  if exists (select 1 from public.promotions where reference_no = ref and status <> 'rejected') then
    raise exception 'This reference number was already recorded.';
  end if;

  begin
    insert into public.promotions (user_id, kind, price_code, service_id, job_id, target_title, days, amount, reference_no, receipt_path)
    values (me, v_kind, price_row.code, p_service, p_job, v_title, price_row.days, v_amount, ref, p_receipt_path)
    returning id into new_id;
  exception when unique_violation then
    -- Two requests at the same moment.
    raise exception 'This reference number was already recorded, or this request is already waiting for review.';
  end;

  return new_id;
end;
$$;

revoke execute on function public.request_promotion(text, uuid, uuid, text, text) from public, anon;
grant execute on function public.request_promotion(text, uuid, uuid, text, text) to authenticated;

-- "Approve": an admin, after checking PhilFreela's own GCash. Only while the
-- request is pending; the row is locked first so two clicks can't answer it
-- twice. The period starts now, or when the one that is running ends, so paying
-- again adds to it. Writes featured_posts / pro_members, tells the person and
-- writes the Activity Log.
create or replace function public.approve_promotion(target_promotion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.promotions%rowtype;
  cur timestamptz;
  new_start timestamptz;
  new_end timestamptz;
  until_text text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve a payment.';
  end if;

  select * into pr from public.promotions where id = target_promotion for update;
  if not found then
    raise exception 'That request was not found.';
  end if;
  if pr.status <> 'pending' then
    raise exception 'This request was already answered.';
  end if;

  if pr.kind = 'feature_service' then
    if pr.service_id is null then
      raise exception 'The offer was removed. Reject this request.';
    end if;
    select featured_until into cur from public.featured_posts where service_id = pr.service_id;
  elsif pr.kind = 'feature_job' then
    if pr.job_id is null then
      raise exception 'The job post was removed. Reject this request.';
    end if;
    if public.job_state(pr.job_id) <> 'open' then
      raise exception 'The job post is no longer open. Reject this request.';
    end if;
    select featured_until into cur from public.featured_posts where job_id = pr.job_id;
  else
    select pro_until into cur from public.pro_members where user_id = pr.user_id;
  end if;

  new_start := greatest(now(), coalesce(cur, now()));
  new_end := new_start + make_interval(days => pr.days);

  if pr.kind = 'feature_service' then
    insert into public.featured_posts (service_id, featured_until) values (pr.service_id, new_end)
    on conflict (service_id) do update set featured_until = excluded.featured_until;
  elsif pr.kind = 'feature_job' then
    insert into public.featured_posts (job_id, featured_until) values (pr.job_id, new_end)
    on conflict (job_id) do update set featured_until = excluded.featured_until;
  else
    insert into public.pro_members (user_id, pro_until) values (pr.user_id, new_end)
    on conflict (user_id) do update set pro_until = excluded.pro_until;
  end if;

  update public.promotions
     set status = 'approved',
         decided_at = now(),
         decided_by = (select a.id from public.admins a where a.id = auth.uid()),
         starts_at = new_start,
         ends_at = new_end
   where id = pr.id;

  until_text := to_char(new_end at time zone 'Asia/Manila', 'FMMonth FMDD, YYYY');

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    pr.user_id, 'promotion_approved', 'Payment approved',
    case
      when pr.kind = 'pro' then 'You are a Freelancer Pro until ' || until_text || '.'
      else '"' || coalesce(pr.target_title, 'Your post') || '" is Featured until ' || until_text || '.'
    end,
    case pr.kind when 'feature_job' then '/dashboard/post-need' else '/dashboard/services' end
  );

  perform public.write_admin_log(
    'promotion',
    'approved the ' || case pr.kind when 'pro' then 'Freelancer Pro' else 'Featured post' end
      || ' payment of ₱' || to_char(pr.amount, 'FM999,999,990.00')
      || coalesce(' for "' || pr.target_title || '"', '') || '.',
    pr.id
  );
end;
$$;

revoke execute on function public.approve_promotion(uuid) from public, anon;
grant execute on function public.approve_promotion(uuid) to authenticated;

-- "Reject": the same rules; a reason of 3 to 200 characters is required so the
-- person knows what to fix.
create or replace function public.reject_promotion(target_promotion uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.promotions%rowtype;
  why text := btrim(coalesce(reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reject a payment.';
  end if;
  if char_length(why) < 3 or char_length(why) > 200 then
    raise exception 'Write a reason of 3 to 200 characters so the person knows what to fix.';
  end if;

  select * into pr from public.promotions where id = target_promotion for update;
  if not found then
    raise exception 'That request was not found.';
  end if;
  if pr.status <> 'pending' then
    raise exception 'This request was already answered.';
  end if;

  update public.promotions
     set status = 'rejected',
         reject_reason = why,
         decided_at = now(),
         decided_by = (select a.id from public.admins a where a.id = auth.uid())
   where id = pr.id;

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    pr.user_id, 'promotion_rejected', 'Payment not accepted',
    'Your payment of ₱' || to_char(pr.amount, 'FM999,999,990.00')
      || coalesce(' for "' || pr.target_title || '"', '') || ' was not accepted.'
      || E'\n\n' || 'Reason: ' || why
      || E'\n\n' || 'If you really paid, send the request again with the right reference number and receipt.',
    case pr.kind when 'feature_job' then '/dashboard/post-need' else '/dashboard/services' end
  );

  perform public.write_admin_log(
    'promotion',
    'rejected the ' || case pr.kind when 'pro' then 'Freelancer Pro' else 'Featured post' end
      || ' payment of ₱' || to_char(pr.amount, 'FM999,999,990.00')
      || coalesce(' for "' || pr.target_title || '"', '') || '.',
    pr.id
  );
end;
$$;

revoke execute on function public.reject_promotion(uuid, text) from public, anon;
grant execute on function public.reject_promotion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The offer limit: a free account can have 3 offers, a Pro member 15. Someone
--    who already has more (or whose Pro ended) keeps what they have and just can't
--    add another.
-- ---------------------------------------------------------------------------

create or replace function public.limit_offers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap int := case when public.is_pro(new.freelancer_id) then 15 else 3 end;
  have int;
begin
  select count(*) into have from public.services where freelancer_id = new.freelancer_id;
  if have >= cap then
    raise exception '%', case
      when cap = 3 then 'Free accounts can have up to 3 offers. Go Pro to have up to 15.'
      else 'You have reached the limit of 15 offers.'
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_offers() from public, anon, authenticated;

create trigger services_offer_limit
  before insert on public.services
  for each row execute function public.limit_offers();
