// D4：日粒度用量持久化（provider × model × tag × day），解决指标"重启失忆"。
// 数据文件 <dataDir>/usage-daily.json；recordCall 时累加，脏标记 + 5s 节流落盘，
// stopUsageStore 强制 flush；保留 RETENTION_DAYS 天（init/flush 时裁剪）。
// B2：新增 tag 维度（多项目共用一套 Key 时按 tag 归集成本）；未带标签记为 UNTAGGED。
// 注意：本模块不 import metrics（避免循环依赖），dayKey 与 metrics.todayKey 保持同口径（本地日期）。
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, configDir } from './config.js';

export interface UsageCell {
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cost: number;
}

/** 未携带 x-lb-tag 时的默认标签桶 */
export const UNTAGGED = '(untagged)';

// day → provider → model → tag → cell
export type UsageData = Record<string, Record<string, Record<string, Record<string, UsageCell>>>>;

const RETENTION_DAYS = 90;
const FLUSH_INTERVAL_MS = 5000;

let data: UsageData = {};
let dirty = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function usagePath(): string {
  return path.join(configDir(), 'usage-daily.json');
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 校验并规范化磁盘数据：结构不对/字段非法的条目直接丢弃（宁可少算不可算错）
export function sanitize(raw: unknown): UsageData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: UsageData = {};
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
  const asCell = (cell: Record<string, unknown>): UsageCell => ({
    requests: num(cell.requests),
    input: num(cell.input),
    output: num(cell.output),
    cacheRead: num(cell.cacheRead),
    cost: num(cell.cost),
  });
  for (const [day, providers] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !providers || typeof providers !== 'object') continue;
    for (const [provider, models] of Object.entries(providers as Record<string, unknown>)) {
      if (!models || typeof models !== 'object') continue;
      const bucket = (out[day] ??= {});
      const p = (bucket[provider] ??= {});
      for (const [model, val] of Object.entries(models as Record<string, unknown>)) {
        if (!val || typeof val !== 'object') continue;
        // 兼容旧结构：day→provider→model→cell（无 tag 层）时，折叠进 UNTAGGED 桶
        if (typeof (val as Record<string, unknown>).requests === 'number') {
          (p[model] ??= {})[UNTAGGED] = asCell(val as Record<string, unknown>);
          continue;
        }
        // 新结构：day→provider→model→tag→cell
        const tagMap = (p[model] ??= {});
        for (const [tag, cell] of Object.entries(val as Record<string, unknown>)) {
          if (!cell || typeof cell !== 'object') continue;
          tagMap[tag] = asCell(cell as Record<string, unknown>);
        }
      }
    }
  }
  return out;
}

function prune(now = Date.now()): void {
  const cutoff = localDayKey(new Date(now - RETENTION_DAYS * 86_400_000));
  for (const day of Object.keys(data)) {
    if (day < cutoff) delete data[day];
  }
}

/** 启动时调用（initConfigStore 之后）：加载存档并启动节流落盘定时器 */
export function initUsageStore(): void {
  try {
    data = sanitize(JSON.parse(fs.readFileSync(usagePath(), 'utf8')));
  } catch {
    data = {}; // 首启无存档或损坏：从空开始
  }
  prune();
  flushTimer = setInterval(() => {
    if (dirty) flush();
  }, FLUSH_INTERVAL_MS);
}

/** 退出/关停时调用：停定时器并强制落盘 */
export function stopUsageStore(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush();
}

export function recordUsage(
  ts: number,
  provider: string,
  model: string,
  tag: string | null,
  input: number | null,
  output: number | null,
  cacheRead: number | null,
  costUsd: number,
): void {
  const day = localDayKey(new Date(ts));
  const tagKey = tag && tag.trim() ? tag.trim() : UNTAGGED;
  const cell = ((((data[day] ??= {})[provider] ??= {})[model] ??= {})[tagKey] ??= {
    requests: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cost: 0,
  });
  cell.requests += 1;
  cell.input += input ?? 0;
  cell.output += output ?? 0;
  cell.cacheRead += cacheRead ?? 0;
  cell.cost += costUsd;
  dirty = true;
}

/** 同步落盘（节流定时器与导出前调用）；失败保留脏标记下轮重试 */
export function flush(): void {
  if (!dirty) return;
  try {
    prune();
    fs.mkdirSync(configDir(), { recursive: true });
    atomicWriteJson(usagePath(), JSON.stringify(data));
    dirty = false;
  } catch {
    /* 落盘失败保留 dirty，下轮重试 */
  }
}

/**
 * 导出用：把持久化用量展平为 SpendSource 形态（每 cell 一条，ts 取当日本地零点）。
 * 记录口径 = recordCall 全量，因此导出以本存储为准（内存日志环只有 500 条）。
 */
export function usageSpendSources(): {
  ts: number;
  provider: string;
  model: string;
  tag: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}[] {
  const out: {
    ts: number;
    provider: string;
    model: string;
    tag: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  }[] = [];
  for (const [day, providers] of Object.entries(data)) {
    const ts = new Date(`${day}T00:00:00`).getTime();
    for (const [provider, models] of Object.entries(providers)) {
      for (const [model, tags] of Object.entries(models)) {
        for (const [tag, cell] of Object.entries(tags)) {
          out.push({
            ts,
            provider,
            model,
            tag,
            inputTokens: cell.input,
            outputTokens: cell.output,
            cacheReadTokens: cell.cacheRead,
            costUsd: cell.cost,
          });
        }
      }
    }
  }
  return out;
}

export interface UsageByTagRow {
  tag: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

/**
 * 按 tag 聚合支出（B2：多项目共用一套 Key 时归集成本）。days>0 时仅统计最近 N 天。
 * 未携带标签的调用归入 UNTAGGED。按成本降序。
 */
export function usageByTag(opts: { days?: number } = {}): UsageByTagRow[] {
  const days = opts.days && opts.days > 0 ? opts.days : null;
  const now = Date.now();
  const floorTs = days !== null ? now - (days - 1) * 86_400_000 : null;
  const map = new Map<string, UsageByTagRow>();
  for (const [day, providers] of Object.entries(data)) {
    const ts = new Date(`${day}T00:00:00`).getTime();
    if (floorTs !== null && ts < floorTs) continue;
    for (const models of Object.values(providers)) {
      for (const tags of Object.values(models)) {
        for (const [tag, cell] of Object.entries(tags)) {
          let row = map.get(tag);
          if (!row) {
            row = {
              tag,
              requests: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              costUsd: 0,
            };
            map.set(tag, row);
          }
          row.requests += cell.requests;
          row.inputTokens += cell.input;
          row.outputTokens += cell.output;
          row.cacheReadTokens += cell.cacheRead;
          row.costUsd += cell.cost;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

// ───────── E1：日粒度合计 + 月终预测 ─────────

export interface UsageDayTotal {
  day: string; // YYYY-MM-DD（本地日）
  cost: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageTotals {
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cost: number;
}

const EMPTY_TOTALS: UsageTotals = { requests: 0, input: 0, output: 0, cacheRead: 0, cost: 0 };

/** 金额统一 6 位小数收敛，避免浮点尾差泄漏到 API/UI */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * 指定日的合计。E1 起「当日成本」的唯一口径：
 * 本模块内存态由 recordUsage 同步更新，且启动时从磁盘载入 —— 因此跨重启不丢，
 * 而 metrics 的内存日桶重启即归零（会让日预算 fail-closed 守卫静默失效）。
 */
export function usageDayTotalsOf(day: string): UsageTotals {
  const providers = data[day];
  if (!providers) return { ...EMPTY_TOTALS };
  const out: UsageTotals = { requests: 0, input: 0, output: 0, cacheRead: 0, cost: 0 };
  for (const models of Object.values(providers)) {
    for (const tags of Object.values(models)) {
      for (const cell of Object.values(tags)) {
        out.requests += cell.requests;
        out.input += cell.input;
        out.output += cell.output;
        out.cacheRead += cell.cacheRead;
        out.cost += cell.cost;
      }
    }
  }
  return out;
}

/** 今日合计（本地日）；now 可注入便于测试 */
export function usageTodayTotals(now = Date.now()): UsageTotals {
  return usageDayTotalsOf(localDayKey(new Date(now)));
}

/** 今日成本（USD，6 位小数收敛）：日预算阈值判定与展示统一使用 */
export function usageTodayCost(now = Date.now()): number {
  return round6(usageTodayTotals(now).cost);
}

/** 日粒度合计（按日期升序）：供月度/趋势聚合使用（复用单日实现，口径唯一） */
export function usageDayTotals(): UsageDayTotal[] {
  return Object.keys(data)
    .sort()
    .map((day) => {
      const t = usageDayTotalsOf(day);
      return {
        day,
        cost: t.cost,
        requests: t.requests,
        inputTokens: t.input,
        outputTokens: t.output,
      };
    });
}

/** 月终预测参与均值的天数窗口（已完成日，不含今日） */
export const MONTH_RECENT_WINDOW_DAYS = 7;

export interface MonthProjection {
  month: string; // YYYY-MM
  monthToDateUsd: number;
  todayUsd: number;
  elapsedDays: number; // 本月已过天数（含今日）
  daysInMonth: number;
  remainingDays: number; // 本月剩余天数（不含今日）
  windowDays: number; // 真正参与日均的已完成天数（≤7）
  recentDailyAvgUsd: number; // 窗口内日均（缺失天按 0 计）
  basis: 'recent' | 'today'; // 外推依据：窗口内已完成日均 / 月初仅有今日成本
  projectedMonthUsd: number; // 线性外推的月终成本
  projectedOverageUsd: number | null; // 相对 monthlyUsd 的预计超额（未超为 0；未设月度预算为 null）
}

/**
 * 纯函数：按「已完成日均 × 剩余天数 + 本月至今」线性外推月终成本。
 * - 今日为部分交易日，故不进入均值分母，避免系统性地低估；
 * - 窗口取最近 min(7, 已过天数-1) 天，缺失的天按 0 计入（真实反映"这 7 天平均每天花多少"）；
 * - 1 号（无已完成日）退化为 basis='today'，用今日至今成本作为日成本估计。
 * 依赖传入的 dayTotals（usageDayTotals() 输出），不做任何 IO，便于单测。
 */
export function projectMonthEnd(
  dayTotals: readonly { day: string; cost: number }[],
  now: number,
  monthlyUsd?: number | null,
): MonthProjection {
  const d = new Date(now);
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const elapsedDays = d.getDate();
  const todayKey = localDayKey(d);

  const costOf = new Map<string, number>();
  let monthToDateUsd = 0;
  for (const row of dayTotals) {
    costOf.set(row.day, row.cost);
    if (row.day.startsWith(month)) monthToDateUsd += row.cost;
  }
  const todayUsd = costOf.get(todayKey) ?? 0;

  const windowDays = Math.min(MONTH_RECENT_WINDOW_DAYS, Math.max(0, elapsedDays - 1));
  let windowSum = 0;
  for (let i = 1; i <= windowDays; i += 1) {
    windowSum += costOf.get(localDayKey(new Date(now - i * 86_400_000))) ?? 0;
  }
  const basis: MonthProjection['basis'] = windowDays > 0 ? 'recent' : 'today';
  const recentDailyAvgUsd = round6(windowDays > 0 ? windowSum / windowDays : monthToDateUsd);
  const remainingDays = daysInMonth - elapsedDays;
  const projectedMonthUsd = round6(monthToDateUsd + recentDailyAvgUsd * remainingDays);

  return {
    month,
    monthToDateUsd: round6(monthToDateUsd),
    todayUsd: round6(todayUsd),
    elapsedDays,
    daysInMonth,
    remainingDays,
    windowDays,
    recentDailyAvgUsd,
    basis,
    projectedMonthUsd,
    projectedOverageUsd:
      monthlyUsd && monthlyUsd > 0 ? round6(Math.max(0, projectedMonthUsd - monthlyUsd)) : null,
  };
}

/** 组合入口：读取持久化用量并做月终预测（路由层用）；now 可注入便于测试 */
export function usageMonthProjection(
  monthlyUsd?: number | null,
  now = Date.now(),
): MonthProjection {
  return projectMonthEnd(usageDayTotals(), now, monthlyUsd);
}
