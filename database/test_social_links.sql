-- Test for supabase_social_links_schema.sql (2026-11-20). Send the schema file and this block together in ONE call
-- to try it before applying (the error at the end rolls the schema back too), or run this alone in the Supabase SQL
-- Editor after the schema file. It BORROWS one freelancer and one client (no user numbers are used, nothing is
-- inserted). It ends with an error that carries the PASS/FAIL list; that error rolls everything back.
do $t$
declare
  res text := '';
  fl uuid;                 -- a freelancer
  cl uuid;                 -- a client
  r record;
  got boolean;
  n int;
  refused boolean;
  seen jsonb;
  tiktok200 text;          -- a TikTok address of exactly 200 characters
begin
  select id into fl from public.profiles where account_type = 'freelancer' order by created_at limit 1;
  select id into cl from public.profiles where account_type = 'client' order by created_at limit 1;
  if fl is null or cl is null then raise exception 'test needs a freelancer and a client'; end if;
  tiktok200 := 'https://www.tiktok.com/@' || repeat('x', 176);

  -- 1. The check function: what it accepts and what it refuses
  for r in
    select * from (values
      (true,  'nothing yet',                       '{}'),
      (true,  'one account',                       '{"tiktok": "https://www.tiktok.com/@juan"}'),
      (true,  'all eight platforms',               '{"facebook": "https://www.facebook.com/juan.delacruz", "instagram": "https://www.instagram.com/juan_dc", "tiktok": "https://www.tiktok.com/@juan", "youtube": "https://www.youtube.com/@juan", "linkedin": "https://www.linkedin.com/in/juan-dc", "x": "https://x.com/juan", "threads": "https://www.threads.com/@juan", "pinterest": "https://www.pinterest.com/juan/"}'),
      (true,  'Facebook numeric profile',          '{"facebook": "https://m.facebook.com/profile.php?id=100012345"}'),
      (true,  'sub-domain and capital letters',    '{"tiktok": "https://VM.TikTok.com/@Juan"}'),
      (true,  'country LinkedIn address',          '{"linkedin": "https://ph.linkedin.com/in/juan-dc"}'),
      (true,  'old Twitter address for X',         '{"x": "https://twitter.com/juan"}'),
      (true,  'threads.net address',               '{"threads": "https://www.threads.net/@juan"}'),
      (true,  'short Facebook address',            '{"facebook": "https://fb.me/juan"}'),
      (false, 'TikTok entry on Facebook',          '{"tiktok": "https://www.facebook.com/juan"}'),
      (false, 'look-alike: evilfacebook.com',      '{"facebook": "https://evilfacebook.com/juan"}'),
      (false, 'look-alike: facebook.com.evil.com', '{"facebook": "https://facebook.com.evil.com/juan"}'),
      (false, 'look-alike: user@host trick',       '{"facebook": "https://facebook.com@evil.com/juan"}'),
      (false, 'look-alike: domain in the path',    '{"facebook": "https://evil.com/facebook.com/juan"}'),
      (false, 'look-alike: notx.com for X',        '{"x": "https://notx.com/juan"}'),
      (false, 'not secure (http)',                 '{"tiktok": "http://www.tiktok.com/@juan"}'),
      (false, 'javascript link',                   '{"tiktok": "javascript:alert(1)"}'),
      (false, 'no page name',                      '{"tiktok": "https://www.tiktok.com"}'),
      (false, 'only a slash',                      '{"tiktok": "https://www.tiktok.com/"}'),
      (false, 'two slashes',                       '{"tiktok": "https://www.tiktok.com//"}'),
      (false, 'share-button leftovers (?query)',   '{"instagram": "https://www.instagram.com/juan?igsh=abc"}'),
      (false, 'a #part',                           '{"instagram": "https://www.instagram.com/juan#top"}'),
      (false, 'redirect link on Facebook',         '{"facebook": "https://l.facebook.com/l.php?u=https://evil.com"}'),
      (false, 'a port number',                     '{"tiktok": "https://www.tiktok.com:8080/@juan"}'),
      (false, 'space in the address',              '{"tiktok": "https://www.tiktok.com/@ju an"}'),
      (false, 'angle brackets',                    '{"tiktok": "https://www.tiktok.com/@ju<an>"}'),
      (false, 'platform that is not on the list',  '{"myspace": "https://myspace.com/juan"}'),
      (false, 'one good, one unknown platform',    '{"tiktok": "https://www.tiktok.com/@juan", "myspace": "https://myspace.com/juan"}'),
      (false, 'a number instead of an address',    '{"tiktok": 5}'),
      (false, 'null instead of an address',        '{"tiktok": null}'),
      (false, 'an object instead of an address',   '{"tiktok": {"a": 1}}'),
      (false, 'a list instead of an object',       '[]'),
      (false, 'a text instead of an object',       '"https://www.tiktok.com/@juan"'),
      (false, 'a number instead of an object',     '5')
    ) as t(want, label, doc)
  loop
    got := public.social_links_ok(r.doc::jsonb);
    res := res || case when got = r.want then 'PASS' else 'FAIL' end || ' 1 ' || r.label
      || case when r.want then ' is accepted' else ' is refused' end || E'\n';
  end loop;

  -- 1b. The length limit is exactly 200 characters, and no value at all is refused
  res := res || case when char_length(tiktok200) = 200 and public.social_links_ok(jsonb_build_object('tiktok', tiktok200)) then 'PASS' else 'FAIL' end
    || ' 1 a 200-character address is accepted' || E'\n';
  res := res || case when not public.social_links_ok(jsonb_build_object('tiktok', tiktok200 || 'x')) then 'PASS' else 'FAIL' end
    || ' 1 a 201-character address is refused' || E'\n';
  res := res || case when not public.social_links_ok(null) then 'PASS' else 'FAIL' end
    || ' 1 no value at all (null) is refused' || E'\n';

  -- 2. The column exists, cannot be empty, and starts as {} for everyone
  res := res || case when (select column_default from information_schema.columns
                            where table_schema = 'public' and table_name = 'profiles' and column_name = 'social_links') like '''{}''::jsonb%'
                      and (select is_nullable from information_schema.columns
                            where table_schema = 'public' and table_name = 'profiles' and column_name = 'social_links') = 'NO'
                      and (select count(*) from public.profiles where social_links is null) = 0 then 'PASS' else 'FAIL' end
    || ' 2 profiles.social_links exists, is never empty and defaults to {}' || E'\n';

  -- 3. A freelancer saves their own accounts (through the real row rules), and a bad one is refused
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set social_links = '{"tiktok": "https://www.tiktok.com/@juan"}' where id = fl;
  get diagnostics n = row_count;
  refused := false;
  begin
    update public.profiles set social_links = '{"tiktok": "https://evil.example/@juan"}' where id = fl;
  exception when check_violation then refused := true;
  end;
  reset role;
  res := res || case when n = 1 and (select social_links from public.profiles where id = fl) = '{"tiktok": "https://www.tiktok.com/@juan"}'::jsonb then 'PASS' else 'FAIL' end
    || ' 3 a freelancer saves their own account' || E'\n';
  res := res || case when refused and (select social_links from public.profiles where id = fl) = '{"tiktok": "https://www.tiktok.com/@juan"}'::jsonb then 'PASS' else 'FAIL' end
    || ' 3 an address on another website is refused and the saved one stays' || E'\n';

  -- 4. A client saves theirs too, and can read the freelancer's (people can see each other's accounts)
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set social_links = '{"linkedin": "https://www.linkedin.com/in/maria-co", "facebook": "https://www.facebook.com/mariaco.shop"}' where id = cl;
  get diagnostics n = row_count;
  select social_links into seen from public.profiles where id = fl;
  reset role;
  res := res || case when n = 1 and (select social_links from public.profiles where id = cl) ->> 'linkedin' = 'https://www.linkedin.com/in/maria-co' then 'PASS' else 'FAIL' end
    || ' 4 a client saves their own accounts' || E'\n';
  res := res || case when seen = '{"tiktok": "https://www.tiktok.com/@juan"}'::jsonb then 'PASS' else 'FAIL' end
    || ' 4 a signed-in person can read someone else''s accounts' || E'\n';

  -- 5. Nobody can change someone else's accounts
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set social_links = '{"x": "https://x.com/hacked"}' where id = fl;
  get diagnostics n = row_count;
  reset role;
  res := res || case when n = 0 and (select social_links from public.profiles where id = fl) = '{"tiktok": "https://www.tiktok.com/@juan"}'::jsonb then 'PASS' else 'FAIL' end
    || ' 5 another person can''t change them' || E'\n';

  -- 6. They can remove all of them again
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set social_links = '{}' where id = fl;
  reset role;
  res := res || case when (select social_links from public.profiles where id = fl) = '{}'::jsonb then 'PASS' else 'FAIL' end
    || ' 6 they can remove all their accounts' || E'\n';

  raise exception 'RESULTS%', E'\n' || res;
end
$t$;
