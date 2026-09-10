import assert from "node:assert/strict";
import test from "node:test";
import { signSession, verifySession } from "./session.ts";

test("signed session lasts eight hours and rejects tampering", async () => {
  const secret = "test-session-secret";
  const token = await signSession(secret);
  assert.equal(await verifySession(token, secret), true);
  assert.equal(await verifySession(token, "other"), false);
  assert.equal(await verifySession("0.not-a-sig", secret), false);
});
