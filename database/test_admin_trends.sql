-- Test for supabase_admin_trends_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It borrows an existing
-- admin, an existing normal user and one existing service (no accounts are
-- made, so no user numbers are used) and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res       text := '';
  adm       uuid;
  usr       uuid;
  svc       uuid;
  t         jsonb;
  today     date := (now() at time zone 'Asia/Manila')::date;
  start90   timestamptz := (((now() at time zone 'Asia/Manila')::date - 89)::timestamp at time zone 'Asia/Manila');
  d_before  int;
  d_after   int;
  e_before  int;
  e_after   int;
  got       int;
  want      int;
  refused   boolean;
begin
  select id into adm from public.admins where not must_change_password limit 1;
  select p.id into usr from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  select id into svc from public.services limit 1;
  if adm is null or usr is null or svc is null then
    raise exception 'Needs one admin, one normal user and one service already in the database.';
  end if;

  -- ---- act as the admin --------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. How many days come back
  res := res || case when json_array_length(public.admin_trends()) = 30 then 'PASS' else 'FAIL' end
         || ' default is 30 days' || E'\n';
  res := res || case when json_array_length(public.admin_trends(7)) = 7 then 'PASS' else 'FAIL' end
         || ' 7 days' || E'\n';
  res := res || case when json_array_length(public.admin_trends(90)) = 90 then 'PASS' else 'FAIL' end
         || ' 90 days' || E'\n';
  res := res || case when json_array_length(public.admin_trends(0)) = 1 then 'PASS' else 'FAIL' end
         || ' 0 is raised to 1 day' || E'\n';
  res := res || case when json_array_length(public.admin_trends(100000)) = 365 then 'PASS' else 'FAIL' end
         || ' a huge number is cut to 365' || E'\n';
  res := res || case when json_array_length(public.admin_trends(null)) = 30 then 'PASS' else 'FAIL' end
         || ' null falls back to 30' || E'\n';

  -- 2. The days: oldest first, today last, no gaps
  t := public.admin_trends(30)::jsonb;
  res := res || case when (t -> 29 ->> 'day')::date = today then 'PASS' else 'FAIL' end
         || ' last day is today (Philippine time)' || E'\n';
  res := res || case when (t -> 0 ->> 'day')::date = today - 29 then 'PASS' else 'FAIL' end
         || ' first day is 29 days before' || E'\n';
  select count(*) into got
    from jsonb_array_elements(t) with ordinality as e(v, i)
   where (e.v ->> 'day')::date <> today - 29 + (e.i - 1)::int;
  res := res || case when got = 0 then 'PASS' else 'FAIL' end || ' every day follows the one before' || E'\n';

  -- 3. Every entry has all six numbers, none missing or negative
  select count(*) into got
    from jsonb_array_elements(t) e(v),
         unnest(array['freelancers','clients','services','job_posts','reports','verifications']) k
   where e.v ->> k is null or (e.v ->> k)::int < 0;
  res := res || case when got = 0 then 'PASS' else 'FAIL' end || ' all six numbers present and not negative' || E'\n';

  -- 4. The totals match counting the tables directly (read as the owner)
  t := public.admin_trends(90)::jsonb;
  reset role;
  select count(*) into want from public.profiles p
   where p.account_type = 'freelancer' and p.created_at >= start90
     and not exists (select 1 from public.archived_users a where a.user_id = p.id);
  select coalesce(sum((e ->> 'freelancers')::int), 0) into got from jsonb_array_elements(t) e;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end || ' freelancers add up' || E'\n';

  select count(*) into want from public.profiles p
   where p.account_type = 'client' and p.created_at >= start90
     and not exists (select 1 from public.archived_users a where a.user_id = p.id);
  select coalesce(sum((e ->> 'clients')::int), 0) into got from jsonb_array_elements(t) e;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end || ' clients add up' || E'\n';

  select count(*) into want from public.services where created_at >= start90;
  select coalesce(sum((e ->> 'services')::int), 0) into got from jsonb_array_elements(t) e;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end || ' services add up' || E'\n';

  select count(*) into want from public.job_posts where created_at >= start90;
  select coalesce(sum((e ->> 'job_posts')::int), 0) into got from jsonb_array_elements(t) e;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end || ' job posts add up' || E'\n';

  select count(*) into want from public.reports where created_at >= start90;
  select coalesce(sum((e ->> 'reports')::int), 0) into got from jsonb_array_elements(t) e;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end || ' reports add up' || E'\n';

  select count(*) into want from public.identity_verifications iv
   where iv.created_at >= start90
     and not exists (select 1 from public.archived_users a where a.user_id = iv.user_id);
  select coalesce(sum((e ->> 'verifications')::int), 0) into got from jsonb_array_elements(t) e;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end || ' verifications add up' || E'\n';

  -- 5. Moving one service to a chosen time lands it on the right Philippine day.
  --    Just before midnight belongs to that day; just after midnight to the next.
  update public.services set created_at = (today - 5)::timestamp at time zone 'Asia/Manila' + interval '23 hours 59 minutes' where id = svc;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.admin_trends(10)::jsonb;
  select (e ->> 'services')::int into d_before from jsonb_array_elements(t) e where (e ->> 'day')::date = today - 5;
  select (e ->> 'services')::int into e_before from jsonb_array_elements(t) e where (e ->> 'day')::date = today - 4;
  reset role;
  update public.services set created_at = (today - 4)::timestamp at time zone 'Asia/Manila' + interval '1 minute' where id = svc;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.admin_trends(10)::jsonb;
  select (e ->> 'services')::int into d_after from jsonb_array_elements(t) e where (e ->> 'day')::date = today - 5;
  select (e ->> 'services')::int into e_after from jsonb_array_elements(t) e where (e ->> 'day')::date = today - 4;
  res := res || case when d_before >= 1 and d_after = d_before - 1 and e_after = e_before + 1
                     then 'PASS' else 'FAIL' end
         || ' 23:59 counts on its day, 00:01 on the next (before ' || d_before || '/' || e_before
         || ', after ' || d_after || '/' || e_after || ')' || E'\n';

  -- ---- a normal user and the signed-out visitor are refused ---------------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin
    perform public.admin_trends(30);
  exception when others then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a normal user is refused' || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  refused := false;
  begin
    perform public.admin_trends(30);
  exception when others then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a signed-out visitor is refused' || E'\n';
  reset role;

  raise exception E'ADMIN TRENDS TEST RESULTS:\n%', res;
end;
$t$;
