-- Test for supabase_offer_review_done_schema.sql (an offer is rated only after a
-- finished project from it). Paste this whole file into the Supabase SQL Editor
-- and run it AFTER the schema file (or send the schema file and this block
-- together in one call to try it before applying: the error at the end rolls
-- the schema back too). It BORROWS real accounts (2 clients and a freelancer
-- with a visible offer) only to act as them, and makes up bookings and projects
-- for them. It ends with an error that carries the PASS/FAIL list; that error
-- rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  ok boolean;
  msg text;
  ca uuid; cb uuid;            -- two clients with no booking or rating on the offer
  fr uuid; svc uuid;           -- a freelancer and one of their visible offers
  svc2 uuid;                   -- a second offer of that freelancer (made up if they have one only)
  bk uuid; pj uuid;            -- client ca's booking of svc and its project
  bk2 uuid;
  r1 uuid; r2 uuid;
  done_msg constant text := 'You can rate this offer after your project from it is done.';
begin
  -- A freelancer with two offers is picked first, so no offer has to be made up
  -- (the 3-offer limit could refuse one).
  select s.id, s.freelancer_id into svc, fr from public.services s
    where public.is_verified(s.freelancer_id) and not public.is_posting_blocked(s.freelancer_id)
    order by exists (select 1 from public.services o where o.freelancer_id = s.freelancer_id and o.id <> s.id) desc, s.created_at
    limit 1;
  select id into svc2 from public.services where freelancer_id = fr and id <> svc order by created_at limit 1;
  if svc2 is null then
    insert into public.services (freelancer_id, title, category, description)
      values (fr, 'Second test offer', 'copywriting', 'A test offer.') returning id into svc2;
  end if;
  select id into ca from public.profiles p where account_type = 'client' and id <> fr
    and not public.is_posting_blocked(id) and not public.is_suspended(id)
    and not exists (select 1 from public.bookings b where b.client_id = p.id and b.service_id = svc)
    and not exists (select 1 from public.service_reviews r where r.author_id = p.id and r.service_id = svc)
    order by created_at limit 1;
  select id into cb from public.profiles p where account_type = 'client' and id not in (fr, ca)
    and not public.is_posting_blocked(id) and not public.is_suspended(id)
    and not exists (select 1 from public.bookings b where b.client_id = p.id and b.service_id = svc)
    and not exists (select 1 from public.service_reviews r where r.author_id = p.id and r.service_id in (svc, svc2))
    order by created_at desc limit 1;
  if ca is null or cb is null or svc is null then
    raise exception 'This test borrows 2 clients and a visible offer from the database. One of them is missing.';
  end if;

  -- ===== Client ca: never booked, then each step of a booking =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', ca::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ca, 'role', 'authenticated')::text, true);
  begin
    perform public.add_service_review(svc, 5, 'never booked');
    res := res || E'\nFAIL  1a. a client who never booked the offer could rate it';
  exception when others then
    res := res || E'\n' || case when sqlerrm = done_msg then 'PASS  ' else 'FAIL  ' end || '1a. a client who never booked the offer is refused (' || sqlerrm || ')';
  end;

  reset role;
  insert into public.bookings (client_id, freelancer_id, service_id, title, due_date)
    values (ca, fr, svc, 'Test booking', current_date + 7) returning id into bk;
  set local role authenticated;
  begin
    perform public.add_service_review(svc, 5, 'pending booking');
    res := res || E'\nFAIL  1b. a pending booking was enough to rate';
  exception when others then
    res := res || E'\n' || case when sqlerrm = done_msg then 'PASS  ' else 'FAIL  ' end || '1b. a booking still waiting for the freelancer is refused';
  end;

  reset role;
  update public.bookings set status = 'declined', responded_at = now() where id = bk;
  set local role authenticated;
  begin
    perform public.add_service_review(svc, 5, 'declined booking');
    res := res || E'\nFAIL  1c. a declined booking was enough to rate';
  exception when others then
    res := res || E'\n' || case when sqlerrm = done_msg then 'PASS  ' else 'FAIL  ' end || '1c. a declined booking is refused';
  end;

  reset role;
  update public.bookings set status = 'accepted' where id = bk;
  insert into public.projects (booking_id, client_id, freelancer_id, title, due_date)
    values (bk, ca, fr, 'Test booking', current_date + 7) returning id into pj;
  set local role authenticated;
  begin
    perform public.add_service_review(svc, 5, 'project started');
    res := res || E'\nFAIL  1d. a started project was enough to rate';
  exception when others then
    res := res || E'\n' || case when sqlerrm = done_msg then 'PASS  ' else 'FAIL  ' end || '1d. a project that has only started is refused';
  end;

  reset role;
  update public.projects set status = 'submitted', submitted_at = now(), submission_link = 'https://example.com/work' where id = pj;
  set local role authenticated;
  begin
    perform public.add_service_review(svc, 5, 'work sent');
    res := res || E'\nFAIL  1e. a submitted project was enough to rate';
  exception when others then
    res := res || E'\n' || case when sqlerrm = done_msg then 'PASS  ' else 'FAIL  ' end || '1e. work sent but not yet marked Done is refused';
  end;

  reset role;
  update public.projects set status = 'done', completed_at = now() where id = pj;
  set local role authenticated;
  begin
    r1 := public.add_service_review(svc, 5, '  Great work!  ');
    select stars = 5 and comment = 'Great work!' and author_id = ca into ok from public.service_reviews where id = r1;
    res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1f. once the project is Done the client rates the offer';
  exception when others then
    res := res || E'\nFAIL  1f. a Done project was refused (' || sqlerrm || ')';
  end;

  begin
    perform public.add_service_review(svc, 4, 'again');
    res := res || E'\nFAIL  1g. a second rating was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm like 'You already rated this offer.%' then 'PASS  ' else 'FAIL  ' end || '1g. still one rating per client per offer';
  end;

  -- ===== Client cb: Done projects that are NOT from this offer =====
  reset role;
  -- Hired from a job post (no booking), with the same freelancer.
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submitted_at, completed_at)
    values (cb, fr, 'Test hire', current_date, 'done', now(), now());
  -- Booked the freelancer's OTHER offer, done.
  insert into public.bookings (client_id, freelancer_id, service_id, title, due_date, status, responded_at)
    values (cb, fr, svc2, 'Second test offer', current_date, 'accepted', now()) returning id into bk2;
  insert into public.projects (booking_id, client_id, freelancer_id, title, due_date, status, submitted_at, completed_at)
    values (bk2, cb, fr, 'Second test offer', current_date, 'done', now(), now());
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', cb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cb, 'role', 'authenticated')::text, true);
  begin
    perform public.add_service_review(svc, 5, 'other work');
    res := res || E'\nFAIL  2a. a Done project with the same freelancer, but not from this offer, was enough';
  exception when others then
    res := res || E'\n' || case when sqlerrm = done_msg then 'PASS  ' else 'FAIL  ' end || '2a. a Done hire or a Done booking of ANOTHER offer does not open this one';
  end;
  begin
    r2 := public.add_service_review(svc2, 4, 'the offer I booked');
    res := res || E'\n' || case when r2 is not null then 'PASS  ' else 'FAIL  ' end || '2b. that client can rate the offer they did finish';
  exception when others then
    res := res || E'\nFAIL  2b. rating the finished offer was refused (' || sqlerrm || ')';
  end;

  -- ===== The other checks still come first =====
  perform set_config('request.jwt.claim.sub', fr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  -- The freelancer may be switched to client mode right now; then they are told
  -- it is their own offer instead.
  begin
    perform public.add_service_review(svc2, 5, 'mine');
    res := res || E'\nFAIL  3a. the freelancer rated their own offer';
  exception when others then
    res := res || E'\n' || case when sqlerrm in ('Only client accounts can rate and comment on an offer.', 'You can''t rate your own offer.') then 'PASS  ' else 'FAIL  ' end
      || '3a. the offer''s freelancer still can''t rate it (' || sqlerrm || ')';
  end;
  reset role;
  select not has_function_privilege('anon', 'public.add_service_review(uuid, integer, text)', 'execute')
     and has_function_privilege('authenticated', 'public.add_service_review(uuid, integer, text)', 'execute') into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3b. only signed-in people can call add_service_review';

  -- ===== Part 2, the one-time cleanup =====
  -- A rating from before the rule: cb on svc, with no finished project from it.
  -- This only checks which ratings part 2's condition picks (the Supabase
  -- connector won't run a DELETE without a confirm); the delete itself is one
  -- line using the same condition.
  insert into public.service_reviews (service_id, author_id, stars, comment) values (svc, cb, 3, 'from before the rule');
  select exists (
      select 1 from public.service_reviews r where r.service_id = svc and r.author_id = cb and not exists (
        select 1 from public.bookings b join public.projects p on p.booking_id = b.id
        where b.service_id = r.service_id and b.client_id = r.author_id and p.status = 'done'))
     and not exists (
      select 1 from public.service_reviews r where r.id in (r1, r2) and not exists (
        select 1 from public.bookings b join public.projects p on p.booking_id = b.id
        where b.service_id = r.service_id and b.client_id = r.author_id and p.status = 'done')) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '4a. the cleanup picks the rating with no finished project and leaves the two that have one';

  raise exception 'TEST RESULTS (rolled back):%', res;
end
$t$;
