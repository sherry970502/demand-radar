import type { Collector } from "./types";
import { redditCollector } from "./reddit";
import { researchCollector } from "./research";

// 插件式注册表：V2 新增渠道（Twitter/X、小红书……）在这里追加即可。
export const collectors: Collector[] = [redditCollector, researchCollector];
