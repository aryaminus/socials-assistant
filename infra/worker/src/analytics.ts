/** D1 implementations of the analytics queries (compare_periods / top_content / digest / media kit). */
import type { D1Vault } from "./vault.ts";

export async function comparePeriods(vault: D1Vault, metric: string, windowDays: number): Promise<unknown> {
  const db = vault;
  const rows = (
    await raw(
      db,
      `SELECT a.platform AS platform, am.date AS date, am.value AS value
       FROM account_metrics am
       JOIN snapshots s ON s.id = am.snapshot_id
       JOIN accounts a ON a.id = s.account_id
       WHERE a.user_key = ? AND am.metric = ? AND am.date IS NOT NULL
         AND s.id IN (SELECT max(s2.id) FROM snapshots s2 JOIN accounts a2 ON a2.id = s2.account_id WHERE a2.user_key = ? GROUP BY a2.id)
       ORDER BY am.date`,
      [db.userKey, metric, db.userKey]
    )
  ) as Array<{ platform: string; date: string; value: number }>;

  const curStart = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  const priorStart = new Date(Date.now() - windowDays * 2 * 86400_000).toISOString().slice(0, 10);
  const agg = new Map<string, { cur: number; prior: number }>();
  for (const r of rows) {
    for (const key of ["overall", r.platform]) {
      const b = agg.get(key) ?? { cur: 0, prior: 0 };
      if (r.date >= curStart) b.cur += r.value;
      else if (r.date >= priorStart) b.prior += r.value;
      agg.set(key, b);
    }
  }
  return [...agg.entries()].map(([key, b]) => ({
    metric,
    platform: key === "overall" ? undefined : key,
    current: b.cur,
    prior: b.prior,
    changePct: b.prior === 0 ? null : (b.cur - b.prior) / b.prior,
    windowDays,
  }));
}

export async function topContent(
  vault: D1Vault,
  opts: { metric?: string; limit?: number; days?: number; platform?: string }
): Promise<unknown> {
  const { metric = "views", limit = 10, days = 0, platform } = opts;
  const rows = (
    await raw(
      vault,
      `SELECT a.platform AS platform, v.title AS title, v.url AS url, v.published_at AS publishedAt,
              vm.views AS views, vm.likes AS likes, vm.comments AS comments, vm.shares AS shares,
              vm.avg_watch_seconds AS avgWatchSeconds, vm.watch_time_minutes AS watchTimeMinutes
       FROM video_metrics vm
       JOIN videos v ON v.id = vm.video_id
       JOIN accounts a ON a.id = v.account_id
       WHERE a.user_key = ?
         AND vm.captured_at = (SELECT max(vm2.captured_at) FROM video_metrics vm2 WHERE vm2.video_id = vm.video_id)
         ${platform ? "AND a.platform = ?" : ""}
       ORDER BY ${metric === "engagement_rate" ? "((vm.likes+vm.comments+vm.shares)/max(vm.views,1))" : `vm.${metric}`} DESC
       LIMIT ?`,
      platform ? [vault.userKey, platform, limit] : [vault.userKey, limit]
    )
  ) as Array<Record<string, unknown>>;
  const since = days > 0 ? new Date(Date.now() - days * 86400_000).toISOString() : null;
  return rows.filter((r) => !since || !r.publishedAt || String(r.publishedAt) >= since);
}

export async function digestRows(vault: D1Vault, days: number): Promise<unknown> {
  const metrics = ["views", "likes", "comments", "shares", "reach", "followers", "followers_gained"];
  const comparisons = (await Promise.all(metrics.map((m) => comparePeriods(vault, m, days)))).flat() as Array<{ metric: string; platform?: string }>;
  return {
    week: isoWeek(),
    generatedAt: new Date().toISOString(),
    overall: comparisons.filter((c) => !c.platform),
    perPlatform: groupBy(comparisons.filter((c) => c.platform), (c) => c.platform!),
    bestContent: await topContent(vault, { metric: "views", limit: 5, days: days * 2 }),
    audience: await raw(
      vault,
      `SELECT a.platform AS platform, aud.dimension AS dimension, aud.key AS key, aud.value AS value
       FROM audience aud JOIN snapshots s ON s.id = aud.snapshot_id JOIN accounts a ON a.id = s.account_id
       WHERE a.user_key = ?
         AND s.id IN (SELECT max(s2.id) FROM snapshots s2 JOIN accounts a2 ON a2.id = s2.account_id WHERE a2.user_key = ? GROUP BY a2.id)
       ORDER BY aud.value DESC`,
      [vault.userKey, vault.userKey]
    ),
  };
}

export async function mediaKitRows(vault: D1Vault): Promise<unknown> {
  const accounts = await vault.listAccounts();
  const out: unknown[] = [];
  for (const a of accounts) {
    const followers = await raw(
      vault,
      `SELECT am.value AS v FROM account_metrics am JOIN snapshots s ON s.id = am.snapshot_id
       WHERE s.account_id = ? AND am.metric IN ('followers','subscriber_count','fan_count') AND am.date IS NULL
       ORDER BY s.taken_at DESC LIMIT 1`,
      [a.id]
    );
    out.push({
      platform: a.platform,
      handle: a.handle,
      followers: (followers[0] as { v?: number } | undefined)?.v,
      topVideos: await topContent(vault, { metric: "views", limit: 3, platform: a.platform }),
    });
  }
  return { generatedAt: new Date().toISOString(), accounts: out };
}

// ---------- helpers ----------

async function raw(vault: D1Vault, sql: string, params: unknown[]): Promise<unknown> {
  // D1Vault exposes query() but it takes only SQL; use env through query for bound params is
  // not available, so re-parse: we cheat by using query with inline-safe interpolation ONLY
  // through prepared statements — but to keep the interface tiny we run via query() with
  // parameters embedded safely:
  return vault.boundQuery(sql, params);
}

function groupBy<T>(xs: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of xs) (out[key(x)] ??= []).push(x);
  return out;
}

function isoWeek(): string {
  const d = new Date();
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
