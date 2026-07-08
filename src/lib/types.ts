export type SourceType = "reddit" | "report" | "manual";

export type CardStatus =
  | "pending_screening"
  | "screened"
  | "analyzing"
  | "analyzed"
  | "archived"
  | "adopted";

export type Verdict = "worth" | "not_worth" | "uncertain";

export type Priority = "P0" | "P1" | "P2";

/**
 * 需求类型：
 * existing = 已有需求：用户已经有的、常规调研能发现的需求
 * created  = 创造需求：借助 AI 能力在全新场景创造出来的需求（用户此前想不到，被展示后才意识到想要）
 */
export type DemandType = "existing" | "created";

export const DEMAND_LABELS: Record<DemandType, string> = {
  existing: "已有需求",
  created: "创造需求",
};

export interface Card {
  id: number;
  source_type: SourceType;
  source_url: string | null;
  raw_content: string;
  title: string | null;
  summary: string | null;
  category: string | null; // JSON string array
  screening_verdict: Verdict | null;
  screening_reason: string | null;
  priority: Priority | null;
  priority_score: number | null;
  demand_type: DemandType | null;
  deep_analysis: string | null;
  status: CardStatus;
  human_touched: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface CardLog {
  id: number;
  card_id: number;
  ts: string;
  actor: "ai" | "human" | "system";
  action: string;
  detail: string | null;
}

export interface Run {
  id: number;
  trigger_type: "cron" | "manual";
  status: "running" | "success" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  summary: string | null; // JSON: per-collector detail
  error: string | null;
}

export interface CollectorSummary {
  collector: string;
  collected: number;
  deduped: number;
  discarded: number; // dropped by relevance prefilter
  inserted: number;
  error: string | null;
}

export const STATUS_LABELS: Record<CardStatus, string> = {
  pending_screening: "待初筛",
  screened: "已初筛",
  analyzing: "分析中",
  analyzed: "已分析",
  archived: "已归档",
  adopted: "已采纳",
};

export const SOURCE_LABELS: Record<SourceType, string> = {
  reddit: "Reddit",
  report: "研报",
  manual: "创意",
};

export const CATEGORY_OPTIONS = [
  "内容创作",
  "效率工具",
  "教育",
  "电商",
  "情感陪伴",
  "开发者工具",
  "健康",
  "金融",
  "生活服务",
  "其他",
];
