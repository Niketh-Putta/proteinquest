/** Server-side mirror of src/lib/paywall-gate.ts scan limits. */

export const FREE_DAILY_SCANS = 3;
export const HABIT_GRACE_DAYS = 3;

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

export function canScanPhoto(params: {
  isPremium: boolean;
  createdAt: string | null | undefined;
  scansUsedToday: number;
  now?: Date;
}): { allowed: boolean; message?: string } {
  const { isPremium, createdAt, scansUsedToday, now } = params;
  if (isPremium) return { allowed: true };
  if (isInHabitGracePeriod(isPremium, createdAt, now)) return { allowed: true };
  if (scansUsedToday < FREE_DAILY_SCANS) return { allowed: true };
  return {
    allowed: false,
    message: 'Daily scan limit reached. Upgrade to ProteinQuest Pro for unlimited scans.',
  };
}
