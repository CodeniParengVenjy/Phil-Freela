-- Test for supabase_admin_forgot_password_schema.sql. Paste this whole file
-- into the Supabase SQL Editor and run it AFTER the schema file. It makes
-- made-up accounts and ends with an error that carries the PASS/FAIL list;
-- that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  a uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
  ae text;
  ue text;
  r boolean;
begin
  ae := 'fp-admin-' || left(a::text, 8) || '@example.invalid';
  ue := 'fp-user-' || left(u::text, 8) || '@example.invalid';
  insert into auth.users (id, email, aud, role, created_at)
  values (a, ae, 'authenticated', 'authenticated', now()), (u, ue, 'authenticated', 'authenticated', now());
  insert into public.admins (id, full_name, username, role) values (a, 'Test Admin', 'fp_admin_test', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline)
  values (u, 'Test User', 'fp_user_test', 'male', 'client', false);

  -- asked by someone who is signed out
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  r := public.is_admin_email(ae);
  res := res || E'\n' || case when r then 'PASS  ' else 'FAIL  ' end || '1a. an admin''s email answers yes (asked while signed out)';
  r := public.is_admin_email(upper(' ' || ae || ' '));
  res := res || E'\n' || case when r then 'PASS  ' else 'FAIL  ' end || '1b. capital letters and spaces around it do not matter';
  r := public.is_admin_email(ue);
  res := res || E'\n' || case when not r then 'PASS  ' else 'FAIL  ' end || '1c. a normal user''s email answers no';
  r := public.is_admin_email('nobody-' || left(a::text, 8) || '@example.invalid');
  res := res || E'\n' || case when not r then 'PASS  ' else 'FAIL  ' end || '1d. an unknown email answers no';
  r := public.is_admin_email(null);
  res := res || E'\n' || case when not r then 'PASS  ' else 'FAIL  ' end || '1e. nothing typed answers no';

  -- it only returns true or false, so nothing else leaks
  res := res || E'\n' || case when pg_typeof(public.is_admin_email(ae))::text = 'boolean' then 'PASS  ' else 'FAIL  ' end || '1f. the answer is only true or false';

  raise exception E'ADMIN FORGOT PASSWORD TESTS (rolled back)%', res;
end
$t$;
