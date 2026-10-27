-- Premium (PLAN-premium.md, step 1: the database). Run after
-- supabase_promotions_schema.sql and supabase_online_pro_schema.sql.
--
-- "Freelancer Pro" becomes Premium, for clients and freelancers alike. The
-- inside names stay (price code pro_30, table pro_members, is_pro()): only
-- the words people see change. Premium's perks that the database checks:
--   - up to 15 offers instead of 3 (limit_offers, unchanged)
--   - half-price Featured posts (unchanged, now for clients' job posts too)
--   - one free 3-day Featured post every 30 days (use_free_feature)
--   - how many people opened your posts and your profile (page_views)
--   - chat documents up to 50 MB instead of 10 MB
--   - the two-color (gradient) look in Appearance
--   - the watermark's extra colors, fonts and sizes (freelancers)
-- And paying online through Xendit, which only Premium had, now also covers
-- Featured posts (start_feature_checkout) and sponsored billboards
-- (start_billboard_checkout): no receipt and no admin check; the server
-- functions ask Xendit before anything is given (supabase/functions).

-- ---------------------------------------------------------------------------
-- 1. The words: Premium
-- ---------------------------------------------------------------------------

update public.promo_prices set label = 'Premium for 30 days' where code = 'pro_30';

-- ---------------------------------------------------------------------------
-- 2. The payment records: online Featured and free Featured
-- ---------------------------------------------------------------------------

-- method: gcash (reference + receipt, an admin checks), online (Xendit), or
-- free (Premium's free Featured post: ₱0, no proof).
alter table public.promotions drop constraint promotions_method_check;
alter table public.promotions add constraint promotions_method_check
  check (method in ('gcash', 'online', 'free'));

alter table public.promotions drop constraint promotions_amount_check;
alter table public.promotions add constraint promotions_amount_check
  check (amount > 0 or (method = 'free' and amount = 0));

alter table public.promotions drop constraint promotions_method_proof;
alter table public.promotions add constraint promotions_method_proof check (
  (method = 'gcash' and reference_no is not null and receipt_path is not null and provider_payment_id is null and not test_mode)
  or (method = 'online' and status = 'approved' and reference_no is null and receipt_path is null and provider_payment_id is not null)
  or (method = 'free' and kind in ('feature_service', 'feature_job') and status = 'approved'
      and reference_no is null and receipt_path is null and provider_payment_id is null and not test_mode)
);

-- A Featured payment page remembers which post it is for.
alter table public.online_checkouts
  add column service_id uuid references public.services (id) on delete set null,
  add column job_id uuid references public.job_posts (id) on delete set null,
  add column target_title text;

-- Premium is for any account now (it was freelancers only).
create or replace function public.start_online_checkout(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  price_row public.promo_prices%rowtype;
  new_id uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if p_code is distinct from 'pro_30' then
    raise exception 'Choose one of the listed options.';
  end if;

  select * into price_row from public.promo_prices where code = p_code;
  if not found then
    raise exception 'Choose one of the listed options.';
  end if;

  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'Please finish setting up your account first.';
  end if;
  if public.is_posting_blocked(me) then
    raise exception 'Your account cannot do this right now.';
  end if;

  if (select count(*) from public.online_checkouts
       where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You opened many payment pages in the last hour. Please try again later.';
  end if;

  insert into public.online_checkouts (user_id, price_code, days, amount)
  values (me, price_row.code, price_row.days, price_row.price)
  returning id into new_id;

  return json_build_object('id', new_id, 'amount', price_row.price, 'days', price_row.days, 'label', price_row.label);
end;
$$;

-- The post a person may feature: their own offer, or their own open job post.
-- Returns its title; raises a sentence for the person otherwise. Both roles
-- need a verified ID to post, so featuring needs one too.
create or replace function public.featurable_post(me uuid, p_service uuid, p_job uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if (p_service is null) = (p_job is null) then
    raise exception 'Choose one post to feature.';
  end if;
  if public.is_posting_blocked(me) then
    raise exception 'Your account cannot do this right now.';
  end if;
  if not public.is_verified(me) then
    raise exception 'Verify your identity first.';
  end if;
  if p_service is not null then
    select title into v_title from public.services where id = p_service and freelancer_id = me;
    if not found then
      raise exception 'You can only feature your own offers.';
    end if;
  else
    select title into v_title from public.job_posts where id = p_job and client_id = me;
    if not found then
      raise exception 'You can only feature your own job posts.';
    end if;
    if public.job_state(p_job) <> 'open' then
      raise exception 'Only an open job post can be featured.';
    end if;
  end if;
  return v_title;
end;
$$;

revoke execute on function public.featurable_post(uuid, uuid, uuid) from public, anon, authenticated;

-- True when the post is Featured right now (paying again adds days after its end).
create or replace function public.featured_now(p_service uuid, p_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.featured_posts f
     where f.featured_until > now()
       and ((p_service is not null and f.service_id = p_service) or (p_job is not null and f.job_id = p_job))
  );
$$;

revoke execute on function public.featured_now(uuid, uuid) from public, anon;
grant execute on function public.featured_now(uuid, uuid) to authenticated;

-- Opens a Featured payment page (paid on Xendit's page, like Premium). The
-- price comes from the price list, half price for a Premium member.
create or replace function public.start_feature_checkout(p_code text, p_service uuid, p_job uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  price_row public.promo_prices%rowtype;
  v_title text;
  v_amount numeric(8,2);
  new_id uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if p_code not in ('feature_3', 'feature_7', 'feature_14') then
    raise exception 'Choose one of the listed options.';
  end if;
  select * into price_row from public.promo_prices where code = p_code;
  if not found then
    raise exception 'Choose one of the listed options.';
  end if;

  v_title := public.featurable_post(me, p_service, p_job);

  if not public.featured_now(p_service, p_job)
     and public.featured_slots_left(case when p_service is not null then 'service' else 'job' end) < 1 then
    raise exception 'All 3 Featured spots are taken right now. Try again when one ends.';
  end if;

  if (select count(*) from public.online_checkouts
       where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You opened many payment pages in the last hour. Please try again later.';
  end if;

  v_amount := case
    when price_row.pro_price is not null and public.is_pro(me) then price_row.pro_price
    else price_row.price
  end;

  insert into public.online_checkouts (user_id, price_code, days, amount, service_id, job_id, target_title)
  values (me, price_row.code, price_row.days, v_amount, p_service, p_job, v_title)
  returning id into new_id;

  return json_build_object('id', new_id, 'amount', v_amount, 'days', price_row.days,
                           'label', price_row.label, 'title', v_title);
end;
$$;

revoke execute on function public.start_feature_checkout(text, uuid, uuid) from public, anon;
grant execute on function public.start_feature_checkout(text, uuid, uuid) to authenticated;

-- Records a paid page (called by the server functions only, after Xendit said
-- it was paid): Premium starts or is extended, or the post is Featured.
create or replace function public.finish_online_checkout(p_checkout uuid, p_payment_id text, p_amount numeric, p_test boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  co public.online_checkouts%rowtype;
  v_kind text;
  cur timestamptz;
  new_start timestamptz;
  new_end timestamptz;
  promo_id uuid;
  until_text text;
  post_gone boolean := false;
begin
  select * into co from public.online_checkouts where id = p_checkout for update;
  if not found then
    raise exception 'That payment was not found.';
  end if;

  v_kind := case
    when co.price_code = 'pro_30' then 'pro'
    when co.job_id is not null then 'feature_job'
    else 'feature_service'
  end;

  -- Xendit can send the same news more than once; only the first one counts.
  if co.status = 'paid' then
    return json_build_object(
      'kind', v_kind,
      'pro_until', (select pro_until from public.pro_members where user_id = co.user_id),
      'already', true
    );
  end if;
  if p_payment_id is null or btrim(p_payment_id) = '' then
    raise exception 'The payment id is missing.';
  end if;
  if p_amount is distinct from co.amount then
    raise exception 'The amount paid does not match.';
  end if;
  if p_test is distinct from co.test_mode then
    raise exception 'A test payment and a live payment cannot be mixed.';
  end if;

  if v_kind = 'pro' then
    select pro_until into cur from public.pro_members where user_id = co.user_id;
  elsif v_kind = 'feature_service' then
    post_gone := co.service_id is null;
    select featured_until into cur from public.featured_posts where service_id = co.service_id;
  else
    post_gone := co.job_id is null;
    select featured_until into cur from public.featured_posts where job_id = co.job_id;
  end if;
  new_start := greatest(now(), coalesce(cur, now()));
  new_end := new_start + make_interval(days => co.days);

  insert into public.promotions (user_id, kind, price_code, service_id, job_id, target_title, days, amount, status,
                                 decided_at, starts_at, ends_at, method, provider_payment_id, test_mode)
  values (co.user_id, v_kind, co.price_code, co.service_id, co.job_id, co.target_title, co.days, co.amount, 'approved',
          now(), new_start, new_end, 'online', p_payment_id, co.test_mode)
  returning id into promo_id;

  if v_kind = 'pro' then
    insert into public.pro_members (user_id, pro_until) values (co.user_id, new_end)
    on conflict (user_id) do update set pro_until = excluded.pro_until;
  elsif not post_gone and v_kind = 'feature_service' then
    insert into public.featured_posts (service_id, featured_until) values (co.service_id, new_end)
    on conflict (service_id) do update set featured_until = excluded.featured_until;
  elsif not post_gone then
    insert into public.featured_posts (job_id, featured_until) values (co.job_id, new_end)
    on conflict (job_id) do update set featured_until = excluded.featured_until;
  end if;

  update public.online_checkouts
     set status = 'paid', paid_at = now(), promotion_id = promo_id
   where id = co.id;

  until_text := to_char(new_end at time zone 'Asia/Manila', 'FMMonth FMDD, YYYY');
  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    co.user_id, 'promotion_approved', 'Payment received',
    case
      when v_kind = 'pro' then 'Thank you! You are a Premium member until ' || until_text || '.'
      when post_gone then 'Your post was removed before the payment finished. Please message PhilFreela for a refund.'
      else '"' || coalesce(co.target_title, 'Your post') || '" is Featured until ' || until_text || '.'
    end,
    case v_kind when 'pro' then '/dashboard/pro' when 'feature_job' then '/dashboard/post-need' else '/dashboard/services' end
  );

  return json_build_object('kind', v_kind, 'pro_until', case when v_kind = 'pro' then new_end end,
                           'until', new_end, 'already', false);
end;
$$;

revoke execute on function public.finish_online_checkout(uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.finish_online_checkout(uuid, text, numeric, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Premium's free Featured post: one every 30 days, 3 days long
-- ---------------------------------------------------------------------------

-- Where the person stands: { premium, available, next_at } (next_at = when the
-- next free one can be used, while it is not available yet).
create or replace function public.my_free_feature()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  last_used timestamptz;
begin
  if me is null or not public.is_pro(me) then
    return json_build_object('premium', false, 'available', false, 'next_at', null);
  end if;
  select max(created_at) into last_used
    from public.promotions where user_id = me and method = 'free';
  return json_build_object(
    'premium', true,
    'available', last_used is null or last_used <= now() - interval '30 days',
    'next_at', case when last_used > now() - interval '30 days' then last_used + interval '30 days' end
  );
end;
$$;

revoke execute on function public.my_free_feature() from public, anon;
grant execute on function public.my_free_feature() to authenticated;

create or replace function public.use_free_feature(p_service uuid, p_job uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_title text;
  v_kind text;
  cur timestamptz;
  new_start timestamptz;
  new_end timestamptz;
  free_days int := 3;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if not public.is_pro(me) then
    raise exception 'A free Featured post is a Premium perk.';
  end if;
  -- One at a time per person (two clicks at the same moment can't both pass).
  perform pg_advisory_xact_lock(hashtext('free_feature:' || me::text));
  if exists (select 1 from public.promotions
              where user_id = me and method = 'free' and created_at > now() - interval '30 days') then
    raise exception 'You already used your free Featured post. The next one comes 30 days after the last.';
  end if;

  v_title := public.featurable_post(me, p_service, p_job);
  v_kind := case when p_service is not null then 'feature_service' else 'feature_job' end;

  if not public.featured_now(p_service, p_job)
     and public.featured_slots_left(case when p_service is not null then 'service' else 'job' end) < 1 then
    raise exception 'All 3 Featured spots are taken right now. Try again when one ends.';
  end if;

  if p_service is not null then
    select featured_until into cur from public.featured_posts where service_id = p_service;
  else
    select featured_until into cur from public.featured_posts where job_id = p_job;
  end if;
  new_start := greatest(now(), coalesce(cur, now()));
  new_end := new_start + make_interval(days => free_days);

  insert into public.promotions (user_id, kind, price_code, service_id, job_id, target_title, days, amount, status,
                                 decided_at, starts_at, ends_at, method)
  values (me, v_kind, 'feature_3', p_service, p_job, v_title, free_days, 0, 'approved',
          now(), new_start, new_end, 'free');

  if p_service is not null then
    insert into public.featured_posts (service_id, featured_until) values (p_service, new_end)
    on conflict (service_id) do update set featured_until = excluded.featured_until;
  else
    insert into public.featured_posts (job_id, featured_until) values (p_job, new_end)
    on conflict (job_id) do update set featured_until = excluded.featured_until;
  end if;

  return json_build_object('until', new_end);
end;
$$;

revoke execute on function public.use_free_feature(uuid, uuid) from public, anon;
grant execute on function public.use_free_feature(uuid, uuid) to authenticated;

-- The admin's Earnings leave out free Featured posts (₱0) and test payments.
create or replace function public.admin_promo_earnings()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  return (
    select json_build_object(
      'total',      coalesce(sum(f.amount), 0),
      'this_month', coalesce(sum(f.amount) filter (where f.at >= month_start), 0),
      'waiting', (
        select json_build_object('count', count(*), 'amount', coalesce(sum(p.amount), 0))
          from public.promotions p where p.status = 'pending'
      ),
      'by_kind', json_build_object(
        'feature_service', json_build_object('count', count(*) filter (where f.kind = 'feature_service'), 'amount', coalesce(sum(f.amount) filter (where f.kind = 'feature_service'), 0)),
        'feature_job',     json_build_object('count', count(*) filter (where f.kind = 'feature_job'),     'amount', coalesce(sum(f.amount) filter (where f.kind = 'feature_job'), 0)),
        'pro',             json_build_object('count', count(*) filter (where f.kind = 'pro'),             'amount', coalesce(sum(f.amount) filter (where f.kind = 'pro'), 0)),
        'billboard',       json_build_object('count', count(*) filter (where f.kind = 'billboard'),       'amount', coalesce(sum(f.amount) filter (where f.kind = 'billboard'), 0))
      ),
      'running', json_build_object(
        'featured_offers', (select count(*) from public.featured_posts x where x.service_id is not null and x.featured_until > now()),
        'featured_jobs',   (select count(*) from public.featured_posts x where x.job_id is not null and x.featured_until > now()),
        'pro_members',     (select count(*) from public.pro_members m where m.pro_until > now())
      )
    )
    from (
      select p.kind, p.amount, p.decided_at as at
        from public.promotions p
       where p.status = 'approved'
         and not p.test_mode
         and p.method <> 'free'
      union all
      -- A sponsored billboard counts once it is paid (not while it waits for
      -- its Xendit payment), and not when that payment was test money.
      select 'billboard', b.amount, b.created_at
        from public.dashboard_billboards b
       where b.amount is not null
         and not b.awaiting_payment
         and not exists (select 1 from public.billboard_checkouts c
                          where c.billboard_id = b.id and c.status = 'paid' and c.test_mode)
    ) f
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Views: how many people opened your posts and your profile
-- ---------------------------------------------------------------------------

-- One row per person, per thing they opened, per day. Only counts are ever
-- given out (never who), and only to the owner, and only with Premium.
create table public.page_views (
  kind text not null check (kind in ('service', 'job', 'profile')),
  target_id uuid not null,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_on date not null default ((now() at time zone 'Asia/Manila')::date),
  primary key (kind, target_id, viewer_id, viewed_on)
);

alter table public.page_views enable row level security;
-- No policies: nobody reads or writes the rows directly, only the two functions below.
revoke all on public.page_views from anon, authenticated;

create index page_views_target on public.page_views (kind, target_id, viewed_on);

-- Called when someone opens an offer, a job post or a profile. The owner's
-- own opens don't count; once per person per day.
create or replace function public.record_view(p_kind text, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  post_owner uuid;
begin
  if me is null or p_target is null then
    return;
  end if;
  if p_kind = 'service' then
    select freelancer_id into post_owner from public.services where id = p_target;
  elsif p_kind = 'job' then
    select client_id into post_owner from public.job_posts where id = p_target;
  elsif p_kind = 'profile' then
    select id into post_owner from public.profiles where id = p_target;
  else
    raise exception 'Unknown kind of page.';
  end if;
  if post_owner is null or post_owner = me or not exists (select 1 from public.profiles where id = me) then
    return;
  end if;
  insert into public.page_views (kind, target_id, viewer_id) values (p_kind, p_target, me)
  on conflict do nothing;
end;
$$;

revoke execute on function public.record_view(text, uuid) from public, anon;
grant execute on function public.record_view(text, uuid) to authenticated;

-- The person's own counts: { premium, profile, services: [{ id, views }],
-- jobs: [{ id, views }] }. profile = people in the last 30 days; a post =
-- people who ever opened it. Without Premium: { premium: false } only.
create or replace function public.my_view_counts()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_pro(me) then
    return json_build_object('premium', false);
  end if;
  return json_build_object(
    'premium', true,
    'profile', (select count(distinct v.viewer_id) from public.page_views v
                 where v.kind = 'profile' and v.target_id = me
                   and v.viewed_on > (now() at time zone 'Asia/Manila')::date - 30),
    'services', coalesce((select json_agg(json_build_object('id', s.id, 'views',
                   (select count(distinct v.viewer_id) from public.page_views v where v.kind = 'service' and v.target_id = s.id)))
                 from public.services s where s.freelancer_id = me), '[]'::json),
    'jobs', coalesce((select json_agg(json_build_object('id', j.id, 'views',
                   (select count(distinct v.viewer_id) from public.page_views v where v.kind = 'job' and v.target_id = j.id)))
                 from public.job_posts j where j.client_id = me), '[]'::json)
  );
end;
$$;

revoke execute on function public.my_view_counts() from public, anon;
grant execute on function public.my_view_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Chat documents: 50 MB with Premium, 10 MB without
-- ---------------------------------------------------------------------------

update storage.buckets set file_size_limit = 52428800 where id = 'chat-files';

-- The table itself allowed 10 MB at most: now 50 MB, and the rule below keeps
-- 10 MB for people without Premium.
alter table public.messages drop constraint messages_attachment_size_check;
alter table public.messages add constraint messages_attachment_size_check
  check (attachment_size is null or (attachment_size >= 0 and attachment_size <= 52428800));

create or replace function public.limit_chat_file_size()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.attachment_type = 'file' and coalesce(new.attachment_size, 0) > 10485760
     and not public.is_pro(new.sender_id) then
    raise exception 'Files over 10 MB are a Premium perk. Send a smaller file.';
  end if;
  return new;
end;
$$;

create trigger messages_limit_file_size
  before insert on public.messages
  for each row execute function public.limit_chat_file_size();

-- (6. The two-color look: supabase_premium_gradient_schema.sql, applied with
-- the website step that shows it as a Premium perk.)

-- ---------------------------------------------------------------------------
-- 7. The watermark's Premium choices (freelancers)
-- ---------------------------------------------------------------------------

-- Free: white, black or orange; small, medium or large; the site's font.
-- Premium: any color (#rrggbb), extra small and extra large, and 3 more fonts.
alter table public.watermark_settings
  add column font text not null default 'jakarta' check (font in ('jakarta', 'serif', 'mono', 'script'));

alter table public.watermark_settings drop constraint watermark_settings_color_check;
alter table public.watermark_settings add constraint watermark_settings_color_check
  check (color in ('white', 'black', 'orange') or color ~ '^#[0-9a-f]{6}$');

alter table public.watermark_settings drop constraint watermark_settings_size_check;
alter table public.watermark_settings add constraint watermark_settings_size_check
  check (size in ('xsmall', 'small', 'medium', 'large', 'xlarge'));

-- Only a NEW Premium choice is checked, like the gradient above.
create or replace function public.premium_watermark_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wants_premium boolean;
begin
  wants_premium :=
    (new.font <> 'jakarta' and (tg_op = 'INSERT' or new.font is distinct from old.font))
    or (new.color ~ '^#' and (tg_op = 'INSERT' or new.color is distinct from old.color))
    or (new.size in ('xsmall', 'xlarge') and (tg_op = 'INSERT' or new.size is distinct from old.size));
  if wants_premium and not public.is_pro(new.freelancer_id) then
    raise exception 'Other colors, fonts and the extra sizes are Premium perks.';
  end if;
  return new;
end;
$$;

create trigger watermark_settings_premium
  before insert or update on public.watermark_settings
  for each row execute function public.premium_watermark_only();

-- ---------------------------------------------------------------------------
-- 8. Sponsored billboards paid through a Xendit link
-- ---------------------------------------------------------------------------

-- A billboard waiting for its sponsor's online payment doesn't show yet.
alter table public.dashboard_billboards
  add column awaiting_payment boolean not null default false;

alter policy "users can read their billboards" on public.dashboard_billboards
  using (
    (is_active and not awaiting_payment and starts_at <= now() and (ends_at is null or ends_at > now())
     and (audience = 'all' or audience = (select profiles.account_type::text from public.profiles where profiles.id = (select auth.uid()))))
    or (select public.is_admin())
  );

-- One row per payment link made for a billboard's sponsor.
create table public.billboard_checkouts (
  id uuid primary key default gen_random_uuid(),
  billboard_id uuid not null references public.dashboard_billboards (id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  session_id text unique,
  checkout_url text,
  test_mode boolean not null default true,
  status text not null default 'open' check (status in ('open', 'paid', 'expired', 'canceled')),
  payment_id text,
  created_by uuid references public.admins (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint billboard_checkouts_paid check ((status = 'paid') = (paid_at is not null))
);

alter table public.billboard_checkouts enable row level security;
create policy "super admins can read billboard payments"
  on public.billboard_checkouts for select to authenticated
  using (public.is_super_admin());
revoke insert, update, delete on public.billboard_checkouts from anon, authenticated;

-- A super admin opens a payment link for a sponsored billboard: the amount
-- is the billboard's own. The billboard waits (doesn't show) until it is paid.
create or replace function public.start_billboard_checkout(p_billboard uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  bb public.dashboard_billboards%rowtype;
  new_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can ask a sponsor to pay.';
  end if;
  select * into bb from public.dashboard_billboards where id = p_billboard for update;
  if not found then
    raise exception 'That billboard was not found.';
  end if;
  if bb.sponsor_name is null or bb.amount is null then
    raise exception 'Add the sponsor and the amount first.';
  end if;
  if exists (select 1 from public.billboard_checkouts where billboard_id = bb.id and status = 'paid') then
    raise exception 'This billboard is already paid.';
  end if;
  if (select count(*) from public.billboard_checkouts where created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Many payment links were made in the last hour. Please try again later.';
  end if;

  update public.dashboard_billboards set awaiting_payment = true where id = bb.id;
  insert into public.billboard_checkouts (billboard_id, amount, created_by)
  values (bb.id, bb.amount, me)
  returning id into new_id;

  return json_build_object('id', new_id, 'amount', bb.amount, 'title', bb.title, 'sponsor', bb.sponsor_name);
end;
$$;

revoke execute on function public.start_billboard_checkout(uuid) from public, anon;
grant execute on function public.start_billboard_checkout(uuid) to authenticated;

-- Records a paid billboard link (server functions only, after Xendit said it
-- was paid): the billboard shows from its start date.
create or replace function public.finish_billboard_checkout(p_checkout uuid, p_payment_id text, p_amount numeric, p_test boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  co public.billboard_checkouts%rowtype;
begin
  select * into co from public.billboard_checkouts where id = p_checkout for update;
  if not found then
    raise exception 'That payment was not found.';
  end if;
  if co.status = 'paid' then
    return json_build_object('already', true);
  end if;
  if p_payment_id is null or btrim(p_payment_id) = '' then
    raise exception 'The payment id is missing.';
  end if;
  if p_amount is distinct from co.amount then
    raise exception 'The amount paid does not match.';
  end if;
  if p_test is distinct from co.test_mode then
    raise exception 'A test payment and a live payment cannot be mixed.';
  end if;

  update public.billboard_checkouts
     set status = 'paid', paid_at = now(), payment_id = p_payment_id
   where id = co.id;
  update public.dashboard_billboards set awaiting_payment = false where id = co.billboard_id;

  return json_build_object('already', false);
end;
$$;

revoke execute on function public.finish_billboard_checkout(uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.finish_billboard_checkout(uuid, text, numeric, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 9. The older GCash way (still there for Featured requests already sent):
--    Premium for any account, and the words
-- ---------------------------------------------------------------------------

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
      when pr.kind = 'pro' then 'You are a Premium member until ' || until_text || '.'
      else '"' || coalesce(pr.target_title, 'Your post') || '" is Featured until ' || until_text || '.'
    end,
    case pr.kind when 'feature_job' then '/dashboard/post-need' when 'pro' then '/dashboard/pro' else '/dashboard/services' end
  );

  perform public.write_admin_log(
    'promotion',
    'approved the ' || case pr.kind when 'pro' then 'Premium' else 'Featured post' end
      || ' payment of ₱' || to_char(pr.amount, 'FM999,999,990.00')
      || coalesce(' for "' || pr.target_title || '"', '') || '.',
    pr.id
  );
end;
$$;
