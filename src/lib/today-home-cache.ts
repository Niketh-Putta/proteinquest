import type { ProteinLog } from './types';

/** Soft TTL: reuse meta (totals / lifetime / hunger) across quick tab switches. */
export const TODAY_HOME_META_TTL_MS = 45_000;

export type TodayHomeMeta = {
  lastMealAt: string | null;
  lifetimeMeals: number;
  dayTotals: Record<string, number>;
  scansUsed: number | null;
};

type TodayHomeCache = {
  userId: string;
  metaAt: number;
  meta: TodayHomeMeta;
  logsByDate: Map<string, ProteinLog[]>;
};

let cache: TodayHomeCache | null = null;

export function peekTodayHomeMeta(userId: string | undefined): TodayHomeMeta | null {
  if (!userId || !cache || cache.userId !== userId) return null;
  if (Date.now() - cache.metaAt >= TODAY_HOME_META_TTL_MS) return null;
  return cache.meta;
}

export function peekTodayHomeLogs(
  userId: string | undefined,
  date: string,
): ProteinLog[] | null {
  if (!userId || !cache || cache.userId !== userId) return null;
  const hit = cache.logsByDate.get(date);
  return hit ? hit.slice() : null;
}

export function writeTodayHomeMeta(userId: string, meta: TodayHomeMeta): void {
  if (!cache || cache.userId !== userId) {
    cache = { userId, metaAt: Date.now(), meta, logsByDate: new Map() };
    return;
  }
  cache.meta = meta;
  cache.metaAt = Date.now();
}

export function writeTodayHomeLogs(userId: string, date: string, logs: ProteinLog[]): void {
  if (!cache || cache.userId !== userId) {
    cache = {
      userId,
      metaAt: 0,
      meta: { lastMealAt: null, lifetimeMeals: 0, dayTotals: {}, scansUsed: null },
      logsByDate: new Map([[date, logs.slice()]]),
    };
    return;
  }
  cache.logsByDate.set(date, logs.slice());
}

/** Bust after pull-to-refresh, delete, or post-scan feed so Today never stays stale. */
export function invalidateTodayHomeCache(userId?: string): void {
  if (!userId || !cache || cache.userId === userId) cache = null;
}
