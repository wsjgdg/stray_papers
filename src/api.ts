import type { ProbeResult, Snapshot, KeyHealth, ProviderKeyHealth } from '../server/types';

export interface SnapshotMeta {
  cached: boolean;
  fetchedAt: number;
  stale: boolean;
  ttlMs: number;
  nextAutoRefreshIn: number;
}

export type SnapshotResponse = Snapshot & { meta: SnapshotMeta };

export async function fetchSnapshot(refresh = false): Promise<SnapshotResponse> {
  const res = await fetch(`/api/snapshot${refresh ? '?refresh=1' : ''}`);
  if (!res.ok) throw new Error(`快照接口返回 HTTP ${res.status}`);
  return (await res.json()) as SnapshotResponse;
}

export async function runProbe(
  providers: string[],
  apiKeys: Record<string, string>,
): Promise<ProbeResult[]> {
  const res = await fetch('/api/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providers, apiKeys }),
  });
  if (!res.ok) throw new Error(`探测接口返回 HTTP ${res.status}`);
  const json = (await res.json()) as { results: ProbeResult[] };
  return json.results;
}

/** USD / 1M tokens 价格格式化 */
export function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '免费';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

export function fmtCtx(tokens: number): string {
  if (!tokens) return '—';
  if (tokens >= 1_000_000)
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

export function fmtDate(unixSec: number): string {
  if (!unixSec) return '—';
  const d = new Date(unixSec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ───────── 本地代理 ─────────
export type AuthStyle = 'bearer' | 'x-api-key' | 'google';
export type ApiFormat = 'openai' | 'anthropic' | 'gemini';

export interface MaskedProviderConfig {
  baseUrl?: string;
  enabled: boolean;
  customName?: string;
  authStyle?: 'bearer' | 'x-api-key' | 'google';
  apiFormat?: ApiFormat;
  models?: string[]; // 自动获取的模型清单
  enabledModels?: string[]; // 手动启用的模型子集
  apiKeyMasked: string;
  hasKey: boolean;
  apiKeyCount: number; // 可用 key 数量（多 key 轮询/失败切换）
  custom: boolean;
  name: string;
}
export interface ProxyConfigResponse {
  providers: Record<string, MaskedProviderConfig>;
  locked?: boolean;
  encrypted?: boolean;
  hasConfig?: boolean;
}

export interface CryptoStatus {
  encrypted: boolean;
  locked: boolean;
  hasConfig: boolean;
}
export interface ProxyMetrics {
  provider: string;
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCostUsd: number;
  totalKeySwitches: number;
  avgLatencyMs: number;
  inputRateTokS: number;
  outputRateTokS: number;
  reqRate: number;
  lastStatus: number | null;
  lastError: string | null;
  lastTs: number | null;
}
export interface ProxyLog {
  id: number;
  ts: number;
  provider: string;
  model: string;
  method: string;
  path: string;
  status: number | null;
  latencyMs: number;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheHitRate: number | null;
  error: string | null;
  requestBytes: number;
  responseBytes: number;
  costUsd: number;
  fromCache?: boolean;
}

export interface RateSample {
  t: number;
  inRate: number;
  outRate: number;
}
export interface ProxySummary {
  inputRateTokS: number;
  outputRateTokS: number;
  reqRate: number;
  todayInputTokens: number;
  todayOutputTokens: number;
  todayCacheReadTokens: number;
  todayCostUsd: number;
  totalCostUsd: number;
  cacheHitRateToday: number | null;
  recentModels: { model: string; provider: string; ts: number }[];
  rateHistory: RateSample[];
  rateHistoryMax: number;
}
export interface ProxyConfigPatch {
  apiKey?: string;
  apiKeys?: string[];
  baseUrl?: string;
  enabled?: boolean;
  customName?: string;
  authStyle?: AuthStyle;
  apiFormat?: ApiFormat;
  models?: string[];
  enabledModels?: string[];
}

export async function fetchProxyConfig(): Promise<ProxyConfigResponse> {
  const r = await fetch('/api/proxy/config');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function saveProxyConfig(
  providerId: string,
  patch: ProxyConfigPatch,
): Promise<ProxyConfigResponse> {
  const r = await fetch('/api/proxy/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, ...patch }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function deleteProxyConfig(providerId: string): Promise<ProxyConfigResponse> {
  const r = await fetch('/api/proxy/config/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function importProxyConfig(payload: {
  providers: Record<string, ProxyConfigPatch>;
}): Promise<ProxyConfigResponse> {
  const r = await fetch('/api/proxy/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function fetchProxyMetrics(): Promise<ProxyMetrics[]> {
  const r = await fetch('/api/proxy/metrics');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).metrics;
}
export async function fetchProxyLogs(filter?: {
  provider?: string;
  status?: 'ok' | 'error';
  limit?: number;
}): Promise<ProxyLog[]> {
  const params = new URLSearchParams();
  if (filter?.provider) params.set('provider', filter.provider);
  if (filter?.status) params.set('status', filter.status);
  if (filter?.limit) params.set('limit', String(filter.limit));
  const r = await fetch(`/api/proxy/logs?${params.toString()}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).logs;
}
export async function fetchProxySummary(): Promise<ProxySummary> {
  const r = await fetch('/api/proxy/metrics/summary');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function runProxyConnectivity(providers?: string[]): Promise<ProbeResult[]> {
  const r = await fetch('/api/proxy/connectivity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providers }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).results;
}
export async function fetchProviderModels(providerId: string): Promise<string[]> {
  const r = await fetch(`/api/proxy/${encodeURIComponent(providerId)}/models`);
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `HTTP ${r.status}`);
  }
  const j = (await r.json()) as { models: string[] };
  return j.models ?? [];
}

// ───────── 密钥加密 ─────────
export interface CacheStats {
  enabled: boolean;
  ttlMs: number;
  size: number;
  hits: number;
  misses: number;
}
export async function fetchCryptoStatus(): Promise<CryptoStatus> {
  const r = await fetch('/api/crypto/status');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function unlockStore(password: string): Promise<CryptoStatus> {
  const r = await fetch('/api/crypto/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
  return r.json();
}
export async function initEncryption(password: string): Promise<CryptoStatus> {
  const r = await fetch('/api/crypto/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
  return r.json();
}
export async function disableEncryption(): Promise<CryptoStatus> {
  const r = await fetch('/api/crypto/disable', { method: 'POST' });
  if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
  return r.json();
}

// ───────── 响应缓存 ─────────
export async function fetchCacheStats(): Promise<CacheStats> {
  const r = await fetch('/api/proxy/cache');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function clearResponseCache(): Promise<{ cleared: number }> {
  const r = await fetch('/api/proxy/cache/clear', { method: 'POST' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ───────── 统一请求封装（超时 / 中止 / 错误体解析 / 401） ─────────
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(path, { ...init, signal: ctrl.signal });
    if (r.status === 401) throw new Error('未授权（401）：请检查本地代理鉴权配置');
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? `HTTP ${r.status}`);
    }
    return (await r.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export interface ProxyOverviewResponse {
  metrics: ProxyMetrics[];
  cache: CacheStats;
  summary: ProxySummary;
}

// 聚合端点：metrics + cache + summary 一次返回，前端单一定时器轮询。
export async function fetchProxyOverview(): Promise<ProxyOverviewResponse> {
  return request<ProxyOverviewResponse>('/api/proxy/overview');
}

// ───────── Key 健康度（B3：冷却 / 坏 Key 追踪） ─────────
export interface KeyHealthResponse {
  now: number;
  providers: ProviderKeyHealth[];
}

export async function fetchKeyHealth(): Promise<KeyHealthResponse> {
  return request<KeyHealthResponse>('/api/proxy/key-health');
}

/** 手动触发坏 Key 复活探测 */
export async function probeKeyHealth(): Promise<{ ok: boolean; revivedAt: number }> {
  return request<{ ok: boolean; revivedAt: number }>('/api/proxy/key-health/probe', {
    method: 'POST',
  });
}

// 剩余毫秒 → 人类可读（如 "4分12秒"）
export function fmtCooldown(ms: number): string {
  if (ms <= 0) return '—';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}分${s.toString().padStart(2, '0')}秒`;
  return `${s}秒`;
}

export const KEY_STATUS_LABEL: Record<KeyHealth['status'], string> = {
  ok: '正常',
  cooling: '冷却中',
  dead: '坏 Key',
};
