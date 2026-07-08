import {
  assertBudget,
  recordAiCall,
  streamWithServerTools,
  messageText,
} from "../ai/client";
import { RESEARCH_SYSTEM, buildResearchUser } from "../ai/prompts";
import type { Collector, RawItem } from "./types";

/** 从模型输出中宽松提取 JSON 数组（容忍围栏或前后杂文字） */
function extractJsonArray(text: string, stopReason: string | null): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `研报搜索结果中未找到 JSON 数组（stop_reason=${stopReason ?? "?"}，输出末尾：${text.slice(-160)}）`
    );
  }
  return JSON.parse(text.slice(start, end + 1)) as unknown[];
}

export const researchCollector: Collector = {
  name: "research",
  // 搜索 prompt 已筛过一轮，但仍有跑偏（宏观趋势/治理类混入），入库前再过一次相关性预过滤
  needsPrefilter: true,
  isEnabled: (s) => s.collector_research_enabled,
  async collect(settings) {
    assertBudget();
    recordAiCall();

    const params = {
      model: settings.screening_model,
      max_tokens: 8000,
      system: RESEARCH_SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 8 } as const,
      ],
    };
    let message = await streamWithServerTools({
      ...params,
      messages: [
        { role: "user", content: buildResearchUser(settings.research_keywords) },
      ],
    });
    let text = messageText(message);

    // 模型偶尔只陈述"接下来将输出 JSON"就结束回合——续问一次要求直接给结果
    if (!text.includes("[")) {
      assertBudget();
      recordAiCall();
      message = await streamWithServerTools({
        ...params,
        messages: [
          { role: "user", content: buildResearchUser(settings.research_keywords) },
          { role: "assistant", content: text || "（无输出）" },
          { role: "user", content: "请现在直接输出 JSON 数组结果，不要任何其他文字。" },
        ],
      });
      text = messageText(message);
    }

    console.log(
      `[research] stop=${message.stop_reason} len=${text.length} 输出预览: ${text.slice(0, 500).replace(/\n/g, " ")}`
    );
    const arr = extractJsonArray(text, message.stop_reason);
    const items: RawItem[] = [];
    for (const entry of arr) {
      const e = entry as { title?: string; url?: string; summary?: string };
      if (!e.title || !e.url) continue;
      items.push({
        sourceType: "report",
        sourceUrl: e.url,
        title: e.title,
        content: `《${e.title}》\n来源：${e.url}\n\n${e.summary ?? ""}`.trim(),
      });
    }
    return items;
  },
};
