import { getDb } from "./db";
import { ANALYSIS_SYSTEM } from "./ai/prompts";

export interface AppSettings {
  daily_run_time: string; // "HH:MM", local time of the server
  daily_intake_limit: number;
  daily_ai_call_limit: number;
  subreddits: string[];
  research_keywords: string[];
  fit_description: string;
  analysis_system_prompt: string;
  screening_model: string;
  analysis_model: string;
  collector_reddit_enabled: boolean;
  collector_research_enabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  daily_run_time: "08:00",
  daily_intake_limit: 50,
  daily_ai_call_limit: 200,
  subreddits: ["ArtificialInteligence", "ChatGPT", "productivity", "smallbusiness"],
  research_keywords: [
    "AI agent user needs",
    "LLM use case report",
    "AI application consumer demand survey",
    "how people use AI assistants",
    "AI personalized gift ideas trend",
    "AI voice clone song gift",
    "AI custom children's book",
    "viral AI apps consumers emotional",
  ],
  fit_description:
    "我们的产品面向普通用户（非技术背景的大众）。评估契合度时：" +
    "(1) 普通用户最实际、高频、普遍的场景优先级最高；" +
    "(2) 教育相关场景我们有既有沉淀，优先级上调；" +
    "(3) 我们不是纯 AI 工具——产品也直接给用户提供服务，AI 尚未覆盖、或 AI 可与人工/服务协作完成的场景同样有价值；" +
    "(4) 「创造需求」型场景（用户此前想不到、被展示后才意识到想要，如用父亲的声音/他喜欢的明星声音定制生日歌、给孩子做定制童书）与「已有需求」同等重要——对这类场景，评估其被唤起后的情感价值、吸引力与传播/礼物属性，而不是要求用户已主动表达过需求。",
  analysis_system_prompt: ANALYSIS_SYSTEM,
  screening_model: "claude-sonnet-5",
  analysis_model: "claude-opus-4-8",
  collector_reddit_enabled: true,
  collector_research_enabled: true,
};

export function getSettings(): AppSettings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      // ignore corrupt value, fall back to default
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
}

export function saveSettings(patch: Partial<AppSettings>) {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db.transaction((entries: [string, unknown][]) => {
    for (const [key, value] of entries) {
      stmt.run(key, JSON.stringify(value));
    }
  });
  tx(
    Object.entries(patch).filter(([key]) =>
      Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)
    )
  );
}
