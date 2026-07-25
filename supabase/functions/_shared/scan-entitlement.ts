/** Server-side mirror of src/lib/paywall-gate.ts scan limits. */

export const FREE_DAILY_SCANS = 1;
export const HABIT_GRACE_DAYS = 2;
export const GRANDFATHER_CUTOFF_ISO = '2026-07-21T00:00:00.000Z';
export const GRANDFATHER_MIN_MEALS = 3;
export const GRANDFATHER_FREE_DAILY_SCANS = 1;

/** Local calendar YYYY-MM-DD (edge runtime timezone = host TZ, usually UTC). */
export function localISODate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Inclusive end date: active while local today <= promoUnlimitedUntil. */
export function isPromoUnlimitedActive(
  promoUnlimitedUntil: string | null | undefined,
  now = new Date(),
): boolean {
  if (!promoUnlimitedUntil) return false;
  const until = String(promoUnlimitedUntil).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return false;
  return localISODate(now) <= until;
}

function localCalendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function accountAgeCalendarDays(
  createdAt: string | null | undefined,
  now = new Date(),
): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const signupDay = localCalendarDay(created);
  const todayDay = localCalendarDay(now);
  return Math.floor((todayDay.getTime() - signupDay.getTime()) / 86_400_000);
}

export function isInHabitGracePeriod(
  isPremium: boolean,
  createdAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (isPremium) return false;
  const ageDays = accountAgeCalendarDays(createdAt, now);
  if (ageDays === null) return false;
  return ageDays >= 0 && ageDays < HABIT_GRACE_DAYS;
}

export function isGrandfathered(
  createdAt: string | null | undefined,
  lifetimeMeals = 0,
): boolean {
  if (lifetimeMeals >= GRANDFATHER_MIN_MEALS) return true;
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return created < Date.parse(GRANDFATHER_CUTOFF_ISO);
}

export function freeDailyScanQuota(
  createdAt: string | null | undefined,
  lifetimeMeals = 0,
): number {
  if (isGrandfathered(createdAt, lifetimeMeals)) return GRANDFATHER_FREE_DAILY_SCANS;
  return FREE_DAILY_SCANS;
}

export function canScanPhoto(params: {
  isPremium: boolean;
  createdAt: string | null | undefined;
  scansUsedToday: number;
  lifetimeMeals?: number;
  /** Inclusive YYYY-MM-DD from app_paywall_config.promo_unlimited_until */
  promoUnlimitedUntil?: string | null;
  now?: Date;
}): { allowed: boolean; message?: string } {
  const {
    isPremium,
    createdAt,
    scansUsedToday,
    lifetimeMeals = 0,
    promoUnlimitedUntil = null,
    now,
  } = params;
  if (isPremium) return { allowed: true };
  if (isPromoUnlimitedActive(promoUnlimitedUntil, now)) return { allowed: true };
  if (isInHabitGracePeriod(isPremium, createdAt, now)) return { allowed: true };
  const quota = freeDailyScanQuota(createdAt, lifetimeMeals);
  if (scansUsedToday < quota) return { allowed: true };
  return {
    allowed: false,
    message: 'Daily scan limit reached. Upgrade to ProteinQuest Pro for unlimited scans.',
  };
}
