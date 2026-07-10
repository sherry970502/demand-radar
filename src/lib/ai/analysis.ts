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

export interface DeliveryInfo {
  delivery_mode: "skill" | "combo" | null;
  skill_name: string | null;
  capabilities: {
    type: string;
    name: string;
    role: string;
  }[];
}

export interface AnalysisResult {
  report: string;
  delivery: DeliveryInfo | null;
}

/** 从报告中剥离 <delivery> 机器可读块并解析（失败不影响报告本身） */
function extractDelivery(raw: string): AnalysisResult {
  const match = raw.match(/<delivery>([\s\S]*?)<\/delivery>/);
  if (!match) {
    return { report: raw.trim(), delivery: null };
  }
  const report = raw.replace(match[0], "").trim();
  try {
    const parsed = JSON.parse(match[1].trim()) as {
      delivery_mode?: string;
      skill_name?: string | null;
      capabilities?: DeliveryInfo["capabilities"];
    };
    const mode =
      parsed.delivery_mode === "skill" || parsed.delivery_mode === "combo"
        ? parsed.delivery_mode
        : null;
    return {
      report,
      delivery: {
        delivery_mode: mode,
        skill_name: parsed.skill_name || null,
        capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities : [],
      },
    };
  } catch {
    return { report, delivery: null };
  }
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
): Promise<AnalysisResult> {
  const settings = getSettings();
  assertBudget();

  recordAiCall();
  const message = await streamWithServerTools({
    model: settings.analysis_model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    // 设置页可编辑的深度分析提示词；清空则回退到代码内默认
    system: settings.analysis_system_prompt?.trim() || ANALYSIS_SYSTEM,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: buildAnalysisUser(card, related) }],
  });
  const raw = messageText(message);

  if (!raw.trim()) {
    throw new Error(
      `深度分析返回为空（stop_reason: ${message.stop_reason ?? "unknown"}）`
    );
  }
  return extractDelivery(raw);
}
