// 单值序列迷你面积图（今日累计成本曲线）
// 注：bgClass 为 Tailwind 类名；此前误当 CSS 颜色写入 style.background（无效，底色不生效）。
export function CostCurve({ values, bgClass = '' }: { values: number[]; bgClass?: string }) {
  const W = 236;
  const H = 26;
  const pad = 2;
  if (values.length < 2) {
    return <div style={{ height: H }} className={'rounded-md ' + bgClass} />;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const n = values.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / range) * (H - pad * 2);
  const linePath = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${(W - pad).toFixed(1)},${(H - pad).toFixed(1)} L${pad.toFixed(1)},${(H - pad).toFixed(1)} Z`;
  const last = values[values.length - 1];
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className={'rounded-md ' + bgClass}
      style={{ height: H }}
      preserveAspectRatio="none"
      role="img"
      aria-label={`今日累计成本曲线，最新 $${last.toFixed(4)}`}
    >
      <path d={areaPath} fill="var(--c-accent)" fillOpacity={0.15} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--c-accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
