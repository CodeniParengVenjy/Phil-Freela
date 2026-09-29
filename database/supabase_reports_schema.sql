-- Reports, part 2. Run this in the Supabase SQL Editor after
-- supabase_admin_schema.sql (reports are admin panel step 5 there) and
-- supabase_calls_schema.sql.
--
--   1. Reporting someone during a voice or video call (call_id).
--   2. Screenshots as evidence (evidence_paths + the report-evidence bucket).
--   3. The reporter gets a notification when an admin reviews their report.
--   4. Admins see when and how long the reported call was, nothing more.

-- ---------------------------------------------------------------------------
-- 1 + 2. New columns
-- ---------------------------------------------------------------------------

-- The call the report was sent from (null = not from a call). If the call is
-- deleted later, the report stays.
alter table public.reports
  add column call_id uuid references public.calls (id) on delete set null;

create index reports_call_id_idx on public.reports (call_id);

-- Up to 3 screenshots, saved in the private "report-evidence" bucket as
-- <reporter id>/<report id>/1.jpg, 2.jpg, 3.jpg.
alter table public.reports
  add column evidence_paths text[] not null default '{}'
  check (cardinality(evidence_paths) <= 3);

-- Same rule as before (admin_schema step 5), plus two checks:
--   - from a call: the reporter was in that call, and is reporting the other
--     person in it (so a report can't be tied to someone else's call)
--   - screenshots: every path is in this report's own folder (so a report
--     can't point at someone else's files)
drop policy "users can send reports" on public.reports;

create policy "users can send reports"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'pending'
    and admin_note is null
    and reviewed_by is null
    and reviewed_at is null
    and not (target_type = 'user' and target_id = auth.uid())
    and not public.is_suspended(auth.uid())
    and (
      reports.call_id is null
      or (
        reports.target_type = 'user'
        and exists (
          select 1 from public.calls c
          where c.id = reports.call_id
            and ((c.caller_id = auth.uid() and c.callee_id = reports.target_id)
              or (c.callee_id = auth.uid() and c.caller_id = reports.target_id))
        )
      )
    )
    and not exists (
      select 1 from unnest(reports.evidence_paths) as path
      where path !~ ('^' || auth.uid()::text || '/' || reports.id::text || '/[1-3]\.jpg$')
    )
  );

-- ---------------------------------------------------------------------------
-- 2. The screenshots' storage (private)
-- ---------------------------------------------------------------------------

-- The browser turns every screenshot into a small JPEG first (shrinkImage),
-- so only JPEGs up to 5 MB are accepted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- Users can only upload into their own folder: report-evidence/<user id>/...
create policy "report-evidence: users can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'report-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

-- The person who sent them and admins can open them. Nobody else, not even
-- the person who was reported.
create policy "report-evidence: owners and admins can view"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-evidence'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- If saving the report fails, the browser deletes the screenshots it just
-- uploaded. Once a report uses a screenshot it can't be deleted anymore, so
-- the evidence can't be taken back after the report is sent.
create policy "report-evidence: owners can delete unsent files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.reports r where objects.name = any (r.evidence_paths))
  );

-- ---------------------------------------------------------------------------
-- 3. Telling the reporter
-- ---------------------------------------------------------------------------

alter table public.user_notifications drop constraint user_notifications_type_check;
alter table public.user_notifications add constraint user_notifications_type_check
  check (type in ('verification_approved', 'verification_rejected', 'suspension',
                  'suspension_lifted', 'appeal_accepted', 'appeal_rejected',
                  'report_resolved', 'report_dismissed'));

-- Runs when an admin resolves or dismisses a report. For privacy (RA 10173)
-- it never says what penalty the reported person got, and it doesn't repeat
-- anything users typed: only what kind of thing was reported and the date.
create or replace function public.notify_report_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  about text := case new.target_type
    when 'user' then 'a user'
    when 'service' then 'a service'
    else 'a job post'
  end;
  sent_on text := to_char(new.created_at at time zone 'Asia/Manila', 'Mon FMDD, YYYY');
begin
  if new.status = 'resolved' then
    insert into public.user_notifications (user_id, type, title, message)
    values (
      new.reporter_id, 'report_resolved', 'Your report was reviewed',
      'Thanks for your report about ' || about || ' (sent ' || sent_on || '). '
        || 'An admin reviewed it and took action.'
    );
  else
    insert into public.user_notifications (user_id, type, title, message)
    values (
      new.reporter_id, 'report_dismissed', 'Your report was reviewed',
      'An admin reviewed your report about ' || about || ' (sent ' || sent_on || ') '
        || 'and didn''t find a rule being broken. Thanks for helping keep PhilFreela safe.'
    );
  end if;
  return new;
end;
$$;

create trigger reports_notify
  after update of status on public.reports
  for each row
  when (old.status = 'pending' and new.status in ('resolved', 'dismissed'))
  execute function public.notify_report_reviewed();

-- Only the trigger uses it.
revoke execute on function public.notify_report_reviewed() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The reported calls, for the admin Reports page
-- ---------------------------------------------------------------------------

-- Admins can't read the calls table itself (only the two people in a call
-- can), and it holds connection details with IP addresses while a call is
-- going. This gives admins only the kind, the time, and when it was answered
-- and ended (for its length). Non-admins get nothing back.
create or replace function public.admin_report_calls(call_ids uuid[])
returns table (id uuid, kind text, created_at timestamptz, answered_at timestamptz, ended_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.kind, c.created_at, c.answered_at, c.ended_at
  from public.calls c
  where c.id = any (call_ids) and public.is_admin();
$$;

revoke execute on function public.admin_report_calls(uuid[]) from public, anon;
grant execute on function public.admin_report_calls(uuid[]) to authenticated;
