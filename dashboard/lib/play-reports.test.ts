import assert from "node:assert/strict";
import test from "node:test";

import {
  isNewPaidSubscriptionEvent,
  isPlayOverviewObject,
  parsePlayOverviewCsv,
  playBucketCandidates,
} from "./play-reports.ts";

test("discovers Play report buckets from developer id", () => {
  const buckets = playBucketCandidates("4972385690429690675", "gs://pubsite_prod_rev_4972385690429690675/stats");
  assert.ok(buckets.includes("pubsite_prod_rev_4972385690429690675"));
  assert.equal(buckets[0], "pubsite_prod_rev_4972385690429690675");
});

test("parses Play install overview using Daily User Installs, not updates", () => {
  const csv = [
    "Date,Package Name,Daily Device Installs,Daily User Installs,Daily User Uninstalls,Reinstalls",
    "2026-09-01,com.proteinquest.app,9,4,1,2",
    "not-a-date,com.proteinquest.app,1,1,0,0",
  ].join("\n");
  const rows = parsePlayOverviewCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.acquisitions, 4);
  assert.equal(rows[0]?.reinstalls, 2);
});

test("only official overview CSVs for this package are imported", () => {
  assert.equal(
    isPlayOverviewObject("stats/installs/installs_com.proteinquest.app_202609_overview.csv"),
    true,
  );
  assert.equal(
    isPlayOverviewObject("stats/installs/installs_com.other.app_202609_overview.csv"),
    false,
  );
});

test("restore and trial are not new paid subscribers", () => {
  assert.equal(
    isNewPaidSubscriptionEvent({
      eventType: "RESTORE",
      environment: "production",
      isTrial: false,
    }),
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
