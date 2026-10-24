-- Test for supabase_job_post_details_schema.sql. Send the schema file and this
-- block together in ONE call to try it before applying (the error at the end
-- rolls the schema back too), or run this alone in the Supabase SQL Editor
-- after the schema file. It BORROWS a real client, two real verified
-- freelancers, a real admin and one more real user (so no user numbers are used
-- up), adds made-up job posts and applications, and ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing is
-- left behind. The two e-mail triggers are switched off for the block (the
-- switch rolls back too), so nobody gets a message about made-up applications.
do $t$
declare
  res text := '';
  today date := (now() at time zone 'Asia/Manila')::date;
  cl uuid;                       -- a real client, borrowed: owns the made-up jobs
  fr1 uuid;                      -- a real verified freelancer: applies, is hired
  fr2 uuid;                      -- a second real verified freelancer
  adm uuid;                      -- a real admin
  outsider uuid;                 -- another real user who never applies
  j_open uuid;                   -- open: due in 10 days, needs 1 freelancer
  j_old uuid;                    -- made 10 days ago, due 7 days ago: expired
  j_two uuid;                    -- needs 2 freelancers
  j_edge uuid;                   -- due today: still open
  j_ai uuid;                     -- has skills (for the AI text)
  j_new uuid;                    -- made through the client's own insert
  a_old uuid;
  a1 uuid;
  a2 uuid;
  a3 uuid;
  a4 uuid;
  proj uuid;
  n int;
  st text;
  err text;
  h1 text;
  h2 text;
  v extensions.vector;
  row_new record;
  seq_before bigint;
  seq_after bigint;
  fails int;
begin
  select last_value into seq_before from public.user_number_seq;

  select p.id into cl from public.profiles p
   where p.account_type = 'client'
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not public.is_posting_blocked(p.id) order by p.id limit 1;
  select p.id into fr1 from public.profiles p
   where p.account_type = 'freelancer' and public.is_verified(p.id)
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not public.is_posting_blocked(p.id) order by p.id limit 1;
  select p.id into fr2 from public.profiles p
   where p.account_type = 'freelancer' and public.is_verified(p.id) and p.id <> fr1
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not public.is_posting_blocked(p.id) order by p.id limit 1;
  select a.id into adm from public.admins a where not a.must_change_password order by a.id limit 1;
  select p.id into outsider from public.profiles p
   where p.id not in (cl, fr1, fr2) and (adm is null or p.id <> adm)
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not public.is_posting_blocked(p.id) order by p.id limit 1;
  if cl is null or fr1 is null or fr2 is null or adm is null or outsider is null then
    raise exception 'The test needs a client, two verified freelancers, an admin and one more user, none of them suspended.';
  end if;

  alter table public.job_applications disable trigger email_offline_on_application;
  alter table public.user_notifications disable trigger email_offline_on_notification;

  -- 1. The client posts (the rules on the new columns). -----------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', cl::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);

  begin
    insert into public.job_posts (client_id, title, category, description)
    values (cl, 'T no dates', 'graphic-design', 'x');
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%null value%' and (err like '%start_date%' or err like '%due_date%') then 'PASS  ' else 'FAIL  ' end || '1a. a job post without start and due dates is refused (' || left(err, 70) || ')';

  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (cl, 'T', 'graphic-design', 'x', 'gig', 'project', 1, today, today + 5);
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%job_posts_job_type_check%' then 'PASS  ' else 'FAIL  ' end || '1b. a type other than project or job is refused';

  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (cl, 'T', 'graphic-design', 'x', 'project', 'hour', 1, today, today + 5);
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%job_posts_budget_type_check%' then 'PASS  ' else 'FAIL  ' end || '1c. a budget basis other than project, day or month is refused';

  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (cl, 'T', 'graphic-design', 'x', 'project', 'project', 0, today, today + 5);
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%job_posts_freelancers_needed_check%' then 'PASS  ' else 'FAIL  ' end || '1d. needing 0 freelancers is refused';

  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (cl, 'T', 'graphic-design', 'x', 'project', 'project', 11, today, today + 5);
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%job_posts_freelancers_needed_check%' then 'PASS  ' else 'FAIL  ' end || '1e. needing 11 freelancers is refused (the most is 10)';

  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (cl, 'T', 'graphic-design', 'x', 'project', 'project', 1, today - 1, today + 5);
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%job_posts_start_date_check%' then 'PASS  ' else 'FAIL  ' end || '1f. a start date before the day of posting is refused';

  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (cl, 'T', 'graphic-design', 'x', 'project', 'project', 1, today + 5, today + 2);
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%job_posts_dates_order_check%' then 'PASS  ' else 'FAIL  ' end || '1g. a due date before the start date is refused';

  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, budget, freelancers_needed, start_date, due_date, skills)
  values (cl, 'Test ongoing job', 'virtual-assistant', 'x', 'job', 'month', 20000, 2, today + 1, today + 30, array['Data Entry'])
  returning id into j_new;
  select job_type, budget_type, freelancers_needed, start_date, due_date into row_new from public.job_posts where id = j_new;
  res := res || E'\n' || case when row_new.job_type = 'job' and row_new.budget_type = 'month' and row_new.freelancers_needed = 2
                               and row_new.start_date = today + 1 and row_new.due_date = today + 30 then 'PASS  ' else 'FAIL  ' end || '1h. a complete ongoing job (per month, 2 freelancers, 30 days) is saved as sent';

  -- Made-up posts for the rest, added as the database owner. -----------------
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
  values (cl, 'Test open job', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10) returning id into j_open;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date, created_at)
  values (cl, 'Test old job', 'graphic-design', 'x', 'project', 'project', 1, today - 10, today - 7, now() - interval '10 days') returning id into j_old;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
  values (cl, 'Test job for two', 'graphic-design', 'x', 'job', 'day', 2, today, today + 10) returning id into j_two;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
  values (cl, 'Test job due today', 'graphic-design', 'x', 'project', 'project', 1, today, today) returning id into j_edge;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date, skills)
  values (cl, 'Test job with skills', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10, array['Logo Design', 'Branding']) returning id into j_ai;

  -- 2. The state of a post. ---------------------------------------------------
  res := res || E'\n' || case when public.job_state(j_open) = 'open' then 'PASS  ' else 'FAIL  ' end || '2a. a post due in 10 days is open';
  res := res || E'\n' || case when public.job_state(j_old) = 'expired' then 'PASS  ' else 'FAIL  ' end || '2b. a post whose due date passed is expired';
  res := res || E'\n' || case when public.job_state(j_edge) = 'open' then 'PASS  ' else 'FAIL  ' end || '2c. a post due today is still open (the day ends at midnight)';
  res := res || E'\n' || case when public.job_state(gen_random_uuid()) is null then 'PASS  ' else 'FAIL  ' end || '2d. a post that does not exist has no state';

  -- 3. Who sees what. --------------------------------------------------------
  -- fr1 applied to the old post back when it was open (added as the owner).
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (j_old, fr1, fr1::text || '/' || j_old::text || '-1.pdf') returning id into a_old;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id in (j_open, j_edge, j_two, j_ai);
  res := res || E'\n' || case when n = 4 then 'PASS  ' else 'FAIL  ' end || '3a. another user sees the open posts (' || n || ' of 4)';
  select count(*) into n from public.job_posts where id = j_old;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3b. another user does not see the expired post';

  perform set_config('request.jwt.claim.sub', fr1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id = j_old;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3c. the freelancer who applied still sees the expired post';

  -- Find Jobs asks for job_state = 'open' as well (the column form of job_state):
  -- the applicant above can SEE the expired post, but it is not listed as an opening.
  select count(*) into n from public.job_posts where id in (j_open, j_old, j_two, j_edge, j_ai) and job_posts.job_state = 'open';
  res := res || E'\n' || case when n = 4 then 'PASS  ' else 'FAIL  ' end || '3c2. with the open-only filter the applicant''s list has the 4 open posts and not the expired one (' || n || ' of 4)';
  select job_posts.job_state into st from public.job_posts where id = j_old;
  res := res || E'\n' || case when st = 'expired' then 'PASS  ' else 'FAIL  ' end || '3c3. the column form says expired for the expired post (' || coalesce(st, 'nothing') || ')';

  perform set_config('request.jwt.claim.sub', cl::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id in (j_open, j_old, j_two, j_edge, j_ai, j_new);
  res := res || E'\n' || case when n = 6 then 'PASS  ' else 'FAIL  ' end || '3d. the owner sees all their posts, expired ones too (' || n || ' of 6)';

  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id = j_old;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3e. an admin sees the expired post';

  -- 4. Applying. -------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', fr1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr1, 'role', 'authenticated')::text, true);
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (j_open, fr1, fr1::text || '/' || j_open::text || '-1.pdf') returning id into a1;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (j_two, fr1, fr1::text || '/' || j_two::text || '-1.pdf') returning id into a3;
  res := res || E'\n' || 'PASS  4a. a verified freelancer applies to open posts';

  perform set_config('request.jwt.claim.sub', fr2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr2, 'role', 'authenticated')::text, true);
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (j_open, fr2, fr2::text || '/' || j_open::text || '-1.pdf') returning id into a2;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (j_two, fr2, fr2::text || '/' || j_two::text || '-1.pdf') returning id into a4;
  begin
    insert into public.job_applications (job_post_id, freelancer_id, resume_path)
    values (j_old, fr2, fr2::text || '/' || j_old::text || '-1.pdf');
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err <> 'accepted' then 'PASS  ' else 'FAIL  ' end || '4b. applying to an expired post is refused by the database (' || left(err, 60) || ')';

  -- 5. Hiring. ---------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', cl::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);

  begin
    proj := public.hire_applicant(a_old, 'note', today + 5);
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%due date has passed%' then 'PASS  ' else 'FAIL  ' end || '5a. hiring for an expired post is refused (' || left(err, 60) || ')';

  proj := public.hire_applicant(a1, 'note', today + 5);
  res := res || E'\n' || case when proj is not null then 'PASS  ' else 'FAIL  ' end || '5b. hiring the first freelancer works';
  res := res || E'\n' || case when public.job_state(j_open) = 'filled' then 'PASS  ' else 'FAIL  ' end || '5c. a post that needed 1 freelancer is filled after one hire';

  begin
    proj := public.hire_applicant(a2, 'note', today + 5);
    err := 'accepted';
  exception when others then err := sqlerrm;
  end;
  res := res || E'\n' || case when err like '%all the freelancers it needed%' then 'PASS  ' else 'FAIL  ' end || '5d. a second hire on a filled post is refused (' || left(err, 60) || ')';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id = j_open;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '5e. a filled post is hidden from other users';

  perform set_config('request.jwt.claim.sub', fr1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id = j_open;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '5f. the hired freelancer still sees the filled post';

  -- Raising the number needed opens it again, and the second hire works.
  perform set_config('request.jwt.claim.sub', cl::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  update public.job_posts set freelancers_needed = 2 where id = j_open;
  res := res || E'\n' || case when public.job_state(j_open) = 'open' then 'PASS  ' else 'FAIL  ' end || '5g. raising "freelancers needed" opens a filled post again';
  proj := public.hire_applicant(a2, 'note', today + 5);
  res := res || E'\n' || case when public.job_state(j_open) = 'filled' then 'PASS  ' else 'FAIL  ' end || '5h. after the second hire the post is filled again';

  -- A post for two stays open after the first hire.
  proj := public.hire_applicant(a3, 'note', today + 5);
  res := res || E'\n' || case when public.job_state(j_two) = 'open' then 'PASS  ' else 'FAIL  ' end || '5i. a post that needs 2 is still open after the first hire';
  proj := public.hire_applicant(a4, 'note', today + 5);
  res := res || E'\n' || case when public.job_state(j_two) = 'filled' then 'PASS  ' else 'FAIL  ' end || '5j. and filled after the second';

  -- 6. The AI side (service role functions, run here as the database owner). --
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  select l.skill, l.text_hash into h1, st from public.listings_to_embed(1000) l where l.post_id = j_ai;
  res := res || E'\n' || case when h1 = 'Logo Design, Branding' then 'PASS  ' else 'FAIL  ' end || '6a. a job''s skills are part of the text the AI reads (' || coalesce(h1, 'nothing') || ')';
  update public.job_posts set skills = array['Logo Design'] where id = j_ai;
  select l.text_hash into h2 from public.listings_to_embed(1000) l where l.post_id = j_ai;
  res := res || E'\n' || case when h2 is distinct from st then 'PASS  ' else 'FAIL  ' end || '6b. changing the skills changes the fingerprint, so the AI re-reads the post';

  v := array_fill(0.05::real, array[384])::extensions.vector;
  insert into public.listing_embeddings (job_post_id, embedding, text_hash) values (j_edge, v, 'test'), (j_old, v, 'test'), (j_open, v, 'test');
  select count(*) into n from public.closest_listings(v, 1000) c where c.post_id = j_edge;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '6c. the AI search finds an open post';
  select count(*) into n from public.closest_listings(v, 1000) c where c.post_id in (j_old, j_open);
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '6d. the AI search leaves out an expired post and a filled post (' || n || ' found)';

  select count(*) into n from public.recent_open_jobs(fr1, 1000) r where r.job_id = j_edge;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '6e. the newest-open-jobs list has the open post';
  select count(*) into n from public.recent_open_jobs(fr1, 1000) r where r.job_id in (j_old, j_open, j_two);
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '6f. and not the expired or filled ones (' || n || ' found)';

  select count(*) into n from public.content_candidates(fr1, 'jobs', 50);
  select count(*) into n from public.collaborative_candidates(fr1, 'jobs', 50);
  res := res || E'\n' || 'PASS  6g. both recommendation functions still run';

  -- 7. Reopening an expired post by giving it new dates. ----------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', cl::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  update public.job_posts set start_date = today, due_date = today + 5 where id = j_old;
  res := res || E'\n' || case when public.job_state(j_old) = 'open' then 'PASS  ' else 'FAIL  ' end || '7a. giving an expired post new dates opens it again';
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where id = j_old;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '7b. and other users see it again';

  -- 8. Housekeeping. ---------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.job_posts where start_date is null or due_date is null;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '8a. no job post is left without a start date or a due date (' || n || ' without)';
  select last_value into seq_after from public.user_number_seq;
  res := res || E'\n' || case when seq_before = seq_after then 'PASS  ' else 'FAIL  ' end || '8b. the user number counter did not move (' || seq_before || ' -> ' || seq_after || ')';

  fails := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'RESULTS (everything rolled back): % failed%', fails, res;
end
$t$;
