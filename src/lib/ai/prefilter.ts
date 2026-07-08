import { getAnthropic, assertBudget, recordAiCall } from "./client";
import { getSettings } from "../settings";
import { PREFILTER_SYSTEM, buildPrefilterUser } from "./prompts";

const PREFILTER_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "对应输入中的条目序号" },
          relevant: { type: "boolean" },
        },
        required: ["index", "relevant"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const;

/**
 * 相关性预过滤：一次调用批量判断 N 条内容是否是 AI 需求情报。
 * 返回与输入等长的布尔数组。AI 调用失败时不阻塞采集——全部放行。
 */
export async function prefilterItems(contents: string[]): Promise<boolean[]> {
  if (contents.length === 0) return [];
  const settings = getSettings();
  assertBudget();

  const items = contents.map((c, i) => ({
    index: i,
    snippet: c.slice(0, 600),
  }));

  recordAiCall();
  const response = await getAnthropic().messages.create({
    model: settings.screening_model,
    max_tokens: 4096,
    thinking: { type: "disabled" },
    system: PREFILTER_SYSTEM,
    messages: [{ role: "user", content: buildPrefilterUser(items) }],
    output_config: {
      format: { type: "json_schema", schema: PREFILTER_SCHEMA },
    },
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as {
    results: { index: number; relevant: boolean }[];
  };

  const flags = contents.map(() => true); // 默认放行
  for (const r of parsed.results) {
    if (r.index >= 0 && r.index < flags.length) flags[r.index] = r.relevant;
  }
  return flags;
}
