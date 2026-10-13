-- Document previews. Plan: PLAN-document-previews.md. Run this in the Supabase
-- SQL Editor (or apply it as a migration) BEFORE the website and the AI
-- service that use it go live: the website's slide query asks for hidden_chars.
--
-- A document in a service or a portfolio project (a PDF, DOCX or TXT) used to
-- be one public .txt file in the slide-media bucket with ALL of its text, and
-- the reader could show it all, ready to copy. Now visitors only get a PREVIEW:
-- the first part of the text, with the rest blurred in the page.
--
-- Blur alone is only styling (the whole text would still be in the page), so
-- the AI service saves the hidden part somewhere else:
--   - the public .txt file holds ONLY the preview;
--   - the whole text goes in slide_texts below, which only its writer and the
--     admins can read (Admin > Flagged Content compares whole documents).

-- 1. How many characters of the text are not in the preview (0 = nothing was
--    left out, or a document saved before previews existed). The page uses it
--    to size the blurred filler and to decide whether to show the note.
alter table public.media_slides
  add column if not exists hidden_chars integer not null default 0 check (hidden_chars >= 0);

-- 2. The whole text of a document slide. It is removed with its slide.
create table if not exists public.slide_texts (
  slide_id uuid primary key references public.media_slides (id) on delete cascade,
  body text not null
);

alter table public.slide_texts enable row level security;

-- People can only read. Nobody can add, change or remove rows from the
-- browser: only the AI service writes here, with its own key (which bypasses
-- these rules), so a text can't be swapped for another one.
revoke all on public.slide_texts from anon, authenticated;
grant select on public.slide_texts to authenticated;

-- The writer reads their own documents' text, and admins read all of them.
create policy "slide_texts: the writer and admins can read"
  on public.slide_texts for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.media_slides s
      where s.id = slide_texts.slide_id and s.freelancer_id = auth.uid()
    )
  );
