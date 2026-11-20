-- Highlight styles (PLAN-highlight-styles.md, Step 1): which style a freelancer's highlight plays in.
-- The Director's Cut ('cinema') is for every freelancer; the five other styles (Papercut, Retro, Cartoony,
-- Kinetic type, Comic book) are a Premium perk (the user, 2026-11-20).
-- APPLIED to the live database on 2026-11-20 after the user's typed go (migration highlight_style, version
-- 20261120032743). test_highlight_style.sql passed 7 of 7 before and after it (rolled back each time).

-- ---------------------------------------------------------------------------
-- 1. The chosen style (everyone starts with the Director's Cut)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists highlight_style text not null default 'cinema'
    check (highlight_style in ('cinema', 'paper', 'retro', 'toon', 'kinetic', 'comic'));

comment on column public.profiles.highlight_style is
  'The style of the freelancer''s highlight: cinema (the Director''s Cut, for everyone) or a Premium style (paper, retro, toon, kinetic, comic).';

-- ---------------------------------------------------------------------------
-- 2. The five styles are a Premium perk
-- ---------------------------------------------------------------------------
-- Only a NEW choice is checked (the same rule as the two-color look, supabase_premium_gradient_schema.sql):
-- someone whose Premium ended keeps their saved style (the website plays the Director's Cut until they have
-- Premium again), can still change their other settings, and can always go back to the Director's Cut.
create or replace function public.premium_highlight_style_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.highlight_style <> 'cinema'
     and (tg_op = 'INSERT' or new.highlight_style is distinct from old.highlight_style)
     and not public.is_pro(new.id) then
    raise exception 'Highlight styles are a Premium perk.';
  end if;
  return new;
end;
$$;

create or replace trigger profiles_premium_highlight_style
  before insert or update of highlight_style on public.profiles
  for each row execute function public.premium_highlight_style_only();
