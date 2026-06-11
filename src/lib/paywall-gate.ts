import type { Profile } from './types';

/** Free tier: AI photo scans per calendar day (UTC date on server). */
export const FREE_DAILY_SCANS = 3;

export function isPro(profile: Profile | null | undefined): boolean {
  return profile?.is_premium === true;
}

/** Cal AI-style soft gate: show once after onboarding; dismissible. */
export function shouldShowPostOnboardingPaywall(profile: Profile | null | undefined): boolean {
  if (!profile?.onboarded) return false;
  if (isPro(profile)) return false;
  return !profile.paywall_dismissed;
}

export function canAccessTrends(profile: Profile | null | undefined): boolean {
  return isPro(profile);
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
