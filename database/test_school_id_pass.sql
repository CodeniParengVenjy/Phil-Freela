-- Test for supabase_school_id_pass_schema.sql and supabase_school_id_pass_rules.sql.
-- Paste this whole file into the Supabase SQL Editor and run it AFTER both
-- files. It makes made-up
-- accounts, acts as each one, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  sa uuid := gen_random_uuid();   -- a super admin
  a1 uuid := gen_random_uuid();   -- a plain admin
  u uuid := gen_random_uuid();    -- the person who gets the pass
  v uuid := gen_random_uuid();    -- someone with no pass
  n int;
  t timestamptz;
begin
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'sp-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[sa, a1, u, v]) as x;
  insert into public.admins (id, full_name, username, role) values
    (sa, 'Super', 'sp_sa_test', 'super_admin'), (a1, 'Admin One', 'sp_a1_test', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (u, 'Pass Person', 'sp_u_test', 'female', 'freelancer', false),
    (v, 'No Pass', 'sp_v_test', 'female', 'freelancer', false);

  set local role authenticated;

  -- ===== A plain admin =====
  perform set_config('request.jwt.claim.sub', a1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  begin perform public.grant_school_id_pass(u); res := res || E'\nFAIL  1a. a plain admin gave a pass';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only a super admin can give a School ID pass.' then 'PASS  ' else 'FAIL  ' end || '1a. a plain admin cannot give a pass: ' || sqlerrm; end;

  -- ===== The super admin =====
  perform set_config('request.jwt.claim.sub', sa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin perform public.grant_school_id_pass(gen_random_uuid()); res := res || E'\nFAIL  2a. a pass for a made-up person';
  exception when others then res := res || E'\nPASS  2a. no pass for someone without a profile'; end;
  t := public.grant_school_id_pass(u);
  res := res || E'\n' || case when t > now() + interval '11 hours 59 minutes' and t <= now() + interval '12 hours 1 minute' then 'PASS  ' else 'FAIL  ' end || '2b. the pass lasts 12 hours';
  select count(*) into n from public.verification_passes;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2c. an admin can read the passes';
  reset role; select count(*) into n from public.user_notifications where user_id = u and type = 'school_id_pass'; set local role authenticated;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2d. she got a notification';
  reset role; select count(*) into n from public.admin_log where target_id = u and message like '%School ID%'; set local role authenticated;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2e. the activity log has a line';
  perform public.grant_school_id_pass(u);
  select count(*) into n from public.verification_passes where user_id = u;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2f. giving it again keeps one pass';

  -- ===== The person with the pass, and the one without =====
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  select count(*) into n from public.verification_passes;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3a. she can read her own pass';
  begin update public.verification_passes set expires_at = now() + interval '30 days'; get diagnostics n = row_count;
    res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3b. she cannot lengthen it (0 rows changed)';
  exception when others then res := res || E'\nPASS  3b. she cannot change her pass'; end;
  begin perform public.cancel_school_id_pass(u); res := res || E'\nFAIL  3c. a user cancelled a pass';
  exception when others then res := res || E'\nPASS  3c. a user cannot cancel a pass'; end;

  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from public.verification_passes;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3d. someone else cannot see her pass';

  -- ===== The database's own check on a School ID request (as the AI service) =====
  reset role;
  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (v, 'school_id', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nFAIL  4a. a School ID request saved with no pass';
  exception when others then res := res || E'\n' || case when sqlerrm like 'You don''t have a School ID pass%' then 'PASS  ' else 'FAIL  ' end || '4a. no pass, no School ID request: ' || sqlerrm; end;

  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (u, 'philsys', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nFAIL  4b. a government ID without a back saved';
  exception when others then res := res || E'\nPASS  4b. a government ID still needs its back photo'; end;

  update public.verification_passes set expires_at = now() - interval '1 minute' where user_id = u;
  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (u, 'school_id', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nFAIL  4c. an expired pass worked';
  exception when others then res := res || E'\nPASS  4c. an expired pass is refused'; end;

  update public.verification_passes set expires_at = now() + interval '5 hours' where user_id = u;
  insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
  values (u, 'school_id', 'x', 'x', 'x', 'x', true, 0.3, true);
  select count(*) into n from public.verification_passes where user_id = u and used_at is not null;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4d. a valid pass lets a School ID request in, with no back photo, and is used up';

  -- ===== Back as the super admin =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', sa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin perform public.grant_school_id_pass(u); res := res || E'\nFAIL  5a. a pass for someone with a request waiting';
  exception when others then res := res || E'\n' || case when sqlerrm like 'That person already has a verification waiting%' then 'PASS  ' else 'FAIL  ' end || '5a. no new pass while a request waits: ' || sqlerrm; end;
  begin perform public.cancel_school_id_pass(u); res := res || E'\nFAIL  5b. cancelled a used pass';
  exception when others then res := res || E'\nPASS  5b. a used pass cannot be cancelled'; end;

  perform public.grant_school_id_pass(v);
  perform public.cancel_school_id_pass(v);
  reset role; select count(*) into n from public.verification_passes where user_id = v and expires_at <= now(); set local role authenticated;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '5c. a super admin cancels an unused pass (it ends right away)';
  reset role;
  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (v, 'school_id', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nFAIL  5d. a cancelled pass still worked';
  exception when others then res := res || E'\nPASS  5d. a cancelled pass is refused'; end;

  raise exception E'SCHOOL ID PASS TESTS (rolled back)%', res;
end
$t$;
