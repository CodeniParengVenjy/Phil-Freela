-- Test for supabase_deliverable_lock_schema.sql (pay to unlock). Send the schema
-- file and this block together in ONE call to try it before applying (the error
-- at the end rolls the schema back too), or run this alone in the Supabase SQL
-- Editor after the schema file. It BORROWS three normal accounts (no accounts are
-- made, so no user numbers are used), adds made-up projects, files and a payment
-- as the database owner, then acts as each person and ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing is
-- left behind. The e-mail trigger on notifications is switched off for the block
-- (the switch rolls back too), so nobody gets a message about made-up work.
do $t$
declare
  res        text := '';
  n          int;
  ok         boolean;
  today      date := (now() at time zone 'Asia/Manila')::date;
  cl         uuid;  -- the client of the made-up projects
  fr         uuid;  -- their freelancer
  st         uuid;  -- a stranger to the projects
  pj         uuid;  -- a video is sent, then paid for, then new work is sent
  pj2        uuid;  -- a PDF is sent and never paid for
  pj3        uuid;  -- only a link is sent
  f1         text;  -- pj's first file (a video)
  f2         text;  -- pj's second file (a picture)
  f3         text;  -- pj2's file
  pv1        text;  -- the preview of f1
  pay        uuid;
  pr         record;
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;
  alter table public.user_notifications disable trigger email_offline_on_notification;

  select p.id into cl from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select p.id into fr from public.profiles p
   where p.id <> cl and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select p.id into st from public.profiles p
   where p.id not in (cl, fr) and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  if cl is null or fr is null or st is null then
    raise exception 'Needs three normal accounts already in the database.';
  end if;

  -- ---- made-up projects and files (as the owner) --------------------------------
  insert into public.projects (client_id, freelancer_id, title, due_date)
  values (cl, fr, 'Test lock project', today + 5) returning id into pj;
  insert into public.projects (client_id, freelancer_id, title, due_date)
  values (cl, fr, 'Test lock project 2', today + 5) returning id into pj2;
  insert into public.projects (client_id, freelancer_id, title, due_date)
  values (cl, fr, 'Test lock project 3', today + 5) returning id into pj3;

  f1  := fr::text || '/' || pj::text || '-1.mp4';
  f2  := fr::text || '/' || pj::text || '-2.png';
  f3  := fr::text || '/' || pj2::text || '-1.pdf';
  pv1 := fr::text || '/' || pj::text || '-1-preview.mp4';
  insert into storage.objects (bucket_id, name)
  values ('deliverables', f1), ('deliverables', f2), ('deliverables', f3), ('deliverable-previews', pv1);

  -- ---- 0. The setup ----------------------------------------------------------------
  res := res || case when (select not b.public from storage.buckets b where b.id = 'deliverable-previews') then 'PASS' else 'FAIL' end
         || ' the preview bucket exists and is private' || E'\n';
  select count(*) into n from public.projects where submission_path is not null and not files_locked;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' every file sent before the change is locked too' || E'\n';

  -- ---- 1. Sending a file locks it; a link alone does not -----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.submit_project(pj, f1, null, 'Here it is');
  perform public.submit_project(pj2, f3, null, null);
  perform public.submit_project(pj3, null, 'https://example.com/work', null);
  reset role;

  select * into pr from public.projects where id = pj;
  res := res || case when pr.status = 'submitted' and pr.files_locked and pr.preview_path is null and pr.unlocked_at is null
                     then 'PASS' else 'FAIL' end
         || ' a sent file is locked, has no preview yet and is not unlocked' || E'\n';
  select * into pr from public.projects where id = pj3;
  res := res || case when pr.status = 'submitted' and not pr.files_locked then 'PASS' else 'FAIL' end
         || ' a link alone is not locked' || E'\n';

  -- ---- 2. Who can open the original while it is locked -------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverables' and name = f1;
  select files_locked and unlocked_at is null into ok from public.projects where id = pj;
  reset role;
  res := res || case when n = 0 then 'PASS' else 'FAIL' end || ' locked: the client cannot open the original' || E'\n';
  res := res || case when ok then 'PASS' else 'FAIL' end || ' the client can read that their project is locked' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverables' and name = f1;
  reset role;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' locked: the freelancer still opens their own original' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', st::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverables' and name = f1;
  reset role;
  res := res || case when n = 0 then 'PASS' else 'FAIL' end || ' a stranger cannot open the original' || E'\n';

  -- ---- 3. The preview (the AI service writes preview_path with the service key) ------
  update public.projects set preview_path = pv1 where id = pj;

  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverable-previews' and name = pv1;
  reset role;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' the client opens the preview' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverable-previews' and name = pv1;
  reset role;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' the freelancer opens the preview' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', st::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverable-previews' and name = pv1;
  reset role;
  res := res || case when n = 0 then 'PASS' else 'FAIL' end || ' a stranger cannot open the preview' || E'\n';

  -- ---- 4. Nobody can unlock a project or put in a preview themselves ------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  begin
    set local role authenticated;
    update public.projects set unlocked_at = now() where id = pj;
    reset role;
    res := res || 'FAIL the client unlocked the project by hand' || E'\n';
  exception when others then
    reset role;
    res := res || 'PASS the client cannot unlock the project by hand' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  begin
    set local role authenticated;
    update public.projects set preview_path = f1 where id = pj;
    reset role;
    res := res || 'FAIL the freelancer pointed the preview at the original' || E'\n';
  exception when others then
    reset role;
    res := res || 'PASS the freelancer cannot choose the preview' || E'\n';
  end;
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name) values ('deliverable-previews', fr::text || '/' || pj::text || '-9-preview.mp4');
    reset role;
    res := res || 'FAIL the freelancer uploaded a preview of their own' || E'\n';
  exception when others then
    reset role;
    res := res || 'PASS the freelancer cannot upload into the preview bucket' || E'\n';
  end;

  -- ---- 5. A payment that is only "sent" does not unlock --------------------------------
  insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path)
  values (pj, cl, fr, 500, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), cl::text || '/test-receipt.jpg')
  returning id into pay;

  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverables' and name = f1;
  reset role;
  res := res || case when n = 0 then 'PASS' else 'FAIL' end || ' a payment the freelancer has not confirmed does not unlock' || E'\n';

  -- ---- 6. The freelancer confirms it: the project unlocks by itself ---------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.confirm_payment(pay);
  reset role;

  select unlocked_at is not null into ok from public.projects where id = pj;
  res := res || case when ok then 'PASS' else 'FAIL' end || ' confirming the payment unlocks the project' || E'\n';
  select unlocked_at is null into ok from public.projects where id = pj2;
  res := res || case when ok then 'PASS' else 'FAIL' end || ' another project of the same two people stays locked' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverables' and name = f1;
  reset role;
  res := res || case when n = 1 then 'PASS' else 'FAIL' end || ' unlocked: the client opens the original' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverables' and name = f3;
  reset role;
  res := res || case when n = 0 then 'PASS' else 'FAIL' end || ' the unpaid project''s original stays closed to the client' || E'\n';

  -- ---- 7. New work after paying opens at once, and the old preview stops counting ------
  update public.projects set status = 'started' where id = pj;  -- as if the client asked for changes

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.submit_project(pj, f2, null, null);
  reset role;

  select * into pr from public.projects where id = pj;
  res := res || case when pr.files_locked and pr.preview_path is null and pr.unlocked_at is not null then 'PASS' else 'FAIL' end
         || ' new work: locked flag set, old preview cleared, the project stays unlocked' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'deliverables' and name = f2;
  select count(*) + n * 10 into n from storage.objects where bucket_id = 'deliverable-previews' and name = pv1;
  reset role;
  res := res || case when n = 10 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client opens the new original (paid already) and no longer the old preview' || E'\n';

  -- ---- 8. No user number was used --------------------------------------------------------
  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL' end || ' no user number was used' || E'\n';

  raise exception E'Results (everything rolled back):\n%', res;
end;
$t$;
