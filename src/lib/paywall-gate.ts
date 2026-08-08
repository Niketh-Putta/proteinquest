import {
  getPaywallConfig,
  isPromoUnlimitedActive,
} from './paywall-config';
import { isGrandfathered } from './retention';
import type { Profile } from './types';

/** Bundled fallbacks (remote `app_paywall_config` overrides at runtime). */
export const FREE_DAILY_SCANS = 1;
export const HABIT_GRACE_DAYS = 1;

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

function habitGraceDays(): number {
  return getPaywallConfig().habitGraceDays;
}

/** First N calendar days after signup: no paywall, unlimited scans. */
export function isInHabitGracePeriod(
  profile: Profile | null | undefined,
  now = new Date(),
): boolean {
  if (!profile || isPro(profile)) return false;
  const ageDays = accountAgeCalendarDays(profile, now);
  if (ageDays === null) return false;
  return ageDays >= 0 && ageDays < habitGraceDays();
}

/** Pro, trial, or remote promo unlimited day. */
export function hasUnlimitedScans(profile: Profile | null | undefined): boolean {
  if (isPro(profile)) return true;
  if (isPromoUnlimitedActive()) return true;
  if (isInHabitGracePeriod(profile)) return true;
  return false;
}

/** Trends (7-day rhythm view) is free for all users. */
export function canAccessTrends(_profile: Profile | null | undefined): boolean {
  return true;
}

/** Daily free photo-scan quota after trial. */
export function freeDailyScanQuota(
  profile: Profile | null | undefined,
  lifetimeMeals = 0,
): number {
  const cfg = getPaywallConfig();
  if (isGrandfathered(profile, lifetimeMeals)) return cfg.grandfatherFreeDailyScans;
  return cfg.freeDailyScans;
}

export function canScan(
  profile: Profile | null | undefined,
  scansUsedToday: number,
  lifetimeMeals = 0,
): boolean {
  if (hasUnlimitedScans(profile)) return true;
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
  if (hasUnlimitedScans(profile ?? null)) return Number.POSITIVE_INFINITY;
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
  if (isPromoUnlimitedActive()) return 'Unlimited scans · promo day';
  if (isInHabitGracePeriod(profile)) {
    const days = habitGraceDays();
    return `Unlimited meals · ${days}-day free access`;
  }
  const left = remainingFreeScans(scansUsedToday, profile, lifetimeMeals);
  if (left === 0) return 'Out of free meals. Go Pro';
  return `${left} free meal${left === 1 ? '' : 's'} left today`;
}

/** True when a message is (or was) a free-tier scan-limit notice — never show as a banner. */
export function isScanLimitMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /daily scan limit|scan limit reached|out of free (scans|meals)|upgrade to (proteinquest )?pro for unlimited/i.test(
    message,
  );
}
