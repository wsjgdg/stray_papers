"use client";

// ═══ 近四年投档线迷你趋势（纯 SVG，无 echarts 依赖） ═══
// compact 模式：嵌入对比表（无标注、更小）
export function TrendSpark({
  years,
  values,
  compact,
}: {
  years: number[];
  values: (number | null)[];
  compact?: boolean;
}) {
  const pts = years
    .map((y, i) => ({ y, v: values[i] }))
    .filter((p): p is { y: number; v: number } => p.v != null);
  if (pts.length < 2) return null;
  const W = compact ? 110 : 320;
  const H = compact ? 34 : 76;
  const PAD = compact ? 6 : 14;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = Math.max(max - min, 10);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
  const yy = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = pts.map((p, i) => `${x(i)},${yy(p.v)}`).join(" ");
  const delta = pts[pts.length - 1].v - pts[0].v;
  const deltaColor = delta > 0 ? "#F43F5E" : delta < 0 ? "#10B981" : "#94A3B8";
  return (
    <div>
      {!compact && (
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs text-gray-400">
            投档线趋势（{pts.length} 年可比）
          </span>
          <span className="text-xs font-semibold" style={{ color: deltaColor }}>
            {pts[0].y}–{pts[pts.length - 1].y} 年 {delta > 0 ? "+" : ""}
            {delta} 分
          </span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={compact ? "w-full max-w-[110px]" : "w-full max-w-[320px]"}
      >
        <polyline
          points={line}
          fill="none"
          stroke={compact ? deltaColor : "#6366F1"}
          strokeWidth={compact ? 1.8 : 1.5}
        />
        {pts.map((p, i) => (
          <g key={p.y}>
            <circle
              cx={x(i)}
              cy={yy(p.v)}
              r={compact ? 2.5 : 3}
              fill={compact ? deltaColor : "#6366F1"}
            />
            {!compact && (
              <>
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
              </>
            )}
          </g>
        ))}
        {compact && (
          <text
            x={W - 4}
            y={10}
            textAnchor="end"
            fontSize="8"
            fill={deltaColor}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </text>
        )}
      </svg>
    </div>
  );
}
