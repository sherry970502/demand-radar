import { NextResponse } from "next/server";
import { mergeAssetsWithAI } from "@/lib/assets";

/** AI 归并相似资产。⚠ 消耗 1 次 AI 调用，仅由用户在界面上手动触发 */
export async function POST() {
  try {
    const result = await mergeAssetsWithAI();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "归并失败" },
      { status: 500 }
    );
  }
}
