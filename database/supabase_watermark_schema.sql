-- Watermarks for photos (watermarking system, step 3). Run this in the
-- Supabase SQL Editor after supabase_portfolio_schema.sql.
--
-- Every photo a freelancer uploads (to a service or a portfolio project) gets:
-- 1. a visible watermark drawn into it, in the style the freelancer picks in
--    Settings > Watermark Settings (unless they turned it off, or marked the
--    file as a promo/ad), and
-- 2. an invisible 48-bit code hidden in it with HiDDeN, which points back to
--    the slide and its owner.
-- The Python AI service does both while saving the photo.

-- ---------------------------------------------------------------------------
-- Each freelancer's visible watermark style (no row = the defaults below)
-- ---------------------------------------------------------------------------

create table public.watermark_settings (
  freelancer_id uuid primary key references public.profiles (id) on delete cascade,
  visible_enabled boolean not null default true,
  -- What the watermark says: their @username, their full name, or their own text.
  text_mode text not null default 'username' check (text_mode in ('username', 'full_name', 'custom')),
  custom_text varchar(40) check (custom_text is null or char_length(trim(custom_text)) between 1 and 40),
  position text not null default 'bottom_right'
    check (position in ('top_left', 'top_right', 'bottom_left', 'bottom_right', 'center', 'tiled')),
  -- How see-through it is: 10 (faint) to 80 (strong), in percent.
  -- (Was 40 at first: too faint to notice, so the live table was changed
  -- with "alter table public.watermark_settings alter column opacity set default 60".)
  opacity smallint not null default 60 check (opacity between 10 and 80),
  size text not null default 'medium' check (size in ('small', 'medium', 'large')),
  color text not null default 'white' check (color in ('white', 'black', 'orange')),
  -- The small PhilFreela logo in front of the text.
  show_badge boolean not null default true,
  updated_at timestamptz not null default now(),
  -- "Custom" needs the custom text.
  check (text_mode <> 'custom' or custom_text is not null)
);

alter table public.watermark_settings enable row level security;

-- Freelancers see and change only their own style. The AI service reads it
-- with its service key when a photo is uploaded.
create policy "watermark_settings: owner can view"
  on public.watermark_settings for select
  to authenticated
  using (freelancer_id = auth.uid());

create policy "watermark_settings: owner can insert"
  on public.watermark_settings for insert
  to authenticated
  with check (freelancer_id = auth.uid());

create policy "watermark_settings: owner can update"
  on public.watermark_settings for update
  to authenticated
  using (freelancer_id = auth.uid())
  with check (freelancer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Which slides carry a watermark, and which are promos/ads
-- ---------------------------------------------------------------------------

-- watermarked: the file itself carries the invisible code (its visible
--   watermark depends on the freelancer's settings). Pages only draw the faint
--   uploader name over slides that aren't watermarked: older photos, videos
--   (until step 7), and very plain pictures that can't hold the code.
-- promo: the freelancer marked it as a promo/ad (e.g. a poster saying "Are you
--   looking for a video editor?"), so it gets no visible watermark and no
--   name over it. It still gets the invisible code and the copy check.
alter table public.media_slides
  add column watermarked boolean not null default false,
  add column promo boolean not null default false;

-- ---------------------------------------------------------------------------
-- The hidden codes (private)
-- ---------------------------------------------------------------------------

-- One random 48-bit code per watermarked slide. Kept apart from media_slides
-- and readable by NOBODY but the AI service (no rules below = no access for
-- users): if the codes were public, someone could hide another freelancer's
-- code in a picture to make it look like theirs.
create table public.watermark_codes (
  code bigint primary key check (code >= 0 and code < 281474976710656), -- 2^48
  slide_id uuid not null unique references public.media_slides (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.watermark_codes enable row level security;
