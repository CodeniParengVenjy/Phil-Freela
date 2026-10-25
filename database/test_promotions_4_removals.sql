-- Test 4 of 4 for supabase_promotions_schema.sql: the checks that remove rows (an
-- offer or a job post taken away after it was paid for, PhilFreela's GCash row,
-- uploaded receipts). Paste this whole file into the Supabase SQL Editor and run
-- it AFTER the schema file. The Claude database connector asks for a
-- confirmation on any statement that removes rows, so these checks live in their
-- own file, and they were NOT run through the connector (the other three were).
-- Like them it borrows existing accounts (no user numbers are used), acts as
-- each of them, and ends with an error that carries the PASS/FAIL list; that
-- error rolls everything back, so nothing is left behind.
do $t$
declare
  res        text := '';
  msg        text;
  st         text;
  n          int;
  n2         int;
  zz         int;
  f          uuid;   -- a freelancer-account
  f_svc1     uuid;
  f_svc2     uuid;
  c          uuid;   -- a client-account
  c_job      uuid;
  s          uuid;   -- a stranger to both
  a_plain    uuid;
  a_super    uuid;
  pr1        uuid;
  pr2        uuid;
  pr3        uuid;
  seq_before bigint;
  seq_after  bigint;
  pr         record;
begin
  select last_value into seq_before from public.user_number_seq;

  select p.id into f from public.profiles p
   where p.account_type = 'freelancer'
   order by (select count(*) from public.services sv where sv.freelancer_id = p.id), p.id limit 1;
  select p.id into c from public.profiles p where p.account_type = 'client' limit 1;
  select id into s from public.profiles where id not in (f, c) limit 1;
  select id into a_plain from public.admins where role = 'admin' and not must_change_password limit 1;
  select id into a_super from public.admins where role = 'super_admin' and not must_change_password limit 1;
  if f is null or c is null or s is null or a_plain is null or a_super is null then
    raise exception 'Needs a freelancer-account, a client-account, a stranger, an admin and a super admin.';
  end if;

  -- Made-up offers and a made-up job post, so no real post is touched.
  insert into public.services (freelancer_id, title, category, description)
  values (f, 'ZZ test offer 1', 'graphic-design', 'Made by the test.') returning id into f_svc1;
  insert into public.services (freelancer_id, title, category, description)
  values (f, 'ZZ test offer 2', 'graphic-design', 'Made by the test.') returning id into f_svc2;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
  values (c, 'ZZ test job', 'graphic-design', 'Made by the test.',
          (now() at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date + 10)
  returning id into c_job;

  alter table public.user_notifications disable trigger email_offline_on_notification;

  insert into storage.objects (bucket_id, name) values
    ('promo-receipts', f::text || '/r1.jpg'), ('promo-receipts', f::text || '/r2.jpg'),
    ('promo-receipts', f::text || '/spare.jpg'), ('promo-receipts', c::text || '/r1.jpg'),
    ('promo-receipts', s::text || '/spare.jpg');

  -- ---- A. Nobody removes PhilFreela's GCash row ---------------------------
  insert into public.site_gcash (gcash_number, account_name) values ('09170000000', 'PhilFreela Demo')
  on conflict (id) do nothing;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', s::text, true), set_config('role', 'authenticated', true)) q;
  begin
    delete from public.site_gcash where id;
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-in person cannot remove PhilFreela''s GCash row' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_super, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_super::text, true), set_config('role', 'authenticated', true)) q;
  begin
    delete from public.site_gcash where id;
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' not even a super admin can remove it from the browser' || E'\n';
  reset role;

  select count(*) into n from public.site_gcash;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the row is still there' || E'\n';

  -- ---- B. An offer is removed after it was paid for ------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  pr1 := public.request_promotion('feature_7', f_svc1, null, '1234567890123', f::text || '/r1.jpg');
  pr2 := public.request_promotion('feature_3', f_svc2, null, '2234567890123', f::text || '/r2.jpg');
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  perform public.approve_promotion(pr1);
  reset role;
  select count(*) into n from public.featured_posts where service_id = f_svc1;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' (setup) the first offer is Featured' || E'\n';

  delete from public.services where id in (f_svc1, f_svc2);

  select count(*) into n from public.featured_posts where service_id is not null and service_id in (f_svc1, f_svc2);
  select count(*) into n2 from public.featured_posts;
  res := res || case when n = 0 and n2 = 0 then 'PASS' else 'FAIL (' || n || ', ' || n2 || ')' end
         || ' removing an offer ends its Featured spot' || E'\n';

  select * into pr from public.promotions where id = pr1;
  res := res || case when pr.status = 'approved' and pr.service_id is null and pr.target_title = 'ZZ test offer 1'
                      and pr.amount = 99 and pr.reference_no = '1234567890123'
                 then 'PASS' else 'FAIL' end
         || ' the approved payment stays on record with its title, amount and reference' || E'\n';

  select * into pr from public.promotions where id = pr2;
  res := res || case when pr.status = 'pending' and pr.service_id is null and pr.target_title = 'ZZ test offer 2'
                 then 'PASS' else 'FAIL' end
         || ' the waiting request stays too' || E'\n';

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.approve_promotion(pr2);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'The offer was removed%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a request for an offer that is gone cannot be approved' || E'\n';
  perform public.reject_promotion(pr2, 'The offer was removed.');
  reset role;
  select status into msg from public.promotions where id = pr2;
  res := res || case when msg = 'rejected' then 'PASS' else 'FAIL (' || coalesce(msg, 'null') || ')' end
         || ' but it can be rejected' || E'\n';

  -- ---- C. A job post is removed after it was paid for ----------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', c::text, true), set_config('role', 'authenticated', true)) q;
  pr3 := public.request_promotion('feature_3', null, c_job, '3234567890123', c::text || '/r1.jpg');
  reset role;
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  perform public.approve_promotion(pr3);
  reset role;
  select count(*) into n from public.featured_posts where job_id = c_job;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' (setup) the job post is Featured' || E'\n';

  delete from public.job_posts where id = c_job;

  select count(*) into n from public.featured_posts;
  select * into pr from public.promotions where id = pr3;
  res := res || case when n = 0 and pr.status = 'approved' and pr.job_id is null and pr.target_title = 'ZZ test job' and pr.amount = 49
                 then 'PASS' else 'FAIL (' || n || ')' end
         || ' removing a job post ends its Featured spot and keeps the payment record' || E'\n';

  -- ---- D. Receipt files ----------------------------------------------------
  -- Storage refuses direct removals unless this switch is on (the storage API sets it).
  perform set_config('storage.allow_delete_query', 'true', true);

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', s::text, true), set_config('role', 'authenticated', true)) q;
  delete from storage.objects where bucket_id = 'promo-receipts' and name = s::text || '/spare.jpg';
  get diagnostics n = row_count;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a person can remove an upload that no request uses' || E'\n';
  delete from storage.objects where bucket_id = 'promo-receipts' and name = f::text || '/spare.jpg';
  get diagnostics n = row_count;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' but not someone else''s upload' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  delete from storage.objects where bucket_id = 'promo-receipts' and name = f::text || '/r1.jpg';
  get diagnostics n = row_count;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a receipt that a request uses cannot be removed' || E'\n';
  delete from storage.objects where bucket_id = 'promo-receipts' and name = f::text || '/spare.jpg';
  get diagnostics n = row_count;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' while an unused upload of their own can' || E'\n';
  reset role;

  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL' end
         || ' the user number counter did not move' || E'\n';

  res := res || E'\n' || (length(res) - length(replace(res, 'PASS', ''))) / 4 || ' passed, '
         || (length(res) - length(replace(res, 'FAIL', ''))) / 4 || ' failed' || E'\n';

  raise exception E'PROMOTIONS REMOVALS TEST (rolled back, nothing left behind)\n\n%', res;
end
$t$;
