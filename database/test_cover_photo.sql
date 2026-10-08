-- Test for supabase_cover_photo_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts, acts as each one, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
--
-- Not covered here: a super admin deleting the picture FILE. Supabase blocks
-- deleting storage files with SQL (only the Storage API may), so that part is
-- checked on the website: Admin > Reports > Remove Picture.
do $t$
declare
  res text := '';
  sa uuid := gen_random_uuid();    -- a super admin, "Sam Super"
  a1 uuid := gen_random_uuid();    -- a regular admin, "Ana Admin"
  own uuid := gen_random_uuid();   -- the person with the pictures, "Juan Cruz"
  rep uuid := gen_random_uuid();   -- the reporter, "Mark Lim"
  oth uuid := gen_random_uuid();   -- somebody else, "Maria Santos"
  av text; cv text;                -- Juan's picture and cover files
  r1 uuid; r2 uuid; r3 uuid;
  n int; msg text; got text; code text;
begin
  -- ===== Made-up rows, added with nobody signed in =====
  av := own || '/1700000000001.jpg';
  cv := own || '/1700000000002.jpg';
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'cover-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[sa, a1, own, rep, oth]) as x;
  insert into public.admins (id, full_name, username, role) values
    (sa, 'Sam Super', 'sam_covertest', 'super_admin'),
    (a1, 'Ana Admin', 'ana_covertest', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (own, 'Juan Cruz', 'juan_covertest', 'male', 'freelancer', false),
    (rep, 'Mark Lim', 'mark_covertest', 'male', 'client', false),
    (oth, 'Maria Santos', 'maria_covertest', 'female', 'freelancer', false);
  update public.profiles set avatar_path = av, cover_path = cv where id = own;
  insert into storage.objects (bucket_id, name) values ('avatars', av), ('covers', cv);

  set local role authenticated;

  -- ===== 1. The cover photo column =====
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);

  update public.profiles set cover_path = own || '/1700000000003.jpg' where id = own;
  select cover_path into got from public.profiles where id = own;
  if got = own || '/1700000000003.jpg' then res := res || E'\nPASS  1a. a user can save a cover in their own folder';
  else res := res || E'\nFAIL  1a. cover is ' || coalesce(got, '(empty)'); end if;

  begin
    update public.profiles set cover_path = oth || '/1700000000004.jpg' where id = own;
    res := res || E'\nFAIL  1b. a cover in someone else''s folder was accepted';
  exception when check_violation then res := res || E'\nPASS  1b. a cover in someone else''s folder is refused';
  when others then res := res || E'\nFAIL  1b. wrong error: ' || sqlerrm; end;

  begin
    update public.profiles set cover_path = 'https://example.com/x.jpg' where id = own;
    res := res || E'\nFAIL  1c. an outside link was accepted as a cover';
  exception when check_violation then res := res || E'\nPASS  1c. an outside link is refused as a cover';
  when others then res := res || E'\nFAIL  1c. wrong error: ' || sqlerrm; end;

  update public.profiles set cover_path = cv where id = own;   -- back to the starting cover

  perform set_config('request.jwt.claims', json_build_object('sub', oth, 'role', 'authenticated')::text, true);
  update public.profiles set cover_path = null where id = own;
  get diagnostics n = row_count;
  if n = 0 then res := res || E'\nPASS  1d. nobody else can change someone''s cover';
  else res := res || E'\nFAIL  1d. someone else changed a cover'; end if;

  -- The storage rules: your own folder only; the super admin can also see files.
  begin
    insert into storage.objects (bucket_id, name) values ('covers', own || '/1700000000005.jpg');
    res := res || E'\nFAIL  1e. a user added a cover file to someone else''s folder';
  exception when insufficient_privilege then res := res || E'\nPASS  1e. a user can''t add a cover file to someone else''s folder';
  when others then res := res || E'\nFAIL  1e. wrong error: ' || sqlerrm; end;

  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name) values ('covers', own || '/1700000000006.jpg');
  select count(*) into n from storage.objects where bucket_id = 'covers' and name like own || '/%';
  if n = 2 then res := res || E'\nPASS  1f. a user can add a cover file to their own folder and see their files';
  else res := res || E'\nFAIL  1f. saw ' || n || ' files'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where name like own || '/%' and bucket_id in ('avatars', 'covers');
  if n = 3 then res := res || E'\nPASS  1g. a super admin can see the picture and cover files';
  else res := res || E'\nFAIL  1g. saw ' || n || ' files'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where name like own || '/%' and bucket_id in ('avatars', 'covers');
  if n = 0 then res := res || E'\nPASS  1h. a regular admin can''t see (or delete) other people''s picture files';
  else res := res || E'\nFAIL  1h. a regular admin saw ' || n || ' files'; end if;

  -- ===== 2. Reporting a picture =====
  perform set_config('request.jwt.claims', json_build_object('sub', rep, 'role', 'authenticated')::text, true);

  insert into public.reports (reporter_id, target_type, target_id, reason, details, reported_path)
  values (rep, 'profile_picture', own, 'inappropriate', 'Not allowed here', av) returning id into r1;
  res := res || E'\nPASS  2a. a user can report a profile picture (the file is kept on the report)';

  insert into public.reports (reporter_id, target_type, target_id, reason, reported_path)
  values (rep, 'cover_photo', own, 'harassment', cv) returning id into r2;
  res := res || E'\nPASS  2b. a user can report a cover photo';

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, reported_path)
    values (rep, 'profile_picture', own, 'spam', av);
    res := res || E'\nFAIL  2c. a second pending report about the same picture was accepted';
  exception when unique_violation then res := res || E'\nPASS  2c. one pending report per picture, like the other reports';
  when others then res := res || E'\nFAIL  2c. wrong error: ' || sqlerrm; end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, reported_path)
    values (rep, 'profile_picture', oth, 'spam', oth || '/1700000000009.jpg');
    res := res || E'\nFAIL  2d. a report about a file the person doesn''t have was accepted';
  exception when insufficient_privilege then res := res || E'\nPASS  2d. a file that isn''t on the person''s profile can''t be reported';
  when others then res := res || E'\nFAIL  2d. wrong error: ' || sqlerrm; end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, reported_path)
    values (rep, 'profile_picture', oth, 'spam', own || '/1700000000001.jpg');
    res := res || E'\nFAIL  2e. a report pointing at someone else''s file was accepted';
  exception when insufficient_privilege or check_violation then res := res || E'\nPASS  2e. a report can''t point at a file from another person''s folder';
  when others then res := res || E'\nFAIL  2e. wrong error: ' || sqlerrm; end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, reported_path)
    values (rep, 'profile_picture', own, 'other', null);
    res := res || E'\nFAIL  2f. a picture report with no file was accepted';
  exception when check_violation or insufficient_privilege or unique_violation then res := res || E'\nPASS  2f. a picture report must say which file';
  when others then res := res || E'\nFAIL  2f. wrong error: ' || sqlerrm; end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, reported_path)
    values (rep, 'service', gen_random_uuid(), 'spam', av);
    res := res || E'\nFAIL  2g. a service report with a picture file was accepted';
  exception when check_violation then res := res || E'\nPASS  2g. only picture reports carry a file';
  when others then res := res || E'\nFAIL  2g. wrong error: ' || sqlerrm; end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, reported_path)
    values (rep, 'avatar', own, 'spam', av);
    res := res || E'\nFAIL  2h. an unknown kind of target was accepted';
  exception when check_violation then res := res || E'\nPASS  2h. an unknown kind of target is still refused';
  when others then res := res || E'\nFAIL  2h. wrong error: ' || sqlerrm; end;

  insert into public.reports (reporter_id, target_type, target_id, reason) values (rep, 'user', oth, 'spam') returning id into r3;
  res := res || E'\nPASS  2i. a normal user report still works';

  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, reported_path)
    values (own, 'profile_picture', own, 'other', av);
    res := res || E'\nFAIL  2j. someone reported their own picture';
  exception when insufficient_privilege then res := res || E'\nPASS  2j. you can''t report your own picture';
  when others then res := res || E'\nFAIL  2j. wrong error: ' || sqlerrm; end;

  -- The owner can't read other people's reports, but the rule that keeps the
  -- reported file still has to see them (Juan, the owner, is signed in here).
  select count(*) into n from public.reports where target_id = own;
  if n = 0 and public.is_reported_picture(av) and public.is_reported_picture(cv) and not public.is_reported_picture(own || '/1700000000077.jpg') then
    res := res || E'\nPASS  2k. the owner can''t see the reports, yet a reported file counts as kept (and other files don''t)';
  else res := res || E'\nFAIL  2k. owner sees ' || n || ' reports, or the kept-file answer is wrong'; end if;

  -- ===== 3. The request a regular admin sends =====
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);

  insert into public.admin_requests (requested_by, kind, report_id, target_user_id) values (a1, 'remove_picture', r1, own);
  res := res || E'\nPASS  3a. a regular admin can ask to remove a reported picture';

  begin
    insert into public.admin_requests (requested_by, kind, report_id) values (a1, 'remove_picture', r2);
    res := res || E'\nFAIL  3b. a picture request with no owner was accepted';
  exception when check_violation then res := res || E'\nPASS  3b. a picture request must name the owner';
  when others then res := res || E'\nFAIL  3b. wrong error: ' || sqlerrm; end;

  select message into msg from public.admin_log where admin_id = a1 order by created_at desc limit 1;
  if msg = 'Ana Admin asked to remove the profile picture of Juan Cruz (waiting for a super admin).' then
    res := res || E'\nPASS  3c. the Activity Log names the picture in the request';
  else res := res || E'\nFAIL  3c. log says: ' || coalesce(msg, '(nothing)'); end if;

  -- ===== 4. Removing a picture =====
  begin
    perform public.admin_remove_picture(own, 'profile_picture', av);
    res := res || E'\nFAIL  4a. a regular admin removed a picture directly';
  exception when others then
    if sqlerrm = 'Only a super admin can remove a picture.' then res := res || E'\nPASS  4a. a regular admin can''t remove a picture directly';
    else res := res || E'\nFAIL  4a. wrong error: ' || sqlerrm; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', rep, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_remove_picture(own, 'profile_picture', av);
    res := res || E'\nFAIL  4b. an ordinary user removed a picture';
  exception when others then
    if sqlerrm = 'Only a super admin can remove a picture.' then res := res || E'\nPASS  4b. an ordinary user can''t remove a picture';
    else res := res || E'\nFAIL  4b. wrong error: ' || sqlerrm; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);

  got := public.admin_remove_picture(own, 'profile_picture', own || '/1700000000099.jpg');
  select avatar_path into msg from public.profiles where id = own;
  if got is null and msg = av then res := res || E'\nPASS  4c. a picture that was changed since the report is left alone';
  else res := res || E'\nFAIL  4c. returned ' || coalesce(got, '(nothing)') || ', picture is ' || coalesce(msg, '(empty)'); end if;

  got := public.admin_remove_picture(own, 'profile_picture', av);
  select avatar_path, cover_path into msg, code from public.profiles where id = own;
  if got = av and msg is null and code = cv then
    res := res || E'\nPASS  4d. a super admin removes the reported picture (the cover stays) and gets the file back';
  else res := res || E'\nFAIL  4d. returned ' || coalesce(got, '(nothing)') || ', picture ' || coalesce(msg, '(empty)'); end if;

  got := public.admin_remove_picture(own, 'profile_picture', av);
  if got is null then res := res || E'\nPASS  4e. removing it again does nothing';
  else res := res || E'\nFAIL  4e. it returned ' || got; end if;

  select message into msg from public.admin_log where admin_id = sa order by created_at desc limit 1;
  if msg = 'Sam Super removed the profile picture of Juan Cruz.' then
    res := res || E'\nPASS  4f. the removal is written in the Activity Log';
  else res := res || E'\nFAIL  4f. log says: ' || coalesce(msg, '(nothing)'); end if;

  got := public.admin_remove_picture(own, 'cover_photo', cv);
  select cover_path into msg from public.profiles where id = own;
  if got = cv and msg is null then res := res || E'\nPASS  4g. a super admin removes a reported cover photo';
  else res := res || E'\nFAIL  4g. returned ' || coalesce(got, '(nothing)'); end if;

  begin
    perform public.admin_remove_picture(own, 'banner', cv);
    res := res || E'\nFAIL  4h. an unknown kind of picture was accepted';
  exception when others then
    if sqlerrm = 'Unknown kind of picture.' then res := res || E'\nPASS  4h. an unknown kind of picture is refused';
    else res := res || E'\nFAIL  4h. wrong error: ' || sqlerrm; end if;
  end;

  -- ===== 5. Closing the report =====
  update public.reports set status = 'resolved', reviewed_by = sa, reviewed_at = now() where id = r1;
  select message into msg from public.admin_log where admin_id = sa order by created_at desc limit 1;
  if msg = 'Sam Super resolved a report about the profile picture of Juan Cruz.' then
    res := res || E'\nPASS  5a. resolving the report is logged with the picture''s owner';
  else res := res || E'\nFAIL  5a. log says: ' || coalesce(msg, '(nothing)'); end if;

  reset role;
  select message into msg from public.user_notifications where user_id = rep and type = 'report_resolved' order by created_at desc limit 1;
  if msg like 'Thanks for your report about a profile picture (sent %' then
    res := res || E'\nPASS  5b. the reporter is told their report about "a profile picture" was reviewed';
  else res := res || E'\nFAIL  5b. notification says: ' || coalesce(msg, '(nothing)'); end if;

  update public.reports set status = 'dismissed', reviewed_by = sa, reviewed_at = now() where id = r2;
  select message into msg from public.user_notifications where user_id = rep and type = 'report_dismissed' order by created_at desc limit 1;
  if msg like 'An admin reviewed your report about a cover photo (sent %' then
    res := res || E'\nPASS  5c. a dismissed cover report tells the reporter "a cover photo"';
  else res := res || E'\nFAIL  5c. notification says: ' || coalesce(msg, '(nothing)'); end if;

  -- ===== 6. The reported file is only kept while the report is waiting =====
  if not public.is_reported_picture(av) and not public.is_reported_picture(cv) then
    res := res || E'\nPASS  6a. once the reports are reviewed, their files can be deleted again';
  else res := res || E'\nFAIL  6a. a reviewed report still keeps its file'; end if;

  select count(*) into n from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('avatars: users can delete their files', 'covers: users can delete their files')
    and qual like '%is_reported_picture%';
  if n = 2 then res := res || E'\nPASS  6b. both owner delete rules (pictures and covers) use the kept-file check';
  else res := res || E'\nFAIL  6b. ' || n || ' of 2 delete rules use it'; end if;

  raise exception E'TEST RESULTS (everything is rolled back):%', res;
end;
$t$;
