-- Portfolio links (panel revision, PLAN-panel-revisions.md, item 6,
-- 2026-11-15): a freelancer can add up to 3 links to their work on other sites
-- (Behance, GitHub, Google Drive, their own website...). They are saved on the
-- profile and shown on the public page (components/PortfolioLinks.jsx).
--
-- The rule (the same one as lib/profile.js): at most 3 links, each an https://
-- web address of at most 200 characters. Only https, so a saved link can never
-- be a "javascript:" link that runs code when clicked.
--
-- Apply it BEFORE the website update: the public profile page asks for the new
-- column, and would fail to load without it.

-- 1. The check, as a small function, because a table rule can't look inside
--    each item of a list by itself.
create or replace function public.portfolio_links_ok(links text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.cardinality(links), 0) <= 3
     and coalesce(pg_catalog.bool_and(
           pg_catalog.char_length(link) <= 200
           and link ~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?(/[^[:space:]<>"]*)?$'
         ), true)
  from pg_catalog.unnest(links) as link
$$;

-- 2. The column: an empty list by default, so every existing profile is fine.
alter table public.profiles
  add column if not exists portfolio_links text[] not null default '{}'
  constraint profiles_portfolio_links_check check (public.portfolio_links_ok(portfolio_links));
