import assert from "node:assert/strict";
import test from "node:test";
import {
  isAppleAppDownloadRow,
  monthDateRange,
  parseAppleFinanceRows,
  parseAppleReportDate,
  parseAppleSalesUnits,
} from "./apple-reports.ts";

test("parses Apple MM/DD/YYYY without swapping month and day", () => {
  assert.equal(parseAppleReportDate("09/10/2026"), "2026-09-10");
  assert.equal(parseAppleReportDate("2026-08-01"), "2026-08-01");
});

test("counts app units for ASC sku proteinquest, not only the bundle id", () => {
  assert.equal(
    isAppleAppDownloadRow({
      SKU: "proteinquest",
      "Product Type Identifier": "1F",
      Units: "3",
    }),
    true,
  );
  assert.equal(
    isAppleAppDownloadRow({
      SKU: "pro_weekly",
      "Parent Identifier": "proteinquest",
      "Product Type Identifier": "IAY",
      Units: "1",
    }),
    false,
  );
});

test("parses monthly sales units for the App Store sku", () => {
  const rows = parseAppleSalesUnits(
    [
      {
        SKU: "proteinquest",
        "Product Type Identifier": "1",
        Units: "4",
        "Begin Date": "08/01/2026",
        "Country Code": "GB",
      },
      {
        SKU: "other.app",
        "Product Type Identifier": "1",
        Units: "9",
        "Begin Date": "08/01/2026",
        "Country Code": "US",
      },
    ],
    "2026-08",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.units, 4);
  assert.equal(rows[0]?.date, "2026-08-01");
});

test("finance parser keeps returns separate and does not invent fees", () => {
  const { start, end } = monthDateRange("2026-08");
  const rows = parseAppleFinanceRows(
    [
      {
        "Vendor Identifier": "pro_weekly",
        "Parent Identifier": "proteinquest",
        Quantity: "1",
        "Customer Price": "6.99",
        "Extended Partner Share": "4.89",
        "Partner Share Currency": "GBP",
        "Country Of Sale": "GB",
        "Sales or Return": "S",
        "Start Date": "08/01/2026",
        "End Date": "08/31/2026",
      },
      {
        "Vendor Identifier": "pro_weekly",
        "Parent Identifier": "proteinquest",
        Quantity: "1",
        "Customer Price": "6.99",
        "Extended Partner Share": "-4.89",
        "Partner Share Currency": "GBP",
        "Country Of Sale": "GB",
        "Sales or Return": "R",
        "Start Date": "08/01/2026",
        "End Date": "08/31/2026",
      },
    ],
    "2026-08",
    "app_store_connect_financial",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.periodStart, start);
  assert.equal(rows[0]?.periodEnd, end);
  assert.equal(rows[0]?.grossBillings, 6.99);
  assert.equal(rows[0]?.refunds, 6.99);
  assert.equal(rows[0]?.proceeds, 0);
  assert.equal(rows[0]?.platformFees, 0);
});
