-- Test for admin_job_hiring() and admin_job_trail() in
-- supabase_admin_job_hiring_schema.sql. Send the schema file and this block
-- together in ONE call to try it before applying (the error at the end rolls the
-- schema back too), or run this alone in the Supabase SQL Editor after the
-- schema file. It BORROWS one admin, one normal user and four real accounts (so
-- no user numbers are used), adds four made-up job posts with applications and
-- hires as the database owner, and ends with an error that carries the PASS/FAIL
-- list; that error rolls everything back, so nothing is left behind. The two
-- e-mail triggers are switched off for the block (the switch rolls back too),
-- so nobody gets a message about made-up applications.
do $t$
declare
  res       text := '';
  today     date := (now() at time zone 'Asia/Manila')::date;
  adm       uuid;      -- a real admin
  usr       uuid;      -- a real normal user, who must be refused
  cl        uuid;      -- owns the made-up posts, is the client on the made-up hires
  f1        uuid;      -- hired on two posts
  f2        uuid;      -- hired on one post, applied to the expired one
  f3        uuid;      -- applied to the open post and was not hired
  p_open    uuid;      -- needs 3, has 3 applicants, 2 hired: still open
  p_filled  uuid;      -- needs 1, 1 hired: filled
  p_expired uuid;      -- due date passed, 1 applicant, nobody hired
  p_none    uuid;      -- open, nobody applied
  a_o1 uuid; a_o2 uuid; a_o3 uuid; a_f1 uuid; a_e2 uuid;
  b         jsonb;     -- admin_job_hiring() before the made-up data
  r         jsonb;     -- ... after it
  r2        jsonb;
  t         jsonb;     -- admin_job_trail() result
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
  select p.id into f3 from public.profiles p
   where p.id not in (cl, f1, f2) and not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  select p.id into usr from public.profiles p
   where p.id not in (cl, f1, f2, f3) and not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  if adm is null or f3 is null or usr is null then
    raise exception 'Needs one admin and five normal accounts already in the database.';
  end if;

  -- ---- before: the numbers without the made-up data -------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  b := public.admin_job_hiring()::jsonb;
  reset role;
  res := res || 'LIVE totals ' || (b -> 'totals')::text || E'\n';

  -- ---- made-up posts, applications and hires (as the owner) -----------------
  -- created_at is set so the order of the posts is known (newest first:
  -- p_none, p_open, p_filled, p_expired). The expired post was made 10 days ago,
  -- because a due date can't be before the day the post was made.
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date, created_at)
  values (cl, 'Test hiring open', 'graphic-design', 'x', 'project', 'project', 3, today, today + 10, now() - interval '2 minutes') returning id into p_open;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date, created_at)
  values (cl, 'Test hiring filled', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10, now() - interval '3 minutes') returning id into p_filled;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date, created_at)
  values (cl, 'Test hiring expired', 'graphic-design', 'x', 'project', 'project', 1, today - 10, today - 7, now() - interval '10 days') returning id into p_expired;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date, created_at)
  values (cl, 'Test hiring none', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10, now() - interval '1 minute') returning id into p_none;

  insert into public.job_applications (job_post_id, freelancer_id, resume_path, created_at) values
    (p_open, f1, f1::text || '/' || p_open::text || '-1.pdf', now() - interval '6 days') returning id into a_o1;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path, created_at) values
    (p_open, f2, f2::text || '/' || p_open::text || '-1.pdf', now() - interval '5 days') returning id into a_o2;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path, created_at) values
    (p_open, f3, f3::text || '/' || p_open::text || '-1.pdf', now() - interval '4 days') returning id into a_o3;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path) values
    (p_filled, f1, f1::text || '/' || p_filled::text || '-1.pdf') returning id into a_f1;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path) values
    (p_expired, f2, f2::text || '/' || p_expired::text || '-1.pdf') returning id into a_e2;

  -- f1 was hired first (5 days ago, still started), f2 two days ago (done).
  insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, due_date, status, started_at) values
    (a_o1, p_open, cl, f1, 'Test hiring open', today + 5, 'started', now() - interval '5 days'),
    (a_o2, p_open, cl, f2, 'Test hiring open', today + 5, 'done',    now() - interval '2 days'),
    (a_f1, p_filled, cl, f1, 'Test hiring filled', today + 5, 'submitted', now() - interval '1 day');

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_job_hiring()::jsonb;
  reset role;

  -- 1. The shape ---------------------------------------------------------------
  res := res || case when jsonb_typeof(r -> 'posts') = 'array' and jsonb_typeof(r -> 'totals') = 'object'
                     then 'PASS' else 'FAIL' end || ' a list of posts and a totals object' || E'\n';
  bad := 0;
  foreach k in array array['open', 'filled', 'expired', 'applications', 'hired'] loop
    if not (r -> 'totals' ? k) or jsonb_typeof(r -> 'totals' -> k) <> 'number' then bad := bad + 1; end if;
  end loop;
  res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' totals has open, filled, expired, applications and hired as numbers' || E'\n';
  select count(*) into bad from jsonb_array_elements(r -> 'posts') e
   where not (e ? 'id' and e ? 'state' and e ? 'applicants' and e ? 'hired')
      or e ->> 'state' not in ('open', 'filled', 'expired');
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end || ' every post has id, state, applicants and hired, and a valid state' || E'\n';
  select count(*) into n from jsonb_array_elements(r -> 'posts');
  res := res || case when n = (select count(*) from public.job_posts) then 'PASS' else 'FAIL' end || ' one entry for every post in the table (' || n || ')' || E'\n';
  select count(*) - count(distinct e ->> 'id') into bad from jsonb_array_elements(r -> 'posts') e;
  res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' no post is listed twice' || E'\n';

  -- 2. Each made-up post has the right state and numbers ------------------------
  select e into x from jsonb_array_elements(r -> 'posts') e where (e ->> 'id')::uuid = p_open;
  res := res || case when x ->> 'state' = 'open' and (x ->> 'applicants')::int = 3 and (x ->> 'hired')::int = 2
                     then 'PASS' else 'FAIL ' || coalesce(x::text, 'missing') end || ' needs 3, 3 applied, 2 hired: open, 3 applicants, hired 2' || E'\n';
  select e into x from jsonb_array_elements(r -> 'posts') e where (e ->> 'id')::uuid = p_filled;
  res := res || case when x ->> 'state' = 'filled' and (x ->> 'applicants')::int = 1 and (x ->> 'hired')::int = 1
                     then 'PASS' else 'FAIL ' || coalesce(x::text, 'missing') end || ' needs 1, 1 hired: filled, 1 applicant, hired 1' || E'\n';
  select e into x from jsonb_array_elements(r -> 'posts') e where (e ->> 'id')::uuid = p_expired;
  res := res || case when x ->> 'state' = 'expired' and (x ->> 'applicants')::int = 1 and (x ->> 'hired')::int = 0
                     then 'PASS' else 'FAIL ' || coalesce(x::text, 'missing') end || ' due date passed, nobody hired: expired, 1 applicant, hired 0' || E'\n';
  select e into x from jsonb_array_elements(r -> 'posts') e where (e ->> 'id')::uuid = p_none;
  res := res || case when x ->> 'state' = 'open' and (x ->> 'applicants')::int = 0 and (x ->> 'hired')::int = 0
                     then 'PASS' else 'FAIL ' || coalesce(x::text, 'missing') end || ' nobody applied: open, 0 applicants, hired 0' || E'\n';

  -- The state is the same answer job_state() gives, for every post.
  select count(*) into bad from jsonb_array_elements(r -> 'posts') e
   where e ->> 'state' is distinct from public.job_state((e ->> 'id')::uuid);
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end || ' every state equals job_state()' || E'\n';
  -- The numbers equal counting the tables directly, for every post.
  select count(*) into bad from jsonb_array_elements(r -> 'posts') e
   where (e ->> 'applicants')::int <> (select count(*) from public.job_applications a where a.job_post_id = (e ->> 'id')::uuid)
      or (e ->> 'hired')::int <> (select count(*) from public.projects p where p.job_post_id = (e ->> 'id')::uuid);
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end || ' every applicants and hired number equals counting the tables' || E'\n';

  -- Newest post first.
  res := res || case when
           (select o from jsonb_array_elements(r -> 'posts') with ordinality as q(e, o) where (e ->> 'id')::uuid = p_none)
         < (select o from jsonb_array_elements(r -> 'posts') with ordinality as q(e, o) where (e ->> 'id')::uuid = p_open)
       and (select o from jsonb_array_elements(r -> 'posts') with ordinality as q(e, o) where (e ->> 'id')::uuid = p_open)
         < (select o from jsonb_array_elements(r -> 'posts') with ordinality as q(e, o) where (e ->> 'id')::uuid = p_filled)
       and (select o from jsonb_array_elements(r -> 'posts') with ordinality as q(e, o) where (e ->> 'id')::uuid = p_filled)
         < (select o from jsonb_array_elements(r -> 'posts') with ordinality as q(e, o) where (e ->> 'id')::uuid = p_expired)
       then 'PASS' else 'FAIL' end || ' newest post first' || E'\n';

  -- 3. Totals ------------------------------------------------------------------
  res := res || case when (r -> 'totals' ->> 'open')::int      = (b -> 'totals' ->> 'open')::int + 2
                      and (r -> 'totals' ->> 'filled')::int    = (b -> 'totals' ->> 'filled')::int + 1
                      and (r -> 'totals' ->> 'expired')::int   = (b -> 'totals' ->> 'expired')::int + 1
                      and (r -> 'totals' ->> 'applications')::int = (b -> 'totals' ->> 'applications')::int + 5
                      and (r -> 'totals' ->> 'hired')::int     = (b -> 'totals' ->> 'hired')::int + 3
                     then 'PASS' else 'FAIL ' || (r -> 'totals')::text end
         || ' totals moved by the made-up data: open +2, filled +1, expired +1, applications +5, hired +3' || E'\n';
  select count(*) into want from public.job_posts j
   where public.job_state(j.id) = 'open' and not exists (select 1 from public.archived_users a where a.user_id = j.client_id);
  res := res || case when want = (r -> 'totals' ->> 'open')::int then 'PASS' else 'FAIL' end || ' open total equals counting the posts directly (' || want || ')' || E'\n';
  select count(*) into want from public.projects p
   where p.job_post_id is not null and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id));
  res := res || case when want = (r -> 'totals' ->> 'hired')::int then 'PASS' else 'FAIL' end || ' hired total equals counting the projects directly (' || want || ')' || E'\n';
  -- A project that did not come from a job post (a booking) is not a hire.
  select count(*) into n from public.projects where job_post_id is null;
  res := res || 'INFO ' || n || ' project(s) in the table did not come from a job post and are not counted as hires' || E'\n';

  -- 4. The trail of one post -----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.admin_job_trail(p_open)::jsonb;
  reset role;
  res := res || case when jsonb_typeof(t) = 'array' and jsonb_array_length(t) = 3 then 'PASS' else 'FAIL ' || t::text end
         || ' the open post has three applicants in its trail' || E'\n';
  select count(*) into bad from jsonb_array_elements(t) e
   where not (e ? 'application_id' and e ? 'freelancer_id' and e ? 'full_name' and e ? 'username' and e ? 'avatar_path'
          and e ? 'archived' and e ? 'applied_at' and e ? 'project_id' and e ? 'project_status' and e ? 'hired_at' and e ? 'due_date');
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end || ' every entry has all its fields' || E'\n';
  -- hired first, earliest hire first, then the one who was not hired
  res := res || case when (t -> 0 ->> 'freelancer_id')::uuid = f1 and t -> 0 ->> 'project_status' = 'started'
                      and (t -> 1 ->> 'freelancer_id')::uuid = f2 and t -> 1 ->> 'project_status' = 'done'
                      and (t -> 2 ->> 'freelancer_id')::uuid = f3 and jsonb_typeof(t -> 2 -> 'project_id') = 'null'
                     then 'PASS' else 'FAIL ' || t::text end
         || ' order: f1 (hired first, started), f2 (hired later, done), f3 (not hired)' || E'\n';
  res := res || case when jsonb_typeof(t -> 2 -> 'project_status') = 'null' and jsonb_typeof(t -> 2 -> 'hired_at') = 'null'
                      and jsonb_typeof(t -> 2 -> 'due_date') = 'null' and t -> 0 ->> 'hired_at' is not null and t -> 0 ->> 'due_date' is not null
                     then 'PASS' else 'FAIL' end || ' a hired entry has its hire date and due date, an applicant who was not hired has none' || E'\n';
  select count(*) into bad from jsonb_array_elements(t) e
   where e ->> 'full_name' is distinct from (select p.full_name from public.profiles p where p.id = (e ->> 'freelancer_id')::uuid)
      or e ->> 'username' is distinct from (select p.username from public.profiles p where p.id = (e ->> 'freelancer_id')::uuid);
  res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' names come from the profiles' || E'\n';
  select count(*) into bad from jsonb_array_elements(t) e where e ? 'resume_path' or e ? 'cover_note';
  res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' no resume or cover note is returned' || E'\n';
  -- the project ids are the real hires
  select count(*) into bad from jsonb_array_elements(t) e
   where e ->> 'project_id' is not null
     and not exists (select 1 from public.projects p where p.id = (e ->> 'project_id')::uuid and p.job_post_id = p_open and p.freelancer_id = (e ->> 'freelancer_id')::uuid);
  res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' every project in the trail is a real hire from this post by that person' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.admin_job_trail(p_none)::jsonb;
  res := res || case when t = '[]'::jsonb then 'PASS' else 'FAIL ' || t::text end || ' a post nobody applied to has an empty trail' || E'\n';
  t := public.admin_job_trail(gen_random_uuid())::jsonb;
  res := res || case when t = '[]'::jsonb then 'PASS' else 'FAIL' end || ' a post that does not exist has an empty trail' || E'\n';
  t := public.admin_job_trail(p_expired)::jsonb;
  res := res || case when jsonb_array_length(t) = 1 and (t -> 0 ->> 'freelancer_id')::uuid = f2 and jsonb_typeof(t -> 0 -> 'project_id') = 'null'
                     then 'PASS' else 'FAIL ' || t::text end || ' the expired post shows its one applicant, not hired' || E'\n';
  t := public.admin_job_trail(p_filled)::jsonb;
  res := res || case when jsonb_array_length(t) = 1 and (t -> 0 ->> 'freelancer_id')::uuid = f1 and t -> 0 ->> 'project_status' = 'submitted'
                     then 'PASS' else 'FAIL ' || t::text end || ' the filled post shows its one hire with the project status' || E'\n';
  reset role;

  -- 5. An archived person ----------------------------------------------------------
  insert into public.archived_users (user_id) values (f3);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.admin_job_hiring()::jsonb;
  t := public.admin_job_trail(p_open)::jsonb;
  reset role;
  res := res || case when (r2 -> 'totals' ->> 'applications')::int = (r -> 'totals' ->> 'applications')::int - 1
                      and (r2 -> 'totals' ->> 'hired')::int = (r -> 'totals' ->> 'hired')::int
                     then 'PASS' else 'FAIL ' || (r2 -> 'totals')::text end
         || ' archiving f3 takes their application out of the total (applications -1, hired the same)' || E'\n';
  select e into x from jsonb_array_elements(r2 -> 'posts') e where (e ->> 'id')::uuid = p_open;
  res := res || case when (x ->> 'applicants')::int = 3 and (x ->> 'hired')::int = 2 then 'PASS' else 'FAIL' end
         || ' the post''s own numbers still show its full record (3 applicants)' || E'\n';
  res := res || case when jsonb_array_length(t) = 3
                      and (select (e ->> 'archived')::boolean from jsonb_array_elements(t) e where (e ->> 'freelancer_id')::uuid = f3)
                      and not (select (e ->> 'archived')::boolean from jsonb_array_elements(t) e where (e ->> 'freelancer_id')::uuid = f2)
                     then 'PASS' else 'FAIL' end || ' the trail still lists f3 but marks them archived (and not f2)' || E'\n';

  insert into public.archived_users (user_id) values (f1);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_job_hiring()::jsonb;
  reset role;
  res := res || case when (r -> 'totals' ->> 'hired')::int = (r2 -> 'totals' ->> 'hired')::int - 2
                      and (r -> 'totals' ->> 'applications')::int = (r2 -> 'totals' ->> 'applications')::int - 2
                     then 'PASS' else 'FAIL ' || (r -> 'totals')::text end
         || ' archiving f1 (hired on two posts) takes 2 hires and 2 applications out of the totals' || E'\n';

  insert into public.archived_users (user_id) values (cl);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.admin_job_hiring()::jsonb;
  reset role;
  res := res || case when (r2 -> 'totals' ->> 'open')::int = (r -> 'totals' ->> 'open')::int - 2
                      and (r2 -> 'totals' ->> 'filled')::int = (r -> 'totals' ->> 'filled')::int - 1
                      and (r2 -> 'totals' ->> 'expired')::int = (r -> 'totals' ->> 'expired')::int - 1
                     then 'PASS' else 'FAIL ' || (r2 -> 'totals')::text end
         || ' archiving the client takes their 4 posts out of the open, filled and expired totals' || E'\n';
  select count(*) into n from jsonb_array_elements(r2 -> 'posts') e where (e ->> 'id')::uuid in (p_open, p_filled, p_expired, p_none);
  res := res || case when n = 4 then 'PASS' else 'FAIL' end || ' but the list of posts still has all four (the admin still manages them)' || E'\n';

  -- 6. Only an admin ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_job_hiring(); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a normal user is refused (admin_job_hiring)' || E'\n';
  refused := false;
  begin perform public.admin_job_trail(p_open); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a normal user is refused (admin_job_trail)' || E'\n';
  -- the client who owns the post is not an admin either
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_job_trail(p_open); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' the post''s own client is refused too (the trail is the admin''s)' || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  refused := false;
  begin perform public.admin_job_hiring(); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a signed-out visitor is refused (admin_job_hiring)' || E'\n';
  refused := false;
  begin perform public.admin_job_trail(p_open); exception when others then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a signed-out visitor is refused (admin_job_trail)' || E'\n';
  reset role;

  raise exception E'ADMIN JOB HIRING TEST RESULTS:\n%', res;
end;
$t$;
