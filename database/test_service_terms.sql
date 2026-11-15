-- Rolled-back test of supabase_service_terms_schema.sql (2026-11-15): run after
-- the schema file. It ends with raise exception, so nothing it changes is kept;
-- the PASS/FAIL lines come back in the error message.

do $$
declare
  out text := '';
  s uuid; f uuid; c uuid; b uuid;
  rev text; terms text;
begin
  select id, freelancer_id into s, f from public.services order by created_at limit 1;
  select id into c from public.profiles where account_type = 'client' and id <> f order by created_at limit 1;

  update public.services set revisions = '2', extra_terms = 'Extra revisions cost 300 each. No shit work.' where id = s;
  select revisions, extra_terms into rev, terms from public.services where id = s;
  out := out || E'\n' || case when rev = '2' then 'PASS' else 'FAIL' end || ' an offer saves 2 revisions';
  out := out || E'\n' || case when terms like 'Extra revisions cost 300 each.%' and terms not like '%shit%' then 'PASS' else 'FAIL' end || ' bad words in the terms are hidden: ' || terms;

  begin
    update public.services set revisions = '7' where id = s;
    out := out || E'\nFAIL 7 revisions was accepted';
  exception when check_violation then
    out := out || E'\nPASS 7 revisions is refused';
  end;

  begin
    update public.services set extra_terms = repeat('a', 501) where id = s;
    out := out || E'\nFAIL 501 characters of terms were accepted';
  exception when check_violation then
    out := out || E'\nPASS 501 characters of terms are refused';
  end;

  insert into public.bookings (client_id, freelancer_id, service_id, title, due_date, revisions, extra_terms)
    values (c, f, s, 'Test booking', current_date + 7, 'unlimited', 'typed by the client')
    returning id, revisions, extra_terms into b, rev, terms;
  out := out || E'\n' || case when rev = '2' and terms like 'Extra revisions cost 300 each.%' then 'PASS' else 'FAIL' end || ' a new booking gets the offer''s revisions and terms, not what was sent: ' || coalesce(rev, 'null');

  update public.services set revisions = '5', extra_terms = 'New terms' where id = s;
  select revisions, extra_terms into rev, terms from public.bookings where id = b;
  out := out || E'\n' || case when rev = '2' and terms like 'Extra revisions%' then 'PASS' else 'FAIL' end || ' editing the offer later does not change the booking';

  update public.bookings set revisions = '0', extra_terms = 'changed', status = 'accepted' where id = b;
  select revisions, extra_terms into rev, terms from public.bookings where id = b;
  out := out || E'\n' || case when rev = '2' and terms like 'Extra revisions%' then 'PASS' else 'FAIL' end || ' a booking''s revisions and terms can''t be changed afterwards';
  out := out || E'\n' || case when (select status from public.bookings where id = b) = 'accepted' then 'PASS' else 'FAIL' end || ' other booking changes still work';

  insert into public.bookings (client_id, freelancer_id, service_id, title, due_date)
    values (c, f, null, 'No offer', current_date + 7) returning revisions, extra_terms into rev, terms;
  out := out || E'\n' || case when rev is null and terms is null then 'PASS' else 'FAIL' end || ' a booking without an offer has none';

  raise exception 'TEST RESULTS (rolled back):%', out;
end $$;
