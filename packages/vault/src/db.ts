import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SCHEMA_SQL } from "./schema.js";
import { SecretBox, type StoredCredentials } from "./crypto.js";
import type { AccountStatus, NormalizedSnapshot, Platform } from "@socials/shared";
import { isoDate } from "@socials/shared";

export function defaultDataDir(): string {
  return process.env.SOCIALS_DATA_DIR ?? join(homedir(), ".socials-assistant");
}

export class Vault {
  readonly db: DatabaseSync;
  readonly box: SecretBox;

  constructor(readonly dataDir: string = defaultDataDir()) {
    mkdirSync(dataDir, { recursive: true });
    this.box = new SecretBox(join(dataDir, "key"));
    this.db = new DatabaseSync(join(dataDir, "vault.db"));
    this.db.exec(SCHEMA_SQL);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  close(): void {
    this.db.close();
  }

  // ---------- accounts & credentials ----------

  upsertAccount(input: {
    platform: Platform;
    platformAccountId: string;
    handle?: string;
    displayName?: string;
    credentials?: StoredCredentials;
  }): number {
    const now = new Date().toISOString();
    const creds = input.credentials ? this.box.encrypt(JSON.stringify(input.credentials)) : null;
    const existing = this.db
      .prepare("SELECT id, credentials FROM accounts WHERE platform = ? AND platform_account_id = ?")
      .get(input.platform, input.platformAccountId) as { id: number; credentials: string | null } | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE accounts SET handle = ?, display_name = ?, credentials = coalesce(?, credentials), updated_at = ? WHERE id = ?`
        )
        .run(input.handle ?? null, input.displayName ?? null, creds, now, existing.id);
      return existing.id;
    }
    const r = this.db
      .prepare(
        `INSERT INTO accounts (platform, platform_account_id, handle, display_name, credentials, connected_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(input.platform, input.platformAccountId, input.handle ?? null, input.displayName ?? null, creds, now, now);
    return Number(r.lastInsertRowid);
  }

  getCredentials(accountId: number): StoredCredentials | null {
    const row = this.db.prepare("SELECT credentials FROM accounts WHERE id = ?").get(accountId) as
      | { credentials: string | null }
      | undefined;
    if (!row?.credentials) return null;
    return JSON.parse(this.box.decrypt(row.credentials)) as StoredCredentials;
  }

  setCredentials(accountId: number, creds: StoredCredentials): void {
    this.db
      .prepare("UPDATE accounts SET credentials = ?, updated_at = ? WHERE id = ?")
      .run(this.box.encrypt(JSON.stringify(creds)), new Date().toISOString(), accountId);
  }

  listAccounts(): Array<{
    id: number;
    platform: Platform;
    platformAccountId: string;
    handle: string | null;
    displayName: string | null;
    connectedAt: string;
  }> {
    return this.db
      .prepare(
        "SELECT id, platform, platform_account_id AS platformAccountId, handle, display_name AS displayName, connected_at AS connectedAt FROM accounts ORDER BY platform"
      )
      .all() as never;
  }

  findAccount(platform: Platform): { id: number; platformAccountId: string; handle: string | null } | undefined {
    return this.db
      .prepare("SELECT id, platform_account_id AS platformAccountId, handle FROM accounts WHERE platform = ? LIMIT 1")
      .get(platform) as never;
  }

  status(): AccountStatus[] {
    const out: AccountStatus[] = [];
    for (const a of this.listAccounts()) {
      const creds = this.getCredentials(a.id);
      const expired = creds?.expiresAt ? new Date(creds.expiresAt) < new Date() : false;
      out.push({
        platform: a.platform,
        handle: a.handle ?? undefined,
        connectedAt: a.connectedAt,
        tokenExpiresAt: creds?.expiresAt,
        ok: !!creds && !expired,
        issue: !creds ? "no credentials" : expired ? "token expired (re-connect or refresh)" : undefined,
      });
    }
    return out;
  }

  // ---------- snapshot ingestion ----------

  /** Persist a normalized snapshot. Returns snapshot id + row counts. */
  storeSnapshot(accountId: number, snap: NormalizedSnapshot, source: string): {
    snapshotId: number;
    videos: number;
    daily: number;
    audience: number;
  } {
    const tx = this.db.exec("BEGIN");
    try {
      const kind = source.startsWith("csv:") ? "csv" : "api";
      const s = this.db
        .prepare("INSERT INTO snapshots (account_id, taken_at, kind, source) VALUES (?, ?, ?, ?)")
        .run(accountId, snap.takenAt, kind, source);
      const snapshotId = Number(s.lastInsertRowid);

      const insLifetime = this.db.prepare(
        "INSERT OR REPLACE INTO account_metrics (snapshot_id, date, metric, value) VALUES (?, NULL, ?, ?)"
      );
      for (const m of snap.lifetime) insLifetime.run(snapshotId, m.metric, m.value);

      const insDaily = this.db.prepare(
        "INSERT OR REPLACE INTO account_metrics (snapshot_id, date, metric, value) VALUES (?, ?, ?, ?)"
      );
      for (const m of snap.daily) insDaily.run(snapshotId, m.date, m.metric, m.value);

      const upsertVideo = this.db.prepare(
        `INSERT INTO videos (account_id, platform, platform_video_id, title, url, published_at, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, platform_video_id) DO UPDATE SET
           title = excluded.title, url = excluded.url, published_at = excluded.published_at, kind = excluded.kind`
      );
      const insVm = this.db.prepare(
        `INSERT OR REPLACE INTO video_metrics
         (snapshot_id, video_id, captured_at, views, likes, comments, shares, saves, reach,
          avg_watch_seconds, watch_time_minutes, retention_json, traffic_json, extra_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const v of snap.videos) {
        upsertVideo.run(
          accountId, v.platform, v.platformVideoId, v.title, v.url ?? null,
          v.publishedAt ?? null, v.kind ?? null
        );
        // NOTE: node:sqlite lastInsertRowid is unreliable after upsert-update —
        // always resolve the id deterministically.
        const row = this.db
          .prepare("SELECT id FROM videos WHERE account_id = ? AND platform_video_id = ?")
          .get(accountId, v.platformVideoId) as { id: number };
        const videoId = row.id;
        const m = v.metrics;
        insVm.run(
          snapshotId, videoId, snap.takenAt,
          m.views ?? null, m.likes ?? null, m.comments ?? null, m.shares ?? null, m.saves ?? null,
          m.reach ?? null, m.avgWatchSeconds ?? null, m.watchTimeMinutes ?? null,
          m.retention ? JSON.stringify(m.retention) : null,
          m.trafficSources ? JSON.stringify(m.trafficSources) : null,
          v.extras ? JSON.stringify(v.extras) : null
        );
      }

      const insAud = this.db.prepare(
        "INSERT OR REPLACE INTO audience (snapshot_id, dimension, key, value) VALUES (?, ?, ?, ?)"
      );
      for (const a of snap.audience) insAud.run(snapshotId, a.dimension, a.key, a.value);

      this.db.exec("COMMIT");
      return { snapshotId, videos: snap.videos.length, daily: snap.daily.length, audience: snap.audience.length };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      void tx;
    }
  }

  recordCsvImport(filename: string, kind: string, rows: number): void {
    this.db
      .prepare("INSERT INTO csv_imports (filename, kind, imported_at, rows) VALUES (?, ?, ?, ?)")
      .run(filename, kind, new Date().toISOString(), rows);
  }

  metaGet(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  metaSet(key: string, value: string): void {
    this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  }

  /** First snapshot date — used to tell users how much history the vault holds. */
  firstSnapshotDate(): string | undefined {
    const row = this.db.prepare("SELECT min(taken_at) AS d FROM snapshots").get() as { d: string | null };
    return row?.d ?? undefined;
  }

  today(): string {
    return isoDate();
  }
}

export function openVault(dataDir?: string): Vault {
  return new Vault(dataDir);
}
