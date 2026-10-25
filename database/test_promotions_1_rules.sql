-- Test 1 of 4 for supabase_promotions_schema.sql: the shape of the new tables and
-- who may read or write them (including PhilFreela's GCash row and the prices).
-- Paste this whole file into the Supabase SQL Editor and run it AFTER the schema
-- file. It borrows existing accounts (no accounts are made, so no user numbers
-- are used), acts as each of them, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
-- The four test files are separate because the Claude database connector
-- refuses one very long block, and any statement that removes rows (test 4).
do $t$
declare
  res        text := '';
  msg        text;
  st         text;
  n          int;
  zz         int;
  f          uuid;   -- a freelancer-account
  f_svc      uuid;   -- any offer
  s          uuid;   -- a stranger
  a_plain    uuid;   -- an admin
  a_super    uuid;   -- a super admin
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  select id into f from public.profiles where account_type = 'freelancer' limit 1;
  select id into f_svc from public.services limit 1;
  select id into s from public.profiles where id <> f limit 1;
  select id into a_plain from public.admins where role = 'admin' and not must_change_password limit 1;
  select id into a_super from public.admins where role = 'super_admin' and not must_change_password limit 1;
  if f is null or f_svc is null or s is null or a_plain is null or a_super is null then
    raise exception 'Needs a freelancer-account, an offer, a stranger, an admin and a super admin.';
  end if;

  -- ---- A. The shape and who may run what ---------------------------------
  select count(*) into n from pg_class c2
    where c2.relnamespace = 'public'::regnamespace and c2.relrowsecurity
      and c2.relname in ('site_gcash', 'promo_prices', 'promotions', 'featured_posts', 'pro_members');
  res := res || case when n = 5 then 'PASS' else 'FAIL (' || n || ')' end
         || ' row level security is on for all 5 new tables' || E'\n';

  select count(*) into n from public.promo_prices;
  res := res || case when n = 4 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the price list has 4 options' || E'\n';

  select count(*) into n from public.promo_prices
    where (code, days, price, pro_price) in (
      ('feature_3', 3, 49.00, 25.00), ('feature_7', 7, 99.00, 50.00),
      ('feature_14', 14, 179.00, 90.00)) or (code = 'pro_30' and days = 30 and price = 149.00 and pro_price is null);
  res := res || case when n = 4 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the seeded prices are the agreed ones' || E'\n';

  select count(*) into n from storage.buckets
    where (id = 'promo-receipts' and not public and file_size_limit = 5242880)
       or (id = 'promo-qr' and not public and file_size_limit = 2097152);
  res := res || case when n = 2 then 'PASS' else 'FAIL (' || n || ')' end
         || ' both buckets are private with the right size limits' || E'\n';

  select count(*) into n from pg_constraint
    where conname = 'user_notifications_type_check'
      and pg_get_constraintdef(oid) like '%promotion_approved%'
      and pg_get_constraintdef(oid) like '%promotion_rejected%'
      and pg_get_constraintdef(oid) like '%payment_requested%'
      and pg_get_constraintdef(oid) like '%school_id_pass%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the 2 new notification kinds are allowed and the old ones kept' || E'\n';

  select count(*) into n from pg_constraint
    where conname = 'admin_log_action_check'
      and pg_get_constraintdef(oid) like '%promotion%'
      and pg_get_constraintdef(oid) like '%user_restore%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the Activity Log accepts "promotion" and keeps the old kinds' || E'\n';

  res := res || case when not has_function_privilege('anon', 'public.request_promotion(text,uuid,uuid,text,text)', 'execute')
                      and not has_function_privilege('anon', 'public.approve_promotion(uuid)', 'execute')
                      and not has_function_privilege('anon', 'public.reject_promotion(uuid,text)', 'execute')
                      and not has_function_privilege('anon', 'public.is_pro(uuid)', 'execute')
                      and not has_function_privilege('anon', 'public.featured_slots_left(text)', 'execute')
                      and has_function_privilege('authenticated', 'public.request_promotion(text,uuid,uuid,text,text)', 'execute')
                      and has_function_privilege('authenticated', 'public.approve_promotion(uuid)', 'execute')
                      and not has_function_privilege('authenticated', 'public.limit_offers()', 'execute')
                 then 'PASS' else 'FAIL' end
         || ' the functions run for signed-in people and not for a signed-out visitor' || E'\n';

  -- ---- B. The browser cannot write the new tables ------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;

  begin
    insert into public.promotions (user_id, kind, price_code, days, amount, reference_no, receipt_path)
    values (f, 'pro', 'pro_30', 30, 1, '9999999999999', f::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-in person cannot write a request straight into promotions' || E'\n';

  begin
    insert into public.pro_members (user_id, pro_until) values (f, now() + interval '30 days');
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a person cannot make themselves Pro' || E'\n';

  begin
    insert into public.featured_posts (service_id, featured_until) values (f_svc, now() + interval '30 days');
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a person cannot make a post Featured' || E'\n';

  begin
    insert into public.promo_prices (code, label, days, price) values ('feature_3', 'x', 3, 1);
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a person cannot add a price option' || E'\n';

  update public.promo_prices set price = 1 where code = 'feature_3';
  get diagnostics n = row_count;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a person cannot change a price' || E'\n';

  select count(*) into n from public.promo_prices;
  res := res || case when n = 4 then 'PASS' else 'FAIL (' || n || ')' end
         || ' signed-in people can read the price list' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', '{}', true), set_config('request.jwt.claim.sub', '', true), set_config('role', 'anon', true)) q;
  begin
    perform 1 from public.promo_prices;
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor cannot read the price list' || E'\n';
  reset role;

  -- ---- C. PhilFreela's own GCash details ---------------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  begin
    insert into public.site_gcash (gcash_number, account_name) values ('09170000000', 'PhilFreela Demo');
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a plain admin cannot set PhilFreela''s GCash number' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_super, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_super::text, true), set_config('role', 'authenticated', true)) q;

  begin
    insert into public.site_gcash (gcash_number, account_name) values ('08170000000', 'PhilFreela Demo');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%gcash_number_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a number that does not start with 09 is refused' || E'\n';

  begin
    insert into public.site_gcash (gcash_number, account_name) values ('09170000000', 'PhilFreela 2');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%account_name_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a name with a digit is refused' || E'\n';

  begin
    insert into public.site_gcash (gcash_number, account_name, qr_path) values ('09170000000', 'PhilFreela Demo', s::text || '/../x.png');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%qr_path_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a QR path that is not "<id>/<file>" is refused' || E'\n';

  insert into public.site_gcash (gcash_number, account_name, qr_path)
  values ('09170000000', 'PhilFreela Demo', a_super::text || '/qr.png');
  select count(*) into n from public.site_gcash where updated_by = a_super;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a super admin saves the number and it records who did it' || E'\n';

  begin
    insert into public.site_gcash (id, gcash_number, account_name) values (false, '09170000001', 'Second Row');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%site_gcash_id_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a second row is impossible' || E'\n';

  update public.site_gcash set gcash_number = '09171112222' where id;
  get diagnostics n = row_count;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a super admin can change the number' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from public.site_gcash where gcash_number = '09171112222';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a signed-in person can read where to pay' || E'\n';
  update public.site_gcash set gcash_number = '09179999999' where id;
  get diagnostics n = row_count;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a signed-in person cannot change it' || E'\n';
  reset role;

  -- ---- D. Prices ---------------------------------------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_super, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_super::text, true), set_config('role', 'authenticated', true)) q;
  update public.promo_prices set price = 59.00 where code = 'feature_3';
  get diagnostics n = row_count;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a super admin can change a price' || E'\n';
  update public.promo_prices set price = 49.00 where code = 'feature_3';

  begin
    update public.promo_prices set pro_price = 60.00 where code = 'feature_3';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%promo_prices_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the Pro price cannot be above the normal price' || E'\n';

  begin
    update public.promo_prices set days = 99 where code = 'feature_3';
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' only the two prices can be changed, not the options' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  update public.promo_prices set price = 1.00 where code = 'feature_3';
  get diagnostics n = row_count;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a plain admin cannot change a price' || E'\n';
  reset role;

  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL' end
         || ' the user number counter did not move' || E'\n';

  res := res || E'\n' || (length(res) - length(replace(res, 'PASS', ''))) / 4 || ' passed, '
         || (length(res) - length(replace(res, 'FAIL', ''))) / 4 || ' failed' || E'\n';

  raise exception E'PROMOTIONS TEST 1: RULES (rolled back, nothing left behind)\n\n%', res;
end
$t$;
