import { NextResponse } from "next/server";
import { getAssetDetail, updateAsset, deleteAsset, getAsset, setAssetComponents } from "@/lib/assets";
import { ASSET_STATUS_LABELS, ASSET_TYPE_LABELS, type AssetStatus, type AssetType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const detail = getAssetDetail(Number(id));
  if (!detail) return NextResponse.json({ error: "资产不存在" }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * 更新资产。这也是外部生产工程的对接契约：关键节点回调
 *   PATCH /api/assets/:id {status?, stage_detail?, artifact_url?, trial_url?, notes?, actor: "pipeline"}
 * 即可在看板上推进状态；工程内部流程怎么变都不影响这里。
 * ⚠ 验收权限约束：actor=pipeline 只能推进到 testing 为止，
 *   「已验收」只能由人（在本平台或经产品端验收按钮）触发。
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    type?: AssetType;
    name?: string;
    role?: string;
    status?: AssetStatus;
    stage_detail?: string;
    artifact_url?: string;
    trial_url?: string;
    structure?: string;
    component_ids?: number[];
    notes?: string;
    actor?: "human" | "pipeline";
  };
  if (body.status && !(body.status in ASSET_STATUS_LABELS)) {
    return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
  }
  if (body.type && !(body.type in ASSET_TYPE_LABELS)) {
    return NextResponse.json({ error: "无效的资产类型" }, { status: 400 });
  }
  if (body.actor === "pipeline" && body.status === "accepted") {
    return NextResponse.json(
      { error: "生产工程不能自行验收：accepted 状态只能由人工触发（工程最多推进到 testing）" },
      { status: 403 }
    );
  }
  try {
    const asset = updateAsset(
      Number(id),
      {
        type: body.type,
        name: body.name,
        role: body.role,
        status: body.status,
        stage_detail: body.stage_detail,
        artifact_url: body.artifact_url,
        trial_url: body.trial_url,
        structure: body.structure,
        notes: body.notes,
      },
      body.actor === "pipeline" ? "pipeline" : "human"
    );
    if (!asset) return NextResponse.json({ error: "资产不存在" }, { status: 404 });
    if (Array.isArray(body.component_ids)) {
      setAssetComponents(asset.id, body.component_ids, body.actor === "pipeline" ? "pipeline" : "human");
    }
    return NextResponse.json({ asset });
  } catch {
    // (type, name) 唯一索引冲突：目标类型下已有同名资产
    return NextResponse.json({ error: "目标类型下已有同名资产，请先归并或改名" }, { status: 409 });
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!getAsset(Number(id))) {
    return NextResponse.json({ error: "资产不存在" }, { status: 404 });
  }
  deleteAsset(Number(id));
  return NextResponse.json({ ok: true });
}
