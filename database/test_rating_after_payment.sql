-- Test for supabase_rating_after_payment_schema.sql (the client rates only after
-- a successful payment; the freelancer rates once it's Done, as before).
-- Paste this whole file into the Supabase SQL Editor and run it AFTER the schema
-- file (or send the schema file and this block together in one call to try it
-- before applying: the error at the end rolls the schema back too).
-- It makes up accounts and projects for the project ratings, and BORROWS a real
-- client and a real freelancer's visible offer for the offer rating (only to act
-- as them). It ends with an error that carries the PASS/FAIL list; that error
-- rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  c uuid := gen_random_uuid();   -- a made-up client, "Maria Paytest"
  f uuid := gen_random_uuid();   -- a made-up freelancer, "Juan Paytest"
  pa uuid;   -- Done just now, agreed P1,000 one-time price, not paid yet
  pb uuid;   -- Done 20 days ago, paid 10 days ago
  pc uuid;   -- Done 5 days ago, no price, never paid
  pd uuid;   -- Done 30 days ago, paid only yesterday (late)
  pe uuid;   -- paid up front but still Submitted, not Done
  ca uuid; fr uuid; svc uuid;    -- borrowed: a client, a freelancer and their offer
  bk uuid; pj uuid;
  n int;
  flag boolean;
  paid_msg constant text := 'You can rate this offer once your payment for the project is confirmed.';
begin
  -- No e-mails from the notifications a rating makes (undone with the rest).
  alter table public.user_notifications disable trigger email_offline_on_notification;

  -- ===== Made-up rows, added with nobody signed in =====
  insert into auth.users (id, email, aud, role, created_at, encrypted_password)
  select u, 'paytest-' || left(u::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(),
         extensions.crypt('Test1234', extensions.gen_salt('bf', 4))
  from unnest(array[c, f]) as u;
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (c, 'Maria Paytest', 'maria_paytest', 'female', 'client', false),
    (f, 'Juan Paytest', 'juan_paytest', 'male', 'freelancer', false);

  insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date, submitted_at, completed_at,
                               price_status, agreed_amount, price_basis, price_source, price_agreed_at)
    values (c, f, 'Paytest logo', 'done', now() - interval '5 days', current_date, now() - interval '1 day', now(),
            'agreed', 1000, 'project', 'job', now() - interval '5 days')
    returning id into pa;
  insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date, submitted_at, completed_at, unlocked_at)
    values (c, f, 'Paytest poster', 'done', now() - interval '25 days', current_date, now() - interval '21 days',
            now() - interval '20 days', now() - interval '10 days')
    returning id into pb;
  insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date, submitted_at, completed_at)
    values (c, f, 'Paytest flyer', 'done', now() - interval '9 days', current_date, now() - interval '6 days', now() - interval '5 days')
    returning id into pc;
  insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date, submitted_at, completed_at, unlocked_at)
    values (c, f, 'Paytest banner', 'done', now() - interval '35 days', current_date, now() - interval '31 days',
            now() - interval '30 days', now() - interval '1 day')
    returning id into pd;
  insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date, submitted_at, unlocked_at)
    values (c, f, 'Paytest video', 'submitted', now() - interval '3 days', current_date, now() - interval '1 day', now() - interval '2 days')
    returning id into pe;

  set local role authenticated;

  -- ===== Done but not paid =====
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pa, c, f, 5);
    res := res || E'\nFAIL  1. the client rated a Done project that is not paid';
  exception when others then res := res || E'\nPASS  1. the client cannot rate a Done project that is not paid';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pa, f, c, 2);
    res := res || E'\nPASS  2. the freelancer can rate the client on a Done project that is not paid';
  exception when others then res := res || E'\nFAIL  2. the freelancer could not rate an unpaid Done project: ' || sqlerrm;
  end;

  -- ===== Paid part of the agreed price: still waiting =====
  reset role;
  insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path, status, answered_at, received_amount)
    values (pa, c, f, 600, 0, '9990000000001', c::text || '/paytest-1.jpg', 'confirmed', now(), 600);
  select count(*) into n from public.projects where id = pa and unlocked_at is null;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3. P600 of P1,000 confirmed: the project is not unlocked yet';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pa, c, f, 5);
    res := res || E'\nFAIL  4. the client rated after paying only part of the agreed price';
  exception when others then res := res || E'\nPASS  4. the client still cannot rate after paying only part of the price';
  end;

  -- ===== The rest is paid and confirmed: the client can rate =====
  reset role;
  insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path, status, answered_at, received_amount)
    values (pa, c, f, 400, 0, '9990000000002', c::text || '/paytest-2.jpg', 'confirmed', now(), 400);
  select count(*) into n from public.projects where id = pa and unlocked_at is not null;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '5. the rest confirmed: the project is unlocked';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars, feedback) values (pa, c, f, 5, 'Paid and happy');
    res := res || E'\nPASS  6. once fully paid, the client can rate the freelancer';
  exception when others then res := res || E'\nFAIL  6. the client could not rate a paid project: ' || sqlerrm;
  end;
  select count(*) into n from public.project_ratings where project_id = pa;
  res := res || E'\n' || case when n = 2 then 'PASS  ' else 'FAIL  ' end || '7. both rated: the client now reads both ratings (' || n || ')';

  -- ===== Paid late within the window: the client's 14 days start from the payment =====
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pb, c, f, 4);
    res := res || E'\nPASS  8. Done 20 days ago, paid 10 days ago: the client can still rate';
  exception when others then res := res || E'\nFAIL  8. the client could not rate 10 days after paying: ' || sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pb, f, c, 4);
    res := res || E'\nFAIL  9. the freelancer rated 20 days after Done';
  exception when others then res := res || E'\nPASS  9. the freelancer''s 14 days still count from Done';
  end;
  select count(*) into n from public.project_ratings where project_id = pb;
  flag := public.rating_is_visible(pb);
  res := res || E'\n' || case when n = 0 and not flag then 'PASS  ' else 'FAIL  ' end || '10. the client''s rating stays blind until 14 days after the payment';

  -- ===== Never paid: the freelancer's rating still counts =====
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pc, f, c, 1);
    res := res || E'\nPASS  11. the freelancer can rate a client who never paid';
  exception when others then res := res || E'\nFAIL  11. the freelancer could not rate a client who never paid: ' || sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pc, c, f, 1);
    res := res || E'\nFAIL  12. the client rated a project they never paid';
  exception when others then res := res || E'\nPASS  12. the client cannot rate a project they never paid';
  end;
  flag := public.rating_is_visible(pc);
  res := res || E'\n' || case when not flag then 'PASS  ' else 'FAIL  ' end || '13. day 5: the freelancer''s rating is still blind';

  reset role;
  update public.projects set completed_at = now() - interval '20 days' where id = pc;
  flag := public.rating_is_visible(pc);
  res := res || E'\n' || case when flag then 'PASS  ' else 'FAIL  ' end || '14. never paid, 20 days after Done: the freelancer''s rating shows';
  -- The client pays now, after the 14 days: the rating that was showing stays showing.
  update public.projects set unlocked_at = now() where id = pc;
  flag := public.rating_is_visible(pc);
  res := res || E'\n' || case when flag then 'PASS  ' else 'FAIL  ' end || '15. a payment after the 14 days does not hide it again';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pc, c, f, 3);
    res := res || E'\nPASS  16. ...and the client who just paid can rate now';
  exception when others then res := res || E'\nFAIL  16. the client who just paid could not rate: ' || sqlerrm;
  end;

  -- ===== Done 30 days ago, paid yesterday =====
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pd, c, f, 5);
    res := res || E'\nPASS  17. Done 30 days ago, paid yesterday: the client can rate';
  exception when others then res := res || E'\nFAIL  17. the client could not rate a day after paying late: ' || sqlerrm;
  end;

  -- ===== Paid but not Done =====
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pe, c, f, 5);
    res := res || E'\nFAIL  18. the client rated a paid project that is not Done';
  exception when others then res := res || E'\nPASS  18. paid but not Done: still no rating';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  begin
    insert into public.project_ratings (project_id, rater_id, ratee_id, stars) values (pe, f, c, 5);
    res := res || E'\nFAIL  19. the freelancer rated a project that is not Done';
  exception when others then res := res || E'\nPASS  19. the freelancer still cannot rate before Done';
  end;

  -- ===== Rating an offer (borrowed real accounts) =====
  reset role;
  select s.id, s.freelancer_id into svc, fr from public.services s
    where public.is_verified(s.freelancer_id) and not public.is_posting_blocked(s.freelancer_id)
    order by s.created_at limit 1;
  select id into ca from public.profiles p where account_type = 'client' and id <> fr
    and not public.is_posting_blocked(id) and not public.is_suspended(id)
    and not exists (select 1 from public.service_reviews r where r.author_id = p.id and r.service_id = svc)
    and not exists (
      select 1 from public.bookings b join public.projects pp on pp.booking_id = b.id
      where b.client_id = p.id and b.service_id = svc and pp.status = 'done')
    order by created_at limit 1;
  if svc is null or ca is null then
    raise exception 'This test borrows a client and a visible offer from the database. One of them is missing.';
  end if;
  insert into public.bookings (client_id, freelancer_id, service_id, title, due_date, status, responded_at)
    values (ca, fr, svc, 'Paytest booking', current_date + 7, 'accepted', now()) returning id into bk;
  insert into public.projects (booking_id, client_id, freelancer_id, title, status, started_at, due_date, submitted_at, completed_at,
                               price_status, agreed_amount, price_basis, price_source, price_agreed_at)
    values (bk, ca, fr, 'Paytest booked offer', 'done', now() - interval '3 days', current_date, now() - interval '1 day', now(),
            'agreed', 500, 'project', 'service', now() - interval '3 days')
    returning id into pj;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  begin
    perform public.add_service_review(svc, 5, 'paytest not paid');
    res := res || E'\nFAIL  20. the offer was rated before the payment';
  exception when others then
    res := res || E'\n' || case when sqlerrm = paid_msg then 'PASS  ' else 'FAIL  ' end || '20. offer: Done but not paid is refused (' || sqlerrm || ')';
  end;
  reset role;
  insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path, status, answered_at, received_amount)
    values (pj, ca, fr, 200, 0, '9990000000003', ca::text || '/paytest-3.jpg', 'confirmed', now(), 200);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  begin
    perform public.add_service_review(svc, 5, 'paytest part paid');
    res := res || E'\nFAIL  21. the offer was rated after paying only part of the price';
  exception when others then
    res := res || E'\n' || case when sqlerrm = paid_msg then 'PASS  ' else 'FAIL  ' end || '21. offer: part paid is still refused';
  end;
  reset role;
  insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path, status, answered_at, received_amount)
    values (pj, ca, fr, 300, 0, '9990000000004', ca::text || '/paytest-4.jpg', 'confirmed', now(), 300);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  begin
    perform public.add_service_review(svc, 5, 'paytest fully paid');
    res := res || E'\nPASS  22. offer: once fully paid, the client can rate it';
  exception when others then res := res || E'\nFAIL  22. the offer could not be rated after full payment: ' || sqlerrm;
  end;

  -- ===== Who may call the functions (unchanged) =====
  reset role;
  res := res || E'\n' || case when has_function_privilege('authenticated', 'public.rating_is_visible(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.rating_is_visible(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.add_service_review(uuid, integer, text)', 'execute')
      and not has_function_privilege('anon', 'public.add_service_review(uuid, integer, text)', 'execute')
    then 'PASS  ' else 'FAIL  ' end || '23. signed-in users can still call them, visitors cannot';

  raise exception E'\nRATING AFTER PAYMENT TEST%', res;
end;
$t$;
