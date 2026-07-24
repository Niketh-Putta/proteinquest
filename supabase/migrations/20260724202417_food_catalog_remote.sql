-- Remote food catalogue: add rows in the dashboard to update search
-- without rebuilding the app. Clients merge these with the bundled catalog.

create table public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  portion text not null default '1 serving',
  protein_g numeric(6, 1) not null check (protein_g >= 0),
  calories_g int not null default 0 check (calories_g >= 0),
  estimated_grams numeric(8, 1),
  aliases text[] not null default '{}',
  is_common boolean not null default false,
  active boolean not null default true
);

comment on table public.food_catalog is
  'Remote searchable foods (name, portion/quantifier, macros). Edit in dashboard; app fetches on open.';

comment on column public.food_catalog.portion is
  'Default qty-1 label for the adjust wheel, e.g. 1 scoop, 1 bar, 1 bowl.';

comment on column public.food_catalog.is_common is
  'When true, food appears in the COMMON list (above alphabetical browse).';

create unique index food_catalog_name_lower_uidx
  on public.food_catalog (lower(name));

create index food_catalog_active_common_idx
  on public.food_catalog (active, is_common)
  where active = true;

create trigger food_catalog_set_updated_at
  before update on public.food_catalog
  for each row
  execute function public.set_updated_at();

alter table public.food_catalog enable row level security;

-- Public read: catalogue is not user-specific. Writes via dashboard / service_role only.
create policy "Anyone can read active food catalog"
  on public.food_catalog
  for select
  to anon, authenticated
  using (active = true);

-- Example rows (safe to edit/delete). Portion drives the scroll-wheel unit.
insert into public.food_catalog
  (name, portion, protein_g, calories_g, estimated_grams, aliases, is_common)
values
  (
    'ON Gold Standard Whey Double Rich Chocolate',
    '1 scoop',
    24,
    120,
    30.5,
    array['optimum nutrition double rich chocolate', 'on double rich chocolate'],
    true
  ),
  (
    'MyProtein Impact Whey Salted Caramel Sachet',
    '1 sachet',
    21,
    103,
    25,
    array['mp salted caramel sachet'],
    false
  );
