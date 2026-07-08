import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getTodayAiCalls } from "@/lib/ai/client";
import { isPipelineRunning } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS n FROM cards GROUP BY status")
    .all() as { status: string; n: number }[];
  const statusCounts: Record<string, number> = {};
  for (const row of statusRows) statusCounts[row.status] = row.n;

  const dayStart = new Date().toISOString().slice(0, 10);
  const todayNew = (
    db.prepare("SELECT COUNT(*) AS n FROM cards WHERE created_at >= ?").get(dayStart) as {
      n: number;
    }
  ).n;

  const lastRun = db
    .prepare("SELECT * FROM runs WHERE status != 'running' ORDER BY id DESC LIMIT 1")
    .get();

  const settings = getSettings();

  return NextResponse.json({
    statusCounts,
    todayNew,
    lastRun: lastRun ?? null,
    running: isPipelineRunning(),
    aiCalls: getTodayAiCalls(),
    aiCallLimit: settings.daily_ai_call_limit,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  });
}
