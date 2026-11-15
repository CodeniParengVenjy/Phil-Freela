-- Rolled-back test of supabase_homepage_testimonials_schema.sql (2026-11-15):
-- run after the schema file. It ends with raise exception, so nothing it
-- changes is kept; the PASS/FAIL lines come back in the error message.

do $$
declare
  out text := '';
  pid uuid; cl uuid; fl uuid; rid uuid; adm uuid;
  words constant text := 'Great work, fast and very easy to talk to.';
  n int; fname text; expected text;
begin
  select p.id, p.client_id, p.freelancer_id into pid, cl, fl from public.projects p
    where not exists (select 1 from public.user_suspensions s where s.user_id = p.client_id)
    order by p.started_at limit 1;
  select id into adm from public.admins limit 1;
  select coalesce(nullif(split_part(trim(full_name), ' ', 1), ''), 'A client') into expected from public.profiles where id = cl;

  -- A project that was done 40 days ago (its ratings are visible to everyone by now).
  update public.projects set status = 'done', completed_at = now() - interval '40 days', unlocked_at = now() - interval '40 days' where id = pid;
  select id into rid from public.project_ratings where project_id = pid and rater_id = cl;
  if rid is null then
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars, feedback, show_on_homepage)
      values (pid, cl, fl, 5, words, true) returning id into rid;
  else
    update public.project_ratings set stars = 5, feedback = words, show_on_homepage = true where id = rid;
  end if;

  set local role anon;
  select count(*), max(t.first_name) into n, fname from public.homepage_testimonials() t where t.feedback = words;
  reset role;
  out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' a visitor who is not signed in sees the ticked 5-star rating';
  out := out || E'\n' || case when fname = expected then 'PASS' else 'FAIL' end || ' only the first name is shown: ' || coalesce(fname, 'null');

  update public.project_ratings set show_on_homepage = false where id = rid;
  select count(*) into n from public.homepage_testimonials() t where t.feedback = words;
  out := out || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ' not ticked = not shown';

  update public.project_ratings set show_on_homepage = true, stars = 3 where id = rid;
  select count(*) into n from public.homepage_testimonials() t where t.feedback = words;
  out := out || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ' 3 stars = not shown';

  update public.project_ratings set stars = 4, feedback = 'Nice work.' where id = rid;
  select count(*) into n from public.homepage_testimonials() t where t.feedback = 'Nice work.';
  out := out || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ' feedback under 20 characters = not shown';

  update public.project_ratings set feedback = words where id = rid;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  insert into public.user_suspensions (user_id, reason, violation, suspended_by, ends_at, blocks_posting, blocks_messaging)
    values (cl, 'Spam', 'spam', adm, now() + interval '3 days', true, false);
  select count(*) into n from public.homepage_testimonials() t where t.feedback = words;
  out := out || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ' a suspended client''s rating is not shown';

  raise exception 'TEST RESULTS (rolled back):%', out;
end $$;
