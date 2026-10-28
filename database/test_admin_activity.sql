-- Test for supabase_admin_activity_schema.sql (PLAN-overview-sections.md, Step 2).
-- Run it in the Supabase SQL Editor AFTER the schema file (or paste both, schema first,
-- in one go: the exception at the end then also takes the function back, so a trial
-- leaves nothing behind).
--
-- It only reads. It borrows an existing admin and an existing account that is not an
-- admin, acts as each, and ends with an exception that carries the PASS / FAIL lines,
-- so nothing is kept. Look for "TEST RESULT" at the start of the message and for any
-- FAIL line below it.
--
-- Not covered: an archived person being left out (the function uses the same
-- not-exists rule as admin_transactions() and the others, which the totals check below
-- compares against), because that needs an archived account to borrow.

do $test$
declare
  report    text := '';
  adm       uuid;
  usr       uuid;
  today     date := (now() at time zone 'Asia/Manila')::date;
  r         json;
  r60       json;
  r365      json;
  r7        json;
  r90       json;
  r0        json;
  r1000     json;
  rnull     json;
  tx        json;
  pay       json;
  hir       json;
  earn      json;
  caught    text;
  kinds     text[] := array['bookings', 'bookings_accepted', 'projects_started', 'projects_done',
                            'payments', 'payments_confirmed', 'applications', 'hires', 'earned'];
  k         text;
  i         integer;
  dd        date;
  bad       integer := 0;
  nonzero   integer := 0;
  expected  numeric;
  got       numeric;
  summed    numeric;
begin
  select id into adm from public.admins where not must_change_password limit 1;
  select p.id into usr from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  if adm is null or usr is null then
    raise exception 'TEST RESULT needs one admin and one non-admin account to borrow (admin %, other %)', adm, usr;
  end if;

  -- ---- who may call it --------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_activity_trends(30);
    caught := 'no error';
  exception when others then
    caught := sqlerrm;
  end;
  reset role;
  report := report || case when caught = 'Only admins can view stats.' then 'PASS ' else 'FAIL ' end
            || '1 a person who is not an admin is turned away (' || caught || ')' || E'\n';

  set local role anon;
  begin
    perform public.admin_activity_trends(30);
    caught := 'no error';
  exception when others then
    caught := sqlerrm;
  end;
  reset role;
  report := report || case when caught ilike '%permission denied%' then 'PASS ' else 'FAIL ' end
            || '2 a signed-out visitor cannot run it (' || caught || ')' || E'\n';

  report := report || case when (select prosecdef from pg_proc where oid = 'public.admin_activity_trends(integer)'::regprocedure)
                             and (select provolatile = 's' from pg_proc where oid = 'public.admin_activity_trends(integer)'::regprocedure)
                             and (select proconfig::text like '%search_path=public%' from pg_proc where oid = 'public.admin_activity_trends(integer)'::regprocedure)
                           then 'PASS ' else 'FAIL ' end
            || '3 security definer, stable, search_path fixed' || E'\n';

  -- ---- as an admin: the shape ----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r     := public.admin_activity_trends(30);
  r7    := public.admin_activity_trends(7);
  r60   := public.admin_activity_trends(60);
  r90   := public.admin_activity_trends(90);
  r365  := public.admin_activity_trends(365);
  r0    := public.admin_activity_trends(0);
  r1000 := public.admin_activity_trends(1000);
  rnull := public.admin_activity_trends(null);
  tx    := public.admin_transactions();
  pay   := public.admin_payment_counts();
  hir   := public.admin_job_hiring();
  earn  := public.admin_promo_earnings();
  reset role;

  report := report || case when json_array_length(r -> 'days') = 30 and json_array_length(r7 -> 'days') = 7
                                and json_array_length(r90 -> 'days') = 90 then 'PASS ' else 'FAIL ' end
            || '4 one entry per day (7, 30 and 90 days)' || E'\n';
  report := report || case when json_array_length(r0 -> 'days') = 1 and json_array_length(r1000 -> 'days') = 365
                                and json_array_length(rnull -> 'days') = 30 then 'PASS ' else 'FAIL ' end
            || '5 the number of days is kept between 1 and 365 (0 -> 1, 1000 -> 365, null -> 30)' || E'\n';
  report := report || case when ((r::jsonb -> 'days' -> 0) ->> 'day') = (today - 29)::text
                                and ((r::jsonb -> 'days' -> 29) ->> 'day') = today::text then 'PASS ' else 'FAIL ' end
            || '6 oldest day first, today last (Philippine time)' || E'\n';

  bad := 0;
  for i in 0..28 loop
    if ((r::jsonb -> 'days' -> (i + 1)) ->> 'day')::date <> ((r::jsonb -> 'days' -> i) ->> 'day')::date + 1 then
      bad := bad + 1;
    end if;
  end loop;
  report := report || case when bad = 0 then 'PASS ' else 'FAIL ' end || '7 the days follow each other with no gap' || E'\n';

  report := report || case when (select bool_and((select count(*) from json_object_keys(e)) = 10 and (e ->> 'earned')::numeric >= 0)
                                   from json_array_elements(r365 -> 'days') e)
                           then 'PASS ' else 'FAIL ' end
            || '8 every day has all nine numbers (and the day), none below zero' || E'\n';

  report := report || case when (r7::jsonb -> 'totals') = (r90::jsonb -> 'totals')
                                and (r::jsonb -> 'totals') = (r365::jsonb -> 'totals') then 'PASS ' else 'FAIL ' end
            || '9 the totals do not depend on how many days are asked for' || E'\n';

  -- ---- the totals are the numbers the Overview already shows ---------------------
  report := report || case when (r -> 'totals' ->> 'bookings')::int =
                                (tx -> 'bookings' ->> 'pending')::int + (tx -> 'bookings' ->> 'accepted')::int
                                + (tx -> 'bookings' ->> 'declined')::int + (tx -> 'bookings' ->> 'cancelled')::int
                           then 'PASS ' else 'FAIL ' end
            || '10 bookings = pending + accepted + declined + cancelled (admin_transactions)' || E'\n';
  report := report || case when (r -> 'totals' ->> 'bookings_accepted')::int = (tx -> 'bookings' ->> 'accepted')::int
                           then 'PASS ' else 'FAIL ' end
            || '11 accepted bookings = admin_transactions accepted' || E'\n';
  report := report || case when (r -> 'totals' ->> 'projects_started')::int =
                                (tx -> 'projects' ->> 'started')::int + (tx -> 'projects' ->> 'submitted')::int + (tx -> 'projects' ->> 'done')::int
                           then 'PASS ' else 'FAIL ' end
            || '12 projects started = started + submitted + done' || E'\n';
  report := report || case when (r -> 'totals' ->> 'projects_done')::int = (tx -> 'projects' ->> 'done')::int
                           then 'PASS ' else 'FAIL ' end
            || '13 done projects = admin_transactions done' || E'\n';
  report := report || case when (r -> 'totals' ->> 'payments')::int =
                                (pay ->> 'requested')::int + (pay ->> 'sent')::int + (pay ->> 'confirmed')::int
                                + (pay ->> 'not_received')::int + (pay ->> 'cancelled')::int
                           then 'PASS ' else 'FAIL ' end
            || '14 payments = the five steps of admin_payment_counts' || E'\n';
  report := report || case when (r -> 'totals' ->> 'payments_confirmed')::int = (pay ->> 'confirmed')::int
                           then 'PASS ' else 'FAIL ' end
            || '15 confirmed payments = admin_payment_counts confirmed' || E'\n';
  report := report || case when (r -> 'totals' ->> 'applications')::int = (hir -> 'totals' ->> 'applications')::int
                           then 'PASS ' else 'FAIL ' end
            || '16 applications = admin_job_hiring applications' || E'\n';
  report := report || case when (r -> 'totals' ->> 'hires')::int = (hir -> 'totals' ->> 'hired')::int
                           then 'PASS ' else 'FAIL ' end
            || '17 hires = admin_job_hiring hired' || E'\n';
  report := report || case when (r -> 'totals' ->> 'earned')::numeric = (earn ->> 'total')::numeric
                           then 'PASS ' else 'FAIL ' end
            || '18 earned = admin_promo_earnings total (' || (r -> 'totals' ->> 'earned') || ')' || E'\n';

  -- ---- the days add up to the totals (true while the site is under a year old) ----
  bad := 0;
  foreach k in array kinds loop
    select coalesce(sum((e ->> k)::numeric), 0) into summed from json_array_elements(r365 -> 'days') e;
    if summed <> (r365 -> 'totals' ->> k)::numeric then
      bad := bad + 1;
      report := report || 'FAIL 19 ' || k || ' days add up to ' || summed || ' but the total is ' || (r365 -> 'totals' ->> k) || E'\n';
    end if;
  end loop;
  report := report || case when bad = 0 then 'PASS ' else 'FAIL ' end
            || '19 the 365 days add up to the totals, for all nine kinds' || E'\n';

  -- ---- each day equals a separate count of the same rows ----------------------------
  -- Read as the owner (an admin cannot read other people's rows directly).
  bad := 0;
  for i in 0..59 loop
    dd := today - (59 - i);
    foreach k in array kinds loop
      expected := case k
        when 'bookings' then (select count(*) from public.bookings b
                               where (b.created_at at time zone 'Asia/Manila')::date = dd
                                 and not exists (select 1 from public.archived_users a where a.user_id in (b.client_id, b.freelancer_id)))
        when 'bookings_accepted' then (select count(*) from public.bookings b
                               where b.status = 'accepted' and (b.responded_at at time zone 'Asia/Manila')::date = dd
                                 and not exists (select 1 from public.archived_users a where a.user_id in (b.client_id, b.freelancer_id)))
        when 'projects_started' then (select count(*) from public.projects p
                               where (p.started_at at time zone 'Asia/Manila')::date = dd
                                 and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id)))
        when 'projects_done' then (select count(*) from public.projects p
                               where p.status = 'done' and (p.completed_at at time zone 'Asia/Manila')::date = dd
                                 and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id)))
        when 'payments' then (select count(*) from public.payments y
                               where (y.created_at at time zone 'Asia/Manila')::date = dd
                                 and not exists (select 1 from public.archived_users a where a.user_id in (y.client_id, y.freelancer_id)))
        when 'payments_confirmed' then (select count(*) from public.payments y
                               where y.status = 'confirmed' and (y.answered_at at time zone 'Asia/Manila')::date = dd
                                 and not exists (select 1 from public.archived_users a where a.user_id in (y.client_id, y.freelancer_id)))
        when 'applications' then (select count(*) from public.job_applications ap
                               join public.job_posts j on j.id = ap.job_post_id
                               where (ap.created_at at time zone 'Asia/Manila')::date = dd
                                 and not exists (select 1 from public.archived_users a where a.user_id in (ap.freelancer_id, j.client_id)))
        when 'hires' then (select count(*) from public.projects p
                               where p.job_post_id is not null and (p.started_at at time zone 'Asia/Manila')::date = dd
                                 and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id)))
        else (select coalesce(sum(f.amount), 0) from (
                select p.amount, p.decided_at as at from public.promotions p
                 where p.status = 'approved' and not p.test_mode and p.method <> 'free'
                union all
                select b.amount, b.created_at from public.dashboard_billboards b
                 where b.amount is not null and not b.awaiting_payment
                   and not exists (select 1 from public.billboard_checkouts c where c.billboard_id = b.id and c.status = 'paid' and c.test_mode)
              ) f where (f.at at time zone 'Asia/Manila')::date = dd)
      end;
      got := ((r60::jsonb -> 'days' -> i) ->> k)::numeric;
      if expected <> got then
        bad := bad + 1;
        report := report || 'FAIL 20 ' || dd || ' ' || k || ': counted ' || expected || ', function says ' || got || E'\n';
      elsif expected > 0 then
        nonzero := nonzero + 1;
      end if;
    end loop;
  end loop;
  report := report || case when bad = 0 then 'PASS ' else 'FAIL ' end
            || '20 every one of 60 days x 9 kinds equals a separate count (' || nonzero || ' of them above zero)' || E'\n';

  raise exception E'TEST RESULT\n%', report;
end;
$test$;
