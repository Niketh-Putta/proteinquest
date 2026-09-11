import assert from "node:assert/strict";
import test from "node:test";

import { classifyPlan, mrrForPlan, planMixFromEvents } from "./plan-metrics.ts";

test("classifies weekly monthly and yearly product ids", () => {
  assert.equal(classifyPlan("pro_weekly"), "weekly");
  assert.equal(classifyPlan("pro_monthly"), "monthly");
  assert.equal(classifyPlan("pro_yearly"), "yearly");
});

test("yearly list price is £29.99 ARR and about £2.50 MRR", () => {
  assert.equal(Number(mrrForPlan("yearly").toFixed(2)), 2.5);
});

test("mix uses latest production event per user and ignores sandbox", () => {
  const mix = planMixFromEvents(
    [
      {
        user_id: "a",
        environment: "sandbox",
        event_type: "INITIAL_PURCHASE",
        product_id: "pro_yearly",
        event_time: "2026-09-11T10:00:00Z",
        is_trial: false,
      },
      {
        user_id: "b",
        environment: "production",
        event_type: "INITIAL_PURCHASE",
        product_id: "pro_weekly",
        event_time: "2026-09-11T10:00:00Z",
        is_trial: false,
        expires_at: "2026-12-01T00:00:00Z",
      },
      {
        user_id: "c",
        environment: "production",
        event_type: "INITIAL_PURCHASE",
        product_id: "pro_yearly",
        event_time: "2026-09-11T11:00:00Z",
        is_trial: false,
        expires_at: "2027-09-11T00:00:00Z",
      },
      {
        user_id: "c",
        environment: "production",
        event_type: "EXPIRATION",
        product_id: "pro_yearly",
        event_time: "2026-09-12T11:00:00Z",
        is_trial: false,
      },
    ],
    { from: "2026-09-10", to: "2026-09-12", now: new Date("2026-09-11T12:00:00Z") },
  );
  assert.equal(mix.weekly, 1);
  assert.equal(mix.yearly, 0);
  assert.equal(mix.addedWeekly, 1);
  assert.equal(mix.addedYearly, 1);
  assert.ok(mix.mrr > 20);
});
