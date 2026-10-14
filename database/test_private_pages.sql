-- Test for supabase_private_pages_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file (or send the schema file
-- and this block together in one call to try it before applying: the error at
-- the end rolls the schema back too). It BORROWS a freelancer, another person
-- and an admin only to act as them, makes made-up file entries, and ends with
-- an error that carries the PASS/FAIL list; that error rolls everything back,
-- so nothing is left behind and no user numbers are used up.
do $t$
declare
  res text := '';
  ok boolean;
  n int;
  fa uuid; fb uuid; ad uuid;
  page text;
begin
  select id into fa from public.profiles where account_type = 'freelancer' order by created_at limit 1;
  select id into fb from public.profiles where id <> fa order by created_at desc limit 1;
  select id into ad from public.admins where not must_change_password limit 1;
  if fa is null or fb is null or ad is null then
    raise exception 'This test borrows a freelancer, another person and an admin from the database. One of them is missing.';
  end if;
  page := fa::text || '/00000000-0000-4000-8000-000000000001-p1.jpg';
  -- Supabase refuses direct removals from its storage tables unless this switch
  -- is on, which is what the Storage API itself turns on when it removes a file.
  perform set_config('storage.allow_delete_query', 'true', true);

  -- ===== The bucket =====
  select exists (select 1 from storage.buckets where id = 'slide-private' and not public and allowed_mime_types = array['image/jpeg'] and file_size_limit = 5242880) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1a. the slide-private bucket exists, is private, takes only JPEG pictures up to 5 MB';
  select count(*) = 2 and not bool_or(cmd in ('INSERT', 'UPDATE', 'ALL')) into ok from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'slide-private:%';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1b. two rules (open, remove) and none to add or change files';

  -- A made-up file entry in the writer's folder (written as the table's owner, like the AI service does with its key).
  insert into storage.objects (bucket_id, name) values ('slide-private', page);

  -- ===== Who can open it =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', fa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'slide-private' and name = page;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2a. the writer can open their own page';

  perform set_config('request.jwt.claim.sub', fb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fb, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'slide-private' and name = page;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '2b. another signed-in person can''t';

  perform set_config('request.jwt.claim.sub', ad::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'slide-private' and name = page;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2c. an admin can';

  reset role;
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from storage.objects where bucket_id = 'slide-private' and name = page;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '2d. a signed-out visitor can''t';

  -- ===== Nobody adds or changes files from the browser =====
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', fa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  begin
    insert into storage.objects (bucket_id, name) values ('slide-private', fa::text || '/sneaky-p1.jpg');
    res := res || E'\nFAIL  3a. the writer could add a file';
  exception when insufficient_privilege then
    res := res || E'\nPASS  3a. the writer can''t add a file';
  end;
  update storage.objects set name = fa::text || '/renamed-p1.jpg' where bucket_id = 'slide-private' and name = page;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3b. nor change or rename one';

  -- ===== Removing =====
  perform set_config('request.jwt.claim.sub', fb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fb, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'slide-private' and name = page;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '4a. another person can''t remove it';

  perform set_config('request.jwt.claim.sub', ad::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'slide-private' and name = page;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4b. an admin can remove it (when they remove the listing)';

  reset role;
  insert into storage.objects (bucket_id, name) values ('slide-private', page);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', fa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'slide-private' and name = page;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4c. the writer can remove their own page';

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  raise exception E'PRIVATE PAGES TESTS (rolled back)%', res;
end
$t$;
