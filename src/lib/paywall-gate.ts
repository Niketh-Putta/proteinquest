import {
  GRANDFATHER_FREE_DAILY_SCANS,
  isGrandfathered,
} from './retention';
import type { Profile } from './types';

/** Free tier after the habit trial: AI photo scans per calendar day (0 = hard paywall). */
export const FREE_DAILY_SCANS = 0;

/** No paywall and unlimited scans for the first N calendar days after signup. */
export const HABIT_GRACE_DAYS = 2;

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

/** Trends (7-day rhythm view) is free for all users. */
export function canAccessTrends(_profile: Profile | null | undefined): boolean {
  return true;
}

/** Daily free photo-scan quota after trial (grandfathered users keep 1/day). */
export function freeDailyScanQuota(
  profile: Profile | null | undefined,
  lifetimeMeals = 0,
): number {
  if (isGrandfathered(profile, lifetimeMeals)) return GRANDFATHER_FREE_DAILY_SCANS;
  return FREE_DAILY_SCANS;
}

export function canScan(
  profile: Profile | null | undefined,
  scansUsedToday: number,
  lifetimeMeals = 0,
): boolean {
  if (isPro(profile)) return true;
  if (isInHabitGracePeriod(profile)) return true;
  return scansUsedToday < freeDailyScanQuota(profile, lifetimeMeals);
}

/** The quota paywall is allowed only from an explicit tap on the Scan tab. */
export function shouldOpenPaywallFromScanTap(
  profile: Profile | null | undefined,
  scansUsedToday: number,
  lifetimeMeals = 0,
): boolean {
  return !!profile && !canScan(profile, scansUsedToday, lifetimeMeals);
}

/**
 * Soft paywall: after trial, only push hard paywall once the user has felt value (≥2 meals).
 * Zero-meal trial-enders get a softer path (caller may still route to paywall with soft copy).
 */
export function shouldHardPaywall(
  profile: Profile | null | undefined,
  scansUsedToday: number,
  lifetimeMeals: number,
): boolean {
  if (!shouldOpenPaywallFromScanTap(profile, scansUsedToday, lifetimeMeals)) return false;
  return lifetimeMeals >= 2;
}

export function remainingFreeScans(
  scansUsedToday: number,
  profile?: Profile | null,
  lifetimeMeals = 0,
): number {
  if (profile && isInHabitGracePeriod(profile)) return Number.POSITIVE_INFINITY;
  const quota = freeDailyScanQuota(profile, lifetimeMeals);
  if (quota <= 0) return 0;
  return Math.max(quota - scansUsedToday, 0);
}

export function scansLimitLabel(
  scansUsedToday: number,
  profile: Profile | null | undefined,
  lifetimeMeals = 0,
): string {
  if (isPro(profile)) return 'Unlimited scans';
  if (isInHabitGracePeriod(profile)) return 'Unlimited scans, 2-day free trial';
  const left = remainingFreeScans(scansUsedToday, profile, lifetimeMeals);
  if (left === 0) return 'Out of free scans. Go Pro';
  return `${left} free scan${left === 1 ? '' : 's'} left today`;
}

/** True when a message is (or was) a free-tier scan-limit notice — never show as a banner. */
export function isScanLimitMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /daily scan limit|scan limit reached|out of free scans|upgrade to (proteinquest )?pro for unlimited/i.test(
    message,
  );
}
