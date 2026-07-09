import { NextResponse } from "next/server";
import { createScene, listScenesWithStats, countUnassignedCards } from "@/lib/scenes";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    scenes: listScenesWithStats(),
    unassigned: countUnassignedCards(),
  });
}

/** 新建场景：AI 生成蓝图建档（不触发探索） */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    description?: string;
    focus?: string;
  };
  const description = body.description?.trim();
  if (!description || description.length < 4) {
    return NextResponse.json({ error: "请描述一下目标场景（至少几个字）" }, { status: 400 });
  }
  try {
    const scene = await createScene(description, body.focus);
    return NextResponse.json({ scene }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "蓝图生成失败" },
      { status: 500 }
    );
  }
}
