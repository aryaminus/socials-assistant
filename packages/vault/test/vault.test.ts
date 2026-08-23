import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault } from "../src/db.js";
import { comparePeriods, topContent, digestData, mediaKitData, vaultQuery, audienceOverview } from "../src/queries.js";
import type { NormalizedSnapshot } from "@socials/shared";

function snapFixture(takenAt: string, views: number[]): NormalizedSnapshot {
  const start = new Date(Date.now() - (views.length - 1) * 86400_000);
  return {
    platform: "tiktok",
    handle: "examplecreator",
    takenAt,
    lifetime: [{ metric: "followers", value: 1084 }],
    daily: views.map((v, i) => ({
      date: new Date(start.getTime() + i * 86400_000).toISOString().slice(0, 10),
      metric: "views",
      value: v,
    })),
    videos: [
      { platform: "tiktok", platformVideoId: "1", title: "Strong performer", metrics: { views: 144941, likes: 9000, comments: 800, shares: 700 } },
      { platform: "tiktok", platformVideoId: "2", title: "Quiet performer", metrics: { views: 850, likes: 40, comments: 3, shares: 2 } },
    ],
    audience: [{ dimension: "country", key: "Home country", value: 0.68 }],
    warnings: [],
  };
}

function withVault(fn: (v: Vault) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "socials-vault-"));
    const vault = new Vault(dir);
    try {
      await fn(vault);
    } finally {
      vault.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test("storeSnapshot + credentials roundtrip + compare_periods", withVault(async (vault) => {
  const acct = vault.upsertAccount({ platform: "tiktok", platformAccountId: "open_id_1", handle: "examplecreator" });
  vault.setCredentials(acct, { accessToken: "tok", refreshToken: "ref", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const creds = vault.getCredentials(acct)!;
  assert.equal(creds.accessToken, "tok");
  assert.equal(creds.refreshToken, "ref");

  // 14 days of data: last 7 high (100/day), prior 7 low (50/day)
  const views = [...Array(7).fill(50), ...Array(7).fill(100)];
  const s1 = vault.storeSnapshot(acct, snapFixture(new Date().toISOString(), views), "api:test");
  assert.ok(s1.snapshotId > 0);
  assert.equal(s1.videos, 2);

  const comps = comparePeriods(vault, "views", 7);
  const overall = comps.find((c) => !c.platform)!;
  assert.equal(overall.current, 700);
  assert.equal(overall.prior, 350);
  assert.equal(overall.changePct, 1); // +100%
}));

test("top_content sorts by views and engagement_rate", withVault((vault) => {
  const acct = vault.upsertAccount({ platform: "tiktok", platformAccountId: "x" });
  vault.storeSnapshot(acct, snapFixture(new Date().toISOString(), [1, 2]), "api:test");
  const top = topContent(vault, { metric: "views", limit: 2 });
  assert.equal(top[0].title, "Strong performer");
  assert.equal(top[0].views, 144941);
  assert.ok(top[0].engagementRate! > 0.07);
  const byRate = topContent(vault, { metric: "engagement_rate", limit: 2 });
  // Viral one ER = 10500/144941 ≈ 7.2% beats Quiet one ≈ 5.3%
  assert.equal(byRate[0].title, "Strong performer");
}));

test("vault_query blocks writes and DDL, allows SELECT", withVault((vault) => {
  const rows = vaultQuery(vault, "SELECT count(*) AS n FROM accounts");
  assert.equal((rows[0] as { n: number }).n, 0);
  assert.throws(() => vaultQuery(vault, "DELETE FROM accounts"));
  assert.throws(() => vaultQuery(vault, "DROP TABLE accounts"));
  assert.throws(() => vaultQuery(vault, "PRAGMA table_info(accounts)"));
}));

test("digest + media kit read from vault", withVault((vault) => {
  const acct = vault.upsertAccount({ platform: "tiktok", platformAccountId: "x", handle: "examplecreator" });
  vault.storeSnapshot(acct, snapFixture(new Date().toISOString(), [...Array(7).fill(50), ...Array(7).fill(100)]), "api:test");
  const digest = digestData(vault, 7);
  assert.ok(digest.week.match(/^\d{4}-W\d{2}$/));
  assert.equal(digest.platforms.length, 1);
  assert.ok(digest.overall.length >= 1);

  const kit = mediaKitData(vault);
  assert.equal(kit.accounts[0].handle, "examplecreator");
  assert.equal(kit.accounts[0].followers, 1084);
  assert.equal(kit.audienceHighlights.find((a) => a.key === "Home country")?.value, 0.68);

  const aud = audienceOverview(vault);
  assert.equal(aud.find((a) => a.dimension === "country")?.key, "Home country");
}));

test("status reports token expiry", withVault((vault) => {
  const acct = vault.upsertAccount({ platform: "tiktok", platformAccountId: "x" });
  vault.setCredentials(acct, { accessToken: "t", expiresAt: new Date(Date.now() - 1000).toISOString() });
  const st = vault.status();
  assert.equal(st[0].ok, false);
  assert.match(st[0].issue!, /expired/);
}));
