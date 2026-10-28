-- Test for supabase_community_billboard_schema.sql (all three parts). Send the schema and
-- this block together in ONE call to try it before applying (the error at the end rolls the
-- schema back too), or run this alone in the Supabase SQL Editor after the schema. It
-- BORROWS real accounts (no user numbers are used): a verified person with an offer (the
-- poster), a verified person with a job post (a client for this block), another person (a
-- freelancer for this block), someone who is not verified, and an admin. It gives Premium
-- for the block only, and switches the e-mail triggers off. It ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back.
do $t$
declare
  res text := '';
  f uuid; s uuid;       -- the poster: verified, with an offer
  c uuid; j uuid;       -- a verified person with a job post
  n uuid;               -- another person
  u uuid;               -- someone who is not verified (may not exist)
  na uuid;              -- an admin
  ad1 uuid; ad2 uuid; ad3 uuid; ad4 uuid; ad5 uuid; ad6 uuid;
  co1 json; co2 json; co5 json; co6 json;
  co_id uuid; co_test boolean;
  slots0 integer; slots1 integer;
  refused boolean;
  k integer;
  r json; r2 json;
begin
  alter table public.user_notifications disable trigger email_offline_on_notification;
  alter table public.messages disable trigger email_offline_on_message;

  select s1.id, s1.freelancer_id into s, f from public.services s1 join public.profiles p on p.id = s1.freelancer_id
   where public.is_verified(p.id) and not public.is_posting_blocked(p.id) and not public.is_pro(p.id)
     and not exists (select 1 from public.admins a where a.id = p.id)
   order by s1.id limit 1;
  select j1.id, j1.client_id into j, c from public.job_posts j1 join public.profiles p on p.id = j1.client_id
   where public.is_verified(p.id) and not public.is_posting_blocked(p.id) and not public.is_pro(p.id)
     and p.id is distinct from f and not exists (select 1 from public.admins a where a.id = p.id)
   order by j1.id limit 1;
  select p.id into n from public.profiles p
   where p.id not in (f, c) and not public.is_pro(p.id) and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select p.id into u from public.profiles p
   where not public.is_verified(p.id) and p.id not in (f, c, n) and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select a.id into na from public.admins a where not a.must_change_password order by a.id limit 1;
  if f is null or c is null or n is null or na is null then
    raise exception 'Needs a verified person with an offer, a verified person with a job post, another person and an admin.';
  end if;
  update public.profiles set account_type = 'freelancer' where id in (f, n);
  update public.profiles set account_type = 'client' where id = c;

  -- ===== 1. Prices, table rules, bucket =====
  select count(*) into k from public.promo_prices
   where (code, price, pro_price) in (('ad_3', 149, 75), ('ad_7', 299, 150), ('ad_14', 499, 250));
  res := res || case when k = 3 then 'PASS' else 'FAIL' end || ' 1 the three ad prices are in the price list (149 / 299 / 499, Premium 75 / 150 / 250)' || E'\n';
  select count(*) into k from pg_trigger where tgname = 'member_ads_mask_words' and not tgisinternal;
  res := res || case when k = 1 then 'PASS' else 'FAIL' end || ' 2 bad words in ads are masked like in offers (the trigger is there)' || E'\n';
  res := res || case when (select public from storage.buckets where id = 'member-ad-images')
                      and (select file_size_limit from storage.buckets where id = 'member-ad-images') = 2097152
                      and (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'member-ad-images:%') = 4
                then 'PASS' else 'FAIL' end || ' 3 the picture bucket is public, 2 MB, with its 4 rules' || E'\n';

  -- ===== 2. Sending an ad =====
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    refused := false;
    begin
      perform public.request_member_ad('Hello there', null, null, 'all', 'ad_3', null, null);
    exception when others then refused := sqlerrm like '%Verify your identity%';
    end;
    reset role;
    res := res || case when refused then 'PASS' else 'FAIL' end || ' 4 someone who is not verified can''t advertise' || E'\n';
  else
    res := res || 'SKIP 4 nobody who is not verified was found to borrow' || E'\n';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ad1 := public.request_member_ad('Logo design for shops', 'Fast, 2 free revisions.', null, 'all', 'ad_7', 'service', s);
  reset role;
  res := res || case when (select status from public.member_ads where id = ad1) = 'pending'
                      and (select days from public.member_ads where id = ad1) = 7
                      and (select link_service from public.member_ads where id = ad1) = s
                then 'PASS' else 'FAIL' end || ' 5 a verified member sends an ad: it waits for review, 7 days, linked to their own offer' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.request_member_ad('See http://example.com now', null, null, 'all', 'ad_3', null, null);
  exception when others then refused := sqlerrm like '%leave links out%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 6 a link in the headline is refused' || E'\n';
  refused := false;
  begin perform public.request_member_ad('Hello there', 'Visit www.example.com today', null, 'all', 'ad_3', null, null);
  exception when others then refused := sqlerrm like '%leave links out%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 7 a link in the message is refused' || E'\n';
  refused := false;
  begin perform public.request_member_ad('Hello there', null, null, 'all', 'ad_3', 'job', j);
  exception when others then refused := sqlerrm like '%not found among yours%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 8 a button to someone else''s job post is refused' || E'\n';
  refused := false;
  begin perform public.request_member_ad('Hello there', null, n::text || '/x.jpg', 'all', 'ad_3', null, null);
  exception when others then refused := sqlerrm like '%not yours%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 9 a picture from someone else''s folder is refused' || E'\n';
  refused := false;
  begin perform public.request_member_ad('Hello there', null, null, 'all', 'feature_3', null, null);
  exception when others then refused := sqlerrm like '%Choose how long%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 10 a Featured price code is not an ad length' || E'\n';
  refused := false;
  begin perform public.request_member_ad('Hello there', null, null, 'everyone', 'ad_3', null, null);
  exception when others then refused := sqlerrm like '%Choose who sees%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 11 an unknown audience is refused' || E'\n';

  ad2 := public.request_member_ad('Wedding invites and prints', null, null, 'client', 'ad_3', 'profile', null);
  ad3 := public.request_member_ad('Brand kit for startups', 'Logo, colors and fonts.', null, 'all', 'ad_14', null, null);
  refused := false;
  begin perform public.request_member_ad('A fourth one', null, null, 'all', 'ad_3', null, null);
  exception when others then refused := sqlerrm like '%3 ads waiting%'; end;
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 12 at most 3 ads can wait for review' || E'\n';

  -- ===== 3. The admin answers =====
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.review_member_ad(ad1, true);
  exception when others then refused := sqlerrm like '%Only an admin%'; end;
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 13 a member can''t approve an ad' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', na, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.review_member_ad(ad1, true);
  reset role;
  res := res || case when (select status from public.member_ads where id = ad1) = 'approved'
                      and (select reviewed_by from public.member_ads where id = ad1) = na
                      and (select count(*) from public.user_notifications
                            where user_id = f and type = 'promotion_approved' and title = 'Your ad was approved'
                              and link = '/dashboard/advertise' and message like '%₱299.00%') = 1
                then 'PASS' else 'FAIL' end || ' 14 an admin approves: the ad is approved, the owner is told to pay 299 pesos' || E'\n';
  set local role authenticated;
  refused := false;
  begin perform public.review_member_ad(ad1, true);
  exception when others then refused := sqlerrm like '%already answered%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 15 an ad can''t be answered twice' || E'\n';
  refused := false;
  begin perform public.review_member_ad(ad2, false, 'no');
  exception when others then refused := sqlerrm like '%3 to 200%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 16 a rejection needs a reason of 3 to 200 characters' || E'\n';
  perform public.review_member_ad(ad2, false, 'The picture shows a phone number.');
  reset role;
  res := res || case when (select status from public.member_ads where id = ad2) = 'rejected'
                      and (select reject_reason from public.member_ads where id = ad2) = 'The picture shows a phone number.'
                      and (select count(*) from public.user_notifications
                            where user_id = f and type = 'promotion_rejected' and title = 'Your ad was not approved'
                              and message like '%Reason: The picture shows a phone number.%') = 1
                then 'PASS' else 'FAIL' end || ' 17 a rejection saves the reason and tells the owner' || E'\n';

  -- ===== 4. Withdrawing =====
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.withdraw_member_ad(ad3);
  exception when others then refused := sqlerrm like '%can''t be withdrawn%'; end;
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 18 nobody else can withdraw my ad' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.withdraw_member_ad(ad3);
  reset role;
  res := res || case when (select status from public.member_ads where id = ad3) = 'canceled' then 'PASS' else 'FAIL' end || ' 19 the owner withdraws a waiting ad' || E'\n';

  -- ===== 5. Paying =====
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.start_ad_checkout(ad1);
  exception when others then refused := sqlerrm like '%not found%'; end;
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 20 nobody else can open the payment page of my ad' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.start_ad_checkout(ad2);
  exception when others then refused := sqlerrm like '%not waiting for payment%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 21 a rejected ad can''t be paid' || E'\n';
  co1 := public.start_ad_checkout(ad1);
  reset role;
  res := res || case when (co1->>'amount')::numeric = 299
                      and (select ad_id from public.online_checkouts where id = (co1->>'id')::uuid) = ad1
                      and (select price_code from public.online_checkouts where id = (co1->>'id')::uuid) = 'ad_7'
                then 'PASS' else 'FAIL' end || ' 22 an approved ad opens a 299 peso payment page for 7 days' || E'\n';

  insert into public.pro_members (user_id, pro_until) values (f, now() + interval '1 day')
  on conflict (user_id) do update set pro_until = excluded.pro_until;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  co2 := public.start_ad_checkout(ad1);
  reset role;
  res := res || case when (co2->>'amount')::numeric = 150 then 'PASS' else 'FAIL' end || ' 23 with Premium the same ad costs 150 pesos' || E'\n';

  slots0 := public.member_ads_slots_left();
  co_id := (co2->>'id')::uuid;
  select test_mode into co_test from public.online_checkouts where id = co_id;
  r := public.finish_online_checkout(co_id, 'py-ad-test-1', 150, co_test);
  res := res || case when (select status from public.member_ads where id = ad1) = 'paid'
                      and (select ends_at - starts_at from public.member_ads where id = ad1) = interval '7 days'
                      and (select starts_at from public.member_ads where id = ad1) > now() - interval '1 minute'
                      and public.member_ads_slots_left() = slots0 - 1
                then 'PASS' else 'FAIL' end || ' 24 a paid ad goes live for exactly 7 days and uses one spot' || E'\n';
  res := res || case when (select count(*) from public.promotions
                            where user_id = f and kind = 'member_ad' and method = 'online' and amount = 150
                              and provider_payment_id = 'py-ad-test-1' and status = 'approved') = 1
                      and (select count(*) from public.user_notifications
                            where user_id = f and title = 'Payment received' and link = '/dashboard/advertise'
                              and message like '%is on the Community Billboard until%') = 1
                then 'PASS' else 'FAIL' end || ' 25 the payment is recorded and the owner is told it is live' || E'\n';
  r2 := public.finish_online_checkout(co_id, 'py-ad-test-1', 150, co_test);
  res := res || case when (r2->>'already')::boolean
                      and (select count(*) from public.promotions where provider_payment_id = 'py-ad-test-1') = 1
                then 'PASS' else 'FAIL' end || ' 26 the same payment news again changes nothing' || E'\n';

  -- ===== 6. Who sees what =====
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into k from public.member_ads where id = ad1;
  reset role;
  res := res || case when k = 1 then 'PASS' else 'FAIL' end || ' 27 anyone signed in sees a running ad meant for everyone' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ad4 := public.request_member_ad('Another idea', null, null, 'all', 'ad_3', null, null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into k from public.member_ads where id = ad4;
  reset role;
  res := res || case when k = 0 then 'PASS' else 'FAIL' end || ' 28 a waiting ad is hidden from other members' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', na, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into k from public.member_ads where id = ad4;
  reset role;
  res := res || case when k = 1 then 'PASS' else 'FAIL' end || ' 29 an admin sees a waiting ad' || E'\n';

  -- A client-only ad: approved, paid (Premium price 75), then seen by a client but not by a freelancer.
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ad5 := public.request_member_ad('For clients only', null, null, 'client', 'ad_3', null, null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', na, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.review_member_ad(ad5, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  co5 := public.start_ad_checkout(ad5);
  reset role;
  select test_mode into co_test from public.online_checkouts where id = (co5->>'id')::uuid;
  perform public.finish_online_checkout((co5->>'id')::uuid, 'py-ad-test-5', (co5->>'amount')::numeric, co_test);
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into k from public.member_ads where id = ad5;
  reset role;
  res := res || case when k = 0 then 'PASS' else 'FAIL' end || ' 30 an ad for clients is hidden from a freelancer' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into k from public.member_ads where id = ad5;
  reset role;
  res := res || case when k = 1 and (co5->>'amount')::numeric = 75 then 'PASS' else 'FAIL' end || ' 31 ...and shown to a client (3 days with Premium: 75 pesos)' || E'\n';

  -- Withdrawn while the payment page was open: the money is noted and a refund is asked for.
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ad6 := public.request_member_ad('Changed my mind', null, null, 'all', 'ad_3', null, null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', na, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.review_member_ad(ad6, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  co6 := public.start_ad_checkout(ad6);
  perform public.withdraw_member_ad(ad6);
  reset role;
  select test_mode into co_test from public.online_checkouts where id = (co6->>'id')::uuid;
  perform public.finish_online_checkout((co6->>'id')::uuid, 'py-ad-test-6', (co6->>'amount')::numeric, co_test);
  res := res || case when (select status from public.member_ads where id = ad6) = 'canceled'
                      and (select count(*) from public.user_notifications
                            where user_id = f and message like '%withdrawn before the payment finished%') = 1
                then 'PASS' else 'FAIL' end || ' 32 an ad withdrawn while the page was open stays withdrawn and a refund is asked for' || E'\n';

  -- ===== 7. Taking an ad down =====
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.take_down_member_ad(ad1, 'Misleading claims.');
  exception when others then refused := sqlerrm like '%Only an admin%'; end;
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 33 a member can''t take an ad down' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', na, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.take_down_member_ad(ad4, 'Misleading claims.');
  exception when others then refused := sqlerrm like '%running%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 34 only a running ad can be taken down' || E'\n';
  slots1 := public.member_ads_slots_left();
  perform public.take_down_member_ad(ad1, 'Misleading claims in the message.');
  reset role;
  res := res || case when (select status from public.member_ads where id = ad1) = 'removed'
                      and (select reject_reason from public.member_ads where id = ad1) = 'Misleading claims in the message.'
                      and public.member_ads_slots_left() = slots1 + 1
                      and (select count(*) from public.user_notifications
                            where user_id = f and title = 'Your ad was taken down' and message like '%Reason: Misleading claims in the message.%') = 1
                then 'PASS' else 'FAIL' end || ' 35 taking an ad down frees its spot and tells the owner why' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into k from public.member_ads where id = ad1;
  reset role;
  res := res || case when k = 0 then 'PASS' else 'FAIL' end || ' 36 a taken-down ad is hidden from other members' || E'\n';

  -- ===== 8. The 5 spots =====
  insert into public.member_ads (owner_id, title, price_code, days, status, starts_at, ends_at)
  select f, 'Filler ' || g, 'ad_3', 3, 'paid', now() - interval '1 hour', now() + interval '1 day'
    from generate_series(1, 5) g;
  res := res || case when public.member_ads_slots_left() = 0 then 'PASS' else 'FAIL' end || ' 37 with 5 or more ads running no spot is free' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', na, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.review_member_ad(ad4, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.start_ad_checkout(ad4);
  exception when others then refused := sqlerrm like '%spots are taken%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 38 an approved ad can''t open a payment page while all spots are taken' || E'\n';

  -- ===== 9. The browser can't write, and the Earnings know the new kind =====
  refused := false;
  begin update public.member_ads set status = 'approved' where id = ad4;
  exception when insufficient_privilege then refused := true; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 39 a member can''t change an ad directly (only through the functions)' || E'\n';
  refused := false;
  begin insert into public.member_ads (owner_id, title, price_code, days) values (f, 'Direct insert', 'ad_3', 3);
  exception when insufficient_privilege then refused := true; end;
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 40 a member can''t add an ad directly either' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', na, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_promo_earnings();
  reset role;
  res := res || case when (r->'by_kind'->'member_ad') is not null
                      and (r->'by_kind'->'member_ad'->>'count')::integer = 0
                      and (r->'running'->>'member_ads')::integer >= 5
                then 'PASS' else 'FAIL' end || ' 41 the Earnings list Community ads (test money left out) and count the ads running now' || E'\n';

  raise exception E'COMMUNITY BILLBOARD TEST (rolled back):\n%', res;
end
$t$;
