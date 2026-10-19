-- Test for supabase_pending_users_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file (or send the schema file
-- and this block together in one call to try it before applying: the error at
-- the end rolls the schema back too). It makes made-up logins in auth.users (no
-- profiles, so no user numbers are used up) and BORROWS a real admin, a real
-- user with a profile and a real confirmed account only to act as them or to
-- check they are left out. It ends with an error that carries the PASS/FAIL
-- list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  adm uuid;                      -- a real admin, borrowed to act as
  normal uuid;                   -- a real user with a profile, borrowed
  u1 uuid := gen_random_uuid();  -- signed up as a client, never confirmed (listed)
  u2 uuid := gen_random_uuid();  -- signed up as a freelancer, older, never confirmed (listed)
  u3 uuid := gen_random_uuid();  -- sign-up details missing, never confirmed (listed, with defaults)
  u4 uuid := gen_random_uuid();  -- confirmed, no profile (NOT listed)
  u5 uuid := gen_random_uuid();  -- a new admin who never confirmed (NOT listed)
  before_n int;
  stats json;
  ids uuid[];
  r record;
  n int;
  ok boolean;
begin
  select id into adm from public.admins where not must_change_password limit 1;
  select p.id into normal from public.profiles p where not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  if adm is null or normal is null then
    raise exception 'The test needs one real admin and one real user with a profile.';
  end if;

  -- The number of real pending people before the test accounts are added.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into before_n from public.admin_pending_users();

  insert into auth.users (id, email, aud, role, created_at, confirmation_sent_at, email_confirmed_at, raw_user_meta_data) values
    (u1, 'pu1-' || left(u1::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(), now() - interval '5 minutes', null,
     '{"full_name":"Pending One","username":"pu_one_test","gender":"male","account_type":"client"}'::jsonb),
    (u2, 'pu2-' || left(u2::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() - interval '2 days', now() - interval '2 days', null,
     '{"full_name":"Pending Two","username":"pu_two_test","gender":"female","account_type":"freelancer"}'::jsonb),
    (u3, 'pu3-' || left(u3::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() - interval '3 days', null, null,
     '{}'::jsonb),
    (u4, 'pu4-' || left(u4::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(), now(), now(),
     '{"full_name":"Confirmed Four","username":"pu_four_test","gender":"male","account_type":"client"}'::jsonb),
    (u5, 'pu5-' || left(u5::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(), now(), null,
     '{"full_name":"New Admin Five","username":"pu_five_test"}'::jsonb);
  insert into public.admins (id, full_name, username, role) values (u5, 'New Admin Five', 'pu_five_test', 'admin');

  -- 1. An admin sees the right people, in the right order.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  select array_agg(l.id order by l.created_at desc) into ids from public.admin_pending_users() l;
  select count(*) into n from public.admin_pending_users();
  res := res || E'\n' || case when n = before_n + 3 then 'PASS  ' else 'FAIL  ' end || '1a. three more people are listed (' || n || ', was ' || before_n || ' before): the ones who never confirmed';
  res := res || E'\n' || case when u1 = any(ids) and u2 = any(ids) and u3 = any(ids) then 'PASS  ' else 'FAIL  ' end || '1b. all three unconfirmed test logins are in the list';
  res := res || E'\n' || case when not (u4 = any(ids)) then 'PASS  ' else 'FAIL  ' end || '1c. a confirmed login without a profile is left out';
  res := res || E'\n' || case when not (u5 = any(ids)) then 'PASS  ' else 'FAIL  ' end || '1d. an admin who has not confirmed is left out';
  res := res || E'\n' || case when not (normal = any(ids)) and not (adm = any(ids)) then 'PASS  ' else 'FAIL  ' end || '1e. a real user with a profile and a real admin are left out';
  res := res || E'\n' || case when array_position(ids, u1) < array_position(ids, u2) and array_position(ids, u2) < array_position(ids, u3) then 'PASS  ' else 'FAIL  ' end || '1f. newest sign-up first';

  select * into r from public.admin_pending_users() l where l.id = u1;
  res := res || E'\n' || case when r.full_name = 'Pending One' and r.username = 'pu_one_test' and r.account_type = 'client' and r.email like 'pu1-%@example.invalid' and r.confirmation_sent_at is not null then 'PASS  ' else 'FAIL  ' end || '1g. the sign-up details, the email and the last-email time come through';
  select * into r from public.admin_pending_users() l where l.id = u2;
  res := res || E'\n' || case when r.account_type = 'freelancer' then 'PASS  ' else 'FAIL  ' end || '1h. a freelancer sign-up shows as a freelancer';
  select * into r from public.admin_pending_users() l where l.id = u3;
  res := res || E'\n' || case when r.full_name = '' and r.username = '' and r.account_type = 'client' and r.confirmation_sent_at is null then 'PASS  ' else 'FAIL  ' end || '1i. missing sign-up details give blanks and the client default, and no email sent shows as empty';

  -- 2. The Overview number matches the list.
  stats := public.admin_stats();
  res := res || E'\n' || case when (stats->>'pending_users')::int = before_n + 3 then 'PASS  ' else 'FAIL  ' end || '2a. admin_stats pending_users counts the same people (' || (stats->>'pending_users') || ')';
  res := res || E'\n' || case when stats->>'total_users' is not null and stats->>'online_users' is not null and stats->>'verified_users' is not null and stats->>'open_reports' is not null and stats->>'admins' is not null then 'PASS  ' else 'FAIL  ' end || '2b. the numbers that were already there are still there';

  -- 3. Nobody else can use them.
  perform set_config('request.jwt.claim.sub', normal::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', normal, 'role', 'authenticated')::text, true);
  begin perform * from public.admin_pending_users(); res := res || E'\nFAIL  3a. a normal user read the pending list';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only admins can view pending users.' then 'PASS  ' else 'FAIL  ' end || '3a. a normal user is refused: ' || sqlerrm; end;
  begin perform public.admin_stats(); res := res || E'\nFAIL  3b. a normal user read the stats';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only admins can view stats.' then 'PASS  ' else 'FAIL  ' end || '3b. a normal user is still refused the stats: ' || sqlerrm; end;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin perform * from public.admin_pending_users(); res := res || E'\nFAIL  3c. a signed-out visitor read the pending list';
  exception when others then res := res || E'\n' || case when sqlstate = '42501' then 'PASS  ' else 'FAIL  ' end || '3c. a signed-out visitor cannot even call it: ' || sqlerrm; end;

  raise exception E'PENDING USERS TESTS (rolled back)%', res;
end
$t$;
