-- Hide curse words. Run this in the Supabase SQL Editor (or apply it as a
-- migration). No website change is needed to start: the website only draws the
-- result (see client/src/components/CensoredText.jsx).
--
-- What it does:
--   * Anything typed that holds a blocked word is SAVED with that word replaced
--     by three stars (***), so every place that shows the text (the other
--     person's chat, an admin's report, the e-mail to an offline person, the
--     inbox preview) gets the clean version. It is done in the database so it
--     also covers the AI service and anyone calling the API directly.
--   * A name or username that holds a blocked word is REFUSED instead (a name
--     of *** is no name).
--   * Whole words only, so "computer", "reputation", "class" and "assistant"
--     stay as they are. It also catches capitals, stretched letters (fuuuck),
--     number and symbol look-alikes (sh1t, $hit, f*ck, fvck) and endings (-s -ed -ing).
--   * Spaced-out letters (f u c k) and other tricks are NOT caught. No filter is
--     perfect; add words to blocked_words to widen it.
--
-- Why three stars: a column that is a varchar(n) can never overflow, because
-- every blocked word is at least three letters long.
--
-- Left alone on purpose: a freelancer's own written work (portfolio_items.body,
-- slide_texts), text the admins write, voice, photos and video.
--
-- Written with no destructive statements. To apply it to rows saved BEFORE this
-- file, see the one-time clean-up at the bottom (run it separately, on purpose).

-- ---------------------------------------------------------------------------
-- 1. The list of blocked words (lowercase letters, a space for a two-word
--    phrase). Nobody can read or change it from the website.
-- ---------------------------------------------------------------------------

create table if not exists public.blocked_words (
  word text primary key
    check (word ~ '^[a-z]+( [a-z]+)*$' and char_length(word) between 3 and 40),
  added_at timestamptz not null default now()
);

alter table public.blocked_words enable row level security;
revoke all on public.blocked_words from anon, authenticated;

-- Starter list: English, then Filipino / Taglish. Left out on purpose because
-- they are also normal words: hell, crap, cock (cocker spaniel), cum (cum laude),
-- leche (leche flan), puto (the rice cake), bobo and tanga (plain insults).
insert into public.blocked_words (word) values
  -- English
  ('fuck'), ('fck'), ('fuk'), ('fuq'), ('motherfuck'), ('mofo'),
  ('shit'), ('shitty'), ('bullshit'), ('horseshit'), ('shithead'), ('dipshit'),
  ('bitch'), ('bitchy'), ('biatch'),
  ('ass'), ('asshole'), ('jackass'), ('dumbass'),
  ('bastard'), ('damn'), ('dammit'), ('damnit'), ('goddamn'),
  ('cunt'), ('twat'), ('wanker'), ('bollocks'), ('prick'),
  ('dick'), ('dickhead'), ('cocksucker'), ('pussy'),
  ('whore'), ('slut'), ('slutty'),
  ('piss'), ('pissy'), ('douche'), ('douchebag'),
  ('blowjob'), ('handjob'), ('cumshot'), ('jerk off'),
  ('wtf'), ('stfu'), ('gtfo'),
  ('nigger'), ('nigga'), ('faggot'), ('fag'), ('retard'), ('retarded'), ('tranny'),
  -- Filipino / Taglish
  ('putangina'), ('putang ina'), ('tangina'), ('tang ina'), ('tanginamo'),
  ('kingina'), ('kinangina'), ('potangina'), ('putragis'), ('punyeta'),
  ('puta'), ('pota'), ('pakshet'), ('pakyu'),
  ('gago'), ('ulol'), ('kupal'), ('tarantado'), ('hayop ka'), ('animal ka'),
  ('buwisit'), ('bwisit'), ('lintik'), ('hinayupak'), ('shunga'), ('gunggong'),
  ('burat'), ('tite'), ('titi'), ('puki'), ('pekpek'), ('kantot'), ('kantutan'),
  ('jakol'), ('hindot'), ('pokpok')
on conflict (word) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The functions.
-- ---------------------------------------------------------------------------

-- Builds one pattern out of the whole list. Each letter allows stretching
-- (u+) and its look-alikes; a space in a phrase allows any spaces or none. The
-- word must not touch another letter or digit, so "reputation" is safe.
create or replace function public.bad_word_pattern()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w text;
  ch text;
  one text;
  alts text[] := '{}';
begin
  for w in select word from public.blocked_words order by char_length(word) desc, word loop
    one := '';
    for ch in select regexp_split_to_table(w, '') loop
      one := one || case ch
        when ' ' then '\s*'
        when 'a' then '[a@4*]+'
        when 'e' then '[e3*]+'
        when 'i' then '[i1!*]+'
        when 'o' then '[o0*]+'
        when 'u' then '[uv*]+'
        when 's' then '[s$5]+'
        when 't' then '[t7+]+'
        else ch || '+'
      end;
    end loop;
    alts := alts || one;
  end loop;

  -- An empty list must match nothing.
  if cardinality(alts) = 0 then
    return '(?!)';
  end if;

  return '(?<![[:alnum:]])(?:' || array_to_string(alts, '|') || ')(?:s|es|ed|er|ers|ing|in)?(?![[:alnum:]])';
end;
$$;

-- The text with every blocked word replaced by ***.
create or replace function public.mask_bad_words(input text)
returns text
language sql
stable
set search_path = public
as $$
  select regexp_replace(input, public.bad_word_pattern(), '***', 'gi');
$$;

-- Yes or no: does the text hold a blocked word?
create or replace function public.has_bad_word(input text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(input ~* public.bad_word_pattern(), false);
$$;

revoke execute on function public.bad_word_pattern() from public, anon, authenticated;
revoke execute on function public.mask_bad_words(text) from public, anon, authenticated;
revoke execute on function public.has_bad_word(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The triggers.
-- ---------------------------------------------------------------------------

-- One trigger function for every table: the columns to clean are passed in the
-- trigger's arguments (text, varchar, and text[] lists like skills and tags).
-- On an update only a column that really changed is touched, so an old row is
-- never rewritten behind its owner's back. It runs as the table owner because
-- the person typing cannot read blocked_words.
create or replace function public.mask_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pat text := public.bad_word_pattern();
  newrow jsonb := to_jsonb(new);
  oldrow jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  col text;
  newval jsonb;
  masked jsonb;
begin
  foreach col in array tg_argv loop
    newval := newrow -> col;
    continue when newval is null or jsonb_typeof(newval) = 'null';
    if tg_op = 'UPDATE' and newval is not distinct from (oldrow -> col) then
      continue;
    end if;

    if jsonb_typeof(newval) = 'string' then
      masked := to_jsonb(regexp_replace(newval #>> '{}', pat, '***', 'gi'));
    elsif jsonb_typeof(newval) = 'array' then
      select coalesce(
               jsonb_agg(
                 case when jsonb_typeof(t.e) = 'string'
                      then to_jsonb(regexp_replace(t.e #>> '{}', pat, '***', 'gi'))
                      else t.e end
                 order by t.n),
               '[]'::jsonb)
        into masked
        from jsonb_array_elements(newval) with ordinality as t(e, n);
    else
      continue;
    end if;

    if masked is distinct from newval then
      new := jsonb_populate_record(new, jsonb_build_object(col, masked));
    end if;
  end loop;

  return new;
end;
$$;

-- A name or username with a blocked word is refused. Only a new profile or a
-- changed value is checked, so someone who already has such a name can still
-- change other things. For a username, "_ . -" count as spaces and digits at
-- either end are ignored, so xx_fuck_xx and fuck123 are caught.
create or replace function public.refuse_bad_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pat text := public.bad_word_pattern();
  handle text;
begin
  if tg_op = 'INSERT' or new.full_name is distinct from old.full_name then
    if coalesce(new.full_name, '') ~* pat then
      raise exception 'Please don''t use bad words in your name.' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' or new.username is distinct from old.username then
    handle := regexp_replace(lower(coalesce(new.username, '')), '[_.\-]+', ' ', 'g');
    if handle ~* pat
       or regexp_replace(handle, '(^|\s)[0-9]+|[0-9]+(\s|$)', ' ', 'g') ~* pat then
      raise exception 'Please don''t use bad words in your username.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.mask_columns() from public, anon, authenticated;
revoke execute on function public.refuse_bad_name() from public, anon, authenticated;

-- Triggers run in name order. Each one watches only its own columns, so
-- ordinary updates (presence, ratings counters...) don't pay for it.
-- profiles_name_words comes after profiles_name_cooldowns / profiles_name_policy
-- and before profiles_user_number, so a refused sign-up burns no user number.

-- Chat (also edits and forwards; the inbox preview and a report's copy of the
-- messages are filled from the already clean text).
create or replace trigger messages_mask_words
  before insert or update of body, attachment_name on public.messages
  for each row execute function public.mask_columns('body', 'attachment_name');

-- Posts
create or replace trigger services_mask_words
  before insert or update of title, description, skill on public.services
  for each row execute function public.mask_columns('title', 'description', 'skill');

create or replace trigger job_posts_mask_words
  before insert or update of title, description, skills on public.job_posts
  for each row execute function public.mask_columns('title', 'description', 'skills');

-- Portfolio (the title, description and tags; not the written piece itself).
create or replace trigger portfolio_items_mask_words
  before insert or update of title, description, tags on public.portfolio_items
  for each row execute function public.mask_columns('title', 'description', 'tags');

-- Profile
create or replace trigger profiles_mask_words
  before insert or update of description, skills on public.profiles
  for each row execute function public.mask_columns('description', 'skills');

create or replace trigger profiles_name_words
  before insert or update of full_name, username on public.profiles
  for each row execute function public.refuse_bad_name();

-- Working together
create or replace trigger job_applications_mask_words
  before insert or update of cover_note on public.job_applications
  for each row execute function public.mask_columns('cover_note');

create or replace trigger bookings_mask_words
  before insert or update of title, note on public.bookings
  for each row execute function public.mask_columns('title', 'note');

create or replace trigger projects_mask_words
  before insert or update of title, note, submission_message on public.projects
  for each row execute function public.mask_columns('title', 'note', 'submission_message');

create or replace trigger project_ratings_mask_words
  before insert or update of feedback on public.project_ratings
  for each row execute function public.mask_columns('feedback');

create or replace trigger service_reviews_mask_words
  before insert or update of comment on public.service_reviews
  for each row execute function public.mask_columns('comment');

-- To the admins
create or replace trigger reports_mask_words
  before insert or update of details on public.reports
  for each row execute function public.mask_columns('details');

create or replace trigger appeals_mask_words
  before insert or update of message on public.appeals
  for each row execute function public.mask_columns('message');

-- ---------------------------------------------------------------------------
-- 4. ONE-TIME CLEAN-UP of rows saved before this file (run on purpose, after
--    looking at the counts). Kept as comments so applying this file never
--    rewrites old rows by accident. Count first:
--
--   select 'messages' as tbl, count(*) from public.messages
--     where public.has_bad_word(body) or public.has_bad_word(attachment_name)
--   union all select 'services', count(*) from public.services
--     where public.has_bad_word(title) or public.has_bad_word(description) or public.has_bad_word(skill)
--   union all select 'job_posts', count(*) from public.job_posts
--     where public.has_bad_word(title) or public.has_bad_word(description)
--   ... (the same for the other tables and columns above)
--
-- Then clean a table by updating its columns to themselves with a changed
-- value, for example:
--
--   update public.messages set body = public.mask_bad_words(body)
--     where public.has_bad_word(body);
-- ---------------------------------------------------------------------------
