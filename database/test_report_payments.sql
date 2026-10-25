-- Test for supabase_report_payments_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It borrows an existing
-- project and its two people, a stranger and an admin (no accounts are made, so
-- no user numbers are used), acts as each of them, and ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing is
-- left behind.
do $t$
declare
  res       text := '';
  msg       text;
  n         int;
  n2        int;
  pr        uuid;   -- the borrowed project
  c         uuid;   -- its client
  f         uuid;   -- its freelancer
  s         uuid;   -- a stranger to both
  adm       uuid;   -- an admin
  pay       uuid;   -- a payment between c and f
  pay2      uuid;   -- another payment between them, never reported
  rp        text;
  rp2       text;
  rep_cf    uuid;
  rep_fc    uuid;
  free_cf   boolean;
  free_fc   boolean;
  free_sf   boolean;
  stored    uuid;
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  select id, client_id, freelancer_id into pr, c, f from public.projects order by started_at limit 1;
  select id into s from public.profiles where id not in (c, f) limit 1;
  select id into adm from public.admins where not must_change_password limit 1;
  if pr is null or s is null or adm is null then
    raise exception 'Needs one project, a third person and an admin already in the database.';
  end if;

  -- Reports allow one pending report per person reported, so the cases that
  -- save a report only run when that pair has none waiting.
  free_cf := not exists (select 1 from public.reports where reporter_id = c and target_type = 'user' and target_id = f and status = 'pending');
  free_fc := not exists (select 1 from public.reports where reporter_id = f and target_type = 'user' and target_id = c and status = 'pending');
  free_sf := not exists (select 1 from public.reports where reporter_id = s and target_type = 'user' and target_id = f and status = 'pending');

  rp := c::text || '/rr-1.jpg';
  rp2 := c::text || '/rr-2.jpg';
  insert into storage.objects (bucket_id, name) values ('receipts', rp), ('receipts', rp2);
  insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path)
    values (pr, c, f, 750, '9999000011112', rp) returning id into pay;
  insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path)
    values (pr, c, f, 500, '9999000011113', rp2) returning id into pay2;

  -- ---- A. What is refused ---------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, payment_id) values (s, 'user', f, 'scam', pay);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%isn''t between you%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot send someone else''s payment' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, payment_id) values (c, 'user', s, 'scam', pay);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%isn''t between you%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the payment must be with the person reported' || E'\n';
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, payment_id) values (c, 'service', gen_random_uuid(), 'scam', pay);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%about a person%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a payment can only go with a report about a person' || E'\n';
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, payment_id) values (c, 'user', f, 'scam', gen_random_uuid());
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%isn''t between you%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a payment that does not exist is refused' || E'\n';
  reset role;

  -- ---- B. What is accepted -------------------------------------------------
  if free_sf then
    perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', s::text, true);
    set local role authenticated;
    begin
      insert into public.reports (reporter_id, target_type, target_id, reason) values (s, 'user', f, 'spam');
      msg := null;
    exception when others then msg := sqlerrm;
    end;
    res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
           || ' a normal report with no payment still works' || E'\n';
    reset role;
  else
    res := res || 'SKIPPED a normal report with no payment (that pair already has one waiting)' || E'\n';
  end if;

  if free_cf then
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', c::text, true);
    set local role authenticated;
    rep_cf := gen_random_uuid();
    begin
      insert into public.reports (id, reporter_id, target_type, target_id, reason, payment_id) values (rep_cf, c, 'user', f, 'scam', pay);
      msg := null;
    exception when others then msg := sqlerrm;
    end;
    res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
           || ' the client can report the freelancer and send the payment' || E'\n';
    select payment_id into stored from public.reports where id = rep_cf;
    res := res || case when stored = pay then 'PASS' else 'FAIL' end
           || ' the reporter reads their report with the payment on it' || E'\n';
    reset role;
  else
    res := res || 'SKIPPED the client reporting the freelancer (that pair already has a report waiting)' || E'\n';
  end if;

  if free_fc then
    perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', f::text, true);
    set local role authenticated;
    rep_fc := gen_random_uuid();
    begin
      insert into public.reports (id, reporter_id, target_type, target_id, reason, payment_id) values (rep_fc, f, 'user', c, 'scam', pay);
      msg := null;
    exception when others then msg := sqlerrm;
    end;
    res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
           || ' the freelancer can report the client and send the payment' || E'\n';
    reset role;
  else
    res := res || 'SKIPPED the freelancer reporting the client (that pair already has a report waiting)' || E'\n';
  end if;

  -- ---- C. What an admin can see ----------------------------------------------
  -- Before any report points at the payment, an admin sees nothing of it. (If the
  -- cases above saved a report, remove nothing: a report row is made as the owner
  -- below with a resolved status, which never collides with a waiting one.)
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  select count(*) into n from public.payments where id = pay2;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' an admin cannot read a payment nobody reported' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'receipts' and name = rp2;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' ... or open its receipt' || E'\n';
  reset role;

  -- A resolved report about the payment, made as the owner so it never collides.
  insert into public.reports (reporter_id, target_type, target_id, reason, payment_id, status)
    values (c, 'user', f, 'other', pay, 'resolved');

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  select count(*) into n from public.payments where id = pay;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' an admin reads the payment a report points at' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'receipts' and name = rp;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' ... and opens its receipt' || E'\n';
  select count(*) into n from public.payments where id = pay2;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' ... but still not the other payment of the same project' || E'\n';
  select count(*) into n from public.reports r join public.payments p on p.id = r.payment_id where r.payment_id = pay;
  res := res || case when n >= 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the report can be read together with its payment (the admin page asks for both)' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  select count(*) into n from public.payments where id = pay;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a stranger still cannot read the payment' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'receipts' and name = rp;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' ... or its receipt' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  select count(*) into n from public.payments where id = pay;
  select count(*) into n2 from storage.objects where bucket_id = 'receipts' and name = rp;
  res := res || case when n = 1 and n2 = 1 then 'PASS' else 'FAIL (' || n || ', ' || n2 || ')' end
         || ' the people on the payment still read it and their receipt' || E'\n';
  reset role;

  -- ---- D. Nothing else moved -------------------------------------------------
  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL (' || seq_before || ' -> ' || seq_after || ')' end
         || ' the user number counter did not move' || E'\n';

  raise exception E'\n%', res;
end
$t$;
