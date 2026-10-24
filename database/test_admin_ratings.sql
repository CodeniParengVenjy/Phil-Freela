-- Test for supabase_admin_ratings_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It borrows existing
-- admins, users and ratings (no accounts are made, so no user numbers are used)
-- and ends with an error that carries the PASS/FAIL list; that error rolls
-- everything back, so nothing is left behind.
do $t$
declare
  res       text := '';
  adm       uuid;
  usr       uuid;
  r         jsonb;
  tr        jsonb;
  got       numeric;
  want      numeric;
  before_n  int;
  after_n   int;
  proj      uuid;
  victim    uuid;
  refused   boolean;
  kind      text;
begin
  select id into adm from public.admins where not must_change_password limit 1;
  select p.id into usr from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  if adm is null or usr is null then
    raise exception 'Needs one admin and one normal user already in the database.';
  end if;

  -- ---- act as the admin --------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_ratings()::jsonb;
  tr := public.admin_transactions()::jsonb;

  -- 1. The shape: both kinds and the offers, five star counts each
  res := res || case when r ? 'freelancers' and r ? 'clients' and r ? 'offers' then 'PASS' else 'FAIL' end
         || ' ratings has freelancers, clients and offers' || E'\n';
  res := res || case when jsonb_array_length(r -> 'freelancers' -> 'stars') = 5
                      and jsonb_array_length(r -> 'clients' -> 'stars') = 5 then 'PASS' else 'FAIL' end
         || ' five star counts for each kind' || E'\n';

  -- 2. The star counts add up to the count, and the average is the mean of them
  foreach kind in array array['freelancers', 'clients'] loop
    select coalesce(sum(v::numeric), 0) into got from jsonb_array_elements_text(r -> kind -> 'stars') v;
    res := res || case when got = (r -> kind ->> 'count')::numeric then 'PASS' else 'FAIL' end
           || ' ' || kind || ': star counts add up to the count (' || got || ')' || E'\n';

    select coalesce(sum(v::numeric * i), 0) into got
      from jsonb_array_elements_text(r -> kind -> 'stars') with ordinality as e(v, i);
    want := (r -> kind ->> 'count')::numeric;
    if want = 0 then
      res := res || case when r -> kind -> 'average' = 'null'::jsonb then 'PASS' else 'FAIL' end
             || ' ' || kind || ': no ratings gives a null average' || E'\n';
    else
      res := res || case when abs(got / want - (r -> kind ->> 'average')::numeric) < 0.01 then 'PASS' else 'FAIL' end
             || ' ' || kind || ': average is the mean of the stars' || E'\n';
    end if;
  end loop;

  -- 3. The numbers match counting the tables directly (read as the owner)
  reset role;
  -- A rating belongs to the role the person had on that project, not to their
  -- account type today (people can switch).
  foreach kind in array array['freelancer', 'client'] loop
    select count(*) into want
      from public.project_ratings pr
      join public.projects j on j.id = pr.project_id
     where (case when pr.ratee_id = j.freelancer_id then 'freelancer' else 'client' end) = kind
       and public.rating_is_visible(pr.project_id)
       and not exists (select 1 from public.archived_users a where a.user_id in (pr.rater_id, pr.ratee_id));
    got := (r -> (kind || 's') ->> 'count')::numeric;
    res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end
           || ' ' || kind || ' rating count matches the table' || E'\n';
  end loop;

  select count(*) into want from public.service_reviews;
  got := (r -> 'offers' ->> 'count')::numeric;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end
         || ' offer review count matches the table' || E'\n';

  select coalesce(round(avg(stars), 2), -1) into want from public.service_reviews;
  got := coalesce((r -> 'offers' ->> 'average')::numeric, -1);
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end
         || ' offer review average matches the table' || E'\n';

  select count(*) into want from public.bookings;
  got := (tr -> 'bookings' ->> 'pending')::int + (tr -> 'bookings' ->> 'accepted')::int
       + (tr -> 'bookings' ->> 'declined')::int + (tr -> 'bookings' ->> 'cancelled')::int;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end
         || ' the four booking numbers add up to every booking' || E'\n';

  select count(*) into want from public.bookings where status = 'accepted';
  res := res || case when (tr -> 'bookings' ->> 'accepted')::int = want then 'PASS' else 'FAIL' end
         || ' accepted bookings match' || E'\n';

  select count(*) into want from public.projects;
  got := (tr -> 'projects' ->> 'started')::int + (tr -> 'projects' ->> 'submitted')::int
       + (tr -> 'projects' ->> 'done')::int;
  res := res || case when got = want then 'PASS' else 'FAIL (' || got || ' vs ' || want || ')' end
         || ' the three project numbers add up to every project' || E'\n';

  select count(*) into want from public.projects where status = 'done';
  res := res || case when (tr -> 'projects' ->> 'done')::int = want then 'PASS' else 'FAIL' end
         || ' done projects match' || E'\n';

  -- 4. A blind rating is not counted until it is revealed. Take a project with
  --    exactly one rating, make it "just completed" (hidden), then 15 days old
  --    (revealed): the count must go up by exactly one.
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
    r := public.admin_ratings()::jsonb;
    before_n := (r -> 'freelancers' ->> 'count')::int + (r -> 'clients' ->> 'count')::int;
    reset role;
    update public.projects set completed_at = now() - interval '15 days' where id = proj;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.admin_ratings()::jsonb;
    after_n := (r -> 'freelancers' ->> 'count')::int + (r -> 'clients' ->> 'count')::int;
    res := res || case when after_n = before_n + 1 then 'PASS' else 'FAIL (' || before_n || ' -> ' || after_n || ')' end
           || ' a rating hidden by the blind rule is counted only once revealed' || E'\n';
    reset role;
  end if;

  -- 5. Archived people are left out: archive the person a rating is about.
  select pr.ratee_id into victim
    from public.project_ratings pr
   where public.rating_is_visible(pr.project_id)
     and not exists (select 1 from public.archived_users a where a.user_id in (pr.rater_id, pr.ratee_id))
   limit 1;
  if victim is null then
    res := res || 'SKIP no visible rating to test archiving on' || E'\n';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.admin_ratings()::jsonb;
    before_n := (r -> 'freelancers' ->> 'count')::int + (r -> 'clients' ->> 'count')::int;
    reset role;
    insert into public.archived_users (user_id) values (victim);
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.admin_ratings()::jsonb;
    after_n := (r -> 'freelancers' ->> 'count')::int + (r -> 'clients' ->> 'count')::int;
    res := res || case when after_n < before_n then 'PASS' else 'FAIL (' || before_n || ' -> ' || after_n || ')' end
           || ' ratings of an archived person are not counted' || E'\n';
    reset role;
  end if;

  -- ---- a normal user and the signed-out visitor are refused ---------------
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin
    perform public.admin_ratings();
  exception when others then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a normal user is refused (ratings)' || E'\n';
  refused := false;
  begin
    perform public.admin_transactions();
  exception when others then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a normal user is refused (transactions)' || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  refused := false;
  begin
    perform public.admin_ratings();
  exception when others then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a signed-out visitor is refused (ratings)' || E'\n';
  refused := false;
  begin
    perform public.admin_transactions();
  exception when others then
    refused := true;
  end;
  res := res || case when refused then 'PASS' else 'FAIL' end || ' a signed-out visitor is refused (transactions)' || E'\n';
  reset role;

  raise exception E'ADMIN RATINGS TEST RESULTS:\n%', res;
end;
$t$;
