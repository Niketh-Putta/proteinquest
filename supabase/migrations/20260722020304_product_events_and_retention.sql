-- Product analytics + retention (duels, profile retention blob)

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_name_created_idx
  on public.product_events (event_name, created_at desc);

create index if not exists product_events_user_created_idx
  on public.product_events (user_id, created_at desc);

alter table public.product_events enable row level security;

create policy "Users insert own product events"
  on public.product_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users read own product events"
  on public.product_events
  for select
  to authenticated
  using (auth.uid() = user_id);

alter table public.profiles
  add column if not exists retention jsonb not null default '{}'::jsonb;

create table if not exists public.protein_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null default current_date,
  end_date date not null,
  challenger_protein numeric not null default 0,
  opponent_protein numeric not null default 0,
  status text not null default 'active'
    check (status in ('active', 'completed', 'declined')),
  created_at timestamptz not null default now(),
  constraint protein_duels_distinct_players check (challenger_id <> opponent_id)
);

create index if not exists protein_duels_players_idx
  on public.protein_duels (challenger_id, opponent_id, status);

alter table public.protein_duels enable row level security;

create policy "Duel players can read"
  on public.protein_duels
  for select
  to authenticated
  using (auth.uid() = challenger_id or auth.uid() = opponent_id);

create policy "Authenticated can create duels as challenger"
  on public.protein_duels
  for insert
  to authenticated
  with check (auth.uid() = challenger_id);

create policy "Duel players can update"
  on public.protein_duels
  for update
  to authenticated
  using (auth.uid() = challenger_id or auth.uid() = opponent_id)
  with check (auth.uid() = challenger_id or auth.uid() = opponent_id);

-- Sum both players' protein without exposing raw logs cross-user.
create or replace function public.refresh_protein_duel(p_duel_id uuid)
returns public.protein_duels
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.protein_duels;
  c_sum numeric;
  o_sum numeric;
  today date := current_date;
begin
  select * into d from public.protein_duels where id = p_duel_id;
  if not found then
    raise exception 'duel not found';
  end if;
  if auth.uid() is distinct from d.challenger_id and auth.uid() is distinct from d.opponent_id then
    raise exception 'not a duel player';
  end if;

  select coalesce(sum(protein_g), 0) into c_sum
  from public.protein_logs
  where user_id = d.challenger_id
    and source in ('photo', 'manual')
    and logged_date between d.start_date and d.end_date;

  select coalesce(sum(protein_g), 0) into o_sum
  from public.protein_logs
  where user_id = d.opponent_id
    and source in ('photo', 'manual')
    and logged_date between d.start_date and d.end_date;

  update public.protein_duels
  set
    challenger_protein = c_sum,
    opponent_protein = o_sum,
    status = case when today > d.end_date then 'completed' else status end
  where id = p_duel_id
  returning * into d;

  return d;
end;
$$;

revoke all on function public.refresh_protein_duel(uuid) from public;
grant execute on function public.refresh_protein_duel(uuid) to authenticated;
