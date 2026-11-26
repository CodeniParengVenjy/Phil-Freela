-- Tests for database/supabase_late_appeals_schema.sql. Paste into the Supabase
-- SQL Editor AFTER that file (or send both in one call as a trial). Everything
-- rolls back by itself: the block ends with an error whose text holds the
-- PASS/FAIL lines. It borrows existing accounts (a freelancer, a client and a
-- third person) and adds its own made-up projects, which roll back. The email
-- trigger on user_notifications is switched off inside the block (that rolls
-- back too), so nobody gets an email about the made-up appeals.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  fl uuid; cl uuid; other uuid;
  p_late uuid; p_fine uuid; p_accept uuid; p_button uuid; p_plain uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a_extra uuid;
  n integer;
  ok boolean;
  txt text;
  -- What the word filter makes of the test message (only the owner may call
  -- mask_bad_words, so it is worked out here, before acting as anyone).
  expected text := public.mask_bad_words('The client sent the files late, what the fuck.');
  out text := '';
begin
  alter table public.user_notifications disable trigger email_offline_on_notification;

  -- People (only read; everything they get here rolls back).
  select p.id into fl from public.profiles p where p.account_type = 'freelancer' limit 1;
  select p.id into cl from public.profiles p where p.account_type = 'client' and p.id <> fl limit 1;
  select p.id into other from public.profiles p where p.id not in (fl, cl) limit 1;
  if fl is null or cl is null or other is null then
    raise exception 'needs a freelancer, a client and one more account';
  end if;

  -- Projects between fl (freelancer) and cl (client), none of them sent.
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Test late one', today - 2) returning id into p_late;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Test not late', today + 3) returning id into p_fine;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Test late two', today - 1) returning id into p_accept;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Test late three', today - 5) returning id into p_button;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Test late four', today - 4) returning id into p_plain;

  -- A stranger and the client can't appeal.
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  begin
    perform public.appeal_late_block(p_late, 'Please let me apply again, I can explain.');
    out := out || '1 a stranger can''t appeal FAIL; ';
  exception when others then
    out := out || '1 a stranger can''t appeal PASS; ';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  begin
    perform public.appeal_late_block(p_late, 'Please let me apply again, I can explain.');
    out := out || '2 the client can''t appeal FAIL; ';
  exception when others then
    out := out || '2 the client can''t appeal PASS; ';
  end;
  reset role;

  -- As the freelancer.
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  begin
    perform public.appeal_late_block(p_fine, 'Please let me apply again, I can explain.');
    out := out || '3 a project that isn''t late can''t be appealed FAIL; ';
  exception when others then
    out := out || '3 a project that isn''t late can''t be appealed PASS; ';
  end;
  begin
    perform public.appeal_late_block(p_late, 'too short');
    out := out || '4 a message under 10 characters is refused FAIL; ';
  exception when others then
    out := out || '4 a message under 10 characters is refused PASS; ';
  end;
  begin
    perform public.appeal_late_block(p_late, repeat('a', 501));
    out := out || '5 a message over 500 characters is refused FAIL; ';
  exception when others then
    out := out || '5 a message over 500 characters is refused PASS; ';
  end;
  a1 := public.appeal_late_block(p_late, '  The client sent the files late, what the fuck.  ');
  select status = 'pending' and freelancer_id = fl into ok from public.late_appeals where id = a1;
  out := out || format('6 the appeal is saved as waiting = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  select message into txt from public.late_appeals where id = a1;
  ok := txt = expected and txt not like '%fuck%';
  out := out || format('7 trimmed and through the word filter = %s %s; ', txt, case when ok then 'PASS' else 'FAIL' end);
  begin
    perform public.appeal_late_block(p_late, 'A second one while the first waits.');
    out := out || '8 a second appeal while one waits is refused FAIL; ';
  exception when others then
    out := out || '8 a second appeal while one waits is refused PASS; ';
  end;
  begin
    insert into public.late_appeals (project_id, freelancer_id, message) values (p_late, fl, 'Straight into the table.');
    out := out || '9 writing to the table directly is refused FAIL; ';
  exception when insufficient_privilege then
    out := out || '9 writing to the table directly is refused PASS; ';
  end;
  begin
    update public.late_appeals set status = 'allowed' where id = a1;
    out := out || '10 changing an appeal directly is refused FAIL; ';
  exception when insufficient_privilege then
    out := out || '10 changing an appeal directly is refused PASS; ';
  end;
  begin
    perform public.answer_late_appeal(a1, true);
    out := out || '11 the freelancer can''t answer their own appeal FAIL; ';
  exception when others then
    out := out || '11 the freelancer can''t answer their own appeal PASS; ';
  end;
  select count(*) into n from public.late_appeals where project_id = p_late;
  out := out || format('12 the freelancer sees their appeal = %s %s; ', n, case when n = 1 then 'PASS' else 'FAIL' end);
  reset role;

  -- The client was told, with the message and a link to the project.
  select count(*) into n from public.user_notifications
  where user_id = cl and type = 'late_appeal_sent' and link = '/dashboard/project-details/' || p_late
    and message like '%' || txt || '%' and message like '%Test late one%';
  out := out || format('13 the client gets a notice with the message = %s %s; ', n, case when n = 1 then 'PASS' else 'FAIL' end);

  -- The client and a stranger reading.
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  select count(*) into n from public.late_appeals where project_id = p_late;
  out := out || format('14 the client sees the appeal = %s %s; ', n, case when n = 1 then 'PASS' else 'FAIL' end);
  begin
    perform public.cancel_late_appeal(a1);
    out := out || '15 the client can''t cancel the freelancer''s appeal FAIL; ';
  exception when others then
    out := out || '15 the client can''t cancel the freelancer''s appeal PASS; ';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  select count(*) into n from public.late_appeals where project_id = p_late;
  out := out || format('16 a stranger sees nothing = %s %s; ', n, case when n = 0 then 'PASS' else 'FAIL' end);
  begin
    perform public.answer_late_appeal(a1, true);
    out := out || '17 a stranger can''t answer FAIL; ';
  exception when others then
    out := out || '17 a stranger can''t answer PASS; ';
  end;
  reset role;

  -- The freelancer cancels, then appeals a second time.
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  perform public.cancel_late_appeal(a1);
  a2 := public.appeal_late_block(p_late, 'Second try: I have the files ready now.');
  reset role;
  select (select status from public.late_appeals where id = a1) = 'cancelled'
     and (select status from public.late_appeals where id = a2) = 'pending' into ok;
  out := out || format('18 cancelled, then a second appeal = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);

  -- The client declines the second one with a reason.
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  begin
    perform public.answer_late_appeal(a2, false, repeat('b', 301));
    out := out || '19 a reason over 300 characters is refused FAIL; ';
  exception when others then
    out := out || '19 a reason over 300 characters is refused PASS; ';
  end;
  perform public.answer_late_appeal(a2, false, '  You missed it by a week.  ');
  begin
    perform public.answer_late_appeal(a2, true);
    out := out || '20 an answered appeal can''t be answered again FAIL; ';
  exception when others then
    out := out || '20 an answered appeal can''t be answered again PASS; ';
  end;
  reset role;
  select status = 'declined' and client_note = 'You missed it by a week.' and answered_at is not null into ok
  from public.late_appeals where id = a2;
  out := out || format('21 declined with the trimmed reason = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  select count(*) into n from public.user_notifications
  where user_id = fl and type = 'late_appeal_declined' and link = '/dashboard/project-details/' || p_late
    and message like '%You missed it by a week.%' and message like '%both appeals%';
  out := out || format('22 the freelancer is told, both appeals used = %s %s; ', n, case when n = 1 then 'PASS' else 'FAIL' end);
  select late_allowed_at is null into ok from public.projects where id = p_late;
  out := out || format('23 still blocked after the decline = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);

  -- No third appeal.
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  begin
    perform public.appeal_late_block(p_late, 'Third try, please let me back in.');
    out := out || '24 a third appeal is refused FAIL; ';
  exception when others then
    out := out || '24 a third appeal is refused PASS; ';
  end;
  -- Appeals on two other late projects.
  a3 := public.appeal_late_block(p_accept, 'I was sick that week, here is why.');
  a4 := public.appeal_late_block(p_button, 'The brief changed two days before.');
  reset role;

  -- A first decline (one appeal used) says one more is possible.
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  a_extra := public.appeal_late_block(p_plain, 'Please, it will not happen again.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  perform public.answer_late_appeal(a_extra, false);
  reset role;
  select count(*) into n from public.user_notifications
  where user_id = fl and type = 'late_appeal_declined' and link = '/dashboard/project-details/' || p_plain
    and message like '%one more time%' and message not like '%Reason:%';
  out := out || format('25 first decline, no reason: one more appeal left = %s %s; ', n, case when n = 1 then 'PASS' else 'FAIL' end);

  -- The client allows one appeal. Since 2026-11-26 (supabase_late_allow_all_schema.sql)
  -- that lifts the block from EVERY late project with this client (p_late,
  -- p_accept, p_button, p_plain), answers the other waiting appeal (a4) and
  -- tells the freelancer once.
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  perform public.answer_late_appeal(a3, true);
  -- The plain "Allow to apply again" button afterwards does nothing more (and no error).
  perform public.allow_late_freelancer(p_button);
  perform public.allow_late_freelancer(p_plain);
  reset role;
  select (select status from public.late_appeals where id = a3) = 'allowed'
     and (select count(*) from public.projects where id in (p_late, p_accept, p_button, p_plain) and late_allowed_at is not null) = 4 into ok;
  out := out || format('26 allowing the appeal lifts the block from all 4 late projects = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  select (select status from public.late_appeals where id = a4) = 'allowed' into ok;
  out := out || format('27 the waiting appeal on another late project counts as allowed = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  select count(*) into n from public.user_notifications
  where user_id = fl and type = 'late_appeal_allowed' and link = '/dashboard/project-details/' || p_accept
    and message like '%the late projects %';
  out := out || format('28 the freelancer is told once, naming the projects = %s %s; ', n, case when n = 1 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.user_notifications
  where user_id = fl and type = 'late_appeal_allowed'
    and link in ('/dashboard/project-details/' || p_late, '/dashboard/project-details/' || p_accept,
                 '/dashboard/project-details/' || p_button, '/dashboard/project-details/' || p_plain);
  out := out || format('29 pressing Allow again tells nobody again = %s %s; ', n, case when n = 1 then 'PASS' else 'FAIL' end);

  -- Nothing left to appeal once allowed.
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  begin
    perform public.appeal_late_block(p_accept, 'Appealing again after being allowed.');
    out := out || '30 no appeal once allowed FAIL; ';
  exception when others then
    out := out || '30 no appeal once allowed PASS; ';
  end;
  reset role;

  -- Signed-out users can't call the functions or read the table.
  ok := not (has_function_privilege('anon', 'public.appeal_late_block(uuid, text)', 'execute')
          or has_function_privilege('anon', 'public.answer_late_appeal(uuid, boolean, text)', 'execute')
          or has_function_privilege('anon', 'public.cancel_late_appeal(uuid)', 'execute')
          or has_table_privilege('anon', 'public.late_appeals', 'select'));
  out := out || format('31 signed-out users are kept out = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  ok := has_function_privilege('authenticated', 'public.appeal_late_block(uuid, text)', 'execute')
        and has_function_privilege('authenticated', 'public.answer_late_appeal(uuid, boolean, text)', 'execute')
        and has_function_privilege('authenticated', 'public.cancel_late_appeal(uuid)', 'execute');
  out := out || format('32 signed-in users can call them = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);

  raise exception 'RESULTS: %', out;
end;
$$;
