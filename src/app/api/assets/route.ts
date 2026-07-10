import { NextResponse } from "next/server";
import { listAssets, syncAssetsFromCards, createAsset } from "@/lib/assets";
import { ASSET_TYPE_LABELS, type AssetType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ assets: listAssets() });
}

/**
 * 三种用法：
 * - {sync: true} 从已深析卡片同步**雷达预估**的资源需求（零 AI 调用，proposed 状态）
 * - {type, name, role?, notes?} 登记一项资源资产（knowledge、mcp 等）
 * - {type: "agent", name, structure?, component_ids?, card_ids?, trial_url?, actor: "pipeline"}
 *   生产工程回传 AI 员工：内部结构 + 组成资源 + 绑定服务的需求卡（卡片工单推到"生产中"）
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    sync?: boolean;
    type?: AssetType;
    name?: string;
    role?: string;
    notes?: string;
    structure?: string;
    trial_url?: string;
    artifact_url?: string;
    component_ids?: number[];
    card_ids?: number[];
    actor?: "human" | "pipeline";
  };
  if (body.sync) {
    const result = syncAssetsFromCards();
    return NextResponse.json(result);
  }
  if (!body.type || !(body.type in ASSET_TYPE_LABELS) || !body.name?.trim()) {
    return NextResponse.json({ error: "需要 type 和 name" }, { status: 400 });
  }
  try {
    const asset = createAsset(
      {
        type: body.type,
        name: body.name,
        role: body.role,
        notes: body.notes,
        structure: body.structure,
        trial_url: body.trial_url,
        artifact_url: body.artifact_url,
        component_ids: body.component_ids,
        card_ids: body.card_ids,
      },
      body.actor === "pipeline" ? "pipeline" : "human"
    );
    return NextResponse.json({ asset }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "创建失败（可能与已有资产重名）" }, { status: 409 });
  }
}
