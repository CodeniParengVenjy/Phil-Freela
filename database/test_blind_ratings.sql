-- Test for supabase_blind_ratings_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts and projects, acts as each person, and ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing
-- is left behind.
do $t$
declare
  res text := '';
  c uuid := gen_random_uuid();   -- a client, "Maria Blindtest"
  f uuid := gen_random_uuid();   -- a freelancer, "Juan Blindtest"
  x uuid := gen_random_uuid();   -- someone who is on none of the projects
  p1 uuid;                       -- Done just now: the normal blind flow
  p2 uuid;                       -- Done, then moved 15 days back: only the client rated
  p3 uuid;                       -- still Submitted, not Done
  svc uuid;
  job uuid;
  n int;
  cnt int;
  avg_s numeric;
  stars_got smallint;
  got_title text;
  got text;
  flag boolean;
begin
  -- ===== Made-up rows, added with nobody signed in =====
  insert into auth.users (id, email, aud, role, created_at, encrypted_password)
  select u, 'blind-' || left(u::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(),
         extensions.crypt('Test1234', extensions.gen_salt('bf', 4))
  from unnest(array[c, f, x]) as u;
  -- email_when_offline is off so the test can't email anyone.
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (c, 'Maria Blindtest', 'maria_blindtest', 'female', 'client', false),
    (f, 'Juan Blindtest', 'juan_blindtest', 'male', 'freelancer', false),
    (x, 'Other Blindtest', 'other_blindtest', 'male', 'client', false);
  insert into public.services (freelancer_id, title, category, description)
    values (f, 'Blind test video editing', 'video-editing', 'A test service.') returning id into svc;
  insert into public.job_posts (client_id, title, category, description)
    values (c, 'Blind test job', 'video-editing', 'A test job.') returning id into job;
  insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date, submitted_at, completed_at)
    values (c, f, 'Blind promo video', 'done', now() - interval '5 days', current_date, now() - interval '1 day', now())
    returning id into p1;
  insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date, submitted_at, completed_at)
    values (c, f, 'Blind old poster', 'done', now() - interval '5 days', current_date, now() - interval '1 day', now())
    returning id into p2;
  insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date, submitted_at)
    values (c, f, 'Blind unfinished logo', 'submitted', now() - interval '5 days', current_date, now() - interval '1 day')
    returning id into p3;

  set local role authenticated;

  -- ===== Still refused, as before the blind rule =====
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (p3, c, f, 5);
    res := res || E'\nFAIL  1. a project that is not Done was rated';
  exception when others then res := res || E'\nPASS  1. a project that is not Done cannot be rated';
  end;
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (p1, c, c, 5);
    res := res || E'\nFAIL  2. someone rated themselves';
  exception when others then res := res || E'\nPASS  2. you cannot rate yourself';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (p1, x, f, 1);
    res := res || E'\nFAIL  3. someone who is not on the project rated it';
  exception when others then res := res || E'\nPASS  3. someone who is not on the project cannot rate it';
  end;

  -- ===== The client rates first: the rating is hidden =====
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars, feedback)
      values (p1, c, f, 5, 'Great work blindtest');
    res := res || E'\nPASS  4. the client can rate the freelancer on a Done project';
  exception when others then res := res || E'\nFAIL  4. the client could not rate: ' || sqlerrm;
  end;
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (p1, c, f, 1);
    res := res || E'\nFAIL  5. the client rated the same project twice';
  exception when others then res := res || E'\nPASS  5. the same project cannot be rated twice';
  end;
  select count(*) into n from public.project_ratings where project_id = p1;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '6. the client can read the rating they gave (' || n || ')';

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  select count(*) into n from public.project_ratings where project_id = p1;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '7. the freelancer cannot read it yet (' || n || ')';
  select count(*), max(title), max(message) into n, got_title, got
    from public.user_notifications where user_id = f and type = 'project_rated';
  res := res || E'\n' || case when n = 1 and got_title = 'A rating is waiting for you'
      and position('★' in got) = 0 and position('Great work' in got) = 0 and position('hidden until you rate them too' in got) > 0
    then 'PASS  ' else 'FAIL  ' end || '8. the freelancer''s notification has no stars and no feedback: ' || coalesce(got, '(none)');
  select count(*) into n from public.rating_summaries(array[f, c]);
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '9. the star badge does not count it (' || n || ' rows)';
  select s.rating_count, s.avg_stars into cnt, avg_s from public.profile_stats(f, 'freelancer') s;
  res := res || E'\n' || case when cnt = 0 and avg_s is null then 'PASS  ' else 'FAIL  ' end || '10. the Performance box does not count it';
  select h.stars into stars_got from public.profile_history(f, 'freelancer') h where h.title = 'Blind promo video';
  res := res || E'\n' || case when found and stars_got is null then 'PASS  ' else 'FAIL  ' end || '11. Completed Projects shows the project with no stars';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.rating_summaries(array[f]);
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '12. the client''s own hidden rating is not in the badge they see either';

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  select count(*) into n from public.project_ratings where project_id = p1;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '13. another user cannot read it (' || n || ')';

  reset role;
  select r.rating_count, r.avg_stars into cnt, avg_s from public.ranking_records(array[svc]) r;
  res := res || E'\n' || case when cnt = 0 and avg_s is null then 'PASS  ' else 'FAIL  ' end || '14. the ranking does not count it';
  set local role authenticated;

  -- ===== The freelancer rates back: both ratings show =====
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (p1, f, c, 4);
    res := res || E'\nPASS  15. the freelancer can rate the client back';
  exception when others then res := res || E'\nFAIL  15. the freelancer could not rate back: ' || sqlerrm;
  end;
  select count(*) into n from public.project_ratings where project_id = p1;
  res := res || E'\n' || case when n = 2 then 'PASS  ' else 'FAIL  ' end || '16. the freelancer now reads both ratings (' || n || ')';
  select h.stars into stars_got from public.profile_history(f, 'freelancer') h where h.title = 'Blind promo video';
  res := res || E'\n' || case when stars_got = 5 then 'PASS  ' else 'FAIL  ' end || '17. Completed Projects now shows the 5 stars';
  select s.rating_count, s.avg_stars into cnt, avg_s from public.profile_stats(f, 'freelancer') s;
  res := res || E'\n' || case when cnt = 1 and avg_s = 5.0 then 'PASS  ' else 'FAIL  ' end || '18. the Performance box now counts it';

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  select count(*) into n from public.project_ratings where project_id = p1;
  res := res || E'\n' || case when n = 2 then 'PASS  ' else 'FAIL  ' end || '19. another user now reads both (' || n || ')';
  select count(*), sum(s.rating_count) into n, cnt from public.rating_summaries(array[f, c]) s;
  res := res || E'\n' || case when n = 2 and cnt = 2 then 'PASS  ' else 'FAIL  ' end || '20. the star badge now counts both people''s ratings';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*), max(title), max(message) into n, got_title, got
    from public.user_notifications where user_id = c and type = 'project_rated';
  res := res || E'\n' || case when n = 1 and got_title = 'You got a new rating' and position('4★' in got) > 0
    then 'PASS  ' else 'FAIL  ' end || '21. the client''s notification has the stars: ' || coalesce(got, '(none)');

  reset role;
  select r.rating_count, r.avg_stars into cnt, avg_s from public.ranking_records(array[svc]) r;
  res := res || E'\n' || case when cnt = 1 and avg_s = 5 then 'PASS  ' else 'FAIL  ' end || '22. the ranking now counts the freelancer''s rating';
  select r.rating_count, r.avg_stars into cnt, avg_s from public.ranking_records(array[job]) r;
  res := res || E'\n' || case when cnt = 1 and avg_s = 4 then 'PASS  ' else 'FAIL  ' end || '23. ...and the client''s';
  set local role authenticated;

  -- ===== Only one side rated, and the 14 days end =====
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into public.project_ratings (project_id, rater_id, ratee_id, stars, feedback)
    values (p2, c, f, 3, 'Late blindtest');
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  select count(*) into n from public.project_ratings where project_id = p2;
  flag := public.rating_is_visible(p2);
  res := res || E'\n' || case when n = 0 and not flag then 'PASS  ' else 'FAIL  ' end || '24. on day 0 the one-sided rating is hidden';

  -- The project was marked Done 15 days ago.
  reset role;
  update public.projects set completed_at = now() - interval '15 days' where id = p2;
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  select count(*) into n from public.project_ratings where project_id = p2;
  flag := public.rating_is_visible(p2);
  res := res || E'\n' || case when n = 1 and flag then 'PASS  ' else 'FAIL  ' end || '25. after 14 days it is visible to the freelancer';
  select s.rating_count, s.avg_stars into cnt, avg_s from public.profile_stats(f, 'freelancer') s;
  res := res || E'\n' || case when cnt = 2 and avg_s = 4.0 then 'PASS  ' else 'FAIL  ' end || '26. ...and counts in the Performance box (5 and 3 = 4.0)';
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (p2, f, c, 1);
    res := res || E'\nFAIL  27. the freelancer rated after the 14 days, having seen the other rating';
  exception when others then res := res || E'\nPASS  27. the freelancer can no longer rate after the 14 days';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  select count(*) into n from public.project_ratings where project_id = p2;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '28. ...and to another user';

  -- ===== Who may call the helper functions =====
  reset role;
  res := res || E'\n' || case when not has_function_privilege('anon', 'public.rating_is_visible(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.rating_window()', 'execute')
      and has_function_privilege('authenticated', 'public.rating_is_visible(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.ranking_records(uuid[])', 'execute')
    then 'PASS  ' else 'FAIL  ' end || '29. visitors who are not signed in cannot call the new functions';

  raise exception E'\nBLIND RATINGS TEST%', res;
end;
$t$;
