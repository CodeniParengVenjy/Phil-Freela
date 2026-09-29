-- Portfolio categories and tags (watermarking system, step 10). Run this in
-- the Supabase SQL Editor after supabase_service_documents_schema.sql.
--
-- Each portfolio project gets one category (the same list as services, see
-- client/src/lib/categories.js) and up to 5 keywords ("Photoshop", "Logo"...),
-- shown on the cards and usable by search and recommendations. Projects made
-- before this have none.

alter table public.portfolio_items
  add column category text check (category is null or char_length(category) <= 40),
  add column tags text[] not null default '{}',
  -- Up to 5 tags of up to 30 characters each (checked by the website too).
  add constraint portfolio_items_tags_limit check (cardinality(tags) <= 5 and char_length(array_to_string(tags, '')) <= 150);
