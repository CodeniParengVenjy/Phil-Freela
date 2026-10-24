-- Test for supabase_archives_schema.sql (and supabase_archives_finish.sql).
-- Paste this whole file into the Supabase SQL Editor and run it AFTER both
-- files. It makes made-up accounts, acts as each one, and ends with an error
-- that carries the PASS/FAIL list; that error rolls everything back, so nothing
-- is left behind.
--
-- Part 1 (sections 1 to 4) only needs supabase_archives_schema.sql and was run
-- through the Supabase connector on 2026-10-21. Part 2 (sections 5 to 8) needs
-- supabase_archives_finish.sql too.
do $t$
declare
  res text := '';
  sa uuid := gen_random_uuid();   -- a super admin, "Elena Cruz"
  a1 uuid := gen_random_uuid();   -- a plain admin, "Paolo Lim"
  u1 uuid := gen_random_uuid();   -- a client who gets archived, "Keanne Reyes"
  u2 uuid := gen_random_uuid();   -- a client who is never archived, "Mark Santos"
  u3 uuid := gen_random_uuid();   -- archived 101 days ago, "Ana Garcia"
  u4 uuid := gen_random_uuid();   -- archived 99 days ago, "Ben Cruz"
  u5 uuid := gen_random_uuid();   -- never archived, "Cara Lopez"
  n int;
  n0 int;
  got text;
  req uuid;
  -- The made-up profiles below use up user numbers (PF-00xx), and a sequence is
  -- not rolled back. The counter is saved here and put back at the end, so the
  -- next real sign-up doesn't skip numbers. (If the block ever stops with a
  -- different error before the end, put it back by hand:
  -- select setval('public.user_number_seq', (select max(user_number) from public.profiles), true);)
  seq_last bigint := (select last_value from public.user_number_seq);
  seq_called boolean := (select is_called from public.user_number_seq);
begin
  -- ===== Made-up rows, added with nobody signed in =====
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'arch-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now()
  from unnest(array[sa, a1, u1, u2, u3, u4, u5]) as x;
  insert into public.admins (id, full_name, username, role) values
    (sa, 'Elena Cruz', 'elena_archtest', 'super_admin'),
    (a1, 'Paolo Lim', 'paolo_archtest', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (u1, 'Keanne Reyes', 'keanne_archtest', 'male', 'client', false),
    (u2, 'Mark Santos', 'mark_archtest', 'male', 'client', false),
    (u3, 'Ana Garcia', 'ana_archtest', 'female', 'client', false),
    (u4, 'Ben Cruz', 'ben_archtest', 'male', 'client', false),
    (u5, 'Cara Lopez', 'cara_archtest', 'female', 'client', false);
  insert into public.job_posts (client_id, title, category, description, start_date, due_date) values (u1, 'Need a logo', 'Design', 'A test job.', (now() at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date + 7);

  set local role authenticated;

  -- ===== 1. Who can archive =====
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  begin perform public.archive_user(u1); res := res || E'\nFAIL  1a. a plain admin archived a user';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only a super admin can archive users.' then 'PASS  ' else 'FAIL  ' end || '1a. a plain admin cannot archive: ' || sqlerrm; end;
  begin insert into public.archived_users (user_id, archived_by) values (u1, a1); res := res || E'\nFAIL  1b. a plain admin wrote to archived_users directly';
  exception when others then res := res || E'\nPASS  1b. nobody can write to archived_users directly (only the functions)'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  begin perform public.archive_user(u1); res := res || E'\nFAIL  1c. a normal user archived someone';
  exception when others then res := res || E'\nPASS  1c. a normal user cannot archive'; end;
  select count(*) into n from public.archived_users;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '1d. a normal user sees no archive rows';

  -- ===== 2. The super admin archives =====
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select count(*) into n from public.search_people('Keanne');
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2a. before archiving, people search finds Keanne';
  select count(*) into n from public.job_posts where client_id = u1;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2b. before archiving, others see Keanne''s job post';

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select (public.admin_stats() ->> 'total_users')::int into n0;
  begin perform public.archive_user(a1); res := res || E'\nFAIL  2c. archived an admin';
  exception when others then res := res || E'\n' || case when sqlerrm like 'Admins are removed from the Admins page%' then 'PASS  ' else 'FAIL  ' end || '2c. an admin account cannot be archived'; end;
  begin perform public.archive_user(gen_random_uuid()); res := res || E'\nFAIL  2d. archived someone who does not exist';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That user no longer exists.' then 'PASS  ' else 'FAIL  ' end || '2d. an unknown account cannot be archived'; end;
  perform public.archive_user(u1);
  perform public.archive_user(u1);
  select count(*) into n from public.archived_users where user_id = u1 and archived_by = sa;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2e. a super admin archives, once (asking twice is harmless), recorded as themselves';

  -- ===== 3. What an archived account can't do =====
  res := res || E'\n' || case when public.is_suspended(u1) and public.is_posting_blocked(u1) and public.is_messaging_blocked(u1) then 'PASS  ' else 'FAIL  ' end || '3a. archived: counts as blocked for suspension, posting and messaging';
  res := res || E'\n' || case when not public.is_suspended(u2) and not public.is_posting_blocked(u2) and not public.is_messaging_blocked(u2) then 'PASS  ' else 'FAIL  ' end || '3b. someone who is not archived is not blocked';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select count(*) into n from public.search_people('Keanne');
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3c. people search no longer finds the archived account';
  select count(*) into n from public.job_posts where client_id = u1;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3d. others no longer see their job post';

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_posts where client_id = u1;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3e. the archived person still sees their own job post';
  begin
    insert into public.job_posts (client_id, title, category, description, start_date, due_date) values (u1, 'Another job', 'Design', 'Should not post.', (now() at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date + 7);
    res := res || E'\nFAIL  3f. an archived account posted a job';
  exception when others then res := res || E'\nPASS  3f. an archived account cannot post a job'; end;
  select count(*) into n from public.archived_users where user_id = u1;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3g. the archived person can read their own archive row (for the "archived" screen)';
  select count(*) into n from public.archived_users;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3h. ...and only their own';

  -- ===== 4. The admin pages =====
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select count(*) into n from public.admin_list_users() where id = u1;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '4a. the Users list leaves the archived account out';
  select count(*) into n from public.admin_list_users() where id = u2;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4b. ...and keeps everyone else';
  select count(*) into n from public.admin_list_archived() where id = u1 and archived_by_name = 'Elena Cruz' and email like 'arch-%';
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4c. the Archives list has the account, with e-mail and who archived it';
  res := res || E'\n' || case when (public.admin_stats() ->> 'total_users')::int = n0 - 1 then 'PASS  ' else 'FAIL  ' end || '4d. the Overview total drops by one';
  select count(*) into n from public.job_posts where client_id = u1;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4e. admins still see the archived account''s job post (the Listings page)';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  begin perform public.admin_list_archived(); res := res || E'\nFAIL  4f. a normal user read the Archives list';
  exception when others then res := res || E'\nPASS  4f. a normal user cannot read the Archives list'; end;

  -- ===== needs supabase_archives_finish.sql from here on =====

  -- ===== 5. Restore =====
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  begin perform public.restore_user(u1); res := res || E'\nFAIL  5a. a normal user restored an account';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only admins can restore users.' then 'PASS  ' else 'FAIL  ' end || '5a. a normal user cannot restore'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  begin perform public.restore_user(u2); res := res || E'\nFAIL  5b. restored an account that was not archived';
  exception when others then res := res || E'\n' || case when sqlerrm = 'That account is not archived.' then 'PASS  ' else 'FAIL  ' end || '5b. a plain account that is not archived: "' || sqlerrm || '"'; end;
  perform public.restore_user(u1);
  select count(*) into n from public.archived_users where user_id = u1;
  res := res || E'\n' || case when n = 0 and not public.is_posting_blocked(u1) then 'PASS  ' else 'FAIL  ' end || '5c. a plain admin restores, and the account works again';

  -- ===== 6. Delete for good takes two steps =====
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin perform public.delete_user(u1); res := res || E'\nFAIL  6a. deleted an account that was not archived';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Archive the account first.' then 'PASS  ' else 'FAIL  ' end || '6a. delete_user refuses an account that is not archived'; end;
  perform public.archive_user(u1);
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  begin perform public.delete_user(u1); res := res || E'\nFAIL  6b. a plain admin deleted an account';
  exception when others then res := res || E'\n' || case when sqlerrm = 'Only a super admin can delete users.' then 'PASS  ' else 'FAIL  ' end || '6b. a plain admin cannot delete, even an archived account'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.delete_user(u1);
  reset role;
  select count(*) into n from public.profiles where id = u1;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '6c. a super admin deletes an archived account for good';
  select count(*) into n from public.archived_users where user_id = u1;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '6d. the archive row goes with it';
  set local role authenticated;

  -- ===== 7. The daily job =====
  reset role;
  insert into public.archived_users (user_id, archived_by, archived_at) values
    (u3, sa, now() - interval '101 days'),
    (u4, sa, now() - interval '99 days');
  select public.delete_expired_archives() into n;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '7a. the daily job deletes exactly one account (archived 101 days ago)';
  select count(*) into n from public.profiles where id = u3;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '7b. the 101-day-old archive is gone';
  select count(*) into n from public.profiles where id = u4;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '7c. the 99-day-old archive is kept';
  select count(*) into n from cron.job where jobname = 'delete-expired-archives';
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '7d. the job is scheduled';
  set local role authenticated;

  -- ===== 8. Requests from a regular admin, and the Activity Log =====
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  insert into public.admin_requests (requested_by, kind, target_user_id, details) values (a1, 'archive', u5, '{}'::jsonb) returning id into req;
  begin
    insert into public.admin_requests (requested_by, kind, target_user_id, details) values (a1, 'archive', u5, '{}'::jsonb);
    res := res || E'\nFAIL  8a. two open requests for the same person';
  exception when others then res := res || E'\nPASS  8a. only one open request per person'; end;
  begin
    insert into public.admin_requests (requested_by, kind, details) values (a1, 'archive', '{}'::jsonb);
    res := res || E'\nFAIL  8b. an archive request without a person';
  exception when others then res := res || E'\nPASS  8b. an archive request must name a person'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  update public.admin_requests set status = 'approved' where id = req;
  perform public.archive_user(u5);
  perform public.restore_user(u5);

  reset role;
  select string_agg(action || ': ' || message, E'\n' order by created_at, message) into got
  from public.admin_log where target_id in (u1, u5);
  res := res || E'\n' || case when got like '%user_archive: Paolo Lim asked to archive Cara Lopez (waiting for a super admin).%' then 'PASS  ' else 'FAIL  ' end || '8c. the request is logged under "user_archive"';
  res := res || E'\n' || case when got like '%user_archive: Elena Cruz approved Paolo Lim''s request to archive Cara Lopez.%' then 'PASS  ' else 'FAIL  ' end || '8d. the approval is logged';
  res := res || E'\n' || case when got like '%user_archive: Elena Cruz archived Cara Lopez''s account.%' then 'PASS  ' else 'FAIL  ' end || '8e. archiving is logged';
  res := res || E'\n' || case when got like '%user_restore: Elena Cruz restored Cara Lopez''s account.%' then 'PASS  ' else 'FAIL  ' end || '8f. restoring is logged';
  res := res || E'\n' || case when got like '%user_delete: Elena Cruz permanently deleted Keanne Reyes''s account.%' then 'PASS  ' else 'FAIL  ' end || '8g. deleting for good is logged';
  res := res || E'\n' || case when got not like '%restored Keanne Reyes%' then 'PASS  ' else 'FAIL  ' end || '8h. deleting an archived account does not also log "restored"';

  perform setval('public.user_number_seq', seq_last, seq_called);
  select last_value into n from public.user_number_seq;
  res := res || E'\n' || case when n = seq_last then 'PASS  ' else 'FAIL  ' end || '9. the user number counter is back where it was (no PF numbers used up)';

  raise exception E'ARCHIVE TESTS (rolled back)%\n\nLog lines for Keanne and Cara:\n%', res, got;
end
$t$;
