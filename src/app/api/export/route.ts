import { NextResponse } from "next/server";
import { getDb, now } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 全量导出（备份 / 迁移用），受访问密码保护 */
export async function GET() {
  const db = getDb();
  return NextResponse.json({
    version: 1,
    exported_at: now(),
    cards: db.prepare("SELECT * FROM cards").all(),
    scenes: db.prepare("SELECT * FROM scenes").all(),
    card_logs: db.prepare("SELECT * FROM card_logs").all(),
    runs: db.prepare("SELECT * FROM runs").all(),
    settings: db.prepare("SELECT * FROM settings").all(),
    ai_usage: db.prepare("SELECT * FROM ai_usage").all(),
  });
}
