-- Test 2 of 4 for supabase_promotions_schema.sql: asking for a Featured post or
-- Pro, the 3 spots per list, and an admin approving or rejecting. Paste this
-- whole file into the Supabase SQL Editor and run it AFTER the schema file. It
-- borrows existing accounts (no accounts are made, so no user numbers are used),
-- acts as each of them, and ends with an error that carries the PASS/FAIL list;
-- that error rolls everything back, so nothing is left behind.
do $t$
declare
  res        text := '';
  msg        text;
  n          int;
  zz         int;
  ts         timestamptz;
  ts2        timestamptz;
  f          uuid;
  f_svc      uuid;
  c          uuid;
  c_job      uuid;
  cx         uuid;
  x_job      uuid;
  s          uuid;
  a_plain    uuid;
  others     uuid[];
  o1         uuid;
  o2         uuid;
  o3         uuid;
  pr_svc     uuid;
  pr_pro     uuid;
  pr_job     uuid;
  pr_ext     uuid;
  tmp        uuid;
  notif0     int;
  notr0      int;
  log0       int;
  pr         record;
begin
  -- A freelancer-account with the fewest offers gets one made-up offer; a
  -- client-account with an open job post is borrowed.
  select p.id into f from public.profiles p
   where p.account_type = 'freelancer'
   order by (select count(*) from public.services sv where sv.freelancer_id = p.id), p.id limit 1;
  insert into public.services (freelancer_id, title, category, description)
  values (f, 'ZZ test offer f', 'graphic-design', 'Made by the test.')
  returning id into f_svc;
  select j.id, j.client_id into c_job, c from public.job_posts j
    join public.profiles p on p.id = j.client_id and p.account_type = 'client'
   where public.job_state(j.id) = 'open' limit 1;
  select id, client_id into x_job, cx from public.job_posts where public.job_state(id) = 'expired' limit 1;
  select id into s from public.profiles where id not in (f, c, cx) limit 1;
  select id into a_plain from public.admins where role = 'admin' and not must_change_password limit 1;
  select array(select id from public.services where freelancer_id <> f order by id limit 3) into others;
  o1 := others[1]; o2 := others[2]; o3 := others[3];

  if f is null or c is null or cx is null or s is null or a_plain is null or o3 is null then
    raise exception 'Needs a freelancer-account, a client-account with an open job post, an expired job post, a stranger, an admin and 3 other offers.';
  end if;

  -- The offline-email trigger would fan the test notifications out to real
  -- people; it is switched off for this block and comes back with the rollback.
  alter table public.user_notifications disable trigger email_offline_on_notification;

  -- Receipt files that "were uploaded" (the function checks they exist).
  insert into storage.objects (bucket_id, name) values
    ('promo-receipts', f::text || '/r1.jpg'), ('promo-receipts', f::text || '/r2.jpg'),
    ('promo-receipts', f::text || '/r3.jpg'), ('promo-receipts', c::text || '/r1.jpg'),
    ('promo-receipts', cx::text || '/r1.jpg'), ('promo-receipts', s::text || '/r1.jpg');

  -- ---- E. Spots and requests ---------------------------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  res := res || case when public.featured_slots_left('service') = 3 and public.featured_slots_left('job') = 3
                     then 'PASS' else 'FAIL' end
         || ' 3 spots are free in each list to begin with' || E'\n';
  begin
    perform public.featured_slots_left('people');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Choose service or job%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an unknown list is refused' || E'\n';
  reset role;

  -- Three other offers are Featured: the list is full.
  insert into public.featured_posts (service_id, featured_until) values
    (o1, now() + interval '1 day'), (o2, now() + interval '1 day'), (o3, now() + interval '1 day');

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  res := res || case when public.featured_slots_left('service') = 0 and public.featured_slots_left('job') = 3
                     then 'PASS' else 'FAIL' end
         || ' three Featured offers fill the offers list and not the jobs list' || E'\n';

  begin
    perform public.request_promotion('feature_7', f_svc, null, '1234567890123', f::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'All 3 Featured spots are taken%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a full list refuses a new request before anyone pays' || E'\n';
  reset role;

  -- One of them ends: a spot is free again.
  update public.featured_posts set featured_until = now() - interval '1 hour' where service_id = o3;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  res := res || case when public.featured_slots_left('service') = 1 then 'PASS' else 'FAIL' end
         || ' a Featured offer that ended gives its spot back' || E'\n';

  begin
    perform public.request_promotion('feature_99', f_svc, null, '1234567890123', f::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Choose one of the listed options%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an unknown option is refused' || E'\n';

  begin
    perform public.request_promotion('feature_7', null, null, '1234567890123', f::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Choose one post to feature%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a request with no post is refused' || E'\n';

  begin
    perform public.request_promotion('feature_7', f_svc, c_job, '1234567890123', f::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Choose one post to feature%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a request with two posts is refused' || E'\n';

  begin
    perform public.request_promotion('feature_7', o1, null, '1234567890123', f::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'You can only feature your own offers%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' someone else''s offer cannot be featured' || E'\n';

  begin
    perform public.request_promotion('feature_7', null, c_job, '1234567890123', f::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'You can only feature your own job posts%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' someone else''s job post cannot be featured' || E'\n';

  begin
    perform public.request_promotion('feature_7', f_svc, null, '12345678901', f::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'The GCash reference number is 13 digits%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a reference that is not 13 digits is refused' || E'\n';

  begin
    perform public.request_promotion('feature_7', f_svc, null, '1234567890123', f::text || '/never-uploaded.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Attach your receipt screenshot%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a receipt that was never uploaded is refused' || E'\n';

  begin
    perform public.request_promotion('feature_7', f_svc, null, '1234567890123', s::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Attach your receipt screenshot%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a receipt from someone else''s folder is refused' || E'\n';

  -- The real request: 7 days = 99 pesos.
  pr_svc := public.request_promotion('feature_7', f_svc, null, '1234 5678 90123', f::text || '/r1.jpg');
  reset role;
  select * into pr from public.promotions where id = pr_svc;
  res := res || case when pr.status = 'pending' and pr.amount = 99.00 and pr.days = 7 and pr.kind = 'feature_service'
                      and pr.reference_no = '1234567890123' and pr.user_id = f
                      and pr.target_title = 'ZZ test offer f'
                      and pr.decided_at is null and pr.starts_at is null
                 then 'PASS' else 'FAIL' end
         || ' a request is saved as pending with the price, days, title and the reference without spaces' || E'\n';

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.request_promotion('feature_3', f_svc, null, '2234567890123', f::text || '/r2.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'A request for this offer is already waiting%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a second request for the same offer is refused while one waits' || E'\n';

  begin
    perform public.request_promotion('pro_30', null, null, '1234567890123', f::text || '/r2.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'This reference number was already recorded%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a reference number can be used only once' || E'\n';

  begin
    perform public.request_promotion('pro_30', f_svc, null, '2234567890123', f::text || '/r2.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Pro is for your account%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' Pro with a post attached is refused' || E'\n';

  pr_pro := public.request_promotion('pro_30', null, null, '2234567890123', f::text || '/r2.jpg');
  begin
    perform public.request_promotion('pro_30', null, null, '3334567890123', f::text || '/r3.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'You already have a Pro payment waiting%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a second Pro request is refused while one waits' || E'\n';
  reset role;
  select amount into n from public.promotions where id = pr_pro;
  res := res || case when n = 149 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the Pro request costs 149' || E'\n';

  -- A client: not Pro, but can feature their own open job post.
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', c::text, true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.request_promotion('pro_30', null, null, '4234567890123', c::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Freelancer Pro is for freelancer accounts%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a client cannot buy Freelancer Pro' || E'\n';

  pr_job := public.request_promotion('feature_3', null, c_job, '5234567890123', c::text || '/r1.jpg');
  reset role;
  select amount into n from public.promotions where id = pr_job;
  res := res || case when n = 49 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a client can request Featured for their open job post at 49' || E'\n';

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', cx, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', cx::text, true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.request_promotion('feature_3', null, x_job, '6234567890123', cx::text || '/r1.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Only an open job post can be featured%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an expired job post cannot be featured' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', s::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from public.promotions;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a stranger sees none of the requests' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from public.promotions;
  res := res || case when n = 2 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a person sees only their own requests' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  select count(*) into n from public.promotions;
  res := res || case when n = 3 then 'PASS' else 'FAIL (' || n || ')' end
         || ' an admin sees all the requests' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', '{"role":"authenticated"}', true), set_config('request.jwt.claim.sub', '', true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.request_promotion('feature_7', f_svc, null, '7234567890123', f::text || '/r3.jpg');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Please sign in first%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a request without a signed-in person is refused' || E'\n';
  reset role;

  -- ---- F. Approve and reject ---------------------------------------------
  -- The other test offers stop being Featured, so the list has room again.
  update public.featured_posts set featured_until = now() - interval '1 hour' where service_id in (o1, o2, o3);

  select count(*) into notif0 from public.user_notifications where user_id = f and type = 'promotion_approved';
  select count(*) into log0 from public.admin_log where action = 'promotion' and admin_id = a_plain;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.approve_promotion(pr_svc);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Only an admin can approve%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a normal person cannot approve their own request' || E'\n';
  begin
    perform public.reject_promotion(pr_svc, 'I do not want to wait');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Only an admin can reject%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a normal person cannot reject a request' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  perform public.approve_promotion(pr_svc);
  begin
    perform public.approve_promotion(pr_svc);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'This request was already answered%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a request cannot be answered twice' || E'\n';
  reset role;

  select * into pr from public.promotions where id = pr_svc;
  res := res || case when pr.status = 'approved' and pr.decided_by = a_plain and pr.decided_at is not null
                      and pr.ends_at - pr.starts_at = interval '7 days' and pr.starts_at <= now() + interval '1 second'
                 then 'PASS' else 'FAIL' end
         || ' approving gives 7 days from now and records the admin' || E'\n';

  select featured_until into ts from public.featured_posts where service_id = f_svc;
  res := res || case when ts = pr.ends_at then 'PASS' else 'FAIL' end
         || ' the offer is now Featured until the end of that period' || E'\n';

  select count(*) into n from public.user_notifications where user_id = f and type = 'promotion_approved';
  res := res || case when n = notif0 + 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the person is told it was approved' || E'\n';

  select count(*) into n from public.admin_log where action = 'promotion' and admin_id = a_plain;
  res := res || case when n = log0 + 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the approval is in the Activity Log' || E'\n';

  -- Pro is approved: 30 days, and the Pro price shows up after that.
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  perform public.approve_promotion(pr_pro);
  reset role;
  select * into pr from public.promotions where id = pr_pro;
  select pro_until into ts from public.pro_members where user_id = f;
  res := res || case when pr.status = 'approved' and ts = pr.ends_at and pr.ends_at - pr.starts_at = interval '30 days'
                      and public.is_pro(f) and not public.is_pro(s)
                 then 'PASS' else 'FAIL' end
         || ' approving Pro makes the person a Pro member for 30 days' || E'\n';

  -- Paying again for an offer that is already Featured: no new spot needed, and
  -- a Pro member pays the lower price.
  update public.featured_posts set featured_until = now() + interval '1 day' where service_id in (o1, o2);
  select featured_until into ts from public.featured_posts where service_id = f_svc;

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', f::text, true), set_config('role', 'authenticated', true)) q;
  res := res || case when public.featured_slots_left('service') = 0 then 'PASS' else 'FAIL' end
         || ' the list is full again (3 Featured offers)' || E'\n';
  pr_ext := public.request_promotion('feature_14', f_svc, null, '8234567890123', f::text || '/r3.jpg');
  reset role;
  select amount into n from public.promotions where id = pr_ext;
  res := res || case when n = 90 then 'PASS' else 'FAIL (' || n || ')' end
         || ' paying again works in a full list, and a Pro member pays 90 for 14 days' || E'\n';

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  perform public.approve_promotion(pr_ext);
  reset role;
  select featured_until into ts2 from public.featured_posts where service_id = f_svc;
  select count(*) into n from public.featured_posts where service_id = f_svc;
  res := res || case when ts2 = ts + interval '14 days' and n = 1 then 'PASS' else 'FAIL' end
         || ' approving adds 14 days to the period that was running' || E'\n';

  -- Reject.
  select count(*) into notr0 from public.user_notifications where user_id = c and type = 'promotion_rejected';
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.reject_promotion(pr_job, 'no');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Write a reason of 3 to 200 characters%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a rejection needs a reason of at least 3 characters' || E'\n';
  begin
    perform public.reject_promotion(pr_job, repeat('x', 201));
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Write a reason of 3 to 200 characters%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a reason over 200 characters is refused' || E'\n';
  perform public.reject_promotion(pr_job, '  Reference number not found in our GCash.  ');
  begin
    perform public.approve_promotion('00000000-0000-0000-0000-000000000000');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'That request was not found%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an unknown request is refused' || E'\n';
  reset role;

  select * into pr from public.promotions where id = pr_job;
  res := res || case when pr.status = 'rejected' and pr.reject_reason = 'Reference number not found in our GCash.'
                      and pr.decided_by = a_plain and pr.starts_at is null and pr.ends_at is null
                 then 'PASS' else 'FAIL' end
         || ' rejecting saves the (trimmed) reason and gives nothing' || E'\n';

  select count(*) into n from public.featured_posts where job_id = c_job;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a rejected request does not feature the job post' || E'\n';

  select count(*) into n from public.user_notifications
    where user_id = c and type = 'promotion_rejected' and message like '%Reference number not found in our GCash.%';
  res := res || case when n = notr0 + 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the person is told, with the reason' || E'\n';

  -- The reference number of a rejected request can be used again.
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', c::text, true), set_config('role', 'authenticated', true)) q;
  tmp := public.request_promotion('feature_3', null, c_job, '5234567890123', c::text || '/r1.jpg');
  reset role;
  res := res || case when tmp is not null then 'PASS' else 'FAIL' end
         || ' after a rejection the same reference and job post can be sent again' || E'\n';

  res := res || E'\n' || (length(res) - length(replace(res, 'PASS', ''))) / 4 || ' passed, '
         || (length(res) - length(replace(res, 'FAIL', ''))) / 4 || ' failed' || E'\n';

  raise exception E'PROMOTIONS TEST 2: REQUESTS (rolled back, nothing left behind)\n\n%', res;
end
$t$;
