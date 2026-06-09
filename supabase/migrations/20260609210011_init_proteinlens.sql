-- ProteinLens initial schema

-- User profile + protein goal settings
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  age int check (age between 10 and 120),
  weight_kg numeric(5, 1) check (weight_kg between 25 and 350),
  sex text check (sex in ('male', 'female')),
  activity_level text check (
    activity_level in ('sedentary', 'light', 'moderate', 'active', 'athlete')
  ),
  goal_type text check (goal_type in ('maintain', 'build_muscle', 'lose_fat')),
  protein_goal_g int check (protein_goal_g between 20 and 400),
  onboarded boolean not null default false
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- One row per logged meal / snap
create table public.protein_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  logged_date date not null default current_date,
  food_name text not null,
  items jsonb not null default '[]'::jsonb,
  protein_g numeric(6, 1) not null check (protein_g >= 0),
  calories int,
  confidence text check (confidence in ('low', 'medium', 'high')),
  image_path text,
  source text not null default 'photo' check (source in ('photo', 'manual'))
);

create index protein_logs_user_date_idx
  on public.protein_logs (user_id, logged_date desc, created_at desc);

alter table public.protein_logs enable row level security;

create policy "Users can view own logs"
  on public.protein_logs for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert own logs"
  on public.protein_logs for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update own logs"
  on public.protein_logs for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own logs"
  on public.protein_logs for delete
  using ((select auth.uid()) = user_id);

-- Keep profiles.updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Private bucket for food photos, scoped per user folder
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', false);

create policy "Users can upload own food photos"
  on storage.objects for insert
  with check (
    bucket_id = 'food-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can view own food photos"
  on storage.objects for select
  using (
    bucket_id = 'food-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own food photos"
  on storage.objects for delete
  using (
    bucket_id = 'food-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
