import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_url TEXT,
  raw_content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  category TEXT,
  screening_verdict TEXT,
  screening_reason TEXT,
  priority TEXT,
  priority_score INTEGER,
  deep_analysis TEXT,
  status TEXT NOT NULL DEFAULT 'pending_screening',
  human_touched INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_hash ON cards(content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_url ON cards(source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);

CREATE TABLE IF NOT EXISTS card_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_card_logs_card ON card_logs(card_id);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  blueprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  stage_detail TEXT,
  artifact_url TEXT,
  trial_url TEXT,
  structure TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_type_name ON assets(type, name);

CREATE TABLE IF NOT EXISTS asset_cards (
  asset_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  PRIMARY KEY (asset_id, card_id)
);

CREATE TABLE IF NOT EXISTS asset_components (
  agent_asset_id INTEGER NOT NULL,
  component_asset_id INTEGER NOT NULL,
  PRIMARY KEY (agent_asset_id, component_asset_id)
);

CREATE TABLE IF NOT EXISTS asset_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_asset_logs_asset ON asset_logs(asset_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0
);
`;

/** 数据目录：优先 DATA_DIR 环境变量（部署时对齐持久卷挂载路径），否则用 cwd/data */
export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

function createDb(): Database.Database {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "app.db"));
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** 轻量迁移：给已有库补新列 */
function migrate(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(cards)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  for (const col of ["demand_type", "delivery_mode", "skill_name", "capabilities"]) {
    if (!have.has(col)) {
      db.exec(`ALTER TABLE cards ADD COLUMN ${col} TEXT`);
    }
  }
  if (!have.has("scene_id")) {
    db.exec(`ALTER TABLE cards ADD COLUMN scene_id INTEGER`);
    db.exec(`ALTER TABLE cards ADD COLUMN stage TEXT`);
    db.exec(`ALTER TABLE cards ADD COLUMN persona TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cards_scene ON cards(scene_id)`);
  }
  const assetCols = db.prepare("PRAGMA table_info(assets)").all() as { name: string }[];
  if (assetCols.length > 0 && !assetCols.some((c) => c.name === "trial_url")) {
    db.exec(`ALTER TABLE assets ADD COLUMN trial_url TEXT`);
  }
  if (assetCols.length > 0 && !assetCols.some((c) => c.name === "structure")) {
    db.exec(`ALTER TABLE assets ADD COLUMN structure TEXT`);
  }
  if (!have.has("agent_asset_id")) {
    db.exec(`ALTER TABLE cards ADD COLUMN agent_asset_id INTEGER`);
    db.exec(`ALTER TABLE cards ADD COLUMN work_status TEXT`);
  }
}

// Survive Next.js dev-mode HMR: keep a single connection on globalThis.
const globalForDb = globalThis as unknown as { __adrDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb.__adrDb) {
    globalForDb.__adrDb = createDb();
  }
  return globalForDb.__adrDb;
}

export function now(): string {
  return new Date().toISOString();
}

export function addCardLog(
  cardId: number,
  actor: "ai" | "human" | "system",
  action: string,
  detail?: string
) {
  getDb()
    .prepare(
      "INSERT INTO card_logs (card_id, ts, actor, action, detail) VALUES (?, ?, ?, ?, ?)"
    )
    .run(cardId, now(), actor, action, detail ?? null);
}
