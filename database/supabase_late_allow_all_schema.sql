-- "Allow" lifts the whole late block between one freelancer and one client
-- (2026-11-26). Runs after supabase_late_block_schema.sql and
-- supabase_late_appeals_schema.sql.
--
-- The problem the user found: Elena allowed Enjoker's appeal on "Logo Designer
-- for a Small Business", Enjoker was told "You can apply again", but he still
-- couldn't apply to her job posts, because a SECOND project with her ("Wedding
-- Invitation") was also late and that one still blocked him. Both the client's
-- message ("can apply to your job posts again") and the freelancer's notice
-- promise the block is gone, so now it is:
--
--   Allowing on one late project (the "Allow to apply again" button, or Allow
--   on an appeal) allows EVERY project between that freelancer and that client
--   that is late right now. Waiting appeals on those projects count as allowed,
--   and the freelancer gets ONE notice naming them. A project that becomes late
--   LATER blocks again (that is new lateness, so a new decision).
--
-- (Before this, test_late_block.sql test 15 expected "one of two late projects
-- allowed: still blocked". That test is updated to the new rule.)

-- ---------------------------------------------------------------------------
-- 1. The new allow_late_freelancer (the whole function; the appeal and notice
--    lines from supabase_late_appeals_schema.sql are kept, now for every
--    project it lifts)
-- ---------------------------------------------------------------------------

create or replace function public.allow_late_freelancer(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects%rowtype;
  lifted uuid[];
  titles text;
  how_many integer;
begin
  select * into proj from public.projects where id = target_project;
  if not found or proj.client_id is distinct from auth.uid() then
    raise exception 'Only the client of this project can allow this.';
  end if;
  if not public.missed_deadline(proj) then
    raise exception 'This project wasn''t late, so nothing is blocked.';
  end if;

  -- Every project of this freelancer with this client that is late right now
  -- and not allowed yet (this one included).
  with up as (
    update public.projects p
    set late_allowed_at = now()
    where p.client_id = proj.client_id
      and p.freelancer_id = proj.freelancer_id
      and p.late_allowed_at is null
      and public.missed_deadline(p)
    returning p.id, p.title, p.due_date
  )
  select array_agg(id), string_agg('"' || title || '"', ', ' order by due_date), count(*)
  into lifted, titles, how_many
  from up;

  -- A waiting appeal counts as allowed, and the freelancer is told once
  -- (PLAN-late-appeals.md). how_many = 0: nothing was blocked any more.
  if how_many > 0 then
    update public.late_appeals set status = 'allowed', answered_at = now()
    where project_id = any (lifted) and status = 'pending';
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      proj.freelancer_id, 'late_appeal_allowed', 'You can apply again',
      (select coalesce(nullif(full_name, ''), username, 'Your client') from public.profiles where id = proj.client_id)
        || ' allowed you to apply to their job posts again ('
        || case when how_many = 1 then 'the late project ' else 'the late projects ' end
        || titles || ').',
      '/dashboard/project-details/' || proj.id
    );
  end if;
end;
$$;

revoke execute on function public.allow_late_freelancer(uuid) from public, anon;
grant execute on function public.allow_late_freelancer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. One-time fix for Allows given before this change: a project that was
--    already late when the client allowed another late project with the same
--    freelancer is allowed too, at that same moment. Its waiting appeals (if
--    any) count as allowed. No new notice: the freelancer was already told
--    "You can apply again". On 2026-11-26 this was one project (Enjoker's
--    "Wedding Invitation" for Elena).
-- ---------------------------------------------------------------------------

with last_allow as (
  select client_id, freelancer_id, max(late_allowed_at) as allowed_at
  from public.projects
  where late_allowed_at is not null
  group by client_id, freelancer_id
), fixed as (
  update public.projects p
  set late_allowed_at = a.allowed_at
  from last_allow a
  where p.client_id = a.client_id
    and p.freelancer_id = a.freelancer_id
    and p.late_allowed_at is null
    and public.missed_deadline(p)
    and p.due_date < (a.allowed_at at time zone 'Asia/Manila')::date   -- already late then
  returning p.id, a.allowed_at
)
update public.late_appeals l
set status = 'allowed', answered_at = f.allowed_at
from fixed f
where l.project_id = f.id and l.status = 'pending';
