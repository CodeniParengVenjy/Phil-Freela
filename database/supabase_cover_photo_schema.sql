-- Cover photos, and reporting profile pictures and cover photos. Run this in
-- the Supabase SQL Editor after supabase_avatar_schema.sql and
-- supabase_stolen_work_schema.sql. Run it once.
--
--   A. profiles.cover_path and the public "covers" bucket (the banner on a
--      profile), with the same own-folder rules as profile pictures.
--   B. A report can be about a profile picture or a cover photo
--      (reports.target_type), and remembers WHICH file was reported
--      (reports.reported_path), so a later change of picture can't make an
--      admin remove the wrong one.
--   C. A new admin request, remove_picture (a regular admin asks, a super
--      admin approves, like removing a listing).
--   D. admin_remove_picture(): the super admin's way to clear someone's
--      picture, plus the storage rules that let them delete the file.
--   E. A reported picture's file can't be deleted by its owner while the
--      report is waiting (so swapping the picture doesn't hide the evidence).
--   F. The same words in the Activity Log and in notifications.
--
-- Already on the live database (applied 2026-10-09 as migrations
-- "cover_photo_and_picture_reports" and "reported_picture_is_kept"), so there
-- is no need to run it again. For a fresh database, run the whole file.

begin;

-- ===========================================================================
-- A. The cover photo
-- ===========================================================================

-- Where the cover is inside the covers bucket, e.g. "<user id>/1727430000000.jpg"
-- (empty = no cover; the profile shows a plain banner). Same rule as
-- avatar_path: only a .jpg in the user's OWN folder, so nobody can point
-- their cover at an outside website or at someone else's file.
alter table public.profiles add column if not exists cover_path text;

alter table public.profiles drop constraint if exists profiles_cover_path_own_folder;
alter table public.profiles add constraint profiles_cover_path_own_folder
  check (cover_path is null or cover_path ~ ('^' || id::text || '/[0-9]+\.jpg$'));

-- Public, so any page can show a cover with a plain link. The browser shrinks
-- every cover to a JPEG of at most 1600 px before uploading (lib/avatar.js),
-- so only JPEGs up to 3 MB are accepted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

-- Users can only add covers to their own folder: covers/<user id>/...
create policy "covers: users can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- Deleting the old cover after a new one is saved needs both of these.
create policy "covers: users can see their file entries"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "covers: users can delete their files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===========================================================================
-- B. Reporting a picture
-- ===========================================================================
-- A check can't be edited, so it is taken off and put back with the new
-- values added.

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('user', 'service', 'job_post', 'portfolio_item', 'profile_picture', 'cover_photo'));

-- For a picture report, target_id is the OWNER's user id and reported_path is
-- the file that was reported, e.g. "<owner id>/1727430000000.jpg".
alter table public.reports add column if not exists reported_path text;

alter table public.reports drop constraint if exists reports_reported_path_check;
alter table public.reports add constraint reports_reported_path_check
  check (
    (target_type in ('profile_picture', 'cover_photo') and reported_path ~ ('^' || target_id::text || '/[0-9]+\.jpg$'))
    or (target_type not in ('profile_picture', 'cover_photo') and reported_path is null)
  );

-- The sending rule from supabase_reports_schema.sql, with two changes:
--   - you can't report your own picture (as with reporting yourself)
--   - the file must be the one the person has on their profile right now
alter policy "users can send reports" on public.reports
  with check (
    reporter_id = auth.uid()
    and status = 'pending'
    and admin_note is null
    and reviewed_by is null
    and reviewed_at is null
    and not (target_type in ('user', 'profile_picture', 'cover_photo') and target_id = auth.uid())
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
    and (
      reports.target_type not in ('profile_picture', 'cover_photo')
      or exists (
        select 1 from public.profiles p
        where p.id = reports.target_id
          and ((reports.target_type = 'profile_picture' and p.avatar_path = reports.reported_path)
            or (reports.target_type = 'cover_photo' and p.cover_path = reports.reported_path))
      )
    )
  );

-- ===========================================================================
-- C. The admin request: remove_picture
-- ===========================================================================

alter table public.admin_requests drop constraint if exists admin_requests_kind_check;
alter table public.admin_requests add constraint admin_requests_kind_check
  check (kind in ('suspend', 'ban', 'resolve', 'dismiss', 'remove_listing', 'remove_picture'));

-- Each kind must carry what the super admin needs to carry it out. A picture
-- request needs the report (it says which picture) and the owner.
alter table public.admin_requests drop constraint if exists admin_requests_check;
alter table public.admin_requests add constraint admin_requests_check
  check (
    (kind in ('resolve', 'dismiss') and report_id is not null)
    or (kind in ('suspend', 'ban') and target_user_id is not null)
    or (kind = 'remove_listing' and report_id is not null and listing_table is not null and listing_id is not null)
    or (kind = 'remove_picture' and report_id is not null and target_user_id is not null)
  );

-- ===========================================================================
-- D. Removing a picture (super admin only)
-- ===========================================================================

-- Clears the person's profile picture or cover photo, but only if the file is
-- still the one that was reported (p_path). Returns the cleared file, so the
-- page can delete it from storage, or null when the picture was already
-- changed or removed. "security definer": admins can't edit other people's
-- profiles themselves. It checks that the caller is a super admin first.
create or replace function public.admin_remove_picture(p_user uuid, p_kind text, p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can remove a picture.';
  end if;

  if p_kind = 'profile_picture' then
    update public.profiles set avatar_path = null where id = p_user and avatar_path = p_path;
  elsif p_kind = 'cover_photo' then
    update public.profiles set cover_path = null where id = p_user and cover_path = p_path;
  else
    raise exception 'Unknown kind of picture.';
  end if;

  if not found then
    return null;
  end if;

  perform public.write_admin_log('listing', 'removed ' || public.log_report_target(p_kind, p_user) || '.', p_user);
  return p_path;
end;
$$;

revoke execute on function public.admin_remove_picture(uuid, text, text) from public, anon;
grant execute on function public.admin_remove_picture(uuid, text, text) to authenticated;

-- Deleting the file takes the same two rules as a user deleting their own.
create policy "avatars: super admins can see files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and public.is_super_admin());

create policy "avatars: super admins can delete files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and public.is_super_admin());

create policy "covers: super admins can see files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'covers' and public.is_super_admin());

create policy "covers: super admins can delete files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'covers' and public.is_super_admin());

-- ===========================================================================
-- E. A reported picture can't be deleted while its report is waiting
-- ===========================================================================
-- Changing your picture normally deletes the old file (lib/avatar.js). Without
-- this, someone could get rid of the evidence by swapping the reported picture
-- before an admin looks. "security definer": the owner can't read other
-- people's reports, so the check has to run with more access than theirs.

create index reports_reported_path_idx on public.reports (reported_path) where reported_path is not null;

create or replace function public.is_reported_picture(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.reports r where r.status = 'pending' and r.reported_path = p_path);
$$;

revoke execute on function public.is_reported_picture(text) from public, anon;
grant execute on function public.is_reported_picture(text) to authenticated;

-- The owner's delete rules from the two earlier sections, plus "not reported".
-- (If the delete is refused the file just stays; the page treats a failed
-- delete of an old file as harmless.)
alter policy "avatars: users can delete their files" on storage.objects
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_reported_picture(name));

alter policy "covers: users can delete their files" on storage.objects
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_reported_picture(name));

-- ===========================================================================
-- F. The same words in the Activity Log and in notifications
-- ===========================================================================
-- (Each function is the one already there, with the new cases added.)

-- What a report points at, as words.
create or replace function public.log_report_target(t text, tid uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item_title text;
  owner_id uuid;
begin
  if t = 'user' then
    return public.log_name(tid);
  elsif t = 'profile_picture' then
    return 'the profile picture of ' || public.log_name(tid);
  elsif t = 'cover_photo' then
    return 'the cover photo of ' || public.log_name(tid);
  elsif t = 'service' then
    select s.title, s.freelancer_id into item_title, owner_id from public.services s where s.id = tid;
    if item_title is null then
      return 'a service that no longer exists';
    end if;
    return 'the service "' || item_title || '" by ' || public.log_name(owner_id);
  elsif t = 'portfolio_item' then
    select p.title, p.freelancer_id into item_title, owner_id from public.portfolio_items p where p.id = tid;
    if item_title is null then
      return 'a portfolio project that no longer exists';
    end if;
    return 'the portfolio project "' || item_title || '" by ' || public.log_name(owner_id);
  else
    select j.title, j.client_id into item_title, owner_id from public.job_posts j where j.id = tid;
    if item_title is null then
      return 'a job post that no longer exists';
    end if;
    return 'the job post "' || item_title || '" by ' || public.log_name(owner_id);
  end if;
end;
$$;

revoke execute on function public.log_report_target(text, uuid) from public, anon, authenticated;

-- "ban Keanne Reyes", "remove the profile picture of ...": the same words are
-- used when the request is made and when it is decided.
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
  elsif r.kind in ('remove_listing', 'remove_picture') then
    return 'remove ' || public.log_report_target(rep.target_type, rep.target_id);
  else
    return r.kind || ' a report about ' || public.log_report_target(rep.target_type, rep.target_id);
  end if;
end;
$$;

-- The message to the reporter once an admin has reviewed the report. For
-- privacy (RA 10173) it never says what penalty the reported person got.
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
    when 'portfolio_item' then 'a portfolio project'
    when 'profile_picture' then 'a profile picture'
    when 'cover_photo' then 'a cover photo'
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

revoke execute on function public.notify_report_reviewed() from public, anon, authenticated;

commit;
