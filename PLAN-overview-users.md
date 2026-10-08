# Admin Overview: click a number to see those users

Status (2026-10-08): approved by "plan then build"; building now.

Why: the Overview shows how many users there are, but you can't act on a number.
You asked for filtering (verified, not verified, all users) and sorting (online,
newest, ascending and descending) for monitoring users. Those are on the Users
page. This makes the Overview numbers lead there, already filtered.

## What changes

1. **Overview cards become links** (the whole card is clickable):
   - Users (all) opens Users.
   - "N online now" opens Users sorted Online first.
   - Freelancers opens Users filtered to freelancers; Clients to clients.
   - New Users This Week opens Users sorted newest first.
   - Services Posted and Job Posts open Listings; Open Reports opens Reports;
     Admins opens Admins (super admins only, like the sidebar).
2. **Two new cards:** Verified users and Not verified users. Each opens Users
   already filtered to that group.
3. **The Users page reads the address:** `/admin/users?role=freelancer`,
   `?verified=verified|unverified`, `?status=active|suspended|banned`,
   `?sort=joined|online|name` and `?dir=asc|desc`. The boxes on the page start with
   those choices and can be changed as usual. A bad value is ignored.

## Database (file `database/supabase_admin_stats_verified_schema.sql`)

1. `admin_stats()` (already admin-only) also returns `verified_users`: the number
   of people with an approved verification. Not verified is worked out on the page
   (all users minus verified). Same function, same permissions, one extra number.

## Files

1. `client/src/pages/admin/views/AdminOverviewView.jsx`: links and two new cards.
2. `client/src/pages/admin/views/AdminUsersView.jsx`: starts from the address.
3. The SQL file above, applied to the live project and tested there (rolled back).

## Testing

1. Rolled-back SQL test: the new number is right, a normal user is still refused.
2. Browser test with a fake backend: each card links where it should, the new
   cards show the right counts, and each link opens Users with the right filter
   and sort already set.
