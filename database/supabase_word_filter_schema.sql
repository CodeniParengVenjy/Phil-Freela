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
--
-- How strict it is (the word list is in blocked_words, each word has a mode):
--   * Capitals, stretched letters (fuuuck), number and symbol look-alikes
--     (sh1t, $hit, f*ck, fvck) and endings (-s -ed -ing) are always caught.
--   * The text is first "folded": full-width letters, accented letters and the
--     Cyrillic / Greek letters that look like Latin ones (a Cyrillic "с" in
--     "fuсk") become plain Latin letters before matching.
--   * 'loose' words (the English and Filipino ones) also catch letters pulled
--     apart by spaces or symbols: "Fu ck", "bo bo", "f u c k", "F.U.C.K",
--     "f_u_c_k". A split is only accepted when it leaves 2 letters or more on
--     both ends, or when EVERY letter is separated, so "put a logo" (puta) and
--     "u lol" (ulol) are never touched.
--   * 'stem' words are found inside a longer word and the whole word is hidden
--     ("fuckyou", "motherfuckers"); 'tail' words (Filipino insults) also take the
--     little words glued to them ("gagoka", "tangamo", "boboka"); 'word' words must
--     stand alone, so "computer", "reputation", "class" and "assistant" stay;
--     'exact' words are for writing with no spaces (see the languages file).
--   * allowed_words lists words that look like a blocked root but are fine
--     ("snigger" is not a slur).
--   * Not caught: a letter swapped for another look-alike we do not know, and
--     words that are not in the list. No filter is perfect; add words to
--     blocked_words to widen it.
--
-- Why three stars: a column that is a varchar(n) can never overflow, because
-- every blocked Latin-letter word is at least three letters long. (A two-
-- character Chinese, Japanese or Korean word turns into three stars, so a title
-- that is already at its very last character could be refused as too long; the
-- person just shortens it by one.)
--
-- Left alone on purpose: a freelancer's own written work (portfolio_items.body,
-- slide_texts), text the admins write, voice, photos and video.
--
-- The destructive-looking statements are only "drop constraint if exists" on
-- blocked_words itself (a word rule is replaced by a wider one, so a database
-- that has an older version of this file is upgraded). To apply the filter to
-- rows saved BEFORE this file, see the one-time clean-up at the bottom (run it
-- separately, on purpose).

-- ---------------------------------------------------------------------------
-- 1. The tables. Nobody can read or change them from the website.
--    blocked_words: a word is lowercase letters of any script, one space between
--    the words of a phrase, no digits or punctuation.
--      mode:  'word' (stands alone), 'tail' (stands alone, may carry Filipino
--             little words), 'stem' (found inside a word, the whole word goes)
--             or 'exact' (matched anywhere, for writing with no spaces).
--      loose: also catch the letters pulled apart (Latin-letter words only).
-- ---------------------------------------------------------------------------

create table if not exists public.blocked_words (
  word text primary key,
  added_at timestamptz not null default now()
);

alter table public.blocked_words add column if not exists mode text not null default 'word';
alter table public.blocked_words add column if not exists loose boolean not null default false;

alter table public.blocked_words drop constraint if exists blocked_words_mode_check;
alter table public.blocked_words add constraint blocked_words_mode_check
  check (mode in ('word', 'tail', 'stem', 'exact'));

-- The rule for the word itself: any script, no punctuation or digits (the word
-- is put into a pattern, so a "." or "*" would change what it matches), and a
-- Latin-letter word needs 3 letters.
alter table public.blocked_words drop constraint if exists blocked_words_word_check;
alter table public.blocked_words add constraint blocked_words_word_check
  check (
    word = lower(word) and word = btrim(word) and word !~ '  '
    and word !~ '[\x01-\x1f\x21-\x40\x5b-\x60\x7b-\x7e]'
    and char_length(word) between 2 and 40
    and (word !~ '^[a-z ]+$' or char_length(word) >= 3)
  );

alter table public.blocked_words enable row level security;
revoke all on public.blocked_words from anon, authenticated;

-- Words that contain a blocked 'stem' but are fine (the start of the word).
create table if not exists public.allowed_words (
  word text primary key check (word ~ '^[a-z]+$' and char_length(word) between 3 and 40),
  added_at timestamptz not null default now()
);
alter table public.allowed_words enable row level security;
revoke all on public.allowed_words from anon, authenticated;

insert into public.allowed_words (word) values ('snigger') on conflict (word) do nothing;

-- Starter list: English, then Filipino / Taglish (other languages are in
-- supabase_word_filter_languages.sql). Left out on purpose because they are
-- also normal words or names: hell, cock (cocker spaniel), cum (cum laude),
-- leche (leche flan), puto (the rice cake), gaga (Lady Gaga), inutil, tonto,
-- hudas, mangmang. Running this file again re-applies the modes below.
-- English: roots found inside a longer word ("fuckyou", "motherfuckers").
insert into public.blocked_words (word, mode, loose) values
  ('fuck', 'stem', true), ('motherfuck', 'stem', true), ('phuck', 'stem', true),
  ('bullshit', 'stem', true), ('horseshit', 'stem', true), ('shithead', 'stem', true),
  ('dipshit', 'stem', true), ('shitty', 'stem', true), ('shitshow', 'stem', true),
  ('bitch', 'stem', true), ('bitchy', 'stem', true), ('biatch', 'stem', true),
  ('asshole', 'stem', true), ('jackass', 'stem', true), ('dumbass', 'stem', true),
  ('asswipe', 'stem', true), ('asshat', 'stem', true), ('assface', 'stem', true),
  ('asskisser', 'stem', true), ('arsehole', 'stem', true),
  ('bastard', 'stem', true), ('goddamn', 'stem', true), ('dammit', 'stem', true),
  ('damnit', 'stem', true), ('douche', 'stem', true), ('douchebag', 'stem', true),
  ('cocksucker', 'stem', true), ('dickhead', 'stem', true), ('pussy', 'stem', true),
  ('whore', 'stem', true), ('slutty', 'stem', true), ('blowjob', 'stem', true),
  ('handjob', 'stem', true), ('cumshot', 'stem', true), ('nigger', 'stem', true),
  ('faggot', 'stem', true), ('tranny', 'stem', true), ('wanker', 'stem', true),
  ('bollocks', 'stem', true), ('scumbag', 'stem', true), ('crappy', 'stem', true)
on conflict (word) do update set mode = excluded.mode, loose = excluded.loose;

-- English: words that must stand alone (a short word can sit inside a normal
-- one: "Scunthorpe", "retardant", "snigger", "Pissarro").
insert into public.blocked_words (word, mode, loose) values
  ('fck', 'word', true), ('fuk', 'word', true), ('fuq', 'word', true), ('phuk', 'word', true),
  ('kunt', 'word', true), ('mofo', 'word', true), ('shit', 'word', true), ('ass', 'word', true),
  ('damn', 'word', true), ('cunt', 'word', true), ('twat', 'word', true), ('prick', 'word', true),
  ('dick', 'word', true), ('piss', 'word', true), ('pissy', 'word', true), ('slut', 'word', true),
  ('wtf', 'word', true), ('stfu', 'word', true), ('gtfo', 'word', true), ('nigga', 'word', true),
  ('fag', 'word', true), ('retard', 'word', true), ('retarded', 'word', true),
  ('crap', 'word', true), ('arse', 'word', true), ('tosser', 'word', true),
  ('bugger', 'word', true), ('feck', 'word', true), ('idiot', 'word', true),
  ('moron', 'word', true), ('imbecile', 'word', true), ('stupid', 'word', true),
  ('jerk off', 'word', false)
on conflict (word) do update set mode = excluded.mode, loose = excluded.loose;

-- Filipino / Taglish: roots found inside a longer word.
insert into public.blocked_words (word, mode, loose) values
  ('putangina', 'stem', true), ('tangina', 'stem', true), ('tanginamo', 'stem', true),
  ('kingina', 'stem', true), ('kinangina', 'stem', true), ('potangina', 'stem', true),
  ('putragis', 'stem', true), ('punyeta', 'stem', true), ('pakshet', 'stem', true),
  ('pasnea', 'stem', true), ('pakyu', 'stem', true), ('hinayupak', 'stem', true),
  ('tarantado', 'stem', true), ('tarantada', 'stem', true), ('lintik', 'stem', true),
  ('buwisit', 'stem', true), ('bwisit', 'stem', true), ('gunggong', 'stem', true),
  ('kupal', 'stem', true), ('shunga', 'stem', true), ('pekpek', 'stem', true),
  ('kantot', 'stem', true), ('kantutan', 'stem', true), ('jakol', 'stem', true),
  ('hindot', 'stem', true), ('pokpok', 'stem', true), ('amputa', 'stem', true),
  ('ampota', 'stem', true), ('ampucha', 'stem', true), ('siraulo', 'stem', true),
  ('talipandas', 'stem', true), ('lapastangan', 'stem', true), ('walanghiya', 'stem', true),
  ('lecheng', 'stem', true), ('salsal', 'stem', true), ('giatay', 'stem', true),
  ('ukinnam', 'stem', true), ('ukininam', 'stem', true), ('ukinam', 'stem', true)
on conflict (word) do update set mode = excluded.mode, loose = excluded.loose;

-- Filipino / Taglish: short words (and insults) that also take the little words
-- people glue on: gagoka, tangamo, boboka, gagong.
insert into public.blocked_words (word, mode, loose) values
  ('gago', 'tail', true), ('gagu', 'tail', true), ('ulol', 'tail', true), ('ulul', 'tail', true),
  ('bobo', 'tail', true), ('bubu', 'tail', true), ('tanga', 'tail', true), ('engot', 'tail', true),
  ('puta', 'tail', true), ('pota', 'tail', true), ('tite', 'tail', true), ('titi', 'tail', true),
  ('puki', 'tail', true), ('burat', 'tail', true), ('hangal', 'tail', true), ('pucha', 'tail', true),
  ('putcha', 'tail', true), ('putsa', 'tail', true), ('potek', 'tail', true), ('putang', 'tail', true),
  ('bilat', 'tail', true), ('yawa', 'tail', true), ('pisti', 'tail', true), ('tangna', 'tail', true),
  ('iyot', 'tail', true)
on conflict (word) do update set mode = excluded.mode, loose = excluded.loose;

-- Filipino / Taglish phrases.
insert into public.blocked_words (word, mode, loose) values
  ('putang ina', 'word', false), ('tang ina', 'word', false), ('hayop ka', 'word', false),
  ('animal ka', 'word', false), ('sira ulo', 'word', false), ('walang hiya', 'word', false)
on conflict (word) do update set mode = excluded.mode, loose = excluded.loose;

-- ---------------------------------------------------------------------------
-- 2. The functions.
-- ---------------------------------------------------------------------------

-- "Folds" a text so look-alikes become plain Latin letters, one character for
-- one character (so a position in the folded text is the same position in the
-- original): full-width letters and digits, accented letters, and the Cyrillic
-- and Greek letters that look like Latin ones. Math-style letters (bold, script)
-- are folded too when that doesn't change the length. The two lists are built
-- here once and put into the function.
do $fold$
declare
  src text := '';
  dst text := '';
  v record;
  c text;
  i int;
begin
  -- Accented Latin letters.
  for v in select * from (values
    ('a', 'àáâãäåāăąǎ'), ('A', 'ÀÁÂÃÄÅĀĂĄǍ'), ('c', 'çćĉċč'), ('C', 'ÇĆĈĊČ'),
    ('d', 'ďđ'), ('D', 'ĎĐ'), ('e', 'èéêëēĕėęě'), ('E', 'ÈÉÊËĒĔĖĘĚ'),
    ('g', 'ĝğġģ'), ('G', 'ĜĞĠĢ'), ('h', 'ĥħ'), ('H', 'ĤĦ'),
    ('i', 'ìíîïĩīĭįı'), ('I', 'ÌÍÎÏĨĪĬĮİ'), ('j', 'ĵ'), ('J', 'Ĵ'), ('k', 'ķ'), ('K', 'Ķ'),
    ('l', 'ĺļľŀł'), ('L', 'ĹĻĽĿŁ'), ('n', 'ñńņň'), ('N', 'ÑŃŅŇ'),
    ('o', 'òóôõöøōŏőǒ'), ('O', 'ÒÓÔÕÖØŌŎŐǑ'), ('r', 'ŕŗř'), ('R', 'ŔŖŘ'),
    ('s', 'śŝşš'), ('S', 'ŚŜŞŠ'), ('t', 'ţťŧ'), ('T', 'ŢŤŦ'),
    ('u', 'ùúûüũūŭůűųǔ'), ('U', 'ÙÚÛÜŨŪŬŮŰŲǓ'), ('w', 'ŵ'), ('W', 'Ŵ'),
    ('y', 'ýÿŷ'), ('Y', 'ÝŸŶ'), ('z', 'źżž'), ('Z', 'ŹŻŽ')
  ) as t(base, chars) loop
    for c in select regexp_split_to_table(v.chars, '') loop
      src := src || c;
      dst := dst || v.base;
    end loop;
  end loop;

  -- Full-width letters, digits and the symbols people use for letters.
  for i in 0..25 loop
    src := src || chr(65313 + i) || chr(65345 + i);
    dst := dst || chr(65 + i) || chr(97 + i);
  end loop;
  for i in 0..9 loop
    src := src || chr(65296 + i);
    dst := dst || chr(48 + i);
  end loop;
  src := src || chr(65290) || chr(65312) || chr(65284) || chr(65281) || chr(65291);
  dst := dst || '*@$!+';

  -- Cyrillic and Greek letters that look like Latin ones (code point, letter).
  for v in select * from (values
    (1072, 'a'), (1089, 'c'), (1077, 'e'), (1086, 'o'), (1088, 'p'), (1093, 'x'), (1091, 'y'),
    (1110, 'i'), (1112, 'j'), (1109, 's'), (1082, 'k'), (1084, 'm'), (1085, 'h'), (1090, 't'),
    (1040, 'A'), (1042, 'B'), (1045, 'E'), (1050, 'K'), (1052, 'M'), (1053, 'H'), (1054, 'O'),
    (1056, 'P'), (1057, 'C'), (1058, 'T'), (1061, 'X'), (1030, 'I'), (1032, 'J'), (1029, 'S'),
    (1059, 'Y'),
    (913, 'A'), (914, 'B'), (917, 'E'), (918, 'Z'), (919, 'H'), (921, 'I'), (922, 'K'),
    (924, 'M'), (925, 'N'), (927, 'O'), (929, 'P'), (932, 'T'), (933, 'Y'), (935, 'X'),
    (959, 'o'), (957, 'v'), (953, 'i'), (954, 'k'), (961, 'p'), (965, 'u'), (964, 't'),
    (945, 'a'), (949, 'e'), (967, 'x')
  ) as t(cp, base) loop
    src := src || chr(v.cp);
    dst := dst || v.base;
  end loop;

  execute format(
    'create or replace function public.fold_text(t text) returns text language sql immutable set search_path = public as $b$ select translate(case when char_length(normalize(t, nfkc)) = char_length(t) then normalize(t, nfkc) else t end, %L, %L) $b$',
    src, dst);
end;
$fold$;

-- One letter of a Latin-letter word as a pattern: it may be stretched (u+) and
-- may be one of its look-alikes.
create or replace function public.word_letter_class(ch text)
returns text
language sql
immutable
set search_path = public
as $$
  select case ch
    when 'a' then '[a@4*]+'
    when 'e' then '[e3*]+'
    when 'i' then '[i1!*|]+'
    when 'o' then '[o0*]+'
    when 'u' then '[uv*]+'
    when 's' then '[s$5]+'
    when 't' then '[t7+]+'
    else ch || '+'
  end
$$;

-- The pattern for every blocked word written with plain Latin letters. It is
-- matched against the FOLDED text (see fold_text).
--   A letter run:  fuuuck   (stretched letters and look-alikes)
--   loose gap:     fu ck    (after letter 2 up to 2 letters from the end, any 0-2
--                  symbols or spaces; this leaves 2+ letters on both ends)
--   loose spaced:  f u c k  (every letter separated by 1-2 symbols or spaces)
-- 'word' must stand alone (an ending -s -ed -ing is fine), 'tail' may carry
-- Filipino little words, 'stem' is found inside a word and takes the whole word
-- (unless the word starts like an allowed_words entry).
create or replace function public.bad_word_pattern()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rec record;
  toks text[];
  tok text;
  letters text[];
  n int;
  i int;
  a text;
  p text;
  b text;
  phrase text[];
  plain text[];
  alt text;
  altplain text;
  gap constant text := '[^[:alnum:]]{0,2}';
  sep constant text := '[^[:alnum:]]{1,2}';
  psep constant text := '[^[:alnum:]]{0,3}';
  whole text[] := '{}';
  tails text[] := '{}';
  stems text[] := '{}';
  parts text[] := '{}';
  allow text;
begin
  for rec in
    select word, mode, loose from public.blocked_words
     where word ~ '^[a-z]+( [a-z]+)*$'
     order by char_length(word) desc, word
  loop
    toks := string_to_array(rec.word, ' ');
    phrase := '{}';
    plain := '{}';
    foreach tok in array toks loop
      letters := regexp_split_to_array(tok, '');
      n := cardinality(letters);
      a := '';
      p := '';
      for i in 1..n loop
        a := a || public.word_letter_class(letters[i]);
        p := p || public.word_letter_class(letters[i]);
        if rec.loose and cardinality(toks) = 1 and i between 2 and n - 2 then
          a := a || gap;
        end if;
      end loop;
      if rec.loose and cardinality(toks) = 1 and n >= 3 then
        b := '';
        for i in 1..n loop
          b := b || public.word_letter_class(letters[i]) || case when i < n then sep else '' end;
        end loop;
        a := '(?:' || a || '|' || b || ')';
      end if;
      phrase := phrase || a;
      plain := plain || p;
    end loop;
    alt := array_to_string(phrase, psep);
    altplain := array_to_string(plain, psep);

    if rec.mode = 'stem' then
      -- The glued root is found inside a longer word. The pulled-apart forms
      -- (Fu ck, f u c k) must stand alone: otherwise "bit chilly" would be a
      -- "bitch" with an ending.
      stems := stems || altplain;
      if rec.loose and cardinality(toks) = 1 then
        whole := whole || alt;
      end if;
    elsif rec.mode = 'tail' then
      tails := tails || alt;
    else
      whole := whole || alt;
    end if;
  end loop;

  if cardinality(whole) > 0 then
    parts := parts || ('(?<![[:alnum:]])(?:' || array_to_string(whole, '|') || ')(?:s|es|ed|er|ers|ing|in)?(?![[:alnum:]])');
  end if;
  if cardinality(tails) > 0 then
    parts := parts || ('(?<![[:alnum:]])(?:' || array_to_string(tails, '|') || ')(?:ka|mo|ko|ba|ng|na|nga|lang)*(?![[:alnum:]])');
  end if;
  if cardinality(stems) > 0 then
    select string_agg(word, '|') into allow from public.allowed_words;
    parts := parts || ('(?<![[:alnum:]])'
      || case when allow is not null then '(?!(?:' || allow || '))' else '' end
      || '[[:alnum:]]*(?:' || array_to_string(stems, '|') || ')[[:alnum:]]*');
  end if;

  -- An empty list must match nothing.
  if cardinality(parts) = 0 then
    return '(?!)';
  end if;

  return array_to_string(parts, '|');
end;
$$;

-- The pattern for every other blocked word (other scripts, and Latin words with
-- an accent such as coño or piç). It is matched against the ORIGINAL text, so
-- Russian, Arabic, Chinese... are never folded into Latin letters.
create or replace function public.bad_native_pattern()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w text;
  m text;
  ch text;
  one text;
  whole text[] := '{}';
  stems text[] := '{}';
  exacts text[] := '{}';
  parts text[] := '{}';
begin
  for w, m in
    select word, mode from public.blocked_words
     where word !~ '^[a-z]+( [a-z]+)*$'
     order by char_length(word) desc, word
  loop
    one := '';
    for ch in select regexp_split_to_table(w, '') loop
      one := one || case ch when ' ' then '[^[:alnum:]]{0,3}' else ch || '+' end;
    end loop;
    if m = 'stem' then
      stems := stems || one;
    elsif m = 'exact' then
      exacts := exacts || one;
    else
      whole := whole || one;
    end if;
  end loop;

  if cardinality(whole) > 0 then
    parts := parts || ('(?<![[:alnum:]])(?:' || array_to_string(whole, '|') || ')(?![[:alnum:]])');
  end if;
  if cardinality(stems) > 0 then
    parts := parts || ('[[:alnum:]]*(?:' || array_to_string(stems, '|') || ')[[:alnum:]]*');
  end if;
  if cardinality(exacts) > 0 then
    parts := parts || ('(?:' || array_to_string(exacts, '|') || ')');
  end if;

  if cardinality(parts) = 0 then
    return '(?!)';
  end if;

  return array_to_string(parts, '|');
end;
$$;

-- The text with every blocked word replaced by ***. The Latin-letter words are
-- found in the folded text but cut out of the ORIGINAL (folding keeps every
-- position), so nothing else in the text changes.
create or replace function public.mask_bad_words(input text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  lat text;
  nat text;
  folded text;
  result text := '';
  pos int := 1;
  s int;
  e int;
begin
  if input is null then
    return null;
  end if;

  lat := public.bad_word_pattern();
  folded := public.fold_text(input);

  loop
    s := regexp_instr(folded, lat, pos, 1, 0, 'i');
    exit when s = 0;
    e := regexp_instr(folded, lat, pos, 1, 1, 'i');
    if e <= s then
      -- Safety: never loop on an empty match.
      result := result || substr(input, pos, s - pos + 1);
      pos := s + 1;
    else
      result := result || substr(input, pos, s - pos) || '***';
      pos := e;
    end if;
  end loop;
  result := result || substr(input, pos);

  nat := public.bad_native_pattern();
  return regexp_replace(result, nat, '***', 'gi');
end;
$$;

-- Yes or no: does the text hold a blocked word?
create or replace function public.has_bad_word(input text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    public.fold_text(input) ~* public.bad_word_pattern()
    or input ~* public.bad_native_pattern(),
    false);
$$;

revoke execute on function public.fold_text(text) from public, anon, authenticated;
revoke execute on function public.word_letter_class(text) from public, anon, authenticated;
revoke execute on function public.bad_word_pattern() from public, anon, authenticated;
revoke execute on function public.bad_native_pattern() from public, anon, authenticated;
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
      masked := to_jsonb(public.mask_bad_words(newval #>> '{}'));
    elsif jsonb_typeof(newval) = 'array' then
      select coalesce(
               jsonb_agg(
                 case when jsonb_typeof(t.e) = 'string'
                      then to_jsonb(public.mask_bad_words(t.e #>> '{}'))
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

-- Which of a name and a username holds a blocked word: 'name', 'username' or
-- null (both fine). For a username, "_ . -" count as spaces and digits at
-- either end are ignored, so xx_fuck_xx and fuck123 are caught.
-- The website asks this at sign-up (before the account is made, lib/profile.js
-- checkNameWords), and the trigger below uses the same function, so the two
-- can't disagree. It only answers yes or no: it does not show the list. Pass
-- null for the one you don't want checked.
create or replace function public.bad_word_in_name(full_name text, username text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  handle text;
begin
  if public.has_bad_word(coalesce(full_name, '')) then
    return 'name';
  end if;

  handle := regexp_replace(lower(coalesce(username, '')), '[_.\-]+', ' ', 'g');
  if public.has_bad_word(handle)
     or public.has_bad_word(regexp_replace(handle, '(^|\s)[0-9]+|[0-9]+(\s|$)', ' ', 'g')) then
    return 'username';
  end if;

  return null;
end;
$$;

revoke execute on function public.bad_word_in_name(text, text) from public;
grant execute on function public.bad_word_in_name(text, text) to anon, authenticated;

-- A name or username with a blocked word is refused. Only a new profile or a
-- changed value is checked, so someone who already has such a name can still
-- change other things.
create or replace function public.refuse_bad_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.full_name is distinct from old.full_name then
    if public.bad_word_in_name(new.full_name, null) = 'name' then
      raise exception 'Please don''t use bad words in your name.' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' or new.username is distinct from old.username then
    if public.bad_word_in_name(null, new.username) = 'username' then
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
--
-- Remember the places that keep a COPY of typed text, which the triggers above
-- do not watch: conversations.last_message_preview (the inbox line),
-- report_messages (the evidence copy of reported chat messages) and
-- reports.target_title. Clean those the same way if the count finds any.
--
-- Done on the live database on 2026-10-21 (3 rows: a chat message, the inbox
-- preview that copied it and an appeal) and again after the stricter matching
-- on 2026-10-22 (see PLAN-word-filter.md).
-- ---------------------------------------------------------------------------
