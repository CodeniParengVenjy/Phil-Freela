-- Test for supabase_name_policy_schema.sql. Paste this whole file into the
-- Supabase SQL Editor (or run it through the SQL tool) AFTER the schema file.
-- It acts as two existing accounts (only their names are touched) and ends
-- with an error that carries the PASS/FAIL list; that error rolls everything
-- back, so nothing is left behind. One made-up account is used for the new
-- profile checks, and the user-number counter is put back where it was.
do $t$
declare
  res text := '';
  u1 uuid;                        -- borrowed: made to look like someone who signed up with NO name
  u2 uuid;                        -- borrowed: a normal person
  u3 uuid;                        -- made up: for the new-profile checks
  sv bigint; sc boolean;
  bad text;
  good text;
  n text;
  d timestamptz;
  r bigint;
  ok boolean;
  nid uuid;
begin
  select id into u1 from public.profiles order by user_number limit 1;
  select id into u2 from public.profiles where id <> u1 order by user_number limit 1;
  select last_value, is_called into sv, sc from public.user_number_seq;

  -- u1 is how @apol got in: a profile with an empty name. The rule is switched
  -- off for this one change only, then straight back on. Both borrowed people
  -- start with no waiting time, so the 7-day wait doesn't get in the way.
  alter table public.profiles disable trigger profiles_name_policy;
  update public.profiles set full_name = '', name_changed_at = null where id = u1;
  alter table public.profiles enable trigger profiles_name_policy;
  update public.profiles set name_changed_at = null where id = u2;

  -- ===== 1. A new profile with a bad name is refused =====
  ok := true;
  foreach bad in array array['', '   ', 'A', 'A.', 'qa123', 'a@b.com', 'www.site.com', 'https://x.y', 'Juan 😀', 'Juan_Cruz', '-Juan', repeat('x', 51), 'Juan<b>']
  loop
    nid := gen_random_uuid();
    insert into auth.users (id, email, aud, role, created_at)
    values (nid, 'np-' || left(nid::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
    begin
      insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline)
      values (nid, bad, 'np_' || left(nid::text, 8), 'male', 'client', false);
      ok := false;
      res := res || E'\nFAIL  1a. accepted the name ' || quote_literal(bad);
    exception when check_violation then null; end;
  end loop;
  if ok then res := res || E'\nPASS  1a. 13 bad names (blank, 1 letter, digits, @, links, emoji, _, 51 letters, <>) are all refused on a new profile'; end if;

  -- ===== 2. A good name is saved, and tidied =====
  u3 := gen_random_uuid();
  insert into auth.users (id, email, aud, role, created_at)
  values (u3, 'np-' || left(u3::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline)
  values (u3, '  Ma.   Santos  Jr. ', 'np_u3_test', 'male', 'client', false);
  select full_name into n from public.profiles where id = u3;
  res := res || E'\n' || case when n = 'Ma. Santos Jr.' then 'PASS  ' else 'FAIL  ' end || '2a. a new profile is saved with extra spaces tidied (' || quote_literal(n) || ')';

  ok := true;
  foreach good in array array['Juan Dela Cruz', 'José Ñuñez', 'O''Brien-Smith', 'Dela Cruz, Juan', 'Jo', 'Francia Marie A. Climaco', repeat('a', 50)]
  loop
    begin
      update public.profiles set full_name = good where id = u2;
      select full_name into n from public.profiles where id = u2;
      if n <> good then ok := false; res := res || E'\nFAIL  2b. changed ' || quote_literal(good) || ' into ' || quote_literal(n); end if;
    exception when others then ok := false; res := res || E'\nFAIL  2b. refused a good name ' || quote_literal(good) || ': ' || sqlerrm; end;
  end loop;
  if ok then res := res || E'\nPASS  2b. 7 good names (with an accent, an apostrophe, a comma, a dot, 2 letters, 50 letters) are accepted as typed'; end if;

  update public.profiles set full_name = E'  Juan  \n  Cruz ' where id = u2;
  select full_name into n from public.profiles where id = u2;
  res := res || E'\n' || case when n = 'Juan Cruz' then 'PASS  ' else 'FAIL  ' end || '2c. a changed name is tidied too, a line break becomes a space (' || quote_literal(n) || ')';

  -- ===== 3. Changing a name to a bad one is refused (a person signed in) =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);

  begin update public.profiles set full_name = 'qa123' where id = u2;
    res := res || E'\nFAIL  3a. changed a name to qa123';
  exception when others then res := res || E'\n' || case when sqlerrm like 'Use letters only%' then 'PASS  ' else 'FAIL  ' end || '3a. a name with digits is refused: ' || sqlerrm; end;

  begin update public.profiles set full_name = '   ' where id = u2;
    res := res || E'\nFAIL  3b. blanked a name';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Please enter your name.' then 'PASS  ' else 'FAIL  ' end || '3b. a blank name is refused: ' || sqlerrm; end;

  -- ===== 4. The person with no name (u1) =====
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);

  update public.profiles set description = 'still works' where id = u1;
  get diagnostics r = row_count;
  res := res || E'\n' || case when r = 1 then 'PASS  ' else 'FAIL  ' end || '4a. a person with no name can still change other things (the rule only looks at the name)';

  begin update public.profiles set full_name = 'x1' where id = u1;
    res := res || E'\nFAIL  4b. a bad first name was accepted';
  exception when others then res := res || E'\nPASS  4b. a bad first name is refused'; end;

  update public.profiles set full_name = 'Apol Reyes' where id = u1;
  reset role;
  select full_name, name_changed_at into n, d from public.profiles where id = u1;
  res := res || E'\n' || case when n = 'Apol Reyes' then 'PASS  ' else 'FAIL  ' end || '4c. they can add their name (' || quote_literal(n) || ')';
  res := res || E'\n' || case when d is not null then 'PASS  ' else 'FAIL  ' end || '4d. adding it counts as their first change (the 7-day wait starts now)';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  begin update public.profiles set full_name = 'Apol Cruz' where id = u1;
    res := res || E'\nFAIL  4e. changed the name again straight away';
  exception when others then res := res || E'\n' || case when sqlerrm like 'You can change your name again on %' then 'PASS  ' else 'FAIL  ' end || '4e. the 7-day wait still applies: ' || sqlerrm; end;

  -- Back to the owner, with no pretend login left over.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  -- Put the user-number counter back, so the test uses up no numbers.
  perform setval('public.user_number_seq', sv, sc);

  raise exception E'NAME POLICY TESTS (rolled back)%', res;
end
$t$;
