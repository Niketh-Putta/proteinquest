-- dragon_progress JSON entries may now include an optional "level" field (derived from xp).
-- No column change required — level is computed client-side from XP when absent.
comment on column public.profiles.dragon_progress is
  'Per-dragon stats: { xp, level?, streak, best_streak, goals_hit, last_goal_date }. Level unlocks visual evolution forms at 1,3,5,8,12,16,20,25,30,40.';
