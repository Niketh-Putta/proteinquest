import type { DragonProgress, Profile } from './types';

/** Shift a local YYYY-MM-DD by N days without UTC drift. */
export function shiftISODate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayBeforeISO(iso: string): string {
  return shiftISODate(iso, -1);
}

/**
 * Goal streak lives on the account (same as Progress calendar hits).
 * Take the richest of top-level + any dragon so a daily-dragon switch cannot
 * zero a real streak (switch used to copy empty dragon streak onto profile).
 */
export function accountGoalStreakState(
  profile: Profile,
  fallback?: DragonProgress,
): Pick<DragonProgress, 'streak' | 'best_streak' | 'last_goal_date'> {
  const dragons = Object.values(profile.dragon_progress ?? {});
  let bestFromDragons = fallback?.best_streak ?? 0;
  let streakFromDragons = fallback?.streak ?? 0;
  let lastFromDragons = fallback?.last_goal_date ?? null;
  for (const d of dragons) {
    if (!d) continue;
    if ((d.best_streak ?? 0) > bestFromDragons) bestFromDragons = d.best_streak ?? 0;
    if ((d.streak ?? 0) > streakFromDragons) {
      streakFromDragons = d.streak ?? 0;
      lastFromDragons = d.last_goal_date ?? lastFromDragons;
    } else if (
      (d.streak ?? 0) === streakFromDragons &&
      d.last_goal_date &&
      (!lastFromDragons || d.last_goal_date > lastFromDragons)
    ) {
      lastFromDragons = d.last_goal_date;
    }
  }
  const streak = Math.max(profile.streak ?? 0, streakFromDragons);
  const best_streak = Math.max(profile.best_streak ?? 0, bestFromDragons, streak);
  const last_goal_date =
    [profile.last_goal_date, lastFromDragons]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;
  return { streak, best_streak, last_goal_date };
}

export function effectiveStreak(
  progress: DragonProgress,
  todayISO: string,
  yesterdayISO: string,
  opts?: { freezeKeepsAlive?: boolean },
): number {
  if (!progress.last_goal_date) return 0;
  if (progress.last_goal_date === todayISO || progress.last_goal_date === yesterdayISO) {
    return progress.streak ?? 0;
  }
  // Pro streak freeze: still show streak if last goal was the day before yesterday.
  if (opts?.freezeKeepsAlive && progress.last_goal_date === dayBeforeISO(yesterdayISO)) {
    return progress.streak ?? 0;
  }
  return 0;
}

/**
 * Consecutive protein-goal-hit days from daily totals (same source as Progress calendar).
 * Prefers an open streak ending today, else yesterday; optional Pro freeze covers one miss.
 */
export function goalHitStreakDays(
  totals: Record<string, number>,
  goalG: number,
  todayISO: string,
  yesterdayISO: string,
  opts?: { freezeKeepsAlive?: boolean },
): number {
  if (!(goalG > 0)) return 0;
  const hit = (iso: string) => (totals[iso] ?? 0) >= goalG;
  const dayBeforeYesterday = dayBeforeISO(yesterdayISO);

  let cursor: string | null = null;
  if (hit(todayISO)) cursor = todayISO;
  else if (hit(yesterdayISO)) cursor = yesterdayISO;
  else if (opts?.freezeKeepsAlive && hit(dayBeforeYesterday)) cursor = dayBeforeYesterday;
  else return 0;

  let streak = 0;
  let freezeAvailable = Boolean(opts?.freezeKeepsAlive);
  let guard = 0;
  while (cursor && guard < 60) {
    if (hit(cursor)) {
      streak += 1;
      cursor = dayBeforeISO(cursor);
      guard += 1;
      continue;
    }
    if (freezeAvailable && streak > 0) {
      freezeAvailable = false;
      cursor = dayBeforeISO(cursor);
      guard += 1;
      continue;
    }
    break;
  }
  return streak;
}

/** Continue an account streak when today's goal is newly hit. */
export function nextGoalStreak(
  lastGoalDate: string | null,
  streak: number,
  todayISO: string,
  yesterdayISO: string,
  canFreeze: boolean,
): { streak: number; streakFreezeUsed: boolean } {
  const dayBeforeYesterday = dayBeforeISO(yesterdayISO);
  if (lastGoalDate === yesterdayISO) {
    return { streak: streak + 1, streakFreezeUsed: false };
  }
  if (lastGoalDate === dayBeforeYesterday && canFreeze) {
    return { streak: streak + 1, streakFreezeUsed: true };
  }
  return { streak: 1, streakFreezeUsed: false };
}
