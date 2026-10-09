-- Test for supabase_user_number_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts, acts as them, and ends with an error that carries the PASS/FAIL
-- list; that error rolls everything back, so nothing is left behind. (The
-- counter never goes back, so a few numbers are used up by a real run: that is
-- harmless. The first trial, run together with the schema file before it was
-- applied, uses none.)
--
-- Not tested here: that a deleted person's number is not handed out again. That
-- is true by design (numbers come from a counter, not from "highest + 1"), and
-- the test block can't contain a DELETE statement.
do $t$
declare
  res text := '';
  total int;
  maxn int;
  n1 int; n2 int; n3 int; n4 int;
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  ok boolean;
begin
  -- ===== The people who already exist =====
  select count(*), coalesce(max(user_number), 0) into total, maxn from public.profiles;

  select count(*) = 0 into ok from public.profiles where user_number is null;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1a. everyone has a number';

  select count(distinct user_number) = total into ok from public.profiles;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1b. no two people share a number';

  select not exists (
    select 1 from public.profiles a join public.profiles b on a.created_at < b.created_at and a.user_number > b.user_number
  ) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1c. numbers follow the order of sign-up';

  select is_nullable = 'NO' into ok from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_number';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1d. the column is required';

  select exists (select 1 from pg_constraint where conname = 'profiles_user_number_key' and contype = 'u') into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1e. the unique rule exists';

  -- ===== A new person, made by the website (signed in as themselves) =====
  insert into auth.users (id, email, aud, role, created_at) values (u1, 'un-' || left(u1::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);

  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline)
  values (u1, 'Number One', 'un_one', 'female', 'freelancer', false);
  select user_number into n1 from public.profiles where id = u1;
  res := res || E'\n' || case when n1 > maxn then 'PASS  ' else 'FAIL  ' end || '2a. a new profile gets a number after all the existing ones (' || coalesce(n1::text, 'none') || ' after ' || maxn || ')';

  -- ===== Choosing a number is ignored =====
  reset role; insert into auth.users (id, email, aud, role, created_at) values (u2, 'un-' || left(u2::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline, user_number)
  values (u2, 'Number Two', 'un_two', 'male', 'client', false, 999999);
  select user_number into n2 from public.profiles where id = u2;
  res := res || E'\n' || case when n2 <> 999999 and n2 > n1 then 'PASS  ' else 'FAIL  ' end || '3a. a number chosen by the website is ignored (got ' || coalesce(n2::text, 'none') || ')';

  -- ===== Editing your own profile can't change the number =====
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  update public.profiles set user_number = 5, description = 'hello' where id = u1;
  select user_number into n3 from public.profiles where id = u1;
  res := res || E'\n' || case when n3 = n1 then 'PASS  ' else 'FAIL  ' end || '4a. sending a different number when editing does nothing';

  update public.profiles set user_number = null where id = u1;
  select user_number into n3 from public.profiles where id = u1;
  res := res || E'\n' || case when n3 = n1 then 'PASS  ' else 'FAIL  ' end || '4b. sending an empty number does nothing';

  select description = 'hello' into ok from public.profiles where id = u1;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '4c. the rest of the edit still saved';

  -- ===== Nobody else can change it either (not even the owner role) =====
  reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update public.profiles set user_number = n2 where id = u1;
  select user_number into n3 from public.profiles where id = u1;
  res := res || E'\n' || case when n3 = n1 then 'PASS  ' else 'FAIL  ' end || '5a. an update by the backend or SQL Editor can''t take another person''s number';

  -- ===== Numbers keep counting up =====
  insert into auth.users (id, email, aud, role, created_at) values (u3, 'un-' || left(u3::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline)
  values (u3, 'Number Three', 'un_three', 'female', 'client', false);
  select user_number into n4 from public.profiles where id = u3;
  res := res || E'\n' || case when n4 > n2 then 'PASS  ' else 'FAIL  ' end || '6a. the next person gets a higher number again (' || coalesce(n4::text, 'none') || ')';

  -- ===== People have no access to the counter or the function =====
  select not has_function_privilege('authenticated', 'public.assign_user_number()', 'execute') into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '7a. the trigger function can''t be called directly by signed-in people';

  raise exception E'USER NUMBER TESTS (rolled back)%', res;
end
$t$;
