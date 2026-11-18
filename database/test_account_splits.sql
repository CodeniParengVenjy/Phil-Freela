-- Rolled-back test of supabase_account_splits_schema.sql (2026-11-18): run
-- after the schema file. It ends with raise exception, so nothing it changes is
-- kept; the PASS/FAIL lines come back in the error message. It borrows real
-- accounts (inside the test only): a client account that still has freelancer
-- work (the "old" account), a freelancer account with no block (the "new" one),
-- and a client account with no freelancer work. Result on the live database
-- before applying (2026-11-18): 14/14 PASS (moved 4 offers, 4 bookings,
-- 3 projects, 1 portfolio piece, 4 ratings; the one application with a resume
-- stayed). The client side was tried the same way after applying: 2/2 PASS.

do $$
declare
  out text := '';
  old_acc uuid;
  new_acc uuid;
  plain_client uuid;
  before_old jsonb;
  after_old jsonb;
  after_new jsonb;
  started jsonb;
  again jsonb;
  moved jsonb;
  summary jsonb;
  t text;
begin
  -- A client with freelancer work left over from switching.
  select p.id into old_acc from public.profiles p
    where p.account_type = 'client' and not public.split_blocked(p.id)
      and (select sum(value::int) from jsonb_each_text(public.split_side_counts(p.id, 'freelancer'))) > 0
    order by p.created_at limit 1;
  select p.id into new_acc from public.profiles p
    where p.account_type = 'freelancer' and not public.split_blocked(p.id)
    order by p.created_at limit 1;
  select p.id into plain_client from public.profiles p
    where p.account_type = 'client' and p.id <> old_acc and not public.split_blocked(p.id)
      and (select sum(value::int) from jsonb_each_text(public.split_side_counts(p.id, 'freelancer'))) = 0
    order by p.created_at limit 1;
  if old_acc is null or new_acc is null or plain_client is null then
    raise exception 'TEST SETUP: missing a borrowed account (old %, new %, plain %)', old_acc, new_acc, plain_client;
  end if;
  before_old := public.split_side_counts(old_acc, 'freelancer');
  after_new := public.split_side_counts(new_acc, 'freelancer');

  -- 1. An account with nothing from the other side gets no code.
  perform set_config('request.jwt.claims', json_build_object('sub', plain_client, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.start_account_split();
    out := out || E'\nFAIL an account with nothing to move got a code';
  exception when raise_exception then
    out := out || E'\nPASS an account with nothing to move gets no code';
  end;
  reset role;

  -- 2. The old account sees its other side and gets a code; asking again shows the same code.
  perform set_config('request.jwt.claims', json_build_object('sub', old_acc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  summary := public.my_split_summary();
  out := out || case when summary->>'move_side' = 'freelancer' and (summary->>'total')::int > 0
    then E'\nPASS the summary shows the freelancer work to move' else E'\nFAIL summary: ' || summary::text end;
  started := public.start_account_split();
  again := public.start_account_split();
  out := out || case when started->>'code' ~ '^[A-HJ-NP-Z2-9]{8}$' then E'\nPASS the code has 8 easy letters' else E'\nFAIL code: ' || coalesce(started->>'code', 'null') end;
  out := out || case when again->>'code' = started->>'code' then E'\nPASS asking again shows the same code' else E'\nFAIL a second code was made' end;
  -- The code can't be used on the account that made it.
  begin
    perform public.finish_account_split(started->>'code');
    out := out || E'\nFAIL the old account used its own code';
  exception when raise_exception then
    out := out || E'\nPASS the old account cannot use its own code';
  end;
  -- Nobody can write the table directly.
  begin
    insert into public.account_splits (from_user, move_side, code) values (old_acc, 'freelancer', 'ABCDEFGH');
    out := out || E'\nFAIL a direct insert worked';
  exception when insufficient_privilege then
    out := out || E'\nPASS a direct insert is refused';
  end;
  reset role;

  -- 3. A client account can't take freelancer work.
  perform set_config('request.jwt.claims', json_build_object('sub', plain_client, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.finish_account_split(started->>'code');
    out := out || E'\nFAIL a client account took freelancer work';
  exception when raise_exception then
    out := out || E'\nPASS a client account cannot take freelancer work';
  end;
  -- Nor can a made-up code be used.
  begin
    perform public.finish_account_split('ZZZZ2222');
    out := out || E'\nFAIL a made-up code worked';
  exception when raise_exception then
    out := out || E'\nPASS a made-up code is refused';
  end;
  reset role;

  -- 4. The new freelancer account uses the code (typed small, with a dash).
  perform set_config('request.jwt.claims', json_build_object('sub', new_acc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  moved := public.finish_account_split(lower(substr(started->>'code', 1, 4) || '-' || substr(started->>'code', 5)));
  out := out || E'\nINFO moved: ' || moved::text;
  -- Used once only.
  begin
    perform public.finish_account_split(started->>'code');
    out := out || E'\nFAIL the code worked twice';
  exception when raise_exception then
    out := out || E'\nPASS the code works only once';
  end;
  reset role;

  -- 5. Everything moved: the old account has no freelancer work left, the new one has it all.
  after_old := public.split_side_counts(old_acc, 'freelancer');
  out := out || case when (select sum(value::int) from jsonb_each_text(after_old)) = 0
    then E'\nPASS the old account has no freelancer work left' else E'\nFAIL left on old: ' || after_old::text end;
  out := out || case when (public.split_side_counts(new_acc, 'freelancer')->>'offers')::int
                          = (after_new->>'offers')::int + (before_old->>'offers')::int
    then E'\nPASS the new account got the offers' else E'\nFAIL offers did not add up' end;
  out := out || case when (public.split_side_counts(new_acc, 'freelancer')->>'projects')::int
                          = (after_new->>'projects')::int + (before_old->>'projects')::int
    then E'\nPASS the new account got the projects' else E'\nFAIL projects did not add up' end;
  select account_type::text into t from public.profiles where id = old_acc;
  out := out || case when t = 'client' then E'\nPASS the old account is still a client' else E'\nFAIL old account role is ' || t end;

  -- 6. The old account's card now says where the work went.
  perform set_config('request.jwt.claims', json_build_object('sub', old_acc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  summary := public.my_split_summary();
  out := out || case when summary->>'moved_to' is not null and (summary->>'total')::int = 0
    then E'\nPASS the old account sees where its work went' else E'\nFAIL summary after: ' || summary::text end;
  reset role;

  -- 7. Not callable without signing in.
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.start_account_split();
    out := out || E'\nFAIL a signed-out visitor called it';
  exception when insufficient_privilege then
    out := out || E'\nPASS a signed-out visitor cannot call it';
  end;
  reset role;

  raise exception 'TEST RESULTS (rolled back):%', out;
end;
$$;
