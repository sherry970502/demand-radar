import {
  assertBudget,
  recordAiCall,
  streamWithServerTools,
  messageText,
} from "./client";
import { getSettings } from "../settings";
import { ANALYSIS_SYSTEM, buildAnalysisUser } from "./prompts";

export interface RelatedCard {
  id: number;
  title: string | null;
  priority_score: number | null;
}

/**
 * 深度分析：产出五章节中文 Markdown 报告，允许用 web_search 查竞品。
 * 用流式请求避免长输出超时。
 */
export async function analyzeCard(
  card: {
    id: number;
    title: string | null;
    summary: string | null;
    raw_content: string;
    screening_reason: string | null;
    priority_score: number | null;
    demand_type: string | null;
  },
  related: RelatedCard[]
): Promise<string> {
  const settings = getSettings();
  assertBudget();

  recordAiCall();
  const message = await streamWithServerTools({
    model: settings.analysis_model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: ANALYSIS_SYSTEM,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: buildAnalysisUser(card, related) }],
  });
  const report = messageText(message);

  if (!report.trim()) {
    throw new Error(
      `深度分析返回为空（stop_reason: ${message.stop_reason ?? "unknown"}）`
    );
  }
  return report;
}
