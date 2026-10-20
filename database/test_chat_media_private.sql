-- Test for supabase_chat_media_private_schema.sql. Send the schema file and
-- this block together in ONE call to try it before applying (the error at the
-- end rolls the schema back too), or run this alone in the Supabase SQL Editor
-- after the schema file. It BORROWS a real chat (so no user numbers are used
-- up), adds made-up messages, and ends with an error that carries the
-- PASS/FAIL list; that error rolls everything back, so nothing is left behind.
-- Not covered here: actually removing a stored file with the new unsend rule
-- (that needs statements on the storage tables); only that the rule exists.
do $t$
declare
  res text := '';
  mc uuid;                       -- a real chat, borrowed
  a uuid;                        -- one person in it
  b uuid;                        -- the other person in it
  bad int;
  ok boolean;
  seq_before bigint;
  seq_after bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  select c.id, c.user_a, c.user_b into mc, a, b
    from public.conversations c
   where not exists (select 1 from public.user_suspensions s where s.user_id in (c.user_a, c.user_b))
   limit 1;
  if mc is null then
    raise exception 'The test needs a chat between two people who are not suspended.';
  end if;

  -- The made-up messages below would each email an offline person.
  alter table public.messages disable trigger email_offline_on_message;

  -- 1. Every older photo/video message now holds a path, not a link.
  select count(*) into bad from public.messages
   where attachment_type in ('image', 'video')
     and attachment_url !~ ('^' || conversation_id::text || '/' || sender_id::text || '-[0-9]+\.[a-z0-9]+$');
  res := res || E'\n' || case when bad = 0 then 'PASS  ' else 'FAIL  ' end || '1. every photo/video message holds a path (' || bad || ' that do not)';

  -- 2. Signed in as person A.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  begin
    insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type)
    values (mc, a, mc::text || '/' || a::text || '-1700000000000.jpeg', 'image');
    res := res || E'\nPASS  2. a photo with the sender''s own file path is accepted';
  exception when others then
    res := res || E'\nFAIL  2. a correct photo message was refused (' || sqlerrm || ')';
  end;

  begin
    insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type)
    values (mc, a, 'https://example.invalid/pixel.png', 'image');
    res := res || E'\nFAIL  3. a photo hosted on another website was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm like '%messages_chat_media_path_check%' then 'PASS  ' else 'FAIL  ' end
      || '3. a photo hosted on another website is refused (' || sqlerrm || ')';
  end;

  begin
    insert into public.messages (conversation_id, sender_id, attachment_url, attachment_type)
    values (mc, a, mc::text || '/' || b::text || '-1700000000000.mp4', 'video');
    res := res || E'\nFAIL  4. a video that points at the other person''s file was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm like '%messages_chat_media_path_check%' then 'PASS  ' else 'FAIL  ' end
      || '4. a video that points at the other person''s file is refused (' || sqlerrm || ')';
  end;

  begin
    insert into public.messages (conversation_id, sender_id, body)
    values (mc, a, 'A plain text message still works.');
    res := res || E'\nPASS  5. a plain text message is still accepted';
  exception when others then
    res := res || E'\nFAIL  5. a text message was refused (' || sqlerrm || ')';
  end;

  -- 6-8. Signed out of the test person again.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  select not coalesce(public, true) into ok from storage.buckets where id = 'chat-attachments';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '6. the chat-attachments bucket is private';

  select count(*) = 1 into ok from pg_policy p
   where p.polrelid = 'storage.objects'::regclass
     and p.polname like 'chat-attachments: senders can%their own'
     and p.polcmd = 'd';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '7. the rule that lets a sender unsend their own photo file exists';

  ok := not has_function_privilege('anon', 'public.is_admin_email(text)', 'execute')
        and not has_function_privilege('authenticated', 'public.is_admin_email(text)', 'execute');
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '8. is_admin_email() cannot be asked by anyone through the website';

  select last_value into seq_after from public.user_number_seq;
  res := res || E'\n' || case when seq_before = seq_after then 'PASS  ' else 'FAIL  ' end
    || '9. the user-number counter did not move (' || seq_before || ' -> ' || seq_after || ')';

  raise exception E'RESULTS (rolled back, nothing was saved):%', res;
end
$t$;
