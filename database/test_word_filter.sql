-- Test for supabase_word_filter_schema.sql. Run it in the Supabase SQL Editor
-- AFTER the schema file. It borrows rows and accounts that already exist, makes
-- changes, reads them back and ends with an error on purpose, so EVERYTHING it
-- did is rolled back. Read the result in the error message: every line should
-- start with PASS ("SKIP" means that table has no row to borrow).
--
-- It never inserts a profile, so no user number is used (it checks that too).

create or replace function pg_temp.line(label text, ok boolean)
returns text
language sql
as $$ select case when coalesce(ok, false) then 'PASS ' else 'FAIL ' end || label || E'\n' $$;

-- ($test$ and not $$, because one of the test words has "$$" in it.)
do $test$
declare
  res text := '';
  seq_before bigint;
  seq_after bigint;
  rid uuid;
  pid uuid;
  cid uuid;
  ua uuid;
  mid uuid;
  t1 text;
  t2 text;
  t3 text;
  arr text[];
  h text;
begin
  select last_value into seq_before from public.user_number_seq;

  -- ---- A. The words themselves -------------------------------------------
  res := res || pg_temp.line('plain word', public.mask_bad_words('what the fuck is this') = 'what the *** is this');
  res := res || pg_temp.line('capitals + ending', public.mask_bad_words('FUCKING slow') = '*** slow');
  res := res || pg_temp.line('stretched letters', public.mask_bad_words('fuuuck off') = '*** off');
  res := res || pg_temp.line('star look-alike f*ck', public.mask_bad_words('f*ck that') = '*** that');
  res := res || pg_temp.line('letter look-alike fvck', public.mask_bad_words('fvck that') = '*** that');
  res := res || pg_temp.line('number look-alike sh1t', public.mask_bad_words('sh1t happens') = '*** happens');
  res := res || pg_temp.line('symbol look-alike $hit', public.mask_bad_words('$hit happens') = '*** happens');
  res := res || pg_temp.line('a$$hole', public.mask_bad_words('you a$$hole') = 'you ***');
  res := res || pg_temp.line('plural asses', public.mask_bad_words('asses') = '***');
  res := res || pg_temp.line('punctuation around', public.mask_bad_words('(shit), fuck! "bitch".') = '(***), ***! "***".');
  res := res || pg_temp.line('underscore and dash', public.mask_bad_words('fuck_you fuck-you.png') = '***_you ***-you.png');
  res := res || pg_temp.line('Filipino: tangina', public.mask_bad_words('TANGINA naman') = '*** naman');
  res := res || pg_temp.line('Filipino phrase putang ina', public.mask_bad_words('putang ina mo') = '*** mo');
  res := res || pg_temp.line('Filipino: gago ka', public.mask_bad_words('gago ka') = '*** ka');
  res := res || pg_temp.line('two words in one text', public.mask_bad_words('shit and fuck') = '*** and ***');
  res := res || pg_temp.line('clean text is unchanged',
    public.mask_bad_words('computer reputation class assistant assess classic Scunthorpe shiitake Dickson cocktail passion bass pass mass grass assassin assume cockpit analyst title prickly potato putting cocker computation')
      = 'computer reputation class assistant assess classic Scunthorpe shiitake Dickson cocktail passion bass pass mass grass assassin assume cockpit analyst title prickly potato putting cocker computation');
  res := res || pg_temp.line('already hidden text stays hidden',
    public.mask_bad_words(public.mask_bad_words('fuck f*ck shit')) = public.mask_bad_words('fuck f*ck shit'));
  res := res || pg_temp.line('stars alone are not a word', public.has_bad_word('***') = false);
  res := res || pg_temp.line('has_bad_word yes/no', public.has_bad_word('you bitch') and not public.has_bad_word('you are kind'));
  res := res || pg_temp.line('null text', public.mask_bad_words(null) is null and public.has_bad_word(null) = false);

  -- ---- B. The triggers (borrowed rows, changed, read back) ----------------
  select id into rid from public.services limit 1;
  if rid is null then res := res || E'SKIP services (no row)\n'; else
    update public.services set title = 'fuck logo', description = 'a shit job, see computer', skill = 'Dammit' where id = rid;
    select title, description, skill into t1, t2, t3 from public.services where id = rid;
    res := res || pg_temp.line('services title, description, skill', t1 = '*** logo' and t2 = 'a *** job, see computer' and t3 = '***');
  end if;

  select id into rid from public.job_posts limit 1;
  if rid is null then res := res || E'SKIP job_posts (no row)\n'; else
    update public.job_posts set title = 'no bullshit', description = 'tangina ng client', skills = array['design', 'shit'] where id = rid;
    select title, description, skills into t1, t2, arr from public.job_posts where id = rid;
    res := res || pg_temp.line('job_posts title, description, skills list', t1 = 'no ***' and t2 = '*** ng client' and arr = array['design', '***']);
  end if;

  select id into rid from public.portfolio_items limit 1;
  if rid is null then res := res || E'SKIP portfolio_items (no row)\n'; else
    update public.portfolio_items set title = 'shit poster', description = 'for the damn client', tags = array['logo', 'fuck'] where id = rid;
    select title, description, tags into t1, t2, arr from public.portfolio_items where id = rid;
    res := res || pg_temp.line('portfolio_items title, description, tags', t1 = '*** poster' and t2 = 'for the *** client' and arr = array['logo', '***']);
  end if;

  select id into pid from public.profiles order by created_at limit 1;
  update public.profiles set description = 'what the fuck, i love design', skills = array['ok', 'bitch'] where id = pid;
  select description, skills into t1, arr from public.profiles where id = pid;
  res := res || pg_temp.line('profiles description + skills list', t1 = 'what the ***, i love design' and arr = array['ok', '***']);

  select id into rid from public.job_applications limit 1;
  if rid is null then res := res || E'SKIP job_applications (no row)\n'; else
    update public.job_applications set cover_note = 'i am not a gago' where id = rid;
    select cover_note into t1 from public.job_applications where id = rid;
    res := res || pg_temp.line('job_applications cover_note', t1 = 'i am not a ***');
  end if;

  select id into rid from public.bookings limit 1;
  if rid is null then res := res || E'SKIP bookings (no row)\n'; else
    update public.bookings set title = 'shit logo', note = 'asap, damn it' where id = rid;
    select title, note into t1, t2 from public.bookings where id = rid;
    res := res || pg_temp.line('bookings title, note', t1 = '*** logo' and t2 = 'asap, *** it');
  end if;

  select id into rid from public.projects limit 1;
  if rid is null then res := res || E'SKIP projects (no row)\n'; else
    update public.projects set title = 'shit project', note = 'ulol', submission_message = 'here you go, asshole' where id = rid;
    select title, note, submission_message into t1, t2, t3 from public.projects where id = rid;
    res := res || pg_temp.line('projects title, note, submission_message', t1 = '*** project' and t2 = '***' and t3 = 'here you go, ***');
  end if;

  select id into rid from public.project_ratings limit 1;
  if rid is null then res := res || E'SKIP project_ratings (no row)\n'; else
    update public.project_ratings set feedback = 'bullshit work' where id = rid;
    select feedback into t1 from public.project_ratings where id = rid;
    res := res || pg_temp.line('project_ratings feedback', t1 = '*** work');
  end if;

  select id into rid from public.service_reviews limit 1;
  if rid is null then res := res || E'SKIP service_reviews (no row)\n'; else
    update public.service_reviews set comment = 'slow as fuck' where id = rid;
    select comment into t1 from public.service_reviews where id = rid;
    res := res || pg_temp.line('service_reviews comment', t1 = 'slow as ***');
  end if;

  select id into rid from public.reports limit 1;
  if rid is null then res := res || E'SKIP reports (no row)\n'; else
    update public.reports set details = 'he called me a bitch' where id = rid;
    select details into t1 from public.reports where id = rid;
    res := res || pg_temp.line('reports details', t1 = 'he called me a ***');
  end if;

  select id into rid from public.appeals limit 1;
  if rid is null then res := res || E'SKIP appeals (no row)\n'; else
    update public.appeals set message = 'this is bullshit' where id = rid;
    select message into t1 from public.appeals where id = rid;
    res := res || pg_temp.line('appeals message', t1 = 'this is ***');
  end if;

  -- Chat: a new message, an edit, a file name, and the inbox preview. The e-mail
  -- trigger is switched off for this test only (it rolls back with the rest).
  select id, user_a into cid, ua from public.conversations limit 1;
  if cid is null then res := res || E'SKIP messages (no conversation)\n'; else
    alter table public.messages disable trigger email_offline_on_message;
    insert into public.messages (conversation_id, sender_id, body)
      values (cid, ua, 'you are a fucking idiot')
      returning id, body into mid, t1;
    select last_message_preview into t2 from public.conversations where id = cid;
    res := res || pg_temp.line('messages new text', t1 = 'you are a *** idiot');
    res := res || pg_temp.line('inbox preview is clean', t2 like '%***%' and t2 not like '%fuck%');

    update public.messages set body = 'what the shit', edited_at = now() where id = mid;
    select body into t1 from public.messages where id = mid;
    res := res || pg_temp.line('messages edit', t1 = 'what the ***');

    update public.messages set attachment_name = 'fuck-you.png' where id = mid;
    select attachment_name into t1 from public.messages where id = mid;
    res := res || pg_temp.line('messages file name', t1 = '***-you.png');
  end if;

  -- ---- C. Names and usernames are refused ---------------------------------
  -- The 7-day name wait is switched off for this test only (it rolls back).
  alter table public.profiles disable trigger profiles_name_cooldowns;

  begin
    update public.profiles set full_name = 'Fuck Off' where id = pid;
    res := res || E'FAIL bad name was accepted\n';
  exception when others then
    res := res || pg_temp.line('bad name refused', sqlerrm like '%bad words in your name%');
  end;

  foreach h in array array['fuck123', 'xx_fuck_xx', 'fvck_you', '99shit', 'Gago.Master', 'tangina'] loop
    begin
      update public.profiles set username = h where id = pid;
      res := res || 'FAIL bad username accepted: ' || h || E'\n';
    exception when others then
      res := res || pg_temp.line('bad username refused: ' || h, sqlerrm like '%bad words in your username%');
    end;
  end loop;

  foreach h in array array['computer_pro', 'class2024', 'reputation', 'assistant7', 'scunthorpe_zz'] loop
    begin
      update public.profiles set username = h where id = pid;
      res := res || pg_temp.line('clean username allowed: ' || h, true);
    exception when others then
      res := res || 'FAIL clean username refused: ' || h || ' (' || sqlerrm || E')\n';
    end;
  end loop;

  begin
    update public.profiles set full_name = 'Dickson Dela Cruz' where id = pid;
    res := res || pg_temp.line('clean name allowed (Dickson)', true);
  exception when others then
    res := res || 'FAIL clean name refused: ' || sqlerrm || E'\n';
  end;

  -- ---- D. A signed-in person (not the owner) is covered too ---------------
  -- The person typing can't read blocked_words; the trigger runs as the owner.
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set description = 'shit happens' where id = pid;
    reset role;
    select description into t1 from public.profiles where id = pid;
    res := res || pg_temp.line('signed-in person is covered', t1 = '*** happens');
  exception when others then
    reset role;
    res := res || 'FAIL signed-in update: ' || sqlerrm || E'\n';
  end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- ---- E. Housekeeping -----------------------------------------------------
  res := res || pg_temp.line('13 triggers exist (12 hide, 1 refuse names)',
    (select count(*) from pg_trigger where not tgisinternal and tgname in (
      'messages_mask_words', 'services_mask_words', 'job_posts_mask_words', 'portfolio_items_mask_words',
      'profiles_mask_words', 'profiles_name_words', 'job_applications_mask_words', 'bookings_mask_words',
      'projects_mask_words', 'project_ratings_mask_words', 'service_reviews_mask_words',
      'reports_mask_words', 'appeals_mask_words')) = 13);
  -- The yes/no question the sign-up form asks (without the list leaking).
  res := res || pg_temp.line('bad_word_in_name: name', public.bad_word_in_name('Fuck Off', 'okay_user') = 'name');
  res := res || pg_temp.line('bad_word_in_name: username', public.bad_word_in_name('Maria Santos', 'xx_fuck_xx') = 'username');
  res := res || pg_temp.line('bad_word_in_name: both fine', public.bad_word_in_name('Maria Santos', 'class2024') is null);
  res := res || pg_temp.line('bad_word_in_name: only the asked one', public.bad_word_in_name(null, 'maria') is null);
  res := res || pg_temp.line('the website may ask it, not read the list',
    has_function_privilege('anon', 'public.bad_word_in_name(text, text)', 'execute')
    and not has_function_privilege('anon', 'public.bad_word_pattern()', 'execute'));
  res := res || pg_temp.line('blocked_words is closed to the website',
    not has_table_privilege('authenticated', 'public.blocked_words', 'select')
    and not has_table_privilege('anon', 'public.blocked_words', 'select'));

  select last_value into seq_after from public.user_number_seq;
  res := res || pg_temp.line('no user number used', seq_before = seq_after);

  raise exception E'\n%\n(rolled back on purpose)', res;
end;
$test$;
