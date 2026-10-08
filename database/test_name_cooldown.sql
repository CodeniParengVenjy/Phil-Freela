-- Test for supabase_name_cooldown_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes a made-up
-- account, acts as that person, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  u uuid := gen_random_uuid();
  d timestamptz;
  n text;
begin
  insert into auth.users (id, email, aud, role, created_at)
  values (u, 'nc-' || left(u::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline)
  values (u, 'First Name', 'nc_first', 'female', 'freelancer', false);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  -- ===== Name: 7 days =====
  update public.profiles set description = 'hello' where id = u;
  reset role; select name_changed_at into d from public.profiles where id = u; set local role authenticated;
  res := res || E'\n' || case when d is null then 'PASS  ' else 'FAIL  ' end || '1a. editing something else does not start a cooldown';

  update public.profiles set full_name = 'Second Name' where id = u;
  reset role; select name_changed_at into d from public.profiles where id = u; set local role authenticated;
  res := res || E'\n' || case when d is not null then 'PASS  ' else 'FAIL  ' end || '1b. the first name change is allowed and stamped';

  begin
    update public.profiles set full_name = 'Third Name' where id = u;
    res := res || E'\nFAIL  1c. a second name change went through';
  exception when others then
    res := res || E'\n' || case when sqlerrm like 'You can change your name again on %' then 'PASS  ' else 'FAIL  ' end || '1c. a second change within 7 days is refused: ' || sqlerrm;
  end;

  update public.profiles set name_changed_at = null where id = u;
  begin
    update public.profiles set full_name = 'Third Name' where id = u;
    res := res || E'\nFAIL  1d. clearing the date got around the cooldown';
  exception when others then res := res || E'\nPASS  1d. sending a fake date does not unlock the name';
  end;

  update public.profiles set full_name = 'Second Name' where id = u;
  select full_name into n from public.profiles where id = u;
  res := res || E'\n' || case when n = 'Second Name' then 'PASS  ' else 'FAIL  ' end || '1e. saving the same name again is fine';

  -- Acting as the owner: clear the pretend login too, or the trigger would still
  -- see this person and undo the date change.
  reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update public.profiles set name_changed_at = now() - interval '8 days' where id = u; set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  update public.profiles set full_name = 'Third Name' where id = u;
  select full_name into n from public.profiles where id = u;
  res := res || E'\n' || case when n = 'Third Name' then 'PASS  ' else 'FAIL  ' end || '1f. after 7 days the name can change again';

  -- ===== Username: 30 days =====
  update public.profiles set username = 'nc_second' where id = u;
  reset role; select username_changed_at into d from public.profiles where id = u; set local role authenticated;
  res := res || E'\n' || case when d is not null then 'PASS  ' else 'FAIL  ' end || '2a. the first username change is allowed and stamped';

  begin
    update public.profiles set username = 'nc_third' where id = u;
    res := res || E'\nFAIL  2b. a second username change went through';
  exception when others then
    res := res || E'\n' || case when sqlerrm like 'You can change your username again on %' then 'PASS  ' else 'FAIL  ' end || '2b. a second change within 30 days is refused: ' || sqlerrm;
  end;

  reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update public.profiles set username_changed_at = now() - interval '29 days' where id = u; set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin
    update public.profiles set username = 'nc_third' where id = u;
    res := res || E'\nFAIL  2c. changed at 29 days';
  exception when others then res := res || E'\nPASS  2c. still locked at 29 days'; end;

  reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update public.profiles set username_changed_at = now() - interval '31 days' where id = u; set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  update public.profiles set username = 'nc_third' where id = u;
  select username into n from public.profiles where id = u;
  res := res || E'\n' || case when n = 'nc_third' then 'PASS  ' else 'FAIL  ' end || '2d. after 30 days the username can change again';

  -- ===== The backend / SQL Editor is not blocked =====
  reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update public.profiles set full_name = 'Fixed By Backend', username = 'nc_backend' where id = u;
  select full_name into n from public.profiles where id = u;
  res := res || E'\n' || case when n = 'Fixed By Backend' then 'PASS  ' else 'FAIL  ' end || '3a. the backend (no signed-in person) can still fix a name';

  raise exception E'NAME COOLDOWN TESTS (rolled back)%', res;
end
$t$;
