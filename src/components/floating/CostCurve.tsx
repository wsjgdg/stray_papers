// 单值序列迷你面积图（今日累计成本曲线）
export function CostCurve({ values, bg }: { values: number[]; bg: string }) {
  const W = 236;
  const H = 26;
  const pad = 2;
  if (values.length < 2) {
    return <div style={{ height: H, background: bg }} className="rounded-md" />;
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
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="rounded-md"
      style={{ height: H, background: bg }}
      preserveAspectRatio="none"
    >
      <path d={areaPath} fill="#a78bfa" fillOpacity={0.15} />
      <path d={linePath} fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
