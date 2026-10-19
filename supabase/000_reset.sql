-- OPTML — reset
--
-- ONLY run this if the diagnostic showed leftover/conflicting tables and you
-- are sure there is no data in them you want to keep.
--
-- DESTRUCTIVE: this deletes every row in the tables it names. It does NOT
-- touch auth.users, so your login still works and your account survives.
--
-- After this runs, run schema.sql, then 002_ranges_and_learning.sql.

-- Children first; cascade also removes dependent policies, indexes and
-- constraints, which is what makes a half-applied schema recoverable.
drop table if exists public.corrections    cascade;
drop table if exists public.portion_priors cascade;
drop table if exists public.meal_items     cascade;
drop table if exists public.meals          cascade;
drop table if exists public.exercise_sets  cascade;
drop table if exists public.workouts       cascade;
drop table if exists public.profiles       cascade;

-- The trigger on auth.users has to go before its function.
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user()   cascade;
drop function if exists public.touch_updated_at()  cascade;
drop function if exists public.record_correction(uuid, text, text, numeric, numeric) cascade;
drop function if exists public.accuracy_summary()  cascade;

-- Confirms the public schema is clear of OPTML tables. Expect zero rows.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'meals', 'meal_items', 'workouts',
                     'exercise_sets', 'corrections', 'portion_priors');
