-- Rolled-back test of supabase_job_terms_schema.sql (2026-11-20): run after the
-- schema file (or in the same call, before it is applied for real). It ends
-- with raise exception, so nothing it changes is kept; the PASS/FAIL lines come
-- back in the error message.

do $$
declare
  out text := '';
  cl uuid; fr uuid;
  jp uuid; jp2 uuid; app uuid;
  pr uuid; pr2 uuid; pr3 uuid;
  rev text; terms text;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  select p.id into cl from public.profiles p
   where p.account_type = 'client' and not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  select p.id into fr from public.profiles p
   where p.id <> cl and p.account_type = 'freelancer' and not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  if cl is null or fr is null then
    raise exception 'Needs one client and one freelancer already in the database.';
  end if;

  -- 1. A post saves revisions and terms, and hides bad words in the terms.
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date, revisions, extra_terms)
  values (cl, 'Test terms post', 'graphic-design', 'x', 'project', 'project', 2, today, today + 10, '2', 'Extra revisions cost 300 each. No shit work.')
  returning id into jp;
  select revisions, extra_terms into rev, terms from public.job_posts where id = jp;
  out := out || E'\n' || case when rev = '2' then 'PASS' else 'FAIL' end || ' a job post saves 2 revisions';
  out := out || E'\n' || case when terms like 'Extra revisions cost 300 each.%' and terms not like '%shit%' then 'PASS' else 'FAIL' end || ' bad words in the terms are hidden: ' || terms;

  -- 2. Wrong values are refused.
  begin
    update public.job_posts set revisions = '7' where id = jp;
    out := out || E'\nFAIL 7 revisions was accepted';
  exception when check_violation then
    out := out || E'\nPASS 7 revisions is refused';
  end;
  begin
    update public.job_posts set extra_terms = repeat('a', 501) where id = jp;
    out := out || E'\nFAIL 501 characters of terms were accepted';
  exception when check_violation then
    out := out || E'\nPASS 501 characters of terms are refused';
  end;

  -- 3. An older style post (nothing written) is fine.
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, freelancers_needed, start_date, due_date)
  values (cl, 'Test no terms post', 'graphic-design', 'x', 'project', 'project', 1, today, today + 10)
  returning id into jp2;
  select revisions, extra_terms into rev, terms from public.job_posts where id = jp2;
  out := out || E'\n' || case when rev is null and terms is null then 'PASS' else 'FAIL' end || ' a post with nothing written has none';

  -- 4. Hiring copies the post's terms into the project, not what was sent.
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (jp, fr, fr::text || '/' || jp::text || '-1.pdf') returning id into app;
  insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, due_date, revisions, extra_terms)
  values (app, jp, cl, fr, 'Test terms post', today + 5, 'unlimited', 'typed by someone')
  returning id into pr;
  select revisions, extra_terms into rev, terms from public.projects where id = pr;
  out := out || E'\n' || case when rev = '2' and terms like 'Extra revisions cost 300 each.%' then 'PASS' else 'FAIL' end || ' a new project gets the post''s revisions and terms, not what was sent: ' || coalesce(rev, 'null');

  -- 5. Editing the post later does not change the project.
  update public.job_posts set revisions = '5', extra_terms = 'New terms' where id = jp;
  select revisions, extra_terms into rev, terms from public.projects where id = pr;
  out := out || E'\n' || case when rev = '2' and terms like 'Extra revisions%' then 'PASS' else 'FAIL' end || ' editing the post later does not change the project';

  -- 6. The project's own terms can't be changed afterwards, other changes still work.
  update public.projects set revisions = '0', extra_terms = 'changed', status = 'done' where id = pr;
  select revisions, extra_terms into rev, terms from public.projects where id = pr;
  out := out || E'\n' || case when rev = '2' and terms like 'Extra revisions%' then 'PASS' else 'FAIL' end || ' a project''s revisions and terms can''t be changed afterwards';
  out := out || E'\n' || case when (select status from public.projects where id = pr) = 'done' then 'PASS' else 'FAIL' end || ' other project changes still work';

  -- 7. A project from a post with nothing written, and a project with no post.
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (jp2, fr, fr::text || '/' || jp2::text || '-1.pdf') returning id into app;
  insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, due_date, revisions)
  values (app, jp2, cl, fr, 'Test no terms', today + 5, '3') returning id into pr2;
  select revisions, extra_terms into rev, terms from public.projects where id = pr2;
  out := out || E'\n' || case when rev is null and terms is null then 'PASS' else 'FAIL' end || ' a project from a post with no terms has none';

  insert into public.projects (client_id, freelancer_id, title, due_date, revisions, extra_terms)
  values (cl, fr, 'No post', today + 5, '4', 'typed') returning id into pr3;
  select revisions, extra_terms into rev, terms from public.projects where id = pr3;
  out := out || E'\n' || case when rev is null and terms is null then 'PASS' else 'FAIL' end || ' a project without a post has none';

  -- 8. When a post is removed the database sets the project's job_post_id to
  --    null (an update of the project): the project keeps its copy.
  update public.projects set job_post_id = null where id = pr;
  select revisions, extra_terms into rev, terms from public.projects where id = pr;
  out := out || E'\n' || case when rev = '2' and terms like 'Extra revisions%' then 'PASS' else 'FAIL' end || ' the project keeps its copy after its post is gone';

  raise exception 'TEST RESULTS (rolled back):%', out;
end $$;
