-- Freelancer Pro moved out of Settings into its own page, /dashboard/pro
-- (PLAN-monetization.md, "Moved out of Settings 2026-10-27"). The "Payment
-- received" notification now links there. Old links still work (the website
-- sends /dashboard/settings?tab=Freelancer Pro on to the new page); the two
-- notifications that already had the old link are pointed at the new page too.
-- Same function as database/supabase_online_pro_schema.sql (now updated there
-- as well); only the link changed.

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
          '/dashboard/pro');

  return json_build_object('pro_until', new_end, 'already', false);
end;
$$;

revoke execute on function public.finish_online_checkout(uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.finish_online_checkout(uuid, text, numeric, boolean) to service_role;

-- Notifications sent before the move.
update public.user_notifications
   set link = '/dashboard/pro'
 where link = '/dashboard/settings?tab=Freelancer%20Pro';
