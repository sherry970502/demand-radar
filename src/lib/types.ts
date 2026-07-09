export type SourceType = "reddit" | "report" | "manual" | "explore";

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

/** 产品呈现方式：skill=单一技能闭环交付；combo=多能力/服务组合交付 */
export type DeliveryMode = "skill" | "combo";

export const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  skill: "单一 Skill",
  combo: "组合交付",
};

/**
 * 能力/服务构件（深度分析拆解产出，存于 cards.capabilities JSON）。
 * 只有两类：ai=要建的 AI 能力；service=必须对接现实世界的外部服务。
 * 输入/输出交互与附加玩法不算构件（写在报告第 6 章用户旅程里）。
 * "basic" 仅为兼容旧数据保留。
 */
export interface Capability {
  type: "ai" | "basic" | "service";
  name: string;
  role: string;
}

export const CAPABILITY_TYPE_LABELS: Record<Capability["type"], string> = {
  ai: "AI 能力",
  basic: "基础能力",
  service: "外部服务",
};

export const DEMAND_LABELS: Record<DemandType, string> = {
  existing: "已有需求",
  created: "创造需求",
};

/** 卡片 stage 不在蓝图内时，统计上归入该键 */
export const OTHER_STAGE = "__other__";

/** 场景蓝图：一个业务场景的完整旅程拆解（AI 初拟、人工可改），是覆盖率的分母 */
export interface BlueprintStage {
  name: string;
  description: string;
}

export interface BlueprintPersona {
  name: string;
  description: string;
}

export interface SceneBlueprint {
  stages: BlueprintStage[];
  personas: BlueprintPersona[];
}

export interface Scene {
  id: number;
  name: string;
  description: string | null;
  blueprint: string | null; // JSON SceneBlueprint
  created_at: string;
  updated_at: string;
}

/** 场景列表项（含覆盖率统计） */
export interface SceneStats {
  id: number;
  name: string;
  description: string | null;
  blueprint: SceneBlueprint;
  cardCount: number;
  /** 每个环节的卡片数，键为环节名；不在蓝图内的环节归入 "__other__" */
  stageCounts: Record<string, number>;
  coveredStages: number;
  totalStages: number;
  updated_at: string;
}

export interface Card {
  id: number;
  source_type: SourceType;
  source_url: string | null;
  raw_content: string;
  title: string | null;
  summary: string | null;
  category: string | null; // JSON string array
  scene_id: number | null;
  stage: string | null;
  persona: string | null;
  screening_verdict: Verdict | null;
  screening_reason: string | null;
  priority: Priority | null;
  priority_score: number | null;
  demand_type: DemandType | null;
  delivery_mode: DeliveryMode | null;
  skill_name: string | null;
  capabilities: string | null; // JSON Capability[]
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
  /** 附加说明（如定向探索的场景描述） */
  note?: string;
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
  explore: "探索",
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
