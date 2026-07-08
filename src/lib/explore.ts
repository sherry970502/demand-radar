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
import type { RawItem } from "./collectors/types";
import type { CollectorSummary } from "./types";

/**
 * 定向探索：用户描述一个场景（如"BD 商务谈判"），AI 联网搜集该场景下的
 * 用户需求（已有 + 可创造），生成卡片进入标准流水线（初筛→深析）。
 * 每次探索产生一条 trigger_type='explore' 的运行记录。
 */
export async function exploreScene(scene: string): Promise<number> {
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
    note: scene.slice(0, 200),
  };
  let newIds: number[] = [];

  try {
    const settings = getSettings();
    assertBudget();
    recordAiCall();

    const message = await streamWithServerTools({
      model: settings.screening_model,
      max_tokens: 8000,
      system: EXPLORE_SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [{ role: "user", content: buildExploreUser(scene) }],
    });
    const text = messageText(message);
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) {
      throw new Error(
        `探索结果中未找到 JSON 数组（stop_reason=${message.stop_reason ?? "?"}，输出末尾：${text.slice(-160)}）`
      );
    }
    const arr = JSON.parse(text.slice(start, end + 1)) as {
      title?: string;
      url?: string | null;
      summary?: string;
    }[];

    const items: RawItem[] = [];
    for (const e of arr) {
      if (!e.title || !e.summary) continue;
      items.push({
        sourceType: "explore",
        sourceUrl: e.url || null,
        title: e.title,
        content: `【定向探索：${scene.slice(0, 80)}】\n${e.title}\n\n${e.summary}${e.url ? `\n\n来源：${e.url}` : ""}`,
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
