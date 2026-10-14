-- Test for supabase_service_reviews_schema.sql (parts 1 to 3). Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file (or send the schema file
-- and this block together in one call to try it before applying: the error at
-- the end rolls the schema back too). It BORROWS real accounts (2 clients, a
-- super admin, a regular admin and a freelancer with a visible offer) only to
-- act as them, so nothing about them changes and no user numbers are used up.
-- It ends with an error that carries the PASS/FAIL list; that error rolls
-- everything back, so nothing is left behind.
--
-- Not tested here: that a suspended person can't rate and that their comments
-- are hidden while it lasts. A suspension notifies the person it is about, so
-- it is not made up for a borrowed real account. Both are one call to
-- is_posting_blocked / is_suspended, which have their own tests.
do $t$
declare
  res text := '';
  ok boolean;
  n int;
  msg text;
  ca uuid; cb uuid;            -- two clients
  fr uuid; svc uuid;           -- a freelancer and one of their visible offers
  own_svc uuid;                -- an offer made up for client ca
  sa uuid; ra uuid;            -- a super admin and a regular admin
  r1 uuid; r2 uuid; r3 uuid; rep uuid;
  log_before int; log_after int;
  old_title text;
begin
  select id into ca from public.profiles where account_type = 'client' and not public.is_posting_blocked(id) and not public.is_suspended(id) order by created_at limit 1;
  select id into cb from public.profiles where account_type = 'client' and id <> ca and not public.is_posting_blocked(id) and not public.is_suspended(id) order by created_at desc limit 1;
  select s.id, s.freelancer_id into svc, fr from public.services s
    where public.is_verified(s.freelancer_id) and not public.is_posting_blocked(s.freelancer_id) and s.freelancer_id not in (ca, cb)
    order by s.created_at limit 1;
  select id into sa from public.admins where role = 'super_admin' and not must_change_password limit 1;
  select id into ra from public.admins where role = 'admin' and not must_change_password limit 1;
  if ca is null or cb is null or svc is null or sa is null or ra is null then
    raise exception 'This test borrows 2 clients, a visible offer, a super admin and a regular admin from the database. One of them is missing.';
  end if;
  select title into old_title from public.services where id = svc;
  insert into public.services (freelancer_id, title, category, description) values (ca, 'Client-owned test offer', 'copywriting', 'A test offer.') returning id into own_svc;

  -- ===== The table and its rules =====
  select relrowsecurity into ok from pg_class where oid = 'public.service_reviews'::regclass;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1a. row level security is on';
  select exists (select 1 from pg_constraint where conname = 'service_reviews_one_per_client' and contype = 'u') into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1b. one rating per client per offer is a database rule';
  select count(*) = 3 and not bool_or(cmd in ('INSERT', 'UPDATE', 'ALL')) into ok from pg_policies where schemaname = 'public' and tablename = 'service_reviews';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1c. three rules (read, remove your own, super admin removes any) and none to write or change';
  select count(*) = 2 into ok from pg_constraint where conrelid = 'public.service_reviews'::regclass and contype = 'f' and confdeltype = 'c';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1d. a rating goes away with its offer or its author (the foreign keys cascade)';

  -- ===== Adding a rating =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', ca::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  r1 := public.add_service_review(svc, 5, E'  Great work, fast and friendly!  \n');
  select stars = 5 and comment = 'Great work, fast and friendly!' and author_id = ca and service_id = svc into ok from public.service_reviews where id = r1;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '2a. a client rates an offer; the comment is trimmed';

  begin
    perform public.add_service_review(svc, 4, 'a second try');
    res := res || E'\nFAIL  2b. a second rating by the same client was accepted';
  exception when others then
    msg := sqlerrm;
    res := res || E'\n' || case when msg like 'You already rated this offer.%' then 'PASS  ' else 'FAIL  ' end || '2b. a second rating by the same client is refused in plain words (' || msg || ')';
  end;

  begin
    perform public.add_service_review(svc, 0, 'x');
    res := res || E'\nFAIL  2c. 0 stars was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm = 'Please pick 1 to 5 stars.' then 'PASS  ' else 'FAIL  ' end || '2c. 0 stars is refused (' || sqlerrm || ')';
  end;
  begin
    perform public.add_service_review(svc, 6, 'x');
    res := res || E'\nFAIL  2d. 6 stars was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm = 'Please pick 1 to 5 stars.' then 'PASS  ' else 'FAIL  ' end || '2d. 6 stars is refused';
  end;
  begin
    perform public.add_service_review(svc, 3, repeat('x', 1001));
    res := res || E'\nFAIL  2e. a 1,001-character comment was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm = 'The comment can be up to 1,000 characters.' then 'PASS  ' else 'FAIL  ' end || '2e. a comment over 1,000 characters is refused (' || sqlerrm || ')';
  end;
  begin
    perform public.add_service_review(gen_random_uuid(), 3, 'x');
    res := res || E'\nFAIL  2f. an offer that does not exist was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm = 'That offer wasn''t found.' then 'PASS  ' else 'FAIL  ' end || '2f. an offer that does not exist is refused';
  end;
  begin
    perform public.add_service_review(own_svc, 5, 'my own');
    res := res || E'\nFAIL  2g. rating your own offer was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm = 'You can''t rate your own offer.' then 'PASS  ' else 'FAIL  ' end || '2g. you can''t rate your own offer (' || sqlerrm || ')';
  end;

  perform set_config('request.jwt.claim.sub', cb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  r2 := public.add_service_review(svc, 4, '   ');
  select stars = 4 and comment is null into ok from public.service_reviews where id = r2;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '2h. stars alone are enough: a blank comment is saved as no comment';

  perform set_config('request.jwt.claim.sub', fr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  begin
    perform public.add_service_review(svc, 5, 'I am a freelancer');
    res := res || E'\nFAIL  2i. a freelancer account could rate';
  exception when others then
    res := res || E'\n' || case when sqlerrm = 'Only client accounts can rate and comment on an offer.' then 'PASS  ' else 'FAIL  ' end || '2i. only client accounts can rate (' || sqlerrm || ')';
  end;

  reset role;
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.add_service_review(svc, 5, 'signed out');
    res := res || E'\nFAIL  2j. a signed-out visitor could call the function';
  exception when insufficient_privilege then
    res := res || E'\nPASS  2j. a signed-out visitor can''t rate';
  end;

  -- ===== Nobody can write straight into the table =====
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', ca::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  begin
    insert into public.service_reviews (service_id, author_id, stars, comment) values (own_svc, ca, 5, 'sneaky');
    res := res || E'\nFAIL  3a. a client could write a row directly';
  exception when insufficient_privilege then
    res := res || E'\nPASS  3a. a client can''t write a row directly';
  end;
  begin
    update public.service_reviews set stars = 1 where id = r1;
    res := res || E'\nFAIL  3b. a client could change a rating';
  exception when insufficient_privilege then
    res := res || E'\nPASS  3b. a posted rating can''t be changed';
  end;

  -- ===== Who can read =====
  select count(*) = 2 into ok from public.service_reviews where service_id = svc;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '4a. a client reads all the ratings on an offer, others'' too';
  perform set_config('request.jwt.claim.sub', fr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  select count(*) = 2 into ok from public.service_reviews where service_id = svc;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '4b. a freelancer reads them too';
  reset role;
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform count(*) from public.service_reviews;
    res := res || E'\nFAIL  4c. a signed-out visitor could read the ratings';
  exception when insufficient_privilege then
    res := res || E'\nPASS  4c. a signed-out visitor can''t read them';
  end;

  -- ===== Removing =====
  reset role;
  select count(*) into log_before from public.admin_log where action = 'listing' and message like '%deleted the comment by%';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', cb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  delete from public.service_reviews where id = r1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '5a. a client can''t remove someone else''s rating';

  perform set_config('request.jwt.claim.sub', ra::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ra, 'role', 'authenticated')::text, true);
  delete from public.service_reviews where id = r1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '5b. a regular admin can''t remove one directly (they send a request)';

  perform set_config('request.jwt.claim.sub', ca::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  delete from public.service_reviews where id = r1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '5c. the author removes their own rating';
  r1 := public.add_service_review(svc, 3, 'Second try after removing the first');
  res := res || E'\n' || case when r1 is not null then 'PASS  ' else 'FAIL  ' end || '5d. and can then write a new one';

  reset role;
  select count(*) into log_after from public.admin_log where action = 'listing' and message like '%deleted the comment by%';
  res := res || E'\n' || case when log_after = log_before then 'PASS  ' else 'FAIL  ' end || '5e. an author removing their own rating is not written to the admin log';

  -- ===== Reports and removal requests =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', cb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  insert into public.reports (reporter_id, target_type, target_id, reason, details) values (cb, 'service_review', r1, 'spam', 'test') returning id into rep;
  res := res || E'\n' || case when rep is not null then 'PASS  ' else 'FAIL  ' end || '6a. a comment can be reported (kind service_review)';
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason) values (cb, 'service_review', r1, 'harassment');
    res := res || E'\nFAIL  6b. a second waiting report about the same comment was accepted';
  exception when unique_violation then
    res := res || E'\nPASS  6b. only one waiting report per person per comment';
  end;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason) values (cb, 'nonsense', r1, 'spam');
    res := res || E'\nFAIL  6c. a made-up kind of report was accepted';
  exception when check_violation then
    res := res || E'\nPASS  6c. a made-up kind of report is still refused';
  end;

  perform set_config('request.jwt.claim.sub', ra::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ra, 'role', 'authenticated')::text, true);
  insert into public.admin_requests (requested_by, kind, report_id, listing_table, listing_id, details) values (ra, 'remove_listing', rep, 'service_reviews', r1, '{}');
  res := res || E'\nPASS  6d. a regular admin can ask to remove a comment (listing_table service_reviews)';
  begin
    insert into public.admin_requests (requested_by, kind, report_id, listing_table, listing_id, details) values (ra, 'remove_listing', rep, 'profiles', r1, '{}');
    res := res || E'\nFAIL  6e. a request naming another table was accepted';
  exception when check_violation then
    res := res || E'\nPASS  6e. a request naming any other table is still refused';
  end;

  perform set_config('request.jwt.claim.sub', sa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  delete from public.service_reviews where id = r1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '6f. a super admin removes any comment';

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into log_after from public.admin_log where action = 'listing' and message like '%deleted the comment by%on the service "' || old_title || '"%';
  res := res || E'\n' || case when log_after >= 1 then 'PASS  ' else 'FAIL  ' end || '6g. the admin log has a line for the removal';

  -- ===== The words for it =====
  insert into public.service_reviews (service_id, author_id, stars, comment) values (svc, ca, 2, 'for the log wording') returning id into r3;
  select public.log_report_target('service_review', r3) like 'the comment by %' || old_title || '%' into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '7a. the log can describe a reported comment (' || public.log_report_target('service_review', r3) || ')';
  select public.log_report_target('service_review', gen_random_uuid()) = 'a comment that no longer exists' into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '7b. ...and one that is gone';
  select position('a comment' in prosrc) > 0 into ok from pg_proc where proname = 'notify_report_reviewed' and pronamespace = 'public'::regnamespace;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '7c. the message to the reporter says "a comment"';

  -- ===== The average for many offers (part 3) =====
  -- svc now has two ratings left: cb's 4 stars and ca's 2 stars (average 3.0).
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', cb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  select count(*) = 1 and bool_and(avg_stars = 3.0 and rating_count = 2 and service_id = svc) into ok from public.service_rating_summaries(array[svc, own_svc]);
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '8a. two offers asked for: only the one with ratings comes back, with its average (3.0) and count (2)';
  select (select avg_stars from public.service_rating_summaries(array[svc])) = (select round(avg(stars)::numeric, 1) from public.service_reviews where service_id = svc) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '8b. the same average the offer page works out from the list';
  select count(*) = 0 into ok from public.service_rating_summaries(array[]::uuid[]);
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '8c. an empty list gives nothing';
  select count(*) = 0 into ok from public.service_rating_summaries(array[gen_random_uuid()]);
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '8d. an offer that does not exist gives nothing';
  perform set_config('request.jwt.claim.sub', fr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  select count(*) = 1 into ok from public.service_rating_summaries(array[svc]);
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '8e. a freelancer can ask too (the cards show it to everyone signed in)';
  reset role;
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform count(*) from public.service_rating_summaries(array[svc]);
    res := res || E'\nFAIL  8f. a signed-out visitor could ask';
  exception when insufficient_privilege then
    res := res || E'\nPASS  8f. a signed-out visitor can''t ask';
  end;
  reset role;

  raise exception E'SERVICE REVIEW TESTS (rolled back)%', res;
end
$t$;
