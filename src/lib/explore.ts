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
export async function exploreScene(scene: string, focus?: string): Promise<number> {
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
    note: `${scene}${focus?.trim() ? `｜关注点：${focus.trim()}` : ""}`.slice(0, 300),
  };
  let newIds: number[] = [];

  try {
    const settings = getSettings();
    assertBudget();
    recordAiCall();

    const message = await streamWithServerTools({
      model: settings.screening_model,
      max_tokens: 16000,
      system: EXPLORE_SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [{ role: "user", content: buildExploreUser(scene, focus) }],
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

    const items: RawItem[] = [];
    for (const e of arr) {
      if (!e.title || !e.summary) continue;
      items.push({
        sourceType: "explore",
        sourceUrl: e.url || null,
        title: e.title,
        content: `【定向探索：${scene.slice(0, 80)}】${e.stage ? `【环节：${e.stage}】` : ""}\n${e.title}\n\n${e.summary}${e.url ? `\n\n来源：${e.url}` : ""}`,
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
