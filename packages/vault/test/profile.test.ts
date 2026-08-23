import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault } from "../src/db.js";
import { getProfile, setProfile, pipelineAdd, pipelineList, pipelineUpdate } from "../src/profile.js";
import { discoverTiktokCsv } from "../src/importers/discover.js";

function withVault(fn: (v: Vault) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "socials-profile-"));
    const vault = new Vault(dir);
    try {
      await fn(vault);
    } finally {
      vault.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test("profile: empty get, partial merges preserve prior fields", withVault(async (v) => {
  assert.deepEqual(Object.keys(getProfile(v)).filter((k) => k !== "updated_at"), []);
  setProfile(v, { niche: "cooking short-form", rate_floor: 75 });
  setProfile(v, { tone_notes: "warm, no hype" });
  const p = getProfile(v);
  assert.equal(p.niche, "cooking short-form");
  assert.equal(p.tone_notes, "warm, no hype");
  assert.equal(p.rate_floor, 75);
  assert.ok(p.updated_at);
}));

test("pipeline: full lifecycle with stage validation", withVault(async (v) => {
  const item = pipelineAdd(v, { title: "Spring collab concept", brand: "Acme", platform: "tiktok", stage: "idea" });
  assert.equal(item.stage, "idea");
  assert.ok(item.id > 0);

  pipelineUpdate(v, item.id, { stage: "scripting", script_path: "/tmp/script.md" });
  pipelineUpdate(v, item.id, { stage: "brand_review", due_date: "2026-09-01" });
  pipelineUpdate(v, item.id, { stage: "approved" });
  const posted = pipelineUpdate(v, item.id, { stage: "posted", post_url: "https://tiktok.com/@x/v/123" });
  assert.equal(posted?.stage, "posted");
  assert.ok(posted?.posted_at);
  assert.equal(posted?.post_url, "https://tiktok.com/@x/v/123");

  const measured = pipelineUpdate(v, item.id, { stage: "measured", notes: "2.1x median views" });
  assert.equal(measured?.stage, "measured");
  assert.match(measured?.notes ?? "", /2.1x/);

  // invalid stage rejected
  assert.throws(() => pipelineUpdate(v, item.id, { stage: "teleported" as never }), /Invalid stage/);

  const list = pipelineList(v);
  assert.equal(list.length, 1);
  assert.equal(list[0].brand, "Acme");
  const byStage = pipelineList(v, "measured");
  assert.equal(byStage.length, 1);
  assert.equal(pipelineList(v, "idea").length, 0);
}));

test("discoverTiktokCsv finds newest name-hinted file", () => {
  const dir = mkdtempSync(join(tmpdir(), "socials-discover-"));
  try {
    mkdirSync(join(dir, "Downloads"), { recursive: true });
    writeFileSync(join(dir, "Downloads", "random.csv"), "a,b\n1,2\n");
    writeFileSync(join(dir, "Downloads", "TikTok Analytics - video stats.csv"), "Date,Video title\n2026-08-20,x\n");
    const found = discoverTiktokCsv([join(dir, "Downloads")]);
    assert.ok(found, "should discover a file");
    assert.match(found!, /TikTok/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverTiktokCsv returns undefined on empty dirs", () => {
  const dir = mkdtempSync(join(tmpdir(), "socials-discover-empty-"));
  try {
    assert.equal(discoverTiktokCsv([dir], { skipDefaults: true }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
