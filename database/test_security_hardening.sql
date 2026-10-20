-- Test for supabase_security_hardening_schema.sql. Send the schema file and
-- this block together in ONE call to try it before applying (the error at the
-- end rolls the schema back too), or run this alone in the Supabase SQL Editor
-- after the schema file. It BORROWS real accounts, chats and one message (so no
-- user numbers are used up), adds a made-up service, and ends with an error
-- that carries the PASS/FAIL list; that error rolls everything back, so
-- nothing is left behind.
do $t$
declare
  res text := '';
  fr uuid;                       -- a real freelancer, borrowed (owns the made-up service)
  svc uuid;                      -- made-up service
  m uuid;                        -- a real message, borrowed
  mc uuid;                       -- the chat that message is in
  ms uuid;                       -- who sent it
  mr uuid;                       -- the other person in that chat
  oc uuid;                       -- another chat
  q uuid;                        -- a real user with many people they have not chatted with yet
  partner uuid;
  made int := 0;
  msg text;
  seq_before bigint;
  seq_after bigint;
  ok boolean;
begin
  select last_value into seq_before from public.user_number_seq;

  select p.id into fr from public.profiles p
   where p.account_type = 'freelancer'
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not exists (select 1 from public.user_suspensions s where s.user_id = p.id) limit 1;

  select x.id, x.conversation_id, x.sender_id into m, mc, ms
    from public.messages x
   where x.attachment_url is null and x.call_id is null and x.body is not null limit 1;
  select case when c.user_a = ms then c.user_b else c.user_a end into mr
    from public.conversations c where c.id = mc;
  select c.id into oc from public.conversations c where c.id <> mc limit 1;

  select p.id into q from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id)
     and not exists (select 1 from public.user_suspensions s where s.user_id = p.id)
     and (select count(*) from public.profiles o
           where o.id <> p.id
             and not exists (select 1 from public.conversations c
                              where least(c.user_a, c.user_b) = least(p.id, o.id)
                                and greatest(c.user_a, c.user_b) = greatest(p.id, o.id))) >= 22
   limit 1;

  if fr is null or m is null or oc is null or q is null then
    raise exception 'The test needs a freelancer, a message, two chats and a user with 22 free chat partners (found: % % % %).', fr, m, oc, q;
  end if;

  insert into public.services (freelancer_id, title, category, description)
  values (fr, 'Hardening test service', 'Design', 'First text.') returning id into svc;

  -- 1. marketplace-images: a signed-in user can no longer upload.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', fr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('marketplace-images', fr::text || '/hardening-test.jpg', fr);
    res := res || E'\nFAIL  1. an upload to marketplace-images was accepted';
  exception when others then
    res := res || E'\nPASS  1. an upload to marketplace-images is refused (' || sqlerrm || ')';
  end;

  -- 2. services.image_url: the owner cannot point it at a picture.
  begin
    update public.services set image_url = 'https://example.invalid/pic.png' where id = svc;
    res := res || E'\nFAIL  2. the owner set image_url to an outside link';
  exception when others then
    res := res || E'\n' || case when sqlerrm like '%upload form%' then 'PASS  ' else 'FAIL  ' end
      || '2. the owner cannot set image_url (' || sqlerrm || ')';
  end;

  -- 3. ... nor on a new service; but the other columns still save, and clearing it is fine.
  begin
    insert into public.services (freelancer_id, title, category, description, image_url)
    values (fr, 'Hardening test B', 'Design', 'Text.', 'https://example.invalid/pic.png');
    res := res || E'\nFAIL  3. a new service with an outside image_url was accepted';
  exception when others then
    res := res || E'\n' || case when sqlerrm like '%upload form%' then 'PASS  ' else 'FAIL  ' end
      || '3. a new service cannot start with an image_url (' || sqlerrm || ')';
  end;
  begin
    update public.services set title = 'Hardening test renamed', image_url = null where id = svc;
    res := res || E'\nPASS  4. the owner can still save the title and clear image_url';
  exception when others then
    res := res || E'\nFAIL  4. saving the title / clearing image_url was refused (' || sqlerrm || ')';
  end;

  -- 5. The AI service (no signed-in user) can still set it.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    update public.services set image_url = 'https://example.invalid/ai.png' where id = svc;
    res := res || E'\nPASS  5. a call with no signed-in user (the AI service) can still set image_url';
  exception when others then
    res := res || E'\nFAIL  5. the AI service path was refused (' || sqlerrm || ')';
  end;

  -- 6. A sender edits the text of their own message.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', ms::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ms, 'role', 'authenticated')::text, true);
  begin
    update public.messages set body = body || ' ', edited_at = now() where id = m;
    res := res || E'\nPASS  6. the sender can still edit the text of their message';
  exception when others then
    res := res || E'\nFAIL  6. editing the text was refused (' || sqlerrm || ')';
  end;

  -- 7. ... but not move it, swap the sender, change the time or add an attachment.
  begin
    update public.messages set conversation_id = oc where id = m;
    res := res || E'\nFAIL  7a. a message was moved to another chat';
  exception when others then
    res := res || E'\n' || case when sqlerrm like '%Only the text%' then 'PASS  ' else 'FAIL  ' end || '7a. moving a message to another chat is refused (' || sqlerrm || ')';
  end;
  begin
    update public.messages set attachment_url = 'https://example.invalid/pixel.png', attachment_type = 'image' where id = m;
    res := res || E'\nFAIL  7b. an attachment link was added to a sent message';
  exception when others then
    res := res || E'\n' || case when sqlerrm like '%Only the text%' then 'PASS  ' else 'FAIL  ' end || '7b. adding an outside attachment link is refused (' || sqlerrm || ')';
  end;
  begin
    update public.messages set created_at = created_at - interval '30 days' where id = m;
    res := res || E'\nFAIL  7c. the sent time was changed';
  exception when others then
    res := res || E'\n' || case when sqlerrm like '%Only the text%' then 'PASS  ' else 'FAIL  ' end || '7c. changing the sent time is refused (' || sqlerrm || ')';
  end;

  -- 8. The other person's "delivered" mark still works.
  perform set_config('request.jwt.claim.sub', mr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', mr, 'role', 'authenticated')::text, true);
  begin
    perform public.mark_messages_delivered();
    res := res || E'\nPASS  8. mark_messages_delivered() still works for the other person';
  exception when others then
    res := res || E'\nFAIL  8. mark_messages_delivered() was refused (' || sqlerrm || ')';
  end;

  -- 9. Starting chats: only as yourself, and at most 20 a day.
  perform set_config('request.jwt.claim.sub', q::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', q, 'role', 'authenticated')::text, true);
  begin
    select o.id into partner from public.profiles o
     where o.id <> q
       and not exists (select 1 from public.conversations c
                        where least(c.user_a, c.user_b) = least(q, o.id)
                          and greatest(c.user_a, c.user_b) = greatest(q, o.id)) limit 1;
    insert into public.conversations (user_a, user_b) values (partner, q);
    res := res || E'\nFAIL  9a. a chat was started in someone else''s name';
  exception when others then
    res := res || E'\nPASS  9a. a chat can only be started as yourself (' || sqlerrm || ')';
  end;

  for partner in
    select o.id from public.profiles o
     where o.id <> q
       and not exists (select 1 from public.conversations c
                        where least(c.user_a, c.user_b) = least(q, o.id)
                          and greatest(c.user_a, c.user_b) = greatest(q, o.id))
     limit 21
  loop
    begin
      insert into public.conversations (user_a, user_b) values (q, partner);
      made := made + 1;
    exception when others then
      msg := sqlerrm;
      exit;
    end;
  end loop;
  res := res || E'\n' || case when made = 20 and msg like '%lot of new chats%' then 'PASS  ' else 'FAIL  ' end
    || '9b. 20 new chats are allowed, the 21st is refused (made ' || made || ', then: ' || coalesce(msg, 'no error') || ')';

  -- 10. Signed-out visitors cannot ask how many admins there are; signed-in people still can.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  ok := not has_function_privilege('anon', 'public.admin_count()', 'execute')
        and has_function_privilege('authenticated', 'public.admin_count()', 'execute');
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '10. admin_count() is closed to signed-out visitors and open to signed-in people';

  -- 11. No user numbers were used up.
  select last_value into seq_after from public.user_number_seq;
  res := res || E'\n' || case when seq_before = seq_after then 'PASS  ' else 'FAIL  ' end
    || '11. the user-number counter did not move (' || seq_before || ' -> ' || seq_after || ')';

  raise exception E'RESULTS (rolled back, nothing was saved):%', res;
end
$t$;
