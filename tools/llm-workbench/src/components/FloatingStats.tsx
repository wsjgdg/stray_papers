import { useEffect, useRef, useState } from 'react';
import { Activity, GripHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchProxySummary, type ProxySummary } from '../api';

// 浮窗：实时显示输入/输出速率、缓存命中、当前模型、当日消耗 token。
// 固定在视口右下角，可拖拽；默认展开，可折叠为小按钮。

type Pos = { left: number; top: number };
type Theme = 'dark' | 'light';
type FocusMetric = 'rate' | 'cache' | 'cost' | 'model';
const FOCUS_LABEL: Record<FocusMetric, string> = {
  rate: '速率',
  cache: '缓存',
  cost: '成本',
  model: '模型',
};
const FOCUS_NEXT: Record<FocusMetric, FocusMetric> = {
  rate: 'cache',
  cache: 'cost',
  cost: 'model',
  model: 'rate',
};

function fmtTok(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// 阈值告警：用服务端速率历史的「近期中位数」作基线，最新值相对基线突增则标色。
type Tone = 'normal' | 'warn' | 'alert';
function spikeLevel(
  history: { inRate: number; outRate: number }[] | undefined,
  key: 'inRate' | 'outRate',
): Tone {
  if (!history || history.length < 6) return 'normal';
  const baseline = history.slice(0, -1).map((h) => h[key]).filter((v) => v > 0);
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

export default function FloatingStats({ standalone = false }: { standalone?: boolean }) {
  const docked = standalone;
  const api = (window as unknown as { electron?: any }).electron;
  const isElectron = !!api?.isElectron;
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<ProxySummary | null>(null);
  const [samples, setSamples] = useState<{ in: number; out: number }[]>([]);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<FocusMetric>('rate');
  const [theme, setTheme] = useState<Theme>('dark');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
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

  // Electron 内：浮窗是 transparent 窗口，需把页面背景置透明，露出桌面（卡片自身有底色）
  useEffect(() => {
    if (standalone && isElectron) {
      const prev = document.body.style.background;
      document.body.style.background = 'transparent';
      return () => {
        document.body.style.background = prev;
      };
    }
  }, [standalone, isElectron]);

  // 跟随系统主题（仅 Electron 内有效）
  useEffect(() => {
    if (!isElectron || !api?.getTheme) return;
    setTheme(api.getTheme());
    api.onThemeChange?.((t: string) => setTheme(t as Theme));
  }, [isElectron]);

  // 右键菜单打开时，点击外部关闭
  useEffect(() => {
    if (!menu) return;
    const h = () => setMenu(null);
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [menu]);

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

  const onContextMenu = (e: React.MouseEvent) => {
    if (!standalone) return;
    e.preventDefault();
    const r = ref.current?.getBoundingClientRect();
    setMenu({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) });
  };

  // ── 主题配色（浅/深）──
  const cardBase = theme === 'light' ? 'bg-white/95 text-neutral-900' : 'bg-panel/95 text-ink';
  const sub = theme === 'light' ? 'text-neutral-500' : 'text-muted';
  const chipBg = theme === 'light' ? 'bg-neutral-100' : 'bg-[#0d1728]';
  const hoverBg = theme === 'light' ? 'hover:bg-neutral-200' : 'hover:bg-[#16223a]';

  const rate = data?.cacheHitRateToday != null ? `${(data.cacheHitRateToday * 100).toFixed(1)}%` : '—';
  const model = data?.recentModels?.[0];
  const series =
    data?.rateHistory && data.rateHistory.length >= 2
      ? data.rateHistory.map((s) => ({ in: s.inRate, out: s.outRate }))
      : samples;
  const inLevel = spikeLevel(data?.rateHistory, 'inRate');
  const outLevel = spikeLevel(data?.rateHistory, 'outRate');
  const alertAny = inLevel === 'alert' || outLevel === 'alert';

  const style: React.CSSProperties = docked
    ? { width: '100%' }
    : open
      ? pos
        ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
        : { right: 16, bottom: 16 }
      : { right: 16, bottom: 16 };

  if (!open && !docked) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-3 py-2 text-[11px] text-accent shadow-lg backdrop-blur"
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

  return (
    <div
      ref={ref}
      className={
        docked
          ? 'relative w-full select-none rounded-xl border border-edge ' + cardBase + ' shadow-2xl backdrop-blur'
          : 'relative z-40 w-[260px] select-none rounded-xl border border-edge ' + cardBase + ' shadow-2xl backdrop-blur'
      }
      style={docked ? { width: '100%' } : { ...style, cursor: dragging ? 'grabbing' : 'default' }}
      onPointerMove={docked ? undefined : onPointerMove}
      onPointerUp={docked ? undefined : onPointerUp}
      onPointerLeave={docked ? undefined : onPointerUp}
      onContextMenu={onContextMenu}
    >
      <div
        className={
          docked
            ? 'flex items-center gap-1.5 border-b border-edge px-3 py-2'
            : 'flex cursor-grab items-center gap-1.5 border-b border-edge px-3 py-2 active:cursor-grabbing'
        }
        onPointerDown={docked ? undefined : onPointerDown}
        style={isElectron ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
      >
        <GripHorizontal size={13} className={sub} />
        <Activity size={13} className={alertAny ? 'text-[#ef6b6b]' : 'text-accent'} />
        <span className="text-[11px] font-medium">实时代理统计</span>
        <button
          className={'ml-1 rounded p-0.5 ' + sub + ' ' + hoverBg}
          style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
          onClick={() => setFocus((f) => FOCUS_NEXT[f])}
          title="切换焦点指标"
        >
          <span className="text-[10px] tabular-nums">{FOCUS_LABEL[focus]}</span>
        </button>
        <button
          className={'ml-auto rounded p-0.5 ' + sub + ' ' + hoverBg}
          style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
          onClick={() => {
            if (api?.closeFloat) {
              api.closeFloat();
              return;
            }
            docked ? window.close() : setOpen(false);
          }}
          title={docked ? '关闭窗口' : '折叠'}
        >
          <X size={13} />
        </button>
      </div>

      <div className="space-y-1.5 px-3 py-2.5 text-[11px]">
        <Row label="输入速率" value={data ? `${data.inputRateTokS} tok/s` : '—'} tone={inLevel} active={focus === 'rate'} />
        <Row label="输出速率" value={data ? `${data.outputRateTokS} tok/s` : '—'} tone={outLevel} active={focus === 'rate'} />
        <div className="pt-0.5">
          <Sparkline samples={series} bg={chipBg} />
          <div className={'mt-1 flex items-center justify-center gap-3 text-[9px] ' + sub}>
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: '#5b9bff' }} />
              输入
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: '#5ec8a0' }} />
              输出
            </span>
            <span>近 {series.length * 2}s 趋势</span>
          </div>
          {alertAny && <div className="mt-1 text-center text-[9px] text-[#ef6b6b]">⚠ 速率突增</div>}
        </div>
        <Row label="缓存命中" value={rate} accent active={focus === 'cache'} />
        <Row
          label="当前模型"
          value={model ? `${model.model}` : '—'}
          sub={model?.provider}
          active={focus === 'model'}
        />
        <div className="mt-1 border-t border-edge pt-1.5">
          <div className="mb-1 flex items-center justify-between">
            <span className={'text-[10px] uppercase tracking-wider ' + sub}>当日消耗 token</span>
            <button
              className={'rounded p-0.5 ' + sub + ' ' + hoverBg}
              onClick={() => setExpanded((v) => !v)}
              title="展开/收起详情"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <Mini label="输入" value={data ? fmtTok(data.todayInputTokens) : '0'} accent={focus === 'cost'} bg={chipBg} />
            <Mini label="输出" value={data ? fmtTok(data.todayOutputTokens) : '0'} accent={focus === 'cost'} bg={chipBg} />
            <Mini label="缓存" value={data ? fmtTok(data.todayCacheReadTokens) : '0'} accent bg={chipBg} />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className={'text-[10px] ' + sub}>当日成本</span>
            <span className="tabular-nums">${data ? data.todayCostUsd.toFixed(4) : '0.0000'}</span>
          </div>
          {expanded && (
            <div className="mt-2 space-y-1 border-t border-edge pt-2">
              <div className={'text-[10px] ' + sub}>速率状态：{alertAny ? '⚠ 突增' : '正常'}</div>
              <div className={'text-[10px] ' + sub}>最近模型</div>
              <ul className="space-y-0.5">
                {(data?.recentModels ?? []).slice(0, 5).map((m, i) => (
                  <li key={i} className="flex items-center justify-between text-[10px]">
                    <span className="truncate">{m.model}</span>
                    <span className={sub}>{m.provider}</span>
                  </li>
                ))}
                {(data?.recentModels ?? []).length === 0 && (
                  <li className={'text-[10px] ' + sub}>暂无记录</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {menu && (
        <div
          className="absolute z-50 w-36 overflow-hidden rounded-md border border-edge bg-panel py-1 text-[11px] text-ink shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem label={expanded ? '收起详情' : '展开详情'} onClick={() => { setExpanded((v) => !v); setMenu(null); }} />
          <MenuItem label="切换焦点指标" onClick={() => { setFocus((f) => FOCUS_NEXT[f]); setMenu(null); }} />
          {isElectron && <MenuItem label="打开主窗口" onClick={() => { api?.showMain?.(); setMenu(null); }} />}
          {isElectron && <MenuItem label="重置浮窗位置" onClick={() => { api?.resetFloat?.(); setMenu(null); }} />}
          <MenuItem label="关闭浮窗" danger onClick={() => { if (api?.closeFloat) api.closeFloat(); else docked ? window.close() : setOpen(false); setMenu(null); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={
        'block w-full px-3 py-1 text-left hover:bg-[#16223a] ' +
        (danger ? 'text-[#ef6b6b]' : 'text-ink')
      }
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Row({
  label,
  value,
  sub,
  accent,
  tone,
  active,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone?: Tone;
  active?: boolean;
}) {
  const colorClass =
    tone === 'alert' ? 'text-[#ef6b6b]' : tone === 'warn' ? 'text-[#e6b15e]' : accent ? 'text-accent' : 'text-ink';
  return (
    <div className={'flex items-center justify-between gap-2 rounded px-1 ' + (active ? 'ring-1 ring-accent/60' : '')}>
      <span className="text-muted">{label}</span>
      <span className={'min-w-0 truncate ' + colorClass} title={value}>
        {value}
        {sub && <span className="ml-1 text-[10px] text-muted">{sub}</span>}
      </span>
    </div>
  );
}

function Mini({ label, value, accent, bg = 'bg-[#0d1728]' }: { label: string; value: string; accent?: boolean; bg?: string }) {
  return (
    <div className={'rounded-md py-1 ' + bg}>
      <div className={'text-[12px] font-semibold ' + (accent ? 'text-accent' : 'text-ink')}>{value}</div>
      <div className="text-[9px] text-muted">{label}</div>
    </div>
  );
}

// 速率趋势迷你图
function Sparkline({ samples, bg }: { samples: { in: number; out: number }[]; bg: string }) {
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
    samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-md" style={{ height: H, background: bg }} preserveAspectRatio="none">
      <path d={line('out')} fill="none" stroke="#5ec8a0" strokeWidth={1.5} strokeLinejoin="round" />
      <path d={line('in')} fill="none" stroke="#5b9bff" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
