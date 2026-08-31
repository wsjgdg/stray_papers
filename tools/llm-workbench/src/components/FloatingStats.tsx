import { useEffect, useRef, useState } from 'react';
import { Activity, GripHorizontal, X } from 'lucide-react';
import { fetchProxySummary, type ProxySummary } from '../api';

// 浮窗：实时显示输入/输出速率、缓存命中、当前模型、当日消耗 token。
// 固定在视口右下角，可拖拽；默认展开，可折叠为小按钮。

type Pos = { left: number; top: number };

function fmtTok(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function FloatingStats() {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<ProxySummary | null>(null);
  const [samples, setSamples] = useState<{ in: number; out: number }[]>([]);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s = await fetchProxySummary();
        if (alive) {
          setData(s);
          if (s) {
            setSamples((prev) => {
              const next = [...prev, { in: s.inputRateTokS, out: s.outputRateTokS }];
              return next.length > 40 ? next.slice(next.length - 40) : next;
            });
          }
        }
      } catch {
        /* 代理服务不可用或加锁时静默忽略 */
      }
    };
    void load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { ox: r.left, oy: r.top, px: e.clientX, py: e.clientY };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const nx = drag.current.ox + (e.clientX - drag.current.px);
    const ny = drag.current.oy + (e.clientY - drag.current.py);
    setPos({ left: Math.max(0, nx), top: Math.max(0, ny) });
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const style: React.CSSProperties = open
    ? pos
      ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
      : { right: 16, bottom: 16 }
    : { right: 16, bottom: 16 };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-3 py-2 text-[11px] text-accent shadow-lg backdrop-blur transition-colors hover:bg-accent/25"
        style={{ right: 16, bottom: 16 }}
        title="打开实时统计浮窗"
      >
        <Activity size={13} />
        实时
        {data && (data.inputRateTokS > 0 || data.outputRateTokS > 0) && (
          <span className="tabular-nums">
            {data.inputRateTokS}/{data.outputRateTokS} t/s
          </span>
        )}
      </button>
    );
  }

  const rate = data?.cacheHitRateToday != null ? `${(data.cacheHitRateToday * 100).toFixed(1)}%` : '—';
  const model = data?.recentModels?.[0];

  return (
    <div
      ref={ref}
      className="fixed z-40 w-[260px] select-none rounded-xl border border-edge bg-panel/95 shadow-2xl backdrop-blur"
      style={{ ...style, cursor: dragging ? 'grabbing' : 'default' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div
        className="flex cursor-grab items-center gap-1.5 border-b border-edge px-3 py-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
      >
        <GripHorizontal size={13} className="text-muted" />
        <Activity size={13} className="text-accent" />
        <span className="text-[11px] font-medium text-ink">实时代理统计</span>
        <button
          className="ml-auto rounded p-0.5 text-muted hover:bg-[#16223a] hover:text-ink"
          onClick={() => setOpen(false)}
          title="折叠"
        >
          <X size={13} />
        </button>
      </div>

      <div className="space-y-1.5 px-3 py-2.5 text-[11px]">
        <Row label="输入速率" value={data ? `${data.inputRateTokS} tok/s` : '—'} />
        <Row label="输出速率" value={data ? `${data.outputRateTokS} tok/s` : '—'} />
        <div className="pt-0.5">
          <Sparkline samples={samples} />
          <div className="mt-1 flex items-center justify-center gap-3 text-[9px] text-muted">
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: '#5b9bff' }} />
              输入
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: '#5ec8a0' }} />
              输出
            </span>
            <span>近 {samples.length * 2}s 趋势</span>
          </div>
        </div>
        <Row label="缓存命中" value={rate} accent />
        <Row
          label="当前模型"
          value={model ? `${model.model}` : '—'}
          sub={model?.provider}
        />
        <div className="mt-1 border-t border-edge pt-1.5">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">当日消耗 token</div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <Mini label="输入" value={data ? fmtTok(data.todayInputTokens) : '0'} />
            <Mini label="输出" value={data ? fmtTok(data.todayOutputTokens) : '0'} />
            <Mini label="缓存" value={data ? fmtTok(data.todayCacheReadTokens) : '0'} accent />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-muted">当日成本</span>
            <span className="tabular-nums text-ink">
              {data ? `$${data.todayCostUsd.toFixed(4)}` : '$0.0000'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className={`min-w-0 truncate text-right ${accent ? 'text-accent' : 'text-ink'}`} title={value}>
        {value}
        {sub && <span className="ml-1 text-[10px] text-muted">{sub}</span>}
      </span>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md bg-[#0d1728] py-1">
      <div className={`text-[12px] font-semibold ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
      <div className="text-[9px] text-muted">{label}</div>
    </div>
  );
}

// 速率趋势迷你图：把每次轮询的输入/输出速率绘制成 sparkline。
function Sparkline({ samples }: { samples: { in: number; out: number }[] }) {
  const W = 236;
  const H = 36;
  const pad = 2;
  if (samples.length < 2) {
    return <div style={{ height: H }} className="rounded-md bg-[#0d1728]" />;
  }
  const max = Math.max(1, ...samples.map((s) => Math.max(s.in, s.out)));
  const n = samples.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - v / max) * (H - pad * 2);
  const line = (key: 'in' | 'out') =>
    samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-md bg-[#0d1728]" preserveAspectRatio="none" style={{ height: H }}>
      <path d={line('out')} fill="none" stroke="#5ec8a0" strokeWidth={1.5} strokeLinejoin="round" />
      <path d={line('in')} fill="none" stroke="#5b9bff" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
