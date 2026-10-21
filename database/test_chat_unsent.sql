-- Test for supabase_chat_unsent_schema.sql. Run it AFTER the schema file (or send
-- the schema file and this block together in one call). It ends with an error on
-- purpose, which rolls everything back; the PASS / FAIL lines are in that error.
--
-- It borrows an existing chat between two people who are not suspended from
-- messaging (no accounts are made, so no user numbers are used up), adds its own
-- test messages, and turns the offline-email trigger off for itself so nobody is
-- emailed.

do $$
declare
  conv record;
  a uuid;   -- the first person of the borrowed chat
  b uuid;   -- the second person
  m_text uuid;      -- a: plain text
  m_text2 uuid;     -- a: plain text (unsent by editing the table directly)
  m_img uuid;       -- a: a photo
  m_b uuid;         -- b: the newest message of the chat
  m_unread uuid;    -- a: for the unread number
  call_msg record;  -- a call line, if the database has one
  out text := '';
  n_before int;
  n_after int;
  r record;
  prev text;
begin
  select c.* into conv
    from public.conversations c
    where not public.is_messaging_blocked(c.user_a) and not public.is_messaging_blocked(c.user_b)
    order by c.created_at
    limit 1;
  if conv.id is null then
    raise exception 'No chat with two people who can message was found to borrow.';
  end if;
  a := conv.user_a;
  b := conv.user_b;

  alter table public.messages disable trigger email_offline_on_message;

  -- b has read everything up to yesterday, so new messages from a are unread.
  update public.conversations
    set user_b_last_read_at = now() - interval '1 day', user_a_last_read_at = now() - interval '1 day'
    where id = conv.id;

  -- Test messages as the owner. The dates are in the future so they are the
  -- newest of the chat; the last one (from b) is the newest of all.
  insert into public.messages (conversation_id, sender_id, body, created_at)
    values (conv.id, a, 'test text one', now() + interval '1 day') returning id into m_text;
  insert into public.messages (conversation_id, sender_id, body, created_at)
    values (conv.id, a, 'test text two', now() + interval '1 day 1 minute') returning id into m_text2;
  insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type, created_at)
    values (conv.id, a, conv.id::text || '/' || a::text || '-123456.png', 'image', now() + interval '1 day 2 minutes')
    returning id into m_img;
  insert into public.messages (conversation_id, sender_id, body, created_at)
    values (conv.id, b, 'test from the other person', now() + interval '1 day 3 minutes') returning id into m_b;
  select last_message_preview into prev from public.conversations where id = conv.id;
  out := out || case when prev = 'test from the other person' then 'PASS' else 'FAIL' end
         || ' setup: the preview is the newest message (' || coalesce(prev, 'null') || ')' || E'\n';

  -- 1. Someone else can't unsend my message.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    perform public.unsend_message(m_text);
    out := out || 'FAIL the other person unsent my message' || E'\n';
  exception when others then
    out := out || case when sqlerrm like '%can''t be unsent%' then 'PASS' else 'FAIL' end
           || ' the other person can''t unsend my message: ' || sqlerrm || E'\n';
  end;

  -- 2. I can unsend my own text message: it stays, empty, with the time.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.unsend_message(m_text);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select * into r from public.messages where id = m_text;
  out := out || case when r.id is not null and r.unsent_at is not null and r.body is null and r.edited_at is null
                     then 'PASS' else 'FAIL' end
         || ' unsending keeps the row, with the time, and empties the text' || E'\n';

  -- 3. It wasn't the newest message, so the Inbox preview stays as it was.
  select last_message_preview into prev from public.conversations where id = conv.id;
  out := out || case when prev = 'test from the other person' then 'PASS' else 'FAIL' end
         || ' an older unsent message leaves the preview alone (' || coalesce(prev, 'null') || ')' || E'\n';

  -- 4. A photo: the file link and type are emptied too.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.unsend_message(m_img);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select * into r from public.messages where id = m_img;
  out := out || case when r.unsent_at is not null and r.attachment_url is null and r.attachment_type is null
                          and r.attachment_name is null and r.attachment_size is null
                     then 'PASS' else 'FAIL' end
         || ' unsending a photo empties its file link and type' || E'\n';

  -- 5. Unsending again is quietly fine.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.unsend_message(m_text);
    out := out || 'PASS unsending twice gives no error' || E'\n';
  exception when others then
    out := out || 'FAIL unsending twice: ' || sqlerrm || E'\n';
  end;

  -- 6. An unsent message can't be edited, and can't be brought back.
  begin
    update public.messages set body = 'back again', edited_at = now() where id = m_text;
    out := out || 'FAIL an unsent message was edited' || E'\n';
  exception when others then
    out := out || case when sqlerrm like '%unsent message can''t be changed%' then 'PASS' else 'FAIL' end
           || ' an unsent message can''t be edited: ' || sqlerrm || E'\n';
  end;
  begin
    update public.messages set unsent_at = null where id = m_text;
    out := out || 'FAIL an unsent message was brought back' || E'\n';
  exception when others then
    out := out || case when sqlerrm like '%unsent message can''t be changed%' then 'PASS' else 'FAIL' end
           || ' an unsent message can''t be brought back: ' || sqlerrm || E'\n';
  end;

  -- 7. Setting unsent_at straight on the table does the same as the button
  -- (the database's own time, and the content is emptied).
  update public.messages set unsent_at = '2000-01-01' where id = m_text2;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select * into r from public.messages where id = m_text2;
  out := out || case when r.unsent_at > now() - interval '1 minute' and r.body is null then 'PASS' else 'FAIL' end
         || ' unsent_at set straight on the table is the database''s time and empties the text' || E'\n';

  -- 8. A normal message can still be edited, but its file link can't be changed.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  update public.messages set body = 'edited by me', edited_at = now() where id = m_b;
  begin
    update public.messages set attachment_url = 'somewhere/else.png', attachment_type = 'image' where id = m_b;
    out := out || 'FAIL a file link was added to a message' || E'\n';
  exception when others then
    out := out || case when sqlerrm like '%Only the text of a message can be edited%' then 'PASS' else 'FAIL' end
           || ' editing text works, adding a file link is refused: ' || sqlerrm || E'\n';
  end;

  -- 9. The newest message unsent: the Inbox preview says so.
  perform public.unsend_message(m_b);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select last_message_preview into prev from public.conversations where id = conv.id;
  out := out || case when prev = 'Message unsent' then 'PASS' else 'FAIL' end
         || ' the newest message unsent: the preview says so (' || coalesce(prev, 'null') || ')' || E'\n';

  -- 10. A call line can't be unsent.
  select m.id, m.sender_id into call_msg from public.messages m where m.call_id is not null limit 1;
  if call_msg.id is null then
    out := out || 'SKIP no call line in the database to try' || E'\n';
  else
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', call_msg.sender_id, 'role', 'authenticated')::text, true);
    begin
      perform public.unsend_message(call_msg.id);
      out := out || 'FAIL a call line was unsent' || E'\n';
    exception when others then
      out := out || case when sqlerrm like '%can''t be unsent%' then 'PASS' else 'FAIL' end
             || ' a call line can''t be unsent: ' || sqlerrm || E'\n';
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end if;

  -- 11. The table's own rules: unsent_at with text left in is refused, an empty
  -- unsent row is fine, and an empty row that isn't unsent is still refused.
  begin
    insert into public.messages (conversation_id, sender_id, body, unsent_at)
      values (conv.id, a, 'still here', now());
    out := out || 'FAIL an unsent message with text was saved' || E'\n';
  exception when check_violation then
    out := out || 'PASS an unsent message that still has text is refused' || E'\n';
  end;
  begin
    insert into public.messages (conversation_id, sender_id, unsent_at) values (conv.id, a, now());
    out := out || 'PASS an empty unsent message is accepted' || E'\n';
  exception when others then
    out := out || 'FAIL an empty unsent message was refused: ' || sqlerrm || E'\n';
  end;
  begin
    insert into public.messages (conversation_id, sender_id) values (conv.id, a);
    out := out || 'FAIL an empty message that is not unsent was saved' || E'\n';
  exception when check_violation then
    out := out || 'PASS an empty message that is not unsent is still refused' || E'\n';
  end;

  -- 12. The unread number does not count an unsent message.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select public.get_unread_message_count() into n_before;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.messages (conversation_id, sender_id, body, created_at)
    values (conv.id, a, 'one more', now() + interval '2 days') returning id into m_unread;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select public.get_unread_message_count() into n_after;
  out := out || case when n_after = n_before + 1 then 'PASS' else 'FAIL' end
         || ' a new message is unread (' || n_before || ' -> ' || n_after || ')' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.unsend_message(m_unread);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select public.get_unread_message_count() into n_after;
  out := out || case when n_after = n_before then 'PASS' else 'FAIL' end
         || ' once unsent it is no longer counted (' || n_before || ' -> ' || n_after || ')' || E'\n';

  -- 13. Marking messages as delivered still works on an unsent one.
  begin
    perform public.mark_messages_delivered();
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    select * into r from public.messages where id = m_unread;
    out := out || case when r.delivered_at is not null and r.unsent_at is not null then 'PASS' else 'FAIL' end
           || ' delivered time is still set on an unsent message' || E'\n';
  exception when others then
    out := out || 'FAIL marking delivered: ' || sqlerrm || E'\n';
  end;

  -- 14. Signed-out visitors can't call it.
  reset role;
  set local role anon;
  begin
    perform public.unsend_message(m_text);
    out := out || 'FAIL a signed-out visitor called unsend_message' || E'\n';
  exception when insufficient_privilege then
    out := out || 'PASS a signed-out visitor can''t call unsend_message' || E'\n';
  end;
  reset role;

  raise exception E'\n%', out;
end;
$$;
