// D2 成本导出：把调用日志按「日 × 厂商 × 模型」聚合成支出行，支持 CSV/JSON 输出。
// 聚合与序列化均为纯函数，与 IO 解耦便于单测；CSV 做标准转义 + 公式注入防护
// （文本单元格以 =+-@ 开头时前置单引号，避免 Excel/Sheets 当公式执行）。
import { todayKey, type CallLog } from './metrics.js';

export interface SpendRow {
  day: string; // 本地日期 YYYY-MM-DD
  provider: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

// 聚合只依赖这些字段，测试无需构造完整 CallLog
export type SpendSource = Pick<
  CallLog,
  'ts' | 'provider' | 'model' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'costUsd'
>;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 按「日 × 厂商 × 模型」聚合支出。
 * days > 0 时仅保留最近 N 天（含今天）的调用；缺省聚合全部。
 * 排序：日期新的在前，同日内按 provider、model 字典序。
 */
export function aggregateSpend(logs: SpendSource[], opts: { days?: number } = {}): SpendRow[] {
  const days = opts.days && opts.days > 0 ? opts.days : null;
  const floorTs = days !== null ? startOfDay(Date.now() - (days - 1) * 86_400_000) : null;

  const map = new Map<string, SpendRow>();
  for (const log of logs) {
    if (floorTs !== null && log.ts < floorTs) continue;
    const day = todayKey(new Date(log.ts));
    const key = `${day}|${log.provider}|${log.model}`;
    let row = map.get(key);
    if (!row) {
      row = {
        day,
        provider: log.provider,
        model: log.model,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0,
      };
      map.set(key, row);
    }
    row.requests += 1;
    row.inputTokens += log.inputTokens ?? 0;
    row.outputTokens += log.outputTokens ?? 0;
    row.cacheReadTokens += log.cacheReadTokens ?? 0;
    row.costUsd += log.costUsd ?? 0;
  }

  return [...map.values()].sort((a, b) =>
    a.day === b.day
      ? a.provider === b.provider
        ? a.model.localeCompare(b.model)
        : a.provider.localeCompare(b.provider)
      : b.day.localeCompare(a.day),
  );
}

function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`; // 公式注入防护
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADER = [
  'day',
  'provider',
  'model',
  'requests',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'costUsd',
];

export function spendToCsv(rows: SpendRow[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.day,
        r.provider,
        r.model,
        r.requests,
        r.inputTokens,
        r.outputTokens,
        r.cacheReadTokens,
        r.costUsd.toFixed(6),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
