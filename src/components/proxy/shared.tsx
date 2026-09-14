// proxy 子面板共享：类型 / 常量 / 成本格式化 / 统计小卡
export type SubTab = 'config' | 'play' | 'compare' | 'evals' | 'metrics' | 'logs';

// USD → CNY 近似汇率（仅用于展示换算，非实时）
export const CNY_PER_USD = 7.2;

export type Currency = 'USD' | 'CNY';

export function fmtCost(usd: number, currency: Currency): string {
  if (!Number.isFinite(usd) || usd === 0) return currency === 'USD' ? '$0.00' : '¥0.00';
  const v = currency === 'USD' ? usd : usd * CNY_PER_USD;
  const sym = currency === 'USD' ? '$' : '¥';
  if (v < 0.01) return `${sym}${v.toFixed(4)}`;
  return `${sym}${v.toFixed(2)}`;
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}
