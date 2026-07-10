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
 * 资源构件（深度分析拆解产出，存于 cards.capabilities JSON）。
 * 五类制：把需求视为一个子 agent，拆解其执行时要编排的资源——
 * skill=自研技能包；ai_service=接入的模型能力；knowledge=知识库；
 * mcp=MCP 工具；service=现实世界外部服务。
 * 输入/输出交互与附加玩法不算构件（写在报告第 6 章用户旅程里）。
 * "ai"（旧两类制）与 "basic" 仅为兼容旧数据保留。
 */
export interface Capability {
  type: "skill" | "ai_service" | "knowledge" | "mcp" | "service" | "ai" | "basic";
  name: string;
  role: string;
}

export const CAPABILITY_TYPE_LABELS: Record<Capability["type"], string> = {
  skill: "技能包",
  ai_service: "AI 服务",
  knowledge: "知识库",
  mcp: "MCP 工具",
  service: "外部服务",
  ai: "AI 能力（旧）",
  basic: "基础能力",
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
  /** 能力就绪度：该场景卡片关联的资产中已验收的数量 / 总数 */
  assetReady: number;
  assetTotal: number;
  /** 员工交付率分子：已签收（signed_off）的卡片数，分母为 cardCount */
  signedCards: number;
  updated_at: string;
}

/**
 * 需求卡片的生产工单状态（与情报流水线 status 独立）：
 * null=未派发 → dispatched=已派发 → producing=生产中 → pending_signoff=待签收 → signed_off=已签收。
 * 签收以卡片绑定的 AI 员工为单位；pending_signoff 由工程回调设置，signed_off 仅人工。
 */
export type WorkStatus = "dispatched" | "producing" | "pending_signoff" | "signed_off";

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  dispatched: "已派发",
  producing: "生产中",
  pending_signoff: "待签收",
  signed_off: "已签收",
};

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
  /** 交付绑定：完成这张卡的 AI 员工（assets 表 type=agent 的资产） */
  agent_asset_id: number | null;
  work_status: WorkStatus | null;
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

// ---------- 能力资产注册表（第二步：研发生产的状态跟踪层） ----------

/**
 * 资产类型。注册表只养两类东西：
 * - **agent（AI 员工）**：交付/验收单元——一张需求卡绑定一个 AI 员工，签收以它为单位。
 *   内部的子 Agent 结构不建实体，存 structure 字段展示。
 * - **资源（复用单元）**：skill=自研技能包；ai_service=接入的模型能力；
 *   knowledge=知识库；mcp=MCP 工具；service=现实世界外部服务。
 * "ai" 为旧两类制的遗留标签（存量数据保留，可在详情里手动改类）。
 */
export type AssetType = "agent" | "skill" | "ai_service" | "knowledge" | "mcp" | "service" | "ai";

/**
 * 里程碑状态（粗粒度、固定）。生产工程内部的细分阶段写 stage_detail 自由文本，
 * 工程流程怎么改都不影响这套状态。
 */
export type AssetStatus =
  | "proposed" // 已提出（从需求拆解汇入，未开始）
  | "defining" // 定义中
  | "developing" // 研发中
  | "testing" // 测试中
  | "accepted" // 已验收上架
  | "paused"; // 暂缓

export interface Asset {
  id: number;
  type: AssetType;
  name: string;
  role: string | null;
  status: AssetStatus;
  stage_detail: string | null; // 生产工程回报的当前细分阶段说明
  artifact_url: string | null; // 产物链接（仓库 / skill 包）
  trial_url: string | null; // 产品端试用/抽样体验直达链接
  structure: string | null; // agent 专用：内部结构描述（子 Agent 编排，工程回传，仅展示）
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** 资产列表项（含关联统计；agent 额外带组成资源摘要与服务的卡片标题） */
export interface AssetListItem extends Asset {
  cardCount: number;
  sceneNames: string[];
  components?: { id: number; type: AssetType; name: string; status: AssetStatus }[];
  servedCards?: { id: number; title: string | null }[];
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  agent: "AI 员工",
  skill: "技能包",
  ai_service: "AI 服务",
  knowledge: "知识库",
  mcp: "MCP 工具",
  service: "外部服务",
  ai: "AI 能力（旧）",
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  proposed: "已提出",
  defining: "定义中",
  developing: "研发中",
  testing: "测试中",
  accepted: "已验收",
  paused: "暂缓",
};

/**
 * 状态措辞按资产类型区分（同一套枚举，只是显示语义不同）：
 * skill 是"研发"，ai_service/mcp 是"接入/集成"，knowledge 是"收集"，service 是"对接"。
 */
const STATUS_LABELS_BY_TYPE: Partial<Record<AssetType, Partial<Record<AssetStatus, string>>>> = {
  agent: { defining: "设计中", developing: "组装中", testing: "待签收", accepted: "已签收" },
  ai_service: { defining: "选型评估中", developing: "接入中", testing: "验证中", accepted: "已接入" },
  mcp: { defining: "选型评估中", developing: "集成中", testing: "联调中", accepted: "已接入" },
  knowledge: { defining: "界定范围中", developing: "收集中", testing: "校验中", accepted: "已就绪" },
  service: { defining: "方案评估中", developing: "对接中", testing: "验证中", accepted: "已对接" },
};

export function assetStatusLabel(type: AssetType, status: AssetStatus): string {
  return STATUS_LABELS_BY_TYPE[type]?.[status] ?? ASSET_STATUS_LABELS[status];
}

/** 状态在流程中的顺序（用于就绪度与排序） */
export const ASSET_STATUS_ORDER: AssetStatus[] = [
  "proposed",
  "defining",
  "developing",
  "testing",
  "accepted",
  "paused",
];

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
