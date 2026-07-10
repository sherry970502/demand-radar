import { getDb, now, addCardLog } from "./db";
import { getSettings } from "./settings";
import {
  assertBudget,
  recordAiCall,
  streamWithServerTools,
  messageText,
} from "./ai/client";
import { ASSET_MERGE_SYSTEM, buildAssetMergeUser } from "./ai/prompts";
import {
  ASSET_STATUS_ORDER,
  type Asset,
  type AssetListItem,
  type AssetStatus,
  type AssetType,
} from "./types";

export function addAssetLog(
  assetId: number,
  actor: "ai" | "human" | "system" | "pipeline",
  action: string,
  detail?: string
) {
  getDb()
    .prepare(
      "INSERT INTO asset_logs (asset_id, ts, actor, action, detail) VALUES (?, ?, ?, ?, ?)"
    )
    .run(assetId, now(), actor, action, detail ?? null);
}

/** 拆解构件可汇入注册表的类型（"basic" 按规则不算构件，跳过；agent 只能由工程回传创建） */
const SYNCABLE_TYPES = new Set(["skill", "ai_service", "knowledge", "mcp", "service", "ai"]);

/**
 * 从已深析卡片的 capabilities 拆解中同步资源需求（纯代码，零 AI 调用）。
 * 同 (type, name) 归并为一项资产并累积关联卡片；幂等，可反复执行。
 *
 * ⚠ 定位（方案一分工）：深析拆解只是**雷达预估**（可行性草图），不代表生产结构。
 * 本函数不再由流水线自动调用，仅供界面手动触发；汇入的资产为 proposed 状态
 * （语义＝雷达预估，未经工程确认），工程拆解回传时确认、合并或删除。
 */
export function syncAssetsFromCards(): { created: number; linked: number } {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, capabilities FROM cards WHERE capabilities IS NOT NULL")
    .all() as { id: number; capabilities: string }[];

  const findStmt = db.prepare("SELECT id FROM assets WHERE type = ? AND name = ?");
  const insertStmt = db.prepare(
    "INSERT INTO assets (type, name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'proposed', ?, ?)"
  );
  const linkStmt = db.prepare(
    "INSERT OR IGNORE INTO asset_cards (asset_id, card_id) VALUES (?, ?)"
  );

  let created = 0;
  let linked = 0;
  for (const row of rows) {
    let caps: { type?: string; name?: string; role?: string }[];
    try {
      caps = JSON.parse(row.capabilities);
    } catch {
      continue;
    }
    for (const cap of caps) {
      if (!cap.name || !cap.type || !SYNCABLE_TYPES.has(cap.type)) continue;
      const name = cap.name.trim();
      let asset = findStmt.get(cap.type, name) as { id: number } | undefined;
      if (!asset) {
        const ts = now();
        const info = insertStmt.run(cap.type, name, cap.role ?? null, ts, ts);
        asset = { id: Number(info.lastInsertRowid) };
        addAssetLog(asset.id, "system", "created", `从卡片 #${row.id} 的能力拆解汇入`);
        created++;
      }
      const res = linkStmt.run(asset.id, row.id);
      if (res.changes > 0) linked++;
    }
  }
  return { created, linked };
}

export function getAsset(id: number): Asset | undefined {
  return getDb().prepare("SELECT * FROM assets WHERE id = ?").get(id) as
    | Asset
    | undefined;
}

/** 资产列表 + 关联卡片数 / 场景名（agent 的关联走交付绑定） */
export function listAssets(): AssetListItem[] {
  const db = getDb();
  const assets = db.prepare("SELECT * FROM assets").all() as Asset[];
  const links = db
    .prepare(
      `SELECT ac.asset_id, ac.card_id, s.name AS scene_name
       FROM asset_cards ac
       LEFT JOIN cards c ON c.id = ac.card_id
       LEFT JOIN scenes s ON s.id = c.scene_id
       UNION ALL
       SELECT c.agent_asset_id AS asset_id, c.id AS card_id, s.name AS scene_name
       FROM cards c LEFT JOIN scenes s ON s.id = c.scene_id
       WHERE c.agent_asset_id IS NOT NULL`
    )
    .all() as { asset_id: number; card_id: number; scene_name: string | null }[];

  const byAsset = new Map<number, { cards: Set<number>; scenes: Set<string> }>();
  for (const l of links) {
    let e = byAsset.get(l.asset_id);
    if (!e) byAsset.set(l.asset_id, (e = { cards: new Set(), scenes: new Set() }));
    e.cards.add(l.card_id);
    if (l.scene_name) e.scenes.add(l.scene_name);
  }
  // AI 员工的组成资源摘要与服务卡片标题（员工视角是页面主入口）
  const compRows = db
    .prepare("SELECT agent_asset_id, component_asset_id FROM asset_components")
    .all() as { agent_asset_id: number; component_asset_id: number }[];
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const compsByAgent = new Map<number, Asset[]>();
  for (const r of compRows) {
    const comp = assetById.get(r.component_asset_id);
    if (!comp) continue;
    if (!compsByAgent.has(r.agent_asset_id)) compsByAgent.set(r.agent_asset_id, []);
    compsByAgent.get(r.agent_asset_id)!.push(comp);
  }
  const servedRows = db
    .prepare("SELECT id, title, agent_asset_id FROM cards WHERE agent_asset_id IS NOT NULL")
    .all() as { id: number; title: string | null; agent_asset_id: number }[];
  const servedByAgent = new Map<number, { id: number; title: string | null }[]>();
  for (const r of servedRows) {
    if (!servedByAgent.has(r.agent_asset_id)) servedByAgent.set(r.agent_asset_id, []);
    servedByAgent.get(r.agent_asset_id)!.push({ id: r.id, title: r.title });
  }

  const items = assets.map((a) => {
    const e = byAsset.get(a.id);
    return {
      ...a,
      cardCount: e?.cards.size ?? 0,
      sceneNames: e ? [...e.scenes].sort() : [],
      ...(a.type === "agent"
        ? {
            components: (compsByAgent.get(a.id) ?? []).map((c) => ({
              id: c.id,
              type: c.type,
              name: c.name,
              status: c.status,
            })),
            servedCards: servedByAgent.get(a.id) ?? [],
          }
        : {}),
    };
  });
  // 按流程状态 → 类型 → 关联需求数排序
  items.sort(
    (a, b) =>
      ASSET_STATUS_ORDER.indexOf(a.status) - ASSET_STATUS_ORDER.indexOf(b.status) ||
      a.type.localeCompare(b.type) ||
      b.cardCount - a.cardCount
  );
  return items;
}

/** 资产详情：关联卡片、组成/所属关系、日志 */
export function getAssetDetail(id: number) {
  const db = getDb();
  const asset = getAsset(id);
  if (!asset) return undefined;
  // 需求关联：agent 走交付绑定（cards.agent_asset_id），资源走拆解关联（asset_cards）
  const cards =
    asset.type === "agent"
      ? db
          .prepare(
            `SELECT c.id, c.title, c.priority_score, c.status, c.work_status, s.name AS scene_name
             FROM cards c LEFT JOIN scenes s ON s.id = c.scene_id
             WHERE c.agent_asset_id = ? ORDER BY c.priority_score DESC`
          )
          .all(id)
      : db
          .prepare(
            `SELECT c.id, c.title, c.priority_score, c.status, c.work_status, s.name AS scene_name
             FROM asset_cards ac JOIN cards c ON c.id = ac.card_id
             LEFT JOIN scenes s ON s.id = c.scene_id
             WHERE ac.asset_id = ? ORDER BY c.priority_score DESC`
          )
          .all(id);
  // 任何资产都可以有组成资源（员工→技能包→认知包，逐层下钻），也可能被上层引用
  const components = db
    .prepare(
      `SELECT a.id, a.type, a.name, a.status, a.stage_detail FROM asset_components ac
       JOIN assets a ON a.id = ac.component_asset_id WHERE ac.agent_asset_id = ?`
    )
    .all(id);
  const usedBy = db
    .prepare(
      `SELECT a.id, a.type, a.name, a.status FROM asset_components ac
       JOIN assets a ON a.id = ac.agent_asset_id WHERE ac.component_asset_id = ?`
    )
    .all(id);
  const logs = db
    .prepare("SELECT * FROM asset_logs WHERE asset_id = ? ORDER BY ts ASC, id ASC")
    .all(id);
  return { asset, cards, components, usedBy, logs };
}

/**
 * 登记资产（人工登记 knowledge/mcp 等，或生产工程回传创建）。
 * type=agent（AI 员工）时支持：
 * - structure：内部结构描述（子 Agent 编排，仅展示不建实体）
 * - component_ids：组成该员工的资源资产（skill 等）
 * - card_ids：该员工服务的需求卡（绑定交付关系，卡片工单状态推到 producing）
 */
export function createAsset(
  input: {
    type: AssetType;
    name: string;
    role?: string;
    notes?: string;
    structure?: string;
    trial_url?: string;
    artifact_url?: string;
    component_ids?: number[];
    card_ids?: number[];
  },
  actor: "human" | "pipeline" = "human"
): Asset {
  const db = getDb();
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO assets (type, name, role, notes, structure, trial_url, artifact_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.type,
      input.name.trim(),
      input.role ?? null,
      input.notes ?? null,
      input.structure ?? null,
      input.trial_url ?? null,
      input.artifact_url ?? null,
      // 工程回传的是事实（进入定义中）；人工/预估登记为 proposed
      actor === "pipeline" ? "defining" : "proposed",
      ts,
      ts
    );
  const id = Number(info.lastInsertRowid);
  addAssetLog(id, actor, "created", actor === "pipeline" ? "生产工程回传创建" : "手动登记");

  if (input.component_ids && input.component_ids.length > 0) {
    setAssetComponents(id, input.component_ids, actor);
  }
  if (input.type === "agent") {
    for (const cardId of input.card_ids ?? []) {
      bindAgentToCard(id, cardId, actor);
    }
  }
  return getAsset(id)!;
}

/**
 * 设置资产的组成资源（覆盖式）。父资产不限于 AI 员工——
 * 技能包也可以有组成资源（如依赖的认知包/MCP），支持逐层下钻检查设计。
 * （表字段名 agent_asset_id 历史沿用，语义为 parent_asset_id）
 */
export function setAssetComponents(
  parentId: number,
  componentIds: number[],
  actor: "human" | "pipeline" = "pipeline"
): void {
  const db = getDb();
  db.prepare("DELETE FROM asset_components WHERE agent_asset_id = ?").run(parentId);
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO asset_components (agent_asset_id, component_asset_id) VALUES (?, ?)"
  );
  const valid: number[] = [];
  for (const cid of componentIds) {
    if (cid !== parentId && getAsset(cid)) {
      stmt.run(parentId, cid);
      valid.push(cid);
    }
  }
  if (valid.length > 0) {
    addAssetLog(parentId, actor, "components_set", `组成资源：#${valid.join(", #")}`);
  }
}

/** 把 AI 员工绑定到需求卡（交付关系），卡片工单状态未到待签收的推到 producing */
export function bindAgentToCard(
  agentId: number,
  cardId: number,
  actor: "human" | "pipeline" = "pipeline"
): void {
  const db = getDb();
  const card = db.prepare("SELECT id, work_status FROM cards WHERE id = ?").get(cardId) as
    | { id: number; work_status: string | null }
    | undefined;
  if (!card) return;
  const nextWork =
    card.work_status === "pending_signoff" || card.work_status === "signed_off"
      ? card.work_status
      : "producing";
  db.prepare("UPDATE cards SET agent_asset_id = ?, work_status = ?, updated_at = ? WHERE id = ?").run(
    agentId,
    nextWork,
    now(),
    cardId
  );
  addCardLog(cardId, actor === "pipeline" ? "system" : "human", "agent_bound", `绑定 AI 员工 #${agentId}（交付物）`);
}

/**
 * 更新资产状态/阶段说明/产物/备注。actor='pipeline' 供外部生产工程回调用，
 * 这就是与文件工程对接的全部契约：关键节点 PATCH 一下即可。
 */
export function updateAsset(
  id: number,
  patch: Partial<Pick<Asset, "type" | "status" | "stage_detail" | "artifact_url" | "trial_url" | "structure" | "notes" | "name" | "role">>,
  actor: "human" | "pipeline" = "human"
): Asset | undefined {
  const asset = getAsset(id);
  if (!asset) return undefined;
  const db = getDb();
  db.prepare(
    `UPDATE assets SET type = ?, name = ?, role = ?, status = ?, stage_detail = ?, artifact_url = ?, trial_url = ?, structure = ?, notes = ?, updated_at = ? WHERE id = ?`
  ).run(
    patch.type ?? asset.type,
    patch.name ?? asset.name,
    patch.role !== undefined ? patch.role : asset.role,
    patch.status ?? asset.status,
    patch.stage_detail !== undefined ? patch.stage_detail : asset.stage_detail,
    patch.artifact_url !== undefined ? patch.artifact_url : asset.artifact_url,
    patch.trial_url !== undefined ? patch.trial_url : asset.trial_url,
    patch.structure !== undefined ? patch.structure : asset.structure,
    patch.notes !== undefined ? patch.notes : asset.notes,
    now(),
    id
  );
  const changes: string[] = [];
  if (patch.type && patch.type !== asset.type)
    changes.push(`类型：${asset.type} → ${patch.type}`);
  if (patch.status && patch.status !== asset.status)
    changes.push(`状态：${asset.status} → ${patch.status}`);
  if (patch.stage_detail !== undefined && patch.stage_detail !== asset.stage_detail)
    changes.push(`阶段：${patch.stage_detail || "（清空）"}`);
  if (patch.artifact_url !== undefined && patch.artifact_url !== asset.artifact_url)
    changes.push("产物链接更新");
  if (patch.trial_url !== undefined && patch.trial_url !== asset.trial_url)
    changes.push("验收入口链接更新");
  if (changes.length > 0) addAssetLog(id, actor, "updated", changes.join("；"));

  // AI 员工推到"待签收"（testing）时，其服务的卡片工单同步进入待签收
  if (asset.type === "agent" && patch.status === "testing" && asset.status !== "testing") {
    const bound = db
      .prepare("SELECT id FROM cards WHERE agent_asset_id = ? AND (work_status IS NULL OR work_status NOT IN ('signed_off'))")
      .all(id) as { id: number }[];
    for (const c of bound) {
      db.prepare("UPDATE cards SET work_status = 'pending_signoff', updated_at = ? WHERE id = ?").run(now(), c.id);
      addCardLog(c.id, "system", "pending_signoff", `AI 员工 #${id} 已配置到产品端，待签收`);
    }
  }
  return getAsset(id);
}

export function deleteAsset(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM asset_cards WHERE asset_id = ?").run(id);
  db.prepare("DELETE FROM asset_components WHERE agent_asset_id = ? OR component_asset_id = ?").run(id, id);
  // 解除交付绑定：被删员工服务的卡片回到已派发
  db.prepare(
    "UPDATE cards SET agent_asset_id = NULL, work_status = CASE WHEN work_status IN ('producing','pending_signoff') THEN 'dispatched' ELSE work_status END, updated_at = ? WHERE agent_asset_id = ?"
  ).run(now(), id);
  db.prepare("DELETE FROM asset_logs WHERE asset_id = ?").run(id);
  db.prepare("DELETE FROM assets WHERE id = ?").run(id);
}

/** 场景的能力就绪度：经卡片关联到该场景的资产中，已验收的比例 */
export function sceneAssetReadiness(): Map<number, { ready: number; total: number }> {
  const rows = getDb()
    .prepare(
      `SELECT c.scene_id, a.id AS asset_id, a.status
       FROM asset_cards ac
       JOIN cards c ON c.id = ac.card_id AND c.scene_id IS NOT NULL
       JOIN assets a ON a.id = ac.asset_id
       GROUP BY c.scene_id, a.id`
    )
    .all() as { scene_id: number; asset_id: number; status: AssetStatus }[];
  const map = new Map<number, { ready: number; total: number }>();
  for (const r of rows) {
    let e = map.get(r.scene_id);
    if (!e) map.set(r.scene_id, (e = { ready: 0, total: 0 }));
    e.total++;
    if (r.status === "accepted") e.ready++;
  }
  return map;
}

/**
 * AI 归并相似资产（如「背调报告生成」与「背调档案生成」）。
 * 一次调用给出归并分组；执行归并时保留每组第一个为主资产，
 * 其余资产的卡片关联转移过去后删除。⚠ 消耗 1 次 AI 调用，仅由用户手动触发。
 */
export async function mergeAssetsWithAI(): Promise<{ merged: number; groups: number }> {
  const db = getDb();
  const assets = db
    .prepare("SELECT id, type, name, role FROM assets ORDER BY id")
    .all() as { id: number; type: string; name: string; role: string | null }[];
  if (assets.length < 2) return { merged: 0, groups: 0 };

  const settings = getSettings();
  assertBudget();
  recordAiCall();
  const message = await streamWithServerTools({
    model: settings.screening_model,
    max_tokens: 4000,
    system: ASSET_MERGE_SYSTEM,
    messages: [{ role: "user", content: buildAssetMergeUser(assets) }],
  });
  const text = messageText(message);
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("归并结果中未找到 JSON 数组");
  const groups = JSON.parse(text.slice(start, end + 1)) as { keep?: number; merge?: number[]; name?: string }[];

  const byId = new Map(assets.map((a) => [a.id, a]));
  let merged = 0;
  let groupCount = 0;
  const tx = db.transaction(() => {
    for (const g of groups) {
      if (!g.keep || !Array.isArray(g.merge) || g.merge.length === 0) continue;
      const keep = byId.get(g.keep);
      if (!keep) continue;
      const victims = g.merge.filter((id) => id !== g.keep && byId.has(id) && byId.get(id)!.type === keep.type);
      if (victims.length === 0) continue;
      groupCount++;
      for (const vid of victims) {
        db.prepare("UPDATE OR IGNORE asset_cards SET asset_id = ? WHERE asset_id = ?").run(g.keep, vid);
        db.prepare("DELETE FROM asset_cards WHERE asset_id = ?").run(vid);
        db.prepare("DELETE FROM asset_logs WHERE asset_id = ?").run(vid);
        db.prepare("DELETE FROM assets WHERE id = ?").run(vid);
        merged++;
      }
      if (g.name && g.name.trim() && g.name.trim() !== keep.name) {
        db.prepare("UPDATE assets SET name = ?, updated_at = ? WHERE id = ?").run(g.name.trim(), now(), g.keep);
      }
      addAssetLog(g.keep, "ai", "merged", `归并了 ${victims.length} 个同义资产（#${victims.join(", #")}）`);
    }
  });
  tx();
  return { merged, groups: groupCount };
}
