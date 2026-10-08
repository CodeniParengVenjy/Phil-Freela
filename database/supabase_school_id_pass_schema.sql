-- School ID pass, extends database/supabase_admin_schema.sql (identity
-- verification) and database/supabase_admin_log_schema.sql (super admin and
-- the activity log). Plan: PLAN-school-id-pass.md. Part of Feature 4 (eKYC).
--
-- A super admin gives one person a pass. For 12 hours that person may verify
-- with a School ID instead of a government ID. They still do the face scan
-- and an admin still approves or rejects the request.
--
-- Run this file first, then supabase_school_id_pass_rules.sql (it swaps three
-- CHECK rules, which needs a confirm, so it is a separate small file).

-- 1. One pass per person at a time.
create table public.verification_passes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  id_type text not null default 'school_id' check (id_type = 'school_id'),
  -- The super admin who gave it.
  granted_by uuid references public.admins (id) on delete set null,
  expires_at timestamptz not null default now() + interval '12 hours',
  -- Filled in when the person's request is saved; the pass is then used up.
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index verification_passes_granted_by_idx on public.verification_passes (granted_by);

alter table public.verification_passes enable row level security;

-- People see only their own pass (so the form can show the School ID option);
-- admins see all of them. Nobody writes from the browser: passes are made and
-- cancelled only by the two functions below, and marked used by the trigger
-- below.
create policy "owners and admins can read passes"
  on public.verification_passes for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.verification_passes from anon, authenticated;
grant select on public.verification_passes to authenticated;

-- 2. Give a pass. Super admin only. Giving it again replaces the old one.
create or replace function public.grant_school_id_pass(target_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ends timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can give a School ID pass.';
  end if;

  if not exists (select 1 from public.profiles where id = target_id) then
    raise exception 'Only freelancer and client accounts can verify their identity.';
  end if;

  if public.is_verified(target_id) then
    raise exception 'That person is already verified.';
  end if;

  if exists (select 1 from public.identity_verifications where user_id = target_id and status = 'pending') then
    raise exception 'That person already has a verification waiting for review.';
  end if;

  insert into public.verification_passes (user_id, granted_by)
  values (target_id, auth.uid())
  on conflict (user_id) do update
    set granted_by = auth.uid(),
        expires_at = now() + interval '12 hours',
        used_at = null,
        created_at = now()
  returning expires_at into ends;

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    target_id, 'school_id_pass', 'You can verify with a School ID',
    'An admin allowed you to verify your identity with a School ID. Open the Verify Identity page and choose School ID. This only works for the next 12 hours.',
    '/dashboard/verify-identity'
  );

  perform public.write_admin_log(
    'verification',
    'allowed ' || public.log_name(target_id) || ' to verify with a School ID for 12 hours.',
    target_id
  );

  return ends;
end;
$$;

-- 3. Take back a pass that hasn't been used: it ends right now. Super admin
--    only.
create or replace function public.cancel_school_id_pass(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can cancel a School ID pass.';
  end if;

  update public.verification_passes
  set expires_at = now()
  where user_id = target_id and used_at is null and expires_at > now();

  if not found then
    raise exception 'That person has no unused School ID pass.';
  end if;

  perform public.write_admin_log(
    'verification',
    'cancelled ' || public.log_name(target_id) || '''s School ID pass.',
    target_id
  );
end;
$$;

revoke execute on function public.grant_school_id_pass(uuid) from public, anon;
revoke execute on function public.cancel_school_id_pass(uuid) from public, anon;
grant execute on function public.grant_school_id_pass(uuid) to authenticated;
grant execute on function public.cancel_school_id_pass(uuid) to authenticated;

-- 4. The database itself refuses a School ID request without a valid pass, no
--    matter who sends it (the AI service also checks first, to say so early),
--    and uses the pass up when the request is saved.
create or replace function public.check_and_use_school_id_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.verification_passes
  set used_at = now()
  where user_id = new.user_id and used_at is null and expires_at > now();

  if not found then
    raise exception 'You don''t have a School ID pass, or it has expired.';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_and_use_school_id_pass() from public, anon, authenticated;

create trigger identity_verifications_school_id_pass
  before insert on public.identity_verifications
  for each row
  when (new.id_type = 'school_id')
  execute function public.check_and_use_school_id_pass();
