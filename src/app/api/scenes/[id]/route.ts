import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getScene, updateScene, deleteScene, parseBlueprint } from "@/lib/scenes";
import type { Card, SceneBlueprint } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 场景详情：蓝图 + 挂载的全部卡片 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const scene = getScene(Number(id));
  if (!scene) {
    return NextResponse.json({ error: "场景不存在" }, { status: 404 });
  }
  const cards = getDb()
    .prepare(
      `SELECT id, source_type, source_url, title, summary, category, demand_type,
              delivery_mode, skill_name, screening_verdict, screening_reason,
              priority, priority_score, status, human_touched, scene_id, stage, persona,
              created_at, updated_at, substr(raw_content, 1, 140) AS snippet
       FROM cards WHERE scene_id = ?
       ORDER BY priority_score DESC NULLS LAST, created_at DESC`
    )
    .all(scene.id) as Partial<Card>[];
  return NextResponse.json({
    scene: { ...scene, blueprint: parseBlueprint(scene.blueprint) },
    cards,
  });
}

/** 修订蓝图 / 场景信息 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    blueprint?: SceneBlueprint;
    stageRenames?: Record<string, string>;
  };
  if (body.blueprint && (!Array.isArray(body.blueprint.stages) || body.blueprint.stages.length === 0)) {
    return NextResponse.json({ error: "蓝图至少要有一个环节" }, { status: 400 });
  }
  const scene = updateScene(Number(id), body);
  if (!scene) {
    return NextResponse.json({ error: "场景不存在" }, { status: 404 });
  }
  return NextResponse.json({ scene: { ...scene, blueprint: parseBlueprint(scene.blueprint) } });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!getScene(Number(id))) {
    return NextResponse.json({ error: "场景不存在" }, { status: 404 });
  }
  deleteScene(Number(id));
  return NextResponse.json({ ok: true });
}
