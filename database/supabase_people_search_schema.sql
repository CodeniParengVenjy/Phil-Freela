-- People search (the "People" section of the Search page). Run this in the
-- Supabase SQL Editor after supabase_admin_schema.sql (it uses is_suspended).
--
-- The search box already finds services and job posts by meaning (the AI
-- service, see supabase_search_schema.sql). This adds a plain search for
-- people by their name or @username, so the Search page can show both at the
-- same time. No new table: it reads profiles, which every signed-in user can
-- already read.

-- The people whose name or username contains the typed text, at most 20.
--   - Capital letters don't matter ("fred" finds "Fred").
--   - A leading @ is ignored, so "@fred" finds the username "fred".
--   - Fewer than 2 characters finds nobody.
--   - It leaves out the person searching, and anyone who is banned or
--     suspended right now (the same rule that hides their services and job
--     posts). They show again by themselves once a suspension ends.
--   - Names or usernames that START with the typed text come first.
-- Only what the Search page shows is returned: the id (for the link), name,
-- username, role and picture. Admins have no profile, so they are never found.
-- The typed text arrives as a parameter and is only ever compared with names,
-- so it can't change what the query does.
create or replace function public.search_people(search text)
returns table (
  id uuid,
  full_name text,
  username text,
  account_type text,
  avatar_path text
)
language sql
stable
set search_path = public
as $$
  with typed as (
    -- In a LIKE search % and _ mean "anything", so they are escaped: typing
    -- them only finds names that really contain them.
    select replace(replace(replace(ltrim(btrim(search), '@'), '\', '\\'), '%', '\%'), '_', '\_') as words
  )
  select p.id, p.full_name::text, p.username::text, p.account_type::text, p.avatar_path
  from public.profiles p
  cross join typed t
  where char_length(ltrim(btrim(search), '@')) >= 2
    and (p.full_name ilike '%' || t.words || '%' or p.username ilike '%' || t.words || '%')
    and p.id <> auth.uid()
    and not public.is_suspended(p.id)
  order by
    (p.full_name ilike t.words || '%' or p.username ilike t.words || '%') desc,
    p.full_name,
    p.username
  limit 20;
$$;

-- Signed-in users only.
revoke execute on function public.search_people(text) from public, anon;
grant execute on function public.search_people(text) to authenticated;
