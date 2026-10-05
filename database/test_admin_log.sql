-- Test for supabase_admin_log_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts, acts as each one, and ends with an error that carries the
-- PASS/FAIL list and the log it wrote; that error rolls everything back, so
-- nothing is left behind.
--
-- The block marked "needs the SQL Editor" uses DELETE statements. Everything
-- else was also run through the Supabase connector (2026-10-05: all passed);
-- the connector will not run DELETE statements without someone to confirm.
do $t$
declare
  res text := '';
  sa uuid := gen_random_uuid();   -- a super admin, "Elena Cruz"
  a1 uuid := gen_random_uuid();   -- a new admin, "Paolo Lim", still on the default password
  f uuid := gen_random_uuid();    -- a freelancer, "Keanne Reyes"
  c uuid := gen_random_uuid();    -- a client, "Mark Santos"
  svc uuid; svc2 uuid; job uuid; job2 uuid; r1 uuid; r2 uuid; ver uuid;
  slide uuid; slide2 uuid; doc uuid; doc2 uuid; app uuid;
  n int;
  flag boolean;
  got text;
  want text;
  t0 timestamptz := clock_timestamp();
  log_before int := (select count(*) from public.admin_log);
begin
  -- ===== Made-up rows, added with nobody signed in =====
  insert into auth.users (id, email, aud, role, created_at, encrypted_password)
  select x, 'log-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now(),
         extensions.crypt('Admin123', extensions.gen_salt('bf', 4))
  from unnest(array[sa, a1, f, c]) as x;
  insert into public.admins (id, full_name, username, role) values (sa, 'Elena Cruz', 'elena_logtest', 'super_admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (f, 'Keanne Reyes', 'keanne_logtest', 'male', 'freelancer', false),
    (c, 'Mark Santos', 'mark_logtest', 'male', 'client', false);
  insert into public.services (freelancer_id, title, category, description) values (f, 'Logo design', 'Design', 'A test service.') returning id into svc;
  insert into public.services (freelancer_id, title, category, description) values (f, 'Poster design', 'Design', 'Another test service.') returning id into svc2;
  insert into public.job_posts (client_id, title, category, description) values (c, 'Need a logo', 'Design', 'A test job.') returning id into job;
  insert into public.job_posts (client_id, title, category, description) values (c, 'Need a poster', 'Design', 'Another test job.') returning id into job2;
  insert into public.reports (reporter_id, target_type, target_id, reason) values (c, 'user', f, 'spam') returning id into r1;
  insert into public.reports (reporter_id, target_type, target_id, reason) values (c, 'service', svc, 'scam') returning id into r2;
  insert into public.identity_verifications (user_id, id_type, id_photo_path, selfie_path, face_match, face_distance, selfie_left_path, selfie_right_path, liveness_passed)
    values (f, 'passport', 'x/id.jpg', 'x/selfie.jpg', true, 0.3, 'x/left.jpg', 'x/right.jpg', true) returning id into ver;
  insert into public.media_slides (freelancer_id, service_id, position, media_type, file_path, status) values (f, svc, 1, 'image', 'x/slide.jpg', 'flagged') returning id into slide;
  insert into public.media_slides (freelancer_id, service_id, position, media_type, file_path, status) values (f, svc, 2, 'image', 'x/slide2.jpg', 'flagged') returning id into slide2;
  -- A flagged slide on the service that gets deleted below: it must not get a line of its own.
  insert into public.media_slides (freelancer_id, service_id, position, media_type, file_path, status) values (f, svc2, 1, 'image', 'x/slide3.jpg', 'flagged');
  insert into public.portfolio_items (freelancer_id, title, kind, body, status) values (f, 'My CV', 'document', 'Some text.', 'flagged') returning id into doc;
  insert into public.portfolio_items (freelancer_id, title, kind, body, status) values (f, 'My other CV', 'document', 'Some text.', 'flagged') returning id into doc2;

  select count(*) into n from public.admin_log;
  res := res || E'\n' || case when n = log_before then 'PASS  ' else 'FAIL  ' end || '1. rows added with no admin signed in write nothing to the log';

  set local role authenticated;

  -- ===== The super admin adds an admin, who is still on the default password =====
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin
    insert into public.admins (id, full_name, username, role) values (gen_random_uuid(), 'No Flag', 'noflag_logtest', 'admin');
    res := res || E'\nFAIL  2. an admin was added without the "must change password" flag';
  exception when others then res := res || E'\nPASS  2. an admin cannot be added without the "must change password" flag';
  end;
  insert into public.admins (id, full_name, username, role, must_change_password) values (a1, 'Paolo Lim', 'paolo_logtest', 'admin', true);
  perform public.set_admin_role(a1, 'super_admin');
  perform public.set_admin_role(a1, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  res := res || E'\n' || case when not public.is_admin() and not public.is_super_admin() then 'PASS  ' else 'FAIL  ' end || '2a. an admin on the default password has no admin rights yet';
  select count(*) into n from public.admin_log;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '2b. ...and cannot read the log';
  begin
    insert into public.user_suspensions (user_id, reason, violation, ends_at, blocks_posting, blocks_messaging, suspended_by, created_at)
      values (c, 'x', 'spam', now() + interval '3 days', true, false, a1, now());
    res := res || E'\nFAIL  2c. an admin on the default password suspended someone';
  exception when others then res := res || E'\nPASS  2c. ...and cannot suspend anyone';
  end;

  -- The password is saved again, but it is still the default: the flag stays.
  reset role;
  update auth.users set encrypted_password = extensions.crypt('Admin123', extensions.gen_salt('bf', 4)) where id = a1;
  select must_change_password into flag from public.admins where id = a1;
  res := res || E'\n' || case when flag then 'PASS  ' else 'FAIL  ' end || '2d. saving the default password again does not count';
  -- A real new password switches the flag off.
  update auth.users set encrypted_password = extensions.crypt('MyOwnPass9', extensions.gen_salt('bf', 4)) where id = a1;
  select must_change_password into flag from public.admins where id = a1;
  res := res || E'\n' || case when not flag then 'PASS  ' else 'FAIL  ' end || '2e. choosing their own password switches the flag off';
  -- A normal user changing their password is not affected.
  update auth.users set encrypted_password = extensions.crypt('Another1', extensions.gen_salt('bf', 4)) where id = c;
  set local role authenticated;
  res := res || E'\n' || case when public.is_admin() and not public.is_super_admin() then 'PASS  ' else 'FAIL  ' end || '2f. after that they are a regular admin';
  update public.reports set status = 'resolved', reviewed_by = a1, reviewed_at = now() where id = r1;

  -- ===== The super admin does one of everything =====
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  insert into public.user_suspensions (user_id, reason, violation, ends_at, blocks_posting, blocks_messaging, suspended_by, created_at)
    values (f, 'Rude messages.', 'harassment', now() + interval '14 days', false, true, sa, now());
  -- The Users page saves a new penalty over the old row (an upsert).
  insert into public.user_suspensions (user_id, reason, violation, ends_at, blocks_posting, blocks_messaging, suspended_by, created_at)
    values (f, 'Took the money and vanished.', 'scam', null, true, true, sa, now())
    on conflict (user_id) do update set reason = excluded.reason, violation = excluded.violation, ends_at = excluded.ends_at,
      blocks_posting = excluded.blocks_posting, blocks_messaging = excluded.blocks_messaging,
      suspended_by = excluded.suspended_by, created_at = excluded.created_at;

  -- The banned user appeals (added as them), then the super admin accepts it.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  insert into public.appeals (user_id, suspension_started_at, violation, penalty_reason, message)
    select f, s.created_at, s.violation, s.reason, 'Please review my case again.' from public.user_suspensions s where s.user_id = f
    returning id into app;
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.appeals set status = 'accepted', reviewed_by = sa, reviewed_at = now() where id = app;

  update public.reports set status = 'dismissed', reviewed_by = sa, reviewed_at = now() where id = r2;
  update public.identity_verifications set status = 'approved', reviewed_by = sa, reviewed_at = now() where id = ver;
  insert into public.announcements (title, message, audience, created_by) values ('Maintenance tonight', 'The site will be down for an hour.', 'freelancer', sa);
  update public.media_slides set status = 'active' where id = slide;
  update public.portfolio_items set status = 'active' where id = doc;
  insert into public.user_suspensions (user_id, reason, violation, ends_at, blocks_posting, blocks_messaging, suspended_by, created_at)
    values (f, 'Spam again.', 'spam', now() + interval '1 day', true, false, sa, now());

  -- ===== Nobody can write to the log by hand =====
  begin perform public.write_admin_log('ban', 'made this line up.'); res := res || E'\nFAIL  3a. an admin called the log writer directly';
  exception when others then res := res || E'\nPASS  3a. an admin cannot call the log writer directly'; end;
  begin insert into public.admin_log (admin_id, admin_name, action, message) values (sa, 'Elena Cruz', 'ban', 'made this line up.'); res := res || E'\nFAIL  3b. an admin added a log line by hand';
  exception when others then res := res || E'\nPASS  3b. an admin cannot add a log line by hand'; end;
  begin update public.admin_log set message = 'edited' where admin_id = sa; res := res || E'\nFAIL  3c. an admin edited the log';
  exception when others then res := res || E'\nPASS  3c. an admin cannot edit the log'; end;
  select count(*) into n from public.admin_log where created_at >= t0;
  res := res || E'\n' || case when n = 14 then 'PASS  ' else 'FAIL  ' end || '3d. an admin can read the log (' || n || ' lines so far, 14 expected)';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.admin_log;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3e. a normal user cannot read the log';
  begin insert into public.admin_log (admin_name, action, message) values ('Mark Santos', 'ban', 'made this line up.'); res := res || E'\nFAIL  3f. a normal user added a log line';
  exception when others then res := res || E'\nPASS  3f. a normal user cannot add a log line'; end;

  -- ===== Deleting things directly (this block needs the SQL Editor) =====
  -- A normal user deleting their own job post is not an admin action.
  delete from public.job_posts where id = job2;
  reset role;
  select count(*) into n from public.admin_log where created_at >= t0;
  res := res || E'\n' || case when n = 14 then 'PASS  ' else 'FAIL  ' end || '3g. a user deleting their own job post writes nothing to the log';
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin delete from public.admin_log where admin_id = sa; res := res || E'\nFAIL  3h. an admin deleted log lines';
  exception when others then res := res || E'\nPASS  3h. an admin cannot delete log lines'; end;
  delete from public.media_slides where id = slide2;
  delete from public.portfolio_items where id = doc2;
  delete from public.services where id = svc2;
  delete from public.job_posts where id = job;
  delete from public.announcements where created_by = sa;
  insert into public.user_suspensions (user_id, reason, violation, ends_at, blocks_posting, blocks_messaging, suspended_by, created_at)
    values (c, 'Spam.', 'spam', now() + interval '3 days', true, false, sa, now());
  delete from public.user_suspensions where user_id = c;
  -- ===== End of the block that needs the SQL Editor =====

  -- ===== Removing the admin and deleting the user (through the existing functions) =====
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.remove_admin(a1);
  perform public.delete_user(f);

  reset role;
  select count(*) into n from public.admin_log where admin_name = 'Paolo Lim' and admin_id is null and created_at >= t0;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4a. a removed admin''s line stays in the log, still under their name';

  select string_agg(message, E'\n' order by created_at) into got from public.admin_log where created_at >= t0;
  want := concat_ws(E'\n',
    'Elena Cruz added Paolo Lim as an admin.',
    'Elena Cruz promoted Paolo Lim to super admin.',
    'Elena Cruz demoted Paolo Lim to a regular admin.',
    'Paolo Lim resolved a report about Keanne Reyes.',
    'Elena Cruz suspended Keanne Reyes for 14 days (Harassment).',
    'Elena Cruz banned Keanne Reyes permanently (Scam / Fraud).',
    'Elena Cruz accepted Keanne Reyes''s appeal.',
    'Elena Cruz lifted the ban on Keanne Reyes.',
    'Elena Cruz dismissed a report about the service "Logo design" by Keanne Reyes.',
    'Elena Cruz approved Keanne Reyes''s ID verification.',
    'Elena Cruz posted the announcement "Maintenance tonight" to freelancers.',
    'Elena Cruz approved a flagged photo by Keanne Reyes.',
    'Elena Cruz approved a flagged document by Keanne Reyes.',
    'Elena Cruz suspended Keanne Reyes for 1 day (Spam).',
    -- These seven come from the block that needs the SQL Editor.
    'Elena Cruz removed a flagged photo by Keanne Reyes.',
    'Elena Cruz removed a flagged document by Keanne Reyes.',
    'Elena Cruz deleted the service "Poster design" by Keanne Reyes.',
    'Elena Cruz deleted the job post "Need a logo" by Mark Santos.',
    'Elena Cruz deleted the announcement "Maintenance tonight".',
    'Elena Cruz suspended Mark Santos for 3 days (Spam).',
    'Elena Cruz ended Mark Santos''s suspension.',
    'Elena Cruz removed Paolo Lim as an admin.',
    'Elena Cruz permanently deleted Keanne Reyes''s account.');
  res := res || E'\n' || case when got = want then 'PASS  ' else 'FAIL  ' end || '4b. the log holds exactly the 23 expected sentences, in order (deleting a service or an account adds one line, not one per thing that went with it)';

  raise exception E'ADMIN LOG TESTS (rolled back)%\n\nThe log as written:\n%', res, got;
end
$t$;
