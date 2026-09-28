-- Check Ownership (watermarking system, step 4). Run this in the Supabase SQL
-- Editor after supabase_watermark_schema.sql.
--
-- Anyone signed in can upload a picture they found; the Python AI service
-- reads the invisible code hidden in it and looks for the closest code saved
-- here, to show whose work it is.

-- ---------------------------------------------------------------------------
-- Codes remember their owner, and stay when the post is deleted
-- ---------------------------------------------------------------------------

-- Otherwise someone could download a photo, wait until its owner deletes the
-- post, and the copy could no longer be traced. (Deleting the whole account
-- still deletes the codes.)
alter table public.watermark_codes
  add column freelancer_id uuid references public.profiles (id) on delete cascade;

update public.watermark_codes w
set freelancer_id = s.freelancer_id
from public.media_slides s
where s.id = w.slide_id;

alter table public.watermark_codes alter column freelancer_id set not null;

-- The slide link is emptied (instead of the code being deleted) when the
-- slide or its service/project is deleted.
alter table public.watermark_codes drop constraint watermark_codes_slide_id_fkey;
alter table public.watermark_codes alter column slide_id drop not null;
alter table public.watermark_codes
  add constraint watermark_codes_slide_id_fkey
  foreign key (slide_id) references public.media_slides (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Finding the closest codes
-- ---------------------------------------------------------------------------

-- For each saved code, how many of its 48 bits differ from the closest of the
-- codes read from the picture (XOR the two numbers, then count the 1 bits).
-- Returns the closest few, best first. The AI service decides if the best one
-- is close enough to count as a match.
create or replace function public.closest_watermark_codes(candidates bigint[], how_many int default 2)
returns table (code bigint, slide_id uuid, freelancer_id uuid, created_at timestamptz, wrong_bits int)
language sql
stable
set search_path = public
as $$
  select w.code, w.slide_id, w.freelancer_id, w.created_at,
         min(bit_count((w.code # c)::bit(64)))::int as wrong_bits
  from public.watermark_codes w
  cross join unnest(candidates) as c
  group by w.code, w.slide_id, w.freelancer_id, w.created_at
  order by wrong_bits
  limit how_many;
$$;

-- Only the AI service may use it: the codes must stay secret.
revoke execute on function public.closest_watermark_codes(bigint[], int) from public, anon, authenticated;
grant execute on function public.closest_watermark_codes(bigint[], int) to service_role;
