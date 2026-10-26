-- Freelancer Pro paid online through Xendit (PLAN-monetization.md, "Paying for
-- Pro online (Xendit)"). Before, Pro was paid in the GCash app to PhilFreela's
-- number with a reference number and a receipt, and an admin approved it by
-- hand. Now the person pays on Xendit's own checkout page (GCash, Maya or QR Ph)
-- and Pro starts by itself once Xendit says the payment is complete.
--
-- The browser writes none of this. The Edge Function pro-checkout calls
-- start_online_checkout() AS the signed-in person, opens a Xendit payment page
-- and saves its id with the service role. When the page is paid (the person
-- comes back, or Xendit's webhook arrives), an Edge Function asks Xendit again
-- whether it really is paid, and only then calls finish_online_checkout(), which
-- only the service role can call.
--
-- Featured posts keep the GCash + receipt + admin check flow (request_promotion).
-- Test: database/test_online_pro.sql (rolled back, nothing left behind).

-- ---------------------------------------------------------------------------
-- 1. promotions: how each payment was made.
-- ---------------------------------------------------------------------------

alter table public.promotions
  -- 'gcash' = paid in the GCash app with a reference and a receipt, checked by an
  -- admin. 'online' = paid on Xendit's checkout page, confirmed by Xendit.
  add column method text not null default 'gcash' check (method in ('gcash', 'online')),
  -- Xendit's id for the payment (online only).
  add column provider_payment_id text,
  -- Paid with Xendit's test keys (pretend money): shown with a TEST badge and
  -- left out of Earnings.
  add column test_mode boolean not null default false;

-- An online payment has no GCash reference number and no receipt screenshot; a
-- GCash payment still needs both (this check keeps them required for it).
alter table public.promotions alter column reference_no drop not null;
alter table public.promotions alter column receipt_path drop not null;
alter table public.promotions add constraint promotions_method_proof check (
  (method = 'gcash' and reference_no is not null and receipt_path is not null
     and provider_payment_id is null and not test_mode)
  or (method = 'online' and kind = 'pro' and status = 'approved'
     and reference_no is null and receipt_path is null and provider_payment_id is not null)
);

-- One Xendit payment can be recorded only once.
create unique index promotions_provider_payment_idx
  on public.promotions (provider_payment_id) where provider_payment_id is not null;

-- ---------------------------------------------------------------------------
-- 2. online_checkouts: one row for each Xendit payment page that was opened.
-- ---------------------------------------------------------------------------

create table public.online_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  price_code text not null references public.promo_prices (code),
  -- Copied from the price list when the page is opened, so a later price change
  -- doesn't alter it.
  days int not null check (days > 0),
  amount numeric(8,2) not null check (amount > 0),
  -- Xendit's id for the payment page (ps-...) and the page's address.
  session_id text unique,
  checkout_url text,
  -- Opened with Xendit's test keys (pretend money).
  test_mode boolean not null default true,
  status text not null default 'open' check (status in ('open', 'paid', 'expired', 'canceled')),
  -- The payment record made when it was paid.
  promotion_id uuid references public.promotions (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint online_checkouts_paid check ((status = 'paid') = (paid_at is not null))
);

create index online_checkouts_user_idx on public.online_checkouts (user_id, created_at desc);
create index online_checkouts_price_code_idx on public.online_checkouts (price_code);
create index online_checkouts_promotion_idx on public.online_checkouts (promotion_id);

alter table public.online_checkouts enable row level security;

-- The payer sees their own payment pages; admins see all of them.
create policy "online_checkouts: the payer and admins can view"
  on public.online_checkouts for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- No insert, update or remove rules: the browser can only READ. The Edge
-- Functions write with the service role.
revoke all on public.online_checkouts from anon;
revoke insert, update, delete on public.online_checkouts from authenticated;

-- ---------------------------------------------------------------------------
-- 3. The functions.
-- ---------------------------------------------------------------------------

-- "Go Pro": called by the Edge Function pro-checkout AS the signed-in person.
-- Checks they may buy Pro (a freelancer account that is not suspended), copies
-- the price from the price list (never from the browser) and saves the payment
-- page as open. Returns { id, amount, days, label } for the Edge Function to
-- open the Xendit page with.
create or replace function public.start_online_checkout(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  price_row public.promo_prices%rowtype;
  my_type text;
  new_id uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if p_code is distinct from 'pro_30' then
    raise exception 'Only Freelancer Pro can be paid online for now.';
  end if;

  select * into price_row from public.promo_prices where code = p_code;
  if not found then
    raise exception 'Choose one of the listed options.';
  end if;

  select account_type::text into my_type from public.profiles where id = me;
  if my_type is null then
    raise exception 'Please finish setting up your account first.';
  end if;
  if my_type <> 'freelancer' then
    raise exception 'Freelancer Pro is for freelancer accounts.';
  end if;
  if public.is_posting_blocked(me) then
    raise exception 'Your account cannot do this right now.';
  end if;

  -- Each page is a call to Xendit, so nobody can open them by the hundred.
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

revoke execute on function public.start_online_checkout(text) from public, anon;
grant execute on function public.start_online_checkout(text) to authenticated;

-- "Xendit says it is paid": called only by the Edge Functions (service role),
-- after they asked Xendit themselves. The row is locked first, so the person
-- coming back and the webhook arriving at the same moment can't both count it.
-- Paying again before Pro ends adds the days after the current end. Returns
-- { pro_until, already } (already = it was recorded before; nothing changed).
create or replace function public.finish_online_checkout(
  p_checkout uuid, p_payment_id text, p_amount numeric, p_test boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  co public.online_checkouts%rowtype;
  cur timestamptz;
  new_start timestamptz;
  new_end timestamptz;
  promo_id uuid;
  until_text text;
begin
  select * into co from public.online_checkouts where id = p_checkout for update;
  if not found then
    raise exception 'That payment was not found.';
  end if;

  -- Xendit can send the same news more than once; only the first one counts.
  if co.status = 'paid' then
    return json_build_object(
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

  select pro_until into cur from public.pro_members where user_id = co.user_id;
  new_start := greatest(now(), coalesce(cur, now()));
  new_end := new_start + make_interval(days => co.days);

  insert into public.promotions (user_id, kind, price_code, days, amount, status, decided_at,
                                 starts_at, ends_at, method, provider_payment_id, test_mode)
  values (co.user_id, 'pro', co.price_code, co.days, co.amount, 'approved', now(),
          new_start, new_end, 'online', p_payment_id, co.test_mode)
  returning id into promo_id;

  insert into public.pro_members (user_id, pro_until) values (co.user_id, new_end)
  on conflict (user_id) do update set pro_until = excluded.pro_until;

  update public.online_checkouts
     set status = 'paid', paid_at = now(), promotion_id = promo_id
   where id = co.id;

  until_text := to_char(new_end at time zone 'Asia/Manila', 'FMMonth FMDD, YYYY');
  insert into public.user_notifications (user_id, type, title, message, link)
  values (co.user_id, 'promotion_approved', 'Payment received',
          'Thank you! You are a Freelancer Pro until ' || until_text || '.',
          '/dashboard/settings?tab=Freelancer%20Pro');

  return json_build_object('pro_until', new_end, 'already', false);
end;
$$;

revoke execute on function public.finish_online_checkout(uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.finish_online_checkout(uuid, text, numeric, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Earnings leave test payments out, so the totals stay true. (The same
--    function as database/supabase_promo_earnings_schema.sql, plus that one
--    condition.)
-- ---------------------------------------------------------------------------

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
      union all
      select 'billboard', b.amount, b.created_at
        from public.dashboard_billboards b
       where b.amount is not null
    ) f
  );
end;
$$;

revoke execute on function public.admin_promo_earnings() from public, anon;
grant execute on function public.admin_promo_earnings() to authenticated;
