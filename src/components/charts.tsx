import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// D1：零依赖自绘 SVG 图表（替代 recharts，省掉约 390KB 的 charts chunk）。
// 颜色一律走 CSS 变量令牌（见 src/index.css），因此深浅主题自动跟随。
// 注意：SVG 的「表现属性」在部分浏览器里不解析 var()，这里统一用 style 传色。

/** 向上取整到「好看」的刻度上限（1/2/2.5/5/10 × 10^n） */
export function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (max <= m * base) return m * base;
  }
  return 10 * base;
}

/** 生成 count+1 个等分刻度（含首尾） */
function ticks(from: number, to: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count);
}

/**
 * 量出容器宽度（像素），让 SVG 用真实坐标绘制——避免 preserveAspectRatio 拉伸导致文字变形。
 * SSR / 首帧拿不到宽度时回落 fallback。
 */
function useMeasuredWidth(fallback = 640): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const next = Math.floor(el.clientWidth);
      if (next > 0) setW(next);
    };
    apply();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', apply);
      return () => window.removeEventListener('resize', apply);
    }
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export interface ColumnDatum {
  name: string;
  value: number;
  /** 单条颜色，默认 --c-s1 */
  color?: string;
}

/**
 * 纵向柱状图。
 * - 长标签 -25° 旋转，完整名称放 <title>
 * - hover 高亮 + 浮层（额外行由 extra(i) 提供）
 */
export function ColumnChart({
  data,
  height = 260,
  formatValue = (v) => String(v),
  unit = '',
  ariaLabel,
  extra,
}: {
  data: ColumnDatum[];
  height?: number;
  formatValue?: (v: number) => string;
  unit?: string;
  ariaLabel?: string;
  extra?: (i: number) => ReactNode;
}) {
  const [wrapRef, W] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);

  const PAD = { top: 10, right: 10, bottom: 66, left: 62 };
  const H = height;
  const plotW = Math.max(40, W - PAD.left - PAD.right);
  const plotH = Math.max(40, H - PAD.top - PAD.bottom);

  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data]);
  const slot = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.max(3, Math.min(56, slot * 0.62));

  const yOf = (v: number) => PAD.top + plotH - (v / max) * plotH;

  if (data.length === 0) {
    return <div ref={wrapRef} style={{ height }} />;
  }

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel ?? '柱状图'}
        onMouseLeave={() => setHover(null)}
      >
        {/* 网格 + y 轴刻度 */}
        {ticks(0, max).map((t, i) => {
          const y = yOf(t);
          return (
            <g key={`t${i}`}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                style={{ stroke: i === 0 ? 'var(--c-line)' : 'var(--c-grid)' }}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 3}
                textAnchor="end"
                style={{ fill: 'var(--c-axis)' }}
                fontSize={10}
              >
                {formatValue(t)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = Math.max(1, (d.value / max) * plotH);
          const y = PAD.top + plotH - h;
          return (
            <g key={`${d.name}-${i}`}>
              {/* 整列命中区，hover 更宽容 */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              >
                <title>{d.name}</title>
              </rect>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={4}
                style={{
                  fill: d.color ?? 'var(--c-s1)',
                  opacity: hover === null || hover === i ? 1 : 0.4,
                  transition: 'opacity 120ms',
                }}
              />
            </g>
          );
        })}

        {/* x 轴标签：旋转 -25°，anchor=end */}
        {data.map((d, i) => {
          const cx = PAD.left + i * slot + slot / 2;
          const cy = PAD.top + plotH + 12;
          return (
            <text
              key={`l${i}`}
              transform={`translate(${cx} ${cy}) rotate(-25)`}
              textAnchor="end"
              style={{ fill: hover === i ? 'var(--c-ink)' : 'var(--c-axis)' }}
              fontSize={10}
            >
              {d.name.length > 18 ? `${d.name.slice(0, 17)}…` : d.name}
            </text>
          );
        })}
      </svg>

      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-edge bg-raised px-3 py-2 text-[11px] shadow-xl"
          style={{ left: PAD.left + hover * slot + slot / 2, top: 4, maxWidth: 280 }}
        >
          <div className="mb-1 truncate font-medium text-ink">{data[hover].name}</div>
          <div className="tabular-nums text-ink">
            {formatValue(data[hover].value)}
            {unit}
          </div>
          {extra?.(hover)}
        </div>
      )}
    </div>
  );
}

// ───────── 散点图（价格 × 智能指数）─────────

export interface ScatterDatum {
  name: string;
  x: number;
  y: number;
  /** 浮层里的附加行 */
  meta?: { label: string; value: string }[];
}

/**
 * 散点图（线性双轴 + 网格）。y 轴不强制从 0 起，留 8% 余量更利于看分布。
 */
export function ScatterPlot({
  data,
  height = 240,
  xLabel,
  yLabel,
  yFormat = (v) => String(Math.round(v)),
  ariaLabel,
}: {
  data: ScatterDatum[];
  height?: number;
  xLabel: string;
  yLabel: string;
  yFormat?: (v: number) => string;
  ariaLabel?: string;
}) {
  const [wrapRef, W] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);

  const PAD = { top: 10, right: 14, bottom: 34, left: 50 };
  const H = height;
  const plotW = Math.max(40, W - PAD.left - PAD.right);
  const plotH = Math.max(40, H - PAD.top - PAD.bottom);

  const stats = useMemo(() => {
    if (data.length === 0) return { maxX: 1, minY: 0, maxY: 1 };
    const maxX = niceMax(Math.max(...data.map((d) => d.x), 0));
    const rawMinY = Math.min(...data.map((d) => d.y));
    const rawMaxY = Math.max(...data.map((d) => d.y));
    const pad = (rawMaxY - rawMinY) * 0.08 || 1;
    return { maxX, minY: Math.max(0, rawMinY - pad), maxY: rawMaxY + pad };
  }, [data]);

  if (data.length === 0) {
    return <div ref={wrapRef} style={{ height }} />;
  }

  const { maxX, minY, maxY } = stats;
  const xOf = (v: number) => PAD.left + (v / maxX) * plotW;
  const yOf = (v: number) => PAD.top + plotH - ((v - minY) / (maxY - minY)) * plotH;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel ?? `${xLabel} 与 ${yLabel} 散点图`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks(minY, maxY).map((v, i) => {
          const y = yOf(v);
          return (
            <g key={`gy${i}`}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                style={{ stroke: 'var(--c-grid)' }}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 3}
                textAnchor="end"
                style={{ fill: 'var(--c-axis)' }}
                fontSize={10}
              >
                {yFormat(v)}
              </text>
            </g>
          );
        })}
        {ticks(0, maxX).map((t, i) => {
          const x = xOf(t);
          return (
            <g key={`gx${i}`}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={PAD.top + plotH}
                style={{ stroke: 'var(--c-grid)' }}
                strokeWidth={1}
              />
              <text
                x={x}
                y={PAD.top + plotH + 14}
                textAnchor="middle"
                style={{ fill: 'var(--c-axis)' }}
                fontSize={10}
              >
                {t < 1 ? t.toFixed(2) : t.toFixed(t < 10 ? 1 : 0)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => (
          <circle
            key={`p${i}`}
            cx={xOf(d.x)}
            cy={yOf(d.y)}
            r={hover === i ? 6 : 4}
            style={{
              fill: 'var(--c-accent)',
              opacity: hover === null || hover === i ? 0.85 : 0.3,
              transition: 'opacity 120ms',
            }}
            onMouseEnter={() => setHover(i)}
          >
            <title>{d.name}</title>
          </circle>
        ))}

        <text
          x={PAD.left + plotW / 2}
          y={H - 2}
          textAnchor="middle"
          style={{ fill: 'var(--c-axis)' }}
          fontSize={10}
        >
          {xLabel}
        </text>
        <text
          x={12}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}
          style={{ fill: 'var(--c-axis)' }}
          fontSize={10}
        >
          {yLabel}
        </text>
      </svg>

      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg border border-edge bg-raised px-3 py-2 text-[11px] shadow-xl"
          style={{ left: 8, top: 4 }}
        >
          <div className="mb-1 truncate font-medium text-ink">{data[hover].name}</div>
          {data[hover].meta?.map((m) => (
            <div key={m.label} className="text-muted">
              {m.label} <span className="tabular-nums text-ink">{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
