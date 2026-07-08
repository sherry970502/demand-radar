import { NextResponse } from "next/server";
import { runPipeline, isPipelineRunning } from "@/lib/pipeline";

export async function POST() {
  if (isPipelineRunning()) {
    return NextResponse.json({ error: "已有一次运行在进行中" }, { status: 409 });
  }
  void runPipeline("manual").catch((e) =>
    console.error("[trigger] 手动运行失败：", e)
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
