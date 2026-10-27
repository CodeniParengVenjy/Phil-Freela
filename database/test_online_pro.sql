-- Test for supabase_online_pro_schema.sql: Freelancer Pro paid online (Xendit).
-- Run it AFTER the schema file (or in the same transaction). It borrows
-- existing accounts (no accounts are made, so no user numbers are used), acts as
-- each of them and as the server (service_role), and ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing is
-- left behind.
do $t$
declare
  res      text := '';
  msg      text;
  n        int;
  zz       int;
  f        uuid;
  c        uuid;
  s        uuid;
  adm      uuid;
  j        json;
  co1      uuid;
  co2      uuid;
  co3      uuid;
  co4      uuid;
  until1   timestamptz;
  until2   timestamptz;
  total0   numeric;
  total1   numeric;
  notif0   int;
begin
  select id into f from public.profiles where account_type = 'freelancer'
     and not exists (select 1 from public.pro_members m where m.user_id = profiles.id)
     and not public.is_posting_blocked(id)
   order by id limit 1;
  select id into c from public.profiles where account_type = 'client' order by id limit 1;
  select id into s from public.profiles where id not in (f, c) order by id limit 1;
  select id into adm from public.admins where not must_change_password order by id limit 1;
  if f is null or c is null or s is null or adm is null then
    raise exception 'Needs a freelancer-account that is not Pro and not suspended, a client-account, a third person and an admin.';
  end if;

  -- The offline-email trigger would send the test notification to a real
  -- person; it is switched off here and comes back with the rollback.
  alter table public.user_notifications disable trigger email_offline_on_notification;
  select count(*) into notif0 from public.user_notifications where user_id = f and type = 'promotion_approved';

  -- ---- A. Opening a payment page -----------------------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  j := public.start_online_checkout('pro_30');
  co1 := (j ->> 'id')::uuid;
  res := res || case when co1 is not null and (j ->> 'amount')::numeric = (select price from public.promo_prices where code = 'pro_30')
                       and (j ->> 'days')::int = 30
                 then 'PASS' else 'FAIL (' || j::text || ')' end
         || ' a freelancer opens a page for pro_30; the price and days come from the price list' || E'\n';

  select count(*) into n from public.online_checkouts where id = co1 and status = 'open' and test_mode and session_id is null;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' it is saved as open, in test mode, with no Xendit id yet' || E'\n';

  select count(*) into n from public.online_checkouts;
  res := res || case when n >= 1 then 'PASS' else 'FAIL' end || ' the freelancer can read their own page' || E'\n';

  begin
    perform public.start_online_checkout('feature_3');
    res := res || 'FAIL a Featured code was accepted online' || E'\n';
  exception when others then
    res := res || case when sqlerrm = 'Only Freelancer Pro can be paid online for now.' then 'PASS' else 'FAIL (' || sqlerrm || ')' end
           || ' only Freelancer Pro can be paid online' || E'\n';
  end;

  begin
    insert into public.online_checkouts (user_id, price_code, days, amount) values (f, 'pro_30', 30, 1);
    res := res || 'FAIL the browser could add a page (at ₱1)' || E'\n';
  exception when others then
    res := res || 'PASS the browser cannot add a page itself (' || sqlerrm || ')' || E'\n';
  end;

  begin
    update public.online_checkouts set status = 'paid', paid_at = now() where id = co1;
    get diagnostics n = row_count;
    res := res || case when n = 0 then 'PASS the browser cannot mark a page paid (0 rows)' else 'FAIL the browser marked a page paid' end || E'\n';
  exception when others then
    res := res || 'PASS the browser cannot mark a page paid (' || sqlerrm || ')' || E'\n';
  end;

  begin
    perform public.finish_online_checkout(co1, 'py-fake', 149, true);
    res := res || 'FAIL the browser could call finish_online_checkout' || E'\n';
  exception when others then
    res := res || case when sqlerrm like 'permission denied%' then 'PASS' else 'FAIL (' || sqlerrm || ')' end
           || ' the browser cannot call finish_online_checkout' || E'\n';
  end;
  reset role;

  -- A client account cannot buy Pro.
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', c::text, true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.start_online_checkout('pro_30');
    res := res || 'FAIL a client opened a Pro payment page' || E'\n';
  exception when others then
    res := res || case when sqlerrm = 'Freelancer Pro is for freelancer accounts.' then 'PASS' else 'FAIL (' || sqlerrm || ')' end
           || ' a client account cannot open a Pro payment page' || E'\n';
  end;
  reset role;

  -- Somebody else cannot see the freelancer's page.
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', s::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from public.online_checkouts where id = co1;
  res := res || case when n = 0 then 'PASS' else 'FAIL' end || ' another person cannot see the page' || E'\n';
  reset role;

  -- Signed out: nothing.
  select count(*) into zz from (select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true), set_config('role', 'anon', true)) q;
  begin
    perform public.start_online_checkout('pro_30');
    res := res || 'FAIL a signed-out visitor opened a page' || E'\n';
  exception when others then
    res := res || 'PASS a signed-out visitor cannot open a page (' || sqlerrm || ')' || E'\n';
  end;
  reset role;

  -- ---- B. Xendit says it is paid (the server, service_role) ---------------
  select count(*) into zz from (select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.sub', '', true), set_config('role', 'service_role', true)) q;
  update public.online_checkouts set session_id = 'ps-test-1', checkout_url = 'https://xen.to/test1' where id = co1;

  begin
    perform public.finish_online_checkout(co1, 'py-test-1', 1, true);
    res := res || 'FAIL a wrong amount was accepted' || E'\n';
  exception when others then
    res := res || case when sqlerrm = 'The amount paid does not match.' then 'PASS' else 'FAIL (' || sqlerrm || ')' end
           || ' a payment of the wrong amount is refused' || E'\n';
  end;

  begin
    perform public.finish_online_checkout(co1, 'py-test-1', 149, false);
    res := res || 'FAIL a live payment was recorded on a test page' || E'\n';
  exception when others then
    res := res || case when sqlerrm = 'A test payment and a live payment cannot be mixed.' then 'PASS' else 'FAIL (' || sqlerrm || ')' end
           || ' a live payment cannot finish a test page' || E'\n';
  end;

  j := public.finish_online_checkout(co1, 'py-test-1', 149, true);
  until1 := (j ->> 'pro_until')::timestamptz;
  res := res || case when (j ->> 'already') = 'false' and until1 between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour'
                 then 'PASS' else 'FAIL (' || j::text || ')' end
         || ' the right amount gives 30 days of Pro from now' || E'\n';

  select count(*) into n from public.pro_members where user_id = f and pro_until = until1;
  res := res || case when n = 1 and public.is_pro(f) then 'PASS' else 'FAIL' end || ' the freelancer is Pro now' || E'\n';

  select count(*) into n from public.promotions
   where user_id = f and kind = 'pro' and method = 'online' and status = 'approved' and test_mode
     and provider_payment_id = 'py-test-1' and reference_no is null and receipt_path is null
     and decided_by is null and ends_at = until1 and amount = 149;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' the payment is recorded: online, approved, test, no reference or receipt, no admin' || E'\n';

  select count(*) into n from public.online_checkouts where id = co1 and status = 'paid' and paid_at is not null and promotion_id is not null;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' the page is marked paid and linked to the record' || E'\n';

  select count(*) into n from public.user_notifications
   where user_id = f and type = 'promotion_approved' and title = 'Payment received'
     and link = '/dashboard/pro' and message like 'Thank you! You are a Freelancer Pro until %';
  select count(*) into zz from public.user_notifications where user_id = f and type = 'promotion_approved';
  res := res || case when n = 1 and zz = notif0 + 1 then 'PASS' else 'FAIL (' || n || ')' end || ' the freelancer is told, with a link to the Pro page' || E'\n';

  -- The same news a second time changes nothing.
  j := public.finish_online_checkout(co1, 'py-test-1', 149, true);
  select count(*) into n from public.promotions where user_id = f and method = 'online';
  res := res || case when (j ->> 'already') = 'true' and n = 1 and (select pro_until from public.pro_members where user_id = f) = until1
                 then 'PASS' else 'FAIL (' || j::text || ', ' || n || ')' end
         || ' the same payment reported twice is counted once' || E'\n';
  reset role;

  -- ---- C. Paying again extends; a live payment counts in Earnings ----------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', adm::text, true), set_config('role', 'authenticated', true)) q;
  total0 := (public.admin_promo_earnings() ->> 'total')::numeric;
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  co2 := (public.start_online_checkout('pro_30') ->> 'id')::uuid;
  reset role;
  select count(*) into zz from (select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.sub', '', true), set_config('role', 'service_role', true)) q;
  -- Opened with the live keys this time.
  update public.online_checkouts set session_id = 'ps-test-2', test_mode = false where id = co2;
  j := public.finish_online_checkout(co2, 'py-test-2', 149, false);
  until2 := (j ->> 'pro_until')::timestamptz;
  res := res || case when until2 = until1 + interval '30 days' then 'PASS' else 'FAIL (' || until1 || ' -> ' || until2 || ')' end
         || ' paying again before Pro ends adds 30 days after the current end' || E'\n';

  begin
    insert into public.promotions (user_id, kind, price_code, days, amount, status, decided_at, starts_at, ends_at, method, provider_payment_id, test_mode)
    values (f, 'pro', 'pro_30', 30, 149, 'approved', now(), now(), now() + interval '30 days', 'online', 'py-test-2', false);
    res := res || 'FAIL one Xendit payment was recorded twice' || E'\n';
  exception when unique_violation then
    res := res || 'PASS one Xendit payment can be recorded only once' || E'\n';
  end;
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', adm::text, true), set_config('role', 'authenticated', true)) q;
  total1 := (public.admin_promo_earnings() ->> 'total')::numeric;
  res := res || case when total1 = total0 + 149 then 'PASS' else 'FAIL (' || total0 || ' -> ' || total1 || ')' end
         || ' Earnings count the live payment (₱149) and leave the test one out' || E'\n';
  select count(*) into n from public.online_checkouts where user_id = f;
  res := res || case when n = 2 then 'PASS' else 'FAIL (' || n || ')' end || ' an admin can read every payment page' || E'\n';
  reset role;

  -- ---- D. The rules of the table -----------------------------------------
  begin
    insert into public.promotions (user_id, kind, price_code, days, amount, reference_no, receipt_path, method)
    values (f, 'pro', 'pro_30', 30, 149, null, f::text || '/r.jpg', 'gcash');
    res := res || 'FAIL a GCash payment without a reference was saved' || E'\n';
  exception when check_violation then
    res := res || 'PASS a GCash payment still needs its reference number' || E'\n';
  end;
  begin
    insert into public.promotions (user_id, kind, price_code, days, amount, reference_no, receipt_path, method, status, decided_at, starts_at, ends_at, provider_payment_id)
    values (f, 'pro', 'pro_30', 30, 149, '4021358091742', null, 'online', 'approved', now(), now(), now() + interval '1 day', 'py-x');
    res := res || 'FAIL an online payment with a GCash reference was saved' || E'\n';
  exception when check_violation then
    res := res || 'PASS an online payment has no GCash reference or receipt' || E'\n';
  end;
  begin
    insert into public.promotions (user_id, kind, price_code, days, amount, method, status, provider_payment_id)
    values (f, 'pro', 'pro_30', 30, 149, 'online', 'pending', 'py-y');
    res := res || 'FAIL an online payment was saved as waiting' || E'\n';
  exception when check_violation then
    res := res || 'PASS an online payment is never left waiting for an admin' || E'\n';
  end;

  -- ---- E. At most 10 pages an hour ---------------------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  for n in 1..8 loop
    co3 := (public.start_online_checkout('pro_30') ->> 'id')::uuid;
  end loop;
  begin
    co4 := (public.start_online_checkout('pro_30') ->> 'id')::uuid;
    res := res || 'FAIL an 11th page in one hour was opened' || E'\n';
  exception when others then
    res := res || case when sqlerrm like 'You opened many payment pages%' then 'PASS' else 'FAIL (' || sqlerrm || ')' end
           || ' an 11th page in one hour is refused' || E'\n';
  end;
  reset role;

  res := res || E'\n' || (length(res) - length(replace(res, 'PASS', ''))) / 4 || ' passed, '
         || (length(res) - length(replace(res, 'FAIL', ''))) / 4 || ' failed' || E'\n';

  raise exception E'ONLINE PRO TEST (rolled back, nothing left behind)\n\n%', res;
end
$t$;
