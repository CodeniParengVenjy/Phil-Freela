-- The Name policy, enforced in the database so the website (and anyone calling
-- the API directly) can't skip it. Run this in the Supabase SQL Editor. The
-- website uses the same rule in client/src/lib/profile.js (checkName).
--
-- A name must be:
--   - not blank
--   - 2 to 50 characters
--   - letters (any language), spaces and . , ' - only, starting with a letter
--   - with at least 2 letters, and not a link ("www.site.com", "https:...")
-- Extra spaces are tidied (two spaces become one, the ends are trimmed).
--
-- It is a trigger, not a CHECK rule, on purpose: it only looks at a brand-new
-- profile or at a name that is being changed. A person who signed up before
-- this rule with no name (their profile still has an empty name) can keep
-- using the site, and the dashboard asks them for a name until they add one.
-- Nothing is changed for existing profiles. No new tables.

create or replace function public.enforce_name_policy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tidy text;
begin
  -- Only a new profile or a changed name is checked.
  if tg_op = 'UPDATE' then
    if new.full_name is not distinct from old.full_name then
      return new;
    end if;
  end if;

  tidy := btrim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g'));

  if tidy = '' then
    raise exception 'Please enter your name.' using errcode = 'check_violation';
  end if;

  if char_length(tidy) > 50 then
    raise exception 'Your name can''t be longer than 50 characters.' using errcode = 'check_violation';
  end if;

  if tidy !~ '^[[:alpha:]][[:alpha:] .,''’-]*$'
     or tidy ~* '(www\.|https?:|\.(com|net|org|ph|info|xyz|app|dev)\y)' then
    raise exception 'Use letters only: no numbers, emoji, links or symbols. You can use spaces and . , '' -'
      using errcode = 'check_violation';
  end if;

  if char_length(regexp_replace(tidy, '[^[:alpha:]]', '', 'g')) < 2 then
    raise exception 'Your name needs at least 2 letters.' using errcode = 'check_violation';
  end if;

  new.full_name := tidy;
  return new;
end;
$$;

revoke execute on function public.enforce_name_policy() from public, anon, authenticated;

-- Runs after profiles_name_cooldowns (triggers go in name order), so a person
-- still inside their 7-day wait sees the wait message first.
create or replace trigger profiles_name_policy
  before insert or update on public.profiles
  for each row
  execute function public.enforce_name_policy();
