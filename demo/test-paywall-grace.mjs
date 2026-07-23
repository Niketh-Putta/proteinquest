/** Sanity-check habit grace calendar-day math (no deps). */
import assert from 'node:assert/strict';

const HABIT_GRACE_DAYS = 2;

function localCalendarDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function accountAgeCalendarDays(createdAt, now) {
  const created = new Date(createdAt);
  const signupDay = localCalendarDay(created);
  const todayDay = localCalendarDay(now);
  return Math.floor((todayDay.getTime() - signupDay.getTime()) / 86_400_000);
}

function isInGrace(createdAt, now) {
  const age = accountAgeCalendarDays(createdAt, now);
  return age !== null && age >= 0 && age < HABIT_GRACE_DAYS;
}

const signup = new Date(2026, 5, 15, 23, 30); // Jun 15 local

assert.equal(accountAgeCalendarDays(signup, new Date(2026, 5, 15, 8, 0)), 0);
assert.equal(isInGrace(signup, new Date(2026, 5, 15, 23, 59)), true);

assert.equal(accountAgeCalendarDays(signup, new Date(2026, 5, 16, 8, 0)), 1);
assert.equal(isInGrace(signup, new Date(2026, 5, 16, 23, 59)), true);

// Day 2 (age = 2): trial ended
assert.equal(accountAgeCalendarDays(signup, new Date(2026, 5, 17, 0, 1)), 2);
assert.equal(isInGrace(signup, new Date(2026, 5, 17, 0, 1)), false);

console.log('paywall grace calendar-day checks passed');
