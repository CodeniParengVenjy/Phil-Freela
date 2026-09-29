-- Profile description (Settings > Profile Settings > Description). Run this in
-- the Supabase SQL Editor after supabase_schema.sql.
--
-- A short "about me" the user writes themselves. It shows on their Profile
-- page, and a freelancer's also shows on their public page. No new rules are
-- needed: users can already update only their own profile row, and signed-in
-- users can already read every profile (supabase_marketplace_schema.sql).
-- Empty = no description yet. Up to 1,000 characters (checked by the website
-- too, see MAX_DESCRIPTION_LENGTH in client/src/lib/profile.js).
alter table public.profiles
  add column if not exists description text not null default ''
  check (char_length(description) <= 1000);
