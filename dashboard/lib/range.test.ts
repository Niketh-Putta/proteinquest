import assert from "node:assert/strict";
import test from "node:test";
import { ALL_TIME_START, resolveRange, shiftDate } from "./range.ts";

test("all time starts at first store month", () => {
  const bounds = resolveRange("all");
  assert.equal(bounds.range, "all");
  assert.equal(bounds.from, ALL_TIME_START);
});

test("last week is 7 days including today", () => {
  const bounds = resolveRange("week");
  assert.equal(bounds.from, shiftDate(bounds.to, -6));
});

test("last month is 30 days including today", () => {
  const bounds = resolveRange("month");
  assert.equal(bounds.from, shiftDate(bounds.to, -29));
});

test("funnel default is all time", () => {
  assert.equal(resolveRange(null, "all").range, "all");
});
