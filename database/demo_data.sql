-- Demo data for the defense (the lite version in PLAN-demo-data.md).
--
-- Adds 6 made-up people (4 freelancers, 2 clients) with services, job posts,
-- 8 finished projects with ratings, 2 projects still going, 3 bookings and 4
-- chats, so the profile numbers, the ranking and the booking pages have
-- something to show. It only ADDS rows; no real account or post is changed.
--
-- How to run: put a password in demo_password below (every demo account gets
-- it; do not save it in this file), then run the whole file in the Supabase
-- SQL Editor. It checks its own numbers at the end, and if anything is off it
-- stops and adds nothing. It also stops if the demo accounts already exist.
-- To take everything out again: database/demo_data_remove.sql.
--
-- Dates are counted back from the day it runs. The reply times only look at
-- the last 30 days of chats, so run it again (remove, then add) if the
-- defense is more than about 3 weeks away.
do $seed$
declare
  demo_password text := 'PUT-THE-DEMO-PASSWORD-HERE';

  juan uuid := gen_random_uuid();    -- freelancer, video editing, strong record, replies fast
  ana uuid := gen_random_uuid();     -- freelancer, graphic design, mixed record, replies in about 2 hours
  marco uuid := gen_random_uuid();   -- freelancer, photography, verified but brand new
  rico uuid := gen_random_uuid();    -- freelancer, copywriting, NOT verified (his service stays hidden)
  maria uuid := gen_random_uuid();   -- client, coffee shop owner, the main one to sign in as
  sofia uuid := gen_random_uuid();   -- client, boutique owner, slow to reply and rated low

  s_promo uuid := gen_random_uuid();
  s_wedding uuid := gen_random_uuid();
  s_logo uuid := gen_random_uuid();
  s_invite uuid := gen_random_uuid();
  s_photo uuid := gen_random_uuid();
  s_copy uuid := gen_random_uuid();
  b_poster uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid();
  k2 uuid := gen_random_uuid();
  k3 uuid := gen_random_uuid();
  k4 uuid := gen_random_uuid();

  today date := (now() at time zone 'Asia/Manila')::date;
  t1 timestamptz := date_trunc('hour', now()) - interval '6 days';
  t2 timestamptz := now() - interval '3 days 3 hours';
  t3 timestamptz := date_trunc('hour', now()) - interval '9 days';
  t4 timestamptz := date_trunc('hour', now()) - interval '8 days';
  joined timestamptz;
  due date;
  submitted timestamptz;
  pid uuid;
  mins real;
  rec record;
  st record;
  problems text := '';
begin
  if demo_password = 'PUT-THE-DEMO-PASSWORD-HERE' then
    raise exception 'Put a password in demo_password at the top first.';
  end if;
  if exists (select 1 from auth.users where email like 'demo.%@example.com')
     or exists (select 1 from public.profiles where username like 'demo\_%') then
    raise exception 'The demo accounts are already there. Run demo_data_remove.sql first.';
  end if;

  -- ===== The people: a login, its email identity and a profile each =====
  -- The emails end in @example.com, an address that never receives mail, and
  -- "email me when I'm offline" is off, so nobody is ever emailed.
  for rec in
    select * from (values
      (juan, 'juan', 'Juan Dela Cruz', 'male', 'freelancer', 120,
        'Video editor from Quezon City with five years of experience. I make promo videos, wedding highlights and social media reels for small businesses. Fast turnaround and clear communication.',
        array['Video editing', 'Motion graphics', 'Adobe Premiere Pro', 'After Effects', 'Color grading']),
      (ana, 'ana', 'Ana Reyes', 'female', 'freelancer', 105,
        'Graphic designer based in Cebu. I design logos, posters, menus and invitations with a clean, modern look. I work in Adobe Illustrator and Canva.',
        array['Logo design', 'Poster design', 'Adobe Illustrator', 'Canva', 'Branding']),
      (marco, 'marco', 'Marco Bautista', 'male', 'freelancer', 5,
        'Product and food photographer in Davao. New on PhilFreela. I shoot clean, bright photos for online shops and menus.',
        array['Product photography', 'Food photography', 'Photo editing', 'Adobe Lightroom']),
      (rico, 'rico', 'Rico Villanueva', 'male', 'freelancer', 60,
        'Copywriter for websites, product pages and social media captions, in English and Filipino.',
        array['Copywriting', 'Content writing', 'SEO']),
      (maria, 'maria', 'Maria Lopez', 'female', 'client', 125,
        'Owner of a small coffee shop in Marikina. I hire freelancers for our videos, menus and social media.',
        array[]::text[]),
      (sofia, 'sofia', 'Sofia Cruz', 'female', 'client', 90,
        'I run an online boutique that sells clothes and accessories.',
        array[]::text[])
    ) as p(id, short, full_name, gender, account_type, days_ago, description, skills)
  loop
    joined := now() - make_interval(days => rec.days_ago);

    -- The same shape the sign-up page leaves behind, already confirmed.
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', rec.id, 'authenticated', 'authenticated',
      'demo.' || rec.short || '@example.com',
      extensions.crypt(demo_password, extensions.gen_salt('bf', 10)), joined,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('sub', rec.id::text, 'email', 'demo.' || rec.short || '@example.com',
        'username', 'demo_' || rec.short, 'full_name', rec.full_name, 'email_verified', true, 'phone_verified', false),
      joined, joined, '', '', '', '', '', '', '', '');

    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (rec.id::text, rec.id,
      jsonb_build_object('sub', rec.id::text, 'email', 'demo.' || rec.short || '@example.com',
        'username', 'demo_' || rec.short, 'full_name', rec.full_name, 'email_verified', true, 'phone_verified', false),
      'email', joined, joined, joined);

    insert into public.profiles (id, full_name, username, gender, account_type, description, skills, email_when_offline, created_at)
    values (rec.id, rec.full_name, 'demo_' || rec.short, rec.gender::public.gender_type, rec.account_type::public.account_type,
      rec.description, rec.skills, false, joined);
  end loop;

  -- ===== Verified freelancers (Rico is left out on purpose) =====
  -- Marked approved without ID photos; the real check is shown live instead.
  insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, selfie_left_path, selfie_right_path,
    face_match, face_distance, liveness_passed, status, decided_by_ai, reviewed_at, created_at)
  select v.id, 'passport', 'demo/' || v.id || '/id.jpg', 'demo/' || v.id || '/selfie.jpg', 'demo/' || v.id || '/left.jpg', 'demo/' || v.id || '/right.jpg',
    true, 0.32, true, 'approved', true, v.at, v.at
  from (values (juan, now() - interval '118 days'), (ana, now() - interval '103 days'), (marco, now() - interval '4 days')) as v(id, at);

  -- ===== Services =====
  insert into public.services (id, freelancer_id, title, category, description, price, skill, media_type, created_at, updated_at)
  select s.id, s.owner, s.title, s.category, s.description, s.price, s.skill, 'image',
    now() - make_interval(days => s.days_ago), now() - make_interval(days => s.days_ago)
  from (values
    (s_promo, juan, 'Promo video editing for small businesses', 'video-editing', 2500, 'video-editor', 110,
      'I turn your raw clips into a 30 to 60 second promo video with captions, music and your logo. Good for cafe openings, product launches and Facebook or TikTok ads. Two rounds of changes included.'),
    (s_wedding, juan, 'Wedding highlight video (3 to 5 minutes)', 'video-editing', 4000, 'video-editor', 95,
      'Send me your wedding footage and I will edit a 3 to 5 minute highlight video with music and color grading. Delivered in one week.'),
    (s_logo, ana, 'Logo design with three concepts', 'graphic-design', 1500, 'creativity', 100,
      'You get three logo concepts to choose from, then two rounds of changes on your favorite. Final files in PNG, JPG and PDF, ready for print and social media.'),
    (s_invite, ana, 'Wedding invitation and event poster design', 'graphic-design', 800, 'creativity', 80,
      'Custom wedding invitations, birthday invites, menus and event posters. Tell me your theme and colors and I will send a first design in two days.'),
    (s_photo, marco, 'Product photography for online shops', 'photography', 1800, 'creativity', 4,
      'Clean, bright photos of your products on a white or styled background, edited and ready for Shopee, Lazada or your own website. Up to 15 products per session.'),
    (s_copy, rico, 'Website and social media copywriting', 'copywriting', 1000, 'creativity', 50,
      'Clear, friendly copy for your website, product pages and social media captions, in English or Filipino.')
  ) as s(id, owner, title, category, price, skill, days_ago, description);

  -- ===== Job posts =====
  insert into public.job_posts (client_id, title, category, description, budget, skills, created_at, updated_at)
  select j.owner, j.title, j.category, j.description, j.budget, j.skills,
    now() - make_interval(days => j.days_ago), now() - make_interval(days => j.days_ago)
  from (values
    (maria, 'Logo and menu design for a new coffee shop branch', 'graphic-design', 3000, 20, array['Logo design', 'Poster design'],
      'We are opening a second branch and need a refreshed logo and a one-page printed menu in the same style. Please share samples of your past logo or menu work.'),
    (maria, 'Short promo video for our cafe anniversary', 'video-editing', 5000, 12, array['Video editing', 'Motion graphics'],
      'We need a 30 to 45 second video for Facebook and TikTok for our first anniversary. We will send the clips; you edit, add captions and music.'),
    (sofia, 'Product photos for a boutique''s online store', 'photography', 4000, 15, array['Product photography', 'Photo editing'],
      'I need clean photos of about 20 clothing items for my online store, on a white background.')
  ) as j(owner, title, category, budget, days_ago, skills, description);

  -- ===== 8 finished projects, each rated by both sides =====
  -- due_ago: how many days ago it was due. sub_offset: handed in that many
  -- days before (-) or after (+) the due date; after = late.
  for rec in
    select * from (values
      (maria, juan, 'Cafe opening promo video', 93, -1, 5, 'Fast, clean edit. He understood the brief right away.', 5, 'Clear brief and quick feedback.'),
      (maria, juan, 'Menu board animation', 63, -1, 5, null, 5, null),
      (maria, juan, 'Barista training video', 33, -1, 5, 'Our third project together. Always on time.', 5, 'Great client, pays attention to details.'),
      (maria, ana, 'Coffee shop logo', 78, -1, 5, 'Lovely logo, we use it everywhere now.', 5, null),
      (maria, ana, 'Loyalty card design', 45, 2, 4, 'Good design, but it arrived two days late.', 4, null),
      (sofia, juan, 'Boutique sale teaser video', 53, -1, 5, null, 3, 'Changed the brief several times.'),
      (sofia, juan, 'Fashion lookbook reel', 23, 1, 4, 'Nice reel, one day late.', 3, null),
      (sofia, ana, 'Boutique sale poster', 40, 0, 3, 'It was okay.', 2, 'Slow to reply and asked for many extra changes.')
    ) as p(client, freelancer, title, due_ago, sub_offset, freelancer_stars, freelancer_feedback, client_stars, client_feedback)
  loop
    due := today - rec.due_ago;
    submitted := ((due + rec.sub_offset)::timestamp + time '15:00') at time zone 'Asia/Manila';

    insert into public.projects (client_id, freelancer_id, title, status, started_at, due_date,
      submission_link, submission_message, submitted_at, completed_at)
    values (rec.client, rec.freelancer, rec.title, 'done', submitted - interval '6 days', due,
      'https://example.com/demo-work', 'Here is the finished work. Thank you!', submitted, submitted + interval '1 day')
    returning id into pid;

    insert into public.project_ratings (project_id, rater_id, ratee_id, stars, feedback, created_at) values
      (pid, rec.client, rec.freelancer, rec.freelancer_stars, rec.freelancer_feedback, submitted + interval '1 day 1 hour'),
      (pid, rec.freelancer, rec.client, rec.client_stars, rec.client_feedback, submitted + interval '1 day 3 hours');
  end loop;

  -- Each rating made a "You got a new rating" notification dated today; give
  -- it the rating's own date so the history reads right.
  update public.user_notifications n
  set created_at = r.created_at
  from public.project_ratings r
  where n.type = 'project_rated'
    and n.user_id = r.ratee_id
    and n.link = '/dashboard/project-details/' || r.project_id
    and r.rater_id in (juan, ana, maria, sofia);

  -- ===== 2 projects still going, and 3 bookings =====
  -- Waiting for Maria's review: sign in as her to mark it done and rate.
  insert into public.projects (client_id, freelancer_id, title, note, status, started_at, due_date,
    submission_link, submission_message, submitted_at)
  values (maria, juan, 'Holiday promo video', 'A 30-second promo video for the holidays, for Facebook and TikTok.',
    'submitted', now() - interval '6 days', today + 1,
    'https://example.com/demo-work', 'The first cut is ready. Please review.', now() - interval '20 hours');

  insert into public.bookings (id, client_id, freelancer_id, service_id, title, note, due_date, status, created_at, responded_at) values
    (b_poster, maria, ana, s_invite, 'Christmas menu poster', 'An A3 poster of our Christmas drinks menu, in the same colors as our logo.',
      today + 4, 'accepted', t2, t2 + interval '2 hours'),
    -- Waiting for Marco: sign in as him to accept or decline.
    (gen_random_uuid(), maria, marco, s_photo, 'Photos of our new pastries', 'About 10 pastries, bright photos for our Facebook page.',
      today + 7, 'pending', now() - interval '5 hours', null),
    (gen_random_uuid(), sofia, juan, s_promo, 'Rush video for tomorrow', 'I need a sale video by tomorrow morning.',
      today - 9, 'declined', now() - interval '10 days', now() - interval '10 days' + interval '15 minutes');

  -- The accepted booking became a project, as it does on the website.
  insert into public.projects (client_id, freelancer_id, title, note, status, started_at, due_date, booking_id)
  values (maria, ana, 'Christmas menu poster', 'An A3 poster of our Christmas drinks menu, in the same colors as our logo.',
    'started', t2 + interval '2 hours', today + 4, b_poster);

  -- ===== 4 chats =====
  -- "after" is minutes since the chat started. The gaps are what the reply
  -- time is worked out from: Juan answers in about 15 minutes, Maria in 30,
  -- Ana in about 2 hours, Sofia a day later.
  insert into public.conversations (id, user_a, user_b, created_at, user_a_last_read_at, user_b_last_read_at) values
    (k1, maria, juan, t1, now(), now()),
    (k2, maria, ana, t2, now(), now()),
    (k3, sofia, juan, t3, now(), now()),
    (k4, sofia, ana, t4, now(), now());

  insert into public.messages (conversation_id, sender_id, body, created_at, delivered_at)
  select m.chat, m.sender, m.body, m.started + make_interval(mins => m.after), m.started + make_interval(mins => m.after)
  from (values
    (k1, t1, 0, maria, 'Hi Juan! We need a 30-second holiday promo video for the cafe. Are you free this week?'),
    (k1, t1, 15, juan, 'Hi Maria! Yes, I can start today. Do you have clips, or should I use stock footage?'),
    (k1, t1, 45, maria, 'I will send our own clips tonight. Can it be ready in about a week?'),
    (k1, t1, 60, juan, 'Yes, a week works. I will send a first cut in three days.'),
    (k1, t1, 90, maria, 'Perfect, thank you!'),
    (k1, t1, 105, juan, 'Got the clips. Working on it now.'),
    (k1, t1, 135, maria, 'Great, looking forward to it.'),
    (k2, t2, 0, maria, 'Hi Ana, I booked your poster service for our Christmas menu. Did you get it?'),
    (k2, t2, 120, ana, 'Hi Maria! Yes, I accepted it. Do you want the same colors as your logo?'),
    (k2, t2, 150, maria, 'Yes please, the same brown and cream.'),
    (k2, t2, 270, ana, 'Noted. I will send two layouts to choose from.'),
    (k2, t2, 300, maria, 'Thank you, Ana!'),
    (k3, t3, 0, sofia, 'Juan, I need the lookbook reel changed again. Can you redo the intro?'),
    (k3, t3, 15, juan, 'Hi Sofia. I can, but this is the third change. Which part exactly?'),
    (k3, t3, 1455, sofia, 'The first five seconds. Make it faster.'),
    (k3, t3, 1470, juan, 'Okay, I will send it tonight.'),
    (k3, t3, 2910, sofia, 'Fine.'),
    (k3, t3, 2920, juan, 'Sent. Please check the link on the project page.'),
    (k4, t4, 0, sofia, 'Ana, the sale poster looks plain. Can you add more?'),
    (k4, t4, 125, ana, 'Hi Sofia, sure. Do you have a sample of what you like?'),
    (k4, t4, 1625, sofia, 'No sample. Just make it pop.'),
    (k4, t4, 1755, ana, 'Okay, I will try a brighter version.'),
    (k4, t4, 3155, sofia, 'That one is okay.')
  ) as m(chat, started, after, sender, body)
  order by m.started + make_interval(mins => m.after);

  -- ===== Check the numbers the profile pages will show =====
  for rec in
    select * from (values
      ('demo_juan', juan, 'freelancer', 5, 4, 4.8, 2),
      ('demo_ana', ana, 'freelancer', 3, 2, 4.0, 2),
      ('demo_marco', marco, 'freelancer', 0, 0, null, 1),
      ('demo_rico', rico, 'freelancer', 0, 0, null, 1),
      ('demo_maria', maria, 'client', 5, null, 4.8, 2),
      ('demo_sofia', sofia, 'client', 3, null, 2.7, 1)
    ) as e(username, id, as_role, completed, on_time, stars, listings)
  loop
    select * into st from public.profile_stats(rec.id, rec.as_role);
    if st.completed_count <> rec.completed
       or st.on_time_count is distinct from rec.on_time
       or st.avg_stars is distinct from rec.stars
       or st.listing_count <> rec.listings then
      problems := problems || format(E'\n%s: got %s done, %s on time, %s stars, %s listings; expected %s, %s, %s, %s.',
        rec.username, st.completed_count, st.on_time_count, st.avg_stars, st.listing_count,
        rec.completed, rec.on_time, rec.stars, rec.listings);
    end if;
  end loop;

  for rec in
    select * from (values
      ('demo_juan', juan, 14, 16), ('demo_maria', maria, 29, 31), ('demo_ana', ana, 115, 135), ('demo_sofia', sofia, 1400, 1500)
    ) as e(username, id, low, high)
  loop
    mins := public.typical_reply_minutes(rec.id);
    if mins is null or mins < rec.low or mins > rec.high then
      problems := problems || format(E'\n%s: usually replies in %s minutes; expected %s to %s.', rec.username, mins, rec.low, rec.high);
    end if;
  end loop;
  if public.typical_reply_minutes(marco) is not null or public.typical_reply_minutes(rico) is not null then
    problems := problems || E'\ndemo_marco and demo_rico should have no reply time yet.';
  end if;
  if not public.is_verified(juan) or not public.is_verified(ana) or not public.is_verified(marco) or public.is_verified(rico) then
    problems := problems || E'\nJuan, Ana and Marco should be verified, and Rico should not.';
  end if;

  if problems <> '' then
    raise exception 'The demo data does not add up, so nothing was added:%', problems;
  end if;
end
$seed$;
