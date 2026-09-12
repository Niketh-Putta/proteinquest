import assert from "node:assert/strict";
import test from "node:test";

function classifyDownload(type: string) {
  const value = type.toLowerCase();
  if (value.includes("first-time") || value.includes("first time")) return "first";
  if (value.includes("redownload")) return "redo";
  return "ignore";
}

function classifyEngagement(event: string, pageType: string) {
  const e = event.toLowerCase();
  const p = pageType.toLowerCase();
  if (e.includes("impression")) return "impressions";
  if (e.includes("page view") && p.includes("product")) return "product_page_views";
  return "ignore";
}

test("maps Apple download types without counting updates", () => {
  assert.equal(classifyDownload("First-time download"), "first");
  assert.equal(classifyDownload("Redownload"), "redo");
  assert.equal(classifyDownload("Auto-update"), "ignore");
  assert.equal(classifyDownload("Manual update"), "ignore");
  assert.equal(classifyDownload("Restore"), "ignore");
});

test("maps Discovery Standard page views to product pages only", () => {
  assert.equal(classifyEngagement("Impression", "No page"), "impressions");
  assert.equal(classifyEngagement("Page view", "Product page"), "product_page_views");
  assert.equal(classifyEngagement("Page view", "Developer page"), "ignore");
  assert.equal(classifyEngagement("Tap", "Product page"), "ignore");
});
