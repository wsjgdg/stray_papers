"use client";

// ═══ 近四年投档线迷你趋势（纯 SVG，无 echarts 依赖） ═══
export function TrendSpark({
  years,
  values,
}: {
  years: number[];
  values: (number | null)[];
}) {
  const pts = years
    .map((y, i) => ({ y, v: values[i] }))
    .filter((p): p is { y: number; v: number } => p.v != null);
  if (pts.length < 2) return null;
  const W = 320;
  const H = 76;
  const PAD = 14;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = Math.max(max - min, 10); // 分差太小也保留可见波动
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
  const yy = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = pts.map((p, i) => `${x(i)},${yy(p.v)}`).join(" ");
  const delta = pts[pts.length - 1].v - pts[0].v;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xs text-gray-400">
          近四年投档线（{pts.length} 年可比）
        </span>
        <span
          className={`text-xs font-semibold ${delta > 0 ? "text-rose-500" : delta < 0 ? "text-emerald-600" : "text-gray-400"}`}
        >
          {pts[0].y}–{pts[pts.length - 1].y} 年 {delta > 0 ? "+" : ""}
          {delta} 分
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px]">
        <polyline
          points={line}
          fill="none"
          stroke="#6366F1"
          strokeWidth="1.5"
        />
        {pts.map((p, i) => (
          <g key={p.y}>
            <circle cx={x(i)} cy={yy(p.v)} r={3} fill="#6366F1" />
            <text
              x={x(i)}
              y={yy(p.v) - 7}
              textAnchor="middle"
              fontSize="9"
              fill="#475569"
            >
              {p.v}
            </text>
            <text
              x={x(i)}
              y={H - 1}
              textAnchor="middle"
              fontSize="9"
              fill="#94A3B8"
            >
              {p.y}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
