-- Dashboard billboard (admin panel > Billboard). Run this once in the Supabase
-- SQL Editor, after supabase_admin_schema.sql and supabase_admin_log_schema.sql.
--
-- The board at the top of every user's dashboard home. An admin posts a
-- welcome message or an advertisement on it: a headline, a short message and
-- an optional picture, for everyone or for one account type. Several can be
-- on at the same time (the dashboard shows them in turn), and an admin can
-- turn one off without deleting it. Nothing is paid for here: only admins
-- post, the same as announcements.

create table public.dashboard_billboards (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  -- Optional, so '' = no message.
  message text not null default '' check (char_length(message) <= 300),
  -- Where the picture is in the "billboard-images" bucket: the posting admin's
  -- folder, then a file name made by the website. Empty (null) = no picture.
  image_path text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-z-]+\.jpg$'),
  -- Who sees it: everyone, or only one account type.
  audience text not null default 'all' check (audience in ('all', 'freelancer', 'client')),
  -- Off = kept in the admin's list, but not shown on any dashboard.
  is_active boolean not null default true,
  created_by uuid references public.admins (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.dashboard_billboards enable row level security;

create index dashboard_billboards_created_at_idx on public.dashboard_billboards (created_at desc);
create index dashboard_billboards_created_by_idx on public.dashboard_billboards (created_by);

-- Users only see billboards that are on and meant for them: the ones for
-- everyone, plus the ones for their account type. Admins see all of them.
create policy "users can read their billboards"
  on public.dashboard_billboards for select
  to authenticated
  using (
    (
      is_active
      and (
        audience = 'all'
        or audience = (select account_type::text from public.profiles where id = (select auth.uid()))
      )
    )
    or (select public.is_admin())
  );

create policy "admins can post billboards"
  on public.dashboard_billboards for insert
  to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

create policy "admins can switch billboards on and off"
  on public.dashboard_billboards for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "admins can delete billboards"
  on public.dashboard_billboards for delete
  to authenticated
  using ((select public.is_admin()));

-- The only thing that can be changed afterwards is on / off. To fix the words
-- or the picture, the admin deletes the billboard and posts it again (the
-- same as announcements), so what users saw can't be quietly rewritten.
revoke update on public.dashboard_billboards from anon, authenticated;
grant update (is_active) on public.dashboard_billboards to authenticated;

-- Signed-out visitors have no use for this table.
revoke all on public.dashboard_billboards from anon;

-- ---- Activity Log ---------------------------------------------------------
-- Posting, switching and deleting a billboard goes in the admin Activity Log
-- under "Announcement" (a billboard is an announcement on the dashboard), so
-- the log's list of actions doesn't change.

create or replace function public.log_billboard_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_admin_log(
      'announcement',
      'posted the billboard "' || new.title || '" for ' ||
        case new.audience when 'freelancer' then 'freelancers' when 'client' then 'clients' else 'everyone' end || '.',
      new.id
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_active is distinct from old.is_active then
      perform public.write_admin_log(
        'announcement',
        'turned the billboard "' || new.title || '" ' || case when new.is_active then 'on' else 'off' end || '.',
        new.id
      );
    end if;
    return new;
  end if;

  perform public.write_admin_log('announcement', 'deleted the billboard "' || old.title || '".', old.id);
  return old;
end;
$$;

create trigger dashboard_billboards_log
  after insert or update or delete on public.dashboard_billboards
  for each row execute function public.log_billboard_change();

-- It only ever runs as a trigger, so nobody needs to call it through the API.
revoke execute on function public.log_billboard_change() from public, anon, authenticated;

-- ---- Pictures -------------------------------------------------------------
-- Public, so the dashboard can show a picture with a plain link. The browser
-- redraws every picture as a JPEG before uploading (lib/billboards.js), which
-- also strips anything hidden inside the original file, so only JPEGs up to
-- 2 MB are accepted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('billboard-images', 'billboard-images', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Only admins can add pictures, and only to their own folder:
-- billboard-images/<admin id>/...
create policy "billboard-images: admins can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'billboard-images'
    and public.is_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Removing the picture of a deleted billboard needs both of these.
create policy "billboard-images: admins can see the file entries"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'billboard-images' and public.is_admin());

create policy "billboard-images: admins can delete files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'billboard-images' and public.is_admin());
