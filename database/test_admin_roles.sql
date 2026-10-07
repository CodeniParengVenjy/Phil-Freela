-- Test for supabase_admin_roles_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It makes made-up
-- accounts, acts as each one, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
-- (Lifting a suspension is not tested here: it needs a DELETE statement, which
-- the Supabase connector will not run without someone to confirm. That rule
-- was not changed by this file.)
do $t$
declare
  res text := '';
  sa uuid := gen_random_uuid();   -- a super admin, "Sam Super"
  a1 uuid := gen_random_uuid();   -- a regular admin, "Ana Admin"
  a2 uuid := gen_random_uuid();   -- another regular admin, "Olive Other"
  f uuid := gen_random_uuid();    -- a freelancer, "Keanne Reyes"
  c uuid := gen_random_uuid();    -- a client, "Mark Santos"
  svc uuid; r1 uuid; r2 uuid; req1 uuid; req2 uuid;
  n int;
  st text;
  who uuid;
  msg text;
begin
  -- ===== Made-up rows, added with nobody signed in =====
  insert into auth.users (id, email, aud, role, created_at)
  select x, 'roles-' || left(x::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now() from unnest(array[sa, a1, a2, f, c]) as x;
  insert into public.admins (id, full_name, username, role) values
    (sa, 'Sam Super', 'sam_rolestest', 'super_admin'),
    (a1, 'Ana Admin', 'ana_rolestest', 'admin'),
    (a2, 'Olive Other', 'olive_rolestest', 'admin');
  insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values
    (f, 'Keanne Reyes', 'keanne_rolestest', 'male', 'freelancer', false),
    (c, 'Mark Santos', 'mark_rolestest', 'male', 'client', false);
  insert into public.services (freelancer_id, title, category, description) values (f, 'Logo design', 'Design', 'A test service.') returning id into svc;
  insert into public.reports (reporter_id, target_type, target_id, reason) values (c, 'user', f, 'spam') returning id into r1;
  insert into public.reports (reporter_id, target_type, target_id, reason) values (c, 'service', svc, 'scam') returning id into r2;

  set local role authenticated;

  -- ===== A regular admin =====
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);

  insert into public.admin_requests (requested_by, kind, report_id, target_user_id, details)
  values (a1, 'ban', r1, f, '{"violation":"spam"}') returning id into req1;
  res := res || E'\nPASS  1a. a regular admin can send a ban request for a report';

  begin
    insert into public.admin_requests (requested_by, kind, report_id) values (a1, 'dismiss', r1);
    res := res || E'\nFAIL  1b. a second open request for the same report was accepted';
  exception when unique_violation then res := res || E'\nPASS  1b. a second open request for the same report is refused';
  when others then res := res || E'\nFAIL  1b. wrong error: ' || sqlerrm; end;

  begin
    insert into public.admin_requests (requested_by, kind, report_id) values (sa, 'dismiss', r2);
    res := res || E'\nFAIL  1c. a request was sent in someone else''s name';
  exception when others then res := res || E'\nPASS  1c. a request cannot be sent in someone else''s name'; end;

  begin
    insert into public.admin_requests (requested_by, kind, report_id, status) values (a1, 'dismiss', r2, 'approved');
    res := res || E'\nFAIL  1d. a request was created already approved';
  exception when others then res := res || E'\nPASS  1d. a request cannot be created already approved'; end;

  begin
    insert into public.admin_requests (requested_by, kind) values (a1, 'suspend');
    res := res || E'\nFAIL  1e. a suspend request with nobody to suspend was accepted';
  exception when others then res := res || E'\nPASS  1e. a suspend request must say who to suspend'; end;

  begin
    insert into public.user_suspensions (user_id, reason, violation, suspended_by, ends_at) values (f, 'test', 'spam', a1, now() + interval '3 days');
    res := res || E'\nFAIL  1f. a regular admin suspended a user directly';
  exception when others then res := res || E'\nPASS  1f. a regular admin cannot suspend a user directly'; end;

  update public.reports set status = 'resolved', reviewed_by = a1, reviewed_at = now() where id = r2;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '1g. a regular admin cannot resolve a report directly (0 rows)';

  update public.admin_requests set status = 'approved' where id = req1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '1h. a regular admin cannot approve their own request (0 rows)';

  begin
    insert into public.announcements (title, message, audience, created_by) values ('Hi', 'Test', 'all', a1);
    res := res || E'\nFAIL  1i. a regular admin posted an announcement';
  exception when others then res := res || E'\nPASS  1i. a regular admin cannot post an announcement'; end;

  begin
    insert into public.dashboard_billboards (title, message, audience, created_by) values ('Hi', 'Test', 'all', a1);
    res := res || E'\nFAIL  1j. a regular admin posted a billboard';
  exception when others then res := res || E'\nPASS  1j. a regular admin cannot post a billboard'; end;

  -- A second regular admin sends one of their own, which the first must not see.
  perform set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated')::text, true);
  insert into public.admin_requests (requested_by, kind, report_id) values (a2, 'dismiss', r2) returning id into req2;
  select count(*) into n from public.admin_requests;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '1k. a regular admin sees only their own requests (saw ' || n || ')';

  -- ===== A normal user =====
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  select count(*) into n from public.admin_requests;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '2a. a normal user sees no requests';
  begin
    insert into public.admin_requests (requested_by, kind, report_id) values (f, 'dismiss', r2);
    res := res || E'\nFAIL  2b. a normal user sent a request';
  exception when others then res := res || E'\nPASS  2b. a normal user cannot send a request'; end;

  -- ===== The super admin =====
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select count(*) into n from public.admin_requests;
  res := res || E'\n' || case when n = 2 then 'PASS  ' else 'FAIL  ' end || '3a. a super admin sees every request (saw ' || n || ')';

  begin
    insert into public.admin_requests (requested_by, kind, report_id) values (sa, 'dismiss', r1);
    res := res || E'\nFAIL  3b. a super admin sent a request';
  exception when others then res := res || E'\nPASS  3b. a super admin does not need to send a request'; end;

  begin
    update public.admin_requests set kind = 'dismiss' where id = req1;
    res := res || E'\nFAIL  3c. a super admin edited a request';
  exception when others then res := res || E'\nPASS  3c. a super admin can only decide a request, not edit it'; end;

  update public.admin_requests set status = 'approved', decision_note = 'ok' where id = req1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3d. a super admin approves a request';

  update public.admin_requests set status = 'declined' where id = req1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3e. a request can only be decided once (0 rows)';

  update public.admin_requests set status = 'declined', decision_note = 'not enough proof' where id = req2;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3f. a super admin declines a request';

  insert into public.user_suspensions (user_id, reason, violation, suspended_by, ends_at) values (f, 'Spam', 'spam', sa, null);
  res := res || E'\nPASS  3g. a super admin can ban a user';

  update public.reports set status = 'resolved', reviewed_by = sa, reviewed_at = now(), admin_note = 'Banned.' where id = r1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3h. a super admin resolves a report';

  insert into public.announcements (title, message, audience, created_by) values ('Maintenance', 'Tonight', 'all', sa);
  res := res || E'\nPASS  3i. a super admin posts an announcement';
  insert into public.dashboard_billboards (title, message, audience, created_by) values ('Welcome', 'Hello', 'all', sa);
  res := res || E'\nPASS  3j. a super admin posts a billboard';

  -- ===== What was written down (read as the owner, past the log's own rules) =====
  reset role;
  select status, decided_by into st, who from public.admin_requests where id = req1;
  res := res || E'\n' || case when st = 'approved' and who = sa then 'PASS  ' else 'FAIL  ' end || '4a. the decision records who made it';
  select status into st from public.reports where id = r2;
  res := res || E'\n' || case when st = 'pending' then 'PASS  ' else 'FAIL  ' end || '4b. a declined request leaves the report pending';
  select requested_by_name into msg from public.admin_requests where id = req1;
  res := res || E'\n' || case when msg = 'Ana Admin' then 'PASS  ' else 'FAIL  ' end || '4c. the requester''s name is copied into the request';

  select message into msg from public.admin_log where admin_id = a1 and action = 'ban' and message like '%asked to ban%' order by created_at desc limit 1;
  res := res || E'\n' || case when msg = 'Ana Admin asked to ban Keanne Reyes (waiting for a super admin).' then 'PASS  ' else 'FAIL  ' end || '4d. the log says Ana asked to ban Keanne: ' || coalesce(msg, '(nothing)');
  select message into msg from public.admin_log where admin_id = sa and action = 'ban' and message like '%approved%' order by created_at desc limit 1;
  res := res || E'\n' || case when msg = 'Sam Super approved Ana Admin''s request to ban Keanne Reyes.' then 'PASS  ' else 'FAIL  ' end || '4e. the log says Sam approved it: ' || coalesce(msg, '(nothing)');
  select message into msg from public.admin_log where admin_id = sa and action = 'report' and message like '%declined%' order by created_at desc limit 1;
  res := res || E'\n' || case when msg like 'Sam Super declined Olive Other''s request to dismiss a report about the service "Logo design" by Keanne Reyes.' then 'PASS  ' else 'FAIL  ' end || '4f. the log says Sam declined the dismissal: ' || coalesce(msg, '(nothing)');

  raise exception E'ADMIN ROLES TESTS (rolled back)%', res;
end
$t$;
