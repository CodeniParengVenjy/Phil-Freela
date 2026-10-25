-- Test for admin_top_rated() in supabase_admin_ratings_schema.sql. Paste this
-- whole file into the Supabase SQL Editor and run it AFTER the schema file. It
-- borrows existing accounts and ratings (no accounts are made, so no user numbers
-- are used) and ends with an error that carries the PASS/FAIL list; that error
-- rolls everything back, so nothing is left behind.
do $t$
declare
  res       text := '';
  adm       uuid;
  usr       uuid;
  r         jsonb;
  e         jsonb;
  list      text;
  got       numeric;
  want      numeric;
  before_n  int;
  after_n   int;
  proj      uuid;
  victim    uuid;
  bad       int;
  refused   boolean;
begin
  select id into adm from public.admins where not must_change_password limit 1;
  select p.id into usr from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  if adm is null or usr is null then
    raise exception 'Needs one admin and one normal user already in the database.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_top_rated()::jsonb;
  res := res || 'LIVE ' || r::text || E'\n';

  -- 1. The shape
  res := res || case when jsonb_typeof(r -> 'freelancers') = 'array' and jsonb_typeof(r -> 'clients') = 'array'
                     then 'PASS' else 'FAIL' end || ' two lists, freelancers and clients' || E'\n';

  foreach list in array array['freelancers', 'clients'] loop
    -- every entry has the fields, a count of at least 1 and an average from 1 to 5
    select count(*) into bad
      from jsonb_array_elements(r -> list) x
     where not (x ? 'id' and x ? 'full_name' and x ? 'username' and x ? 'avatar_path' and x ? 'average' and x ? 'count')
        or (x ->> 'count')::int < 1
        or (x ->> 'average')::numeric not between 1 and 5;
    res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end
           || ' ' || list || ': every entry has its fields, a count and an average from 1 to 5' || E'\n';

    -- best first: average never goes up, and on equal averages the count never goes up
    select count(*) into bad
      from (select (x ->> 'average')::numeric as a, (x ->> 'count')::int as c,
                   lag((x ->> 'average')::numeric) over (order by o) as pa,
                   lag((x ->> 'count')::int) over (order by o) as pc
              from jsonb_array_elements(r -> list) with ordinality as t(x, o)) q
     where pa is not null and (a > pa or (a = pa and c > pc));
    res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end
           || ' ' || list || ': best first (average, then number of ratings)' || E'\n';

    -- nobody twice in the same list
    select count(*) - count(distinct x ->> 'id') into bad from jsonb_array_elements(r -> list) x;
    res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' ' || list || ': nobody listed twice' || E'\n';
  end loop;

  -- 2. The limit is kept between 1 and 20, and null falls back to 5
  res := res || case when jsonb_array_length(public.admin_top_rated(1)::jsonb -> 'freelancers') <= 1
                      and jsonb_array_length(public.admin_top_rated(1)::jsonb -> 'clients') <= 1 then 'PASS' else 'FAIL' end
         || ' a limit of 1 gives at most one per list' || E'\n';
  res := res || case when jsonb_array_length(public.admin_top_rated(0)::jsonb -> 'freelancers') <= 1 then 'PASS' else 'FAIL' end
         || ' 0 is raised to 1' || E'\n';
  res := res || case when jsonb_array_length(public.admin_top_rated(100000)::jsonb -> 'freelancers') <= 20 then 'PASS' else 'FAIL' end
         || ' a huge limit is cut to 20' || E'\n';
  res := res || case when public.admin_top_rated(null)::jsonb = r then 'PASS' else 'FAIL' end
         || ' null falls back to the default of 5' || E'\n';

  -- 3. The best average matches working it out from the tables (read as the owner)
  reset role;
  foreach list in array array['freelancer', 'client'] loop
    select max(av) into want from (
      select avg(pr.stars) as av
        from public.project_ratings pr
        join public.projects j on j.id = pr.project_id
       where (case when pr.ratee_id = j.freelancer_id then 'freelancer' else 'client' end) = list
         and public.rating_is_visible(pr.project_id)
         and not exists (select 1 from public.archived_users a where a.user_id in (pr.rater_id, pr.ratee_id))
       group by pr.ratee_id) q;
    got := (r -> (list || 's') -> 0 ->> 'average')::numeric;
    if want is null then
      res := res || case when jsonb_array_length(r -> (list || 's')) = 0 then 'PASS' else 'FAIL' end
             || ' ' || list || ': empty list when there are no ratings' || E'\n';
    else
      res := res || case when abs(got - want) < 0.01 then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end
             || ' ' || list || ': the top average matches the tables' || E'\n';
    end if;
  end loop;

  -- 4. Everyone listed as a freelancer was the freelancer on a project they were rated on
  select count(*) into bad
    from jsonb_array_elements(r -> 'freelancers') x
   where not exists (select 1 from public.project_ratings pr join public.projects j on j.id = pr.project_id
                      where pr.ratee_id = (x ->> 'id')::uuid and j.freelancer_id = pr.ratee_id);
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end
         || ' every listed freelancer was rated as the freelancer of a project' || E'\n';
  select count(*) into bad
    from jsonb_array_elements(r -> 'clients') x
   where not exists (select 1 from public.project_ratings pr join public.projects j on j.id = pr.project_id
                      where pr.ratee_id = (x ->> 'id')::uuid and j.client_id = pr.ratee_id);
  res := res || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ')' end
         || ' every listed client was rated as the client of a project' || E'\n';

  -- 5. A blind rating is counted only once revealed: total of every 'count' goes up by one
  select pr.project_id into proj
    from public.project_ratings pr
   where (select count(*) from public.project_ratings x where x.project_id = pr.project_id) = 1
   limit 1;
  if proj is null then
    res := res || 'SKIP no project with exactly one rating to test the blind rule on' || E'\n';
  else
    update public.projects set completed_at = now() where id = proj;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    e := public.admin_top_rated(20)::jsonb;
    select coalesce(sum((x ->> 'count')::int), 0) into before_n
      from jsonb_array_elements((e -> 'freelancers') || (e -> 'clients')) x;
    reset role;
    update public.projects set completed_at = now() - interval '15 days' where id = proj;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    e := public.admin_top_rated(20)::jsonb;
    select coalesce(sum((x ->> 'count')::int), 0) into after_n
      from jsonb_array_elements((e -> 'freelancers') || (e -> 'clients')) x;
    res := res || case when after_n = before_n + 1 then 'PASS' else 'FAIL (' || before_n || ' -> ' || after_n || ')' end
           || ' a rating hidden by the blind rule is counted only once revealed' || E'\n';
    reset role;
  end if;

  -- 6. An archived person disappears from the lists
  victim := nullif(coalesce(r -> 'freelancers' -> 0 ->> 'id', r -> 'clients' -> 0 ->> 'id'), '')::uuid;
  if victim is null then
    res := res || 'SKIP nobody on the lists to archive' || E'\n';
  else
    insert into public.archived_users (user_id) values (victim);
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    e := public.admin_top_rated(20)::jsonb;
    select count(*) into bad from jsonb_array_elements((e -> 'freelancers') || (e -> 'clients')) x
     where (x ->> 'id')::uuid = victim;
    res := res || case when bad = 0 then 'PASS' else 'FAIL' end || ' an archived person is left out of the lists' || E'\n';
    reset role;
  end if;

  -- ---- a normal user and the signed-out visitor are refused ---------------
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin
    perform public.admin_top_rated();
  exception when others then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a normal user is refused' || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  refused := false;
  begin
    perform public.admin_top_rated();
  exception when others then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a signed-out visitor is refused' || E'\n';
  reset role;

  raise exception E'ADMIN TOP RATED TEST RESULTS:\n%', res;
end;
$t$;
