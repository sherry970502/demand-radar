import { NextResponse } from "next/server";
import { backfillCards } from "@/lib/scenes";

/** AI 回填：把未归属场景的历史卡片归入已有场景蓝图（同步执行，卡片多时约 1 分钟） */
export async function POST() {
  try {
    const result = await backfillCards();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "回填失败" },
      { status: 500 }
    );
  }
}
