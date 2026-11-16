import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  genre TEXT NOT NULL,
  audience TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  source TEXT NOT NULL DEFAULT 'manual',
  is_authentic INTEGER NOT NULL DEFAULT 1,
  consent INTEGER NOT NULL DEFAULT 0,
  pii_redacted INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL UNIQUE,
  char_count INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  embedding BLOB,
  embedding_model TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_samples_created ON samples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_genre ON samples(genre);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  sample_count INTEGER NOT NULL,
  stats TEXT NOT NULL,
  brief TEXT NOT NULL,
  card TEXT,
  model TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rewrites (
  id TEXT PRIMARY KEY,
  draft TEXT NOT NULL,
  output TEXT NOT NULL DEFAULT '',
  edited TEXT,
  genre TEXT NOT NULL,
  audience TEXT NOT NULL,
  tone TEXT,
  length_mode TEXT NOT NULL,
  intent TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  connection TEXT,
  profile_id TEXT,
  example_ids TEXT NOT NULL DEFAULT '[]',
  checks TEXT,
  rating INTEGER,
  feedback TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rewrites_created ON rewrites(created_at DESC);

CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  draft TEXT NOT NULL,
  genre TEXT NOT NULL,
  audience TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  model TEXT,
  output TEXT NOT NULL DEFAULT '',
  checks TEXT,
  manual_rating INTEGER,
  status TEXT NOT NULL,
  error TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(case_id) REFERENCES eval_cases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eval_runs_case ON eval_runs(case_id, created_at DESC);
`;

const globalForDb = globalThis as typeof globalThis & {
  __mayaDb?: Database.Database;
};

export function getDbPath(): string {
  return (
    process.env.MAYA_DB_PATH?.trim() ||
    path.join(process.cwd(), "data", "maya.db")
  );
}

function migrate(db: Database.Database): void {
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version < 1) {
    db.exec(SCHEMA);
    db.pragma("user_version = 1");
  }
}

export function getDb(): Database.Database {
  if (globalForDb.__mayaDb) return globalForDb.__mayaDb;

  const file = getDbPath();
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);

  globalForDb.__mayaDb = db;
  return db;
}

export function resetDatabase(): void {
  const db = getDb();
  db.transaction(() => {
    db.exec(`
      DELETE FROM eval_runs;
      DELETE FROM eval_cases;
      DELETE FROM rewrites;
      DELETE FROM profiles;
      DELETE FROM samples;
      DELETE FROM settings;
    `);
  })();
}

export function closeDb(): void {
  if (!globalForDb.__mayaDb) return;
  globalForDb.__mayaDb.close();
  delete globalForDb.__mayaDb;
}
