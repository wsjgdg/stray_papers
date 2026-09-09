// 速率趋势迷你图
export function Sparkline({ samples, bg }: { samples: { in: number; out: number }[]; bg: string }) {
  const W = 236;
  const H = 36;
  const pad = 2;
  if (samples.length < 2) {
    return <div style={{ height: H, background: bg }} className="rounded-md" />;
  }
  const max = Math.max(1, ...samples.map((s) => Math.max(s.in, s.out)));
  const n = samples.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - v / max) * (H - pad * 2);
  const line = (key: 'in' | 'out') =>
    samples
      .map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`)
      .join(' ');
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="rounded-md"
      style={{ height: H, background: bg }}
      preserveAspectRatio="none"
    >
      <path d={line('out')} fill="none" stroke="#5ec8a0" strokeWidth={1.5} strokeLinejoin="round" />
      <path d={line('in')} fill="none" stroke="#5b9bff" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
