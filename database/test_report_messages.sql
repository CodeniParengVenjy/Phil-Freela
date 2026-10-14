-- Test for supabase_report_messages_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file (or send the schema file
-- and this block together in one call to try it before applying: the error at
-- the end rolls the schema back too). It BORROWS real accounts and a real chat
-- (the two people of one conversation, a third person, a super admin and a
-- regular admin) only to act as them, and adds a few test messages to that chat,
-- so nothing about them changes and no user numbers are used up. It turns the
-- "email me when I'm offline" trigger of the messages table off for its own
-- call, so a test message can't email anyone. It ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing is
-- left behind (the trigger comes back on too).
--
-- Not tested here: that a copy goes away when its report is removed (the foreign
-- key is checked instead, 1d), that a message unsent later leaves its copy (the
-- copy has no link to the message, 1e, and editing it later changes nothing,
-- 3h), and the line a call leaves in a chat (is_call); each is one rule that
-- does not need a removal to be seen.
do $t$
declare
  res text := '';
  ok boolean;
  n int;
  msg text;
  conv uuid; conv2 uuid;       -- the chat of the two people, and another chat
  ra uuid; rb uuid; rc uuid;   -- ra reports rb; rc is a third person
  sa uuid; adm uuid;           -- a super admin and a regular admin
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid;
  far_msg uuid;                -- a message of the other chat
  ra2 uuid; rb2 uuid;          -- the two people of that other chat (for the check that no message is flagged)
  rep uuid;
begin
  select c.id, c.user_a, c.user_b into conv, ra, rb
  from public.conversations c
  where not public.is_suspended(c.user_a)
    and not exists (select 1 from public.reports r where r.reporter_id = c.user_a and r.target_type = 'user' and r.target_id = c.user_b and r.status = 'pending')
  order by c.created_at limit 1;
  select p.id into rc from public.profiles p
  where p.id not in (ra, rb) and not public.is_suspended(p.id)
    and not exists (select 1 from public.reports r where r.status = 'pending' and r.target_type = 'user'
                    and ((r.reporter_id = ra and r.target_id = p.id) or (r.reporter_id = p.id and r.target_id = rb)))
  order by p.created_at limit 1;
  select id into conv2 from public.conversations where id <> conv order by (user_a = ra or user_b = ra) desc, created_at limit 1;
  -- Whoever started that other chat can report the other person (unless they are suspended, or already have a waiting report about them).
  select user_a, user_b into ra2, rb2 from public.conversations
  where id = conv2 and not public.is_suspended(user_a) and not (user_a = rc and user_b = rb)
    and not exists (select 1 from public.reports r where r.reporter_id = user_a and r.target_type = 'user' and r.target_id = user_b and r.status = 'pending');
  select id into sa from public.admins where role = 'super_admin' and not must_change_password limit 1;
  select id into adm from public.admins where role = 'admin' and not must_change_password limit 1;
  if conv is null or rc is null or conv2 is null or sa is null or adm is null then
    raise exception 'This test borrows a chat, a third person, a super admin and a regular admin from the database. One of them is missing.';
  end if;

  -- Test messages in the borrowed chat (as the table owner), and one in another chat.
  alter table public.messages disable trigger email_offline_on_message;
  insert into public.messages (conversation_id, sender_id, body) values (conv, ra, 'Hi, is the offer still open?') returning id into m1;
  insert into public.messages (conversation_id, sender_id, body) values (conv, rb, 'Send me your files first, then I will pay you later.') returning id into m2;
  insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type) values (conv, rb, 'https://example.invalid/photo.jpg', 'image') returning id into m3;
  insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type, attachment_name, attachment_size)
    values (conv, rb, conv::text || '/' || rb::text || '-1.pdf', 'file', 'contract.pdf', 1234) returning id into m4;
  insert into public.messages (conversation_id, sender_id, body, edited_at) values (conv, rb, 'Fine, you can pay after.', now()) returning id into m5;
  insert into public.messages (conversation_id, sender_id, body) values (conv, ra, repeat('a', 3000)) returning id into m6;
  insert into public.messages (conversation_id, sender_id, body)
    select conv2, user_a, 'A message from another chat' from public.conversations where id = conv2 returning id into far_msg;

  -- ===== The table and its rules =====
  select relrowsecurity into ok from pg_class where oid = 'public.report_messages'::regclass;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1a. row level security is on';
  select count(*) = 1 and bool_and(cmd = 'SELECT') into ok from pg_policies where schemaname = 'public' and tablename = 'report_messages';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1b. one rule only: read (and it is the admins'')';
  select exists (select 1 from pg_constraint where conname = 'report_messages_one_copy' and contype = 'u') into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1c. one copy of a message per report is a database rule';
  select exists (select 1 from pg_constraint where conrelid = 'public.report_messages'::regclass and contype = 'f' and confrelid = 'public.reports'::regclass and confdeltype = 'c') into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1d. the copies go with their report (the foreign key cascades)';
  select not exists (select 1 from pg_constraint where conrelid = 'public.report_messages'::regclass and contype = 'f' and confrelid = 'public.messages'::regclass) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1e. a copy has no link to the chat message, so unsending that can''t remove it';
  select not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'report_messages' and grantee = 'anon')
     and not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'report_messages' and grantee = 'authenticated' and privilege_type <> 'SELECT') into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1f. signed-in people may only read the table, signed-out visitors nothing';
  select exists (select 1 from pg_constraint where conrelid = 'public.reports'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%chat_message_ids%') into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1g. a report can carry at most 50 messages (a rule on the column)';

  -- ===== Refusals: no report is saved =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', ra::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ra, 'role', 'authenticated')::text, true);

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids) values (ra, 'user', rb, 'harassment', array[m1, far_msg]);
    res := res || E'\nFAIL  2a. a message from another chat was accepted';
  exception when others then
    msg := sqlerrm;
    res := res || E'\n' || case when msg like 'Some of those messages aren''t in your chat with this person any more%' then 'PASS  ' else 'FAIL  ' end || '2a. a message from another chat is refused in plain words (' || msg || ')';
  end;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids) values (ra, 'user', rb, 'harassment', array[gen_random_uuid()]);
    res := res || E'\nFAIL  2b. a made-up message id was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm like 'Some of those messages aren''t in your chat with this person any more%' then 'PASS  ' else 'FAIL  ' end || '2b. a made-up message id is refused';
  end;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids) values (ra, 'service', gen_random_uuid(), 'spam', array[m1]);
    res := res || E'\nFAIL  2c. messages on a report about a service were accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm = 'Chat messages can only be sent with a report about a person.' then 'PASS  ' else 'FAIL  ' end || '2c. messages can only go with a report about a person (' || sqlerrm || ')';
  end;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids)
    values (ra, 'user', rb, 'harassment', array(select gen_random_uuid() from generate_series(1, 51)));
    res := res || E'\nFAIL  2d. 51 messages were accepted';
  exception when check_violation then
    res := res || E'\nPASS  2d. more than 50 messages are refused';
  end;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids) values (ra, 'user', rc, 'harassment', array[m2]);
    res := res || E'\nFAIL  2e. a message from the chat with someone else was attached to a report about this person';
  exception when others then
    res := res || E'\n' || case when sqlerrm like 'Some of those messages aren''t in your chat with this person any more%' then 'PASS  ' else 'FAIL  ' end || '2e. messages of your chat with one person can''t go with a report about another';
  end;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids, flagged_message_id) values (ra, 'user', rb, 'harassment', array[m1, m2], m3);
    res := res || E'\nFAIL  2h. a flagged message that is not among the messages sent was accepted';
  exception when check_violation then
    res := res || E'\nPASS  2h. the flagged message must be one of the messages sent';
  end;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, flagged_message_id) values (ra, 'user', rb, 'harassment', m2);
    res := res || E'\nFAIL  2i. a flagged message with no messages sent was accepted';
  exception when check_violation then
    res := res || E'\nPASS  2i. a flagged message with no messages sent is refused';
  end;

  perform set_config('request.jwt.claim.sub', rc::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', rc, 'role', 'authenticated')::text, true);
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids) values (rc, 'user', rb, 'harassment', array[m2]);
    res := res || E'\nFAIL  2f. someone outside the chat attached its messages';
  exception when others then
    res := res || E'\n' || case when sqlerrm like 'Some of those messages aren''t in your chat with this person any more%' then 'PASS  ' else 'FAIL  ' end || '2f. someone who isn''t in the chat can''t attach its messages';
  end;

  reset role;
  select count(*) = 0 into ok from public.reports where reporter_id in (ra, rc) and cardinality(chat_message_ids) > 0;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '2g. none of the refused reports was saved';

  -- ===== A report with its messages =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', ra::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ra, 'role', 'authenticated')::text, true);
  rep := gen_random_uuid();
  begin
    -- m1 is listed twice on purpose; m2 is the message that was right-clicked.
    insert into public.reports (id, reporter_id, target_type, target_id, reason, details, chat_message_ids, flagged_message_id)
    values (rep, ra, 'user', rb, 'scam', 'test', array[m6, m1, m2, m3, m4, m5, m1], m2);
    res := res || E'\nPASS  3a. a report with 7 ids (one repeated) and a flagged message is saved';
  exception when others then
    res := res || E'\nFAIL  3a. the report with its messages was refused (' || sqlerrm || ')';
  end;

  reset role;
  select count(*) = 6 into ok from public.report_messages where report_id = rep;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3b. six copies were made (the repeated id counts once)';
  select bool_and(case when message_id in (m1, m6) then from_reporter else not from_reporter end) and count(*) = 6 into ok from public.report_messages where report_id = rep;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3c. each copy says whether the reporter or the reported person wrote it';
  select (select body from public.report_messages where report_id = rep and message_id = m2) = 'Send me your files first, then I will pay you later.'
     and (select attachment_type is null and not edited and not is_call from public.report_messages where report_id = rep and message_id = m2) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3d. a text message keeps its words';
  select (select attachment_type = 'image' and body is null and attachment_name is null from public.report_messages where report_id = rep and message_id = m3)
     and (select attachment_type = 'file' and body is null and attachment_name = 'contract.pdf' from public.report_messages where report_id = rep and message_id = m4) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3e. a photo and a file keep only what they are (the file''s name too), not the file';
  select (select edited from public.report_messages where report_id = rep and message_id = m5)
     and not (select edited from public.report_messages where report_id = rep and message_id = m1) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3f. an edited message is marked as edited';
  select (select char_length(body) from public.report_messages where report_id = rep and message_id = m6) = 2000 into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3g. a 3,000-character message is copied cut at 2,000';
  update public.messages set body = 'changed after the report' where id = m2;
  select (select body from public.report_messages where report_id = rep and message_id = m2) = 'Send me your files first, then I will pay you later.' into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3h. editing the message afterwards doesn''t change the copy';
  select bool_and(r.sent_at = m.created_at) and count(*) = 6 into ok
  from public.report_messages r join public.messages m on m.id = r.message_id where r.report_id = rep;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3i. each copy keeps the time it was sent';
  select count(*) filter (where flagged) = 1 and bool_and(flagged = (message_id = m2)) into ok from public.report_messages where report_id = rep;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '3j. only the flagged message (m2) is marked flagged, none of the others';

  -- ===== Who can read the copies =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', ra::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ra, 'role', 'authenticated')::text, true);
  select count(*) = 0 into ok from public.report_messages;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '4a. the reporter can''t read the copies back';
  perform set_config('request.jwt.claim.sub', rb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', rb, 'role', 'authenticated')::text, true);
  select count(*) = 0 into ok from public.report_messages;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '4b. the person reported can''t read them';
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) = 6 into ok from public.report_messages where report_id = rep;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '4c. a regular admin reads them';
  perform set_config('request.jwt.claim.sub', sa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  select count(*) = 6 into ok from public.report_messages where report_id = rep;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '4d. a super admin reads them';

  perform set_config('request.jwt.claim.sub', ra::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ra, 'role', 'authenticated')::text, true);
  begin
    insert into public.report_messages (report_id, message_id, from_reporter, body, sent_at) values (rep, gen_random_uuid(), true, 'made up', now());
    res := res || E'\nFAIL  4e. a person could write a copy straight into the table';
  exception when insufficient_privilege then
    res := res || E'\nPASS  4e. nobody can write a copy straight into the table';
  end;
  begin
    update public.report_messages set body = 'changed' where report_id = rep;
    res := res || E'\nFAIL  4f. a person could change a copy';
  exception when insufficient_privilege then
    res := res || E'\nPASS  4f. nobody can change a copy';
  end;

  reset role;
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform count(*) from public.report_messages;
    res := res || E'\nFAIL  4g. a signed-out visitor could read the copies';
  exception when insufficient_privilege then
    res := res || E'\nPASS  4g. a signed-out visitor can''t read them';
  end;

  -- ===== The rest of reporting works as before =====
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', rc::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', rc, 'role', 'authenticated')::text, true);
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, details) values (rc, 'user', rb, 'spam', 'a report with no messages');
    res := res || E'\nPASS  5a. a report with no messages still saves';
  exception when others then
    res := res || E'\nFAIL  5a. a report with no messages was refused (' || sqlerrm || ')';
  end;
  perform set_config('request.jwt.claim.sub', ra::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ra, 'role', 'authenticated')::text, true);
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids) values (ra, 'user', rb, 'harassment', array[m1]);
    res := res || E'\nFAIL  5b. a second waiting report about the same person was accepted';
  exception when unique_violation then
    res := res || E'\nPASS  5b. one waiting report per person is still the rule';
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) = 6 into ok from public.report_messages;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '5c. in all, only the one saved report made copies';

  -- A report with messages but no flagged one (from the other chat's first person).
  if ra2 is null then
    res := res || E'\nSKIP  5d. no one in the other chat could report just now (suspended, or a report already waiting)';
  else
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', ra2::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ra2, 'role', 'authenticated')::text, true);
    begin
      insert into public.reports (reporter_id, target_type, target_id, reason, chat_message_ids) values (ra2, 'user', rb2, 'spam', array[far_msg]);
      reset role;
      select count(*) = 1 and not bool_or(flagged) into ok from public.report_messages where message_id = far_msg;
      res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '5d. a report with messages but no flagged one marks none of them';
    exception when others then
      reset role;
      res := res || E'\nFAIL  5d. a report from the other chat was refused (' || sqlerrm || ')';
    end;
  end if;

  raise exception E'REPORT MESSAGE TESTS (rolled back)%', res;
end
$t$;
