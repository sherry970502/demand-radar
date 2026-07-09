import { getDb, now, addCardLog } from "./db";
import { getSettings } from "./settings";
import {
  assertBudget,
  recordAiCall,
  streamWithServerTools,
  messageText,
} from "./ai/client";
import {
  BLUEPRINT_SYSTEM,
  buildBlueprintUser,
  BACKFILL_SYSTEM,
  buildBackfillUser,
} from "./ai/prompts";
import { OTHER_STAGE, type Scene, type SceneBlueprint, type SceneStats } from "./types";

function extractJson(text: string, open: string, close: string): string {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end <= start) {
    throw new Error(`AI 输出中未找到 ${open}…${close} JSON（末尾：${text.slice(-160)}）`);
  }
  return text.slice(start, end + 1);
}

export function parseBlueprint(raw: string | null): SceneBlueprint {
  if (!raw) return { stages: [], personas: [] };
  try {
    const bp = JSON.parse(raw) as Partial<SceneBlueprint>;
    return {
      stages: Array.isArray(bp.stages) ? bp.stages : [],
      personas: Array.isArray(bp.personas) ? bp.personas : [],
    };
  } catch {
    return { stages: [], personas: [] };
  }
}

export function getScene(id: number): Scene | undefined {
  return getDb().prepare("SELECT * FROM scenes WHERE id = ?").get(id) as
    | Scene
    | undefined;
}

/** AI 生成场景蓝图并建档 */
export async function createScene(
  description: string,
  focus?: string
): Promise<Scene> {
  const settings = getSettings();
  assertBudget();
  recordAiCall();
  const message = await streamWithServerTools({
    model: settings.screening_model,
    max_tokens: 4000,
    system: BLUEPRINT_SYSTEM,
    messages: [{ role: "user", content: buildBlueprintUser(description, focus) }],
  });
  const parsed = JSON.parse(extractJson(messageText(message), "{", "}")) as {
    name?: string;
    description?: string;
    stages?: { name: string; description: string }[];
    personas?: { name: string; description: string }[];
  };
  if (!parsed.name || !Array.isArray(parsed.stages) || parsed.stages.length === 0) {
    throw new Error("蓝图生成结果缺少场景名或环节列表");
  }
  const blueprint: SceneBlueprint = {
    stages: parsed.stages,
    personas: parsed.personas ?? [],
  };
  const ts = now();
  const info = getDb()
    .prepare(
      "INSERT INTO scenes (name, description, blueprint, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(parsed.name, parsed.description ?? description, JSON.stringify(blueprint), ts, ts);
  return getScene(Number(info.lastInsertRowid))!;
}

/** 人工修订蓝图（增删改环节/角色）；改名环节时同步已挂载卡片 */
export function updateScene(
  id: number,
  patch: {
    name?: string;
    description?: string;
    blueprint?: SceneBlueprint;
    /** 环节改名映射：旧名 → 新名，用于同步卡片 */
    stageRenames?: Record<string, string>;
  }
): Scene | undefined {
  const db = getDb();
  const scene = getScene(id);
  if (!scene) return undefined;
  db.prepare(
    "UPDATE scenes SET name = ?, description = ?, blueprint = ?, updated_at = ? WHERE id = ?"
  ).run(
    patch.name ?? scene.name,
    patch.description ?? scene.description,
    patch.blueprint ? JSON.stringify(patch.blueprint) : scene.blueprint,
    now(),
    id
  );
  if (patch.stageRenames) {
    const stmt = db.prepare(
      "UPDATE cards SET stage = ?, updated_at = ? WHERE scene_id = ? AND stage = ?"
    );
    for (const [from, to] of Object.entries(patch.stageRenames)) {
      if (from !== to) stmt.run(to, now(), id, from);
    }
  }
  return getScene(id);
}

/** 删除场景；已挂载卡片解除归属（不删卡片） */
export function deleteScene(id: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE cards SET scene_id = NULL, stage = NULL, persona = NULL, updated_at = ? WHERE scene_id = ?"
  ).run(now(), id);
  db.prepare("DELETE FROM scenes WHERE id = ?").run(id);
}

/** 场景列表 + 覆盖率统计 */
export function listScenesWithStats(): SceneStats[] {
  const db = getDb();
  const scenes = db
    .prepare("SELECT * FROM scenes ORDER BY updated_at DESC")
    .all() as Scene[];
  const rows = db
    .prepare(
      "SELECT scene_id, stage, COUNT(*) AS n FROM cards WHERE scene_id IS NOT NULL GROUP BY scene_id, stage"
    )
    .all() as { scene_id: number; stage: string | null; n: number }[];

  return scenes.map((scene) => {
    const blueprint = parseBlueprint(scene.blueprint);
    const stageNames = new Set(blueprint.stages.map((s) => s.name));
    const stageCounts: Record<string, number> = {};
    let cardCount = 0;
    for (const row of rows) {
      if (row.scene_id !== scene.id) continue;
      cardCount += row.n;
      const key = row.stage && stageNames.has(row.stage) ? row.stage : OTHER_STAGE;
      stageCounts[key] = (stageCounts[key] ?? 0) + row.n;
    }
    const coveredStages = blueprint.stages.filter((s) => (stageCounts[s.name] ?? 0) > 0).length;
    return {
      id: scene.id,
      name: scene.name,
      description: scene.description,
      blueprint,
      cardCount,
      stageCounts,
      coveredStages,
      totalStages: blueprint.stages.length,
      updated_at: scene.updated_at,
    };
  });
}

/** 未归属任何场景的卡片数（供回填入口展示） */
export function countUnassignedCards(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM cards WHERE scene_id IS NULL")
    .get() as { n: number };
  return row.n;
}

/**
 * AI 回填：把未归属场景的历史卡片归入已有场景蓝图。
 * 只归明确匹配的，其余保持未归属。返回归入数量。
 */
export async function backfillCards(): Promise<{ assigned: number; total: number }> {
  const db = getDb();
  const scenes = db.prepare("SELECT * FROM scenes").all() as Scene[];
  if (scenes.length === 0) throw new Error("还没有任何场景，请先创建场景");

  const cards = db
    .prepare(
      "SELECT id, title, summary FROM cards WHERE scene_id IS NULL AND title IS NOT NULL"
    )
    .all() as { id: number; title: string | null; summary: string | null }[];
  if (cards.length === 0) return { assigned: 0, total: 0 };

  const sceneDefs = scenes.map((s) => {
    const bp = parseBlueprint(s.blueprint);
    return { id: s.id, name: s.name, stages: bp.stages, personas: bp.personas };
  });
  const sceneByName = new Map(sceneDefs.map((s) => [s.name, s]));

  const settings = getSettings();
  let assigned = 0;
  // 批量处理，每批 40 张一次 AI 调用
  for (let i = 0; i < cards.length; i += 40) {
    const batch = cards.slice(i, i + 40);
    assertBudget();
    recordAiCall();
    const message = await streamWithServerTools({
      model: settings.screening_model,
      max_tokens: 8000,
      system: BACKFILL_SYSTEM,
      messages: [{ role: "user", content: buildBackfillUser(sceneDefs, batch) }],
    });
    const arr = JSON.parse(extractJson(messageText(message), "[", "]")) as {
      id?: number;
      scene?: string | null;
      stage?: string | null;
      persona?: string | null;
    }[];
    const batchIds = new Set(batch.map((c) => c.id));
    const stmt = db.prepare(
      "UPDATE cards SET scene_id = ?, stage = ?, persona = ?, updated_at = ? WHERE id = ?"
    );
    for (const entry of arr) {
      if (!entry.id || !batchIds.has(entry.id) || !entry.scene) continue;
      const scene = sceneByName.get(entry.scene);
      if (!scene) continue;
      const stage =
        entry.stage && scene.stages.some((s) => s.name === entry.stage)
          ? entry.stage
          : null;
      const persona =
        entry.persona && scene.personas.some((p) => p.name === entry.persona)
          ? entry.persona
          : null;
      stmt.run(scene.id, stage, persona, now(), entry.id);
      addCardLog(entry.id, "ai", "scene_assigned", `回填归入场景「${entry.scene}」${stage ? `｜环节：${stage}` : ""}${persona ? `｜角色：${persona}` : ""}`);
      assigned++;
    }
  }
  return { assigned, total: cards.length };
}
