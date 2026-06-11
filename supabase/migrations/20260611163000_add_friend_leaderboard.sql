-- Friend invites and real friend-scoped leaderboards.

alter table public.profiles
  add column if not exists display_name text check (char_length(display_name) <= 32),
  add column if not exists invite_code text;

update public.profiles
set invite_code = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
where invite_code is null;

alter table public.profiles
  alter column invite_code set default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  alter column invite_code set not null;

create unique index if not exists profiles_invite_code_key
  on public.profiles (invite_code);

create table if not exists public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_friend_id_idx
  on public.friendships (friend_id);

alter table public.friendships enable row level security;

drop policy if exists "Users can view own friend rows" on public.friendships;
create policy "Users can view own friend rows"
  on public.friendships for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can remove own friends" on public.friendships;
create policy "Users can remove own friends"
  on public.friendships for delete
  using ((select auth.uid()) = user_id);

-- Accepts a friend invite code for the current authenticated/anonymous user.
-- Inserts reciprocal rows so both users see one another on the league board.
create or replace function public.accept_friend_invite(invite text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  invited_user public.profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select *
    into invited_user
    from public.profiles
   where invite_code = lower(trim(invite))
   limit 1;

  if invited_user.id is null then
    raise exception 'invite not found';
  end if;

  if invited_user.id = current_user_id then
    return jsonb_build_object('status', 'self');
  end if;

  insert into public.friendships (user_id, friend_id)
  values (current_user_id, invited_user.id)
  on conflict do nothing;

  insert into public.friendships (user_id, friend_id)
  values (invited_user.id, current_user_id)
  on conflict do nothing;

  return jsonb_build_object(
    'status', 'accepted',
    'friend_id', invited_user.id,
    'display_name', coalesce(invited_user.display_name, 'ProteinQuest player')
  );
end;
$$;

-- Returns only the current user and accepted friends, with summary fields needed
-- by the client leaderboard. This avoids broad profile SELECT access.
create or replace function public.friend_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  invite_code text,
  xp integer,
  dragon_progress jsonb,
  active_dragon_id text,
  daily_dragon_id text,
  daily_dragon_date date
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id as user_id,
    coalesce(p.display_name, case when p.id = auth.uid() then 'You' else 'ProteinQuest player' end) as display_name,
    case when p.id = auth.uid() then p.invite_code else null end as invite_code,
    p.xp,
    p.dragon_progress,
    p.active_dragon_id,
    p.daily_dragon_id,
    p.daily_dragon_date
  from public.profiles p
  where p.id = auth.uid()
     or exists (
       select 1
         from public.friendships f
        where f.user_id = auth.uid()
          and f.friend_id = p.id
     )
  order by p.xp desc, p.created_at asc;
$$;

grant execute on function public.accept_friend_invite(text) to authenticated, anon;
grant execute on function public.friend_leaderboard() to authenticated, anon;
