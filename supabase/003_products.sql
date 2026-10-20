-- OPTML — migration 003: user-contributed product database
--
-- Open Food Facts has ~25k Indian products against millions of European ones,
-- so scanning Indian packaging 404s almost every time. No affordable API
-- fixes that: the Indian leaders built their databases by accumulating user
-- contributions over years, not by licensing one.
--
-- So a miss becomes a contribution. The user types the label once, and from
-- then on that barcode resolves instantly for everyone.
--
-- Rows here are deliberately readable by every signed-in user, not just their
-- author. A per-user table would make each person re-enter the same Britannia
-- packet, which is exactly the thing that makes this worthless.
--
-- Run after 002. Safe to re-run.

create table if not exists public.products (
  barcode        text primary key,
  name           text not null,
  brand          text,

  -- Always per 100g (or 100ml). Portions are scaled from this, the same way
  -- Open Food Facts records work, so one code path handles both sources.
  calories_100g  numeric not null,
  protein_100g   numeric not null default 0,
  carbs_100g     numeric not null default 0,
  fat_100g       numeric not null default 0,

  -- The label's own serving, when it states one.
  serving_grams  numeric,
  serving_label  text,

  -- Where the record came from, so the UI can be honest about how much to
  -- trust it and so contributed rows can later be pushed upstream.
  source         text not null default 'user'
    check (source in ('user', 'off', 'fatsecret')),

  -- How many people have confirmed these numbers by scanning and saving
  -- without editing. Lets the UI distinguish "one person typed this" from
  -- "forty people agree", without needing moderators on day one.
  confirmations  int not null default 0,

  created_by     uuid references auth.users on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists products_name_idx on public.products (lower(name));

alter table public.products enable row level security;

grant all on public.products to authenticated;

-- Everyone signed in can read every product: that shared pool is the point.
drop policy if exists "read all products" on public.products;
create policy "read all products" on public.products
  for select using (auth.uid() is not null);

drop policy if exists "add products" on public.products;
create policy "add products" on public.products
  for insert with check (auth.uid() = created_by);

-- Only the author may rewrite a record. Without this, one careless user could
-- overwrite a barcode's nutrition for everybody.
drop policy if exists "edit own products" on public.products;
create policy "edit own products" on public.products
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Saving a scanned product without editing it is a quiet vote that the
-- numbers are right. Counting those is far cheaper than moderation.
-- ---------------------------------------------------------------------------
-- security definer on purpose. The update policy limits writes to a product's
-- author, which is right for its nutrition but wrong for this counter: a
-- confirmation is worth nothing if only the person who typed the numbers can
-- register one. The function can increment that single column and nothing
-- else, so bypassing RLS here grants no other power.
create or replace function public.confirm_product(p_barcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.products
     set confirmations = confirmations + 1
   where barcode = p_barcode;
end;
$$;
