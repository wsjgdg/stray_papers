// 速率趋势迷你图
// 注：bgClass 是 Tailwind 类名（如 bg-sunken / bg-neutral-100）。此前误当作 CSS 颜色塞进
// style.background，导致底色从未生效（style 里不是合法颜色），这里改为按 class 应用。
export function Sparkline({
  samples,
  bgClass = '',
}: {
  samples: { in: number; out: number }[];
  bgClass?: string;
}) {
  const W = 236;
  const H = 36;
  const pad = 2;
  if (samples.length < 2) {
    return <div style={{ height: H }} className={'rounded-md ' + bgClass} />;
  }
  const max = Math.max(1, ...samples.map((s) => Math.max(s.in, s.out)));
  const n = samples.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - v / max) * (H - pad * 2);
  const line = (key: 'in' | 'out') =>
    samples
      .map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`)
      .join(' ');
  const peakIn = Math.round(Math.max(...samples.map((s) => s.in)));
  const peakOut = Math.round(Math.max(...samples.map((s) => s.out)));
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className={'rounded-md ' + bgClass}
      style={{ height: H }}
      preserveAspectRatio="none"
      role="img"
      aria-label={`速率趋势：输入峰值 ${peakIn}/s，输出峰值 ${peakOut}/s`}
    >
      <path
        d={line('out')}
        fill="none"
        stroke="var(--c-down)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d={line('in')}
        fill="none"
        stroke="var(--c-accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
