import { test } from "node:test";
import assert from "node:assert/strict";
import { engagementRate, pctChange, safeNumber, snakeCase, hmsToSeconds, isoWeekLabel } from "../src/index.js";

test("safeNumber parses numbers with commas, %, dashes", () => {
  assert.equal(safeNumber("1,449"), 1449);
  assert.equal(safeNumber("42%"), 42);
  assert.equal(safeNumber("-"), undefined);
  assert.equal(safeNumber(""), undefined);
  assert.equal(safeNumber(3.14), 3.14);
  assert.equal(safeNumber(null), undefined);
});

test("safeNumber + hms parse durations", () => {
  assert.equal(safeNumber("0:42"), 42);
  assert.equal(safeNumber("1:03:22"), hmsToSeconds("1:03:22"));
  assert.equal(hmsToSeconds("1:12"), 72);
});

test("engagementRate computes (L+C+S)/views", () => {
  assert.ok(Math.abs(engagementRate({ views: 1000, likes: 50, comments: 20, shares: 10 })! - 0.08) < 1e-9);
  assert.equal(engagementRate({ views: 0, likes: 1, comments: 1, shares: 1 }), undefined);
});

test("pctChange handles zero baseline", () => {
  assert.equal(pctChange(120, 100), 0.2);
  assert.equal(pctChange(10, 0), undefined);
});

test("snakeCase normalizes export headers", () => {
  assert.equal(snakeCase("Watch time (minutes)"), "watch_time_minutes");
  assert.equal(snakeCase("Average watch time"), "average_watch_time");
  assert.equal(snakeCase("Total followers"), "total_followers");
});

test("isoWeekLabel format", () => {
  assert.match(isoWeekLabel(), /^\d{4}-W\d{2}$/);
});
