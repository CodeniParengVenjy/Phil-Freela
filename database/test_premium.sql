-- Test for supabase_premium_schema.sql and supabase_premium_gradient_schema.sql
-- (checks 26 and 27 need the second). Send the schema files and this block
-- together in ONE call to try it before applying (the error at the end rolls
-- the schema back too), or run this alone in the Supabase SQL Editor after the
-- schema file. It BORROWS real accounts (no user numbers are used): a verified
-- freelancer with an offer, a verified client with an open job post, another
-- person, a chat, and a super admin; it gives Premium for the block only. The
-- e-mail triggers are switched off for the block. It ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back.
do $t$
declare
  res text := '';
  f uuid; s uuid;          -- a verified freelancer and one of their offers
  c uuid; j uuid;          -- a verified client and their open job post
  n uuid;                  -- another person
  conv uuid; ua uuid;      -- a chat and its first person
  sa uuid; na uuid;        -- a super admin, and an admin who isn't one
  bb uuid; bco json;
  r json; r2 json;
  co_pro json; co_f json; co_j json;
  before_e json; after_e json;
  p_feature numeric; p_feature_pro numeric; p_pro numeric;
  refused boolean; msg text; k int;
begin
  alter table public.user_notifications disable trigger email_offline_on_notification;
  alter table public.messages disable trigger email_offline_on_message;

  select j1.id, j1.client_id into j, c from public.job_posts j1 join public.profiles p on p.id = j1.client_id
   where p.account_type = 'client' and public.is_verified(p.id) and not public.is_posting_blocked(p.id) and not public.is_pro(p.id)
     and public.job_state(j1.id) = 'open'
   order by j1.id limit 1;
  -- The owner of an offer may be in the client role right now (people switch):
  -- borrow one and make them a freelancer for this block only.
  select s1.id, s1.freelancer_id into s, f from public.services s1 join public.profiles p on p.id = s1.freelancer_id
   where public.is_verified(p.id) and not public.is_posting_blocked(p.id) and not public.is_pro(p.id)
     and p.id is distinct from c and not exists (select 1 from public.admins a where a.id = p.id)
   order by s1.id limit 1;
  update public.profiles set account_type = 'freelancer' where id = f;
  select p.id into n from public.profiles p where p.id not in (f, c) and not public.is_pro(p.id)
     and not exists (select 1 from public.admins a where a.id = p.id) order by p.id limit 1;
  select x.id, x.user_a into conv, ua from public.conversations x
   where x.user_a not in (f, c) and not public.is_pro(x.user_a) order by x.id limit 1;
  select a.id into sa from public.admins a where a.role = 'super_admin' and not a.must_change_password order by a.id limit 1;
  select a.id into na from public.admins a where a.role <> 'super_admin' and not a.must_change_password order by a.id limit 1;
  if f is null or c is null or n is null or conv is null or sa is null then
    raise exception 'Needs a verified freelancer with an offer, a verified client with an open job post, another person, a chat and a super admin.';
  end if;
  select price, pro_price into p_feature, p_feature_pro from public.promo_prices where code = 'feature_3';
  select price into p_pro from public.promo_prices where code = 'pro_30';

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  before_e := public.admin_promo_earnings();
  reset role;

  -- ===== 1. Premium for clients too, paid online =====
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    co_pro := public.start_online_checkout('pro_30');
  exception when others then
    res := res || 'note 1: ' || sqlerrm || E'\n';
  end;
  -- A client's own job post can be featured online (full price without Premium).
  co_j := public.start_feature_checkout('feature_7', null, j);
  refused := false;
  begin perform public.use_free_feature(null, j); exception when others then refused := sqlerrm like '%Premium perk%'; end;
  reset role;
  res := res || case when co_pro is not null then 'PASS' else 'FAIL' end || ' 1 a client can open a Premium payment page' || E'\n';
  res := res || case when (co_j ->> 'amount')::numeric = (select price from public.promo_prices where code = 'feature_7') then 'PASS' else 'FAIL' end
    || ' 2 a client can open a Featured payment page for their own job post, at full price' || E'\n';
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 3 without Premium the free Featured post is refused' || E'\n';

  r := public.finish_online_checkout((co_pro ->> 'id')::uuid, 'test-pay-1', p_pro, true);
  res := res || case when public.is_pro(c) and (r ->> 'kind') = 'pro' then 'PASS' else 'FAIL' end || ' 4 the paid page gives the client Premium' || E'\n';
  select message into msg from public.user_notifications where user_id = c order by created_at desc limit 1;
  res := res || case when msg like '%Premium member until%' then 'PASS' else 'FAIL' end || ' 5 the notification says Premium (' || coalesce(msg, '-') || ')' || E'\n';
  r := public.finish_online_checkout((co_pro ->> 'id')::uuid, 'test-pay-1', p_pro, true);
  res := res || case when (r ->> 'already')::boolean then 'PASS' else 'FAIL' end || ' 6 the same payment counts once' || E'\n';

  r := public.finish_online_checkout((co_j ->> 'id')::uuid, 'test-pay-2', (co_j ->> 'amount')::numeric, true);
  res := res || case when exists (select 1 from public.featured_posts where job_id = j and featured_until > now() + interval '6 days')
                     and exists (select 1 from public.promotions where job_id = j and method = 'online' and kind = 'feature_job')
    then 'PASS' else 'FAIL' end || ' 7 a paid Featured page features the job post for 7 days' || E'\n';

  -- ===== 2. Featured price for a freelancer, before and after Premium =====
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  co_f := public.start_feature_checkout('feature_3', s, null);
  refused := false;
  begin perform public.start_feature_checkout('feature_3', null, j); exception when others then refused := sqlerrm like '%your own job posts%'; end;
  reset role;
  res := res || case when (co_f ->> 'amount')::numeric = p_feature then 'PASS' else 'FAIL' end || ' 8 without Premium a Featured offer is full price' || E'\n';
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 9 nobody can feature someone else''s post' || E'\n';
  refused := false;
  begin perform public.finish_online_checkout((co_f ->> 'id')::uuid, 'test-pay-3', p_feature + 1, true); exception when others then refused := sqlerrm like '%does not match%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 10 a wrong amount is refused' || E'\n';

  insert into public.pro_members (user_id, pro_until) values (f, now() + interval '10 days')
  on conflict (user_id) do update set pro_until = excluded.pro_until;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  co_f := public.start_feature_checkout('feature_3', s, null);
  res := res || case when (co_f ->> 'amount')::numeric = p_feature_pro then 'PASS' else 'FAIL' end || ' 11 with Premium a Featured offer is half price' || E'\n';

  -- ===== 3. The free Featured post =====
  r := public.my_free_feature();
  res := res || case when (r ->> 'available')::boolean then 'PASS' else 'FAIL' end || ' 12 Premium: the free Featured post is available' || E'\n';
  r := public.use_free_feature(s, null);
  res := res || case when (r ->> 'until') is not null then 'PASS' else 'FAIL' end || ' 13 using it works' || E'\n';
  refused := false;
  begin perform public.use_free_feature(s, null); exception when others then refused := sqlerrm like '%already used%'; end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 14 a second one within 30 days is refused' || E'\n';
  r := public.my_free_feature();
  res := res || case when not (r ->> 'available')::boolean and (r ->> 'next_at') is not null then 'PASS' else 'FAIL' end || ' 15 it says when the next one comes' || E'\n';
  reset role;
  res := res || case when exists (select 1 from public.promotions where user_id = f and method = 'free' and amount = 0 and status = 'approved')
                     and exists (select 1 from public.featured_posts where service_id = s and featured_until > now() + interval '2 days')
    then 'PASS' else 'FAIL' end || ' 16 it is a ₱0 record and the offer is Featured' || E'\n';

  -- ===== 4. Views =====
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.record_view('service', s);
  perform public.record_view('service', s);
  perform public.record_view('profile', f);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.record_view('service', s);
  r := public.my_view_counts();
  refused := false;
  begin perform 1 from public.page_views; exception when insufficient_privilege then refused := true; end;
  reset role;
  select (x ->> 'views')::int into k from json_array_elements(r -> 'services') x where (x ->> 'id')::uuid = s;
  res := res || case when k = 1 then 'PASS' else 'FAIL' end || ' 17 an offer''s views: one person, the owner''s own opens left out (' || coalesce(k::text, '-') || ')' || E'\n';
  res := res || case when (r ->> 'profile')::int = 1 then 'PASS' else 'FAIL' end || ' 18 profile views in the last 30 days' || E'\n';
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 19 nobody reads the views table directly' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.my_view_counts();
  reset role;
  res := res || case when not (r ->> 'premium')::boolean and (r -> 'profile') is null then 'PASS' else 'FAIL' end || ' 20 without Premium no counts are given' || E'\n';

  -- ===== 5. Chat documents =====
  refused := false;
  begin
    insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type, attachment_name, attachment_size)
    values (conv, ua, conv::text || '/' || ua::text || '-big.pdf', 'file', 'big.pdf', 20 * 1024 * 1024);
  exception when others then refused := sqlerrm like '%Premium perk%';
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 21 without Premium a 20 MB document is refused' || E'\n';
  insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type, attachment_name, attachment_size)
  values (conv, ua, conv::text || '/' || ua::text || '-small.pdf', 'file', 'small.pdf', 5 * 1024 * 1024);
  insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type, attachment_size)
  values (conv, ua, conv::text || '/' || ua::text || '-1700000000.mp4', 'video', 20 * 1024 * 1024);
  res := res || 'PASS 22 a 5 MB document and a 20 MB video still go through without Premium' || E'\n';
  insert into public.pro_members (user_id, pro_until) values (ua, now() + interval '1 day')
  on conflict (user_id) do update set pro_until = excluded.pro_until;
  insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type, attachment_name, attachment_size)
  values (conv, ua, conv::text || '/' || ua::text || '-big2.pdf', 'file', 'big2.pdf', 40 * 1024 * 1024);
  res := res || 'PASS 23 with Premium a 40 MB document goes through' || E'\n';
  refused := false;
  begin
    insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type, attachment_name, attachment_size)
    values (conv, ua, conv::text || '/' || ua::text || '-huge.pdf', 'file', 'huge.pdf', 60 * 1024 * 1024);
  exception when check_violation then refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 24 over 50 MB is refused even with Premium' || E'\n';
  res := res || case when (select file_size_limit from storage.buckets where id = 'chat-files') = 52428800 then 'PASS' else 'FAIL' end || ' 25 the chat-files storage allows 50 MB' || E'\n';

  -- ===== 6. The two-color look =====
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin
    update public.profiles set accent_color = '#112233', accent_color_2 = '#445566' where id = n;
  exception when others then refused := sqlerrm like '%Premium perk%';
  end;
  update public.profiles set accent_color = '#112233', accent_color_2 = null where id = n;
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 26 without Premium a second color is refused (one color still saves)' || E'\n';
  insert into public.pro_members (user_id, pro_until) values (n, now() + interval '1 day')
  on conflict (user_id) do update set pro_until = excluded.pro_until;
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set accent_color_2 = '#445566' where id = n;
  reset role;
  update public.pro_members set pro_until = now() - interval '1 minute' where user_id = n;
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set accent_color = '#223344' where id = n;
  refused := false;
  begin update public.profiles set accent_color_2 = '#556677' where id = n; exception when others then refused := sqlerrm like '%Premium perk%'; end;
  reset role;
  res := res || case when (select accent_color_2 from public.profiles where id = n) = '#445566' and refused then 'PASS' else 'FAIL' end
    || ' 27 after Premium ends the saved second color stays, other settings save, a new second color is refused' || E'\n';

  -- ===== 7. The watermark's Premium choices =====
  update public.pro_members set pro_until = now() - interval '1 minute' where user_id = f;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  k := 0;
  begin
    insert into public.watermark_settings (freelancer_id, font) values (f, 'serif')
    on conflict (freelancer_id) do update set font = excluded.font;
  exception when others then if sqlerrm like '%Premium perks%' then k := k + 1; end if;
  end;
  begin
    insert into public.watermark_settings (freelancer_id, color) values (f, '#123456')
    on conflict (freelancer_id) do update set color = excluded.color;
  exception when others then if sqlerrm like '%Premium perks%' then k := k + 1; end if;
  end;
  begin
    insert into public.watermark_settings (freelancer_id, size) values (f, 'xlarge')
    on conflict (freelancer_id) do update set size = excluded.size;
  exception when others then if sqlerrm like '%Premium perks%' then k := k + 1; end if;
  end;
  insert into public.watermark_settings (freelancer_id, size, color) values (f, 'large', 'black')
  on conflict (freelancer_id) do update set size = excluded.size, color = excluded.color, font = 'jakarta';
  reset role;
  res := res || case when k = 3 then 'PASS' else 'FAIL' end || ' 28 without Premium another font, a color code and extra sizes are refused (' || k || ' of 3)' || E'\n';
  update public.pro_members set pro_until = now() + interval '1 day' where user_id = f;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.watermark_settings set font = 'script', color = '#123456', size = 'xsmall' where freelancer_id = f;
  reset role;
  res := res || case when (select font = 'script' and color = '#123456' and size = 'xsmall' from public.watermark_settings where freelancer_id = f)
    then 'PASS' else 'FAIL' end || ' 29 with Premium they save' || E'\n';

  -- ===== 8. A sponsored billboard paid through a link =====
  insert into public.dashboard_billboards (title, message, sponsor_name, amount, created_by)
  values ('Test sponsor billboard', 'Hello', 'Test Sponsor', 500, sa) returning id into bb;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.start_billboard_checkout(bb); exception when others then refused := sqlerrm like '%super admin%'; end;
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 30 a normal person can''t make a billboard payment link' || E'\n';
  if na is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', na, 'role', 'authenticated')::text, true);
    set local role authenticated;
    refused := false;
    begin perform public.start_billboard_checkout(bb); exception when others then refused := sqlerrm like '%super admin%'; end;
    reset role;
    res := res || case when refused then 'PASS' else 'FAIL' end || ' 31 an admin who isn''t the super admin can''t either' || E'\n';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  bco := public.start_billboard_checkout(bb);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into k from public.dashboard_billboards where id = bb;
  reset role;
  res := res || case when (bco ->> 'amount')::numeric = 500 and k = 0 then 'PASS' else 'FAIL' end || ' 32 the link is for the billboard''s amount, and it doesn''t show while unpaid' || E'\n';
  refused := false;
  begin perform public.finish_billboard_checkout((bco ->> 'id')::uuid, 'test-bb-1', 499, true); exception when others then refused := sqlerrm like '%does not match%'; end;
  r := public.finish_billboard_checkout((bco ->> 'id')::uuid, 'test-bb-1', 500, true);
  r2 := public.finish_billboard_checkout((bco ->> 'id')::uuid, 'test-bb-1', 500, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into k from public.dashboard_billboards where id = bb;
  reset role;
  res := res || case when refused and k = 1 and (r2 ->> 'already')::boolean then 'PASS' else 'FAIL' end
    || ' 33 a wrong amount is refused; once paid it shows; the same payment counts once' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.start_billboard_checkout(bb); exception when others then refused := sqlerrm like '%already paid%'; end;
  after_e := public.admin_promo_earnings();
  reset role;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' 34 a paid billboard gets no second link' || E'\n';

  -- ===== 9. Earnings leave out ₱0 free posts and test money =====
  res := res || case when (after_e -> 'by_kind')::jsonb = (before_e -> 'by_kind')::jsonb then 'PASS' else 'FAIL' end
    || ' 35 the earnings did not change (free post and test payments left out)' || E'\n';
  res := res || case when (select label from public.promo_prices where code = 'pro_30') = 'Premium for 30 days' then 'PASS' else 'FAIL' end || ' 36 the price list says Premium' || E'\n';

  raise exception E'Test results (everything is rolled back):\n%', res;
end
$t$;
