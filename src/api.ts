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
  modelMapping?: Record<string, string>; // 模型映射：请求模型名 → 上游实际模型名
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
  requestId?: string | null;
  keyMask?: string | null;
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
  modelMapping?: Record<string, string>; // 模型映射：请求模型名 → 上游实际模型名
}

export async function fetchProxyConfig(): Promise<ProxyConfigResponse> {
  const r = await fetch('/api/proxy/config', authInit());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function saveProxyConfig(
  providerId: string,
  patch: ProxyConfigPatch,
): Promise<ProxyConfigResponse> {
  const r = await fetch(
    '/api/proxy/config',
    authInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, ...patch }),
    }),
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function deleteProxyConfig(providerId: string): Promise<ProxyConfigResponse> {
  const r = await fetch(
    '/api/proxy/config/delete',
    authInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId }),
    }),
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function importProxyConfig(payload: {
  providers: Record<string, ProxyConfigPatch>;
}): Promise<ProxyConfigResponse> {
  const r = await fetch(
    '/api/proxy/import',
    authInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function fetchProxyMetrics(): Promise<ProxyMetrics[]> {
  const r = await fetch('/api/proxy/metrics', authInit());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).metrics;
}
export async function fetchProxyLogs(filter?: {
  provider?: string;
  status?: 'ok' | 'error';
  limit?: number;
  history?: boolean;
}): Promise<{ logs: ProxyLog[]; historyAvailable: boolean }> {
  const params = new URLSearchParams();
  if (filter?.provider) params.set('provider', filter.provider);
  if (filter?.status) params.set('status', filter.status);
  if (filter?.limit) params.set('limit', String(filter.limit));
  if (filter?.history) params.set('history', '1');
  const r = await fetch(`/api/proxy/logs?${params.toString()}`, authInit());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = (await r.json()) as { logs: ProxyLog[]; historyAvailable?: boolean };
  return { logs: data.logs, historyAvailable: Boolean(data.historyAvailable) };
}
export async function fetchProxySummary(): Promise<ProxySummary> {
  const r = await fetch('/api/proxy/metrics/summary', authInit());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function runProxyConnectivity(providers?: string[]): Promise<ProbeResult[]> {
  const r = await fetch(
    '/api/proxy/connectivity',
    authInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers }),
    }),
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).results;
}
export async function fetchProviderModels(providerId: string): Promise<string[]> {
  const r = await fetch(`/api/proxy/${encodeURIComponent(providerId)}/models`, authInit());
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
  const r = await fetch('/api/proxy/cache', authInit());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function clearResponseCache(): Promise<{ cleared: number }> {
  const r = await fetch('/api/proxy/cache/clear', authInit({ method: 'POST' }));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ───────── 代理访问令牌（B4）：前端持有，所有 /api/proxy 与 /api/v1 请求自动携带 ─────────
const PROXY_TOKEN_STORAGE_KEY = 'llm-workbench:proxy-token';
let proxyToken = '';
try {
  proxyToken = localStorage.getItem(PROXY_TOKEN_STORAGE_KEY) ?? '';
} catch {
  /* localStorage 不可用时忽略 */
}

/** 保存代理令牌到内存 + localStorage（启用/重置时由后端回显明文） */
export function setProxyToken(t: string): void {
  proxyToken = t;
  try {
    if (t) localStorage.setItem(PROXY_TOKEN_STORAGE_KEY, t);
    else localStorage.removeItem(PROXY_TOKEN_STORAGE_KEY);
  } catch {
    /* 忽略持久化失败 */
  }
}

export function getProxyToken(): string {
  return proxyToken;
}

// 为请求注入代理令牌头（仅在已持有令牌时）；不影响非令牌端点
function authInit(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (proxyToken) headers.set('Authorization', `Bearer ${proxyToken}`);
  return { ...init, headers };
}

/** 带代理令牌的原生 fetch：需要读取响应头 / 流（SSE、x-request-id 关联）时使用 */
export function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, authInit(init));
}

// ───────── 统一请求封装（超时 / 中止 / 错误体解析 / 401 / 自动携带令牌） ─────────
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(path, { ...authInit(init), signal: ctrl.signal });
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

// ───────── 代理访问令牌（B4） ─────────
export interface ProxyTokenStatus {
  enabled: boolean;
  required: boolean;
  tokenMasked: string;
  envOverridden: boolean;
}

/** 公开状态（不要求令牌本身），用于前端判断是否显示提示并自动注入 */
export async function fetchProxyTokenStatus(): Promise<ProxyTokenStatus> {
  return request<ProxyTokenStatus>('/api/proxy/token');
}

/** 启用 / 禁用 / 重置令牌；启用或重置时后端回显明文，本地存储后由 authInit 自动携带 */
export async function setProxyTokenAction(
  action: 'enable' | 'disable' | 'reset',
): Promise<ProxyTokenStatus & { token: string }> {
  const r = await request<ProxyTokenStatus & { token: string }>('/api/proxy/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (r.token) setProxyToken(r.token);
  else if (action === 'disable') setProxyToken('');
  return r;
}

// ───────── 定价覆盖（D1） ─────────
export interface PriceTriple {
  input: number; // USD / 1M input tokens
  output: number; // USD / 1M output tokens
  cacheRead: number; // USD / 1M cache-read tokens
}

export interface PricingState {
  source: 'user' | 'builtin';
  overrides: {
    version: number;
    updatedAt?: string;
    providers?: Record<string, PriceTriple>;
    models?: Record<string, PriceTriple>;
  };
}

export async function fetchPricingState(): Promise<PricingState> {
  return request<PricingState>('/api/proxy/pricing');
}

// 传任意 JSON，后端校验失败回 400（request 抛出其 error 文案）
export async function savePricingOverrides(overrides: unknown): Promise<PricingState> {
  return request<PricingState>('/api/proxy/pricing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides),
  });
}

export async function resetPricingOverrides(): Promise<PricingState> {
  return request<PricingState>('/api/proxy/pricing', { method: 'DELETE' });
}

// ───────── 日预算（D3） ─────────
export interface BudgetStatus {
  dailyUsd: number | null;
  todayUsd: number;
  level: 'ok' | 'warn' | 'exceed'; // 阈值判定在服务端（ratio ≥80% warn、≥100% exceed）
  ratio: number | null;
}

export async function fetchBudget(): Promise<BudgetStatus> {
  return request<BudgetStatus>('/api/proxy/budget');
}

export async function setBudget(dailyUsd: number | null): Promise<BudgetStatus> {
  return request<BudgetStatus>('/api/proxy/budget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dailyUsd }),
  });
}

// ───────── 配置备份 / 恢复（D5） ─────────
export interface BackupExportResult {
  blob: string; // base64 文本，保存为 .lwb 即可
}
export interface BackupImportResult {
  restored: boolean;
  restoredConfig: boolean;
  restoredAuth: boolean;
}

/** 导出加密备份（config.json + auth.json 原文打包，passphrase 派生 AES-256-GCM） */
export async function exportBackup(passphrase: string): Promise<BackupExportResult> {
  return request<BackupExportResult>('/api/proxy/backup/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  });
}

/** 恢复备份：覆盖本机配置与档案，成功后建议刷新页面 */
export async function importBackup(blob: string, passphrase: string): Promise<BackupImportResult> {
  return request<BackupImportResult>('/api/proxy/backup/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blob, passphrase }),
  });
}

// ───────── 单次调用日志（按 requestId 精确定位，供多模型对比取用量/成本） ─────────
export async function fetchLogByRequestId(requestId: string): Promise<ProxyLog | null> {
  if (!requestId) return null;
  try {
    return await request<ProxyLog>(`/api/proxy/logs/${encodeURIComponent(requestId)}`);
  } catch {
    return null; // 日志可能已被环形缓冲挤出；对比页降级用响应体自带的 usage
  }
}
