-- Test for supabase_highlight_style_schema.sql. Send the schema file and this block together in ONE call to try it
-- before applying (the error at the end rolls the schema back too), or run this alone in the Supabase SQL Editor
-- after the schema file. It BORROWS two real accounts (no user numbers are used): a freelancer without Premium and
-- another person; it gives Premium for the block only. It ends with an error that carries the PASS/FAIL list; that
-- error rolls everything back.
do $t$
declare
  res text := '';
  f uuid;            -- a freelancer without Premium
  n uuid;            -- another person
  refused boolean; msg text; k int;
begin
  select p.id into f from public.profiles p
   where p.account_type = 'freelancer' and not public.is_pro(p.id) and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select p.id into n from public.profiles p
   where p.id <> f and not public.is_pro(p.id) and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  if f is null or n is null then raise exception 'test needs a freelancer and another person without Premium'; end if;

  -- 1. Everyone starts with the Director's Cut
  res := res || case when (select highlight_style from public.profiles where id = f) = 'cinema'
                      and (select count(*) from public.profiles where highlight_style <> 'cinema') = 0 then 'PASS' else 'FAIL' end
    || ' 1 the column exists and every profile starts with the Director''s Cut' || E'\n';

  -- 2. Without Premium a Premium style is refused; the Director's Cut and other settings still save
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false; msg := '';
  begin update public.profiles set highlight_style = 'paper' where id = f; exception when others then refused := true; msg := sqlerrm; end;
  update public.profiles set highlight_style = 'cinema' where id = f;
  update public.profiles set available_for_work = available_for_work where id = f;
  reset role;
  res := res || case when refused and msg like '%Premium perk%' and (select highlight_style from public.profiles where id = f) = 'cinema' then 'PASS' else 'FAIL' end
    || ' 2 without Premium a Premium style is refused ("' || msg || '"); the Director''s Cut and other settings save' || E'\n';

  -- 3. With Premium all five styles save
  insert into public.pro_members (user_id, pro_until) values (f, now() + interval '1 day')
  on conflict (user_id) do update set pro_until = excluded.pro_until;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  k := 0;
  begin update public.profiles set highlight_style = 'paper' where id = f; k := k + 1; exception when others then null; end;
  begin update public.profiles set highlight_style = 'toon' where id = f; k := k + 1; exception when others then null; end;
  begin update public.profiles set highlight_style = 'kinetic' where id = f; k := k + 1; exception when others then null; end;
  begin update public.profiles set highlight_style = 'comic' where id = f; k := k + 1; exception when others then null; end;
  begin update public.profiles set highlight_style = 'retro' where id = f; k := k + 1; exception when others then null; end;
  -- 4. A name that isn't a style is refused, even with Premium (the Premium rule runs first, so this needs Premium)
  refused := false;
  begin update public.profiles set highlight_style = 'sparkles' where id = f; exception when check_violation then refused := true; end;
  reset role;
  res := res || case when k = 5 and (select highlight_style from public.profiles where id = f) = 'retro' then 'PASS' else 'FAIL' end
    || ' 3 with Premium all five styles save' || E'\n';
  res := res || case when refused and (select highlight_style from public.profiles where id = f) = 'retro' then 'PASS' else 'FAIL' end
    || ' 4 an unknown style is refused, even with Premium' || E'\n';

  -- 5. Someone else can't change your style (only your own profile can be changed)
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.profiles set highlight_style = 'cinema' where id = f; exception when others then null; end;
  reset role;
  res := res || case when (select highlight_style from public.profiles where id = f) = 'retro' then 'PASS' else 'FAIL' end
    || ' 5 another person can''t change it' || E'\n';

  -- 6. After Premium ends: the saved style stays, other settings save, a new Premium style is refused
  update public.pro_members set pro_until = now() - interval '1 minute' where user_id = f;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set available_for_work = available_for_work where id = f;
  refused := false;
  begin update public.profiles set highlight_style = 'comic' where id = f; exception when others then refused := sqlerrm like '%Premium perk%'; end;
  reset role;
  res := res || case when refused and (select highlight_style from public.profiles where id = f) = 'retro' then 'PASS' else 'FAIL' end
    || ' 6 after Premium ends the saved style stays and other settings save, a new Premium style is refused' || E'\n';

  -- 7. They can always go back to the Director's Cut
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set highlight_style = 'cinema' where id = f;
  reset role;
  res := res || case when (select highlight_style from public.profiles where id = f) = 'cinema' then 'PASS' else 'FAIL' end
    || ' 7 they can always go back to the Director''s Cut' || E'\n';

  raise exception 'RESULTS%', E'\n' || res;
end
$t$;
