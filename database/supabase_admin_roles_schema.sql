-- Admin roles, round 2: super admin approval, and super-admin-only pages.
-- Plan: PLAN-admin-roles.md. Run this in the Supabase SQL Editor after
-- supabase_admin_log_schema.sql and supabase_billboard_schema.sql.
--
-- 1. A regular admin no longer suspends, bans, resolves or dismisses on their
--    own. They send a request; a super admin approves or declines it.
-- 2. Only a super admin can post, change or remove announcements and
--    billboards.

-- ===========================================================================
-- A. Requests waiting for a super admin
-- ===========================================================================

create table public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  -- Who asked. The name is copied in by a trigger, so the row still reads
  -- correctly if the admin is renamed or removed later.
  requested_by uuid references public.admins(id) on delete set null,
  requested_by_name text not null default '',
  -- What they want done.
  kind text not null check (kind in ('suspend', 'ban', 'resolve', 'dismiss', 'remove_listing')),
  -- The report it came from (empty for a Suspend / Ban started on the Users page).
  report_id uuid references public.reports(id) on delete cascade,
  -- The user to suspend or ban.
  target_user_id uuid references public.profiles(id) on delete cascade,
  -- The listing to remove.
  listing_table text check (listing_table in ('services', 'job_posts')),
  listing_id uuid,
  -- What the admin picked in the pop-up (violation, note, length). The
  -- penalty is worked out again when the super admin approves.
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.admins(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  -- Each kind must carry what the super admin needs to carry it out.
  check (
    (kind in ('resolve', 'dismiss') and report_id is not null)
    or (kind in ('suspend', 'ban') and target_user_id is not null)
    or (kind = 'remove_listing' and report_id is not null and listing_table is not null and listing_id is not null)
  )
);

-- Only one open request per report, and one per user for the Users page.
create unique index admin_requests_one_per_report
  on public.admin_requests (report_id)
  where status = 'pending' and report_id is not null;
create unique index admin_requests_one_per_user
  on public.admin_requests (target_user_id)
  where status = 'pending' and report_id is null;

create index admin_requests_status_idx on public.admin_requests (status, created_at desc);

alter table public.admin_requests enable row level security;

-- What the browser may touch. Requests can never be removed: they are a permanent
-- record. A super admin can only fill in the decision, never edit the request.
revoke all on public.admin_requests from public, anon, authenticated;
grant select on public.admin_requests to authenticated;
grant insert (requested_by, kind, report_id, target_user_id, listing_table, listing_id, details)
  on public.admin_requests to authenticated;
grant update (status, decision_note) on public.admin_requests to authenticated;

-- A regular admin reads their own requests; a super admin reads all of them.
create policy "admins can read their requests"
  on public.admin_requests for select
  to authenticated
  using (public.is_super_admin() or (public.is_admin() and requested_by = auth.uid()));

-- Only a regular admin asks (a super admin just does the action). The report,
-- if there is one, must still be pending.
create policy "admins can send requests"
  on public.admin_requests for insert
  to authenticated
  with check (
    public.is_admin()
    and not public.is_super_admin()
    and requested_by = auth.uid()
    and (report_id is null or exists (select 1 from public.reports r where r.id = report_id and r.status = 'pending'))
  );

-- Only a super admin decides, and only while the request is still pending.
create policy "super admins can decide requests"
  on public.admin_requests for update
  to authenticated
  using (public.is_super_admin() and status = 'pending')
  with check (public.is_super_admin() and status in ('approved', 'declined'));

-- Fills in the requester's name on a new request, and who and when on a decision.
create or replace function public.admin_requests_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select full_name into new.requested_by_name from public.admins where id = new.requested_by;
    new.requested_by_name := coalesce(new.requested_by_name, '');
  else
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end;
$$;

create trigger admin_requests_fill_insert
  before insert on public.admin_requests
  for each row execute function public.admin_requests_fill();

create trigger admin_requests_fill_update
  before update on public.admin_requests
  for each row execute function public.admin_requests_fill();

-- ===========================================================================
-- B. The Activity Log shows requests and decisions
-- ===========================================================================

-- "ban Keanne Reyes", "dismiss a report about ...": the same words are used
-- when the request is made and when it is decided.
create or replace function public.log_request_phrase(r public.admin_requests)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rep public.reports%rowtype;
begin
  if r.report_id is not null then
    select * into rep from public.reports where id = r.report_id;
  end if;

  if r.kind in ('suspend', 'ban') then
    return r.kind || ' ' || public.log_name(r.target_user_id);
  elsif r.kind = 'remove_listing' then
    return 'remove ' || public.log_report_target(rep.target_type, rep.target_id);
  else
    return r.kind || ' a report about ' || public.log_report_target(rep.target_type, rep.target_id);
  end if;
end;
$$;

-- The log's list of action kinds has no "request", so each line uses the kind
-- it is about (ban, suspend or report).
create or replace function public.log_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action text := case when new.kind in ('suspend', 'ban') then new.kind else 'report' end;
  target uuid := coalesce(new.target_user_id, new.listing_id);
begin
  if tg_op = 'INSERT' then
    perform public.write_admin_log(action, 'asked to ' || public.log_request_phrase(new) || ' (waiting for a super admin).', target);
  elsif old.status = 'pending' and new.status in ('approved', 'declined') then
    perform public.write_admin_log(
      action,
      new.status || ' ' || coalesce(nullif(new.requested_by_name, ''), 'an admin') || '''s request to ' || public.log_request_phrase(new) || '.',
      target
    );
  end if;
  return new;
end;
$$;

create trigger admin_requests_log
  after insert or update of status on public.admin_requests
  for each row execute function public.log_request_change();

-- ===========================================================================
-- C. Close the back door: only a super admin writes the result directly
-- ===========================================================================
-- (alter policy, so a rule is never missing for a moment.)

-- Suspending and banning (lifting stays with every admin).
alter policy "admins can suspend users" on public.user_suspensions
  with check (public.is_super_admin() and suspended_by = auth.uid());
alter policy "admins can update suspensions" on public.user_suspensions
  using (public.is_super_admin())
  with check (public.is_super_admin() and suspended_by = auth.uid());

-- Resolving and dismissing reports.
alter policy "admins can review reports" on public.reports
  using (public.is_super_admin())
  with check (public.is_super_admin() and reviewed_by = auth.uid());

-- ===========================================================================
-- D. Announcements and billboards: super admin only
-- ===========================================================================

alter policy "admins can post announcements" on public.announcements
  with check (public.is_super_admin() and created_by = auth.uid());
alter policy "admins can delete announcements" on public.announcements
  using (public.is_super_admin());

alter policy "admins can post billboards" on public.dashboard_billboards
  with check (public.is_super_admin() and created_by = auth.uid());
alter policy "admins can switch billboards on and off" on public.dashboard_billboards
  using (public.is_super_admin())
  with check (public.is_super_admin());
alter policy "admins can delete billboards" on public.dashboard_billboards
  using (public.is_super_admin());

-- The billboard pictures.
alter policy "billboard-images: admins can upload to their folder" on storage.objects
  with check (bucket_id = 'billboard-images' and public.is_super_admin() and (storage.foldername(name))[1] = auth.uid()::text);
alter policy "billboard-images: admins can see the file entries" on storage.objects
  using (bucket_id = 'billboard-images' and public.is_super_admin());
alter policy "billboard-images: admins can delete files" on storage.objects
  using (bucket_id = 'billboard-images' and public.is_super_admin());
