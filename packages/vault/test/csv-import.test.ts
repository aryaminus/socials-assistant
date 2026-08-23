import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { importTiktokCsv, detectTiktokCsvKind, parseCsv } from "../src/importers/tiktok-csv.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test("parseCsv handles quoted commas, newlines in quotes, CRLF", () => {
  const rows = parseCsv('a,b,c\r\n"x,1","line\nbreak",3\r\n,,""\r\n');
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["x,1", "line\nbreak", "3"],
  ]);
});

test("detects csv kinds from headers", () => {
  assert.equal(detectTiktokCsvKind(["date", "video_title", "video_id"]), "video_stats");
  assert.equal(detectTiktokCsvKind(["date", "followers", "total_followers"]), "follower");
  assert.equal(detectTiktokCsvKind(["date", "profile_views"]), "profile");
  assert.equal(detectTiktokCsvKind(["something", "else"]), "unknown");
});

test("video stats import: canonical metrics, hms avg watch, dedupe by video", () => {
  const csv = readFileSync(join(dir, "tiktok-video-stats.csv"), "utf8");
  const result = importTiktokCsv(csv);
  assert.equal(result.kind, "video_stats");
  assert.equal(result.videos, 3);

  const ep2 = result.snapshot.videos.find((v) => v.platformVideoId === "7309876543210987654")!;
  assert.equal(ep2.title, "The oldest spot in town (Ep2)");
  assert.equal(ep2.metrics.views, 372100);
  assert.equal(ep2.metrics.likes, 18500);
  assert.equal(ep2.metrics.comments, 2100);
  assert.equal(ep2.metrics.shares, 3400);
  assert.equal(ep2.metrics.saves, 5200);
  assert.equal(ep2.metrics.watchTimeMinutes, 98000);
  assert.equal(ep2.metrics.avgWatchSeconds, 72); // "1:12"
  assert.equal(ep2.metrics.reach, 295000);
  assert.equal(ep2.publishedAt, "2026-06-14T12:00:00.000Z".replace("2026-06-14", "2026-06-21"));

  const ep7 = result.snapshot.videos.find((v) => v.platformVideoId === "7412345678901234567")!;
  assert.equal(ep7.metrics.avgWatchSeconds, 42); // "0:42"
});

test("follower import: daily metrics with signed values parsed", () => {
  const csv = readFileSync(join(dir, "tiktok-follower.csv"), "utf8");
  const result = importTiktokCsv(csv);
  assert.equal(result.kind, "follower");
  assert.ok(result.dailyMetrics! >= 8);
  const total = result.snapshot.daily.find((d) => d.metric === "followers" && d.date === "2026-08-20");
  assert.equal(total?.value, 1084);
  const gained = result.snapshot.daily.find((d) => d.metric === "followers_gained" && d.date === "2026-08-19");
  assert.equal(gained?.value, 45);
});

test("profile views import", () => {
  const csv = readFileSync(join(dir, "tiktok-profile.csv"), "utf8");
  const result = importTiktokCsv(csv);
  assert.equal(result.kind, "profile");
  assert.equal(result.snapshot.daily.find((d) => d.date === "2026-08-20")?.value, 1388);
});

test("unknown shape preserved with warning", () => {
  const result = importTiktokCsv("colA,colB\nfoo,bar\n");
  assert.equal(result.kind, "unknown");
  assert.ok(result.snapshot.warnings[0].includes("Unrecognized"));
  assert.equal(result.snapshot.videos.length, 1);
  assert.deepEqual(result.snapshot.videos[0].extras, { cola: "foo", colb: "bar" });
});
