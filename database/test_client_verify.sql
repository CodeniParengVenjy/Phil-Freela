-- Test for supabase_client_verify_schema.sql (clients must be verified to post).
-- Run it in the Supabase SQL Editor after the schema file, or send the schema
-- file and this block together in ONE call to try it before applying (the error
-- at the end rolls the schema back too). It BORROWS real accounts (so no user
-- numbers are used): a client who is not verified, and a verified person whose
-- role is set to client for the block. It ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res      text := '';
  today    date := (now() at time zone 'Asia/Manila')::date;
  c_new    uuid;   -- a client who is not verified (and not blocked)
  c_ok     uuid;   -- a verified person, made a client for the block
  fr       uuid;   -- a verified freelancer (c_ok is used again, as a freelancer)
  old_post uuid;   -- a post the unverified client already had
  new_id   uuid;
  n        int;
  refused  boolean;
begin
  select p.id into c_new from public.profiles p
   where p.account_type = 'client' and not public.is_verified(p.id) and not public.is_posting_blocked(p.id)
     and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select p.id into c_ok from public.profiles p
   where public.is_verified(p.id) and not public.is_posting_blocked(p.id)
     and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  if c_new is null or c_ok is null then
    raise exception 'Needs a client who is not verified and one verified account already in the database.';
  end if;
  update public.profiles set account_type = 'client' where id = c_ok;

  -- An older post of the unverified client (added as the owner, as if it was
  -- posted before the rule).
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
  values (c_new, 'Test old post', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10) returning id into old_post;

  -- 1. A client who is not verified can't post.
  perform set_config('request.jwt.claims', json_build_object('sub', c_new, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (c_new, 'Test new post', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10);
  exception when insufficient_privilege then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 1 a client who is not verified cannot post' || E'\n';

  -- 2. ...but can still edit their own older post (the edit rule is not changed).
  update public.job_posts set title = 'Test old post, edited' where id = old_post;
  get diagnostics n = row_count;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' 2 the same client can still edit an older post (rows: ' || n || ')' || E'\n';

  -- 3. ...and still sees it (the view rule is not changed).
  select count(*) into n from public.job_posts where id = old_post;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' 3 the same client still sees their own post' || E'\n';
  reset role;

  -- 4. A verified client can post.
  perform set_config('request.jwt.claims', json_build_object('sub', c_ok, 'role', 'authenticated')::text, true);
  set local role authenticated;
  new_id := null;
  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (c_ok, 'Test verified post', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10) returning id into new_id;
  exception when others then
    res := res || 'note 4: ' || sqlerrm || E'\n';
  end;
  res := res || case when new_id is not null then 'PASS' else 'FAIL' end || ' 4 a verified client can post' || E'\n';

  -- 5. Nobody can post for someone else, even when verified.
  refused := false;
  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (c_new, 'Test post for another', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10);
  exception when insufficient_privilege then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 5 a verified client cannot post in another person''s name' || E'\n';
  reset role;

  -- 6. A verified freelancer still can't post a job (only clients post jobs).
  fr := c_ok;
  update public.profiles set account_type = 'freelancer' where id = fr;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin
    insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
    values (fr, 'Test freelancer post', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10);
  exception when insufficient_privilege then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 6 a verified freelancer still cannot post a job' || E'\n';
  reset role;

  raise exception E'Test results (everything is rolled back):\n%', res;
end
$t$;
