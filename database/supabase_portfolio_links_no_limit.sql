-- Portfolio links, no 3-link limit (PLAN-portfolio-links-merge.md, 2026-11-20): the user wants a freelancer to be
-- able to add as many links as they like. This replaces the check function from supabase_portfolio_links_schema.sql:
-- the column's CHECK calls it by name, so replacing it is enough (nothing is dropped, no profile is changed).
--
-- The rule now: at most 50 links (a quiet ceiling, so one row can't be stuffed with thousands; the website does not
-- show a limit), each an https:// web address of at most 200 characters. Only https, so a saved link can never be a
-- "javascript:" link that runs code when clicked.
create or replace function public.portfolio_links_ok(links text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.cardinality(links), 0) <= 50
     and coalesce(pg_catalog.bool_and(
           pg_catalog.char_length(link) <= 200
           and link ~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?(/[^[:space:]<>"]*)?$'
         ), true)
  from pg_catalog.unnest(links) as link
$$;
