-- Social accounts (PLAN-social-accounts.md, 2026-11-20): a person, freelancer or client, can put their Facebook,
-- Instagram, TikTok, YouTube, LinkedIn, X, Threads and Pinterest pages on their profile. They are saved on the
-- profile as one small JSON object, platform name -> web address, for example
--   {"tiktok": "https://www.tiktok.com/@juan", "linkedin": "https://www.linkedin.com/in/juan-dc"}
-- so each platform can be there only once, and the page can always draw them in the same order.
--
-- The rule (the same one as SOCIAL_PLATFORMS in client/src/lib/profile.js):
--   - only these eight platform names are allowed;
--   - each address starts with https:// and is at most 200 characters;
--   - each address is on THAT platform's own website (its domain or one of its sub-domains such as www. or m.),
--     so a "tiktok" entry can never point to another website, and a saved link can never be a "javascript:" link;
--   - after the domain comes the page name, and nothing after it: no ?query and no #part, so a "redirect" link such
--     as facebook.com/l.php?u=... is refused. The one exception is Facebook's numeric profile.php?id=123456 address.
--     (The website trims the leftovers that share buttons add, like ?igsh=..., before it saves.)
--
-- Apply it BEFORE the website update. The website reads this column in its own small request, so a missing column
-- can never break the profile page itself, but the Social Accounts box could not save until the column is there.

-- 1. The check, as a small function, because a table rule can't look inside a JSON object by itself.
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

-- 2. The column: an empty object by default, so every existing profile is fine.
alter table public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb
  constraint profiles_social_links_check check (public.social_links_ok(social_links));
