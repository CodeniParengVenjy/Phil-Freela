-- Appearance (Settings > Appearance). Run this in the Supabase SQL Editor
-- after supabase_schema.sql.
--
-- Each user picks how their dashboard looks: dark or light mode, and an
-- accent color of their own instead of the usual orange (freelancers) or cyan
-- (clients). It is saved on their profile, so it follows them to any device.
-- No new rules are needed: users can already update only their own profile
-- row. The website checks the same two rules before saving (see
-- client/src/lib/appearance.js).
alter table public.profiles
  -- 'dark' is how the site has always looked.
  add column if not exists theme_mode text not null default 'dark'
    check (theme_mode in ('dark', 'light')),
  -- A color like '#3b82f6'. Empty (null) = the usual orange or cyan.
  add column if not exists accent_color text
    check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$');
