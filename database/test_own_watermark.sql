-- Tests for supabase_own_watermark_schema.sql (PLAN-own-watermark.md).
-- Everything runs inside one DO block that ends with an error on purpose, so
-- every change rolls back and the PASS/FAIL lines come back in the message.
-- It borrows two existing accounts (only read; nothing is kept).

do $$
declare
  fa uuid;  -- a freelancer
  fb uuid;  -- someone else
  out text := '';
  n int;
  kind text;
begin
  select id into fa from public.profiles where account_type = 'freelancer' order by created_at limit 1;
  select id into fb from public.profiles where id <> fa order by created_at limit 1;
  if fa is null or fb is null then
    raise exception 'needs a freelancer and one more account';
  end if;

  -- Act as the freelancer.
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fa::text, true);
  set local role authenticated;

  -- 1. A picture in their own folder is saved.
  insert into public.watermark_settings (freelancer_id, mark_kind, picture_path, picture_bg_removed)
  values (fa, 'picture', fa::text || '/1731650000000/mark.png', true)
  on conflict (freelancer_id) do update
    set mark_kind = excluded.mark_kind, picture_path = excluded.picture_path, picture_bg_removed = excluded.picture_bg_removed;
  select mark_kind into kind from public.watermark_settings where freelancer_id = fa;
  out := out || case when kind = 'picture' then 'PASS' else 'FAIL' end || ' 1 own picture saved' || chr(10);

  -- 2. "My picture + text" also works, and back to text keeps the picture.
  update public.watermark_settings set mark_kind = 'picture_text' where freelancer_id = fa;
  update public.watermark_settings set mark_kind = 'text' where freelancer_id = fa;
  select count(*) into n from public.watermark_settings where freelancer_id = fa and mark_kind = 'text' and picture_path is not null;
  out := out || case when n = 1 then 'PASS' else 'FAIL' end || ' 2 picture_text, then text keeps the picture' || chr(10);

  -- 3. A picture kind without a picture is refused.
  begin
    update public.watermark_settings set mark_kind = 'picture', picture_path = null where freelancer_id = fa;
    out := out || 'FAIL 3 picture without a path was saved' || chr(10);
  exception when check_violation then
    out := out || 'PASS 3 picture without a path refused' || chr(10);
  end;

  -- 4. Another person's folder is refused.
  begin
    update public.watermark_settings set picture_path = fb::text || '/1/mark.png' where freelancer_id = fa;
    out := out || 'FAIL 4 another folder was saved' || chr(10);
  exception when check_violation then
    out := out || 'PASS 4 another folder refused' || chr(10);
  end;

  -- 5. Only mark.png is accepted.
  begin
    update public.watermark_settings set picture_path = fa::text || '/1/original.png' where freelancer_id = fa;
    out := out || 'FAIL 5 original.png was saved as the watermark' || chr(10);
  exception when check_violation then
    out := out || 'PASS 5 only mark.png accepted' || chr(10);
  end;

  -- 6. An unknown kind is refused.
  begin
    update public.watermark_settings set mark_kind = 'sticker' where freelancer_id = fa;
    out := out || 'FAIL 6 unknown kind saved' || chr(10);
  exception when check_violation then
    out := out || 'PASS 6 unknown kind refused' || chr(10);
  end;

  -- 7. The Premium rule still works and does not block a picture.
  begin
    update public.watermark_settings set mark_kind = 'picture', picture_path = fa::text || '/2/mark.png' where freelancer_id = fa;
    out := out || 'PASS 7 picture is free (no Premium check)' || chr(10);
  exception when others then
    out := out || 'FAIL 7 picture refused: ' || sqlerrm || chr(10);
  end;

  -- 8. Storage: their own folder is fine.
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('watermark-pictures', fa::text || '/2/mark.png', fa::text);
    out := out || 'PASS 8 upload to own folder' || chr(10);
  exception when others then
    out := out || 'FAIL 8 upload to own folder: ' || sqlerrm || chr(10);
  end;

  -- 9. Storage: someone else's folder is refused.
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('watermark-pictures', fb::text || '/2/mark.png', fa::text);
    out := out || 'FAIL 9 upload to another folder allowed' || chr(10);
  exception when insufficient_privilege then
    out := out || 'PASS 9 upload to another folder refused' || chr(10);
  end;

  -- 10. The other person can't see the freelancer's picture.
  perform set_config('request.jwt.claims', json_build_object('sub', fb, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fb::text, true);
  select count(*) into n from storage.objects where bucket_id = 'watermark-pictures' and name like fa::text || '/%';
  out := out || case when n = 0 then 'PASS' else 'FAIL' end || ' 10 others cannot open it (' || n || ')' || chr(10);

  -- 11. ...but the owner can.
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fa::text, true);
  select count(*) into n from storage.objects where bucket_id = 'watermark-pictures' and name like fa::text || '/%';
  out := out || case when n = 1 then 'PASS' else 'FAIL' end || ' 11 owner can open it (' || n || ')' || chr(10);

  reset role;
  -- 12. The bucket only takes PNG, 2 MB, and is private.
  select count(*) into n from storage.buckets
   where id = 'watermark-pictures' and not public and file_size_limit = 2097152 and allowed_mime_types = array['image/png'];
  out := out || case when n = 1 then 'PASS' else 'FAIL' end || ' 12 bucket private, PNG, 2 MB' || chr(10);

  raise exception 'RESULTS (rolled back):%', chr(10) || out;
end $$;
