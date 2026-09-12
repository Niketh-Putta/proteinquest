import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePlayRtdn, rtdnReplayIds } from "./play-rtdn.ts";

test("decodes a Play subscription notification and keeps the purchase token", () => {
  const payload = {
    version: "1.0",
    packageName: "com.proteinquest.app",
    eventTimeMillis: "1690000000000",
    subscriptionNotification: {
      notificationType: 4,
      purchaseToken: "token-abc",
      subscriptionId: "pro_weekly",
    },
  };
  const parsed = parsePlayRtdn({
    message: { messageId: "m1", data: Buffer.from(JSON.stringify(payload)).toString("base64") },
  });
  assert.equal(parsed.packageName, "com.proteinquest.app");
  assert.equal(parsed.purchaseToken, "token-abc");
  assert.equal(parsed.subscriptionId, "pro_weekly");
  assert.equal(parsed.isTest, false);
  assert.deepEqual(rtdnReplayIds(parsed), ["m1", "token-abc"]);
});

test("Play testNotification is not a paid subscriber", () => {
  const payload = { testNotification: { version: "1.0" }, packageName: "com.proteinquest.app" };
  const parsed = parsePlayRtdn({
    message: { messageId: "test-1", data: Buffer.from(JSON.stringify(payload)).toString("base64") },
  });
  assert.equal(parsed.isTest, true);
  assert.equal(parsed.purchaseToken, null);
});
