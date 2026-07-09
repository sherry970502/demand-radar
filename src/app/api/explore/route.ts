import { NextResponse } from "next/server";
import { exploreScene } from "@/lib/explore";
import { getScene } from "@/lib/scenes";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    scene?: string;
    focus?: string;
    sceneId?: number;
  };
  const sceneId = typeof body.sceneId === "number" ? body.sceneId : undefined;
  const scene = body.scene?.trim();
  if (sceneId) {
    if (!getScene(sceneId)) {
      return NextResponse.json({ error: "场景不存在" }, { status: 404 });
    }
  } else if (!scene || scene.length < 4) {
    return NextResponse.json({ error: "请描述一下目标场景（至少几个字）" }, { status: 400 });
  }
  void exploreScene({ sceneId, scene, focus: body.focus }).catch((e) =>
    console.error("[explore] 探索失败：", e)
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
