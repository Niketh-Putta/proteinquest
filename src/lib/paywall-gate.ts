import type { Profile } from './types';
import { totalXp } from './xp';

/** Free tier: AI photo scans per calendar day (UTC date on server). */
export const FREE_DAILY_SCANS = 3;

export function isPro(profile: Profile | null | undefined): boolean {
  return profile?.is_premium === true;
}

/**
 * Cal AI-style soft gate: show after the user has logged protein once —
 * not on first landing after onboarding. Dismissible via paywall_dismissed.
 */
export function shouldShowDelayedPaywall(profile: Profile | null | undefined): boolean {
  if (!profile?.onboarded) return false;
  if (isPro(profile)) return false;
  if (profile.paywall_dismissed) return false;
  return totalXp(profile) > 0;
}

/** Trends (7-day rhythm view) is free for all users. */
export function canAccessTrends(_profile: Profile | null | undefined): boolean {
  return true;
}

export function canScan(profile: Profile | null | undefined, scansUsedToday: number): boolean {
  if (isPro(profile)) return true;
  return scansUsedToday < FREE_DAILY_SCANS;
}

export function remainingFreeScans(scansUsedToday: number): number {
  return Math.max(FREE_DAILY_SCANS - scansUsedToday, 0);
}

export function scansLimitLabel(scansUsedToday: number, profile: Profile | null | undefined): string {
  if (isPro(profile)) return 'Unlimited scans';
  const left = remainingFreeScans(scansUsedToday);
  if (left === 0) return 'Out of free scans — go Pro';
  return `${left} free scan${left === 1 ? '' : 's'} left today`;
}
