-- Test for supabase_document_privacy_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file (or send the schema file
-- and this block together in one call to try it before applying: the error at
-- the end rolls the schema back too). It only BORROWS two real accounts and an
-- admin to act as them (nothing about them changes), makes a made-up service
-- with a document slide, and ends with an error that carries the PASS/FAIL
-- list; that error rolls everything back, so nothing is left behind. Real
-- accounts are borrowed (instead of made up) so the user number counter is not
-- used up. Made-up ones are only created if the database has too few.
--
-- Not tested here: that the text is removed along with its slide (the block
-- can't remove rows). The foreign key that does it is checked instead (2b).
do $t$
declare
  res text := '';
  ok boolean;
  n int;
  fa uuid; fb uuid; ad uuid;
  svc uuid; slide uuid;
  whole constant text := 'The whole text of the document, including the part visitors never get.';
  kept text;
begin
  -- ===== People to act as =====
  select id into fa from public.profiles where account_type = 'freelancer' order by created_at limit 1;
  if fa is null then
    fa := gen_random_uuid();
    insert into auth.users (id, email, aud, role, created_at) values (fa, 'dp-' || left(fa::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
    insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values (fa, 'Writer One', 'dp_writer', 'female', 'freelancer', false);
  end if;
  select id into fb from public.profiles where id <> fa order by created_at desc limit 1;
  if fb is null then
    fb := gen_random_uuid();
    insert into auth.users (id, email, aud, role, created_at) values (fb, 'dp-' || left(fb::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
    insert into public.profiles (id, full_name, username, gender, account_type, email_when_offline) values (fb, 'Other Two', 'dp_other', 'male', 'client', false);
  end if;
  select id into ad from public.admins where not must_change_password limit 1;
  if ad is null then
    ad := gen_random_uuid();
    insert into auth.users (id, email, aud, role, created_at) values (ad, 'dp-' || left(ad::text, 8) || '@example.invalid', 'authenticated', 'authenticated', now());
    insert into public.admins (id, full_name, username, role) values (ad, 'Doc Admin', 'dp_admin', 'admin');
  end if;

  -- A made-up service with one document slide and its whole text (written
  -- here as the table's owner, like the AI service does with its own key).
  insert into public.services (freelancer_id, title, category, description) values (fa, 'Writing test', 'copywriting', 'A test service.') returning id into svc;
  insert into public.media_slides (freelancer_id, service_id, position, media_type, file_path, status)
  values (fa, svc, 1, 'document', fa::text || '/document-privacy-test.txt', 'active') returning id into slide;
  insert into public.slide_texts (slide_id, body) values (slide, whole);

  -- ===== The new column =====
  select data_type = 'integer' and is_nullable = 'NO' and column_default = '0' into ok
  from information_schema.columns where table_schema = 'public' and table_name = 'media_slides' and column_name = 'hidden_chars';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1a. media_slides.hidden_chars is a required whole number that starts at 0';

  select hidden_chars = 0 into ok from public.media_slides where id = slide;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '1b. a new slide starts with nothing hidden';

  begin
    update public.media_slides set hidden_chars = -1 where id = slide;
    res := res || E'\nFAIL  1c. a negative number was accepted';
  exception when check_violation then
    res := res || E'\nPASS  1c. a negative number is refused';
  end;

  -- ===== The table =====
  select relrowsecurity into ok from pg_class where oid = 'public.slide_texts'::regclass;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '2a. row level security is on';

  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.slide_texts'::regclass and contype = 'f' and confrelid = 'public.media_slides'::regclass and confdeltype = 'c'
  ) into ok;
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '2b. the text is removed along with its slide (the foreign key cascades)';

  select count(*) = 1 and bool_and(cmd = 'SELECT') into ok from pg_policies where schemaname = 'public' and tablename = 'slide_texts';
  res := res || E'\n' || case when ok then 'PASS  ' else 'FAIL  ' end || '2c. there is exactly one rule, and it is for reading';

  -- ===== Who can read it =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', fa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  select count(*) into n from public.slide_texts where slide_id = slide and body = whole;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3a. the writer reads the whole text of their own document';

  perform set_config('request.jwt.claim.sub', fb::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fb, 'role', 'authenticated')::text, true);
  select count(*) into n from public.slide_texts where slide_id = slide;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3b. another signed-in person gets nothing, even when asking for that slide by its id';

  perform set_config('request.jwt.claim.sub', ad::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  select count(*) into n from public.slide_texts where slide_id = slide;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '3c. an admin reads it';

  reset role;
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    select count(*) into n from public.slide_texts;
    res := res || E'\nFAIL  3d. a signed-out visitor could read the table';
  exception when insufficient_privilege then
    res := res || E'\nPASS  3d. a signed-out visitor is refused';
  end;

  -- ===== Nobody can write from the browser, not even the writer =====
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', fa::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  begin
    insert into public.slide_texts (slide_id, body) values (slide, 'swapped');
    res := res || E'\nFAIL  4a. the writer could add a text';
  exception when insufficient_privilege then
    res := res || E'\nPASS  4a. the writer can''t add a text';
  end;
  begin
    update public.slide_texts set body = 'swapped' where slide_id = slide;
    res := res || E'\nFAIL  4b. the writer could change the text';
  exception when insufficient_privilege then
    res := res || E'\nPASS  4b. the writer can''t change the text';
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select body into kept from public.slide_texts where slide_id = slide;
  res := res || E'\n' || case when kept = whole then 'PASS  ' else 'FAIL  ' end || '4c. the text is still the original';

  raise exception E'DOCUMENT PRIVACY TESTS (rolled back)%', res;
end
$t$;
