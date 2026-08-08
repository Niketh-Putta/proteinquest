import type { DragonId } from './types';

type PendingDailyLock = {
  dateISO: string;
  dragonId: DragonId;
};

let pending: PendingDailyLock | null = null;
let epoch = 0;
const listeners = new Set<() => void>();

function normalizeDate(value: string): string {
  const s = String(value).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function bump() {
  epoch += 1;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore subscriber errors */
    }
  });
}

/** React `useSyncExternalStore` subscribe. */
export function subscribeDailyDragonLock(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getDailyDragonLockEpoch(): number {
  return epoch;
}

/** Call the instant the user confirms a daily dragon (before any await). */
export function markDailyDragonLocked(dragonId: DragonId, dateISO: string): void {
  pending = { dragonId, dateISO: normalizeDate(dateISO) };
  bump();
}

export function getPendingDailyDragonLock(todayISO: string): PendingDailyLock | null {
  if (!pending) return null;
  if (pending.dateISO !== normalizeDate(todayISO)) {
    pending = null;
    return null;
  }
  return pending;
}

export function hasPendingDailyDragonLock(todayISO: string): boolean {
  return getPendingDailyDragonLock(todayISO) != null;
}

/** Stamp pending lock onto a profile so UI + cache never lose today's pick. */
export function applyPendingDailyDragonLock<T extends {
  daily_dragon_id?: DragonId | null;
  daily_dragon_date?: string | null;
  active_dragon_id?: DragonId | null;
}>(profile: T, todayISO: string): T {
  const p = getPendingDailyDragonLock(todayISO);
  if (!p) return profile;
  return {
    ...profile,
    daily_dragon_id: p.dragonId,
    daily_dragon_date: p.dateISO,
    active_dragon_id: profile.active_dragon_id ?? p.dragonId,
  };
}
