import assert from "node:assert/strict";
import test from "node:test";
import { countDistinctIds, filterWebEvents } from "./web-metrics.ts";

const rows = [
  {
    event_name: "landing_viewed",
    event_time: "2026-09-11T16:00:00.000Z",
    environment: "production",
    platform: "web",
    channel: "unknown",
    install_id: "a",
  },
  {
    event_name: "landing_viewed",
    event_time: "2026-09-11T18:00:00.000Z",
    environment: "production",
    platform: "web",
    channel: "unknown",
    install_id: "a",
  },
  {
    event_name: "store_link_clicked",
    event_time: "2026-09-11T18:01:00.000Z",
    environment: "production",
    platform: "web",
    channel: "unknown",
    install_id: "a",
  },
  {
    event_name: "landing_viewed",
    event_time: "2026-08-01T12:00:00.000Z",
    environment: "production",
    platform: "web",
    channel: "unknown",
    install_id: "old",
  },
];

test("counts unique website visitors in range", () => {
  const viewed = filterWebEvents(rows, "landing_viewed", "2026-09-10", "2026-09-12", "all", "all");
  assert.equal(viewed.length, 2);
  assert.equal(countDistinctIds(viewed), 1);
});

test("counts store clickers", () => {
  const clicks = filterWebEvents(rows, "store_link_clicked", "2026-09-10", "2026-09-12", "all", "all");
  assert.equal(countDistinctIds(clicks), 1);
});
