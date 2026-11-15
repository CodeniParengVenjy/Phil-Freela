-- Verified owner badge for a freelancer's own website (PLAN-site-verification.md,
-- 2026-11-15). PhilFreela gives the freelancer a one-of-a-kind code for one of
-- their portfolio links. They put it on their website as
--   <meta name="philfreela-verification" content="pf-7k3q9x2m">
-- and the AI service visits the page. If the code is there, the link gets a
-- "Verified owner" badge for 90 days.
--
-- Who can do what:
-- - A freelancer can READ their own rows (to see their code and the date).
-- - Nobody can write from the browser: only the AI service, which uses the
--   service key, makes a code or marks a link verified. So the badge can't be
--   switched on by editing the page.
-- - Everyone signed in can see which links of a person are verified, through
--   verified_portfolio_links(), which never shows the code.

-- 1. The table: one row per person per link.
create table if not exists public.site_verifications (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  -- The saved portfolio link, exactly as it is in profiles.portfolio_links.
  link text not null check (char_length(link) <= 200 and link ~ '^https://'),
  -- "pf-" and 10 lowercase letters or digits, made by the AI service.
  code text not null unique check (code ~ '^pf-[a-z0-9]{10}$'),
  -- Empty until the code is found on the site.
  verified_at timestamptz,
  -- The last time "Check now" ran (one check per link every 30 seconds).
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (freelancer_id, link)
);

-- 2. Rules. Row level security is on, and the only rule lets a freelancer read
--    their own rows. With no insert or update rule, the browser can't write.
alter table public.site_verifications enable row level security;

create policy "Freelancers read their own site codes"
  on public.site_verifications
  for select
  to authenticated
  using (freelancer_id = (select auth.uid()));

-- New tables get every right for anon and authenticated by default; keep only
-- reading for signed-in users (the rule above still limits it to their own rows).
revoke all on public.site_verifications from anon, authenticated;
grant select on public.site_verifications to authenticated;

-- 3. The links of a person that are verified right now: verified in the last
--    90 days and still in their Portfolio Links. Only the link and the date,
--    never the code. Used by the public profile page.
create or replace function public.verified_portfolio_links(p_user uuid)
returns table (link text, verified_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.link, v.verified_at
  from public.site_verifications v
  join public.profiles p on p.id = v.freelancer_id
  where v.freelancer_id = p_user
    and v.verified_at is not null
    and v.verified_at > pg_catalog.now() - interval '90 days'
    and v.link = any (p.portfolio_links)
$$;

revoke all on function public.verified_portfolio_links(uuid) from public, anon;
grant execute on function public.verified_portfolio_links(uuid) to authenticated;
