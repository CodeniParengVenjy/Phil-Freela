-- Test for supabase_admin_switch_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts, acts as each one, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  a uuid := gen_random_uuid();   -- an admin
  b uuid := gen_random_uuid();   -- another admin
  u uuid := gen_random_uuid();   -- a's own user account
  v uuid := gen_random_uuid();   -- another user account
  w uuid := gen_random_uuid();   -- an account with no profile yet
  code text;
  code2 text;
  n int;
  s text;
  o uuid;
begin
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'sw-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[a, b, u, v, w]) as x;
  insert into public.admins (id, full_name, username, role) values (a, 'Admin A', 'sw_a_test', 'admin'), (b, 'Admin B', 'sw_b_test', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (u, 'User U', 'sw_u_test', 'male', 'client', false), (v, 'User V', 'sw_v_test', 'female', 'freelancer', false);

  set local role authenticated;

  -- ===== Getting a code =====
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin perform public.make_admin_link_code(); res := res || E'\nFAIL  1a. a normal user got a link code';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only admins can link a user account.' then 'PASS  ' else 'FAIL  ' end || '1a. a normal user cannot get a code: ' || sqlerrm; end;

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  code := public.make_admin_link_code();
  res := res || E'\n' || case when length(code) >= 32 then 'PASS  ' else 'FAIL  ' end || '1b. an admin gets a long one-time code';

  -- ===== Claiming it =====
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin perform public.claim_admin_link('not-the-code'); res := res || E'\nFAIL  2a. a wrong code linked an account';
  exception when others then res := res || E'\nPASS  2a. a wrong code is refused: ' || sqlerrm; end;

  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin perform public.claim_admin_link(code); res := res || E'\nFAIL  2b. an admin login claimed a link';
  exception when others then res := res || E'\n' || case when sqlerrm like 'That is an admin login%' then 'PASS  ' else 'FAIL  ' end || '2b. an admin login cannot be the user side: ' || sqlerrm; end;

  perform set_config('request.jwt.claim.sub', w::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  begin perform public.claim_admin_link(code); res := res || E'\nFAIL  2c. an account with no profile linked';
  exception when others then res := res || E'\n' || case when sqlerrm like 'That account has no PhilFreela profile%' then 'PASS  ' else 'FAIL  ' end || '2c. an account with no profile is refused: ' || sqlerrm; end;

  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform public.claim_admin_link(code);
  select side, other_id into s, o from public.my_link();
  res := res || E'\n' || case when s = 'user' and o = a then 'PASS  ' else 'FAIL  ' end || '2d. the user account is linked and sees the admin as the other side';

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select side, other_id, other_name into s, o, code2 from public.my_link();
  res := res || E'\n' || case when s = 'admin' and o = u and code2 = 'User U' then 'PASS  ' else 'FAIL  ' end || '2e. the admin sees their user account (id and name) as the other side';

  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  begin perform public.claim_admin_link(code); res := res || E'\nFAIL  2f. a used code worked again';
  exception when others then res := res || E'\n' || case when sqlerrm like 'That link code is wrong or has run out%' then 'PASS  ' else 'FAIL  ' end || '2f. a used code does not work twice: ' || sqlerrm; end;
  select count(*) into n from public.my_link();
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '2g. someone not linked sees nothing';

  -- ===== One admin per user account =====
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  code2 := public.make_admin_link_code();
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin perform public.claim_admin_link(code2); res := res || E'\nFAIL  3a. one user account linked to two admins';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That account is already linked to another admin.' then 'PASS  ' else 'FAIL  ' end || '3a. a user account already linked to one admin is refused for another: ' || sqlerrm; end;

  -- ===== An admin who links again replaces the old link =====
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  code := public.make_admin_link_code();
  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform public.claim_admin_link(code);
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  select count(*) into n from public.my_link();
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '4a. the old user account is no longer linked';
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select other_id into o from public.my_link();
  res := res || E'\n' || case when o = v then 'PASS  ' else 'FAIL  ' end || '4b. the admin is now linked to the new account';

  -- ===== Nobody reads or writes the tables directly =====
  begin perform count(*) from public.admin_user_links; res := res || E'\nFAIL  5a. a signed-in admin read the links table';
  exception when others then res := res || E'\nPASS  5a. the links table is closed to the browser'; end;
  begin perform count(*) from public.admin_link_codes; res := res || E'\nFAIL  5b. a signed-in admin read the codes table';
  exception when others then res := res || E'\nPASS  5b. the codes table is closed to the browser'; end;

  -- ===== Unlinking =====
  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform public.unlink_my_account();
  select count(*) into n from public.my_link();
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '6a. the user account can undo the link';
  begin perform public.unlink_my_account(); res := res || E'\nFAIL  6b. unlinked twice';
  exception when others then res := res || E'\nPASS  6b. unlinking when not linked is refused'; end;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into n from public.my_link();
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '6c. the admin side shows nothing after it is undone';

  -- ===== The activity log =====
  reset role;
  select count(*) into n from public.admin_log where admin_id = a and message like '% linked their user account.';
  res := res || E'\n' || case when n = 2 then 'PASS  ' else 'FAIL  ' end || '7a. two "linked" lines in the activity log (n=' || n || ')';
  select count(*) into n from public.admin_log where admin_id = a and message like '%unlinked their user account%';
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '7b. one "unlinked" line in the activity log';

  raise exception E'ADMIN SWITCH TESTS (rolled back)%', res;
end
$t$;
