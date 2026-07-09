import { getDb, now } from "./db";
import { getSettings } from "./settings";
import {
  assertBudget,
  recordAiCall,
  streamWithServerTools,
  messageText,
} from "./ai/client";
import { EXPLORE_SYSTEM, buildExploreUser } from "./ai/prompts";
import { ingestItems, processCards } from "./pipeline";
import { createScene, getScene, parseBlueprint } from "./scenes";
import type { RawItem } from "./collectors/types";
import type { CollectorSummary } from "./types";

/**
 * 定向探索：围绕一个场景蓝图（环节 × 角色）搜集该场景下的用户需求
 * （已有 + 可创造），生成卡片挂到蓝图环节上，进入标准流水线（初筛→深析）。
 *
 * - 传 sceneId：在已有场景上继续探索（补齐缺口），复用其蓝图
 * - 传 scene 描述：先 AI 生成蓝图建档，再探索
 *
 * 每次探索产生一条 trigger_type='explore' 的运行记录。
 */
export async function exploreScene(params: {
  sceneId?: number;
  scene?: string;
  focus?: string;
}): Promise<number> {
  const { sceneId, scene: sceneDesc, focus } = params;
  const db = getDb();
  const runInfo = db
    .prepare(
      "INSERT INTO runs (trigger_type, status, started_at) VALUES ('explore', 'running', ?)"
    )
    .run(now());
  const runId = Number(runInfo.lastInsertRowid);

  const summary: CollectorSummary = {
    collector: "explore",
    collected: 0,
    deduped: 0,
    discarded: 0,
    inserted: 0,
    error: null,
    note: "",
  };
  let newIds: number[] = [];

  try {
    // 第一步：拿到场景与蓝图（已有场景直接用，新场景先生成蓝图建档）
    let scene = sceneId ? getScene(sceneId) : undefined;
    if (!scene) {
      if (!sceneDesc) throw new Error("缺少场景描述");
      scene = await createScene(sceneDesc, focus);
    }
    const blueprint = parseBlueprint(scene.blueprint);
    if (blueprint.stages.length === 0) {
      throw new Error(`场景「${scene.name}」没有蓝图环节，请先补全蓝图`);
    }
    summary.note = `${scene.name}${focus?.trim() ? `｜关注点：${focus.trim()}` : ""}`.slice(0, 300);

    const sceneText = `${scene.name}${scene.description ? `：${scene.description}` : ""}${
      sceneDesc && sceneDesc !== scene.name ? `\n（用户原始描述：${sceneDesc}）` : ""
    }`;

    // 第二步：沿蓝图逐环节探索
    const settings = getSettings();
    assertBudget();
    recordAiCall();

    const message = await streamWithServerTools({
      model: settings.screening_model,
      max_tokens: 16000,
      system: EXPLORE_SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [{ role: "user", content: buildExploreUser(sceneText, blueprint, focus) }],
    });
    const text = messageText(message);
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) {
      throw new Error(
        `探索结果中未找到 JSON 数组（stop_reason=${message.stop_reason ?? "?"}，输出末尾：${text.slice(-160)}）`
      );
    }

    type ExploreEntry = {
      stage?: string;
      persona?: string;
      title?: string;
      url?: string | null;
      summary?: string;
    };
    let arr: ExploreEntry[];
    try {
      arr = JSON.parse(text.slice(start, end + 1)) as ExploreEntry[];
    } catch (parseError) {
      // 模型输出的 JSON 偶发语法错误（多为字符串内未转义引号）——让它自己修一次
      assertBudget();
      recordAiCall();
      const repaired = await streamWithServerTools({
        model: settings.screening_model,
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: `下面这段 JSON 数组有语法错误（${parseError instanceof Error ? parseError.message : "解析失败"}）。请修正语法后重新输出完整的 JSON 数组，不要改动内容含义，不要输出任何其他文字：\n\n${text.slice(start, end + 1)}`,
          },
        ],
      });
      const rtext = messageText(repaired);
      const rs = rtext.indexOf("[");
      const re = rtext.lastIndexOf("]");
      if (rs === -1 || re <= rs) throw parseError;
      arr = JSON.parse(rtext.slice(rs, re + 1)) as ExploreEntry[];
    }

    const stageNames = new Set(blueprint.stages.map((s) => s.name));
    const personaNames = new Set(blueprint.personas.map((p) => p.name));
    const items: RawItem[] = [];
    for (const e of arr) {
      if (!e.title || !e.summary) continue;
      items.push({
        sourceType: "explore",
        sourceUrl: e.url || null,
        title: e.title,
        content: `【定向探索：${scene.name}】${e.stage ? `【环节：${e.stage}】` : ""}${e.persona ? `【角色：${e.persona}】` : ""}\n${e.title}\n\n${e.summary}${e.url ? `\n\n来源：${e.url}` : ""}`,
        sceneId: scene.id,
        // 蓝图外的环节/角色不落库（进"未归入环节"桶），避免污染覆盖率
        stage: e.stage && stageNames.has(e.stage) ? e.stage : undefined,
        persona: e.persona && personaNames.has(e.persona) ? e.persona : undefined,
      });
    }
    summary.collected = items.length;

    const { ids, deduped } = ingestItems(items, "explore");
    newIds = ids;
    summary.inserted = ids.length;
    summary.deduped = deduped;
  } catch (e) {
    summary.error = e instanceof Error ? e.message : String(e);
  } finally {
    db.prepare(
      "UPDATE runs SET status = ?, finished_at = ?, summary = ? WHERE id = ?"
    ).run(summary.error ? "failed" : "success", now(), JSON.stringify([summary]), runId);
  }

  // 初筛 + 深析在后台继续
  void processCards(newIds).catch((e) =>
    console.error("[explore] 后台处理失败：", e)
  );
  return runId;
}
