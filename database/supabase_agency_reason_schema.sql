-- "Agency / shared account" becomes a report reason and a penalty (panel
-- revision, PLAN-panel-revisions.md, item 3, 2026-11-15). The panel asked how
-- PhilFreela knows a freelancer isn't an agency. Identity verification ties an
-- account to one real person (ID + face scan; the same face on another account
-- is flagged), but it can't see who does the work afterwards. So people who see
-- an account run by an agency or shared by several people can report it, and
-- the admin's penalty chart has a fixed line for it (lib/violations.js):
-- 14 days, posting blocked.
--
-- Apply it before or together with the website update (lib/reports.js,
-- lib/violations.js), so nobody can pick a reason the database refuses.

-- 1. The two lists of allowed reasons get 'agency'.
alter table public.reports drop constraint reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('spam', 'scam', 'inappropriate', 'harassment', 'stolen_work', 'agency', 'other'));

alter table public.user_suspensions drop constraint user_suspensions_violation_check;
alter table public.user_suspensions add constraint user_suspensions_violation_check
  check (violation in ('spam', 'scam', 'inappropriate', 'harassment', 'stolen_work', 'agency', 'other'));

-- 2. The admin log names it (otherwise it would say "Other"). The same function
--    as in supabase_stolen_work_schema.sql, with one more line.
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
    when 'agency' then 'Agency / shared account'
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
