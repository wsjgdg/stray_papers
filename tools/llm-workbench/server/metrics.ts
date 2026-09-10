// 内存指标存储：每厂商聚合计数 + 滑动窗口速率 + 环形日志缓冲。
// 重启即清零（不落盘，避免留存敏感调用痕迹）。
// B5：可选持久化 —— 设 LOG_PERSIST=1 时，每请求的结构化日志（脱敏）追加到
//     ~/.llm-workbench/logs.ndjson，重启后仍可经「加载历史」回看；平时全内存。

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { estimateCost } from './pricing.js';

export interface CallLog {
  id: number;
  ts: number;
  provider: string;
  model: string;
  method: string;
  path: string;
  status: number | null; // null = 网络/传输层错误（未拿到 HTTP 状态码）
  latencyMs: number;
  ttftMs: number | null; // 首字延迟（流式首包 - 请求发出）
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null; // 命中缓存的 input token 数
  cacheHitRate: number | null; // 0..1
  error: string | null; // 错误归类/原因
  requestBytes: number;
  responseBytes: number;
  costUsd: number; // 本次调用估算成本（USD），由 recordCall 计算
  requestId?: string | null; // B5：每请求全局唯一 ID，贯穿响应头与日志，便于关联排查
  keyMask?: string | null; // B5：本次调用所用 Key 的脱敏掩码（如 ****abcd），不留存明文
  fromCache?: boolean; // 是否由响应缓存直接回放（未真正调用上游）
  keySwitches?: number; // 本次调用发生的关键切换次数（多 key 轮询/失败切换）
}

export interface ProviderMetrics {
  provider: string;
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCostUsd: number; // 累计估算成本（USD）
  totalKeySwitches: number; // 累计 key 切换次数
  avgLatencyMs: number; // 近 50 次滚动平均
  cacheHitRate: number; // 平均缓存命中率（0..1，按有值样本平均）
  inputRateTokS: number; // 近 10s 输入速率
  outputRateTokS: number; // 近 10s 输出速率
  reqRate: number; // 近 10s 请求速率 (req/s)
  lastStatus: number | null;
  lastError: string | null;
  lastTs: number | null;
}

const MAX_LOGS = 500;
const RATE_WINDOW_MS = 10_000;
const AVG_SAMPLES = 50;
const DAILY_TTL_DAYS = 7;

let logs: CallLog[] = [];
let nextId = 1;

// 当日 token 消耗分桶（key = 本地日期 YYYY-MM-DD），用于浮窗「当日消耗 token」
const dailyBuckets = new Map<
  string,
  { input: number; output: number; cacheRead: number; cost: number }
>();

// 全局速率历史采样（每 2s 由 index.ts 触发），用于浮窗趋势图（服务端持久，重启清零）
const RATE_HISTORY_MAX = 180;
const rateHistory: { t: number; inRate: number; outRate: number }[] = [];

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const agg: Map<
  string,
  {
    total: number;
    success: number;
    error: number;
    input: number;
    output: number;
    cacheRead: number;
    cost: number;
    keySwitches: number;
    cacheHitRateSum: number;
    cacheHitRateCount: number;
    latencies: number[];
    recent: { ts: number; input: number; output: number }[];
    lastStatus: number | null;
    lastError: string | null;
    lastTs: number | null;
  }
> = new Map();

// ───────── B5：结构化日志持久化（LOG_PERSIST=1 时启用）─────────
const LOG_FILE = path.join(os.homedir(), '.llm-workbench', 'logs.ndjson');

/** 脱敏 Key：仅保留末 4 位，前缀 ****，避免明文落入磁盘 */
export function maskKey(k: string | undefined | null): string | null {
  if (!k) return null;
  const s = String(k);
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

function persistEnabled(): boolean {
  return process.env.LOG_PERSIST === '1';
}

/** 是否已有可加载的历史日志文件（前端据此决定是否显示「加载历史」） */
export function persistedLogsAvailable(): boolean {
  try {
    return fs.existsSync(LOG_FILE);
  } catch {
    return false;
  }
}

/** 把一条结构化日志追加写入 ndjson（一行一条 JSON）。失败静默，不影响主流程 */
function appendPersisted(entry: CallLog): void {
  if (!persistEnabled()) return;
  try {
    const dir = path.dirname(LOG_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    /* 落盘失败不应影响主流程 */
  }
}

/** 读取历史结构化日志（ndjson），最新在前，支持与实时相同的过滤 */
export function loadPersistedLogs(filter: LogFilter = {}): CallLog[] {
  let raw: string;
  try {
    raw = fs.readFileSync(LOG_FILE, 'utf8');
  } catch {
    return [];
  }
  const all: CallLog[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      all.push(JSON.parse(t) as CallLog);
    } catch {
      /* 跳过损坏行 */
    }
  }
  let result = all.slice().reverse();
  if (filter.provider) result = result.filter((l) => l.provider === filter.provider);
  if (filter.status === 'ok')
    result = result.filter((l) => l.status !== null && l.status >= 200 && l.status < 400);
  if (filter.status === 'error')
    result = result.filter((l) => l.status === null || l.status >= 400);
  if (filter.limit) result = result.slice(0, filter.limit);
  return result;
}

function ensure(provider: string) {
  let a = agg.get(provider);
  if (!a) {
    a = {
      total: 0,
      success: 0,
      error: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cost: 0,
      keySwitches: 0,
      cacheHitRateSum: 0,
      cacheHitRateCount: 0,
      latencies: [],
      recent: [],
      lastStatus: null,
      lastError: null,
      lastTs: null,
    };
    agg.set(provider, a);
  }
  return a;
}

export function recordCall(log: Omit<CallLog, 'id' | 'costUsd'>): CallLog {
  const cost = estimateCost(
    log.provider,
    log.model,
    log.inputTokens,
    log.outputTokens,
    log.cacheReadTokens,
  );
  const entry: CallLog = { ...log, costUsd: cost.total, id: nextId++ };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(logs.length - MAX_LOGS);
  // B5：可选落盘（脱敏结构化日志）
  appendPersisted(entry);

  const a = ensure(log.provider);
  a.total += 1;
  if (log.status && log.status >= 200 && log.status < 400) a.success += 1;
  else a.error += 1;
  if (log.inputTokens) a.input += log.inputTokens;
  if (log.outputTokens) a.output += log.outputTokens;
  if (log.cacheReadTokens) a.cacheRead += log.cacheReadTokens;
  if (log.keySwitches) a.keySwitches += log.keySwitches;
  if (log.cacheHitRate != null) {
    a.cacheHitRateSum += log.cacheHitRate;
    a.cacheHitRateCount += 1;
  }
  a.cost += cost.total;

  // 当日分桶：按本地日期累计 token / 成本
  const dk = todayKey(new Date(log.ts));
  let db = dailyBuckets.get(dk);
  if (!db) {
    db = { input: 0, output: 0, cacheRead: 0, cost: 0 };
    dailyBuckets.set(dk, db);
  }
  if (log.inputTokens) db.input += log.inputTokens;
  if (log.outputTokens) db.output += log.outputTokens;
  if (log.cacheReadTokens) db.cacheRead += log.cacheReadTokens;
  db.cost += cost.total;
  // 仅保留最近 DAILY_TTL_DAYS 天，避免内存无限增长
  if (dailyBuckets.size > DAILY_TTL_DAYS) {
    const keys = [...dailyBuckets.keys()].sort();
    while (dailyBuckets.size > DAILY_TTL_DAYS) dailyBuckets.delete(keys.shift()!);
  }
  a.latencies.push(log.latencyMs);
  if (a.latencies.length > AVG_SAMPLES) a.latencies.shift();
  if (log.inputTokens || log.outputTokens) {
    a.recent.push({ ts: log.ts, input: log.inputTokens ?? 0, output: log.outputTokens ?? 0 });
  }
  a.lastStatus = log.status;
  a.lastError = log.error;
  a.lastTs = log.ts;
  return entry;
}

function windowed(provider: string) {
  const a = agg.get(provider);
  if (!a) return { inputRate: 0, outputRate: 0, reqRate: 0 };
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  // 修剪过期样本
  while (a.recent.length && a.recent[0].ts < cutoff) a.recent.shift();
  let inTok = 0;
  let outTok = 0;
  for (const r of a.recent) {
    inTok += r.input;
    outTok += r.output;
  }
  const windowSec = RATE_WINDOW_MS / 1000;
  return {
    inputRate: Math.round((inTok / windowSec) * 10) / 10,
    outputRate: Math.round((outTok / windowSec) * 10) / 10,
    reqRate: Math.round((a.recent.length / windowSec) * 10) / 10,
  };
}

/** 延迟直方图分桶边界（ms）：用于 Prometheus histogram 与 Grafana 延迟分布 */
export const LATENCY_BUCKETS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

/** 每厂商延迟直方图：基于保留的近 50 次原始延迟样本统计分桶计数/总和/样本数 */
export function getLatencyHistogram(): {
  provider: string;
  buckets: number[];
  counts: number[];
  sum: number;
  count: number;
}[] {
  return [...agg.entries()].map(([provider, a]) => {
    const counts = LATENCY_BUCKETS.map((b) => a.latencies.filter((l) => l <= b).length);
    const sum = a.latencies.reduce((s, x) => s + x, 0);
    return { provider, buckets: LATENCY_BUCKETS, counts, sum, count: a.latencies.length };
  });
}

export function getMetrics(): ProviderMetrics[] {
  const out: ProviderMetrics[] = [];
  for (const [provider, a] of agg.entries()) {
    const w = windowed(provider);
    const avgLatency = a.latencies.length
      ? Math.round(a.latencies.reduce((s, x) => s + x, 0) / a.latencies.length)
      : 0;
    out.push({
      provider,
      totalRequests: a.total,
      successRequests: a.success,
      errorRequests: a.error,
      totalInputTokens: a.input,
      totalOutputTokens: a.output,
      totalCacheReadTokens: a.cacheRead,
      totalCostUsd: Math.round(a.cost * 1e6) / 1e6,
      totalKeySwitches: a.keySwitches,
      avgLatencyMs: avgLatency,
      cacheHitRate: a.cacheHitRateCount
        ? Math.round((a.cacheHitRateSum / a.cacheHitRateCount) * 1000) / 1000
        : 0,
      inputRateTokS: w.inputRate,
      outputRateTokS: w.outputRate,
      reqRate: w.reqRate,
      lastStatus: a.lastStatus,
      lastError: a.lastError,
      lastTs: a.lastTs,
    });
  }
  // 注意括号：`??` 优先级低于 `-`，必须显式分组，否则会解析成 `y.lastTs ?? (0 - (...))`
  return out.sort((x, y) => (y.lastTs ?? 0) - (x.lastTs ?? 0));
}

export interface RateSample {
  t: number; // 采样时间戳（ms）
  inRate: number; // 全局输入速率 tok/s
  outRate: number; // 全局输出速率 tok/s
}

export interface ProxySummary {
  inputRateTokS: number; // 全局聚合输入速率
  outputRateTokS: number; // 全局聚合输出速率
  reqRate: number; // 全局聚合请求速率
  todayInputTokens: number; // 当日输入 tokens
  todayOutputTokens: number; // 当日输出 tokens
  todayCacheReadTokens: number; // 当日缓存命中 tokens
  todayCostUsd: number; // 当日估算成本（USD）
  totalCostUsd: number; // 累计估算成本（USD）
  cacheHitRateToday: number | null; // 当日缓存命中率 0..1
  recentModels: { model: string; provider: string; ts: number }[]; // 最近使用的模型
  rateHistory: RateSample[]; // 全局速率历史采样（服务端持久，重启清零）
  rateHistoryMax: number; // 历史采样容量（点）
}

/** 当前全局速率（供速率历史采样复用） */
function currentGlobalRates(): { inRate: number; outRate: number } {
  const ms = getMetrics();
  let inRate = 0;
  let outRate = 0;
  for (const m of ms) {
    inRate += m.inputRateTokS;
    outRate += m.outputRateTokS;
  }
  return { inRate: Math.round(inRate * 10) / 10, outRate: Math.round(outRate * 10) / 10 };
}

/** 由 index.ts 定时触发：采样一次全局速率进历史缓冲（重启清零，不落盘） */
export function sampleRateHistory(): void {
  const { inRate, outRate } = currentGlobalRates();
  rateHistory.push({ t: Date.now(), inRate, outRate });
  if (rateHistory.length > RATE_HISTORY_MAX) rateHistory.shift();
}

export function getRateHistory(): RateSample[] {
  return rateHistory.slice();
}

/** 浮窗汇总：聚合全局速率 + 当日分桶 + 最近模型 */
export function getSummary(): ProxySummary {
  const ms = getMetrics();
  let inRate = 0;
  let outRate = 0;
  let reqRate = 0;
  let totalCost = 0;
  for (const m of ms) {
    inRate += m.inputRateTokS;
    outRate += m.outputRateTokS;
    reqRate += m.reqRate;
    totalCost += m.totalCostUsd;
  }
  const d = dailyBuckets.get(todayKey()) ?? { input: 0, output: 0, cacheRead: 0, cost: 0 };
  const cacheHitRateToday = d.input > 0 ? Math.round((d.cacheRead / d.input) * 1000) / 1000 : null;
  const recent = logs
    .slice()
    .reverse()
    .slice(0, 6)
    .map((l) => ({ model: l.model, provider: l.provider, ts: l.ts }));
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    inputRateTokS: Math.round(inRate * 10) / 10,
    outputRateTokS: Math.round(outRate * 10) / 10,
    reqRate: Math.round(reqRate * 10) / 10,
    todayInputTokens: d.input,
    todayOutputTokens: d.output,
    todayCacheReadTokens: d.cacheRead,
    todayCostUsd: round(d.cost),
    totalCostUsd: round(totalCost),
    cacheHitRateToday,
    recentModels: recent,
    rateHistory: getRateHistory(),
    rateHistoryMax: RATE_HISTORY_MAX,
  };
}

export interface LogFilter {
  provider?: string;
  status?: 'ok' | 'error';
  limit?: number;
}

export function getLogs(filter: LogFilter = {}): CallLog[] {
  let result = logs.slice().reverse();
  if (filter.provider) result = result.filter((l) => l.provider === filter.provider);
  if (filter.status === 'ok')
    result = result.filter((l) => l.status !== null && l.status >= 200 && l.status < 400);
  if (filter.status === 'error')
    result = result.filter((l) => l.status === null || l.status >= 400);
  if (filter.limit) result = result.slice(0, filter.limit);
  return result;
}

export function resetMetrics(): void {
  logs = [];
  nextId = 1;
  agg.clear();
  dailyBuckets.clear();
  rateHistory.length = 0;
}
