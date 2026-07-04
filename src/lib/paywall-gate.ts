import type { Profile } from './types';
import { totalXp } from './xp';

/** Free tier: AI photo scans per calendar day (UTC date on server). */
export const FREE_DAILY_SCANS = 3;

/** No paywall and unlimited scans for the first N calendar days after signup. */
export const HABIT_GRACE_DAYS = 3;

export function isPro(profile: Profile | null | undefined): boolean {
  return profile?.is_premium === true;
}

function localCalendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar days since signup (0 = signup day), or null if created_at is unknown. */
export function accountAgeCalendarDays(
  profile: Profile | null | undefined,
  now = new Date(),
): number | null {
  if (!profile?.created_at) return null;
  const created = new Date(profile.created_at);
  if (Number.isNaN(created.getTime())) return null;
  const signupDay = localCalendarDay(created);
  const todayDay = localCalendarDay(now);
  return Math.floor((todayDay.getTime() - signupDay.getTime()) / 86_400_000);
}

/** First N calendar days after signup (day 0 = signup day): no paywall, unlimited scans. */
export function isInHabitGracePeriod(
  profile: Profile | null | undefined,
  now = new Date(),
): boolean {
  if (!profile || isPro(profile)) return false;
  const ageDays = accountAgeCalendarDays(profile, now);
  if (ageDays === null) return false;
  return ageDays >= 0 && ageDays < HABIT_GRACE_DAYS;
}

/**
 * Cal AI-style soft gate: show after the user has logged protein once —
 * not on first landing after onboarding. Dismissible via paywall_dismissed.
 */
export function shouldShowDelayedPaywall(profile: Profile | null | undefined): boolean {
  if (!profile?.onboarded) return false;
  if (isPro(profile)) return false;
  if (isInHabitGracePeriod(profile)) return false;
  if (profile.paywall_dismissed) return false;
  return totalXp(profile) > 0;
}

/** Trends (7-day rhythm view) is free for all users. */
export function canAccessTrends(_profile: Profile | null | undefined): boolean {
  return true;
}

export function canScan(profile: Profile | null | undefined, scansUsedToday: number): boolean {
  if (isPro(profile)) return true;
  if (isInHabitGracePeriod(profile)) return true;
  return scansUsedToday < FREE_DAILY_SCANS;
}

export function remainingFreeScans(
  scansUsedToday: number,
  profile?: Profile | null,
): number {
  if (profile && isInHabitGracePeriod(profile)) return FREE_DAILY_SCANS;
  return Math.max(FREE_DAILY_SCANS - scansUsedToday, 0);
}

export function scansLimitLabel(scansUsedToday: number, profile: Profile | null | undefined): string {
  if (isPro(profile)) return 'Unlimited scans';
  if (isInHabitGracePeriod(profile)) return 'Unlimited scans, 3-day free trial';
  const left = remainingFreeScans(scansUsedToday, profile);
  if (left === 0) return 'Out of free scans. Go Pro';
  return `${left} free scan${left === 1 ? '' : 's'} left today`;
}
