import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const CARD_COLS = [
  "id",
  "source_type",
  "source_url",
  "raw_content",
  "content_hash",
  "title",
  "summary",
  "category",
  "screening_verdict",
  "screening_reason",
  "priority",
  "priority_score",
  "deep_analysis",
  "status",
  "human_touched",
  "created_at",
  "updated_at",
  "demand_type",
];
const LOG_COLS = ["id", "card_id", "ts", "actor", "action", "detail"];
const RUN_COLS = ["id", "trigger_type", "status", "started_at", "finished_at", "summary", "error"];

type Row = Record<string, unknown>;

/** 全量导入（覆盖式恢复备份），受访问密码保护 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    version?: number;
    cards?: Row[];
    card_logs?: Row[];
    runs?: Row[];
    settings?: Row[];
    ai_usage?: Row[];
  } | null;

  if (!body || body.version !== 1 || !Array.isArray(body.cards)) {
    return NextResponse.json({ error: "无效的备份文件" }, { status: 400 });
  }

  const db = getDb();
  const insert = (table: string, cols: string[], rows: Row[]) => {
    const stmt = db.prepare(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`
    );
    for (const row of rows) {
      stmt.run(...cols.map((c) => (row[c] === undefined ? null : row[c])));
    }
  };

  const tx = db.transaction(() => {
    for (const table of ["cards", "card_logs", "runs", "settings", "ai_usage"]) {
      db.exec(`DELETE FROM ${table}`);
    }
    insert("cards", CARD_COLS, body.cards ?? []);
    insert("card_logs", LOG_COLS, body.card_logs ?? []);
    insert("runs", RUN_COLS, body.runs ?? []);
    insert("settings", ["key", "value"], body.settings ?? []);
    insert("ai_usage", ["day", "calls"], body.ai_usage ?? []);
  });
  tx();

  return NextResponse.json({
    imported: {
      cards: body.cards?.length ?? 0,
      card_logs: body.card_logs?.length ?? 0,
      runs: body.runs?.length ?? 0,
    },
  });
}
