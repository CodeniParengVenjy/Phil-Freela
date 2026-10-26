-- Test for supabase_gcash_initials_schema.sql. Send the schema file and this block
-- together in ONE call to try it before applying (the error at the end rolls the
-- schema back too), or run this alone in the Supabase SQL Editor after the schema
-- file. It BORROWS an existing project (its client and freelancer), a stranger and a
-- chat without an open payment (no accounts are made, so no user numbers are used),
-- sets the freelancer's GCash details as the owner, acts as each person, and ends
-- with an error that carries the PASS/FAIL list; that error rolls everything back,
-- so nothing is left behind.
do $t$
declare
  res        text := '';
  msg        text;
  n          int;
  pr         uuid;   -- a borrowed project
  pc         uuid;   -- its client, who asks where to pay
  pf         uuid;   -- its freelancer, whose GCash details are used
  st         uuid;   -- a stranger
  conv       uuid;   -- a borrowed chat without an open payment
  ca         uuid;   -- its person asked to pay
  cb         uuid;   -- its person who asks for payment
  req        uuid;
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  select id, client_id, freelancer_id into pr, pc, pf from public.projects order by started_at limit 1;
  select p.id into st from public.profiles p
   where p.id not in (pc, pf) and not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  select c.id, c.user_a, c.user_b into conv, ca, cb from public.conversations c
   where not exists (select 1 from public.payments p where p.conversation_id = c.id and p.status in ('requested', 'sent'))
   limit 1;
  if pr is null or st is null then
    raise exception 'Needs a project and a third person already in the database.';
  end if;

  -- ---- 1. The initials ---------------------------------------------------------------
  res := res || case when public.name_initials('Ana R. Santos') = 'A. R. S.' then 'PASS' else 'FAIL' end
         || ' "Ana R. Santos" -> A. R. S.' || E'\n';
  res := res || case when public.name_initials('juan dela cruz') = 'J. D. C.' then 'PASS' else 'FAIL' end
         || ' lower case words come out as capitals (J. D. C.)' || E'\n';
  res := res || case when public.name_initials('María Peña-Muñoz Jr.') = 'M. P. J.' then 'PASS' else 'FAIL' end
         || ' accents, a hyphen and a dot: M. P. J.' || E'\n';
  res := res || case when public.name_initials('Ñandú López') = 'Ñ. L.' then 'PASS' else 'FAIL' end
         || ' a capital with a tilde: Ñ. L.' || E'\n';
  res := res || case when public.name_initials('Ana') = 'A.' then 'PASS' else 'FAIL' end
         || ' one word: A.' || E'\n';
  res := res || case when public.name_initials('  Ana    Santos  ') = 'A. S.' then 'PASS' else 'FAIL' end
         || ' extra spaces do not matter (A. S.)' || E'\n';
  res := res || case when public.name_initials('J. R. R. Tolkien') = 'J. R. R. T.' then 'PASS' else 'FAIL' end
         || ' every word counts (J. R. R. T.)' || E'\n';
  res := res || case when public.name_initials('') is null and public.name_initials(null) is null then 'PASS' else 'FAIL' end
         || ' an empty or missing name gives nothing' || E'\n';
  res := res || case when not has_function_privilege('anon', 'public.name_initials(text)', 'execute')
                          and not has_function_privilege('authenticated', 'public.name_initials(text)', 'execute')
                     then 'PASS' else 'FAIL' end
         || ' the helper is not callable from the website' || E'\n';

  -- ---- 2. Where to pay on a project ---------------------------------------------------
  insert into public.gcash_accounts (freelancer_id, gcash_number, account_name)
  values (pf, '09171234567', 'Ana R. Santos')
  on conflict (freelancer_id) do update set gcash_number = excluded.gcash_number, account_name = excluded.account_name;

  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pc::text, true);
  set local role authenticated;
  select count(*) into n from public.get_pay_details(pr) d where d.gcash_number = '09171234567' and d.initials = 'A. R. S.';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the project''s client gets the number and the initials' || E'\n';
  select count(*) into n from public.get_pay_details(pr) d
   where (select array_agg(k order by k) from jsonb_object_keys(to_jsonb(d)) k) = array['gcash_number', 'initials']
     and to_jsonb(d)::text not ilike '%Santos%' and to_jsonb(d)::text not ilike '%Ana%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' ... and nothing else: not the name, no QR' || E'\n';
  select count(*) into n from public.gcash_accounts;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client still cannot read the GCash table itself' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pf::text, true);
  set local role authenticated;
  select count(*) into n from public.gcash_accounts where account_name = 'Ana R. Santos';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer still reads their own full name' || E'\n';
  begin perform * from public.get_pay_details(pr); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'Only the client of this project%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the freelancer cannot ask for the client''s view' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', st::text, true);
  set local role authenticated;
  begin perform * from public.get_pay_details(pr); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'Only the client of this project%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger gets nothing' || E'\n';

  set local role anon;
  begin perform * from public.get_pay_details(pr); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor gets nothing' || E'\n';

  -- A change of name shows at once.
  update public.gcash_accounts set account_name = 'María Peña-Muñoz Jr.' where freelancer_id = pf;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pc::text, true);
  set local role authenticated;
  select count(*) into n from public.get_pay_details(pr) d where d.initials = 'M. P. J.';
  reset role;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' after the freelancer changes their name the initials follow' || E'\n';

  -- No details saved: no rows.
  delete from public.gcash_accounts where freelancer_id = pf;
  set local role authenticated;
  select count(*) into n from public.get_pay_details(pr);
  reset role;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' with no GCash details saved there are no rows' || E'\n';

  -- ---- 3. Where to pay for a request in a chat ----------------------------------------
  if conv is not null then
    insert into public.gcash_accounts (freelancer_id, gcash_number, account_name)
    values (cb, '09181234567', 'Carlo Mendoza')
    on conflict (freelancer_id) do update set gcash_number = excluded.gcash_number, account_name = excluded.account_name;
    insert into public.payments (conversation_id, client_id, freelancer_id, amount, status)
    values (conv, ca, cb, 400, 'requested') returning id into req;

    perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', ca::text, true);
    set local role authenticated;
    select count(*) into n from public.get_request_pay_details(req) d
     where d.gcash_number = '09181234567' and d.initials = 'C. M.'
       and (select array_agg(k order by k) from jsonb_object_keys(to_jsonb(d)) k) = array['gcash_number', 'initials']
       and to_jsonb(d)::text not ilike '%Mendoza%';
    reset role;
    res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
           || ' the person asked to pay gets the number and the initials, nothing else' || E'\n';

    perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', cb::text, true);
    set local role authenticated;
    begin perform * from public.get_request_pay_details(req); msg := null;
    exception when others then msg := sqlerrm; end;
    reset role;
    res := res || case when msg like 'Only the person asked to pay%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
           || ' the person who asked cannot use the payer''s view' || E'\n';

    perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', st::text, true);
    set local role authenticated;
    begin perform * from public.get_request_pay_details(req); msg := null;
    exception when others then msg := sqlerrm; end;
    reset role;
    res := res || case when msg like 'Only the person asked to pay%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
           || ' a stranger gets nothing for a request' || E'\n';

    update public.payments set status = 'cancelled', answered_at = now() where id = req;
    perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', ca::text, true);
    set local role authenticated;
    begin perform * from public.get_request_pay_details(req); msg := null;
    exception when others then msg := sqlerrm; end;
    reset role;
    res := res || case when msg like 'Only the person asked to pay%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
           || ' once the request is cancelled the payer gets nothing' || E'\n';
  else
    res := res || 'SKIPPED the chat request checks (every chat already has an open payment)' || E'\n';
  end if;

  -- ---- 4. The QR is gone ------------------------------------------------------------------
  res := res || case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gcash_accounts' and column_name = 'qr_path')
                     then 'PASS' else 'FAIL' end
         || ' the QR column is gone' || E'\n';
  res := res || case when pg_get_function_result('public.get_pay_details(uuid)'::regprocedure) = 'TABLE(initials text, gcash_number text)'
                          and pg_get_function_result('public.get_request_pay_details(uuid)'::regprocedure) = 'TABLE(initials text, gcash_number text)'
                     then 'PASS' else 'FAIL' end
         || ' both "where to pay" functions answer with only initials and number' || E'\n';
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'gcash-qr:%';
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the four QR storage rules are gone' || E'\n';
  res := res || case when not exists (select 1 from storage.buckets where id = 'gcash-qr') then 'PASS' else 'FAIL' end
         || ' the QR bucket is gone' || E'\n';
  res := res || case when exists (select 1 from storage.buckets where id = 'receipts') then 'PASS' else 'FAIL' end
         || ' the receipts bucket is still there' || E'\n';
  res := res || case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'receipts:%') then 'PASS' else 'FAIL' end
         || ' the receipt rules are still there' || E'\n';

  -- ---- no user numbers were used --------------------------------------------------------------
  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL (' || seq_before || ' -> ' || seq_after || ')' end
         || ' the user number counter did not move' || E'\n';

  raise exception E'\n%', res;
end
$t$;
