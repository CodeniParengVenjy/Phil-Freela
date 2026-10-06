-- PDF pages as watermarked pictures (watermarking system, step 11). Run this
-- in the Supabase SQL Editor after supabase_portfolio_tags_schema.sql.
--
-- A document slide (a PDF, DOCX or TXT in a service or a portfolio project)
-- was kept as text only (step 8). A PDF now also keeps its first pages as
-- pictures, so viewers see the real layout: the Python AI service draws the
-- freelancer's name across each page and hides the document's invisible code
-- in it, then saves the pictures next to the text file in slide-media:
--   "<user id>/<slide id>.txt"      the text (as before)
--   "<user id>/<slide id>-p1.jpg"   page 1, "-p2.jpg" page 2, and so on

-- How many page pictures a document slide has: 0 for a DOCX or TXT (and for
-- documents saved before this step), 1 to 5 for a PDF.
alter table public.media_slides
  add column page_count smallint not null default 0 check (page_count between 0 and 5);

-- Nothing else changes: the slide-media bucket already takes JPEG pictures,
-- only the AI service can put files there, and the pages carry the same
-- hidden code as the text (watermark_codes.slide_id).
