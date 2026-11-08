// 内存指标存储：每厂商聚合计数 + 滑动窗口速率 + 环形日志缓冲。
// 重启即清零（不落盘，避免留存敏感调用痕迹）。
// B5：可选持久化 —— 设 LOG_PERSIST=1 时，每请求的结构化日志（脱敏）追加到
//     ~/.llm-workbench/logs.ndjson，重启后仍可经「加载历史」回看；平时全内存。

import * as fs from 'node:fs';
import * as path from 'node:path';
import { estimateCost } from './pricing.js';
import { configDir } from './config.js';
import { recordUsage, usageTodayTotals } from './usageStore.js';
import { addKeySpend } from './keyBudget.js';

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
  routeChain?: string[]; // B1：本次请求规划的完整回退链（模型路由），便于回溯 fallback 路径
  tag?: string | null; // B2：调用标签（x-lb-tag 头），多项目共用 Key 时按 tag 归集成本
  // B4：请求体（截断存档，仅内存环形缓冲持有，不写入 ndjson）——用于「重放」排障
  reqBody?: string | null;
  reqBodyTruncated?: boolean;
}

/** B4：请求体存档上限（超出截断）；仅在内存中保留，避免把 prompt 落盘 */
export const MAX_REQ_BODY_BYTES = 32 * 1024;

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

let logs: CallLog[] = [];
let nextId = 1;

// 全局速率历史采样（每 2s 由 index.ts 触发），用于浮窗趋势图（服务端持久，重启清零）
const RATE_HISTORY_MAX = 180;
const rateHistory: { t: number; inRate: number; outRate: number }[] = [];

// E3：小时成本环（key = 本地 'YYYY-MM-DDTHH'），用于成本异动告警。
// 只在内存保留最近 25 小时（当前小时 + 24 个已完成小时）；重启后需重新积累基线。
const HOUR_BUCKET_MAX = 25;
const hourBuckets = new Map<string, { cost: number; requests: number }>();

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hourKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
}

export { todayKey, hourKey };

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
const LOG_FILE = path.join(configDir(), 'logs.ndjson');

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

/**
 * 把一条结构化日志追加写入 ndjson（一行一条 JSON）。失败静默，不影响主流程。
 * B4：请求体可能含 prompt 等敏感内容 → 落盘前剥离（reqBody 置 null），重放能力仅限内存态。
 */
function appendPersisted(entry: CallLog): void {
  if (!persistEnabled()) return;
  try {
    const dir = path.dirname(LOG_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify({ ...entry, reqBody: null }) + '\n', 'utf8');
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
  return applyLogFilter(all.slice().reverse(), filter);
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
  // B3：按 (provider, keyMask) 累计当日成本，供单 Key 日预算超限时跳过该 Key
  if (log.keyMask) addKeySpend(log.provider, log.keyMask, cost.total);
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

  // D4/E1：日粒度用量落盘（provider×model×tag×day，保留 90 天）。
  // 「当日成本/token」的唯一口径在 usageStore（内存态同步更新 + 启动从磁盘载入，跨重启不丢），
  // 因此这里不再另设内存日桶——避免两套数据在重启后互相矛盾。
  recordUsage(
    log.ts,
    log.provider,
    log.model,
    log.tag ?? null,
    log.inputTokens,
    log.outputTokens,
    log.cacheReadTokens,
    cost.total,
  );
  // E3：按本地小时累计成本，作为成本异动告警的基线与当前值（仅内存，保留最近 25 小时）
  const hk = hourKey(new Date(log.ts));
  const hb = hourBuckets.get(hk) ?? { cost: 0, requests: 0 };
  hb.cost += cost.total;
  hb.requests += 1;
  hourBuckets.set(hk, hb);
  if (hourBuckets.size > HOUR_BUCKET_MAX) {
    const hks = [...hourBuckets.keys()].sort();
    while (hourBuckets.size > HOUR_BUCKET_MAX) hourBuckets.delete(hks.shift()!);
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
  // E3：成本异动（当前小时 vs 已完成小时基线）
  hourCostUsd: number; // 当前小时累计成本（USD）
  costBaselinePerHrUsd: number; // 基线（已完成小时每分钟成本中位数 × 60）
  costSpikeRatio: number | null; // 折算每分钟成本 / 基线每分钟成本
  costSpikeLevel: 'normal' | 'warn' | 'alert'; // ≥3× alert、≥1.8× warn
  costSampleHours: number; // 参与基线的已完成小时数
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

/** 浮窗汇总：聚合全局速率 + 当日用量（持久化口径，跨重启不丢）+ 最近模型 */
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
  const t = usageTodayTotals();
  const cacheHitRateToday = t.input > 0 ? Math.round((t.cacheRead / t.input) * 1000) / 1000 : null;
  const spike = currentCostSpike();
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
    todayInputTokens: t.input,
    todayOutputTokens: t.output,
    todayCacheReadTokens: t.cacheRead,
    todayCostUsd: round(t.cost),
    totalCostUsd: round(totalCost),
    cacheHitRateToday,
    recentModels: recent,
    rateHistory: getRateHistory(),
    rateHistoryMax: RATE_HISTORY_MAX,
    hourCostUsd: spike.hourCostUsd,
    costBaselinePerHrUsd: spike.baselinePerHourUsd,
    costSpikeRatio: spike.ratio,
    costSpikeLevel: spike.level,
    costSampleHours: spike.sampleHours,
  };
}

export interface LogFilter {
  provider?: string;
  status?: 'ok' | 'error';
  tag?: string;
  /** D4：关键词（大小写不敏感），匹配 model / requestId / error / tag / path / provider */
  q?: string;
  limit?: number;
}

/**
 * D4：日志关键词匹配（纯函数，窗口日志与落盘日志共用同一份语义）。
 * 覆盖排障最常用的几个字段；空查询恒为 true。
 */
export function matchesLogQuery(log: CallLog, q: string | undefined): boolean {
  const needle = (q ?? '').trim().toLowerCase();
  if (!needle) return true;
  const hay = [log.model, log.requestId, log.error, log.tag, log.path, log.provider];
  return hay.some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));
}

/** D4：把 provider / tag / status / 关键词 / limit 依次作用在已按时间倒序的列表上 */
export function applyLogFilter(result: CallLog[], filter: LogFilter): CallLog[] {
  let out = result;
  if (filter.provider) out = out.filter((l) => l.provider === filter.provider);
  if (filter.tag) out = out.filter((l) => (l.tag ?? null) === filter.tag);
  if (filter.status === 'ok')
    out = out.filter((l) => l.status !== null && l.status >= 200 && l.status < 400);
  if (filter.status === 'error') out = out.filter((l) => l.status === null || l.status >= 400);
  if (filter.q) out = out.filter((l) => matchesLogQuery(l, filter.q));
  if (filter.limit) out = out.slice(0, filter.limit);
  return out;
}

export function getLogs(filter: LogFilter = {}): CallLog[] {
  return applyLogFilter(logs.slice().reverse(), filter);
}

/** 按 requestId 精确定位一次调用（响应头 x-request-id 回传），用于前端取用量/成本/TTFT */
export function findLogByRequestId(requestId: string): CallLog | null {
  if (!requestId) return null;
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].requestId === requestId) return logs[i];
  }
  return null;
}

export function resetMetrics(): void {
  logs = [];
  nextId = 1;
  agg.clear();
  rateHistory.length = 0;
  hourBuckets.clear(); // E3：基线与当前小时同属内存态，重置时一并清空，避免残留基线误判
}

// ───────── D3：预算阈值（E1 泛化为日/月共用） ─────────
export interface BudgetStatus {
  level: 'ok' | 'warn' | 'exceed';
  ratio: number | null; // 已用 / 上限（3 位小数）；未设置上限为 null
}

/**
 * 纯函数：通用预算阈值 —— ratio ≥80% 预警、≥100% 超限；未设置上限（null/≤0）恒为 ok。
 * ratio 先四舍五入到 3 位再判级，保证「显示的百分比」与「判级依据」同源，不出现 80% 显示为正常。
 */
export function ratioLevel(usedUsd: number, limitUsd: number | null | undefined): BudgetStatus {
  if (!limitUsd || limitUsd <= 0) return { level: 'ok', ratio: null };
  const ratio = Math.round((usedUsd / limitUsd) * 1000) / 1000;
  if (ratio >= 1) return { level: 'exceed', ratio };
  if (ratio >= 0.8) return { level: 'warn', ratio };
  return { level: 'ok', ratio };
}

/** 日预算阈值（D3 既有语义，等价于 ratioLevel；proxy.ts fail-closed 守卫使用） */
export function budgetStatus(todayUsd: number, dailyUsd: number | null | undefined): BudgetStatus {
  return ratioLevel(todayUsd, dailyUsd);
}

// ───────── E3：成本异动告警 ─────────

/** 当前小时至少要走过这么多分钟才判定（否则折算值在整点附近极不稳定） */
export const COST_SPIKE_MIN_ELAPSED_MIN = 5;
/** 至少要有这么多「有流量的已完成小时」才建立基线 */
export const COST_SPIKE_MIN_BASELINE_HOURS = 3;
/** 折算每分钟成本 / 基线每分钟成本 的告警阈值 */
export const COST_SPIKE_ALERT_RATIO = 3;
export const COST_SPIKE_WARN_RATIO = 1.8;
/** 绝对下限：本小时成本低于此值不告警（避免清闲期一笔小额调用就触发） */
export const COST_SPIKE_MIN_ALERT_USD = 0.01;

export type CostSpikeReason =
  | 'ok' // 已完成判定
  | 'too-early' // 本小时刚开头，样本不足
  | 'insufficient-hours' // 还没有足够的已完成小时做基线
  | 'no-baseline' // 基线为 0（历史有流量但成本记不到）
  | 'below-floor'; // 本小时成本低于绝对下限

export interface CostSpikeStatus {
  level: 'normal' | 'warn' | 'alert';
  reason: CostSpikeReason;
  hourKey: string; // 当前小时的 'YYYY-MM-DDTHH'
  hourCostUsd: number; // 当前小时原始累计成本
  elapsedMinutes: number; // 本小时已过分钟数（保底 1，避免除零）
  perMinuteUsd: number; // 折算每分钟成本
  baselinePerMinUsd: number; // 基线：已完成小时每分钟成本的中位数
  baselinePerHourUsd: number; // 基线的每小时形态（便于展示）
  ratio: number | null; // perMinute / baselinePerMin
  sampleHours: number; // 参与基线的已完成小时数
}

/** 中位数（入参须已升序）：偶数长度取中间两值均值，避免样本少时整体偏大 */
const median = (sorted: readonly number[]): number => {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * 纯函数：用「本小时折算每分钟成本 / 已完成小时的每分钟成本中位数」判断成本是否异动。
 * - **按已过分钟数折算**当前小时，否则整点前几十分钟必然低估、永远不告警；
 * - 基线的分母固定为 60（已完成小时是整小时），与当前小时的折算口径一致；
 * - 基线只取**有流量**的已完成小时：清闲小时天然为 0，纳入会拉低中位数导致噪声；
 * - 三道护栏：本小时至少走 `MIN_ELAPSED` 分钟、至少 `MIN_BASELINE_HOURS` 个样本、本小时成本高于绝对下限。
 * 依赖传入的桶数组（不碰内部状态），便于单测。
 */
export function costSpikeStatus(
  buckets: readonly { hour: string; cost: number; requests: number }[],
  now: number,
): CostSpikeStatus {
  const nowKey = hourKey(new Date(now));
  const elapsedMinutes = new Date(now).getMinutes() + 1; // 至少 1，避免 0 分钟除零
  const current = buckets.find((b) => b.hour === nowKey);
  const hourCostUsd = Math.round((current?.cost ?? 0) * 1e6) / 1e6;
  const perMinuteUsd = Math.round((hourCostUsd / elapsedMinutes) * 1e6) / 1e6;

  const completed = buckets.filter((b) => b.hour < nowKey && b.requests > 0);
  const sampleHours = completed.length;
  const rates = completed.map((b) => b.cost / 60).sort((a, b) => a - b);
  const baselinePerMinUsd = Math.round(median(rates) * 1e6) / 1e6;
  const ratio =
    baselinePerMinUsd > 0 ? Math.round((perMinuteUsd / baselinePerMinUsd) * 1000) / 1000 : null;

  const base = {
    hourKey: nowKey,
    hourCostUsd,
    elapsedMinutes,
    perMinuteUsd,
    baselinePerMinUsd,
    baselinePerHourUsd: Math.round(baselinePerMinUsd * 60 * 1e6) / 1e6,
    ratio,
    sampleHours,
  };

  if (elapsedMinutes < COST_SPIKE_MIN_ELAPSED_MIN)
    return { ...base, level: 'normal', reason: 'too-early' };
  if (sampleHours < COST_SPIKE_MIN_BASELINE_HOURS)
    return { ...base, level: 'normal', reason: 'insufficient-hours' };
  if (baselinePerMinUsd <= 0 || ratio === null)
    return { ...base, level: 'normal', reason: 'no-baseline' };
  if (hourCostUsd < COST_SPIKE_MIN_ALERT_USD)
    return { ...base, level: 'normal', reason: 'below-floor' };
  if (ratio >= COST_SPIKE_ALERT_RATIO) return { ...base, level: 'alert', reason: 'ok' };
  if (ratio >= COST_SPIKE_WARN_RATIO) return { ...base, level: 'warn', reason: 'ok' };
  return { ...base, level: 'normal', reason: 'ok' };
}

/** 当前进程的小时桶快照（升序） */
export function hourCostBuckets(): { hour: string; cost: number; requests: number }[] {
  return [...hourBuckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([hour, v]) => ({ hour, cost: v.cost, requests: v.requests }));
}

/** 当前成本异动状态（读取内存小时环）；now 可注入便于测试 */
export function currentCostSpike(now = Date.now()): CostSpikeStatus {
  return costSpikeStatus(hourCostBuckets(), now);
}
