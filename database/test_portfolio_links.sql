-- Rolled-back test of supabase_portfolio_links_schema.sql (2026-11-15): run after
-- the schema file. It ends with raise exception, so nothing it changes is kept;
-- the PASS/FAIL lines come back in the error message. Result on the live
-- database before applying: 10/10 PASS.
-- Updated 2026-11-20 for supabase_portfolio_links_no_limit.sql (run it first): 4 links are fine now, 50 is the
-- ceiling and 51 is refused.

do $$
declare
  out text := '';
  fl uuid;
  cases text[][] := array[
    ['ok', '{https://behance.net/juan}'],
    ['ok', '{https://github.com/juan,https://drive.google.com/drive/folders/abc?usp=sharing,https://juan.dev}'],
    ['ok', '{}'],
    ['bad', '{http://behance.net/juan}'],
    ['bad', '{javascript:alert(1)}'],
    ['ok', '{https://a.com,https://b.com,https://c.com,https://d.com,https://e.com}'],
    ['bad', '{"https://behance.net/ju an"}'],
    ['bad', '{https://localhost}']
  ];
  i int;
begin
  select id into fl from public.profiles where account_type = 'freelancer' order by created_at limit 1;
  out := out || E'\n' || case when (select portfolio_links from public.profiles where id = fl) = '{}' then 'PASS' else 'FAIL' end || ' existing profiles start with no links';

  for i in 1 .. array_length(cases, 1) loop
    begin
      update public.profiles set portfolio_links = cases[i][2]::text[] where id = fl;
      out := out || E'\n' || case when cases[i][1] = 'ok' then 'PASS saved ' else 'FAIL accepted ' end || cases[i][2];
    exception when check_violation then
      out := out || E'\n' || case when cases[i][1] = 'bad' then 'PASS refused ' else 'FAIL refused ' end || cases[i][2];
    end;
  end loop;

  begin
    update public.profiles set portfolio_links = array['https://a.com/' || repeat('x', 187)] where id = fl;
    out := out || E'\nFAIL a 201-character link was accepted';
  exception when check_violation then
    out := out || E'\nPASS a 201-character link is refused';
  end;

  -- The quiet ceiling: exactly 50 links are saved, 51 are refused.
  begin
    update public.profiles set portfolio_links = (select array_agg('https://site' || n || '.com') from generate_series(1, 50) n) where id = fl;
    out := out || E'\nPASS 50 links are saved';
  exception when check_violation then
    out := out || E'\nFAIL 50 links were refused';
  end;
  begin
    update public.profiles set portfolio_links = (select array_agg('https://site' || n || '.com') from generate_series(1, 51) n) where id = fl;
    out := out || E'\nFAIL 51 links were accepted';
  exception when check_violation then
    out := out || E'\nPASS 51 links are refused';
  end;

  raise exception 'TEST RESULTS (rolled back):%', out;
end $$;
