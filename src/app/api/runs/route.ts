import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isPipelineRunning } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = getDb()
    .prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 50")
    .all();
  return NextResponse.json({ runs, running: isPipelineRunning() });
}
