-- Stolen work (PLAN-stolen-work.md, step 2). Run this once in the Supabase
-- SQL Editor, after supabase_admin_roles_schema.sql. It can be run again
-- without harm.
--
-- 1. "Stolen work" becomes a reason users can report and a violation admins
--    can suspend for, and a portfolio project can be reported (and removed by
--    an admin) like a service.
-- 2. On Admin > Flagged Content, "Keep this one, remove the other" for when
--    the copier posted first and the real owner's upload is the one held back.
--
-- No new tables and no new columns.

begin;

-- ===========================================================================
-- A. The new reason, violation and report target
-- ===========================================================================
-- A check can't be edited, so each one is taken off and put back with the
-- new value added.

alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('spam', 'scam', 'inappropriate', 'harassment', 'fake_profile', 'stolen_work', 'other'));

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('user', 'service', 'job_post', 'portfolio_item'));

alter table public.user_suspensions drop constraint if exists user_suspensions_violation_check;
alter table public.user_suspensions add constraint user_suspensions_violation_check
  check (violation in ('spam', 'scam', 'inappropriate', 'harassment', 'fake_profile', 'stolen_work', 'other'));

-- A regular admin's "Remove" on a reported portfolio project goes to a super
-- admin as a request, like removing a service or job post.
alter table public.admin_requests drop constraint if exists admin_requests_listing_table_check;
alter table public.admin_requests add constraint admin_requests_listing_table_check
  check (listing_table in ('services', 'job_posts', 'portfolio_items'));

-- ===========================================================================
-- B. The same words in the Activity Log and in notifications
-- ===========================================================================
-- (Each function is the one already there, with one case added.)

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

create or replace function public.log_suspension_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text;
  days int;
begin
  if tg_op = 'DELETE' then
    -- Skip when the whole account is being deleted (the row goes with it).
    if exists (select 1 from public.profiles where id = old.user_id) then
      if old.ends_at is null then
        perform public.write_admin_log('lift', 'lifted the ban on ' || public.log_name(old.user_id) || '.', old.user_id);
      else
        perform public.write_admin_log('lift', 'ended ' || public.log_name(old.user_id) || '''s suspension.', old.user_id);
      end if;
    end if;
    return old;
  end if;

  label := case new.violation
    when 'spam' then 'Spam'
    when 'scam' then 'Scam / Fraud'
    when 'inappropriate' then 'Inappropriate content'
    when 'harassment' then 'Harassment'
    when 'fake_profile' then 'Fake profile'
    when 'stolen_work' then 'Stolen work'
    else 'Other'
  end;

  if new.ends_at is null then
    perform public.write_admin_log('ban', 'banned ' || public.log_name(new.user_id) || ' permanently (' || label || ').', new.user_id);
  else
    days := greatest(1, round(extract(epoch from (new.ends_at - new.created_at)) / 86400));
    perform public.write_admin_log(
      'suspend',
      'suspended ' || public.log_name(new.user_id) || ' for ' || days || case when days = 1 then ' day' else ' days' end || ' (' || label || ').',
      new.user_id
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.log_suspension_change() from public, anon, authenticated;

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
    when 'portfolio_item' then 'a portfolio project'
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

-- A portfolio project (or an older writing item) an admin deletes, like the
-- lines for deleted services and job posts. The owner deleting their own
-- writes nothing: write_admin_log only writes for admins. A document held by
-- the copy check already gets its own line (log_flagged_document).
create or replace function public.log_portfolio_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip when it goes along with the owner's whole account.
  if old.status <> 'flagged' and exists (select 1 from public.profiles where id = old.freelancer_id) then
    perform public.write_admin_log(
      'listing',
      'deleted the portfolio ' || case old.kind when 'document' then 'document' else 'project' end
        || ' "' || old.title || '" by ' || public.log_name(old.freelancer_id) || '.',
      old.id
    );
  end if;
  return old;
end;
$$;

revoke execute on function public.log_portfolio_delete() from public, anon, authenticated;

drop trigger if exists portfolio_items_delete_log on public.portfolio_items;
create trigger portfolio_items_delete_log
  after delete on public.portfolio_items
  for each row execute function public.log_portfolio_delete();

-- ===========================================================================
-- C. Flagged Content: "Keep this one, remove the other"
-- ===========================================================================

-- The copy check holds back the LATER upload. Usually that is the copy, but
-- when a copier posted first, the real owner's upload is the one held back.
-- This shows the held-back upload and removes the earlier post it matched, in
-- one go (all of it happens, or none of it).
--   item_type: 'slide' (a photo, video or document in a service or project)
--              or 'document' (an older portfolio writing item)
--   item_id:   the held-back one
-- Returns the removed slide's file, so the page can delete it from storage
-- (empty when what was removed is a writing item, which has no file).
-- "security definer": it changes the private watermark_codes table, which
-- admins can't touch themselves. It checks that the caller is an admin first.
create or replace function public.keep_flagged_remove_other(item_type text, item_id uuid)
returns table (removed_path text, removed_pages int)
language plpgsql
security definer
set search_path = public
as $$
declare
  keeper uuid;        -- who uploaded the held-back one
  score real;         -- how it matched (1.0 = by the hidden code)
  other_slide uuid;   -- what it matched: a slide...
  other_item uuid;    -- ...or a portfolio writing item
  other_owner uuid;
  other_what text;    -- "photo", "video" or "document", for the log
  gone_path text;
  gone_pages int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review flagged content.';
  end if;

  -- The held-back upload, and what it matched.
  if item_type = 'slide' then
    select s.freelancer_id, s.match_score, s.matched_slide_id, s.matched_item_id
      into keeper, score, other_slide, other_item
      from public.media_slides s
      where s.id = item_id and s.status = 'flagged';
  elsif item_type = 'document' then
    select p.freelancer_id, p.match_score, p.matched_slide_id, p.matched_item_id
      into keeper, score, other_slide, other_item
      from public.portfolio_items p
      where p.id = item_id and p.kind = 'document' and p.status = 'flagged';
  else
    raise exception 'Unknown kind of flagged item.';
  end if;

  if keeper is null then
    raise exception 'That item is not waiting for review.';
  end if;
  -- A file that carries the other freelancer's hidden code is a download of
  -- their post, so it can't be the original.
  if score >= 1 then
    raise exception 'This file carries the other freelancer''s hidden code, so it cannot be the original.';
  end if;

  -- The earlier post it matched must still be there.
  if other_slide is not null then
    select s.freelancer_id, s.file_path, s.page_count,
           case s.media_type when 'video' then 'video' when 'document' then 'document' else 'photo' end
      into other_owner, gone_path, gone_pages, other_what
      from public.media_slides s where s.id = other_slide;
  elsif other_item is not null then
    select p.freelancer_id, 'document' into other_owner, other_what
      from public.portfolio_items p where p.id = other_item;
  end if;
  if other_owner is null then
    raise exception 'The item it matched has already been deleted. Use "Looks fine, show it" instead.';
  end if;

  -- The removed post's hidden code now belongs to the real owner. So Check
  -- Ownership names them, not the copier, for any copy of the removed post
  -- (a screenshot of it, for example). The code's link to the post empties
  -- by itself when the post is deleted below.
  update public.watermark_codes w
     set freelancer_id = keeper
   where (other_slide is not null and w.slide_id = other_slide)
      or (other_item is not null and w.portfolio_item_id = other_item);

  -- Show the kept one. (The existing trigger writes "approved a flagged ..."
  -- in the Activity Log.)
  if item_type = 'slide' then
    update public.media_slides set status = 'active' where id = item_id;
  else
    update public.portfolio_items set status = 'active' where id = item_id;
  end if;

  -- Remove the earlier post it matched.
  if other_slide is not null then
    delete from public.media_slides where id = other_slide;
  else
    delete from public.portfolio_items where id = other_item;
  end if;

  perform public.write_admin_log(
    'flagged',
    'removed the earlier ' || other_what || ' by ' || public.log_name(other_owner)
      || ' as the copy, and kept the one by ' || public.log_name(keeper) || '.',
    coalesce(other_slide, other_item)
  );

  return query select gone_path, gone_pages;
end;
$$;

-- Signed-in people may call it; the function itself lets only admins through.
revoke execute on function public.keep_flagged_remove_other(text, uuid) from public, anon;
grant execute on function public.keep_flagged_remove_other(text, uuid) to authenticated;

commit;
