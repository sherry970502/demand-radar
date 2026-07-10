import crypto from "crypto";
import { getDb, now, addCardLog } from "./db";
import { getSettings } from "./settings";
import { collectors } from "./collectors";
import type { RawItem } from "./collectors/types";
import { prefilterItems } from "./ai/prefilter";
import { screenCard } from "./ai/screening";
import { analyzeCard, type RelatedCard } from "./ai/analysis";
import { BudgetExceededError } from "./ai/client";
import type { Card, CollectorSummary } from "./types";

const g = globalThis as unknown as { __adrPipelineRunning?: boolean };

export function isPipelineRunning(): boolean {
  return !!g.__adrPipelineRunning;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content.trim()).digest("hex");
}

function todayCollectedCount(): number {
  const dayStart = new Date().toISOString().slice(0, 10);
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM cards WHERE created_at >= ? AND source_type != 'manual'"
    )
    .get(dayStart) as { n: number };
  return row.n;
}

function insertCard(item: RawItem, collectorName: string): number | null {
  const db = getDb();
  const ts = now();
  try {
    const info = db
      .prepare(
        `INSERT INTO cards (source_type, source_url, raw_content, content_hash, scene_id, stage, persona, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_screening', ?, ?)`
      )
      .run(
        item.sourceType,
        item.sourceUrl,
        item.content,
        hashContent(item.content),
        item.sceneId ?? null,
        item.stage ?? null,
        item.persona ?? null,
        ts,
        ts
      );
    const id = Number(info.lastInsertRowid);
    addCardLog(id, "system", "collected", `由 ${collectorName} 采集入库`);
    return id;
  } catch {
    // UNIQUE 冲突（并发下的重复内容）—— 当作去重跳过
    return null;
  }
}

/** 去重后入库一批条目（供定向探索等主动采集复用），返回新卡片 id 与去重数 */
export function ingestItems(
  items: RawItem[],
  collectorName: string
): { ids: number[]; deduped: number } {
  const db = getDb();
  const existsStmt = db.prepare(
    "SELECT 1 FROM cards WHERE content_hash = ? OR (source_url IS NOT NULL AND source_url = ?) LIMIT 1"
  );
  const ids: number[] = [];
  let deduped = 0;
  const seen = new Set<string>();
  for (const item of items) {
    const hash = hashContent(item.content);
    const key = item.sourceUrl ?? hash;
    if (seen.has(key) || existsStmt.get(hash, item.sourceUrl ?? "")) {
      deduped++;
      continue;
    }
    seen.add(key);
    const id = insertCard(item, collectorName);
    if (id !== null) ids.push(id);
    else deduped++;
  }
  return { ids, deduped };
}

/**
 * 一次完整运行：依次执行所有启用的 collector → 去重 → 相关性预过滤 → 入库。
 * 采集阶段结束即写完运行记录；新卡片的初筛与深度分析在后台继续。
 * 手动触发和定时触发都走这一个函数。
 */
export async function runPipeline(trigger: "cron" | "manual"): Promise<number | null> {
  if (g.__adrPipelineRunning) return null;
  g.__adrPipelineRunning = true;

  const db = getDb();
  const runInfo = db
    .prepare(
      "INSERT INTO runs (trigger_type, status, started_at) VALUES (?, 'running', ?)"
    )
    .run(trigger, now());
  const runId = Number(runInfo.lastInsertRowid);

  const summaries: CollectorSummary[] = [];
  const newCardIds: number[] = [];
  let runError: string | null = null;

  try {
    const settings = getSettings();
    let remaining = Math.max(0, settings.daily_intake_limit - todayCollectedCount());

    for (const collector of collectors) {
      if (!collector.isEnabled(settings)) continue;
      const summary: CollectorSummary = {
        collector: collector.name,
        collected: 0,
        deduped: 0,
        discarded: 0,
        inserted: 0,
        error: null,
      };
      summaries.push(summary);

      try {
        const items = await collector.collect(settings);
        summary.collected = items.length;

        // 去重：同 URL / 同内容哈希不重复入库
        const fresh: RawItem[] = [];
        const seen = new Set<string>();
        const existsStmt = db.prepare(
          "SELECT 1 FROM cards WHERE content_hash = ? OR (source_url IS NOT NULL AND source_url = ?) LIMIT 1"
        );
        for (const item of items) {
          const hash = hashContent(item.content);
          const key = item.sourceUrl ?? hash;
          if (seen.has(key) || existsStmt.get(hash, item.sourceUrl ?? "")) {
            summary.deduped++;
            continue;
          }
          seen.add(key);
          fresh.push(item);
        }

        // 相关性预过滤（批量，一次 AI 调用判 20 条）
        let kept = fresh;
        if (collector.needsPrefilter && fresh.length > 0) {
          kept = [];
          for (let i = 0; i < fresh.length; i += 20) {
            const batch = fresh.slice(i, i + 20);
            const flags = await prefilterItems(batch.map((b) => b.content));
            batch.forEach((b, j) => {
              if (flags[j]) kept.push(b);
              else summary.discarded++;
            });
          }
        }

        // 入库（受每日上限约束）
        for (const item of kept) {
          if (remaining <= 0) break;
          const id = insertCard(item, collector.name);
          if (id !== null) {
            newCardIds.push(id);
            summary.inserted++;
            remaining--;
          } else {
            summary.deduped++;
          }
        }
      } catch (e) {
        summary.error = errMsg(e);
      }
    }
  } catch (e) {
    runError = errMsg(e);
  } finally {
    const hasError = runError !== null || summaries.some((s) => s.error);
    const allFailed =
      runError !== null ||
      (summaries.length > 0 && summaries.every((s) => s.error));
    const status = allFailed ? "failed" : hasError ? "partial" : "success";
    db.prepare(
      "UPDATE runs SET status = ?, finished_at = ?, summary = ?, error = ? WHERE id = ?"
    ).run(status, now(), JSON.stringify(summaries), runError, runId);
    g.__adrPipelineRunning = false;
  }

  // 初筛 + 深度分析在后台继续，不阻塞运行记录
  void processCards(newCardIds).catch((e) =>
    console.error("[pipeline] 后台处理失败：", e)
  );

  return runId;
}

/** 并发 3 处理新卡片；预算耗尽即停止剩余处理 */
export async function processCards(cardIds: number[]): Promise<void> {
  const queue = [...cardIds];
  let budgetExceeded = false;

  async function worker() {
    while (queue.length > 0 && !budgetExceeded) {
      const id = queue.shift();
      if (id === undefined) return;
      try {
        await processCard(id);
      } catch (e) {
        if (e instanceof BudgetExceededError) {
          budgetExceeded = true;
          console.warn("[pipeline] AI 调用预算耗尽，停止处理剩余卡片");
        }
      }
    }
  }

  await Promise.all([worker(), worker(), worker()]);
}

function getCard(cardId: number): Card | undefined {
  return getDb().prepare("SELECT * FROM cards WHERE id = ?").get(cardId) as
    | Card
    | undefined;
}

/** 初筛一张卡片；判定"值得做"则自动进入深度分析 */
export async function processCard(cardId: number): Promise<void> {
  const card = getCard(cardId);
  if (!card) return;
  const db = getDb();

  try {
    const result = await screenCard(card);
    const nextStatus =
      result.screening_verdict === "worth"
        ? "analyzing"
        : result.screening_verdict === "not_worth"
          ? "archived"
          : "screened";

    db.prepare(
      `UPDATE cards SET title = ?, summary = ?, category = ?, demand_type = ?, screening_verdict = ?,
       screening_reason = ?, priority = ?, priority_score = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      result.title,
      result.summary,
      JSON.stringify(result.category),
      result.demand_type,
      result.screening_verdict,
      result.screening_reason,
      result.priority,
      result.priority_score,
      nextStatus,
      now(),
      cardId
    );
    addCardLog(
      cardId,
      "ai",
      "screened",
      `初筛结论：${result.screening_verdict}，评分 ${result.priority_score}（${result.priority}），需求类型：${result.demand_type === "created" ? "创造需求" : "已有需求"}。理由：${result.screening_reason}`
    );

    if (result.screening_verdict === "not_worth") {
      addCardLog(cardId, "system", "auto_archived", "初筛为「不值得做」，自动归档（可复活）");
    } else if (result.screening_verdict === "worth") {
      await runAnalysis(cardId, "system");
    }
  } catch (e) {
    addCardLog(cardId, "system", "error", `初筛失败：${errMsg(e)}`);
    throw e;
  }
}

function findRelatedCards(card: Card): RelatedCard[] {
  let categories: string[] = [];
  try {
    categories = card.category ? (JSON.parse(card.category) as string[]) : [];
  } catch {
    // ignore
  }
  if (categories.length === 0) return [];
  const clauses = categories.map(() => "category LIKE ?").join(" OR ");
  const params = categories.map((c) => `%"${c}"%`);
  return getDb()
    .prepare(
      `SELECT id, title, priority_score FROM cards
       WHERE id != ? AND title IS NOT NULL AND (${clauses})
       ORDER BY priority_score DESC LIMIT 5`
    )
    .all(card.id, ...params) as RelatedCard[];
}

/** 深度分析一张卡片（初筛后自动触发，或人工触发重新分析） */
export async function runAnalysis(
  cardId: number,
  actor: "system" | "human"
): Promise<void> {
  const db = getDb();
  const card = getCard(cardId);
  if (!card) return;

  db.prepare("UPDATE cards SET status = 'analyzing', updated_at = ? WHERE id = ?").run(
    now(),
    cardId
  );
  addCardLog(cardId, actor === "human" ? "human" : "ai", "analysis_started", "开始深度分析");

  try {
    const related = findRelatedCards(card);
    const { report, delivery } = await analyzeCard(card, related);
    db.prepare(
      `UPDATE cards SET deep_analysis = ?, delivery_mode = ?, skill_name = ?, capabilities = ?,
       status = 'analyzed', updated_at = ? WHERE id = ?`
    ).run(
      report,
      delivery?.delivery_mode ?? null,
      delivery?.skill_name ?? null,
      delivery && delivery.capabilities.length > 0
        ? JSON.stringify(delivery.capabilities)
        : null,
      now(),
      cardId
    );
    addCardLog(
      cardId,
      "ai",
      "analyzed",
      `深度分析完成${delivery && delivery.capabilities.length > 0 ? `。资源预估（雷达草图）${delivery.capabilities.length} 项` : ""}`
    );
    // 注：资源拆解是雷达预估（可行性草图），不再自动汇入资产注册表——
    // 注册表只收生产工程回传的事实；预估同步保留为注册表页的手动按钮
  } catch (e) {
    // 回退到已初筛状态，人工可再次触发
    db.prepare("UPDATE cards SET status = 'screened', updated_at = ? WHERE id = ?").run(
      now(),
      cardId
    );
    addCardLog(cardId, "system", "error", `深度分析失败：${errMsg(e)}`);
    throw e;
  }
}

/** 人工投递创意：入库后走完全相同的流水线 */
export function submitIdea(content: string, categories: string[]): number {
  const db = getDb();
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO cards (source_type, source_url, raw_content, content_hash, category, status, created_at, updated_at)
       VALUES ('manual', NULL, ?, ?, ?, 'pending_screening', ?, ?)`
    )
    .run(
      content,
      // 加时间戳，允许重复投递相似创意
      hashContent(`manual:${ts}:${content}`),
      categories.length > 0 ? JSON.stringify(categories) : null,
      ts,
      ts
    );
  const id = Number(info.lastInsertRowid);
  addCardLog(id, "human", "submitted", "人工投递创意");

  void processCard(id).catch((e) =>
    console.error(`[pipeline] 卡片 #${id} 后台处理失败：`, e)
  );
  return id;
}

/** 人工触发重新初筛 */
export async function rescreenCard(cardId: number): Promise<void> {
  getDb()
    .prepare("UPDATE cards SET human_touched = 1, status = 'pending_screening', updated_at = ? WHERE id = ?")
    .run(now(), cardId);
  addCardLog(cardId, "human", "rescreen_triggered", "人工触发重新初筛");
  await processCard(cardId);
}

/** 人工触发重新深度分析 */
export async function reanalyzeCard(cardId: number): Promise<void> {
  getDb()
    .prepare("UPDATE cards SET human_touched = 1, updated_at = ? WHERE id = ?")
    .run(now(), cardId);
  addCardLog(cardId, "human", "reanalyze_triggered", "人工触发重新深度分析");
  await runAnalysis(cardId, "human");
}
