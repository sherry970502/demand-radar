import { getAnthropic, assertBudget, recordAiCall } from "./client";
import { getSettings } from "../settings";
import { screeningSystem, buildScreeningUser } from "./prompts";
import type { DemandType, Priority, SourceType, Verdict } from "../types";

export interface ScreeningResult {
  title: string;
  summary: string;
  category: string[];
  demand_type: DemandType;
  screening_verdict: Verdict;
  screening_reason: string;
  priority: Priority;
  priority_score: number;
}

const SCREENING_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "一句话中文需求标题" },
    summary: {
      type: "string",
      description: "中文需求描述：用户是谁、想让 AI 做什么、当前痛点",
    },
    category: {
      type: "array",
      items: { type: "string" },
      description: "分类标签 1-3 个；发现新场景可自拟简短新标签（2-6 字）",
    },
    demand_type: {
      type: "string",
      enum: ["existing", "created"],
      description:
        "existing=用户已有的、常规调研能发现的需求；created=借助 AI 能力在全新场景创造出来的需求（用户此前想不到，被展示后才意识到想要）",
    },
    screening_verdict: {
      type: "string",
      enum: ["worth", "not_worth", "uncertain"],
    },
    screening_reason: {
      type: "string",
      description: "具体、可读的中文判断理由，不能是空话",
    },
    priority: { type: "string", enum: ["P0", "P1", "P2"] },
    priority_score: {
      type: "integer",
      description: "0-100 的量化分",
    },
  },
  required: [
    "title",
    "summary",
    "category",
    "demand_type",
    "screening_verdict",
    "screening_reason",
    "priority",
    "priority_score",
  ],
  additionalProperties: false,
} as const;

export async function screenCard(card: {
  source_type: SourceType;
  source_url: string | null;
  raw_content: string;
}): Promise<ScreeningResult> {
  const settings = getSettings();
  assertBudget();

  recordAiCall();
  const response = await getAnthropic().messages.create({
    model: settings.screening_model,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system: screeningSystem(settings.fit_description),
    messages: [{ role: "user", content: buildScreeningUser(card) }],
    output_config: {
      format: { type: "json_schema", schema: SCREENING_SCHEMA },
    },
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const result = JSON.parse(text) as ScreeningResult;
  result.priority_score = Math.max(0, Math.min(100, result.priority_score));
  return result;
}
