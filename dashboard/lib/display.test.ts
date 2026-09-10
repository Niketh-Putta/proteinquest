import assert from "node:assert/strict";
import test from "node:test";
import { displayMetric } from "./format.ts";
import type { Metric } from "./types.ts";

test("never presents missing sources as numbers", () => {
  const cases: Metric[] = [
    { status: "not_connected", value: 12847 },
    { status: "unavailable", value: 99 },
    { status: "no_data", value: 0 },
    { status: "no_data", value: null },
  ];
  for (const metric of cases) {
    const label = displayMetric(metric);
    assert.match(label, /Not connected|Unavailable|No data/);
    assert.doesNotMatch(label, /^\d/);
  }
});

test("renders real connected values", () => {
  assert.equal(displayMetric({ status: "ok", value: 12 }), "12");
  assert.equal(displayMetric({ status: "ok", value: 0.25 }), "25.0%");
});
