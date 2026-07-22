import type { Profile, RetentionState } from './types';

export type { RetentionState };

/** Accounts created before hard paywall keep 1 free scan/day after trial. */
export const GRANDFATHER_CUTOFF_ISO = '2026-07-21T00:00:00.000Z';
export const GRANDFATHER_MIN_MEALS = 3;
export const GRANDFATHER_FREE_DAILY_SCANS = 1;

export const LOOT_DROP_CHANCE = 0.15;
export const LOOT_PITY_EVERY = 7;

export function getRetention(profile: Profile | null | undefined): RetentionState {
  const raw = profile?.retention;
  if (!raw || typeof raw !== 'object') return {};
  return raw;
}

export function isGrandfathered(
  profile: Profile | null | undefined,
  lifetimeMeals = 0,
): boolean {
  if (!profile) return false;
  if (lifetimeMeals >= GRANDFATHER_MIN_MEALS) return true;
  if (!profile.created_at) return false;
  const created = new Date(profile.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return created < Date.parse(GRANDFATHER_CUTOFF_ISO);
}

export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function canUseStreakFreeze(
  profile: Profile | null | undefined,
  now = new Date(),
): boolean {
  if (!profile?.is_premium) return false;
  const week = isoWeekKey(now);
  return getRetention(profile).streak_freeze_week !== week;
}

/** Roll loot after a meal log. Pity every LOOT_PITY_EVERY meals. */
export function rollLootDrop(retention: RetentionState): {
  dropped: boolean;
  next: RetentionState;
  shardDelta: number;
} {
  const since = (retention.loot_meals_since_drop ?? 0) + 1;
  const pity = since >= LOOT_PITY_EVERY;
  const dropped = pity || Math.random() < LOOT_DROP_CHANCE;
  if (!dropped) {
    return {
      dropped: false,
      shardDelta: 0,
      next: { ...retention, loot_meals_since_drop: since },
    };
  }
  const shards = (retention.egg_shards ?? 0) + 1;
  return {
    dropped: true,
    shardDelta: 1,
    next: {
      ...retention,
      loot_meals_since_drop: 0,
      egg_shards: shards,
    },
  };
}

export function markCareDay(retention: RetentionState, todayISO: string): RetentionState {
  const prev = retention.care_days ?? [];
  if (prev.includes(todayISO)) return retention;
  const care_days = [...prev, todayISO].slice(-60);
  return { ...retention, care_days };
}

/** Consecutive care days ending today or yesterday (meal logged that calendar day). */
export function careStreakDays(
  retention: RetentionState,
  todayISO: string,
  yesterdayISO: string,
): number {
  const set = new Set(retention.care_days ?? []);
  let cursor: string | null = set.has(todayISO)
    ? todayISO
    : set.has(yesterdayISO)
      ? yesterdayISO
      : null;
  if (!cursor) return 0;
  let streak = 0;
  let guard = 0;
  while (cursor && set.has(cursor) && guard < 60) {
    streak += 1;
    const prev: Date = new Date(`${cursor}T12:00:00`);
    prev.setDate(prev.getDate() - 1);
    cursor = prev.toISOString().slice(0, 10);
    guard += 1;
  }
  return streak;
}
