-- Test for supabase_ephilid.sql. Run it AFTER that file (SQL Editor or the
-- connector). It makes made-up accounts, tries the ID types, and ends with an
-- error that carries the PASS/FAIL list; that error rolls everything back, so
-- nothing is left behind.
do $t$
declare
  res text := '';
  u1 uuid := gen_random_uuid();   -- ePhilID with both photos
  u2 uuid := gen_random_uuid();   -- PhilSys card with both photos
  u3 uuid := gen_random_uuid();   -- passport without a back
  u4 uuid := gen_random_uuid();   -- the refused requests
  def text;
begin
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'ep-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[u1, u2, u3, u4]) as x;
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (u1, 'Ephil Tester', 'ep_t1_test', 'female', 'freelancer', false),
    (u2, 'Philsys Tester', 'ep_t2_test', 'female', 'freelancer', false),
    (u3, 'Passport Tester', 'ep_t3_test', 'female', 'freelancer', false),
    (u4, 'Refused Tester', 'ep_t4_test', 'female', 'freelancer', false);

  -- 1. An ePhilID request with its front and back is accepted.
  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, id_back_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (u1, 'ephilid', 'x', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nPASS  1. an ePhilID request with front and back is saved';
  exception when others then res := res || E'\nFAIL  1. an ePhilID request was refused: ' || sqlerrm; end;

  -- 2. ...but not without the back (the ePhilID has a printed back, unlike a passport).
  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (u4, 'ephilid', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nFAIL  2. an ePhilID request without a back was saved';
  exception when others then res := res || E'\n' || case when sqlerrm like '%identity_verifications_back_required%' then 'PASS  ' else 'FAIL  ' end || '2. an ePhilID still needs its back photo: ' || sqlerrm; end;

  -- 3. The old types still work: a PhilSys card with both sides, a passport with one photo.
  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, id_back_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (u2, 'philsys', 'x', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nPASS  3a. a PhilSys card request is still saved';
  exception when others then res := res || E'\nFAIL  3a. a PhilSys card request was refused: ' || sqlerrm; end;
  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (u3, 'passport', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nPASS  3b. a passport request without a back is still saved';
  exception when others then res := res || E'\nFAIL  3b. a passport request was refused: ' || sqlerrm; end;

  -- 4. A made-up ID type is still refused.
  begin
    insert into public.identity_verifications (user_id, id_type, id_photo_path, id_back_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed)
    values (u4, 'bogus_id', 'x', 'x', 'x', 'x', 'x', true, 0.3, true);
    res := res || E'\nFAIL  4. a made-up ID type was saved';
  exception when others then res := res || E'\n' || case when sqlerrm like '%identity_verifications_id_type_check%' then 'PASS  ' else 'FAIL  ' end || '4. a made-up ID type is refused: ' || sqlerrm; end;

  -- 5. The list still holds every older type (nothing was lost in the swap).
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'identity_verifications_id_type_check' and conrelid = 'public.identity_verifications'::regclass;
  res := res || E'\n' || case when def like '%philsys%' and def like '%ephilid%' and def like '%drivers_license%' and def like '%passport%' and def like '%umid%' and def like '%prc%' and def like '%school_id%' then 'PASS  ' else 'FAIL  ' end || '5. the rule lists all seven types';

  raise exception E'EPHILID TESTS (rolled back)%', res;
end
$t$;
