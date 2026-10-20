-- Test for supabase_post_edit_schema.sql. Send the schema file and this block
-- together in ONE call to try it before applying (the error at the end rolls
-- the schema back too), or run this alone in the Supabase SQL Editor after the
-- schema file. It BORROWS a real freelancer, a real client and one more real
-- user (so no user numbers are used up), adds made-up posts and reports, and
-- ends with an error that carries the PASS/FAIL list; that error rolls
-- everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  fr uuid;                       -- a real freelancer, borrowed (owns the made-up service)
  cl uuid;                       -- a real client, borrowed (owns the made-up job)
  stranger uuid;                 -- another real user: edits what is not theirs, sends reports
  svc uuid;                      -- made-up service (will be edited)
  svc2 uuid;                     -- made-up service (saved without changes)
  job uuid;                      -- made-up job post (will be edited)
  job2 uuid;                     -- made-up job post (saved without changes)
  t timestamptz;
  n int;
  cur_title text;
  rid uuid;
  rr record;
  refused boolean;
  missing int;
  seq_before bigint;
  seq_after bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  select p.id into fr from public.profiles p
   where p.account_type = 'freelancer'
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not exists (select 1 from public.user_suspensions s where s.user_id = p.id) limit 1;
  select p.id into cl from public.profiles p
   where p.account_type = 'client'
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not exists (select 1 from public.user_suspensions s where s.user_id = p.id) limit 1;
  select p.id into stranger from public.profiles p
   where p.id not in (fr, cl)
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not exists (select 1 from public.user_suspensions s where s.user_id = p.id) limit 1;
  if fr is null or cl is null or stranger is null then
    raise exception 'The test needs a freelancer, a client and a third user with profiles, none of them an admin or suspended.';
  end if;

  -- Made-up posts, added as the database owner (no sign-in rules apply to that).
  insert into public.services (freelancer_id, title, category, description) values (fr, 'Edit test service', 'Design', 'First text.') returning id into svc;
  insert into public.services (freelancer_id, title, category, description) values (fr, 'Edit test service B', 'Design', 'First text.') returning id into svc2;
  insert into public.job_posts (client_id, title, category, description) values (cl, 'Edit test job', 'Design', 'First text.') returning id into job;
  insert into public.job_posts (client_id, title, category, description) values (cl, 'Edit test job B', 'Design', 'First text.') returning id into job2;

  -- 1. The reports that were already there got their copy (only runs after the schema).
  select count(*) into missing from public.reports r
   where (r.target_type = 'service' and exists (select 1 from public.services s where s.id = r.target_id and s.id not in (svc, svc2)) and r.target_title is null)
      or (r.target_type = 'job_post' and exists (select 1 from public.job_posts j where j.id = r.target_id and j.id not in (job, job2)) and r.target_title is null);
  res := res || E'\n' || case when missing = 0 then 'PASS  ' else 'FAIL  ' end || '1. every older report about a post that still exists got its title and owner (' || missing || ' without)';

  -- 2. A freelancer edits their service.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', fr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);

  select updated_at into t from public.services where id = svc;
  res := res || E'\n' || case when t is null then 'PASS  ' else 'FAIL  ' end || '2a. a new service has no Edited date';

  update public.services set title = 'Edit test service (changed)', description = 'Second text.' where id = svc;
  select updated_at into t from public.services where id = svc;
  res := res || E'\n' || case when t is not null and t >= now() - interval '1 minute' then 'PASS  ' else 'FAIL  ' end || '2b. changing the text sets the Edited date';

  update public.services set title = title where id = svc2;
  select updated_at into t from public.services where id = svc2;
  res := res || E'\n' || case when t is null then 'PASS  ' else 'FAIL  ' end || '2c. saving without changing anything leaves the date empty';

  update public.services set updated_at = '2000-01-01' where id = svc2;
  select updated_at into t from public.services where id = svc2;
  res := res || E'\n' || case when t is null then 'PASS  ' else 'FAIL  ' end || '2d. a date sent by the browser alone is ignored';

  update public.services set updated_at = '2000-01-01', price = 1234 where id = svc2;
  select updated_at into t from public.services where id = svc2;
  res := res || E'\n' || case when t >= now() - interval '1 minute' then 'PASS  ' else 'FAIL  ' end || '2e. a date sent along with a real change is replaced by the real time';

  -- 3. A client edits their job post.
  perform set_config('request.jwt.claim.sub', cl::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);

  update public.job_posts set title = 'Edit test job (changed)', budget = 999, skills = array['Logo'] where id = job;
  select updated_at into t from public.job_posts where id = job;
  res := res || E'\n' || case when t >= now() - interval '1 minute' then 'PASS  ' else 'FAIL  ' end || '3a. changing a job post sets the Edited date';

  update public.job_posts set title = title where id = job2;
  select updated_at into t from public.job_posts where id = job2;
  res := res || E'\n' || case when t is null then 'PASS  ' else 'FAIL  ' end || '3b. saving a job post without changes leaves the date empty';

  -- 4. Someone else can't edit what isn't theirs.
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);

  update public.services set title = 'taken over' where id = svc;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '4a. another user changes no service of someone else (' || n || ' rows)';
  update public.job_posts set title = 'taken over' where id = job;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '4b. another user changes no job post of someone else (' || n || ' rows)';

  -- 5. The report keeps a copy of what was reported.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select title into cur_title from public.services where id = svc;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);

  -- The browser tries to write its own title and owner into the report.
  insert into public.reports (reporter_id, target_type, target_id, reason, target_title, target_owner_id)
  values (stranger, 'service', svc, 'spam', 'MADE UP TITLE', stranger) returning id into rid;
  select target_title, target_owner_id into rr from public.reports where id = rid;
  res := res || E'\n' || case when rr.target_title = cur_title and rr.target_owner_id = fr then 'PASS  ' else 'FAIL  ' end || '5a. a report about a service keeps the real title and owner, not what the browser sent';

  insert into public.reports (reporter_id, target_type, target_id, reason, target_title, target_owner_id)
  values (stranger, 'job_post', job, 'scam', 'MADE UP TITLE', stranger) returning id into rid;
  select target_title, target_owner_id into rr from public.reports where id = rid;
  res := res || E'\n' || case when rr.target_title = 'Edit test job (changed)' and rr.target_owner_id = cl then 'PASS  ' else 'FAIL  ' end || '5b. a report about a job post keeps the real title and owner';

  insert into public.reports (reporter_id, target_type, target_id, reason, target_title, target_owner_id)
  values (stranger, 'user', cl, 'harassment', 'MADE UP TITLE', stranger) returning id into rid;
  select target_title, target_owner_id into rr from public.reports where id = rid;
  res := res || E'\n' || case when rr.target_title is null and rr.target_owner_id is null then 'PASS  ' else 'FAIL  ' end || '5c. a report about a person has no copy, and what the browser sent is thrown away';

  insert into public.reports (reporter_id, target_type, target_id, reason, target_title, target_owner_id)
  values (stranger, 'service', gen_random_uuid(), 'other', 'MADE UP TITLE', stranger) returning id into rid;
  select target_title, target_owner_id into rr from public.reports where id = rid;
  res := res || E'\n' || case when rr.target_title is null and rr.target_owner_id is null then 'PASS  ' else 'FAIL  ' end || '5d. a report about a post that does not exist has no copy';

  -- 6. Someone blocked from posting can't edit, the same rule as posting.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  -- Switched off so the test doesn't send the made-up suspension notices around.
  alter table public.user_suspensions disable trigger user_suspensions_notify;
  insert into public.user_suspensions (user_id, reason, violation, ends_at, blocks_posting, blocks_messaging)
  values (fr, 'edit test', 'spam', now() + interval '1 day', true, false),
         (cl, 'edit test', 'spam', now() + interval '1 day', true, false);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', fr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  refused := false;
  begin
    update public.services set title = 'sneaky edit' where id = svc;
  exception when insufficient_privilege then
    refused := true;
  end;
  res := res || E'\n' || case when refused then 'PASS  ' else 'FAIL  ' end || '6a. a freelancer blocked from posting is refused when editing a service';

  perform set_config('request.jwt.claim.sub', cl::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  refused := false;
  begin
    update public.job_posts set title = 'sneaky edit' where id = job;
  exception when insufficient_privilege then
    refused := true;
  end;
  res := res || E'\n' || case when refused then 'PASS  ' else 'FAIL  ' end || '6b. a client blocked from posting is refused when editing a job post';

  -- 7. No user numbers were used up.
  reset role;
  select last_value into seq_after from public.user_number_seq;
  res := res || E'\n' || case when seq_before = seq_after then 'PASS  ' else 'FAIL  ' end || '7. the user number counter did not move (' || seq_before || ' -> ' || seq_after || ')';

  raise exception E'RESULTS (everything rolled back):%', res;
end
$t$;
