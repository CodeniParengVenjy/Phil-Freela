-- Test for supabase_admin_stats_verified_schema.sql. Paste this whole file into
-- the Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts and ends with an error that carries the PASS/FAIL list; that error
-- rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  a uuid := gen_random_uuid();   -- an admin
  u1 uuid := gen_random_uuid();  -- verified
  u2 uuid := gen_random_uuid();  -- verification still pending
  u3 uuid := gen_random_uuid();  -- never verified
  before_n int;
  stats json;
begin
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'vs-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[a, u1, u2, u3]) as x;
  insert into public.admins (id, full_name, username, role) values (a, 'Stats Admin', 'vs_admin_test', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (u1, 'Verified One', 'vs_u1_test', 'male', 'client', false),
    (u2, 'Pending Two', 'vs_u2_test', 'female', 'freelancer', false),
    (u3, 'Plain Three', 'vs_u3_test', 'male', 'client', false);

  select count(distinct user_id) into before_n from public.identity_verifications where status = 'approved';

  insert into public.identity_verifications (user_id, id_type, id_photo_path, id_back_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed, status) values
    (u1, 'philsys', 'x', 'x', 'x', 'x', 'x', true, 0.3, true, 'approved'),
    (u2, 'philsys', 'x', 'x', 'x', 'x', 'x', true, 0.3, true, 'pending');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  stats := public.admin_stats();
  res := res || E'\n' || case when (stats->>'verified_users')::int = before_n + 1 then 'PASS  ' else 'FAIL  ' end || '1a. verified_users counts only the approved one (' || (stats->>'verified_users') || ', was ' || before_n || ' before)';
  res := res || E'\n' || case when stats->>'total_users' is not null and stats->>'online_users' is not null and stats->>'open_reports' is not null and stats->>'admins' is not null then 'PASS  ' else 'FAIL  ' end || '1b. the numbers that were already there are still there';

  perform set_config('request.jwt.claim.sub', u3::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  begin perform public.admin_stats(); res := res || E'\nFAIL  2a. a normal user read the stats';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only admins can view stats.' then 'PASS  ' else 'FAIL  ' end || '2a. a normal user is still refused: ' || sqlerrm; end;

  raise exception E'ADMIN STATS (VERIFIED) TESTS (rolled back)%', res;
end
$t$;
