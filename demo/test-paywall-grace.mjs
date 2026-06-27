/** Sanity-check habit grace + upgrade/paywall gating (no deps). */
import assert from 'node:assert/strict';

const HABIT_GRACE_DAYS = 2;
const FREE_DAILY_SCANS = 3;

function localCalendarDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function calendarDaysBetween(from, to) {
  const fromDay = localCalendarDay(from);
  const toDay = localCalendarDay(to);
  const fromUtc = Date.UTC(fromDay.getFullYear(), fromDay.getMonth(), fromDay.getDate());
  const toUtc = Date.UTC(toDay.getFullYear(), toDay.getMonth(), toDay.getDate());
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function parseTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveProfileCreatedAt(profile, authUserCreatedAt) {
  const fromProfile = parseTimestamp(profile?.created_at ?? null);
  if (fromProfile) return fromProfile;
  return parseTimestamp(authUserCreatedAt ?? null);
}

function accountAgeCalendarDays(profile, now, authUserCreatedAt) {
  const signupAt = resolveProfileCreatedAt(profile, authUserCreatedAt);
  if (!signupAt) return null;
  return calendarDaysBetween(signupAt, now);
}

function isInGrace(profile, now, authUserCreatedAt) {
  if (profile?.is_premium) return false;
  const age = accountAgeCalendarDays(profile, now, authUserCreatedAt);
  if (age === null) return false;
  return age >= 0 && age < HABIT_GRACE_DAYS;
}

function canScan(profile, scansUsed, now, authUserCreatedAt) {
  if (profile?.is_premium) return true;
  if (isInGrace(profile, now, authUserCreatedAt)) return true;
  return scansUsed < FREE_DAILY_SCANS;
}

function shouldShowDelayedPaywall(profile, now, authUserCreatedAt) {
  if (!profile?.onboarded) return false;
  if (profile.is_premium) return false;
  if (isInGrace(profile, now, authUserCreatedAt)) return false;
  if (profile.paywall_dismissed) return false;
  return profile.total_xp > 0;
}

function gracePeriodLabel(profile, now, authUserCreatedAt) {
  if (!isInGrace(profile, now, authUserCreatedAt)) return null;
  const age = accountAgeCalendarDays(profile, now, authUserCreatedAt);
  return `Unlimited scans · day ${age + 1} of ${HABIT_GRACE_DAYS}`;
}

const signup = new Date(2026, 5, 15, 23, 30); // Jun 15 local
const signupIso = signup.toISOString();
const authOnlyIso = signup.toISOString();

const profileWithCreated = { created_at: signupIso, is_premium: false };
const profileMissingCreated = { created_at: null, is_premium: false };

assert.equal(calendarDaysBetween(signup, new Date(2026, 5, 15, 8, 0)), 0);
assert.equal(isInGrace(profileWithCreated, new Date(2026, 5, 15, 23, 59)), true);

assert.equal(calendarDaysBetween(signup, new Date(2026, 5, 16, 8, 0)), 1);
assert.equal(isInGrace(profileWithCreated, new Date(2026, 5, 16, 23, 59)), true);

assert.equal(calendarDaysBetween(signup, new Date(2026, 5, 17, 0, 1)), 2);
assert.equal(isInGrace(profileWithCreated, new Date(2026, 5, 17, 0, 1)), false);

// Auth fallback when profile.created_at missing
assert.equal(
  isInGrace(profileMissingCreated, new Date(2026, 5, 16, 12, 0), authOnlyIso),
  true,
);
assert.equal(
  isInGrace(profileMissingCreated, new Date(2026, 5, 17, 12, 0), authOnlyIso),
  false,
);

// DST spring-forward (US): Mar 8 2026 — old ms-between-midnights can yield 0.9 days
const beforeDst = new Date(2026, 2, 7, 23, 0);
const afterDst = new Date(2026, 2, 8, 1, 0);
assert.equal(calendarDaysBetween(beforeDst, afterDst), 1);

// Grace: unlimited scans even after 10 scans
assert.equal(canScan(profileWithCreated, 10, new Date(2026, 5, 16, 12, 0)), true);

// Day 2+: 3 scan cap
assert.equal(canScan(profileWithCreated, 2, new Date(2026, 5, 17, 12, 0)), true);
assert.equal(canScan(profileWithCreated, 3, new Date(2026, 5, 17, 12, 0)), false);

const baseProfile = {
  onboarded: true,
  is_premium: false,
  paywall_dismissed: false,
  created_at: signupIso,
  total_xp: 50,
};
assert.equal(shouldShowDelayedPaywall(baseProfile, new Date(2026, 5, 15, 10, 0)), false);
assert.equal(shouldShowDelayedPaywall(baseProfile, new Date(2026, 5, 17, 10, 0)), true);

assert.equal(
  gracePeriodLabel(profileWithCreated, new Date(2026, 5, 15, 10, 0)),
  'Unlimited scans · day 1 of 2',
);
assert.equal(
  gracePeriodLabel(profileWithCreated, new Date(2026, 5, 16, 10, 0)),
  'Unlimited scans · day 2 of 2',
);
assert.equal(gracePeriodLabel(profileWithCreated, new Date(2026, 5, 17, 10, 0)), null);

console.log('paywall grace + upgrade workflow checks passed');
