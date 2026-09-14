import type { LlmModel, Leaderboard } from '../types.js';

/** 数据源独立测得、可回填到模型的定价（与 LlmModel 的 aaPrice* 字段对齐） */
export interface SourcePricing {
  input: number | null;
  output: number | null;
  cacheHit: number | null;
}

/** 单一数据源经抓取后产出的标准化负载 */
export interface SourcePayload {
  models?: LlmModel[];
  leaderboards?: Leaderboard[];
  pricing?: Map<string, SourcePricing>;
}

/** 数据源注册表项：id 用于 SourceStatus 标识与榜单打源；fetch 产出标准化负载 */
export interface SourceDef {
  id: string;
  name: string;
  url: string;
  fetch(): Promise<SourcePayload>;
}
