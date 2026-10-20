-- OPTML — migration 005: sleep and body metrics
--
-- workouts / exercise_sets already existed from schema.sql but nothing could
-- write to them. This adds the two trackers that were missing entirely, with
-- the same RLS shape as the rest: one row per user, checked by auth.uid().
--
-- Samsung Health keeps sleep and body weight in separate trackers rather than
-- hanging them off the day's food log, and that's right — you weigh yourself
-- on days you don't eat in the app, and sleep spans midnight.
--
-- Run after 004. Safe to re-run.

-- ---------------------------------------------------------------------------
-- sleep_logs
-- ---------------------------------------------------------------------------
-- A night is stored against the DATE YOU WOKE UP, not the date you went to
-- bed. Sleeping 23:30 Monday to 07:00 Tuesday is "Tuesday's sleep" to every
-- app and every user, so the unique key is (user_id, night_of) and one row
-- per morning. Without that, logging the same night twice silently doubles it.
create table if not exists public.sleep_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  night_of    date not null,

  bed_at      timestamptz not null,
  wake_at     timestamptz not null,

  -- Cached so the UI and charts don't recompute it on every render, and so a
  -- user who tracks on a watch can supply real asleep-time (which is less
  -- than time in bed) rather than having it inferred from the two timestamps.
  minutes     int not null check (minutes > 0 and minutes < 24 * 60),

  -- 1-5. Deliberately not a 0-100 "sleep score": we have no sensor data, so
  -- a precise-looking number would be a lie. How you felt is honest.
  quality     int check (quality between 1 and 5),
  note        text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, night_of)
);

create index if not exists sleep_user_night_idx
  on public.sleep_logs (user_id, night_of desc);

-- ---------------------------------------------------------------------------
-- body_metrics
-- ---------------------------------------------------------------------------
-- One row per day, upserted. Weighing twice in a morning should correct the
-- day, not create a second data point that drags the trend line.
create table if not exists public.body_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  measured_on date not null,

  weight_kg   numeric check (weight_kg > 0 and weight_kg < 500),
  body_fat_pct numeric check (body_fat_pct > 0 and body_fat_pct < 100),
  waist_cm    numeric check (waist_cm > 0 and waist_cm < 300),
  note        text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, measured_on)
);

create index if not exists body_user_day_idx
  on public.body_metrics (user_id, measured_on desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sleep_logs   enable row level security;
alter table public.body_metrics enable row level security;

grant all on public.sleep_logs, public.body_metrics to authenticated;

drop policy if exists "own sleep" on public.sleep_logs;
create policy "own sleep" on public.sleep_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own body" on public.body_metrics;
create policy "own body" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists sleep_touch on public.sleep_logs;
create trigger sleep_touch before update on public.sleep_logs
  for each row execute function public.touch_updated_at();

drop trigger if exists body_touch on public.body_metrics;
create trigger body_touch before update on public.body_metrics
  for each row execute function public.touch_updated_at();
