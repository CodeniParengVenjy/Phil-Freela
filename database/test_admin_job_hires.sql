-- Test for admin_job_hires() in supabase_admin_job_hires_schema.sql. Send the schema
-- file and this block together in ONE call to try it before applying (the error at
-- the end rolls the schema back too), or run this alone in the Supabase SQL Editor
-- after the schema file. It BORROWS one admin, one normal user and four real
-- accounts (so no user numbers are used), adds three made-up job posts with
-- applications and hires as the database owner, and ends with an error that carries
-- the PASS/FAIL list; that error rolls everything back, so nothing is left behind.
-- The two e-mail triggers are switched off for the block (the switch rolls back
-- too), so nobody gets a message about made-up applications.
do $t$
declare
  res       text := '';
  today     date := (now() at time zone 'Asia/Manila')::date;
  adm       uuid;      -- a real admin
  usr       uuid;      -- a real normal user, who must be refused
  cl        uuid;      -- owns the made-up posts, is the client on the made-up hires
  f1        uuid;      -- hired on two posts
  f2        uuid;      -- hired on one post
  p_open    uuid;      -- needs 3, 2 hired: still open
  p_filled  uuid;      -- needs 1, 1 hired: filled
  p_nobody  uuid;      -- open, nobody hired
  a_o1 uuid; a_o2 uuid; a_f1 uuid;
  pr_o1 uuid; pr_o2 uuid; pr_f1 uuid;   -- the three made-up projects
  b         jsonb;     -- admin_job_hires() before the made-up data
  r         jsonb;     -- ... after it
  r2        jsonb;
  hb        jsonb;     -- admin_job_hiring() after it
  x         jsonb;
  k         text;
  n         int;
  bad       int;
  want      int;
  refused   boolean;
begin
  alter table public.job_applications disable trigger email_offline_on_application;
  alter table public.user_notifications disable trigger email_offline_on_notification;

  select a.id into adm from public.admins a where not a.must_change_password order by a.id limit 1;
  select p.id into cl from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  select p.id into f1 from public.profiles p
   where p.id <> cl and not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  select p.id into f2 from public.profiles p
   where p.id not in (cl, f1) and not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  select p.id into usr from public.profiles p
   where p.id not in (cl, f1, f2) and not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  if adm is null or f2 is null or usr is null then
    raise exception 'Needs one admin and four normal accounts already in the database.';
  end if;

  -- ---- before: the list without the made-up data ----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  b := public.admin_job_hires()::jsonb;
  reset role;
  res := res || 'LIVE hires listed: ' || jsonb_array_length(b) || E'\n';

  -- ---- made-up posts, applications and hires (as the owner) -----------------
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
  values (cl, 'Test hires open', 'graphic-design', 'x', 'project', 'project', 3, today, today + 10) returning id into p_open;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
  values (cl, 'Test hires filled', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10) returning id into p_filled;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
  values (cl, 'Test hires nobody', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10) returning id into p_nobody;

  insert into public.job_applications (job_post_id, freelancer_id, resume_path) values
    (p_open, f1, f1::text || '/' || p_open::text || '-1.pdf') returning id into a_o1;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path) values
    (p_open, f2, f2::text || '/' || p_open::text || '-1.pdf') returning id into a_o2;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path) values
    (p_filled, f1, f1::text || '/' || p_filled::text || '-1.pdf') returning id into a_f1;

  -- f1 was hired on the open post 5 days ago, f2 on it 2 days ago, f1 on the
  -- filled post 1 day ago (so the newest first order is: filled, f2, f1).
  insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, due_date, status, started_at)
  values (a_o1, p_open, cl, f1, 'Test hires open', today + 5, 'started', now() - interval '5 days') returning id into pr_o1;
  insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, due_date, status, started_at)
  values (a_o2, p_open, cl, f2, 'Test hires open', today + 5, 'done', now() - interval '2 days') returning id into pr_o2;
  insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, due_date, status, started_at)
  values (a_f1, p_filled, cl, f1, 'Test hires filled', today + 5, 'submitted', now() - interval '1 day') returning id into pr_f1;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_job_hires()::jsonb;
  hb := public.admin_job_hiring()::jsonb;
  reset role;

  -- 1. The shape ---------------------------------------------------------------
  res := res || case when jsonb_typeof(r) = 'array' then 'PASS' else 'FAIL' end || ' a list' || E'\n';
  select count(*) into bad from jsonb_array_elements(r) e
   where not (e ? 'project_id' and e ? 'job_post_id' and e ? 'job_title' and e ? 'job_state' and e ? 'hired' and e ? 'needed'
          and e ? 'freelancer_id' and e ? 'full_name' and e ? 'username' and e ? 'avatar_path' and e ? 'client_name'
          and e ? 'project_status' and e ? 'hired_at' and e ? 'due_date')
      or e ->> 'job_state' not in ('open', 'filled', 'expired')
      or e ->> 'project_status' not in ('started', 'submitted', 'done');
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end || ' every entry has all its fields, a valid post state and a valid project status' || E'\n';
  select count(*) into bad from jsonb_array_elements(r) e where e ? 'resume_path' or e ? 'cover_note';
  res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' no resume or cover note is returned' || E'\n';
  select count(*) - count(distinct e ->> 'project_id') into bad from jsonb_array_elements(r) e;
  res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' no hire is listed twice' || E'\n';

  -- 2. The made-up hires -----------------------------------------------------------
  res := res || case when jsonb_array_length(r) = jsonb_array_length(b) + 3 then 'PASS' else 'FAIL ' || jsonb_array_length(r) end
         || ' three more hires than before' || E'\n';
  select e into x from jsonb_array_elements(r) e where (e ->> 'project_id')::uuid = pr_o1;
  res := res || case when x ->> 'job_title' = 'Test hires open' and x ->> 'job_state' = 'open'
                      and (x ->> 'hired')::int = 2 and (x ->> 'needed')::int = 3
                      and (x ->> 'freelancer_id')::uuid = f1 and x ->> 'project_status' = 'started'
                      and (x ->> 'job_post_id')::uuid = p_open
                     then 'PASS' else 'FAIL ' || coalesce(x::text, 'missing') end
         || ' f1 on the open post: open, 2 of 3 hired, started' || E'\n';
  select e into x from jsonb_array_elements(r) e where (e ->> 'project_id')::uuid = pr_o2;
  res := res || case when x ->> 'job_state' = 'open' and (x ->> 'hired')::int = 2 and (x ->> 'needed')::int = 3
                      and (x ->> 'freelancer_id')::uuid = f2 and x ->> 'project_status' = 'done'
                     then 'PASS' else 'FAIL ' || coalesce(x::text, 'missing') end
         || ' f2 on the open post: open, 2 of 3 hired, done' || E'\n';
  select e into x from jsonb_array_elements(r) e where (e ->> 'project_id')::uuid = pr_f1;
  res := res || case when x ->> 'job_title' = 'Test hires filled' and x ->> 'job_state' = 'filled'
                      and (x ->> 'hired')::int = 1 and (x ->> 'needed')::int = 1
                      and (x ->> 'freelancer_id')::uuid = f1 and x ->> 'project_status' = 'submitted'
                     then 'PASS' else 'FAIL ' || coalesce(x::text, 'missing') end
         || ' f1 on the filled post: filled (hidden from freelancers but listed here), 1 of 1 hired, submitted' || E'\n';
  select count(*) into n from jsonb_array_elements(r) e where (e ->> 'job_post_id')::uuid = p_nobody;
  res := res || case when n = 0 then 'PASS' else 'FAIL' end || ' a post nobody was hired for has no entry' || E'\n';

  -- names and dates come from the real rows
  select count(*) into bad from jsonb_array_elements(r) e
   where e ->> 'full_name' is distinct from (select p.full_name from public.profiles p where p.id = (e ->> 'freelancer_id')::uuid)
      or e ->> 'username' is distinct from (select p.username from public.profiles p where p.id = (e ->> 'freelancer_id')::uuid)
      or e ->> 'client_name' is distinct from (select p.full_name from public.profiles p
                                                where p.id = (select pj.client_id from public.projects pj where pj.id = (e ->> 'project_id')::uuid))
      or (e ->> 'hired_at')::timestamptz is distinct from (select pj.started_at from public.projects pj where pj.id = (e ->> 'project_id')::uuid)
      or (e ->> 'due_date')::date is distinct from (select pj.due_date from public.projects pj where pj.id = (e ->> 'project_id')::uuid);
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end || ' names, hire dates and due dates come from the profiles and projects' || E'\n';
  -- hired / needed / state equal counting the tables and job_state(), for every entry
  select count(*) into bad from jsonb_array_elements(r) e
   where (e ->> 'hired')::int <> (select count(*) from public.projects pj where pj.job_post_id = (e ->> 'job_post_id')::uuid)
      or (e ->> 'needed')::int <> (select j.freelancers_needed from public.job_posts j where j.id = (e ->> 'job_post_id')::uuid)
      or e ->> 'job_state' is distinct from public.job_state((e ->> 'job_post_id')::uuid);
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end || ' every hired, needed and state equals counting the tables and job_state()' || E'\n';

  -- Newest hire first: filled (1 day ago), f2 (2 days), f1 (5 days).
  res := res || case when
           (select o from jsonb_array_elements(r) with ordinality as q(e, o) where (e ->> 'project_id')::uuid = pr_f1)
         < (select o from jsonb_array_elements(r) with ordinality as q(e, o) where (e ->> 'project_id')::uuid = pr_o2)
       and (select o from jsonb_array_elements(r) with ordinality as q(e, o) where (e ->> 'project_id')::uuid = pr_o2)
         < (select o from jsonb_array_elements(r) with ordinality as q(e, o) where (e ->> 'project_id')::uuid = pr_o1)
       then 'PASS' else 'FAIL' end || ' newest hire first' || E'\n';
  select count(*) into bad
    from (select (e ->> 'hired_at')::timestamptz as t, lag((e ->> 'hired_at')::timestamptz) over (order by o) as prev
            from jsonb_array_elements(r) with ordinality as q(e, o)) z
   where z.prev is not null and z.t > z.prev;
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end || ' the whole list is in newest-first order' || E'\n';

  -- 3. Agrees with the Overview number -----------------------------------------------
  want := (hb -> 'totals' ->> 'hired')::int;
  res := res || case when jsonb_array_length(r) = least(want, 200) then 'PASS' else 'FAIL ' || jsonb_array_length(r) || ' vs ' || want end
         || ' the list length equals the Freelancers hired total of admin_job_hiring() (' || want || ', the list stops at 200)' || E'\n';
  select count(*) into want from public.projects p
   where p.job_post_id is not null and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id));
  res := res || case when jsonb_array_length(r) = least(want, 200) then 'PASS' else 'FAIL' end || ' ... and equals counting the projects directly (' || want || ')' || E'\n';
  -- A project that did not come from a job post (a booking) is not a hire.
  select count(*) into n from public.projects where job_post_id is null;
  res := res || 'INFO ' || n || ' project(s) in the table did not come from a job post and are not listed' || E'\n';
  select count(*) into bad from jsonb_array_elements(r) e
   where not exists (select 1 from public.projects pj where pj.id = (e ->> 'project_id')::uuid and pj.job_post_id is not null);
  res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' every listed project came from a job post' || E'\n';

  -- 4. An archived person --------------------------------------------------------------
  insert into public.archived_users (user_id) values (f2);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.admin_job_hires()::jsonb;
  reset role;
  res := res || case when not exists (select 1 from jsonb_array_elements(r2) e where (e ->> 'project_id')::uuid = pr_o2)
                      and exists (select 1 from jsonb_array_elements(r2) e where (e ->> 'project_id')::uuid = pr_o1)
                      and exists (select 1 from jsonb_array_elements(r2) e where (e ->> 'project_id')::uuid = pr_f1)
                     then 'PASS' else 'FAIL ' || jsonb_array_length(r2) end
         || ' archiving f2 takes their one hire out of the list (the other two stay)' || E'\n';
  select e into x from jsonb_array_elements(r2) e where (e ->> 'project_id')::uuid = pr_o1;
  res := res || case when (x ->> 'hired')::int = 2 then 'PASS' else 'FAIL ' || coalesce(x::text, 'missing') end
         || ' the post''s own hired number still counts its full record (2)' || E'\n';

  insert into public.archived_users (user_id) values (f1);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.admin_job_hires()::jsonb;
  reset role;
  res := res || case when not exists (select 1 from jsonb_array_elements(r2) e where (e ->> 'project_id')::uuid in (pr_o1, pr_o2, pr_f1))
                     then 'PASS' else 'FAIL ' || jsonb_array_length(r2) end
         || ' archiving f1 as well takes their two hires out (all three made-up hires gone)' || E'\n';

  insert into public.archived_users (user_id) values (cl);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.admin_job_hires()::jsonb;
  reset role;
  res := res || case when not exists (select 1 from jsonb_array_elements(r2) e where (e ->> 'job_post_id')::uuid in (p_open, p_filled, p_nobody))
                     then 'PASS' else 'FAIL' end || ' an archived client''s hires are not listed either' || E'\n';

  -- 5. Only an admin ----------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_job_hires(); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a normal user is refused' || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_job_hires(); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' the client who hired is refused too (the list is the admin''s)' || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_job_hires(); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a hired freelancer is refused too' || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  refused := false;
  begin perform public.admin_job_hires(); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a signed-out visitor is refused' || E'\n';
  reset role;

  raise exception E'ADMIN JOB HIRES TEST RESULTS:\n%', res;
end;
$t$;
