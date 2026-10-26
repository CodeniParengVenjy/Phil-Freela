-- Checks database/supabase_remove_fake_profile_schema.sql. Run it after the
-- schema file. Everything rolls back by itself: the results come back as the
-- error message ("TEST RESULTS ..."), and nothing is left behind.
do $$
declare
  results text := '';
  rid uuid;
  ok boolean;
  v text;
begin
  -- The old report is now "Other" and still says what it was reported for.
  select id into rid from public.reports where details like 'Reported as: Fake profile%' limit 1;
  results := results || case when rid is not null and (select reason from public.reports where id = rid) = 'other'
    then 'PASS' else 'FAIL' end || ' old report is Other with "Reported as: Fake profile"' || E'\n';
  results := results || case when not exists (select 1 from public.reports where reason = 'fake_profile')
    then 'PASS' else 'FAIL' end || ' no report has the fake_profile reason' || E'\n';

  -- A report can no longer be saved as fake_profile.
  if rid is not null then
    begin
      update public.reports set reason = 'fake_profile' where id = rid;
      ok := false;
    exception when check_violation then
      ok := true;
    end;
    results := results || case when ok then 'PASS' else 'FAIL' end || ' a report with fake_profile is refused' || E'\n';

    -- Every reason the website offers is still accepted.
    foreach v in array array['spam', 'scam', 'inappropriate', 'harassment', 'stolen_work', 'other'] loop
      begin
        update public.reports set reason = v where id = rid;
        ok := true;
      exception when check_violation then
        ok := false;
      end;
      results := results || case when ok then 'PASS' else 'FAIL' end || ' a report with ' || v || ' is accepted' || E'\n';
    end loop;
  end if;

  -- The penalty rule leaves out fake_profile and keeps the others.
  select pg_get_constraintdef(oid) into v from pg_constraint where conname = 'user_suspensions_violation_check';
  results := results || case when v not like '%fake_profile%' and v like '%stolen_work%' and v like '%other%'
    then 'PASS' else 'FAIL' end || ' penalties can''t use fake_profile' || E'\n';

  raise exception 'TEST RESULTS%', E'\n' || results;
end $$;
