import { NextResponse } from "next/server";
import { getDb, now, addCardLog } from "@/lib/db";
import { STATUS_LABELS, type Card, type CardStatus } from "@/lib/types";

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
  return NextResponse.json({ card, logs, sceneName });
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
  };

  const updates: string[] = [];
  const values: unknown[] = [];

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
    return NextResponse.json({ error: "没有可应用的修改" }, { status: 400 });
  }

  updates.push("human_touched = 1", "updated_at = ?");
  values.push(now(), cardId);
  db.prepare(`UPDATE cards SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId);
  return NextResponse.json({ card: updated });
}
