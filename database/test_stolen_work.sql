-- Test for supabase_stolen_work_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts, acts as each one, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  sa uuid := gen_random_uuid();    -- a super admin, "Sam Super"
  a1 uuid := gen_random_uuid();    -- a regular admin, "Ana Admin"
  own uuid := gen_random_uuid();   -- the real owner, "Juan Cruz"
  cop uuid := gen_random_uuid();   -- the copier, "Maria Santos"
  cl uuid := gen_random_uuid();    -- a client, "Mark Lim"
  cp uuid; cp2 uuid; op uuid; op2 uuid; svc uuid;       -- projects and a service
  s_old uuid; s_new uuid; s_other uuid; s_code uuid; s_gone uuid; s_doc uuid; s_cdoc uuid;  -- slides
  d_old uuid; d_new uuid; d_old2 uuid; d_new2 uuid; d_flag uuid;  -- older writing items
  r1 uuid; r2 uuid;
  n int; st text; who uuid; linked uuid; msg text; path text; pages int;
begin
  -- ===== Made-up rows, added with nobody signed in =====
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'stolen-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[sa, a1, own, cop, cl]) as x;
  insert into public.admins (id, full_name, username, role) values
    (sa, 'Sam Super', 'sam_stolentest', 'super_admin'),
    (a1, 'Ana Admin', 'ana_stolentest', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (own, 'Juan Cruz', 'juan_stolentest', 'male', 'freelancer', false),
    (cop, 'Maria Santos', 'maria_stolentest', 'female', 'freelancer', false),
    (cl, 'Mark Lim', 'mark_stolentest', 'male', 'client', false);

  -- The copier's posts (made first), each with its hidden code.
  insert into public.portfolio_items (freelancer_id, title) values (cop, 'Stolen logos') returning id into cp;
  insert into public.portfolio_items (freelancer_id, title) values (cop, 'More stolen logos') returning id into cp2;
  insert into public.media_slides (freelancer_id, portfolio_item_id, position, media_type, file_path) values (cop, cp, 1, 'image', 'x/old.jpg') returning id into s_old;
  insert into public.media_slides (freelancer_id, portfolio_item_id, position, media_type, file_path) values (cop, cp, 2, 'image', 'x/other.jpg') returning id into s_other;
  insert into public.media_slides (freelancer_id, portfolio_item_id, position, media_type, file_path, page_count) values (cop, cp, 3, 'document', 'x/cdoc.txt', 2) returning id into s_cdoc;
  insert into public.portfolio_items (freelancer_id, kind, title, body) values (cop, 'document', 'Copied essay', 'Some copied text.') returning id into d_old;
  insert into public.portfolio_items (freelancer_id, kind, title, body) values (cop, 'document', 'Copied essay 2', 'More copied text.') returning id into d_old2;
  insert into public.watermark_codes (code, slide_id, freelancer_id) values (111111, s_old, cop), (111112, s_cdoc, cop);
  insert into public.watermark_codes (code, portfolio_item_id, freelancer_id) values (111113, d_old, cop), (111114, d_old2, cop);

  -- The real owner's uploads (made later), held back by the copy check.
  insert into public.portfolio_items (freelancer_id, title) values (own, 'My logos') returning id into op;
  insert into public.portfolio_items (freelancer_id, title) values (own, 'My sketches') returning id into op2;
  insert into public.services (freelancer_id, title, category, description) values (own, 'Logo design', 'Design', 'A test service.') returning id into svc;
  insert into public.media_slides (freelancer_id, portfolio_item_id, position, media_type, file_path, status, matched_slide_id, match_score)
    values (own, op, 1, 'image', 'y/new.jpg', 'flagged', s_old, 0.97) returning id into s_new;
  insert into public.media_slides (freelancer_id, service_id, position, media_type, file_path, status, matched_slide_id, match_score)
    values (own, svc, 1, 'image', 'y/code.jpg', 'flagged', s_other, 1.0) returning id into s_code;
  insert into public.media_slides (freelancer_id, service_id, position, media_type, file_path, status, match_score)
    values (own, svc, 2, 'image', 'y/gone.jpg', 'flagged', 0.95) returning id into s_gone;
  insert into public.media_slides (freelancer_id, service_id, position, media_type, file_path, status, matched_item_id, match_score)
    values (own, svc, 3, 'document', 'y/doc.txt', 'flagged', d_old2, 0.91) returning id into s_doc;
  insert into public.portfolio_items (freelancer_id, kind, title, body, status, matched_item_id, match_score)
    values (own, 'document', 'My essay', 'My own text.', 'flagged', d_old, 0.9) returning id into d_new;
  insert into public.portfolio_items (freelancer_id, kind, title, body, status, matched_slide_id, match_score)
    values (own, 'document', 'My essay 2', 'More of my own text.', 'flagged', s_cdoc, 0.93) returning id into d_new2;
  insert into public.portfolio_items (freelancer_id, kind, title, body, status, match_score)
    values (cop, 'document', 'A held copy', 'Held text.', 'flagged', 0.99) returning id into d_flag;
  insert into public.watermark_codes (code, slide_id, freelancer_id) values (222221, s_new, own);

  set local role authenticated;

  -- ===== 1. Reporting stolen work =====
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (cl, 'portfolio_item', cp, 'stolen_work', 'The original is at example.com/juan') returning id into r1;
  res := res || E'\nPASS  1a. a user can report a portfolio project as stolen work';

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason) values (cl, 'portfolio_item', cp2, 'nonsense');
    res := res || E'\nFAIL  1b. an unknown reason was accepted';
  exception when check_violation then res := res || E'\nPASS  1b. an unknown reason is still refused';
  when others then res := res || E'\nFAIL  1b. wrong error: ' || sqlerrm; end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason) values (cl, 'comment', cp2, 'stolen_work');
    res := res || E'\nFAIL  1c. an unknown kind of target was accepted';
  exception when check_violation then res := res || E'\nPASS  1c. an unknown kind of target is still refused';
  when others then res := res || E'\nFAIL  1c. wrong error: ' || sqlerrm; end;

  insert into public.reports (reporter_id, target_type, target_id, reason) values (cl, 'portfolio_item', cp2, 'stolen_work') returning id into r2;

  -- A regular admin asks a super admin to remove the reported project.
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);

  insert into public.admin_requests (requested_by, kind, report_id, listing_table, listing_id)
  values (a1, 'remove_listing', r1, 'portfolio_items', cp);
  res := res || E'\nPASS  1d. a regular admin can ask to remove a reported portfolio project';

  begin
    insert into public.admin_requests (requested_by, kind, report_id, listing_table, listing_id)
    values (a1, 'remove_listing', r2, 'profiles', cp2);
    res := res || E'\nFAIL  1e. a request to remove from an unknown table was accepted';
  exception when check_violation then res := res || E'\nPASS  1e. a request to remove from an unknown table is refused';
  when others then res := res || E'\nFAIL  1e. wrong error: ' || sqlerrm; end;

  select message into msg from public.admin_log where admin_id = a1 order by created_at desc limit 1;
  if msg = 'Ana Admin asked to remove the portfolio project "Stolen logos" by Maria Santos (waiting for a super admin).' then
    res := res || E'\nPASS  1f. the Activity Log names the portfolio project in the request';
  else res := res || E'\nFAIL  1f. log says: ' || coalesce(msg, '(nothing)'); end if;

  -- A super admin suspends for "Stolen work" and resolves the report.
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);

  insert into public.user_suspensions (user_id, reason, violation, suspended_by, ends_at, blocks_posting, blocks_messaging)
  values (cop, 'Stolen work', 'stolen_work', sa, now() + interval '14 days', true, false);
  select message into msg from public.admin_log where admin_id = sa order by created_at desc limit 1;
  if msg = 'Sam Super suspended Maria Santos for 14 days (Stolen work).' then
    res := res || E'\nPASS  1g. a "Stolen work" suspension is saved and logged with its name';
  else res := res || E'\nFAIL  1g. log says: ' || coalesce(msg, '(nothing)'); end if;

  update public.reports set status = 'resolved', reviewed_by = sa, reviewed_at = now() where id = r1;
  select message into msg from public.admin_log where admin_id = sa order by created_at desc limit 1;
  if msg = 'Sam Super resolved a report about the portfolio project "Stolen logos" by Maria Santos.' then
    res := res || E'\nPASS  1h. resolving the report is logged with the project''s name';
  else res := res || E'\nFAIL  1h. log says: ' || coalesce(msg, '(nothing)'); end if;

  reset role;
  select message into msg from public.user_notifications where user_id = cl and type = 'report_resolved' order by created_at desc limit 1;
  if msg like 'Thanks for your report about a portfolio project (sent %' then
    res := res || E'\nPASS  1i. the reporter is told their report about "a portfolio project" was reviewed';
  else res := res || E'\nFAIL  1i. notification says: ' || coalesce(msg, '(nothing)'); end if;
  set local role authenticated;

  -- ===== 2. Deleting a portfolio project =====
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  delete from public.portfolio_items where id = op2;
  reset role;
  select count(*) into n from public.admin_log where target_id = op2;
  if n = 0 and not exists (select 1 from public.portfolio_items where id = op2) then
    res := res || E'\nPASS  2a. an owner deleting their own project writes nothing in the Activity Log';
  else res := res || E'\nFAIL  2a. ' || n || ' log lines, or the project is still there'; end if;
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  delete from public.portfolio_items where id = cp2;
  select message into msg from public.admin_log where target_id = cp2 order by created_at desc limit 1;
  if msg = 'Ana Admin deleted the portfolio project "More stolen logos" by Maria Santos.' then
    res := res || E'\nPASS  2b. an admin deleting a project is logged';
  else res := res || E'\nFAIL  2b. log says: ' || coalesce(msg, '(nothing)'); end if;

  delete from public.portfolio_items where id = d_flag;
  select count(*), max(message) into n, msg from public.admin_log where target_id = d_flag;
  if n = 1 and msg = 'Ana Admin removed a flagged document by Maria Santos.' then
    res := res || E'\nPASS  2c. removing a held-back document still writes one line, not two';
  else res := res || E'\nFAIL  2c. ' || n || ' lines, last: ' || coalesce(msg, '(nothing)'); end if;

  -- ===== 3. Keep this one, remove the other =====
  -- 3a. Not for ordinary users.
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  begin
    perform public.keep_flagged_remove_other('slide', s_new);
    res := res || E'\nFAIL  3a. an ordinary user used it';
  exception when others then
    if sqlerrm = 'Only admins can review flagged content.' then res := res || E'\nPASS  3a. an ordinary user is refused';
    else res := res || E'\nFAIL  3a. wrong error: ' || sqlerrm; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);

  begin
    perform public.keep_flagged_remove_other('slide', s_old);
    res := res || E'\nFAIL  3b. it ran on a photo that is not held back';
  exception when others then
    if sqlerrm = 'That item is not waiting for review.' then res := res || E'\nPASS  3b. a photo that is not held back is refused';
    else res := res || E'\nFAIL  3b. wrong error: ' || sqlerrm; end if;
  end;

  begin
    perform public.keep_flagged_remove_other('slide', s_code);
    res := res || E'\nFAIL  3c. it ran on a hidden-code match';
  exception when others then
    if sqlerrm like 'This file carries the other freelancer''s hidden code%' then res := res || E'\nPASS  3c. a hidden-code match is refused (a download can''t be the original)';
    else res := res || E'\nFAIL  3c. wrong error: ' || sqlerrm; end if;
  end;

  begin
    perform public.keep_flagged_remove_other('slide', s_gone);
    res := res || E'\nFAIL  3d. it ran when the matched post was already deleted';
  exception when others then
    if sqlerrm like 'The item it matched has already been deleted%' then res := res || E'\nPASS  3d. refused when the matched post is already gone';
    else res := res || E'\nFAIL  3d. wrong error: ' || sqlerrm; end if;
  end;

  begin
    perform public.keep_flagged_remove_other('profile', s_new);
    res := res || E'\nFAIL  3e. an unknown kind of item was accepted';
  exception when others then
    if sqlerrm = 'Unknown kind of flagged item.' then res := res || E'\nPASS  3e. an unknown kind of item is refused';
    else res := res || E'\nFAIL  3e. wrong error: ' || sqlerrm; end if;
  end;

  reset role;
  select count(*) into n from public.media_slides where id in (s_new, s_code, s_gone) and status = 'flagged';
  if n = 3 and exists (select 1 from public.media_slides where id = s_old) and exists (select 1 from public.media_slides where id = s_other) then
    res := res || E'\nPASS  3f. the refused tries changed nothing';
  else res := res || E'\nFAIL  3f. something changed after a refused try'; end if;
  set local role authenticated;

  -- 3g. A photo against a photo.
  select removed_path, removed_pages into path, pages from public.keep_flagged_remove_other('slide', s_new);
  if path = 'x/old.jpg' and pages = 0 then
    res := res || E'\nPASS  3g. it gives back the removed photo''s file, for the page to delete';
  else res := res || E'\nFAIL  3g. got ' || coalesce(path, '(nothing)') || ', ' || coalesce(pages::text, '(nothing)'); end if;

  -- Everyone can see the kept photo now (a client looks).
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  select count(*) into n from public.media_slides where id = s_new and status = 'active';
  if n = 1 and not exists (select 1 from public.media_slides where id = s_old) then
    res := res || E'\nPASS  3h. the kept photo is visible to everyone and the earlier one is gone';
  else res := res || E'\nFAIL  3h. the kept photo is not visible, or the earlier one is still there'; end if;

  reset role;
  select freelancer_id, slide_id into who, linked from public.watermark_codes where code = 111111;
  if who = own and linked is null then
    res := res || E'\nPASS  3i. the removed photo''s hidden code now belongs to the real owner';
  else res := res || E'\nFAIL  3i. the code belongs to ' || coalesce(who::text, '(nobody)'); end if;
  select freelancer_id, slide_id into who, linked from public.watermark_codes where code = 222221;
  if who = own and linked = s_new then
    res := res || E'\nPASS  3j. the kept photo''s own hidden code is untouched';
  else res := res || E'\nFAIL  3j. the kept photo''s code changed'; end if;
  select string_agg(message, ' | ' order by created_at) into msg from public.admin_log where target_id in (s_new, s_old);
  if msg = 'Ana Admin approved a flagged photo by Juan Cruz. | Ana Admin removed the earlier photo by Maria Santos as the copy, and kept the one by Juan Cruz.' then
    res := res || E'\nPASS  3k. the Activity Log says what was kept and what was removed';
  else res := res || E'\nFAIL  3k. log says: ' || coalesce(msg, '(nothing)'); end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);

  begin
    perform public.keep_flagged_remove_other('slide', s_new);
    res := res || E'\nFAIL  3l. it ran a second time on the same photo';
  exception when others then res := res || E'\nPASS  3l. it can''t be used twice on the same photo'; end;

  -- 3m. An older writing item against another writing item.
  select removed_path into path from public.keep_flagged_remove_other('document', d_new);
  reset role;
  select status into st from public.portfolio_items where id = d_new;
  select freelancer_id into who from public.watermark_codes where code = 111113;
  if st = 'active' and path is null and who = own and not exists (select 1 from public.portfolio_items where id = d_old) then
    res := res || E'\nPASS  3m. writing against writing: kept, the other removed, its code handed over';
  else res := res || E'\nFAIL  3m. status ' || coalesce(st, '(gone)') || ', code owner ' || coalesce(who::text, '(nobody)'); end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);

  -- 3n. A document in a service against a writing item.
  perform public.keep_flagged_remove_other('slide', s_doc);
  reset role;
  select status into st from public.media_slides where id = s_doc;
  select freelancer_id into who from public.watermark_codes where code = 111114;
  if st = 'active' and who = own and not exists (select 1 from public.portfolio_items where id = d_old2) then
    res := res || E'\nPASS  3n. a service document against a writing item: kept, the other removed';
  else res := res || E'\nFAIL  3n. status ' || coalesce(st, '(gone)'); end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);

  -- 3o. A writing item against a document in someone's project.
  select removed_path, removed_pages into path, pages from public.keep_flagged_remove_other('document', d_new2);
  reset role;
  select status into st from public.portfolio_items where id = d_new2;
  select freelancer_id into who from public.watermark_codes where code = 111112;
  if st = 'active' and path = 'x/cdoc.txt' and pages = 2 and who = own and not exists (select 1 from public.media_slides where id = s_cdoc) then
    res := res || E'\nPASS  3o. a writing item against a document slide: kept, the slide removed, its file and pages given back';
  else res := res || E'\nFAIL  3o. status ' || coalesce(st, '(gone)') || ', path ' || coalesce(path, '(nothing)'); end if;

  -- The copier's project is still there, with its other photo.
  if exists (select 1 from public.portfolio_items where id = cp) and exists (select 1 from public.media_slides where id = s_other) then
    res := res || E'\nPASS  3p. the copier''s project stays, with the files that were not copies';
  else res := res || E'\nFAIL  3p. the copier''s project or its other photo is gone'; end if;

  raise exception E'TEST RESULTS (everything is rolled back):%', res;
end;
$t$;
