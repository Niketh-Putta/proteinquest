-- Gamification: XP, streaks, goal-hit tracking for the Whey character,
-- plus weight unit preference for the smarter goal calculator.
alter table public.profiles
  add column xp int not null default 0 check (xp >= 0),
  add column streak int not null default 0 check (streak >= 0),
  add column best_streak int not null default 0 check (best_streak >= 0),
  add column goals_hit int not null default 0 check (goals_hit >= 0),
  add column last_goal_date date,
  add column weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lbs'));
