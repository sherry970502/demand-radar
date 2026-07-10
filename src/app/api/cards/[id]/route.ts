import { NextResponse } from "next/server";
import { getDb, now, addCardLog } from "@/lib/db";
import { updateAsset, bindAgentToCard, getAsset } from "@/lib/assets";
import {
  STATUS_LABELS,
  WORK_STATUS_LABELS,
  type Card,
  type CardStatus,
  type WorkStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_STATUS: CardStatus[] = [
  "pending_screening",
  "screened",
  "analyzing",
  "analyzed",
  "archived",
  "adopted",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(Number(id)) as
    | Card
    | undefined;
  if (!card) {
    return NextResponse.json({ error: "卡片不存在" }, { status: 404 });
  }
  const logs = db
    .prepare("SELECT * FROM card_logs WHERE card_id = ? ORDER BY ts ASC, id ASC")
    .all(Number(id));
  const sceneName = card.scene_id
    ? (db.prepare("SELECT name FROM scenes WHERE id = ?").get(card.scene_id) as { name: string } | undefined)?.name ?? null
    : null;
  const agent = card.agent_asset_id
    ? (db
        .prepare("SELECT id, name, status, trial_url, stage_detail FROM assets WHERE id = ?")
        .get(card.agent_asset_id) ?? null)
    : null;
  return NextResponse.json({ card, logs, sceneName, agent });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cardId = Number(id);
  const db = getDb();
  const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId) as
    | Card
    | undefined;
  if (!card) {
    return NextResponse.json({ error: "卡片不存在" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    priority?: string;
    screening_verdict?: string;
    status?: string;
    demand_type?: string;
    /** 生产工单流转：dispatched(派发)/producing/pending_signoff 可由工程回报；signed_off 仅人工 */
    work_status?: WorkStatus | "";
    /** 工程回传：绑定交付该卡的 AI 员工 */
    agent_asset_id?: number;
    actor?: "human" | "pipeline";
  };
  const isPipeline = body.actor === "pipeline";

  const updates: string[] = [];
  const values: unknown[] = [];

  let agentBound = false;
  if (body.agent_asset_id !== undefined) {
    if (!getAsset(body.agent_asset_id) || getAsset(body.agent_asset_id)!.type !== "agent") {
      return NextResponse.json({ error: "agent_asset_id 不是有效的 AI 员工资产" }, { status: 400 });
    }
    bindAgentToCard(body.agent_asset_id, cardId, isPipeline ? "pipeline" : "human");
    agentBound = true;
  }

  if (body.work_status !== undefined && body.work_status !== "") {
    if (!(body.work_status in WORK_STATUS_LABELS)) {
      return NextResponse.json({ error: "无效的工单状态" }, { status: 400 });
    }
    if (isPipeline && body.work_status === "signed_off") {
      return NextResponse.json(
        { error: "生产工程不能自行签收：signed_off 只能由人工触发（工程最多推到待签收）" },
        { status: 403 }
      );
    }
    updates.push("work_status = ?");
    values.push(body.work_status);
    addCardLog(
      cardId,
      isPipeline ? "system" : "human",
      "work_status_changed",
      `工单：${card.work_status ? WORK_STATUS_LABELS[card.work_status] : "未派发"} → ${WORK_STATUS_LABELS[body.work_status]}`
    );
    // 人工签收 → 绑定的 AI 员工同步转为已签收（accepted）
    if (!isPipeline && body.work_status === "signed_off" && card.agent_asset_id) {
      updateAsset(card.agent_asset_id, { status: "accepted" }, "human");
    }
  }

  if (body.priority && ["P0", "P1", "P2"].includes(body.priority)) {
    updates.push("priority = ?");
    values.push(body.priority);
    addCardLog(cardId, "human", "priority_changed", `优先级：${card.priority ?? "无"} → ${body.priority}`);
  }
  if (
    body.screening_verdict &&
    ["worth", "not_worth", "uncertain"].includes(body.screening_verdict)
  ) {
    updates.push("screening_verdict = ?");
    values.push(body.screening_verdict);
    addCardLog(
      cardId,
      "human",
      "verdict_changed",
      `初筛结论：${card.screening_verdict ?? "无"} → ${body.screening_verdict}`
    );
  }
  if (body.demand_type && ["existing", "created"].includes(body.demand_type)) {
    updates.push("demand_type = ?");
    values.push(body.demand_type);
    addCardLog(
      cardId,
      "human",
      "demand_type_changed",
      `需求类型：${card.demand_type ?? "无"} → ${body.demand_type}`
    );
  }
  if (body.status && VALID_STATUS.includes(body.status as CardStatus)) {
    updates.push("status = ?");
    values.push(body.status);
    addCardLog(
      cardId,
      "human",
      "status_changed",
      `状态：${STATUS_LABELS[card.status]} → ${STATUS_LABELS[body.status as CardStatus]}`
    );
  }

  if (updates.length === 0) {
    if (agentBound) {
      const updated = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId);
      return NextResponse.json({ card: updated });
    }
    return NextResponse.json({ error: "没有可应用的修改" }, { status: 400 });
  }

  if (isPipeline) updates.push("updated_at = ?");
  else updates.push("human_touched = 1", "updated_at = ?");
  values.push(now(), cardId);
  db.prepare(`UPDATE cards SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId);
  return NextResponse.json({ card: updated });
}
