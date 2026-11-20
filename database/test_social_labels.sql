-- Test for supabase_social_labels_schema.sql (2026-11-20). Send the schema file and this block together in ONE call to
-- try it before applying (the error at the end rolls the schema back too), or run this alone in the Supabase SQL
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
  msg text;
  seen jsonb;
begin
  select id into fl from public.profiles where account_type = 'freelancer' order by created_at limit 1;
  select id into cl from public.profiles where account_type = 'client' order by created_at limit 1;
  if fl is null or cl is null then raise exception 'test needs a freelancer and a client'; end if;

  -- 1. GitHub in the links rule (and nothing else changed)
  for r in
    select * from (values
      (true,  'GitHub profile',                    '{"github": "https://github.com/octocat"}'),
      (true,  'GitHub with a sub-domain',          '{"github": "https://gist.github.com/octocat"}'),
      (true,  'all nine platforms',                '{"facebook": "https://www.facebook.com/juan.delacruz", "instagram": "https://www.instagram.com/juan_dc", "tiktok": "https://www.tiktok.com/@juan", "youtube": "https://www.youtube.com/@juan", "linkedin": "https://www.linkedin.com/in/juan-dc", "github": "https://github.com/octocat", "x": "https://x.com/juan", "threads": "https://www.threads.com/@juan", "pinterest": "https://www.pinterest.com/juan/"}'),
      (false, 'GitHub entry on another site',      '{"github": "https://gitlab.com/octocat"}'),
      (false, 'look-alike: notgithub.com',         '{"github": "https://notgithub.com/octocat"}'),
      (false, 'look-alike: github.com.evil.com',   '{"github": "https://github.com.evil.com/octocat"}'),
      (false, 'a TikTok entry on GitHub',          '{"tiktok": "https://github.com/octocat"}'),
      (false, 'GitHub with no user name',          '{"github": "https://github.com/"}'),
      (true,  'the old rule still holds: TikTok',  '{"tiktok": "https://www.tiktok.com/@juan"}'),
      (false, 'the old rule still holds: wrong site', '{"tiktok": "https://www.facebook.com/juan"}'),
      (false, 'the old rule still holds: ?query',  '{"instagram": "https://www.instagram.com/juan?igsh=abc"}')
    ) as t(want, label, doc)
  loop
    got := public.social_links_ok(r.doc::jsonb);
    res := res || case when got = r.want then 'PASS' else 'FAIL' end || ' 1 ' || r.label
      || case when r.want then ' is accepted' else ' is refused' end || E'\n';
  end loop;

  -- 2. The names rule
  for r in
    select * from (values
      (true,  'nothing yet',                       '{}'),
      (true,  'a name with spaces',                '{"facebook": "Juan Dela Cruz"}'),
      (true,  'a handle',                          '{"x": "@juan_dc"}'),
      (true,  'an apostrophe and a dot',           '{"youtube": "Juan''s Films Co."}'),
      (true,  'letters with accents',              '{"linkedin": "Niño Reyes"}'),
      (true,  'all nine at once',                  '{"facebook": "a", "instagram": "b", "tiktok": "c", "youtube": "d", "linkedin": "e", "github": "f", "x": "g", "threads": "h", "pinterest": "i"}'),
      (false, 'a platform that is not on the list', '{"myspace": "Juan"}'),
      (false, 'a number instead of a name',        '{"facebook": 5}'),
      (false, 'null instead of a name',            '{"facebook": null}'),
      (false, 'an object instead of a name',       '{"facebook": {"a": 1}}'),
      (false, 'an empty name',                     '{"facebook": ""}'),
      (false, 'only spaces',                       '{"facebook": "   "}'),
      (false, 'a space at the start',              '{"facebook": " Juan"}'),
      (false, 'a space at the end',                '{"facebook": "Juan "}'),
      (false, 'a slash (a link)',                  '{"facebook": "facebook.com/juan"}'),
      (false, 'http://',                           '{"facebook": "http://x"}'),
      (false, 'www.',                              '{"facebook": "www.juan.ph"}'),
      (false, 'a backslash',                       '{"facebook": "Juan\\\\Cruz"}'),
      (false, 'angle brackets',                    '{"facebook": "<b>Juan</b>"}'),
      (false, 'a double quote',                    '{"facebook": "Juan \"The Man\""}'),
      (false, 'a backtick',                        '{"facebook": "Juan`s"}'),
      (false, 'a line break',                      '{"facebook": "Juan\nCruz"}'),
      (false, 'a list instead of an object',       '[]'),
      (false, 'a text instead of an object',       '"Juan"'),
      (false, 'a number instead of an object',     '5')
    ) as t(want, label, doc)
  loop
    got := public.social_labels_ok(r.doc::jsonb);
    res := res || case when got = r.want then 'PASS' else 'FAIL' end || ' 2 ' || r.label
      || case when r.want then ' is accepted' else ' is refused' end || E'\n';
  end loop;
  res := res || case when public.social_labels_ok(jsonb_build_object('facebook', repeat('x', 40))) and not public.social_labels_ok(jsonb_build_object('facebook', repeat('x', 41))) then 'PASS' else 'FAIL' end
    || ' 2 40 characters are accepted, 41 are refused' || E'\n';
  res := res || case when not public.social_labels_ok(null) then 'PASS' else 'FAIL' end
    || ' 2 no value at all (null) is refused' || E'\n';

  -- 3. The column exists, can't be empty, and starts as {}
  res := res || case when (select column_default from information_schema.columns
                            where table_schema = 'public' and table_name = 'profiles' and column_name = 'social_labels') like '''{}''::jsonb%'
                      and (select is_nullable from information_schema.columns
                            where table_schema = 'public' and table_name = 'profiles' and column_name = 'social_labels') = 'NO'
                      and (select count(*) from public.profiles where social_labels is null) = 0 then 'PASS' else 'FAIL' end
    || ' 3 profiles.social_labels exists, is never empty and defaults to {}' || E'\n';

  -- 4. A freelancer saves links and names together (through the real row rules); a bad link and a bad name are refused
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set social_links = '{"facebook": "https://www.facebook.com/profile.php?id=100012345", "github": "https://github.com/octocat"}',
                             social_labels = '{"facebook": "Juan Dela Cruz"}' where id = fl;
  get diagnostics n = row_count;
  refused := false;
  begin
    update public.profiles set social_labels = '{"facebook": "facebook.com/juan"}' where id = fl;
  exception when check_violation then refused := true;
  end;
  reset role;
  res := res || case when n = 1 and (select social_labels from public.profiles where id = fl) = '{"facebook": "Juan Dela Cruz"}'::jsonb
                      and (select social_links ->> 'github' from public.profiles where id = fl) = 'https://github.com/octocat' then 'PASS' else 'FAIL' end
    || ' 4 a freelancer saves their links, a GitHub link and a name' || E'\n';
  res := res || case when refused and (select social_labels from public.profiles where id = fl) = '{"facebook": "Juan Dela Cruz"}'::jsonb then 'PASS' else 'FAIL' end
    || ' 4 a name that is a link is refused and the saved one stays' || E'\n';

  -- 5. A blocked word in a name is refused with a plain sentence (the same filter as the other text)
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false; msg := '';
  begin
    update public.profiles set social_labels = '{"facebook": "Juan fuck Cruz"}' where id = fl;
  exception when others then refused := true; msg := sqlerrm;
  end;
  reset role;
  res := res || case when refused and msg like '%bad words in a name%' and (select social_labels from public.profiles where id = fl) = '{"facebook": "Juan Dela Cruz"}'::jsonb then 'PASS' else 'FAIL' end
    || ' 5 a name with a blocked word is refused ("' || msg || '") and the saved one stays' || E'\n';

  -- 6. A client saves theirs too, and can read the freelancer's names
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set social_links = '{"linkedin": "https://www.linkedin.com/in/maria-co"}', social_labels = '{"linkedin": "Maria Co"}' where id = cl;
  get diagnostics n = row_count;
  select social_labels into seen from public.profiles where id = fl;
  reset role;
  res := res || case when n = 1 and (select social_labels from public.profiles where id = cl) ->> 'linkedin' = 'Maria Co' then 'PASS' else 'FAIL' end
    || ' 6 a client saves their own names' || E'\n';
  res := res || case when seen = '{"facebook": "Juan Dela Cruz"}'::jsonb then 'PASS' else 'FAIL' end
    || ' 6 a signed-in person can read someone else''s names' || E'\n';

  -- 7. Nobody can change someone else's names
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set social_labels = '{"x": "hacked"}' where id = fl;
  get diagnostics n = row_count;
  reset role;
  res := res || case when n = 0 and (select social_labels from public.profiles where id = fl) = '{"facebook": "Juan Dela Cruz"}'::jsonb then 'PASS' else 'FAIL' end
    || ' 7 another person can''t change them' || E'\n';

  -- 8. They can clear them again
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set social_links = '{}', social_labels = '{}' where id = fl;
  reset role;
  res := res || case when (select social_labels from public.profiles where id = fl) = '{}'::jsonb and (select social_links from public.profiles where id = fl) = '{}'::jsonb then 'PASS' else 'FAIL' end
    || ' 8 they can clear all their accounts and names' || E'\n';

  raise exception 'RESULTS%', E'\n' || res;
end
$t$;
