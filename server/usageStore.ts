// D4：日粒度用量持久化（provider × model × day），解决指标"重启失忆"。
// 数据文件 <dataDir>/usage-daily.json；recordCall 时累加，脏标记 + 5s 节流落盘，
// stopUsageStore 强制 flush；保留 RETENTION_DAYS 天（init/flush 时裁剪）。
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

// day → provider → model → cell
export type UsageData = Record<string, Record<string, Record<string, UsageCell>>>;

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
function sanitize(raw: unknown): UsageData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: UsageData = {};
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
  for (const [day, providers] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !providers || typeof providers !== 'object') continue;
    for (const [provider, models] of Object.entries(providers as Record<string, unknown>)) {
      if (!models || typeof models !== 'object') continue;
      for (const [model, cell] of Object.entries(models as Record<string, unknown>)) {
        if (!cell || typeof cell !== 'object') continue;
        const c = cell as Record<string, unknown>;
        const bucket = (out[day] ??= {});
        const p = (bucket[provider] ??= {});
        p[model] = {
          requests: num(c.requests),
          input: num(c.input),
          output: num(c.output),
          cacheRead: num(c.cacheRead),
          cost: num(c.cost),
        };
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
  input: number | null,
  output: number | null,
  cacheRead: number | null,
  costUsd: number,
): void {
  const day = localDayKey(new Date(ts));
  const p = ((data[day] ??= {})[provider] ??= {});
  const cell = (p[model] ??= { requests: 0, input: 0, output: 0, cacheRead: 0, cost: 0 });
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
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}[] {
  const out: {
    ts: number;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  }[] = [];
  for (const [day, providers] of Object.entries(data)) {
    const ts = new Date(`${day}T00:00:00`).getTime();
    for (const [provider, models] of Object.entries(providers)) {
      for (const [model, cell] of Object.entries(models)) {
        out.push({
          ts,
          provider,
          model,
          inputTokens: cell.input,
          outputTokens: cell.output,
          cacheReadTokens: cell.cacheRead,
          costUsd: cell.cost,
        });
      }
    }
  }
  return out;
}
