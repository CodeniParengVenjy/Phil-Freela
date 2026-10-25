-- Test for supabase_project_price_schema.sql. Send the schema file and this block
-- together in ONE call to try it before applying (the error at the end rolls the
-- schema back too), or run this alone in the Supabase SQL Editor after the schema
-- file. It BORROWS one client, one verified freelancer and one stranger (no
-- accounts are made, so no user numbers are used), adds made-up services, job
-- posts and applications as the database owner, then acts as each person and
-- ends with an error that carries the PASS/FAIL list; that error rolls everything
-- back, so nothing is left behind. The two e-mail triggers are switched off for
-- the block (the switch rolls back too), so nobody gets a message about made-up
-- bookings or applications.
do $t$
declare
  res      text := '';
  msg      text;
  n        int;
  today    date := (now() at time zone 'Asia/Manila')::date;
  cl       uuid;   -- a client: books, hires, proposes
  fr       uuid;   -- a verified freelancer: accepts, is hired, proposes
  st       uuid;   -- a stranger to every made-up project
  svc_p    uuid;   -- service with a price (1500)
  svc_f    uuid;   -- service with no price
  svc_z    uuid;   -- service with a price of 0 (counts as no price)
  bk_p     uuid;
  bk_f     uuid;
  bk_z     uuid;
  pj_p     uuid;   -- project from the priced booking
  pj_f     uuid;   -- project from the booking with no price
  pj_z     uuid;   -- project from the booking whose service price was 0
  job_p    uuid;   -- one-time job post with a budget of 5000
  job_d    uuid;   -- ongoing job, 800 per day
  job_f    uuid;   -- one-time job post, no budget
  job_m    uuid;   -- ongoing job, per month, no budget
  ap_p     uuid;
  ap_d     uuid;
  ap_f     uuid;
  ap_m     uuid;
  hp_p     uuid;
  hp_d     uuid;
  hp_f     uuid;
  hp_m     uuid;
  pr       record;
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  alter table public.job_applications disable trigger email_offline_on_application;
  alter table public.user_notifications disable trigger email_offline_on_notification;

  select p.id into cl from public.profiles p
   where p.account_type = 'client' and not exists (select 1 from public.admins a where a.id = p.id)
     and not public.is_posting_blocked(p.id)
   order by p.id limit 1;
  select p.id into fr from public.profiles p
   where p.account_type = 'freelancer' and public.is_verified(p.id) and p.available_for_work
     and not public.is_posting_blocked(p.id)
   order by p.id limit 1;
  select p.id into st from public.profiles p
   where p.id not in (cl, fr) and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  if cl is null or fr is null or st is null then
    raise exception 'Needs a client, a verified freelancer who takes bookings, and a third normal account already in the database.';
  end if;

  -- ---- made-up services and job posts (as the owner) ----------------------------
  insert into public.services (freelancer_id, title, category, description, price)
  values (fr, 'Test priced service', 'graphic-design', 'x', 1500) returning id into svc_p;
  insert into public.services (freelancer_id, title, category, description)
  values (fr, 'Test unpriced service', 'graphic-design', 'x') returning id into svc_f;
  insert into public.services (freelancer_id, title, category, description, price)
  values (fr, 'Test zero service', 'graphic-design', 'x', 0) returning id into svc_z;

  insert into public.job_posts (client_id, title, category, description, budget, job_type, budget_type, start_date, due_date)
  values (cl, 'Test priced job', 'graphic-design', 'x', 5000, 'project', 'project', today, today + 10) returning id into job_p;
  insert into public.job_posts (client_id, title, category, description, budget, job_type, budget_type, start_date, due_date)
  values (cl, 'Test day job', 'graphic-design', 'x', 800, 'job', 'day', today, today + 10) returning id into job_d;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, start_date, due_date)
  values (cl, 'Test unpriced job', 'graphic-design', 'x', 'project', 'project', today, today + 10) returning id into job_f;
  insert into public.job_posts (client_id, title, category, description, job_type, budget_type, start_date, due_date)
  values (cl, 'Test month job', 'graphic-design', 'x', 'job', 'month', today, today + 10) returning id into job_m;

  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (job_p, fr, fr::text || '/' || job_p::text || '-1.pdf') returning id into ap_p;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (job_d, fr, fr::text || '/' || job_d::text || '-1.pdf') returning id into ap_d;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (job_f, fr, fr::text || '/' || job_f::text || '-1.pdf') returning id into ap_f;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (job_m, fr, fr::text || '/' || job_m::text || '-1.pdf') returning id into ap_m;

  -- ---- 1. A booking carries the service's price -----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  bk_p := public.create_booking(svc_p, 'Test booking', today + 5);
  bk_f := public.create_booking(svc_f, 'Test booking', today + 5);
  bk_z := public.create_booking(svc_z, 'Test booking', today + 5);
  reset role;

  res := res || case when (select price from public.bookings where id = bk_p) = 1500 then 'PASS' else 'FAIL' end
         || ' a booking of a priced service carries the price (1500)' || E'\n';
  res := res || case when (select price from public.bookings where id = bk_f) is null then 'PASS' else 'FAIL' end
         || ' a booking of a service with no price has no price' || E'\n';
  res := res || case when (select price from public.bookings where id = bk_z) is null then 'PASS' else 'FAIL' end
         || ' a service price of 0 counts as no price' || E'\n';

  -- The freelancer raises the service price after the booking was made.
  update public.services set price = 2000 where id = svc_p;

  -- ---- 2. Accepting starts the project with that price ------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  pj_p := public.accept_booking(bk_p);
  pj_f := public.accept_booking(bk_f);
  pj_z := public.accept_booking(bk_z);
  reset role;

  select * into pr from public.projects where id = pj_p;
  res := res || case when pr.agreed_amount = 1500 and pr.price_basis = 'project' and pr.price_status = 'agreed'
                          and pr.price_source = 'service' and pr.price_agreed_at is not null
                     then 'PASS' else 'FAIL' end
         || ' accepted booking: the project has the booked price, agreed, from the service, with a date' || E'\n';
  res := res || case when pr.agreed_amount <> 2000 then 'PASS' else 'FAIL' end
         || ' the service price changed to 2000 after booking: the project keeps 1500' || E'\n';
  select * into pr from public.projects where id = pj_f;
  res := res || case when pr.agreed_amount is null and pr.price_basis is null and pr.price_source is null
                          and pr.price_status = 'none' and pr.price_agreed_at is null
                     then 'PASS' else 'FAIL' end
         || ' accepted booking with no price: the project starts with no price' || E'\n';
  select * into pr from public.projects where id = pj_z;
  res := res || case when pr.price_status = 'none' and pr.agreed_amount is null then 'PASS' else 'FAIL' end
         || ' accepted booking whose service price was 0: no price' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'booking_accepted' and link = '/dashboard/project-details/' || pj_p
     and message like '%The price is ₱1,500.00 for the whole project.%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client is told the price when the booking is accepted' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'booking_accepted' and link = '/dashboard/project-details/' || pj_f
     and message not like '%The price is%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' with no price, the notification does not mention one' || E'\n';

  -- ---- 3. Hiring carries the job post's budget --------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  hp_p := public.hire_applicant(ap_p, 'note', today + 5);
  hp_d := public.hire_applicant(ap_d, 'note', today + 5);
  hp_f := public.hire_applicant(ap_f, 'note', today + 5);
  hp_m := public.hire_applicant(ap_m, 'note', today + 5);
  reset role;

  select * into pr from public.projects where id = hp_p;
  res := res || case when pr.agreed_amount = 5000 and pr.price_basis = 'project' and pr.price_status = 'agreed'
                          and pr.price_source = 'job' and pr.price_agreed_at is not null
                     then 'PASS' else 'FAIL' end
         || ' hire: the project has the job''s budget (5000), agreed, from the job' || E'\n';
  select * into pr from public.projects where id = hp_d;
  res := res || case when pr.agreed_amount = 800 and pr.price_basis = 'day' and pr.price_status = 'agreed'
                     then 'PASS' else 'FAIL' end
         || ' hire of an ongoing job paid per day: 800 per day' || E'\n';
  select * into pr from public.projects where id = hp_f;
  res := res || case when pr.price_status = 'none' and pr.agreed_amount is null then 'PASS' else 'FAIL' end
         || ' hire from a job with no budget: no price' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = fr and type = 'project_hired' and link = '/dashboard/project-details/' || hp_d
     and message like '%The price is ₱800.00 per day.%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer is told the price when hired ("per day")' || E'\n';

  -- The old hiring rules still hold.
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', st::text, true);
  set local role authenticated;
  begin perform public.hire_applicant(ap_p, 'note', today + 5); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'Only the client who posted this job%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger still cannot hire for someone else''s job' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  begin perform public.hire_applicant(ap_p, 'note', today + 5); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'You already hired%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' hiring the same applicant twice is still refused' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  begin perform public.create_booking(svc_p, 'x', today + 5); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'Only clients can book%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a freelancer still cannot book' || E'\n';

  -- ---- 4. A price that is already agreed is locked ----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  begin perform public.propose_project_price(pj_p, 900); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg = 'The price is already agreed.' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' proposing a new price on an agreed project is refused' || E'\n';
  set local role authenticated;
  begin perform public.agree_project_price(pj_p); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg = 'The price is already agreed.' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' agreeing again on an agreed project is refused' || E'\n';

  -- ---- 5. No price yet: the propose and agree dance (project pj_f) --------------------
  -- The stranger and a signed-out visitor are refused.
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', st::text, true);
  set local role authenticated;
  begin perform public.propose_project_price(pj_f, 1000); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'Only the two people on this project%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot propose a price' || E'\n';
  set local role authenticated;
  begin perform public.agree_project_price(pj_f); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'Only the two people on this project%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot agree to a price' || E'\n';
  set local role anon;
  begin perform public.propose_project_price(pj_f, 1000); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor cannot propose a price' || E'\n';
  set local role anon;
  begin perform public.agree_project_price(pj_f); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor cannot agree to a price' || E'\n';

  -- Agreeing before anyone proposed.
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  begin perform public.agree_project_price(pj_f); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg = 'Nobody has proposed a price yet.' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' agreeing when nobody proposed is refused' || E'\n';

  -- The freelancer proposes 1200.50.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.propose_project_price(pj_f, 1200.50);
  reset role;
  select * into pr from public.projects where id = pj_f;
  res := res || case when pr.price_status = 'proposed' and pr.agreed_amount = 1200.50 and pr.price_basis = 'project'
                          and pr.price_source = 'proposal' and pr.price_proposed_by = fr and pr.price_agreed_at is null
                     then 'PASS' else 'FAIL' end
         || ' a proposal: proposed, 1200.50 for the whole project, by the freelancer, not agreed yet' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'price_proposed' and link = '/dashboard/project-details/' || pj_f
     and message like '%₱1,200.50 for the whole project%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client is told about the proposal' || E'\n';

  -- The proposer cannot agree to their own price, nor send the same one again.
  set local role authenticated;
  begin perform public.agree_project_price(pj_f); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'You proposed this price%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the proposer cannot agree to their own price' || E'\n';
  set local role authenticated;
  begin perform public.propose_project_price(pj_f, 1200.5); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'You already proposed that price%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the same proposal twice is refused' || E'\n';

  -- A different amount from the same person replaces the first.
  set local role authenticated;
  perform public.propose_project_price(pj_f, 1300);
  reset role;
  select * into pr from public.projects where id = pj_f;
  res := res || case when pr.price_status = 'proposed' and pr.agreed_amount = 1300 and pr.price_proposed_by = fr
                     then 'PASS' else 'FAIL' end
         || ' a different amount replaces the waiting proposal' || E'\n';

  -- The client answers with a different price (a counter proposal).
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  perform public.propose_project_price(pj_f, 1000);
  reset role;
  select * into pr from public.projects where id = pj_f;
  res := res || case when pr.price_status = 'proposed' and pr.agreed_amount = 1000 and pr.price_proposed_by = cl
                     then 'PASS' else 'FAIL' end
         || ' the other person can answer with their own price' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = fr and type = 'price_proposed' and link = '/dashboard/project-details/' || pj_f;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer is told about the counter proposal' || E'\n';
  set local role authenticated;
  begin perform public.agree_project_price(pj_f); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'You proposed this price%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the client cannot agree to their own counter proposal' || E'\n';

  -- The freelancer agrees.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.agree_project_price(pj_f);
  reset role;
  select * into pr from public.projects where id = pj_f;
  res := res || case when pr.price_status = 'agreed' and pr.agreed_amount = 1000 and pr.price_agreed_at is not null
                          and pr.price_source = 'proposal'
                     then 'PASS' else 'FAIL' end
         || ' agreed: 1000, with a date, source proposal' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'price_agreed' and link = '/dashboard/project-details/' || pj_f
     and message like '%₱1,000.00 for the whole project%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the proposer is told it was agreed' || E'\n';
  set local role authenticated;
  begin perform public.propose_project_price(pj_f, 500); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg = 'The price is already agreed.' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' after agreeing, nobody can change the price' || E'\n';

  -- ---- 6. Amount limits (project hp_f, no price yet) ---------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  begin perform public.propose_project_price(hp_f, 0); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'The price must be more than%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a price of 0 is refused' || E'\n';
  set local role authenticated;
  begin perform public.propose_project_price(hp_f, -5); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'The price must be more than%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a negative price is refused' || E'\n';
  set local role authenticated;
  begin perform public.propose_project_price(hp_f, null); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'The price must be more than%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' no price at all is refused' || E'\n';
  set local role authenticated;
  begin perform public.propose_project_price(hp_f, 0.004); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'The price must be more than%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a price that rounds to 0 is refused' || E'\n';
  set local role authenticated;
  begin perform public.propose_project_price(hp_f, 1000000.01); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'The price must be more than%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a price over 1,000,000 is refused' || E'\n';
  select price_status into msg from public.projects where id = hp_f;
  res := res || case when msg = 'none' then 'PASS' else 'FAIL (' || msg || ')' end
         || ' every refusal left the project with no price' || E'\n';
  set local role authenticated;
  perform public.propose_project_price(hp_f, 1000000);
  perform public.propose_project_price(hp_f, 100.456);
  reset role;
  select * into pr from public.projects where id = hp_f;
  res := res || case when pr.agreed_amount = 100.46 then 'PASS' else 'FAIL (' || pr.agreed_amount || ')' end
         || ' exactly 1,000,000 is allowed, and a price is rounded to centavos (100.456 -> 100.46)' || E'\n';

  -- ---- 7. An ongoing job keeps what it counts -----------------------------------------
  set local role authenticated;
  perform public.propose_project_price(hp_m, 25000);
  reset role;
  select * into pr from public.projects where id = hp_m;
  res := res || case when pr.price_basis = 'month' and pr.agreed_amount = 25000 and pr.price_status = 'proposed'
                     then 'PASS' else 'FAIL' end
         || ' a proposal on a job paid per month is per month' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = fr and type = 'price_proposed' and link = '/dashboard/project-details/' || hp_m
     and message like '%₱25,000.00 per month%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the sentence says "per month"' || E'\n';

  -- ---- 8. The browser cannot change a project itself ---------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  begin update public.projects set agreed_amount = 1, price_status = 'agreed' where id = pj_z; msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a person cannot write the price straight into the project' || E'\n';
  select price_status into msg from public.projects where id = pj_z;
  res := res || case when msg = 'none' then 'PASS' else 'FAIL (' || msg || ')' end
         || ' the project was not changed' || E'\n';

  -- ---- 9. The columns must tell one story (checked as the owner) -----------------------
  begin update public.projects set agreed_amount = 10 where id = pj_z; msg := null;
  exception when check_violation then msg := sqlerrm; end;
  res := res || case when msg like '%projects_price_consistent%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an amount with no status is refused by the table itself' || E'\n';
  begin update public.projects set price_status = 'agreed', agreed_amount = 10, price_basis = 'project', price_source = 'job' where id = pj_z; msg := null;
  exception when check_violation then msg := sqlerrm; end;
  res := res || case when msg like '%projects_price_consistent%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' "agreed" with no date is refused by the table itself' || E'\n';
  begin update public.projects set price_status = 'proposed', agreed_amount = 1000000.5, price_basis = 'project', price_source = 'proposal' where id = pj_z; msg := null;
  exception when check_violation then msg := sqlerrm; end;
  res := res || case when msg like '%projects_agreed_amount_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an amount over 1,000,000 is refused by the table itself' || E'\n';

  -- ---- 10. The sentence for a price, and the notification kinds ---------------------------
  res := res || case when public.price_text(5000, 'project') = '₱5,000.00 for the whole project'
                          and public.price_text(800, 'day') = '₱800.00 per day'
                          and public.price_text(25000.5, 'month') = '₱25,000.50 per month'
                     then 'PASS' else 'FAIL' end
         || ' the price sentences read right' || E'\n';
  begin
    insert into public.user_notifications (user_id, type, title, message) values (cl, 'price_proposed', 't', 'm');
    insert into public.user_notifications (user_id, type, title, message) values (cl, 'price_agreed', 't', 'm');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' the two new notification kinds are allowed' || E'\n';
  begin
    insert into public.user_notifications (user_id, type, title, message) values (cl, 'payment_requested', 't', 'm');
    insert into public.user_notifications (user_id, type, title, message) values (cl, 'promotion_approved', 't', 'm');
    insert into public.user_notifications (user_id, type, title, message) values (cl, 'school_id_pass', 't', 'm');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' kinds that existed before (payments, promotions, school ID pass) are still allowed' || E'\n';
  begin insert into public.user_notifications (user_id, type, title, message) values (cl, 'made_up_kind', 't', 'm'); msg := null;
  exception when check_violation then msg := sqlerrm; end;
  res := res || case when msg like '%user_notifications_type_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a made-up kind is still refused' || E'\n';

  -- ---- 11. A project made the plain way still starts with no price ---------------------------
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fr, 'Test plain project', today + 5)
  returning * into pr;
  res := res || case when pr.price_status = 'none' and pr.agreed_amount is null then 'PASS' else 'FAIL' end
         || ' a new project row with no price given starts with none' || E'\n';

  -- ---- no user numbers were used ------------------------------------------------------------
  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL (' || seq_before || ' -> ' || seq_after || ')' end
         || ' the user number counter did not move' || E'\n';

  raise exception E'\n%', res;
end
$t$;
