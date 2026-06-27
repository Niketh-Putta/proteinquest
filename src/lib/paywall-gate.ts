import type { Profile } from './types';
import { totalXp } from './xp';

/** Free tier: AI photo scans per calendar day (local timezone). */
export const FREE_DAILY_SCANS = 3;

/** No paywall and unlimited scans for the first N calendar days after signup. */
export const HABIT_GRACE_DAYS = 2;

export function isPro(profile: Profile | null | undefined): boolean {
  return profile?.is_premium === true;
}

function localCalendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** DST-safe calendar-day diff (local dates, UTC epoch math on Y-M-D only). */
export function calendarDaysBetween(from: Date, to: Date): number {
  const fromDay = localCalendarDay(from);
  const toDay = localCalendarDay(to);
  const fromUtc = Date.UTC(fromDay.getFullYear(), fromDay.getMonth(), fromDay.getDate());
  const toUtc = Date.UTC(toDay.getFullYear(), toDay.getMonth(), toDay.getDate());
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Resolve signup time for grace: profile.created_at first, then Supabase auth user created_at.
 */
export function resolveProfileCreatedAt(
  profile: Profile | null | undefined,
  authUserCreatedAt?: string | null,
): Date | null {
  const fromProfile = parseTimestamp(profile?.created_at ?? null);
  if (fromProfile) return fromProfile;
  return parseTimestamp(authUserCreatedAt ?? null);
}

/** Fill missing profile.created_at from auth user when the DB row predates the column. */
export function enrichProfileSignupAt(
  profile: Profile,
  authUserCreatedAt?: string | null,
): Profile {
  if (parseTimestamp(profile.created_at)) return profile;
  const authAt = authUserCreatedAt ?? null;
  if (parseTimestamp(authAt)) {
    return { ...profile, created_at: authAt };
  }
  return profile;
}

/** Calendar days since signup (0 = signup day), or null if signup time is unknown. */
export function accountAgeCalendarDays(
  profile: Profile | null | undefined,
  now = new Date(),
  authUserCreatedAt?: string | null,
): number | null {
  const signupAt = resolveProfileCreatedAt(profile, authUserCreatedAt);
  if (!signupAt) return null;
  return calendarDaysBetween(signupAt, now);
}

/** Signup day + next calendar day: no paywall, unlimited scans. */
export function isInHabitGracePeriod(
  profile: Profile | null | undefined,
  now = new Date(),
  authUserCreatedAt?: string | null,
): boolean {
  if (!profile || isPro(profile)) return false;
  const ageDays = accountAgeCalendarDays(profile, now, authUserCreatedAt);
  if (ageDays === null) return false;
  return ageDays >= 0 && ageDays < HABIT_GRACE_DAYS;
}

/**
 * Cal AI-style soft gate: show after the user has logged protein once —
 * not on first landing after onboarding. Dismissible via paywall_dismissed.
 */
export function shouldShowDelayedPaywall(
  profile: Profile | null | undefined,
  authUserCreatedAt?: string | null,
): boolean {
  if (!profile?.onboarded) return false;
  if (isPro(profile)) return false;
  if (isInHabitGracePeriod(profile, new Date(), authUserCreatedAt)) return false;
  if (profile.paywall_dismissed) return false;
  return totalXp(profile) > 0;
}

/** Trends (7-day rhythm view) is free for all users. */
export function canAccessTrends(_profile: Profile | null | undefined): boolean {
  return true;
}

export function canScan(
  profile: Profile | null | undefined,
  scansUsedToday: number,
  authUserCreatedAt?: string | null,
): boolean {
  if (isPro(profile)) return true;
  if (isInHabitGracePeriod(profile, new Date(), authUserCreatedAt)) return true;
  return scansUsedToday < FREE_DAILY_SCANS;
}

export function remainingFreeScans(
  scansUsedToday: number,
  profile?: Profile | null,
  authUserCreatedAt?: string | null,
): number {
  if (profile && isInHabitGracePeriod(profile, new Date(), authUserCreatedAt)) {
    return FREE_DAILY_SCANS;
  }
  return Math.max(FREE_DAILY_SCANS - scansUsedToday, 0);
}

/** Human-readable grace status for Today / Settings. Null when not in grace. */
export function gracePeriodLabel(
  profile: Profile | null | undefined,
  now = new Date(),
  authUserCreatedAt?: string | null,
): string | null {
  if (!isInHabitGracePeriod(profile, now, authUserCreatedAt)) return null;
  const ageDays = accountAgeCalendarDays(profile, now, authUserCreatedAt);
  if (ageDays === null) return null;
  const dayNumber = ageDays + 1;
  return `Unlimited scans · day ${dayNumber} of ${HABIT_GRACE_DAYS}`;
}

/** Settings upgrade subtitle — reflects grace vs post-grace free tier. */
export function upgradeHint(
  profile: Profile | null | undefined,
  now = new Date(),
  authUserCreatedAt?: string | null,
): string {
  if (isInHabitGracePeriod(profile, now, authUserCreatedAt)) {
    return 'Unlimited scans during your free trial — upgrade anytime';
  }
  return 'Unlimited AI scans — pick a plan and pay in-app';
}

export function scansLimitLabel(
  scansUsedToday: number,
  profile: Profile | null | undefined,
  authUserCreatedAt?: string | null,
): string {
  if (isPro(profile)) return 'Unlimited scans';
  if (isInHabitGracePeriod(profile, new Date(), authUserCreatedAt)) {
    return 'Unlimited scans — first 2 days free';
  }
  const left = remainingFreeScans(scansUsedToday, profile, authUserCreatedAt);
  if (left === 0) return 'Out of free scans — go Pro';
  return `${left} free scan${left === 1 ? '' : 's'} left today`;
}
