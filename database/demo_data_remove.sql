-- Takes out everything database/demo_data.sql added. Run it in the Supabase
-- SQL Editor, one numbered part at a time. (Claude's database tool will not
-- run a delete without someone to confirm it, so this one is yours to run.)
--
-- Removing the six demo logins is enough. The database removes everything
-- that belongs to an account along with it: the profile, services, job
-- posts, projects, ratings, bookings, chats, notifications, the verification
-- row and the AI's saved numbers for their posts. No real account is touched:
-- only emails that look like demo.<name>@example.com match.

-- 1. See who will be removed. It should list 6 addresses.
select email from auth.users where email like 'demo.%@example.com' order by email;

-- 2. Remove them.
delete from auth.users where email like 'demo.%@example.com';

-- 3. Check. Both numbers should be 0.
select (select count(*) from auth.users where email like 'demo.%@example.com') as demo_logins_left,
       (select count(*) from public.profiles where username like 'demo\_%') as demo_profiles_left;
