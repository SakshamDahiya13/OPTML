-- OPTML — initial schema
-- Paste the whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: every statement is guarded.

-- ---------------------------------------------------------------------------
-- profiles
-- One row per user, created automatically on signup by the trigger below.
-- Goals live here so they can be edited in Settings and read anywhere.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users on delete cascade,
  display_name     text,
  sex              text check (sex in ('male', 'female', 'other')),
  birth_year       int,
  height_cm        numeric,
  weight_kg        numeric,
  goal_calories    int     not null default 2400,
  goal_protein_g   int     not null default 160,
  goal_carbs_g     int     not null default 260,
  goal_fat_g       int     not null default 70,
  -- Exact tracking (USDA lookup) instead of AI estimates.
  bodybuilder_mode boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- meals
-- `raw_text` keeps exactly what the user typed, so a logged meal can be
-- re-parsed later when the prompt or the model improves.
-- Totals are stored denormalised: the food log and analytics read them
-- directly without having to roll up meal_items on every query.
-- ---------------------------------------------------------------------------
create table if not exists public.meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  eaten_at   timestamptz not null default now(),
  label      text not null default 'Meal',
  raw_text   text,
  source     text not null default 'manual' check (source in ('manual', 'chat')),
  calories   numeric not null default 0,
  protein_g  numeric not null default 0,
  carbs_g    numeric not null default 0,
  fat_g      numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists meals_user_eaten_idx
  on public.meals (user_id, eaten_at desc);

-- ---------------------------------------------------------------------------
-- meal_items
-- The individual foods inside a meal. `fdc_id` and `micros` stay null until
-- bodybuilder mode matches the item against USDA FoodData Central.
-- ---------------------------------------------------------------------------
create table if not exists public.meal_items (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null references public.meals on delete cascade,
  name       text not null,
  qty        numeric,
  unit       text,
  calories   numeric not null default 0,
  protein_g  numeric not null default 0,
  carbs_g    numeric not null default 0,
  fat_g      numeric not null default 0,
  fdc_id     text,
  micros     jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meal_items_meal_idx on public.meal_items (meal_id);

-- ---------------------------------------------------------------------------
-- workouts / exercise_sets
-- ---------------------------------------------------------------------------
create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  started_at   timestamptz not null default now(),
  name         text not null default 'Workout',
  raw_text     text,
  source       text not null default 'manual' check (source in ('manual', 'chat')),
  duration_min int,
  calories     numeric,
  created_at   timestamptz not null default now()
);

create index if not exists workouts_user_started_idx
  on public.workouts (user_id, started_at desc);

create table if not exists public.exercise_sets (
  id         uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts on delete cascade,
  exercise   text not null,
  set_no     int  not null default 1,
  reps       int,
  weight_kg  numeric,
  done       boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists exercise_sets_workout_idx
  on public.exercise_sets (workout_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- Without this every signed-in user can read every other user's food log.
-- Child tables are checked through their parent's user_id.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.meals         enable row level security;
alter table public.meal_items    enable row level security;
alter table public.workouts      enable row level security;
alter table public.exercise_sets enable row level security;

-- Supabase normally grants these by default; stated explicitly so the file
-- stands on its own and can't half-apply on a project with altered defaults.
grant usage on schema public to anon, authenticated;
grant all on public.profiles, public.meals, public.meal_items,
             public.workouts, public.exercise_sets to authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own meals" on public.meals;
create policy "own meals" on public.meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own meal items" on public.meal_items;
create policy "own meal items" on public.meal_items
  for all using (
    exists (select 1 from public.meals m
            where m.id = meal_items.meal_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.meals m
            where m.id = meal_items.meal_id and m.user_id = auth.uid())
  );

drop policy if exists "own workouts" on public.workouts;
create policy "own workouts" on public.workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own exercise sets" on public.exercise_sets;
create policy "own exercise sets" on public.exercise_sets
  for all using (
    exists (select 1 from public.workouts w
            where w.id = exercise_sets.workout_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workouts w
            where w.id = exercise_sets.workout_id and w.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Give every new signup a profile row, so the app never has to handle a
-- missing one. security definer because the trigger runs before the user
-- has any privileges of their own.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill: anyone who signed up before this ran has no profile row yet.
-- ---------------------------------------------------------------------------
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
