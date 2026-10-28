-- Community Billboard (PLAN-community-billboard.md): freelancers and clients post their
-- own paid ads on a second billboard, under the super admin's Billboard.
-- Run after supabase_premium_schema.sql. The browser can only READ; every change goes
-- through the functions below, which check who is asking.
-- APPLIED on the live project 2026-10-28 as three migrations (community_billboard_1_table_and_rules,
-- community_billboard_2_payments, community_billboard_3_picture_bucket): tried first with
-- test_community_billboard.sql as a rolled-back block (41 checks), then the same 41 checks on the
-- applied schema, and test_premium.sql (36 checks) again because finish_online_checkout and
-- admin_promo_earnings are replaced here. All passed.
--
--   pending  -> approved (an admin) -> paid (the person pays on Xendit) = running until ends_at
--   pending  -> rejected (an admin, with a reason)
--   pending / approved -> canceled (the person withdraws it)
--   paid     -> removed (an admin takes it down, with a reason)
--
-- Three parts (applied as three migrations): 1 the table and its rules, 2 the payment
-- (prices, the checkout and the money records), 3 the picture bucket.

-- ===========================================================================
-- Part 1. The table and its rules
-- ===========================================================================

create table public.member_ads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  message text check (message is null or char_length(message) between 1 and 300),
  -- A picture in the owner's own folder of the member-ad-images bucket.
  image_path text,
  -- Who sees it: everyone, or only freelancers, or only clients.
  audience text not null default 'all' check (audience in ('all', 'freelancer', 'client')),
  price_code text not null references public.promo_prices (code),
  days integer not null check (days > 0),
  -- The button on the ad opens ONE of the owner's own things (never an outside link).
  link_service uuid references public.services (id) on delete set null,
  link_job uuid references public.job_posts (id) on delete set null,
  link_profile boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'paid', 'canceled', 'removed')),
  -- Why an admin rejected it or took it down.
  reject_reason text,
  reviewed_by uuid references public.admins (id) on delete set null,
  reviewed_at timestamptz,
  -- Set when it is paid: it runs from starts_at to ends_at.
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_ads_one_link
    check (num_nonnulls(link_service, link_job) + (case when link_profile then 1 else 0 end) <= 1),
  constraint member_ads_image_own_folder
    check (image_path is null or split_part(image_path, '/', 1) = owner_id::text),
  constraint member_ads_dates check (
    (status in ('pending', 'approved', 'rejected', 'canceled') and starts_at is null and ends_at is null)
    or (status = 'paid' and starts_at is not null and ends_at is not null and ends_at > starts_at)
    or (status = 'removed' and (starts_at is null) = (ends_at is null) and (ends_at is null or ends_at > starts_at))
  ),
  constraint member_ads_reason check (
    ((status in ('rejected', 'removed')) = (reject_reason is not null))
    and (reject_reason is null or char_length(reject_reason) between 3 and 200)
  )
);

create index member_ads_owner_idx on public.member_ads (owner_id);
create index member_ads_status_idx on public.member_ads (status, ends_at);

-- "Running" = paid and between its two dates. Anyone signed in can read the running ads
-- meant for them; the owner reads their own ads; admins read all.
alter table public.member_ads enable row level security;

create policy "member_ads: owners, admins and the people an ad is meant for can read"
  on public.member_ads for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.is_admin())
    or (
      status = 'paid' and starts_at <= now() and ends_at > now()
      and (audience = 'all'
           or audience = (select p.account_type::text from public.profiles p where p.id = (select auth.uid())))
    )
  );

-- No inserts, updates or deletes from the browser: only the functions below.
revoke all on public.member_ads from anon, authenticated;
grant select on public.member_ads to authenticated;

-- Bad words are hidden like in offers and job posts.
create trigger member_ads_mask_words
  before insert or update of title, message on public.member_ads
  for each row execute function mask_columns('title', 'message');

-- How many of the 5 spots are free right now (a spot is used from payment to the end).
create or replace function public.member_ads_slots_left()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(5 - count(*), 0)::integer
    from public.member_ads
   where status = 'paid' and starts_at <= now() and ends_at > now();
$$;

revoke execute on function public.member_ads_slots_left() from public, anon;
grant execute on function public.member_ads_slots_left() to authenticated;

-- A verified member sends an ad for review. Nothing is charged yet.
create or replace function public.request_member_ad(
  p_title text, p_message text, p_image_path text, p_audience text,
  p_code text, p_link_kind text, p_link_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  title_text text := btrim(coalesce(p_title, ''));
  message_text text := nullif(btrim(coalesce(p_message, '')), '');
  price_row public.promo_prices%rowtype;
  link_service_id uuid;
  link_job_id uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if not public.is_verified(me) then
    raise exception 'Verify your identity first, then you can advertise.';
  end if;
  if public.is_posting_blocked(me) then
    raise exception 'Your account can''t post ads right now.';
  end if;
  if char_length(title_text) < 2 or char_length(title_text) > 80 then
    raise exception 'The headline needs 2 to 80 characters.';
  end if;
  if message_text is not null and char_length(message_text) > 300 then
    raise exception 'The message can have up to 300 characters.';
  end if;
  -- Links are left out: the button can open the person's own offer, job post or profile.
  if title_text ~* '(https?://|www\.)' or coalesce(message_text, '') ~* '(https?://|www\.)' then
    raise exception 'Please leave links out of the ad. The button can open your own offer or profile.';
  end if;
  if coalesce(p_audience, '') not in ('all', 'freelancer', 'client') then
    raise exception 'Choose who sees the ad.';
  end if;
  select * into price_row from public.promo_prices where code = p_code and code in ('ad_3', 'ad_7', 'ad_14');
  if not found then
    raise exception 'Choose how long the ad runs.';
  end if;
  if p_image_path is not null and split_part(p_image_path, '/', 1) <> me::text then
    raise exception 'That picture is not yours.';
  end if;
  if (select count(*) from public.member_ads where owner_id = me and status = 'pending') >= 3 then
    raise exception 'You already have 3 ads waiting for review. Please wait for an answer first.';
  end if;
  if (select count(*) from public.member_ads where owner_id = me and status in ('pending', 'approved')) >= 5 then
    raise exception 'You have 5 ads that are not finished yet. Pay for one or withdraw one first.';
  end if;

  if p_link_kind = 'service' then
    select id into link_service_id from public.services where id = p_link_id and freelancer_id = me;
    if link_service_id is null then
      raise exception 'That offer was not found among yours.';
    end if;
  elsif p_link_kind = 'job' then
    select id into link_job_id from public.job_posts where id = p_link_id and client_id = me;
    if link_job_id is null then
      raise exception 'That job post was not found among yours.';
    end if;
  elsif p_link_kind is not null and p_link_kind <> 'profile' then
    raise exception 'Choose what the button opens.';
  end if;

  insert into public.member_ads (owner_id, title, message, image_path, audience, price_code, days,
                                 link_service, link_job, link_profile)
  values (me, title_text, message_text, p_image_path, p_audience, price_row.code, price_row.days,
          link_service_id, link_job_id, coalesce(p_link_kind = 'profile', false))
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.request_member_ad(text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.request_member_ad(text, text, text, text, text, text, uuid) to authenticated;

-- The owner withdraws an ad that is still waiting or approved (not yet paid).
create or replace function public.withdraw_member_ad(p_ad uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_ads
     set status = 'canceled'
   where id = p_ad and owner_id = auth.uid() and status in ('pending', 'approved');
  if not found then
    raise exception 'That ad can''t be withdrawn: it was not found, or it is already running or answered.';
  end if;
end;
$$;

revoke execute on function public.withdraw_member_ad(uuid) from public, anon;
grant execute on function public.withdraw_member_ad(uuid) to authenticated;

-- An admin approves (the owner is told to pay) or rejects (with a reason) a waiting ad.
create or replace function public.review_member_ad(p_ad uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ad public.member_ads%rowtype;
  why text := btrim(coalesce(p_reason, ''));
  price_row public.promo_prices%rowtype;
  owner_name text;
  v_amount numeric(8,2);
begin
  if not public.is_admin() then
    raise exception 'Only an admin can answer an ad.';
  end if;
  select * into ad from public.member_ads where id = p_ad for update;
  if not found then
    raise exception 'That ad was not found.';
  end if;
  if ad.status <> 'pending' then
    raise exception 'This ad was already answered or withdrawn.';
  end if;
  select full_name into owner_name from public.profiles where id = ad.owner_id;

  if p_approve then
    update public.member_ads
       set status = 'approved', reviewed_at = now(),
           reviewed_by = (select a.id from public.admins a where a.id = auth.uid())
     where id = ad.id;
    select * into price_row from public.promo_prices where code = ad.price_code;
    v_amount := case when price_row.pro_price is not null and public.is_pro(ad.owner_id)
                     then price_row.pro_price else price_row.price end;
    insert into public.user_notifications (user_id, type, title, message, link)
    values (ad.owner_id, 'promotion_approved', 'Your ad was approved',
            '"' || ad.title || '" was approved. Pay ₱' || to_char(v_amount, 'FM999,999,990.00')
              || ' to put it on the Community Billboard for ' || ad.days || ' days.',
            '/dashboard/advertise');
    perform public.write_admin_log('promotion',
      'approved the Community Billboard ad "' || ad.title || '" by ' || coalesce(owner_name, 'a member') || '.', ad.id);
  else
    if char_length(why) < 3 or char_length(why) > 200 then
      raise exception 'Write a reason of 3 to 200 characters so the person knows what to fix.';
    end if;
    update public.member_ads
       set status = 'rejected', reject_reason = why, reviewed_at = now(),
           reviewed_by = (select a.id from public.admins a where a.id = auth.uid())
     where id = ad.id;
    insert into public.user_notifications (user_id, type, title, message, link)
    values (ad.owner_id, 'promotion_rejected', 'Your ad was not approved',
            '"' || ad.title || '" was not approved.' || E'\n\n' || 'Reason: ' || why
              || E'\n\n' || 'You can send a new ad after fixing this.',
            '/dashboard/advertise');
    perform public.write_admin_log('promotion',
      'rejected the Community Billboard ad "' || ad.title || '" by ' || coalesce(owner_name, 'a member') || '.', ad.id);
  end if;
end;
$$;

revoke execute on function public.review_member_ad(uuid, boolean, text) from public, anon;
grant execute on function public.review_member_ad(uuid, boolean, text) to authenticated;

-- An admin takes a RUNNING ad down (it broke a rule). No money is returned by the system.
create or replace function public.take_down_member_ad(p_ad uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ad public.member_ads%rowtype;
  why text := btrim(coalesce(p_reason, ''));
  owner_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can take an ad down.';
  end if;
  if char_length(why) < 3 or char_length(why) > 200 then
    raise exception 'Write a reason of 3 to 200 characters so the person knows why.';
  end if;
  select * into ad from public.member_ads where id = p_ad for update;
  if not found then
    raise exception 'That ad was not found.';
  end if;
  if ad.status <> 'paid' or ad.ends_at <= now() then
    raise exception 'Only an ad that is running can be taken down.';
  end if;
  select full_name into owner_name from public.profiles where id = ad.owner_id;

  update public.member_ads
     set status = 'removed', reject_reason = why, reviewed_at = now(),
         reviewed_by = (select a.id from public.admins a where a.id = auth.uid())
   where id = ad.id;
  insert into public.user_notifications (user_id, type, title, message, link)
  values (ad.owner_id, 'promotion_rejected', 'Your ad was taken down',
          '"' || ad.title || '" was taken down from the Community Billboard.' || E'\n\n' || 'Reason: ' || why
            || E'\n\n' || 'If you think this is a mistake, please message PhilFreela.',
          '/dashboard/advertise');
  perform public.write_admin_log('promotion',
    'took down the Community Billboard ad "' || ad.title || '" by ' || coalesce(owner_name, 'a member') || '.', ad.id);
end;
$$;

revoke execute on function public.take_down_member_ad(uuid, text) from public, anon;
grant execute on function public.take_down_member_ad(uuid, text) to authenticated;

-- ===========================================================================
-- Part 2. Paying: prices, the checkout and the money records
-- ===========================================================================

-- The price list gets three more options (the super admin edits them in Admin > Promotions).
alter table public.promo_prices drop constraint promo_prices_code_check;
alter table public.promo_prices add constraint promo_prices_code_check
  check (code in ('feature_3', 'feature_7', 'feature_14', 'pro_30', 'ad_3', 'ad_7', 'ad_14'));

insert into public.promo_prices (code, label, days, price, pro_price) values
  ('ad_3', 'Community Billboard ad for 3 days', 3, 149, 75),
  ('ad_7', 'Community Billboard ad for 7 days', 7, 299, 150),
  ('ad_14', 'Community Billboard ad for 14 days', 14, 499, 250)
on conflict (code) do nothing;

-- A paid ad is recorded like a Featured post or Premium: one row in promotions.
alter table public.promotions drop constraint promotions_kind_check;
alter table public.promotions add constraint promotions_kind_check
  check (kind in ('feature_service', 'feature_job', 'pro', 'member_ad'));
alter table public.promotions drop constraint promotions_target;
alter table public.promotions add constraint promotions_target check (
  (kind = 'feature_service' and job_id is null)
  or (kind = 'feature_job' and service_id is null)
  or (kind = 'pro' and service_id is null and job_id is null)
  or (kind = 'member_ad' and service_id is null and job_id is null)
);

-- Which ad a payment page is for.
alter table public.online_checkouts
  add column ad_id uuid references public.member_ads (id) on delete set null;

-- The owner opens a Xendit page for an APPROVED ad (the server function calls this as them).
create or replace function public.start_ad_checkout(p_ad uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  ad public.member_ads%rowtype;
  price_row public.promo_prices%rowtype;
  v_amount numeric(8,2);
  new_id uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  select * into ad from public.member_ads where id = p_ad and owner_id = me for update;
  if not found then
    raise exception 'That ad was not found.';
  end if;
  if ad.status <> 'approved' then
    raise exception 'This ad is not waiting for payment.';
  end if;
  if public.is_posting_blocked(me) then
    raise exception 'Your account can''t post ads right now.';
  end if;
  if public.member_ads_slots_left() < 1 then
    raise exception 'All 5 Community Billboard spots are taken right now. Try again when one ends.';
  end if;
  if (select count(*) from public.online_checkouts
       where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You opened many payment pages in the last hour. Please try again later.';
  end if;
  select * into price_row from public.promo_prices where code = ad.price_code;
  v_amount := case when price_row.pro_price is not null and public.is_pro(me)
                   then price_row.pro_price else price_row.price end;

  insert into public.online_checkouts (user_id, price_code, days, amount, ad_id, target_title)
  values (me, price_row.code, price_row.days, v_amount, ad.id, ad.title)
  returning id into new_id;

  return json_build_object('id', new_id, 'amount', v_amount, 'days', price_row.days,
                           'label', price_row.label, 'title', ad.title);
end;
$$;

revoke execute on function public.start_ad_checkout(uuid) from public, anon;
grant execute on function public.start_ad_checkout(uuid) to authenticated;

-- Records a paid page (server only, after Xendit said it was paid): Premium starts, a post
-- is Featured, or (new) an approved ad goes live. Same as before, plus the member_ad parts.
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
    when left(co.price_code, 3) = 'ad_' then 'member_ad'
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
  elsif v_kind = 'member_ad' then
    -- Only an approved ad can go live (it may have been withdrawn while the page was open).
    post_gone := not exists (select 1 from public.member_ads where id = co.ad_id and status = 'approved');
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
  elsif v_kind = 'member_ad' then
    if not post_gone then
      update public.member_ads set status = 'paid', starts_at = new_start, ends_at = new_end where id = co.ad_id;
    end if;
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
      when post_gone and v_kind = 'member_ad' then 'Your ad was withdrawn before the payment finished. Please message PhilFreela for a refund.'
      when post_gone then 'Your post was removed before the payment finished. Please message PhilFreela for a refund.'
      when v_kind = 'member_ad' then '"' || coalesce(co.target_title, 'Your ad') || '" is on the Community Billboard until ' || until_text || '.'
      else '"' || coalesce(co.target_title, 'Your post') || '" is Featured until ' || until_text || '.'
    end,
    case v_kind
      when 'pro' then '/dashboard/pro'
      when 'member_ad' then '/dashboard/advertise'
      when 'feature_job' then '/dashboard/post-need'
      else '/dashboard/services'
    end
  );

  return json_build_object('kind', v_kind, 'pro_until', case when v_kind = 'pro' then new_end end,
                           'until', new_end, 'already', false);
end;
$$;

revoke execute on function public.finish_online_checkout(uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.finish_online_checkout(uuid, text, numeric, boolean) to service_role;

-- The Overview's Earnings: the same as before, plus "member_ad" in by_kind and the number
-- of ads running now. (Test-mode money and free posts are still left out.)
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
      'total', coalesce(sum(f.amount), 0),
      'this_month', coalesce(sum(f.amount) filter (where f.at >= month_start), 0),
      'waiting', (select json_build_object('count', count(*), 'amount', coalesce(sum(p.amount), 0)) from public.promotions p where p.status = 'pending'),
      'by_kind', json_build_object(
        'feature_service', json_build_object('count', count(*) filter (where f.kind = 'feature_service'), 'amount', coalesce(sum(f.amount) filter (where f.kind = 'feature_service'), 0)),
        'feature_job', json_build_object('count', count(*) filter (where f.kind = 'feature_job'), 'amount', coalesce(sum(f.amount) filter (where f.kind = 'feature_job'), 0)),
        'pro', json_build_object('count', count(*) filter (where f.kind = 'pro'), 'amount', coalesce(sum(f.amount) filter (where f.kind = 'pro'), 0)),
        'billboard', json_build_object('count', count(*) filter (where f.kind = 'billboard'), 'amount', coalesce(sum(f.amount) filter (where f.kind = 'billboard'), 0)),
        'member_ad', json_build_object('count', count(*) filter (where f.kind = 'member_ad'), 'amount', coalesce(sum(f.amount) filter (where f.kind = 'member_ad'), 0))
      ),
      'running', json_build_object(
        'featured_offers', (select count(*) from public.featured_posts x where x.service_id is not null and x.featured_until > now()),
        'featured_jobs', (select count(*) from public.featured_posts x where x.job_id is not null and x.featured_until > now()),
        'pro_members', (select count(*) from public.pro_members m where m.pro_until > now()),
        'member_ads', (select count(*) from public.member_ads a where a.status = 'paid' and a.starts_at <= now() and a.ends_at > now())
      )
    )
    from (
      select p.kind, p.amount, p.decided_at as at from public.promotions p where p.status = 'approved' and not p.test_mode and p.method <> 'free'
      union all
      select 'billboard', b.amount, b.created_at from public.dashboard_billboards b
       where b.amount is not null and not b.awaiting_payment
         and not exists (select 1 from public.billboard_checkouts c where c.billboard_id = b.id and c.status = 'paid' and c.test_mode)
    ) f
  );
end;
$$;

-- ===========================================================================
-- Part 3. The picture bucket
-- ===========================================================================

-- Public pictures (JPEG, 2 MB), like the Billboard's. Only a verified member can add
-- pictures, and only to their own folder: member-ad-images/<member id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-ad-images', 'member-ad-images', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "member-ad-images: verified members can upload to their folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'member-ad-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_verified((select auth.uid()))
  );

create policy "member-ad-images: owners can see their file entries"
  on storage.objects for select to authenticated
  using (bucket_id = 'member-ad-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "member-ad-images: owners can remove their files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'member-ad-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "member-ad-images: admins can remove files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'member-ad-images' and (select public.is_admin()));
