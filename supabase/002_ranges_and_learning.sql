-- OPTML — migration 002: honest ranges, corrections, portion learning
-- Run after schema.sql, in the Supabase SQL Editor. Safe to re-run.
--
-- Three product decisions drive this file:
--   1. Estimates are stored as RANGES, not single numbers. Published research
--      puts AI meal estimates at roughly +154 kcal/day high, so the true value
--      usually sits BELOW the estimate — the range has to be allowed to be
--      asymmetric, which rules out storing one number ± a percentage.
--   2. Every correction a user makes is recorded. That same table does two
--      jobs: it teaches the app this user's real portions, and it is the
--      evidence base for publishing our own accuracy later.
--   3. Units follow the device, so the stored value is always metric and only
--      the display converts.

-- ---------------------------------------------------------------------------
-- Ranges on meal_items.
-- The point estimate stays in the existing column, so nothing that already
-- reads `calories` breaks; _min/_max are added beside it.
-- ---------------------------------------------------------------------------
alter table public.meal_items
  add column if not exists calories_min  numeric,
  add column if not exists calories_max  numeric,
  add column if not exists protein_min   numeric,
  add column if not exists protein_max   numeric,
  add column if not exists carbs_min     numeric,
  add column if not exists carbs_max     numeric,
  add column if not exists fat_min       numeric,
  add column if not exists fat_max       numeric,
  -- How sure the parser was. Drives whether the UI shows the range up front.
  add column if not exists confidence    text
    check (confidence in ('high', 'medium', 'low')),
  -- "Show the working": which food was matched, what portion was assumed,
  -- and anything the model had to guess. Rendered on tap.
  add column if not exists assumptions   jsonb,
  -- True once a human has corrected this item, so it is excluded from
  -- accuracy measurement as an AI estimate.
  add column if not exists corrected     boolean not null default false;

-- Same on meals, rolled up from the items.
alter table public.meals
  add column if not exists calories_min numeric,
  add column if not exists calories_max numeric,
  add column if not exists protein_min  numeric,
  add column if not exists protein_max  numeric,
  add column if not exists carbs_min    numeric,
  add column if not exists carbs_max    numeric,
  add column if not exists fat_min      numeric,
  add column if not exists fat_max      numeric,
  add column if not exists confidence   text
    check (confidence in ('high', 'medium', 'low'));

-- ---------------------------------------------------------------------------
-- corrections
-- One row per field a user changed. `ai_value` is what the model said and
-- `user_value` is what the human said it actually was, so the difference
-- between them IS our measured bias.
-- ---------------------------------------------------------------------------
create table if not exists public.corrections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  meal_item_id  uuid references public.meal_items on delete set null,
  -- Normalised food name, so corrections for "2 eggs" and "Eggs" meet.
  food_key      text not null,
  field         text not null
    check (field in ('qty', 'calories', 'protein_g', 'carbs_g', 'fat_g')),
  ai_value      numeric,
  user_value    numeric,
  created_at    timestamptz not null default now()
);

create index if not exists corrections_user_food_idx
  on public.corrections (user_id, food_key);
create index if not exists corrections_created_idx
  on public.corrections (created_at desc);

-- ---------------------------------------------------------------------------
-- portion_priors
-- What this particular user means by "a bowl of rice". Built from their own
-- corrections, and fed back into the next parse. This is the part that
-- compounds: a competitor can copy the feature but not the history.
-- ---------------------------------------------------------------------------
create table if not exists public.portion_priors (
  user_id      uuid not null references auth.users on delete cascade,
  food_key     text not null,
  qty          numeric,
  unit         text,
  grams        numeric,
  calories     numeric,
  protein_g    numeric,
  carbs_g      numeric,
  fat_g        numeric,
  -- How many corrections back this prior. More samples, more trust.
  sample_count int not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (user_id, food_key)
);

-- ---------------------------------------------------------------------------
-- Profile additions: units and the optional preference step.
-- `units` null means "follow the device locale" — only set once the user
-- overrides it in Settings.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists units           text
    check (units in ('metric', 'imperial')),
  add column if not exists diet_type       text,
  add column if not exists allergies       text[],
  add column if not exists training_days   int[],
  add column if not exists activity_level  text,
  add column if not exists goal            text
    check (goal in ('lose', 'maintain', 'gain')),
  -- Null until the required onboarding steps are done. The optional
  -- preferences step is skippable and does not gate this.
  add column if not exists onboarded_at    timestamptz;

-- ---------------------------------------------------------------------------
-- Row level security for the new tables.
-- ---------------------------------------------------------------------------
alter table public.corrections    enable row level security;
alter table public.portion_priors enable row level security;

grant all on public.corrections, public.portion_priors to authenticated;

drop policy if exists "own corrections" on public.corrections;
create policy "own corrections" on public.corrections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own portion priors" on public.portion_priors;
create policy "own portion priors" on public.portion_priors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Recording a correction also updates the prior, in one step, so the two can
-- never disagree. A running mean keeps later corrections from being drowned
-- out by the first one.
-- ---------------------------------------------------------------------------
create or replace function public.record_correction(
  p_meal_item_id uuid,
  p_food_key     text,
  p_field        text,
  p_ai_value     numeric,
  p_user_value   numeric
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into public.corrections
    (user_id, meal_item_id, food_key, field, ai_value, user_value)
  values (v_user, p_meal_item_id, lower(trim(p_food_key)), p_field,
          p_ai_value, p_user_value);

  if p_meal_item_id is not null then
    update public.meal_items set corrected = true where id = p_meal_item_id;
  end if;

  -- Only macro corrections teach a portion prior; a qty change is handled by
  -- the parser re-scaling, not by remembering a different food.
  if p_field in ('calories', 'protein_g', 'carbs_g', 'fat_g') then
    insert into public.portion_priors as pp
      (user_id, food_key, calories, protein_g, carbs_g, fat_g, sample_count)
    values (
      v_user, lower(trim(p_food_key)),
      case when p_field = 'calories'  then p_user_value end,
      case when p_field = 'protein_g' then p_user_value end,
      case when p_field = 'carbs_g'   then p_user_value end,
      case when p_field = 'fat_g'     then p_user_value end,
      1
    )
    on conflict (user_id, food_key) do update set
      calories = case when p_field = 'calories'
        then (coalesce(pp.calories, p_user_value) * pp.sample_count + p_user_value)
             / (pp.sample_count + 1)
        else pp.calories end,
      protein_g = case when p_field = 'protein_g'
        then (coalesce(pp.protein_g, p_user_value) * pp.sample_count + p_user_value)
             / (pp.sample_count + 1)
        else pp.protein_g end,
      carbs_g = case when p_field = 'carbs_g'
        then (coalesce(pp.carbs_g, p_user_value) * pp.sample_count + p_user_value)
             / (pp.sample_count + 1)
        else pp.carbs_g end,
      fat_g = case when p_field = 'fat_g'
        then (coalesce(pp.fat_g, p_user_value) * pp.sample_count + p_user_value)
             / (pp.sample_count + 1)
        else pp.fat_g end,
      sample_count = pp.sample_count + 1,
      updated_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Our measured bias, from corrections on uncorrected AI estimates.
-- This is what "publish our own accuracy" reads.
-- ---------------------------------------------------------------------------
create or replace function public.accuracy_summary()
returns table (
  field       text,
  samples     bigint,
  mean_ai     numeric,
  mean_actual numeric,
  mean_bias   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.field,
         count(*)                            as samples,
         round(avg(c.ai_value), 1)           as mean_ai,
         round(avg(c.user_value), 1)         as mean_actual,
         round(avg(c.ai_value - c.user_value), 1) as mean_bias
  from public.corrections c
  where c.user_id = auth.uid()
    and c.ai_value is not null
    and c.user_value is not null
  group by c.field;
$$;
