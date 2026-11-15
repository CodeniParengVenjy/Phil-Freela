-- Rolled-back test of supabase_agency_reason_schema.sql (2026-11-15): run after the
-- schema file. It ends with raise exception, so nothing it adds is kept; the
-- PASS/FAIL lines come back in the error message. Result on the live database
-- before applying: 4/4 PASS.

do $$
declare
  out text := '';
  fl uuid; cl uuid; adm uuid; rid uuid; logline text;
begin
  select id into fl from public.profiles p where account_type = 'freelancer'
    and not exists (select 1 from public.user_suspensions s where s.user_id = p.id)
    and not exists (select 1 from public.reports r where r.target_id = p.id)
    order by created_at limit 1;
  select id into cl from public.profiles where account_type = 'client' order by created_at limit 1;
  select id into adm from public.admins limit 1;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
    values (cl, 'user', fl, 'agency', 'Someone else answered the video call.') returning id into rid;
  out := out || E'\nPASS a report with reason agency is accepted';

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason) values (cl, 'service', fl, 'agencyy');
    out := out || E'\nFAIL an unknown reason was accepted';
  exception when check_violation then
    out := out || E'\nPASS an unknown reason is still refused';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  insert into public.user_suspensions (user_id, reason, violation, suspended_by, ends_at, blocks_posting, blocks_messaging)
    values (fl, 'Agency / shared account', 'agency', adm, now() + interval '14 days', true, false);
  out := out || E'\nPASS a suspension with violation agency is accepted';

  select message into logline from public.admin_log where target_id = fl order by created_at desc limit 1;
  out := out || E'\n' || case when logline like '%(Agency / shared account)%' then 'PASS' else 'FAIL' end || ' the admin log names it: ' || coalesce(logline, '(none)');

  raise exception 'TEST RESULTS (rolled back):%', out;
end $$;
