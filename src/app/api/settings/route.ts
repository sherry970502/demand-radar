import { NextResponse } from "next/server";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";
import { applySchedule } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    settings: getSettings(),
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  });
}

export async function PUT(request: Request) {
  const patch = (await request.json().catch(() => null)) as Partial<AppSettings> | null;
  if (!patch) {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }
  if (patch.daily_run_time && !/^\d{1,2}:\d{2}$/.test(patch.daily_run_time)) {
    return NextResponse.json({ error: "时间格式应为 HH:MM" }, { status: 400 });
  }
  saveSettings(patch);
  if (patch.daily_run_time) {
    applySchedule();
  }
  return NextResponse.json({ settings: getSettings() });
}
