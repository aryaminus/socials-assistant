/** Vault schema — mirrored for Cloudflare D1 in infra/worker/schema.sql */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  handle TEXT,
  display_name TEXT,
  credentials TEXT,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, platform_account_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  taken_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'api',
  source TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_account ON snapshots(account_id, taken_at);

CREATE TABLE IF NOT EXISTS account_metrics (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  date TEXT,
  metric TEXT NOT NULL,
  value REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_am_unique ON account_metrics(snapshot_id, ifnull(date,''), metric);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_video_id TEXT NOT NULL,
  title TEXT,
  url TEXT,
  published_at TEXT,
  kind TEXT,
  UNIQUE(account_id, platform_video_id)
);

CREATE TABLE IF NOT EXISTS video_metrics (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,
  views REAL, likes REAL, comments REAL, shares REAL, saves REAL,
  reach REAL, avg_watch_seconds REAL, watch_time_minutes REAL,
  retention_json TEXT, traffic_json TEXT, extra_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vm_unique ON video_metrics(snapshot_id, video_id);

CREATE TABLE IF NOT EXISTS audience (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  key TEXT NOT NULL,
  value REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aud_unique ON audience(snapshot_id, dimension, key);

CREATE TABLE IF NOT EXISTS csv_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  kind TEXT,
  imported_at TEXT NOT NULL,
  rows INTEGER
);

CREATE TABLE IF NOT EXISTS outreach_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'drafted',
  subject TEXT,
  drafted_at TEXT,
  sent_at TEXT,
  notes TEXT,
  thread_ref TEXT
);

CREATE TABLE IF NOT EXISTS content_pipeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  platform TEXT,
  brand TEXT,
  outreach_id INTEGER REFERENCES outreach_log(id),
  stage TEXT NOT NULL DEFAULT 'idea',      -- idea | scripting | script_review | brand_review | approved | posted | measured | on_hold | dropped
  due_date TEXT,
  script_path TEXT,
  post_url TEXT,
  posted_at TEXT,
  brief TEXT,                               -- what this deliverable is, requirements
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;
