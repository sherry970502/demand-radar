import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rescreenCard, reanalyzeCard } from "@/lib/pipeline";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cardId = Number(id);
  const exists = getDb().prepare("SELECT 1 FROM cards WHERE id = ?").get(cardId);
  if (!exists) {
    return NextResponse.json({ error: "卡片不存在" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { mode?: string };
  if (body.mode === "screen") {
    void rescreenCard(cardId).catch((e) =>
      console.error(`[rerun] 卡片 #${cardId} 重新初筛失败：`, e)
    );
  } else if (body.mode === "analyze") {
    void reanalyzeCard(cardId).catch((e) =>
      console.error(`[rerun] 卡片 #${cardId} 重新分析失败：`, e)
    );
  } else {
    return NextResponse.json({ error: "mode 必须是 screen 或 analyze" }, { status: 400 });
  }
  return NextResponse.json({ accepted: true }, { status: 202 });
}
