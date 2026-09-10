// 前后端共享类型定义
export interface LlmModel {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  vendorLabel: string;
  created: number;
  context: number;
  maxOutput: number | null;
  promptPrice: number; // USD / 1M tokens
  completionPrice: number;
  cacheReadPrice: number | null;
  modality: string;
  inputModalities: string[];
  outputModalities: string[];
  reasoning: boolean;
  tools: boolean;
  structuredOutput: boolean;
  supportedParams: string[];
  openrouterUrl: string;
  description: string;
  /** Artificial Analysis 关联指标 */
  intelligence: number | null;
  agentic: number | null;
  omniscience: number | null;
  speed: number | null;
  aaPriceInput: number | null;
  aaPriceOutput: number | null;
  aaPriceCacheHit: number | null;
  openness: number | null;
  aaSlug: string | null;
}

export interface LeaderboardEntry {
  label: string;
  value: number;
  extra: Record<string, number>;
  detailsUrl: string | null;
  aaSlug: string | null;
  modelId: string | null;
}

export interface Leaderboard {
  id: string;
  name: string;
  description: string;
  metricKey: string;
  higherBetter: boolean;
  entries: LeaderboardEntry[];
}

export interface ProviderConsole {
  id: string;
  name: string;
  nameCn: string;
  region: 'intl' | 'cn';
  console: string;
  docs: string;
  pricing: string;
  playground: string | null;
  status: string | null;
  modelsEndpoint: string | null;
  apiBase: string | null;
  note: string;
}

export interface ProbeResult {
  providerId: string;
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  state: 'ok' | 'auth-required' | 'unreachable' | 'error';
  modelCount: number | null;
  message: string;
  checkedAt: number;
}

export interface SourceStatus {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  latencyMs: number | null;
  fetchedAt: number;
  count: number | null;
  error: string | null;
}

export type KeyStatus = 'ok' | 'cooling' | 'dead';

/** 单把 Key 的健康度（B3：冷却 / 坏 Key 追踪），前端面板与只读接口共用 */
export interface KeyHealth {
  keyMasked: string;
  status: KeyStatus;
  cooldownRemainingMs: number;
  consecutiveFails: number;
  dead: boolean;
}

export interface ProviderKeyHealth {
  providerId: string;
  keys: KeyHealth[];
}

export interface Snapshot {
  generatedAt: number;
  models: LlmModel[];
  leaderboards: Leaderboard[];
  providers: ProviderConsole[];
  sources: SourceStatus[];
}
