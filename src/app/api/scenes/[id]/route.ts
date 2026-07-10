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
      `SELECT c.id, c.source_type, c.source_url, c.title, c.summary, c.category, c.demand_type,
              c.screening_verdict, c.screening_reason,
              c.priority, c.priority_score, c.status, c.human_touched, c.scene_id, c.stage, c.persona,
              c.agent_asset_id, c.work_status, a.name AS agent_name,
              c.created_at, c.updated_at, substr(c.raw_content, 1, 140) AS snippet
       FROM cards c LEFT JOIN assets a ON a.id = c.agent_asset_id
       WHERE c.scene_id = ?
       ORDER BY c.priority_score DESC NULLS LAST, c.created_at DESC`
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
