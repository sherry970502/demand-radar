import type { AppSettings } from "../settings";
import type { SourceType } from "../types";

export interface RawItem {
  sourceType: SourceType;
  sourceUrl: string | null;
  title: string;
  content: string;
  /** 定向探索：所属场景与蓝图环节/角色，入库时直接落到卡片上 */
  sceneId?: number;
  stage?: string;
  persona?: string;
}

/**
 * 采集器统一接口。V2 加新渠道时：实现该接口并在 index.ts 注册即可，不动主干。
 */
export interface Collector {
  /** 唯一名称，用于运行记录与设置项 */
  name: string;
  /** 是否需要 AI 相关性预过滤（自身已由 AI 筛过的渠道可跳过，省调用） */
  needsPrefilter: boolean;
  isEnabled(settings: AppSettings): boolean;
  collect(settings: AppSettings): Promise<RawItem[]>;
}
