-- Show seeded leaderboard players again (casual names for social proof).
-- Real users still require a protein_log; seeds are allowed via leaderboard_seed flag.

drop function if exists public.global_leaderboard();

create function public.global_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  xp integer,
  dragon_progress jsonb,
  active_dragon_id text,
  daily_dragon_id text,
  daily_dragon_date date,
  is_friend boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with scored as (
    select
      p.id as user_id,
      coalesce(
        nullif(trim(p.display_name), ''),
        case when p.id = auth.uid() then 'You' else 'ProteinQuest player' end
      ) as display_name,
      p.avatar_url,
      p.dragon_progress,
      p.active_dragon_id,
      p.daily_dragon_id,
      p.daily_dragon_date,
      coalesce(
        (
          select sum(greatest(0, coalesce((value->>'xp')::int, 0)))
          from jsonb_each(coalesce(p.dragon_progress, '{}'::jsonb))
        ),
        0
      )::int as dragon_xp,
      greatest(0, coalesce(p.xp, 0)) as legacy_xp,
      exists (
        select 1
          from public.friendships f
         where f.user_id = auth.uid()
           and f.friend_id = p.id
      ) as is_friend
    from public.profiles p
    inner join auth.users u on u.id = p.id
    where coalesce(u.raw_app_meta_data->>'demo_account', 'false') <> 'true'
      and lower(trim(coalesce(p.display_name, ''))) not in ('john doe', 'test user', 'demo')
      and (
        p.id = auth.uid()
        or nullif(trim(coalesce(p.display_name, '')), '') is not null
      )
      and (
        p.id = auth.uid()
        or coalesce(u.raw_app_meta_data->>'leaderboard_seed', 'false') = 'true'
        or exists (
          select 1 from public.protein_logs pl where pl.user_id = p.id
        )
      )
  )
  select
    user_id,
    display_name,
    avatar_url,
    case
      when dragon_xp > 0 then dragon_xp
      else legacy_xp
    end as xp,
    dragon_progress,
    active_dragon_id,
    daily_dragon_id,
    daily_dragon_date,
    is_friend
  from scored
  order by
    case when dragon_xp > 0 then dragon_xp else legacy_xp end desc,
    user_id asc;
$$;

grant execute on function public.global_leaderboard() to authenticated, anon;
