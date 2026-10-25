-- Test for supabase_admin_payments_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It borrows an existing
-- admin, a normal user, a project and a chat (no accounts are made, so no user
-- numbers are used), adds some payments as the owner, and ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing is
-- left behind.
do $t$
declare
  res        text := '';
  msg        text;
  adm        uuid;
  usr        uuid;
  pr         uuid;
  pc         uuid;
  pf         uuid;
  conv       uuid;
  ca         uuid;
  cb         uuid;
  before_r   jsonb;
  after_r    jsonb;
  want       int;
  got        int;
  status_name text;
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  select id into adm from public.admins where not must_change_password limit 1;
  select p.id into usr from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  select id, client_id, freelancer_id into pr, pc, pf from public.projects order by started_at limit 1;
  select id, user_a, user_b into conv, ca, cb from public.conversations limit 1;
  if adm is null or usr is null or pr is null or conv is null then
    raise exception 'Needs an admin, a normal user, a project and a chat already in the database.';
  end if;

  -- ---- act as the admin: the numbers before -----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  before_r := public.admin_payment_counts()::jsonb;
  reset role;

  res := res || case when (select array_agg(k order by k) from jsonb_object_keys(before_r) k)
                         = array['cancelled', 'confirmed', 'not_received', 'requested', 'sent']
                     then 'PASS' else 'FAIL' end
         || ' the answer has exactly the five status numbers and nothing else (no amounts, no names)' || E'\n';

  -- ---- add payments in every status, as the owner --------------------------------
  insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path, status, answered_at) values
    (pr, pc, pf, 100, '7000000000001', pc::text || '/t1.jpg', 'sent', null),
    (pr, pc, pf, 100, '7000000000002', pc::text || '/t2.jpg', 'sent', null),
    (pr, pc, pf, 100, '7000000000003', pc::text || '/t3.jpg', 'confirmed', now()),
    (pr, pc, pf, 100, '7000000000004', pc::text || '/t4.jpg', 'not_received', now());
  insert into public.payments (conversation_id, client_id, freelancer_id, amount, status, answered_at) values
    (conv, ca, cb, 100, 'requested', null);
  insert into public.payments (conversation_id, client_id, freelancer_id, amount, status, answered_at) values
    (conv, ca, cb, 100, 'cancelled', now());

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  after_r := public.admin_payment_counts()::jsonb;
  reset role;

  -- Each number went up by what was added (a payment between archived people would
  -- not count, so the borrowed people are checked below too).
  res := res || case when (after_r ->> 'sent')::int - (before_r ->> 'sent')::int = 2 then 'PASS' else 'FAIL' end || ' sent went up by 2' || E'\n';
  res := res || case when (after_r ->> 'confirmed')::int - (before_r ->> 'confirmed')::int = 1 then 'PASS' else 'FAIL' end || ' confirmed went up by 1' || E'\n';
  res := res || case when (after_r ->> 'not_received')::int - (before_r ->> 'not_received')::int = 1 then 'PASS' else 'FAIL' end || ' not received went up by 1' || E'\n';
  res := res || case when (after_r ->> 'requested')::int - (before_r ->> 'requested')::int = 1 then 'PASS' else 'FAIL' end || ' requested went up by 1' || E'\n';
  res := res || case when (after_r ->> 'cancelled')::int - (before_r ->> 'cancelled')::int = 1 then 'PASS' else 'FAIL' end || ' cancelled went up by 1' || E'\n';

  -- ---- the numbers equal counting the table directly --------------------------------
  foreach status_name in array array['requested', 'sent', 'confirmed', 'not_received', 'cancelled'] loop
    select count(*) into want
      from public.payments p
     where p.status = status_name
       and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id));
    got := (after_r ->> status_name)::int;
    res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end
           || ' ' || status_name || ' equals counting the table directly' || E'\n';
  end loop;

  -- ---- who can ask -------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', usr::text, true);
  set local role authenticated;
  begin perform public.admin_payment_counts(); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'Only admins%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a normal user is refused' || E'\n';

  set local role anon;
  begin perform public.admin_payment_counts(); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor is refused' || E'\n';

  -- ---- no user numbers were used ------------------------------------------------------
  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL (' || seq_before || ' -> ' || seq_after || ')' end
         || ' the user number counter did not move' || E'\n';

  raise exception E'\n%', res;
end
$t$;
