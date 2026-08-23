/** D1-backed, per-user vault for the cloud worker. Mirrors packages/vault schema. */
import { SCHEMA_SQL } from "./schema.ts";

export interface D1Vault {
  userKey: string;
  status(): Promise<unknown>;
  upsertAccount(platform: string, platformAccountId: string, handle: string | undefined, credentials: Record<string, string>): Promise<unknown>;
  getCredentials(accountRowId: number): Promise<Record<string, string> | null>;
  setCredentials(accountRowId: number, credentials: Record<string, string>): Promise<void>;
  listAccounts(): Promise<Array<{ id: number; platform: string; platform_account_id: string; handle: string | null }>>;
  storeSnapshot(accountRowId: number, snap: CloudSnapshot, source: string): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  boundQuery(sql: string, params: unknown[]): Promise<unknown>;
  outreachAdd(a: { brand: string; contact_email?: string; subject?: string; notes?: string }): Promise<unknown>;
  outreachList(status?: string): Promise<unknown>;
  outreachUpdate(id: number, patch: { status?: string; notes?: string; thread_ref?: string }): Promise<unknown>;
  getProfile(): Promise<Record<string, unknown>>;
  setProfile(patch: Record<string, unknown>): Promise<unknown>;
  pipelineAdd(a: { title: string; platform?: string; brand?: string; outreach_id?: number; stage?: string; due_date?: string; script_path?: string; brief?: string; notes?: string }): Promise<unknown>;
  pipelineList(stage?: string): Promise<unknown>;
  pipelineUpdate(id: number, patch: Record<string, unknown>): Promise<unknown>;
}

export interface CloudSnapshot {
  platform: string;
  handle?: string;
  takenAt: string;
  lifetime: Array<{ metric: string; value: number }>;
  daily: Array<{ date: string; metric: string; value: number }>;
  videos: Array<{
    platformVideoId: string;
    title: string;
    url?: string;
    publishedAt?: string;
    kind?: string;
    metrics: Record<string, number | undefined>;
    extras?: Record<string, unknown>;
  }>;
  audience: Array<{ dimension: string; key: string; value: number }>;
  warnings: string[];
}

export function initVault(db: D1Database, userKey: string, tokenKey?: string): D1Vault {
  const scoped = (sql: string) => sql; // SQL below scopes by user_key parameters

  const vault: D1Vault = {
    userKey,
    async status() {
      const rows = await vault.boundQuery(
        `SELECT a.platform AS platform, a.handle AS handle, a.connected_at AS connectedAt,
                (SELECT json_extract(credentials_json, '$.expiresAt') FROM credentials c WHERE c.account_id = a.id AND c.user_key = a.user_key ORDER BY c.rowid DESC LIMIT 1) AS tokenExpiresAt
         FROM accounts a WHERE a.user_key = ?`,
        [userKey]
      );
      return rows;
    },
    async upsertAccount(platform, platformAccountId, handle, credentials) {
      const r = await db
        .prepare(
          `INSERT INTO accounts (user_key, platform, platform_account_id, handle, connected_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(user_key, platform, platform_account_id) DO UPDATE SET handle = excluded.handle, updated_at = datetime('now')`
        )
        .bind(userKey, platform, platformAccountId, handle ?? null)
        .run();
      void r;
      const row = await db
        .prepare(`SELECT id FROM accounts WHERE user_key = ? AND platform = ? AND platform_account_id = ?`)
        .bind(userKey, platform, platformAccountId)
        .first<{ id: number }>();
      if (!row) throw new Error("account upsert failed");
      await vault.setCredentials(row.id, credentials);
      return { id: row.id, platform, handle };
    },
    async getCredentials(accountRowId) {
      if (!tokenKey) throw new Error("TOKEN_ENCRYPTION_KEY is required for decryption");
      const row = await db
        .prepare(`SELECT credentials_json FROM credentials WHERE account_id = ? AND user_key = ? ORDER BY rowid DESC LIMIT 1`)
        .bind(accountRowId, userKey)
        .first<{ credentials_json: string }>();
      return row ? (JSON.parse(await decrypt(tokenKey, row.credentials_json)) as Record<string, string>) : null;
    },
    async setCredentials(accountRowId, credentials) {
      if (!tokenKey) throw new Error("TOKEN_ENCRYPTION_KEY is required for encryption");
      const enc = await encrypt(tokenKey, JSON.stringify(credentials));
      await db
        .prepare(`INSERT INTO credentials (account_id, user_key, credentials_json, updated_at) VALUES (?, ?, ?, datetime('now'))`)
        .bind(accountRowId, userKey, enc)
        .run();
    },
    async listAccounts() {
      return (
        await db
          .prepare(`SELECT id, platform, platform_account_id, handle FROM accounts WHERE user_key = ? ORDER BY platform`)
          .bind(userKey)
          .all<Array<{ id: number; platform: string; platform_account_id: string; handle: string | null }>>()
      ).results;
    },
    async storeSnapshot(accountRowId, snap, source) {
      const s = await db
        .prepare(`INSERT INTO snapshots (account_id, user_key, taken_at, kind, source) VALUES (?, ?, ?, 'api', ?)`)
        .bind(accountRowId, userKey, snap.takenAt, source)
        .run();
      const snapshotId = s.meta.last_row_id;
      const stmts: D1PreparedStatement[] = [];
      for (const m of snap.lifetime) {
        stmts.push(db.prepare(`INSERT OR REPLACE INTO account_metrics (snapshot_id, date, metric, value) VALUES (?, NULL, ?, ?)`).bind(snapshotId, m.metric, m.value));
      }
      for (const m of snap.daily) {
        stmts.push(db.prepare(`INSERT OR REPLACE INTO account_metrics (snapshot_id, date, metric, value) VALUES (?, ?, ?, ?)`).bind(snapshotId, m.date, m.metric, m.value));
      }
      for (const v of snap.videos) {
        const vr = await db
          .prepare(
            `INSERT INTO videos (account_id, user_key, platform, platform_video_id, title, url, published_at, kind)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(account_id, platform_video_id) DO UPDATE SET title = excluded.title, url = excluded.url, published_at = excluded.published_at, kind = excluded.kind`
          )
          .bind(accountRowId, userKey, snap.platform, v.platformVideoId, v.title, v.url ?? null, v.publishedAt ?? null, v.kind ?? null)
          .run();
        let videoId = vr.meta.last_row_id;
        if (!videoId) {
          const found = await db
            .prepare(`SELECT id FROM videos WHERE account_id = ? AND platform_video_id = ?`)
            .bind(accountRowId, v.platformVideoId)
            .first<{ id: number }>();
          videoId = found?.id ?? 0;
        }
        const m = v.metrics;
        stmts.push(
          db
            .prepare(
              `INSERT OR REPLACE INTO video_metrics (snapshot_id, video_id, captured_at, views, likes, comments, shares, saves, reach, avg_watch_seconds, watch_time_minutes, extra_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(snapshotId, videoId, snap.takenAt, m.views ?? null, m.likes ?? null, m.comments ?? null, m.shares ?? null, m.saves ?? null, m.reach ?? null, m.avgWatchSeconds ?? null, m.watchTimeMinutes ?? null, v.extras ? JSON.stringify(v.extras) : null)
        );
      }
      for (const a of snap.audience) {
        stmts.push(db.prepare(`INSERT OR REPLACE INTO audience (snapshot_id, dimension, key, value) VALUES (?, ?, ?, ?)`).bind(snapshotId, a.dimension, a.key, a.value));
      }
      if (stmts.length) await db.batch(stmts);
      return { snapshotId, videos: snap.videos.length, daily: snap.daily.length, audience: snap.audience.length };
    },
    async query(sql) {
      const t = sql.trim().toLowerCase();
      if (!t.startsWith("select") || /\b(insert|update|delete|drop|alter|create|pragma)\b/.test(t)) {
        throw new Error("read-only SELECT only");
      }
      return (await db.prepare(sql).all()).results;
    },
    async boundQuery(sql, params) {
      return (await db.prepare(sql).bind(...params).all()).results;
    },
    async outreachAdd(a) {
      const r = await db
        .prepare(`INSERT INTO outreach_log (user_key, brand, contact_email, subject, drafted_at, notes, status) VALUES (?, ?, ?, ?, ?, ?, 'drafted')`)
        .bind(userKey, a.brand, a.contact_email ?? null, a.subject ?? null, new Date().toISOString(), a.notes ?? null)
        .run();
      return { id: r.meta.last_row_id, status: "drafted" };
    },
    async outreachList(status) {
      const stmt = status
        ? db.prepare(`SELECT * FROM outreach_log WHERE user_key = ? AND status = ? ORDER BY drafted_at DESC`).bind(userKey, status)
        : db.prepare(`SELECT * FROM outreach_log WHERE user_key = ? ORDER BY drafted_at DESC`).bind(userKey);
      return (await stmt.all()).results;
    },
    async outreachUpdate(id, patch) {
      const cur = await db.prepare(`SELECT id FROM outreach_log WHERE id = ? AND user_key = ?`).bind(id, userKey).first<{ id: number }>();
      if (!cur) return { error: "not_found", id };
      await db
        .prepare(
          `UPDATE outreach_log SET
             status = coalesce(?, status),
             notes = coalesce(?, notes),
             thread_ref = coalesce(?, thread_ref),
             sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
           WHERE id = ? AND user_key = ?`
        )
        .bind(patch.status ?? null, patch.notes ?? null, patch.thread_ref ?? null, patch.status ?? "", new Date().toISOString(), id, userKey)
        .run();
      return { id, updated: true };
    },
    async getProfile() {
      const row = await db.prepare(`SELECT value FROM meta WHERE key = ?`).bind(`profile:${userKey}`).first<{ value: string }>();
      return row ? JSON.parse(row.value) : {};
    },
    async setProfile(patch) {
      const existing = await vault.getProfile();
      const merged = { ...existing, ...patch, updated_at: new Date().toISOString() };
      await db
        .prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(`profile:${userKey}`, JSON.stringify(merged))
        .run();
      return merged;
    },
    async pipelineAdd(a) {
      const now = new Date().toISOString();
      const r = await db
        .prepare(
          `INSERT INTO content_pipeline (user_key, title, platform, brand, outreach_id, stage, due_date, script_path, brief, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(userKey, a.title, a.platform ?? null, a.brand ?? null, a.outreach_id ?? null, a.stage ?? "idea", a.due_date ?? null, a.script_path ?? null, a.brief ?? null, a.notes ?? null, now, now)
        .run();
      return { id: r.meta.last_row_id, stage: a.stage ?? "idea" };
    },
    async pipelineList(stage) {
      const stmt = stage
        ? db.prepare(`SELECT * FROM content_pipeline WHERE user_key = ? AND stage = ? ORDER BY due_date ASC NULLS LAST`).bind(userKey, stage)
        : db.prepare(`SELECT * FROM content_pipeline WHERE user_key = ? ORDER BY due_date ASC NULLS LAST`).bind(userKey);
      return (await stmt.all()).results;
    },
    async pipelineUpdate(id, patch) {
      const cur = await db.prepare(`SELECT id FROM content_pipeline WHERE id = ? AND user_key = ?`).bind(id, userKey).first<{ id: number }>();
      if (!cur) return null;
      const fields: string[] = [];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) {
          fields.push(`${k} = ?`);
          vals.push(v);
        }
      }
      if (fields.length === 0) return { id };
      fields.push(`updated_at = ?`);
      vals.push(new Date().toISOString());
      vals.push(id, userKey);
      await db.prepare(`UPDATE content_pipeline SET ${fields.join(", ")} WHERE id = ? AND user_key = ?`).bind(...vals).run();
      return (await db.prepare(`SELECT * FROM content_pipeline WHERE id = ? AND user_key = ?`).bind(id, userKey).first()) ?? { id };
    },
  };
  return vault;
}

// ---------- AES-GCM token encryption (WebCrypto) ----------

async function keyMaterial(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(secret: string, plaintext: string): Promise<string> {
  const key = await keyMaterial(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return btoa(String.fromCharCode(...iv)) + "." + btoa(String.fromCharCode(...new Uint8Array(ct)));
}

async function decrypt(secret: string, blob: string): Promise<string> {
  const key = await keyMaterial(secret);
  const [ivB64, ctB64] = blob.split(".");
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export { SCHEMA_SQL };
