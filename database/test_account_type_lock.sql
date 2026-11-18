-- Rolled-back test of supabase_account_type_lock_schema.sql (2026-11-18): run
-- after the schema file. It ends with raise exception, so nothing it changes is
-- kept; the PASS/FAIL lines come back in the error message. It borrows one
-- existing freelancer account (only read; its row is changed inside the test
-- and rolled back). Result on the live database before applying (2026-11-18):
-- 4/4 PASS. Applied the same day as migration account_type_lock.

do $$
declare
  out text := '';
  f uuid;
  t text;
begin
  select id into f from public.profiles where account_type = 'freelancer' order by created_at limit 1;

  -- 1. The account itself, signed in, can't flip its role.
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set account_type = 'client' where id = f;
    out := out || E'\nFAIL a signed-in user changed their own role';
  exception when raise_exception then
    out := out || E'\nPASS a signed-in user cannot change their own role';
  end;

  -- 2. Other changes to their own row still work (the trigger only watches account_type).
  begin
    update public.profiles set gender = gender where id = f;
    out := out || E'\nPASS a signed-in user can still update their row';
  exception when others then
    out := out || E'\nFAIL a normal update was refused: ' || sqlerrm;
  end;

  -- 3. Writing the same role again is not a change.
  begin
    update public.profiles set account_type = 'freelancer' where id = f;
    out := out || E'\nPASS saving the same role again is allowed';
  exception when others then
    out := out || E'\nFAIL saving the same role was refused: ' || sqlerrm;
  end;
  reset role;

  -- 4. The SQL Editor (postgres, no signed-in user) can still fix a mistake.
  perform set_config('request.jwt.claims', '', true);
  begin
    update public.profiles set account_type = 'client' where id = f;
    select account_type into t from public.profiles where id = f;
    out := out || case when t = 'client' then E'\nPASS the SQL Editor can still change a role' else E'\nFAIL the SQL Editor change did not stick' end;
  exception when others then
    out := out || E'\nFAIL the SQL Editor was refused: ' || sqlerrm;
  end;

  raise exception 'TEST RESULTS (rolled back):%', out;
end;
$$;
