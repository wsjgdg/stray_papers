// 浮窗共享格式化 / 类型 / 阈值告警
export type Pos = { left: number; top: number };
export type Theme = 'dark' | 'light';
export type FocusMetric = 'rate' | 'cache' | 'cost' | 'model';
export const FOCUS_LABEL: Record<FocusMetric, string> = {
  rate: '速率',
  cache: '缓存',
  cost: '成本',
  model: '模型',
};
export const FOCUS_NEXT: Record<FocusMetric, FocusMetric> = {
  rate: 'cache',
  cache: 'cost',
  cost: 'model',
  model: 'rate',
};

export function fmtTok(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// 本地日期（YYYY-MM-DD），用于判断统计是否同一天（跨日则重置）
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 阈值告警：用服务端速率历史的「近期中位数」作基线，最新值相对基线突增则标色。
export type Tone = 'normal' | 'warn' | 'alert';

/** E3：成本异动文案（服务端已判级，前端只负责措辞，保证与服务端判据同源） */
export function costSpikeText(s: {
  costSpikeLevel: Tone;
  costSpikeRatio: number | null;
  costSampleHours: number;
}): string {
  const { costSpikeLevel, costSpikeRatio, costSampleHours } = s;
  if (costSampleHours < 3) return '成本异动：基线积累中';
  if (costSpikeRatio == null) return '成本异动：暂无基线';
  const r = `${costSpikeRatio.toFixed(2)}×`;
  if (costSpikeLevel === 'alert') return `成本异动：⚠ ${r} 基线`;
  if (costSpikeLevel === 'warn') return `成本异动：${r} 基线`;
  return '成本异动：正常';
}

export function spikeLevel(
  history: { inRate: number; outRate: number }[] | undefined,
  key: 'inRate' | 'outRate',
): Tone {
  if (!history || history.length < 6) return 'normal';
  const baseline = history
    .slice(0, -1)
    .map((h) => h[key])
    .filter((v) => v > 0);
  if (baseline.length < 3) return 'normal';
  const sorted = [...baseline].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const latest = history[history.length - 1][key];
  if (median <= 0) return 'normal';
  const ratio = latest / median;
  if (ratio >= 3) return 'alert';
  if (ratio >= 1.8) return 'warn';
  return 'normal';
}
