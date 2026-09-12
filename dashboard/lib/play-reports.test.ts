import assert from "node:assert/strict";
import test from "node:test";

import {
  isNewPaidSubscriptionEvent,
  isPlayFinancialObject,
  isPlayOverviewObject,
  parsePlayFinanceCsv,
  parsePlayOverviewCsv,
  playBucketCandidates,
} from "./play-reports.ts";

test("discovers Play report buckets from developer id", () => {
  const buckets = playBucketCandidates("6372752371369019039", "gs://pubsite_prod_6372752371369019039/stats/installs/");
  assert.ok(buckets.includes("pubsite_prod_6372752371369019039"));
  assert.equal(buckets[0], "pubsite_prod_6372752371369019039");
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

test("parses Play earnings without inventing a fee", () => {
  const csv = [
    "Transaction Date,Sku Id,Buyer Country,Currency of Sale,Charged Amount,Taxes Collected,Amount (Merchant Currency),Transaction Type",
    "2026-08-15,pro_weekly,GB,GBP,6.99,0,5.94,Charge",
    "2026-08-16,pro_weekly,GB,GBP,-6.99,0,-5.94,Refund",
  ].join("\n");
  const rows = parsePlayFinanceCsv(csv, "play_earnings");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.grossBillings, 6.99);
  assert.equal(rows[0]?.refunds, 6.99);
  assert.equal(rows[0]?.proceeds, 0);
  assert.equal(rows[0]?.platformFees, 0);
  assert.equal(isPlayFinancialObject("earnings/earnings_202608.zip"), true);
  assert.equal(isPlayFinancialObject("stats/installs/installs_com.proteinquest.app_202608_overview.csv"), false);
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
