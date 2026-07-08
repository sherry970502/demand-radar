import { NextResponse } from "next/server";
import { exploreScene } from "@/lib/explore";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { scene?: string };
  const scene = body.scene?.trim();
  if (!scene || scene.length < 4) {
    return NextResponse.json({ error: "请描述一下目标场景（至少几个字）" }, { status: 400 });
  }
  void exploreScene(scene).catch((e) =>
    console.error("[explore] 探索失败：", e)
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
