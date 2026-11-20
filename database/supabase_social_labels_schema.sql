-- Social accounts, round 3 (PLAN-social-accounts.md, 2026-11-20): GitHub as a ninth platform, and a NAME the person
-- types for any account ("Juan Dela Cruz"), because a Facebook share link or a YouTube channel number has no name
-- inside it and the site never visits the page to read one.
--
-- 1. GitHub: social_links_ok (supabase_social_links_schema.sql) is replaced with the same rule plus one platform,
--    github -> github.com. Nothing else about the rule changes, and rows already saved stay as they are.
-- 2. The typed names: profiles.social_labels, one more JSON object, platform name -> text, for example
--      {"facebook": "Juan Dela Cruz", "youtube": "Juan Films"}
--    It sits NEXT TO social_links (not inside it), so every social_links row already saved keeps working and the
--    website can still read the links when this column isn't there. The rule (social_labels_ok): only the nine
--    platform names; each name is 1 to 40 characters with no space at either end; no / \ < > " ` or control
--    characters; and no "://" or "www.", so a name can't be a link.
-- 3. The bad-word filter: a name with a blocked word is REFUSED (like a profile name, not starred out like a
--    description), by the trigger profiles_social_label_words, which asks the same has_bad_word the other triggers use.
--
-- Apply it BEFORE the website update (the Social Accounts box saves both columns in one go).

-- 1. GitHub
create or replace function public.social_links_ok(links jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(pg_catalog.jsonb_typeof(links), '') <> 'object' then false
    else not exists (
      select 1
      from pg_catalog.jsonb_each(links) as item(platform, link)
      where not coalesce(
        pg_catalog.jsonb_typeof(item.link) = 'string'
        and pg_catalog.char_length(item.link #>> '{}') <= 200
        and (item.link #>> '{}') ~* (
          '^https://([a-z0-9-]+\.)*('
          || case item.platform
               when 'facebook'  then 'facebook\.com|fb\.com|fb\.me'
               when 'instagram' then 'instagram\.com'
               when 'tiktok'    then 'tiktok\.com'
               when 'youtube'   then 'youtube\.com'
               when 'linkedin'  then 'linkedin\.com'
               when 'github'    then 'github\.com'
               when 'x'         then 'x\.com|twitter\.com'
               when 'threads'   then 'threads\.net|threads\.com'
               when 'pinterest' then 'pinterest\.com'
             end
          || ')/[^[:space:]<>"?#/][^[:space:]<>"?#]*(\?id=[0-9]+)?$'
        ),
        false -- an unknown platform name leaves the test empty: that counts as refused
      )
    )
  end
$$;

-- 2. The typed names
create or replace function public.social_labels_ok(labels jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(pg_catalog.jsonb_typeof(labels), '') <> 'object' then false
    else not exists (
      select 1
      from pg_catalog.jsonb_each(labels) as item(platform, label)
      where not coalesce(
        item.platform in ('facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'github', 'x', 'threads', 'pinterest')
        and pg_catalog.jsonb_typeof(item.label) = 'string'
        and pg_catalog.char_length(item.label #>> '{}') between 1 and 40
        and (item.label #>> '{}') = pg_catalog.btrim(item.label #>> '{}')
        and (item.label #>> '{}') !~ '[/\\<>"`[:cntrl:]]'
        and (item.label #>> '{}') !~* '(://|www\.)',
        false
      )
    )
  end
$$;

alter table public.profiles
  add column if not exists social_labels jsonb not null default '{}'::jsonb
  constraint profiles_social_labels_check check (public.social_labels_ok(social_labels));

-- 3. The bad-word filter. Only a new or changed set of names is checked, so an old row is never touched behind its
--    owner's back. It runs as the table owner because the person typing can't call has_bad_word. A value that
--    isn't an object is left for the check above to refuse.
create or replace function public.refuse_bad_social_labels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text;
begin
  if tg_op = 'UPDATE' and new.social_labels is not distinct from old.social_labels then
    return new;
  end if;
  if jsonb_typeof(new.social_labels) <> 'object' then
    return new;
  end if;
  for label in select item.value #>> '{}' from jsonb_each(new.social_labels) as item loop
    if public.has_bad_word(coalesce(label, '')) then
      raise exception 'Please don''t use bad words in a name.' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.refuse_bad_social_labels() from public, anon, authenticated;

create or replace trigger profiles_social_label_words
  before insert or update of social_labels on public.profiles
  for each row execute function public.refuse_bad_social_labels();
