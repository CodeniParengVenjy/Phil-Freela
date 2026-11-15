-- Rolled-back test of supabase_site_verifications_schema.sql (2026-11-15): run
-- after the schema file. It ends with raise exception, so nothing it changes is
-- kept; the PASS/FAIL lines come back in the error message. It borrows two
-- existing freelancer accounts (only read; their links are changed inside the
-- test and rolled back), so no user numbers are used up. Result on the live
-- database before applying (2026-11-15): 16/16 PASS.

do $$
declare
  out text := '';
  fa uuid;
  fb uuid;
  n int;
  t text;
begin
  select id into fa from public.profiles where account_type = 'freelancer' order by created_at limit 1;
  select id into fb from public.profiles where account_type = 'freelancer' and id <> fa order by created_at limit 1;

  -- Fixtures, as the owner: fa has 3 links; rows for a verified link, one verified
  -- 100 days ago, one not verified yet, and one for a link fa no longer has.
  update public.profiles
    set portfolio_links = '{https://juan-test.dev,https://old-test.dev,https://wait-test.dev}'
    where id = fa;
  insert into public.site_verifications (freelancer_id, link, code, verified_at) values
    (fa, 'https://juan-test.dev', 'pf-aaaaaaaaaa', now()),
    (fa, 'https://old-test.dev', 'pf-bbbbbbbbbb', now() - interval '100 days'),
    (fa, 'https://wait-test.dev', 'pf-cccccccccc', null),
    (fa, 'https://gone-test.dev', 'pf-dddddddddd', now()),
    (fb, 'https://juan-test.dev', 'pf-eeeeeeeeee', null);

  -- The table's own checks.
  begin
    insert into public.site_verifications (freelancer_id, link, code) values (fb, 'https://x-test.dev', 'PF-NOTVALID');
    out := out || E'\nFAIL a badly shaped code was accepted';
  exception when check_violation then
    out := out || E'\nPASS a badly shaped code is refused';
  end;
  begin
    insert into public.site_verifications (freelancer_id, link, code) values (fb, 'http://x-test.dev', 'pf-ffffffffff');
    out := out || E'\nFAIL an http link was accepted';
  exception when check_violation then
    out := out || E'\nPASS an http link is refused';
  end;
  begin
    insert into public.site_verifications (freelancer_id, link, code) values (fa, 'https://juan-test.dev', 'pf-gggggggggg');
    out := out || E'\nFAIL a second row for the same person and link was accepted';
  exception when unique_violation then
    out := out || E'\nPASS one row per person per link';
  end;
  begin
    insert into public.site_verifications (freelancer_id, link, code) values (fb, 'https://y-test.dev', 'pf-aaaaaaaaaa');
    out := out || E'\nFAIL the same code was given twice';
  exception when unique_violation then
    out := out || E'\nPASS every code is different';
  end;

  -- Act as fa.
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.site_verifications;
  out := out || E'\n' || case when n = 4 then 'PASS' else 'FAIL' end || ' fa reads only their own 4 rows (got ' || n || ')';
  select code into t from public.site_verifications where link = 'https://juan-test.dev';
  out := out || E'\n' || case when t = 'pf-aaaaaaaaaa' then 'PASS' else 'FAIL' end || ' fa can see their own code';
  begin
    insert into public.site_verifications (freelancer_id, link, code) values (fa, 'https://z-test.dev', 'pf-hhhhhhhhhh');
    out := out || E'\nFAIL fa could add a row from the browser';
  exception when insufficient_privilege then
    out := out || E'\nPASS fa cannot add a row from the browser';
  end;
  begin
    update public.site_verifications set verified_at = now() where link = 'https://wait-test.dev';
    out := out || E'\nFAIL fa could mark their own link verified';
  exception when insufficient_privilege then
    out := out || E'\nPASS fa cannot mark their own link verified';
  end;
  reset role;

  -- Act as fb.
  perform set_config('request.jwt.claims', json_build_object('sub', fb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.site_verifications;
  out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' fb reads only their own row (got ' || n || ')';
  select count(*) into n from public.site_verifications where code = 'pf-aaaaaaaaaa';
  out := out || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ' fb cannot see fa''s code';
  select count(*) into n from public.verified_portfolio_links(fa);
  out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' fb sees exactly 1 verified link of fa (got ' || n || ')';
  select link into t from public.verified_portfolio_links(fa) limit 1;
  out := out || E'\n' || case when t = 'https://juan-test.dev' then 'PASS' else 'FAIL' end
    || ' it is the fresh one (not the 100-day-old, the unverified or the removed link)';
  select count(*) into n from public.verified_portfolio_links(fb);
  out := out || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ' an unverified link shows no badge';
  reset role;

  -- The function never returns the code.
  select pg_get_function_result('public.verified_portfolio_links(uuid)'::regprocedure) into t;
  out := out || E'\n' || case when t not like '%code%' then 'PASS' else 'FAIL' end || ' the function returns only: ' || t;

  -- Signed out (anon).
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    select count(*) into n from public.site_verifications;
    out := out || E'\nFAIL anon could read the table';
  exception when insufficient_privilege then
    out := out || E'\nPASS anon cannot read the table';
  end;
  begin
    select count(*) into n from public.verified_portfolio_links(fa);
    out := out || E'\nFAIL anon could call the function';
  exception when insufficient_privilege then
    out := out || E'\nPASS anon cannot call the function';
  end;
  reset role;

  raise exception 'TEST RESULTS (rolled back):%', out;
end $$;
