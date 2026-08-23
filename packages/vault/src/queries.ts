import type { Vault } from "./db.js";
import { engagementRate, isoWeekLabel, mean, pctChange } from "@socials/shared";

export interface PeriodComparison {
  metric: string;
  platform?: string;
  current: number;
  prior: number;
  changePct: number | null;
  windowDays: number;
}

/** Sum of a daily metric over the last N days vs the N days before that, per platform + overall. */
export function comparePeriods(vault: Vault, metric: string, windowDays = 7): PeriodComparison[] {
  const rows = vault.db
    .prepare(
      `SELECT a.platform AS platform, am.date AS date, am.value AS value
       FROM account_metrics am
       JOIN snapshots s ON s.id = am.snapshot_id
       JOIN accounts a ON a.id = s.account_id
       WHERE am.metric = ? AND am.date IS NOT NULL
         AND s.id = (SELECT max(s2.id) FROM snapshots s2 WHERE s2.account_id = s.account_id AND s2.taken_at <= date('now', '+1 day'))
       ORDER BY am.date`
    )
    .all(metric) as Array<{ platform: string; date: string; value: number }>;

  const today = new Date();
  const cutoff = (daysAgo: number) => {
    const d = new Date(today.getTime() - daysAgo * 86400_000);
    return d.toISOString().slice(0, 10);
  };
  // current window: the N days ending today (date > today-N)
  // prior window:   the N days before that (today-2N < date <= today-N)
  const curBoundary = cutoff(windowDays);
  const priorBoundary = cutoff(windowDays * 2);

  const agg = new Map<string, { cur: number[]; prior: number[] }>();
  for (const r of rows) {
    const buckets = [agg.get("overall") ?? { cur: [], prior: [] }, agg.get(r.platform) ?? { cur: [], prior: [] }];
    for (const b of buckets) {
      if (r.date > curBoundary) b.cur.push(r.value);
      else if (r.date > priorBoundary && r.date <= curBoundary) b.prior.push(r.value);
    }
    agg.set("overall", buckets[0]);
    agg.set(r.platform, buckets[1]);
  }

  const out: PeriodComparison[] = [];
  for (const [key, b] of agg) {
    const cur = b.cur.reduce((x, y) => x + y, 0);
    const prior = b.prior.reduce((x, y) => x + y, 0);
    if (b.cur.length === 0 && b.prior.length === 0) continue;
    out.push({
      metric,
      platform: key === "overall" ? undefined : key,
      current: cur,
      prior,
      changePct: pctChange(cur, prior) ?? null,
      windowDays,
    });
  }
  return out;
}

export interface TopContentRow {
  platform: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagementRate: number | null;
  avgWatchSeconds: number | null;
  watchTimeMinutes: number | null;
  capturedAt: string;
}

/**
 * Latest metrics per video, newest snapshot wins. `sinceDays` filters by published_at
 * when set to "recent" mode; pass 0 to include the whole catalog.
 */
export function topContent(
  vault: Vault,
  opts: { metric?: keyof TopContentRow | "engagement_rate"; limit?: number; sinceDays?: number; platform?: string } = {}
): TopContentRow[] {
  const { metric = "views", limit = 10, sinceDays = 0, platform } = opts;
  let rows = vault.db
    .prepare(
      `SELECT a.platform AS platform, v.title AS title, v.url AS url, v.published_at AS publishedAt,
              vm.views AS views, vm.likes AS likes, vm.comments AS comments, vm.shares AS shares,
              vm.avg_watch_seconds AS avgWatchSeconds, vm.watch_time_minutes AS watchTimeMinutes,
              vm.captured_at AS capturedAt, vm.retention_json AS retentionJson
       FROM video_metrics vm
       JOIN videos v ON v.id = vm.video_id
       JOIN accounts a ON a.id = v.account_id
       WHERE vm.captured_at = (SELECT max(vm2.captured_at) FROM video_metrics vm2 WHERE vm2.video_id = vm.video_id)`
    )
    .all() as unknown as Array<TopContentRow & { retentionJson: string | null }>;

  if (platform) rows = rows.filter((r) => r.platform === platform);
  if (sinceDays > 0) {
    const cutoff = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    rows = rows.filter((r) => !r.publishedAt || r.publishedAt >= cutoff);
  }

  const enriched: TopContentRow[] = rows.map((r) => ({
    platform: r.platform,
    title: r.title,
    url: r.url,
    publishedAt: r.publishedAt,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    engagementRate:
      r.views && (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) > 0
        ? ((r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0)) / r.views
        : null,
    avgWatchSeconds: r.avgWatchSeconds,
    watchTimeMinutes: r.watchTimeMinutes,
    capturedAt: r.capturedAt,
  }));

  const key = metric === "engagement_rate" ? "engagementRate" : metric;
  enriched.sort((a, b) => {
    const av = (a as unknown as Record<string, number | null>)[key as string] ?? -1;
    const bv = (b as unknown as Record<string, number | null>)[key as string] ?? -1;
    return bv - av;
  });
  return enriched.slice(0, limit);
}

/** Latest audience slices per dimension from the most recent snapshot of each platform. */
export function audienceOverview(vault: Vault): Array<{ platform: string; dimension: string; key: string; value: number }> {
  return vault.db
    .prepare(
      `SELECT a.platform AS platform, aud.dimension AS dimension, aud.key AS key, aud.value AS value
       FROM audience aud
       JOIN snapshots s ON s.id = aud.snapshot_id
       JOIN accounts a ON a.id = s.account_id
       WHERE s.id = (SELECT max(s2.id) FROM snapshots s2 WHERE s2.account_id = s.account_id)
       ORDER BY a.platform, aud.dimension, aud.value DESC`
    )
    .all() as never;
}

/** Read-only SQL over the vault. Only single SELECT statements against vault tables are allowed. */
export function vaultQuery(vault: Vault, sql: string): unknown[] {
  const trimmed = sql.trim().toLowerCase();
  if (!trimmed.startsWith("select")) throw new Error("vault_query allows a single read-only SELECT statement");
  const forbidden = [/\binsert\b/, /\bupdate\b/, /\bdelete\b/, /\bdrop\b/, /\balter\b/, /\bcreate\b/, /\battach\b/, /\bpragma\b/];
  for (const f of forbidden) if (f.test(trimmed)) throw new Error("vault_query rejects write/DDL keywords");
  const stmt = vault.db.prepare(sql);
  return stmt.all() as unknown[];
}

export interface DigestData {
  week: string;
  generatedAt: string;
  platforms: Array<{
    platform: string;
    handle?: string;
    comparisons: PeriodComparison[];
    newFollowers?: number;
    topVideos: TopContentRow[];
  }>;
  overall: PeriodComparison[];
  bestContent: TopContentRow[];
  worstContent: TopContentRow[];
  audience: Array<{ platform: string; dimension: string; key: string; value: number }>;
  historySince?: string;
  warnings: string[];
}

/** Everything the weekly-digest skill needs, in one payload. */
export function digestData(vault: Vault, days = 7): DigestData {
  const platforms = vault.listAccounts();
  const byPlatform: DigestData["platforms"] = [];
  const metrics = ["views", "reach", "likes", "comments", "shares", "followers", "profile_views"];

  for (const p of platforms) {
    const comps = metrics
      .flatMap((m) => comparePeriods(vault, m, days))
      .filter((c) => c.platform === p.platform);
    const top = topContent(vault, { limit: 5, metric: "views", platform: p.platform });
    byPlatform.push({ platform: p.platform, handle: p.handle ?? undefined, comparisons: comps, topVideos: top });
  }

  const overall = metrics.flatMap((m) => comparePeriods(vault, m, days)).filter((c) => !c.platform);
  const best = topContent(vault, { limit: 3, metric: "views", sinceDays: days * 2 });
  const worst = [...topContent(vault, { limit: 50, metric: "views", sinceDays: days * 2 })]
    .filter((r) => (r.views ?? 0) > 0)
    .sort((a, b) => (a.views ?? 0) - (b.views ?? 0))
    .slice(0, 3);

  return {
    week: isoWeekLabel(),
    generatedAt: new Date().toISOString(),
    platforms: byPlatform,
    overall,
    bestContent: best,
    worstContent: worst,
    audience: audienceOverview(vault),
    historySince: vault.firstSnapshotDate(),
    warnings: [],
  };
}

export interface MediaKitData {
  generatedAt: string;
  accounts: Array<{
    platform: string;
    handle: string | null;
    followers?: number;
    totalViews30d?: number;
    avgEngagementRate?: number;
    topVideos: TopContentRow[];
  }>;
  audienceHighlights: Array<{ dimension: string; key: string; value: number }>;
}

/** Verified numbers for the media-kit skill. Only vault data — never estimates. */
export function mediaKitData(vault: Vault): MediaKitData {
  const accounts: MediaKitData["accounts"] = [];
  for (const acct of vault.listAccounts()) {
    const followersRow = vault.db
      .prepare(
        `SELECT am.value AS v FROM account_metrics am
         JOIN snapshots s ON s.id = am.snapshot_id
         JOIN accounts a ON a.id = s.account_id
         WHERE a.platform = ? AND am.metric IN ('followers','subscriber_count','fan_count','followers_count')
           AND am.date IS NULL
         ORDER BY s.taken_at DESC LIMIT 1`
      )
      .get(acct.platform) as { v: number } | undefined;

    const videos = topContent(vault, { limit: 10, metric: "views", platform: acct.platform });
    const rates = videos.map((v) => v.engagementRate).filter((r): r is number => r !== null);
    const views30 = topContent(vault, { limit: 50, metric: "views", platform: acct.platform, sinceDays: 30 })
      .reduce((s, v) => s + (v.views ?? 0), 0);

    accounts.push({
      platform: acct.platform,
      handle: acct.handle,
      followers: followersRow?.v,
      totalViews30d: views30 || undefined,
      avgEngagementRate: mean(rates),
      topVideos: videos.slice(0, 3),
    });
  }
  const audience = audienceOverview(vault)
    .filter((a) => ["country", "age", "gender"].includes(a.dimension))
    .slice(0, 12)
    .map(({ dimension, key, value }) => ({ dimension, key, value }));
  return { generatedAt: new Date().toISOString(), accounts, audienceHighlights: audience };
}

// re-export helpers used by skills/tests
export { engagementRate };
