-- Test for supabase_promo_earnings_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It borrows existing
-- accounts (no accounts are made, so no user numbers are used), adds made-up
-- requests, a made-up sponsored billboard and made-up Featured / Pro rows, asks
-- admin_promo_earnings() before and after, and checks every number moved by
-- exactly what was added. It ends with an error that carries the PASS/FAIL list;
-- that error rolls everything back, so nothing is left behind.
do $t$
declare
  res        text := '';
  msg        text;
  st         text;
  zz         int;
  f          uuid;   -- a freelancer-account (gets the made-up Pro)
  s          uuid;   -- another person (a waiting Pro request) and the "normal user"
  a_plain    uuid;   -- an admin
  svc        uuid;   -- an offer that is not Featured yet
  jb         uuid;   -- a job post that is not Featured yet
  b0         json;   -- the numbers before
  b1         json;   -- the numbers after
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  select id into f from public.profiles
   where account_type = 'freelancer' and id not in (select user_id from public.pro_members) limit 1;
  select id into s from public.profiles where id <> f limit 1;
  select id into a_plain from public.admins where role = 'admin' and not must_change_password limit 1;
  select id into svc from public.services
   where id not in (select service_id from public.featured_posts where service_id is not null) limit 1;
  select id into jb from public.job_posts
   where id not in (select job_id from public.featured_posts where job_id is not null) limit 1;
  if f is null or s is null or a_plain is null or svc is null or jb is null then
    raise exception 'Needs a freelancer-account, another person, an admin, an offer and a job post that are not Featured.';
  end if;

  -- ---- Before ------------------------------------------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  b0 := public.admin_promo_earnings();
  reset role;
  res := res || case when (b0 ->> 'total') is not null and (b0 -> 'waiting' ->> 'count') is not null
                      and (b0 -> 'by_kind' -> 'billboard' ->> 'amount') is not null and (b0 -> 'running' ->> 'pro_members') is not null
                 then 'PASS' else 'FAIL' end
         || ' an admin gets the numbers, in the shape the Overview reads' || E'\n';

  -- ---- Made-up money -----------------------------------------------------
  -- Approved now: an offer (99), a job post (49). Approved 45 days ago: Pro (149),
  -- so it is not "this month". Waiting: a Pro request (149). A sponsored billboard: 2000.
  insert into public.promotions (user_id, kind, price_code, service_id, target_title, days, amount, reference_no, receipt_path, status, decided_at, decided_by, starts_at, ends_at)
  values (f, 'feature_service', 'feature_7', svc, 'ZZ earn offer', 7, 99, '9000000000001', f::text || '/e1.jpg', 'approved', now(), a_plain, now(), now() + interval '7 days');
  insert into public.promotions (user_id, kind, price_code, days, amount, reference_no, receipt_path, status, decided_at, decided_by, starts_at, ends_at)
  values (f, 'pro', 'pro_30', 30, 149, '9000000000002', f::text || '/e2.jpg', 'approved', now() - interval '45 days', a_plain, now() - interval '45 days', now() - interval '15 days');
  insert into public.promotions (user_id, kind, price_code, job_id, target_title, days, amount, reference_no, receipt_path, status, decided_at, decided_by, starts_at, ends_at)
  values (f, 'feature_job', 'feature_3', jb, 'ZZ earn job', 3, 49, '9000000000003', f::text || '/e3.jpg', 'approved', now(), a_plain, now(), now() + interval '3 days');
  insert into public.promotions (user_id, kind, price_code, days, amount, reference_no, receipt_path)
  values (s, 'pro', 'pro_30', 30, 149, '9000000000004', s::text || '/e4.jpg');
  -- A rejected request earns nothing.
  insert into public.promotions (user_id, kind, price_code, days, amount, reference_no, receipt_path, status, reject_reason, decided_at, decided_by)
  values (s, 'pro', 'pro_30', 30, 149, '9000000000006', s::text || '/e6.jpg', 'rejected', 'Reference not found.', now(), a_plain);
  insert into public.dashboard_billboards (title, audience, amount, payment_ref) values ('ZZ earn billboard', 'all', 2000, '9000000000005');
  -- A billboard with no amount adds nothing.
  insert into public.dashboard_billboards (title, audience) values ('ZZ earn welcome', 'all');
  -- Running now: an offer and a job post Featured, one Pro member.
  insert into public.featured_posts (service_id, featured_until) values (svc, now() + interval '1 day');
  insert into public.featured_posts (job_id, featured_until) values (jb, now() + interval '1 day');
  insert into public.pro_members (user_id, pro_until) values (f, now() + interval '10 days');

  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  b1 := public.admin_promo_earnings();
  reset role;

  res := res || case when (b1 ->> 'total')::numeric - (b0 ->> 'total')::numeric = 2297 then 'PASS'
                     else 'FAIL (' || ((b1 ->> 'total')::numeric - (b0 ->> 'total')::numeric) || ')' end
         || ' the total grew by exactly 99 + 149 + 49 + 2000 (the rejected request and the billboard with no amount add nothing)' || E'\n';
  res := res || case when (b1 ->> 'this_month')::numeric - (b0 ->> 'this_month')::numeric = 2148 then 'PASS'
                     else 'FAIL (' || ((b1 ->> 'this_month')::numeric - (b0 ->> 'this_month')::numeric) || ')' end
         || ' this month grew by 99 + 49 + 2000 only (the Pro approved 45 days ago is not this month)' || E'\n';
  res := res || case when (b1 -> 'waiting' ->> 'count')::int - (b0 -> 'waiting' ->> 'count')::int = 1
                      and (b1 -> 'waiting' ->> 'amount')::numeric - (b0 -> 'waiting' ->> 'amount')::numeric = 149 then 'PASS' else 'FAIL' end
         || ' waiting grew by the one pending request, 149' || E'\n';
  res := res || case when (b1 -> 'by_kind' -> 'feature_service' ->> 'count')::int - (b0 -> 'by_kind' -> 'feature_service' ->> 'count')::int = 1
                      and (b1 -> 'by_kind' -> 'feature_service' ->> 'amount')::numeric - (b0 -> 'by_kind' -> 'feature_service' ->> 'amount')::numeric = 99 then 'PASS' else 'FAIL' end
         || ' Featured offers: 1 more, 99' || E'\n';
  res := res || case when (b1 -> 'by_kind' -> 'feature_job' ->> 'count')::int - (b0 -> 'by_kind' -> 'feature_job' ->> 'count')::int = 1
                      and (b1 -> 'by_kind' -> 'feature_job' ->> 'amount')::numeric - (b0 -> 'by_kind' -> 'feature_job' ->> 'amount')::numeric = 49 then 'PASS' else 'FAIL' end
         || ' Featured job posts: 1 more, 49' || E'\n';
  res := res || case when (b1 -> 'by_kind' -> 'pro' ->> 'count')::int - (b0 -> 'by_kind' -> 'pro' ->> 'count')::int = 1
                      and (b1 -> 'by_kind' -> 'pro' ->> 'amount')::numeric - (b0 -> 'by_kind' -> 'pro' ->> 'amount')::numeric = 149 then 'PASS' else 'FAIL' end
         || ' Freelancer Pro: 1 more, 149' || E'\n';
  res := res || case when (b1 -> 'by_kind' -> 'billboard' ->> 'count')::int - (b0 -> 'by_kind' -> 'billboard' ->> 'count')::int = 1
                      and (b1 -> 'by_kind' -> 'billboard' ->> 'amount')::numeric - (b0 -> 'by_kind' -> 'billboard' ->> 'amount')::numeric = 2000 then 'PASS' else 'FAIL' end
         || ' Sponsored billboards: 1 more, 2000' || E'\n';
  res := res || case when (b1 -> 'running' ->> 'featured_offers')::int - (b0 -> 'running' ->> 'featured_offers')::int = 1
                      and (b1 -> 'running' ->> 'featured_jobs')::int - (b0 -> 'running' ->> 'featured_jobs')::int = 1
                      and (b1 -> 'running' ->> 'pro_members')::int - (b0 -> 'running' ->> 'pro_members')::int = 1 then 'PASS' else 'FAIL' end
         || ' running now: 1 more Featured offer, 1 more Featured job post, 1 more Pro member' || E'\n';

  -- The by-kind parts add up to the total.
  res := res || case when (b1 ->> 'total')::numeric = (b1 -> 'by_kind' -> 'feature_service' ->> 'amount')::numeric + (b1 -> 'by_kind' -> 'feature_job' ->> 'amount')::numeric
                                                       + (b1 -> 'by_kind' -> 'pro' ->> 'amount')::numeric + (b1 -> 'by_kind' -> 'billboard' ->> 'amount')::numeric
                 then 'PASS' else 'FAIL' end
         || ' the four parts add up to the total' || E'\n';

  -- A Featured or Pro period that has ended is not "running".
  insert into public.featured_posts (service_id, featured_until)
  select id, now() - interval '1 hour' from public.services where id <> svc and id not in (select service_id from public.featured_posts where service_id is not null) limit 1;
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', a_plain, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', a_plain::text, true), set_config('role', 'authenticated', true)) q;
  res := res || case when (public.admin_promo_earnings() -> 'running' ->> 'featured_offers')::int = (b1 -> 'running' ->> 'featured_offers')::int then 'PASS' else 'FAIL' end
         || ' a Featured offer that ended is not counted as running' || E'\n';
  reset role;

  -- ---- Who may ask -------------------------------------------------------
  select count(*) into zz from (select set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', s::text, true), set_config('role', 'authenticated', true)) q;
  begin
    perform public.admin_promo_earnings();
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Only admins can view stats%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a normal user is turned away' || E'\n';
  reset role;

  select count(*) into zz from (select set_config('request.jwt.claims', '{}', true), set_config('request.jwt.claim.sub', '', true), set_config('role', 'anon', true)) q;
  begin
    perform public.admin_promo_earnings();
    msg := null;
  exception when others then msg := sqlerrm; st := sqlstate;
  end;
  res := res || case when st = '42501' and msg is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor cannot run it' || E'\n';
  reset role;

  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL' end
         || ' the user number counter did not move' || E'\n';

  res := res || E'\n' || (length(res) - length(replace(res, 'PASS', ''))) / 4 || ' passed, '
         || (length(res) - length(replace(res, 'FAIL', ''))) / 4 || ' failed' || E'\n';

  raise exception E'ADMIN PROMO EARNINGS TEST (rolled back, nothing left behind)\n\n%', res;
end
$t$;
