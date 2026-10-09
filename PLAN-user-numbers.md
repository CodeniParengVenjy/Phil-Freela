# User numbers (PF-0001): plan

Status (2026-10-09): approved ("k") and built. The database file is applied to
the live project (migration "user_numbers"): the 17 existing users are PF-0001
to PF-0017 in sign-up order and the next sign-up gets PF-0018. The Users page
shows the numbers. The two "not included" extras at the bottom were not
asked for and are not built.
To continue in a new Claude session, say:
"Read PLAN-user-numbers.md and continue from the current step."

Test results: the database test (`database/test_user_number.sql`, 13 checks) was
run on the live project together with the schema in one call that rolled back,
before applying: all passed and nothing was left behind. The browser test against
a fake backend (53 checks, desktop and phone) passed. Not tested: that a deleted
person's number is not handed out again (true by design: numbers come from a
counter; the test block can't contain a DELETE).

## Why

Admin > Users now shows the first 8 characters of each user's system ID
(like `abcdef12`). That is the real ID, but it is hard to read out, remember
or write in a message. A friendly number is easier: "PF-0007".

## What the owner will see

1. Admin > Users: the first column shows `PF-0007` instead of `abcdef12`.
   Clicking it copies `PF-0007`. Hovering shows the number and the whole
   system ID.
2. The search box finds a user by number: `PF-0007` (or just `pf-00`, 3 or
   more characters). Searching the long system ID still works.
3. Nothing changes for freelancers and clients (they don't see the number).

## How the numbers work (defaults I chose)

1. Format `PF-` + the number with at least 4 digits: PF-0001, PF-0042,
   PF-10000. PF stands for PhilFreela.
2. In order of sign-up. The 17 users who exist now are numbered by the date
   they signed up (the first account, 2 June 2026, becomes PF-0001). The next
   person to finish signing up gets PF-0018.
3. A number is never reused. If an account is deleted its number stays unused,
   so an old message or appeal that says "PF-0007" can never point to someone
   else.
4. Only the database sets it. A user can't pick or change their own number,
   even by editing their profile.
5. Admin accounts have no number (they are not in the user list).

## Database (file `database/supabase_user_number_schema.sql`)

Nothing in it uses DROP or DELETE, so the connector can apply it.

1. A counter: `create sequence public.user_number_seq`.
2. A new column `profiles.user_number` (whole number).
3. Fill it for the 17 existing users in sign-up order
   (`row_number() over (order by created_at, id)`), then move the counter to
   the highest number so the next one is 18.
4. Make the column required and unique (no two users can share a number).
5. One trigger function, `assign_user_number()`, run before every insert or
   update on `profiles`:
   - on insert it ignores whatever the website sent and takes the next number;
   - on update it puts the old number back, so editing a profile can't change it.
   It runs with the database's own rights, so users need no access to the
   counter. The website needs no change for sign-up: the 3 places that create
   a profile (`lib/profile.js`, `Login.jsx`, `CompleteProfile.jsx`) keep working
   as they are, and so do Google sign-ins.
6. `admin_list_users()` is left alone (changing its columns would need a DROP).
   The Users page reads the numbers with one extra query (admins can already
   read every profile).

## Website

1. `client/src/lib/userNumber.js` (new, a few lines): `formatUserNumber(7)`
   gives `PF-0007`.
2. `client/src/pages/admin/views/AdminUsersView.jsx`: load `id, user_number`
   from `profiles` next to the existing queries; ID column shows the number
   (falls back to the short system ID if the numbers can't be loaded, so the
   page never breaks); copy and search as described above.

## Order of work

1. Write the SQL file and a test file (`database/test_user_number.sql`).
2. Trial run on the live project: the whole file plus the test in one call
   that ends in a rollback, so nothing is saved and no numbers are used up.
3. Apply it for real, check the 17 numbers.
4. Build the website change, test in the browser against a fake backend.
5. Commit and push (the database is already updated by then).

## Testing

1. Database (rolled back): the 17 users get 1 to 17 in sign-up order with no
   duplicates; a new profile gets 18; a profile inserted with a number the
   website chose (say 999) still gets the next one; a user editing their own
   profile can't change the number; deleting a user and adding another does
   not reuse the number; an admin can read all numbers.
2. Browser (fake backend, desktop and phone): the column shows `PF-0007`, copy
   gives `PF-0007`, hover shows the system ID, search by `pf-0007` and by the
   long ID works, short searches still only match names, and with the numbers
   missing the page falls back to the short system ID.

## Not included (say yes to any)

1. Showing the number to the person themselves (for example "Your ID: PF-0007"
   in Settings), so they can quote it in an appeal or a report.
2. Showing it next to names on Reports, Appeals and the Activity Log.
