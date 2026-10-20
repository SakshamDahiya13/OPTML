-- 003 only allowed 'user' | 'off' | 'fatsecret'. USDA bulk import adds a fourth.
alter table public.products drop constraint if exists products_source_check;
alter table public.products add constraint products_source_check
  check (source in ('user', 'off', 'fatsecret', 'usda'));
