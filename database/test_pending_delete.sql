-- Test for supabase_pending_delete_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file (or send the schema file
-- and this block together in one call to try it before applying: the error at
-- the end rolls the schema back too). It makes made-up logins in auth.users (no
-- profiles, so no user numbers are used up) and BORROWS a real admin, a real
-- user with a profile and a real confirmed account only to act as them or to
-- check they are never deleted. It ends with an error that carries the PASS/FAIL
-- list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  adm uuid;                      -- a real admin, borrowed to act as
  adm_name text;
  normal uuid;                   -- a real user with a profile, borrowed
  u1 uuid := gen_random_uuid();  -- never confirmed, has a name (can be deleted)
  u2 uuid := gen_random_uuid();  -- never confirmed, no sign-up details (can be deleted)
  u3 uuid := gen_random_uuid();  -- never confirmed, stays (must survive the others)
  u4 uuid := gen_random_uuid();  -- confirmed, no profile (must be refused)
  u5 uuid := gen_random_uuid();  -- a new admin who never confirmed (must be refused)
  users_before int;
  pending_before int;
  n int;
  seq_before bigint;
  seq_after bigint;
  logline text;
begin
  select id, full_name into adm, adm_name from public.admins where not must_change_password limit 1;
  select p.id into normal from public.profiles p where not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  if adm is null or normal is null then
    raise exception 'The test needs one real admin and one real user with a profile.';
  end if;

  select last_value into seq_before from public.user_number_seq;
  select count(*) into users_before from auth.users;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into pending_before from public.admin_pending_users();

  insert into auth.users (id, email, aud, role, created_at, confirmation_sent_at, email_confirmed_at, raw_user_meta_data) values
    (u1, 'pd1-' || left(u1::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(), now(), null,
     '{"full_name":"Pending Delete One","username":"pd_one_test","account_type":"client"}'::jsonb),
    (u2, 'pd2-' || left(u2::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(), null, null,
     '{}'::jsonb),
    (u3, 'pd3-' || left(u3::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(), now(), null,
     '{"full_name":"Pending Delete Three","username":"pd_three_test","account_type":"freelancer"}'::jsonb),
    (u4, 'pd4-' || left(u4::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(), now(), now(),
     '{"full_name":"Confirmed Four","username":"pd_four_test","account_type":"client"}'::jsonb),
    (u5, 'pd5-' || left(u5::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(), now(), null,
     '{"full_name":"New Admin Five","username":"pd_five_test"}'::jsonb);
  insert into public.admins (id, full_name, username, role) values (u5, 'New Admin Five', 'pd_five_test', 'admin');

  -- 1. An admin deletes a pending person.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  perform public.admin_delete_pending_user(u1);
  reset role;   -- a signed-in user can't read auth.users, so the checks below read as the owner
  select count(*) into n from auth.users where id = u1;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '1a. the pending login is gone';
  select count(*) into n from public.admin_pending_users() l where l.id = u1;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '1b. and it no longer shows on the Pending Users list';
  select count(*) into n from public.admin_pending_users() l where l.id in (u2, u3);
  res := res || E'\n' || case when n = 2 then 'PASS  ' else 'FAIL  ' end || '1c. the other pending people are still listed';
  select count(*) into n from public.admin_pending_users();
  res := res || E'\n' || case when n = pending_before + 2 then 'PASS  ' else 'FAIL  ' end || '1d. the list is two longer than before the test (' || n || ', was ' || pending_before || '): three added, one deleted';

  select message into logline from public.admin_log
  where action = 'user_delete' and message like '%pd1-' || left(u1::text, 8) || '@example.invalid%'
  order by created_at desc limit 1;
  res := res || E'\n' || case when logline = adm_name || ' deleted the pending sign-up of Pending Delete One (pd1-' || left(u1::text, 8) || '@example.invalid).' then 'PASS  ' else 'FAIL  ' end || '1e. the Activity Log has one line saying who deleted whom: ' || coalesce(logline, '(none)');

  -- A sign-up with no details still works, and the log says "no name".
  set local role authenticated;
  perform public.admin_delete_pending_user(u2);
  reset role;
  select count(*) into n from auth.users where id = u2;
  select message into logline from public.admin_log
  where action = 'user_delete' and message like '%pd2-' || left(u2::text, 8) || '@example.invalid%'
  order by created_at desc limit 1;
  res := res || E'\n' || case when n = 0 and logline like '%someone with no name%' then 'PASS  ' else 'FAIL  ' end || '1f. a sign-up with no name deletes too, and the log says "someone with no name"';

  -- 2. The same person twice, and people who must never be deleted here.
  set local role authenticated;
  begin perform public.admin_delete_pending_user(u1); res := res || E'\nFAIL  2a. deleting the same person twice worked';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That person is no longer waiting on a confirmation email.' then 'PASS  ' else 'FAIL  ' end || '2a. deleting the same person again is refused: ' || sqlerrm; end;

  begin perform public.admin_delete_pending_user(u4); res := res || E'\nFAIL  2b. a confirmed person was deleted';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That person is no longer waiting on a confirmation email.' then 'PASS  ' else 'FAIL  ' end || '2b. a person who already confirmed is refused: ' || sqlerrm; end;

  begin perform public.admin_delete_pending_user(u5); res := res || E'\nFAIL  2c. an admin was deleted';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That person is no longer waiting on a confirmation email.' then 'PASS  ' else 'FAIL  ' end || '2c. a new admin who has not confirmed is refused: ' || sqlerrm; end;

  begin perform public.admin_delete_pending_user(normal); res := res || E'\nFAIL  2d. a real user with a profile was deleted';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That person is no longer waiting on a confirmation email.' then 'PASS  ' else 'FAIL  ' end || '2d. a real user with a profile is refused: ' || sqlerrm; end;

  begin perform public.admin_delete_pending_user(adm); res := res || E'\nFAIL  2e. a real admin was deleted';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That person is no longer waiting on a confirmation email.' then 'PASS  ' else 'FAIL  ' end || '2e. a real admin is refused: ' || sqlerrm; end;

  begin perform public.admin_delete_pending_user(gen_random_uuid()); res := res || E'\nFAIL  2f. a made-up id worked';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That person is no longer waiting on a confirmation email.' then 'PASS  ' else 'FAIL  ' end || '2f. an id that does not exist is refused: ' || sqlerrm; end;

  reset role;
  select count(*) into n from auth.users where id in (u3, u4, u5, normal, adm);
  res := res || E'\n' || case when n = 5 then 'PASS  ' else 'FAIL  ' end || '2g. nobody who was refused (or was not picked) is gone: ' || n || ' of 5 still there';

  -- 3. Nobody else can use it.
  perform set_config('request.jwt.claim.sub', normal::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', normal, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_delete_pending_user(u3); res := res || E'\nFAIL  3a. a normal user deleted a pending person';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only admins can delete pending users.' then 'PASS  ' else 'FAIL  ' end || '3a. a normal user is refused: ' || sqlerrm; end;

  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin perform public.admin_delete_pending_user(u3); res := res || E'\nFAIL  3b. a signed-out visitor deleted a pending person';
  exception when others then res := res || E'\n' || case when sqlstate = '42501' then 'PASS  ' else 'FAIL  ' end || '3b. a signed-out visitor cannot even call it: ' || sqlerrm; end;

  -- 4. Nothing else was touched.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from auth.users where id = u3;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4a. the pending person nobody deleted is still there';
  select count(*) into n from auth.users;
  res := res || E'\n' || case when n = users_before + 3 then 'PASS  ' else 'FAIL  ' end || '4b. the logins are three more than before the test (' || n || ', was ' || users_before || '): five added, two deleted';
  select last_value into seq_after from public.user_number_seq;
  res := res || E'\n' || case when seq_after = seq_before then 'PASS  ' else 'FAIL  ' end || '4c. no user numbers were used up (' || seq_before || ' before, ' || seq_after || ' after)';

  raise exception E'PENDING DELETE TESTS (rolled back)%', res;
end
$t$;
