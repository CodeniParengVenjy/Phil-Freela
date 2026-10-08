-- Test for supabase_admin_profile_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts, acts as each one, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  a uuid := gen_random_uuid();   -- an admin
  b uuid := gen_random_uuid();   -- another admin
  u uuid := gen_random_uuid();   -- a normal user
  r text;
  d timestamptz;
  n text;
begin
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'ap-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[a, b, u]) as x;
  insert into public.admins (id, full_name, username, role) values
    (a, 'Admin A', 'ap_a_test', 'admin'), (b, 'Admin B', 'ap_b_test', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline)
  values (u, 'Normal User', 'ap_u_test', 'male', 'client', false);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- ===== Name: 7 days =====
  perform public.update_my_admin_profile('Admin Renamed', 'ap_a_test');
  reset role; select full_name, name_changed_at, username_changed_at into n, d, r from public.admins where id = a; set local role authenticated;
  res := res || E'\n' || case when n = 'Admin Renamed' and d is not null and r is null then 'PASS  ' else 'FAIL  ' end || '1a. the first name change works, stamps only the name date';

  begin perform public.update_my_admin_profile('Admin Again', 'ap_a_test'); res := res || E'\nFAIL  1b. a second name change went through';
  exception when others then res := res || E'\n' || case when sqlerrm like 'You can change your name again on %' then 'PASS  ' else 'FAIL  ' end || '1b. a second change within 7 days is refused: ' || sqlerrm; end;

  perform public.update_my_admin_profile('Admin Renamed', 'ap_a_test');
  res := res || E'\nPASS  1c. sending the same name again is fine';

  -- ===== Username: 30 days, and the first one is free even right after a name change =====
  perform public.update_my_admin_profile('Admin Renamed', 'ap_a_new');
  reset role; select username into n from public.admins where id = a; set local role authenticated;
  res := res || E'\n' || case when n = 'ap_a_new' then 'PASS  ' else 'FAIL  ' end || '2a. the first username change works';

  begin perform public.update_my_admin_profile('Admin Renamed', 'ap_a_newer'); res := res || E'\nFAIL  2b. a second username change went through';
  exception when others then res := res || E'\n' || case when sqlerrm like 'You can change your username again on %' then 'PASS  ' else 'FAIL  ' end || '2b. a second change within 30 days is refused: ' || sqlerrm; end;

  begin perform public.update_my_admin_profile('Admin Renamed', 'ap_b_test'); res := res || E'\nFAIL  2c. took another admin''s username';
  exception when others then res := res || E'\nPASS  2c. a taken username is refused: ' || sqlerrm; end;

  -- ===== Checks on what is sent =====
  begin perform public.update_my_admin_profile('   ', 'ap_a_new'); res := res || E'\nFAIL  3a. an empty name was accepted';
  exception when others then res := res || E'\nPASS  3a. an empty name is refused'; end;
  begin perform public.update_my_admin_profile(repeat('x', 101), 'ap_a_new'); res := res || E'\nFAIL  3b. a 101-letter name was accepted';
  exception when others then res := res || E'\nPASS  3b. a name over 100 letters is refused'; end;

  -- ===== After the waiting time =====
  reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update public.admins set name_changed_at = now() - interval '8 days', username_changed_at = now() - interval '31 days' where id = a;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.update_my_admin_profile('Admin Third', 'ap_a_third');
  reset role; select full_name || '/' || username into n from public.admins where id = a; set local role authenticated;
  res := res || E'\n' || case when n = 'Admin Third/ap_a_third' then 'PASS  ' else 'FAIL  ' end || '4a. after the waiting times both change again';

  -- A taken username, when the 30 days are not in the way (the earlier check
  -- 2c was stopped by the waiting time first).
  reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update public.admins set username_changed_at = now() - interval '31 days' where id = a;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.update_my_admin_profile('Admin Third', 'ap_b_test'); res := res || E'\nFAIL  4b. took another admin''s username';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That username is already taken.' then 'PASS  ' else 'FAIL  ' end || '4b. a taken username is refused as taken: ' || sqlerrm; end;

  -- ===== Who can use it =====
  begin update public.admins set full_name = 'Direct Edit' where id = a; get diagnostics r = row_count;
    res := res || E'\n' || case when r::int = 0 then 'PASS  ' else 'FAIL  ' end || '5a. a direct update of the admins table changes nothing';
  exception when others then res := res || E'\nPASS  5a. a direct update of the admins table is refused'; end;

  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin perform public.update_my_admin_profile('Hacker', 'hacker'); res := res || E'\nFAIL  5b. a normal user used it';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only admins can change an admin profile.' then 'PASS  ' else 'FAIL  ' end || '5b. a normal user is refused: ' || sqlerrm; end;

  raise exception E'ADMIN PROFILE TESTS (rolled back)%', res;
end
$t$;
