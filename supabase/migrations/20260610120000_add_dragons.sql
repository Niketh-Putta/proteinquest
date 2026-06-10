-- Multi-dragon gamification: per-dragon progress + active selection.
alter table public.profiles
  add column if not exists active_dragon_id text check (active_dragon_id in ('fire', 'ice', 'forest')),
  add column if not exists dragon_progress jsonb not null default '{}'::jsonb;

-- Migrate legacy Whey stats into the fire dragon for existing users.
update public.profiles
set
  active_dragon_id = coalesce(active_dragon_id, 'fire'),
  dragon_progress = case
    when dragon_progress = '{}'::jsonb or dragon_progress is null then
      jsonb_build_object(
        'fire', jsonb_build_object(
          'xp', coalesce(xp, 0),
          'streak', coalesce(streak, 0),
          'best_streak', coalesce(best_streak, 0),
          'goals_hit', coalesce(goals_hit, 0),
          'last_goal_date', last_goal_date
        )
      )
    else dragon_progress
  end
where active_dragon_id is null or dragon_progress = '{}'::jsonb;
