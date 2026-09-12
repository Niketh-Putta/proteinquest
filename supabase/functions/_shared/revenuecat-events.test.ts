import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isNewPaidSubscriptionEvent,
  rcEnvironment,
  shouldUpdatePremium,
  shouldWriteSubscriptionEvent,
} from "./revenuecat-events.ts";

test("sandbox never writes production totals or premium", () => {
  assert.equal(rcEnvironment("SANDBOX"), "sandbox");
  assert.equal(shouldWriteSubscriptionEvent("INITIAL_PURCHASE", "sandbox"), false);
  assert.equal(shouldUpdatePremium("INITIAL_PURCHASE", "sandbox"), false);
});

test("TEST webhook is not a paid subscriber", () => {
  assert.equal(shouldWriteSubscriptionEvent("TEST", "production"), false);
  assert.equal(
    isNewPaidSubscriptionEvent({ eventType: "TEST", environment: "production", isTrial: false }),
    false,
  );
});

test("restore, transfer, renewal, and trial are not new paid", () => {
  assert.equal(
    isNewPaidSubscriptionEvent({ eventType: "RESTORE", environment: "production", isTrial: false }),
    false,
  );
  assert.equal(
    isNewPaidSubscriptionEvent({ eventType: "TRANSFER", environment: "production", isTrial: false }),
    false,
  );
  assert.equal(
    isNewPaidSubscriptionEvent({ eventType: "RENEWAL", environment: "production", isTrial: false }),
    false,
  );
  assert.equal(
    isNewPaidSubscriptionEvent({
      eventType: "INITIAL_PURCHASE",
      environment: "production",
      isTrial: true,
    }),
    false,
  );
});

test("production initial purchase that is not a trial is new paid", () => {
  assert.equal(
    isNewPaidSubscriptionEvent({
      eventType: "INITIAL_PURCHASE",
      environment: "production",
      isTrial: false,
    }),
    true,
  );
});
