-- Pay to unlock (PLAN-transaction-tracking.md, Step F). Run this in the Supabase
-- SQL Editor after supabase_projects_schema.sql, supabase_payments_schema.sql and
-- supabase_chat_payments_schema.sql.
--
-- The user's rule (2026-11-07): until the client has paid, the work the freelancer
-- sent shows only with a watermark, and the client cannot download it. So:
--   * the client never gets the ORIGINAL file before a payment is confirmed: the
--     storage rule in part 3 refuses it, whatever the page does;
--   * instead the client gets a watermarked PREVIEW that the AI service makes from
--     the real file (ai-service/deliverable_preview.py). Previews sit in their own
--     private bucket that only the service writes into, so the freelancer cannot
--     show one thing and deliver another;
--   * as soon as the freelancer confirms ANY payment on the project (the user's
--     choice, 2026-10-25), the project unlocks by itself and the original opens
--     for the client, like before.
-- No money is held or moved: PhilFreela only holds back the FILE.

-- ---------------------------------------------------------------------------
-- 1. The columns.
-- ---------------------------------------------------------------------------

alter table public.projects
  -- True when the work that was sent has a file that waits for a payment. Set by
  -- submit_project for every file sent from now on (old rows: part 6).
  add column if not exists files_locked boolean not null default false,
  -- The watermarked preview in the "deliverable-previews" bucket. Written only
  -- by the AI service; emptied when new work is sent.
  add column if not exists preview_path text,
  -- When the first payment on the project was confirmed. Once set, the original
  -- opens for the client and stays open.
  add column if not exists unlocked_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. The preview bucket. Private, and with NO upload rule for users: only the AI
-- service (with the service key) puts previews here.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deliverable-previews', 'deliverable-previews', false, 52428800, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;

-- Opening a preview: the client or the freelancer of the project it belongs to.
create policy "deliverable previews: the project's client and freelancer can open"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'deliverable-previews'
    and exists (
      select 1 from public.projects p
      where p.preview_path = objects.name
        and (p.client_id = auth.uid() or p.freelancer_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. The original file. The freelancer can always open their own work. The
-- client can open it only when it isn't locked, or once the project is
-- unlocked. (Same rule name as before; only who may open it changed.)
-- ---------------------------------------------------------------------------

alter policy "deliverables: the project's client and freelancer can open"
  on storage.objects
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.projects p
      where p.submission_path = objects.name
        and (
          p.freelancer_id = auth.uid()
          or (p.client_id = auth.uid() and (not p.files_locked or p.unlocked_at is not null))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Sending the work. The same rules as before (supabase_projects_schema.sql),
-- plus two lines: a file sent from now on is locked, and the old preview no
-- longer counts (the AI service makes a new one for the new file).
-- ---------------------------------------------------------------------------

create or replace function public.submit_project(target_project uuid, file_path text, deliverable_link text, deliverable_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
  freelancer_name text;
begin
  select * into proj from public.projects where id = target_project;

  if not found or proj.freelancer_id <> auth.uid() then
    raise exception 'Only the freelancer on this project can submit work for it.';
  end if;
  if proj.status <> 'started' then
    raise exception 'This project already has submitted work waiting for the client.';
  end if;
  if file_path is null and (deliverable_link is null or btrim(deliverable_link) = '') then
    raise exception 'Attach a file or paste a link.';
  end if;
  if file_path is not null and file_path !~ ('^' || auth.uid()::text || '/' || target_project::text || '-[0-9]+\.[a-z0-9]+$') then
    raise exception 'That file was not uploaded for this project.';
  end if;
  if deliverable_link is not null and btrim(deliverable_link) <> '' and deliverable_link !~ '^https://' then
    raise exception 'The link must start with https://.';
  end if;
  if char_length(coalesce(deliverable_message, '')) > 1000 then
    raise exception 'The message can be up to 1000 characters.';
  end if;

  update public.projects set
    submission_path = file_path,
    submission_link = nullif(btrim(deliverable_link), ''),
    submission_message = nullif(btrim(deliverable_message), ''),
    submitted_at = now(),
    status = 'submitted',
    -- Pay to unlock: a file waits for a payment (a link is shown as it is).
    files_locked = file_path is not null,
    preview_path = null
  where id = target_project;

  select coalesce(nullif(full_name, ''), username, 'A freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    proj.client_id, 'project_submitted', 'Work submitted',
    freelancer_name || ' sent the work for "' || proj.title || '". Open the project to review it.',
    '/dashboard/project-details/' || target_project
  );
end;
$$;

revoke execute on function public.submit_project(uuid, text, text, text) from public, anon;
grant execute on function public.submit_project(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Unlocking. When a payment on a project becomes "confirmed" (the
-- freelancer's "Yes, received"), the project unlocks. A trigger, so every way of
-- confirming counts. A payment made in a chat (no project) unlocks nothing.
-- ---------------------------------------------------------------------------

create or replace function public.unlock_project_files()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects set unlocked_at = now()
   where id = new.project_id and unlocked_at is null;
  return new;
end;
$$;

revoke execute on function public.unlock_project_files() from public, anon, authenticated;

create or replace trigger payments_unlock_project_files
  after insert or update of status on public.payments
  for each row
  when (new.status = 'confirmed' and new.project_id is not null)
  execute function public.unlock_project_files();

-- ---------------------------------------------------------------------------
-- 6. What is already there (2026-11-07: 5 projects with a file, none of them
-- paid). A project that already has a confirmed payment counts as unlocked from
-- that payment. The files already sent are locked too (the user's choice); their
-- previews are made once with the AI service's own code.
-- ---------------------------------------------------------------------------

update public.projects p
   set unlocked_at = (select min(x.answered_at) from public.payments x where x.project_id = p.id and x.status = 'confirmed')
 where p.unlocked_at is null
   and exists (select 1 from public.payments x where x.project_id = p.id and x.status = 'confirmed');

update public.projects
   set files_locked = true
 where submission_path is not null and not files_locked;
