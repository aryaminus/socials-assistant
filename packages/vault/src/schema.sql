CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  handle TEXT,
  display_name TEXT,
  credentials TEXT,               -- encrypted JSON blob (AES-256-GCM, base64)
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, platform_account_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  taken_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'api',   -- 'api' | 'csv'
  source TEXT                          -- connector name or csv filename
);

CREATE INDEX IF NOT EXISTS idx_snapshots_account ON snapshots(account_id, taken_at);

CREATE TABLE IF NOT EXISTS account_metrics (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  date TEXT,                          -- YYYY-MM-DD, or NULL for lifetime values
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
  status TEXT NOT NULL DEFAULT 'drafted',  -- drafted | sent | replied | rejected | closed
  subject TEXT,
  drafted_at TEXT,
  sent_at TEXT,
  notes TEXT,
  thread_ref TEXT
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
