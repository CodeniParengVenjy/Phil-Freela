-- Premium, part 2 (PLAN-premium.md): the two-color (gradient) look in
-- Appearance becomes a Premium perk. Applied together with the website that
-- shows it as Premium, so nobody on the old page gets a refusal it can't explain.
-- Run after supabase_premium_schema.sql.

-- ---------------------------------------------------------------------------
-- 6. The two-color look (Appearance) is a Premium perk
-- ---------------------------------------------------------------------------

-- Only a NEW second color is checked: someone whose Premium ended keeps their
-- saved choice (the website shows one color until they have Premium again),
-- and can still change their other settings.
create or replace function public.premium_gradient_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.accent_color_2 is not null
     and (tg_op = 'INSERT' or new.accent_color_2 is distinct from old.accent_color_2)
     and not public.is_pro(new.id) then
    raise exception 'The two-color look is a Premium perk.';
  end if;
  return new;
end;
$$;

create trigger profiles_premium_gradient
  before insert or update of accent_color_2 on public.profiles
  for each row execute function public.premium_gradient_only();
