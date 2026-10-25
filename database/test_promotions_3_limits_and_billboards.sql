-- Test 3 of 4 for supabase_promotions_schema.sql: the offer limit (free 3, Pro
-- 15), the sponsored billboard dates, and who can open the receipt and QR
-- pictures. Paste this whole file into the Supabase SQL Editor and run it AFTER
-- the schema file. It borrows existing accounts (no accounts are made, so no
-- user numbers are used), acts as each of them, and ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing is
-- left behind.
do $t$
declare
  res        text := '';
  msg        text;
  st         text;
  n          int;
  n2         int;
  zz         int;
  f          uuid;   -- a freelancer-account
  g          uuid;   -- the person whose offers are counted
  c          uuid;   -- a client-account
  s          uuid;   -- a stranger
  a_plain    uuid;
  a_super    uuid;
begin
  select id into f from public.profiles where account_type = 'freelancer' limit 1;
  -- The person with the fewest offers, so the test adds its own up to the limit.
  select p.id into g from public.profiles p
   order by (select count(*) from public.services sv where sv.freelancer_id = p.id), p.id limit 1;
  select id into c from public.profiles where account_type = 'client' limit 1;
  select id into s from public.profiles where id not in (f, c, g) limit 1;
  select id into a_plain from public.admins where role = 'admin' and not must_change_password limit 1;
  select id into a_super from public.admins where role = 'super_admin' and not must_change_password limit 1;
  if f is null or g is null or c is null or s is null or a_plain is null or a_super is null then
    raise exception 'Needs a freelancer-account, a client-account, two more people, an admin and a super admin.';
  end if;

  -- ---- G. The offer limit ------------------------------------------------
  select count(*) into n from public.services where freelancer_id = g;
  while n < 3 loop
    insert into public.services (freelancer_id, title, category, description)
    values (g, 'ZZ test offer ' || n, 'graphic-design', 'Made by the test.');
    n := n + 1;
  end loop;

  begin
    insert into public.services (freelancer_id, title, category, description)
    values (g, 'ZZ test offer 4', 'graphic-design', 'Made by the test.');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Free accounts can have up to 3 offers%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a free account cannot add a 4th offer' || E'\n';

  insert into public.pro_members (user_id, pro_until) values (g, now() + interval '30 days');
  begin
    insert into public.services (freelancer_id, title, category, description)
    values (g, 'ZZ test offer 4', 'graphic-design', 'Made by the test.');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' a Pro member can add a 4th offer' || E'\n';

  select count(*) into n from public.services where freelancer_id = g;
  while n < 15 loop
    insert into public.services (freelancer_id, title, category, description)
    values (g, 'ZZ test offer ' || (n + 1), 'graphic-design', 'Made by the test.');
    n := n + 1;
  end loop;
  begin
    insert into public.services (freelancer_id, title, category, description)
    values (g, 'ZZ test offer 16', 'graphic-design', 'Made by the test.');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'You have reached the limit of 15 offers%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a Pro member stops at 15 offers' || E'\n';

  -- Pro ends: the offers stay, but nothing new can be added.
  update public.pro_members set pro_until = now() - interval '1 day' where user_id = g;
  begin
    insert into public.services (freelancer_id, title, category, description)
    values (g, 'ZZ test offer 17', 'graphic-design', 'Made by the test.');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  select count(*) into n from public.services where freelancer_id = g;
  res := res || case when msg like 'Free accounts can have up to 3 offers%' and n = 15 and not public.is_pro(g)
                 then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ', ' || n || ')' end
         || ' when Pro ends the 15 offers stay but no new one can be added' || E'\n';

  -- ---- H. Sponsored billboards -------------------------------------------
  insert into public.dashboard_billboards (title, audience, sponsor_name, amount, payment_ref, starts_at, ends_at) values
    ('ZZ test 1', 'all', null, null, null, now(), null),                                                     -- no end: shows
    ('ZZ test 2', 'all', 'Cafe Aroma', 1500, '1234567890123', now() + interval '1 day', now() + interval '8 days'),  -- not yet
    ('ZZ test 3', 'all', 'Cafe Aroma', 1500, null, now() - interval '2 days', now() - interval '1 day'),             -- over
    ('ZZ test 4', 'all', 'Studio Luz', 2000, null, now() - interval '1 day', now() + interval '1 day');              -- running
  insert into public.dashboard_billboards (title, audience, is_active) values ('ZZ test 5', 'all', false);

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from public.dashboard_billboards where title like 'ZZ test %';
  select count(*) into n2 from public.dashboard_billboards where title in ('ZZ test 1', 'ZZ test 4');
  res := res || case when n = 2 and n2 = 2 then 'PASS' else 'FAIL (' || n || ')' end
         || ' people see a billboard only inside its dates: not yet, over and switched-off ones stay hidden' || E'\n';
  select sponsor_name into msg from public.dashboard_billboards where title = 'ZZ test 4';
  res := res || case when msg = 'Studio Luz' then 'PASS' else 'FAIL (' || coalesce(msg, 'null') || ')' end
         || ' the running billboard carries its sponsor name' || E'\n';
  update public.dashboard_billboards set ends_at = now() + interval '5 days' where title = 'ZZ test 3';
  get diagnostics n = row_count;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a normal person cannot move an end date' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from public.dashboard_billboards where title like 'ZZ test %';
  res := res || case when n = 5 then 'PASS' else 'FAIL (' || n || ')' end
         || ' an admin sees all 5 whatever their dates' || E'\n';
  update public.dashboard_billboards set ends_at = now() + interval '5 days' where title = 'ZZ test 3';
  get diagnostics n = row_count;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a plain admin cannot move an end date (billboards are for super admins)' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_super, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_super::text, true), set_config('role', 'authenticated', true)) q;
  update public.dashboard_billboards set ends_at = now() + interval '5 days' where title = 'ZZ test 3';
  get diagnostics n = row_count;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a super admin can extend a sponsorship by moving its end date' || E'\n';

  select count(*) into n from public.admin_log
    where admin_id = a_super and message like '%set the end date of the billboard "ZZ test 3" to%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the end date change is in the Activity Log' || E'\n';

  begin
    update public.dashboard_billboards set starts_at = now() where title = 'ZZ test 3';
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the start date cannot be changed afterwards' || E'\n';

  begin
    update public.dashboard_billboards set ends_at = now() - interval '10 days' where title = 'ZZ test 3';
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%dashboard_billboards_dates%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an end date before the start date is refused' || E'\n';

  update public.dashboard_billboards set ends_at = null where title = 'ZZ test 3';
  select count(*) into n from public.admin_log
    where admin_id = a_super and message like '%removed the end date of the billboard "ZZ test 3"%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' removing an end date is in the Activity Log too' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from public.dashboard_billboards where title like 'ZZ test %';
  reset role;
  res := res || case when n = 3 then 'PASS' else 'FAIL (' || n || ')' end
         || ' after the extension the ended billboard shows again (3 visible)' || E'\n';

  begin
    insert into public.dashboard_billboards (title, payment_ref) values ('ZZ test 6', '12345');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%payment_ref_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a payment reference that is not 13 digits is refused' || E'\n';

  begin
    insert into public.dashboard_billboards (title, sponsor_name) values ('ZZ test 6', ' ');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%sponsor_name_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an empty sponsor name is refused' || E'\n';

  begin
    insert into public.dashboard_billboards (title, starts_at, ends_at) values ('ZZ test 6', now(), now() - interval '1 day');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%dashboard_billboards_dates%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a billboard that ends before it starts is refused' || E'\n';

  insert into public.dashboard_billboards (title, audience, sponsor_name) values ('ZZ test 7', 'all', 'Studio Luz');
  select count(*) into n from public.dashboard_billboards where title = 'ZZ test 7' and sponsor_name = 'Studio Luz';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a sponsored billboard with no end date can be posted' || E'\n';

  select count(*) into n from public.dashboard_billboards
    where title not like 'ZZ test %' and (starts_at > now() or ends_at is not null);
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the billboards that were already live have no end date and keep showing' || E'\n';

  -- ---- I. Who can open the pictures --------------------------------------
  insert into storage.objects (bucket_id, name) values
    ('promo-receipts', f::text || '/r1.jpg'), ('promo-receipts', c::text || '/r1.jpg');

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from storage.objects where bucket_id = 'promo-receipts' and name = f::text || '/r1.jpg';
  select count(*) into n2 from storage.objects where bucket_id = 'promo-receipts' and name = c::text || '/r1.jpg';
  res := res || case when n = 1 and n2 = 0 then 'PASS' else 'FAIL (' || n || ', ' || n2 || ')' end
         || ' a person opens their own receipt and not someone else''s' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from storage.objects where bucket_id = 'promo-receipts' and name in (f::text || '/r1.jpg', c::text || '/r1.jpg');
  res := res || case when n = 2 then 'PASS' else 'FAIL (' || n || ')' end
         || ' an admin can open receipts to check a request' || E'\n';
  begin
    insert into storage.objects (bucket_id, name) values ('promo-qr', a_plain::text || '/qr.png');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg is not null then 'PASS' else 'FAIL (no error)' end
         || ' a plain admin cannot upload the PhilFreela QR' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_super, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_super::text, true), set_config('role', 'authenticated', true)) q;
  begin
    insert into storage.objects (bucket_id, name) values ('promo-qr', a_super::text || '/qr.png');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' a super admin can upload the PhilFreela QR' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', s::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from storage.objects where bucket_id = 'promo-qr';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' any signed-in person can open the PhilFreela QR' || E'\n';
  reset role;

  res := res || E'\n' || (length(res) - length(replace(res, 'PASS', ''))) / 4 || ' passed, '
         || (length(res) - length(replace(res, 'FAIL', ''))) / 4 || ' failed' || E'\n';

  raise exception E'PROMOTIONS TEST 3: LIMITS, BILLBOARDS, PICTURES (rolled back, nothing left behind)\n\n%', res;
end
$t$;
