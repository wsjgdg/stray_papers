import { useEffect, useRef, useState } from 'react';
import { Activity, GripHorizontal, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
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

// 本地日期（YYYY-MM-DD），用于判断统计是否同一天（跨日则重置）
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
  const [minimal, setMinimal] = useState(false);
  const cfgRef = useRef<{ budgetUsd: number; refreshMs: number; defaultFocus: FocusMetric }>({
    budgetUsd: 0,
    refreshMs: 2000,
    defaultFocus: 'rate',
  });
  const notifiedRef = useRef(false);
  const spikeNotifiedRef = useRef(false);
  const wasAliveRef = useRef<boolean | null>(null);
  // 外观 / 交互：点击穿透、字号缩放、高对比、代理连接状态、主窗口反向高亮
  const [clickThrough, setClickThrough] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [proxyAlive, setProxyAlive] = useState<boolean | null>(null);
  const [hlModel, setHlModel] = useState<string | null>(null);
  // 信息密度：今日累计成本曲线 + Top 模型（调用频次，本地累积）
  const [costSeries, setCostSeries] = useState<number[]>([]);
  const [topModels, setTopModels] = useState<{ model: string; provider: string; count: number; lastTs: number }[]>([]);
  const modelFreq = useRef<Map<string, { model: string; provider: string; count: number; lastTs: number }>>(new Map());
  const seenTs = useRef<Set<number>>(new Set());
  // 持久化（仅 Electron standalone 浮窗）：成本序列镜像 + 跨会话去重水位 + 保存节流
  const costSeriesRef = useRef<number[]>([]);
  const loadedMaxTs = useRef<number>(0);
  const saveTimer = useRef<number | null>(null);

  // 挂载时读取应用设置：默认极简模式 + 预算阈值（用于告警）+ 默认焦点指标 + 刷新间隔 + 外观/穿透
  useEffect(() => {
    const cfg = api?.getSettings?.();
    if (cfg) {
      cfgRef.current = {
        budgetUsd: Number(cfg.budgetUsd) || 0,
        refreshMs: Number(cfg.refreshMs) || 2000,
        defaultFocus: (cfg.defaultFocus as FocusMetric) || 'rate',
      };
      if (cfg.minimalDefault) setMinimal(true);
      if (cfg.defaultFocus) setFocus(cfg.defaultFocus as FocusMetric);
      setClickThrough(!!cfg.clickThrough);
      setFontScale(Number(cfg.fontScale) || 1);
      setHighContrast(!!cfg.highContrast);
    }
  }, []);

  // 设置面板保存后实时刷新外观/穿透状态（无需重载浮窗）
  useEffect(() => {
    api?.onSettingsChanged?.((cfg: { clickThrough?: boolean; fontScale?: number; highContrast?: boolean }) => {
      if (!cfg) return;
      setClickThrough(!!cfg.clickThrough);
      setFontScale(Number(cfg.fontScale) || 1);
      setHighContrast(!!cfg.highContrast);
    });
  }, []);

  // ── 浮窗统计持久化（仅 Electron 内的 standalone 浮窗落盘，避免重载/重启清零）──
  function buildStatsPayload() {
    const top = [...modelFreq.current.values()].map((e) => ({
      model: e.model,
      provider: e.provider,
      count: e.count,
      lastTs: e.lastTs,
    }));
    return { day: todayStr(), costSeries: costSeriesRef.current.slice(-60), topModels: top };
  }
  function flushStats() {
    if (standalone && isElectron && api?.saveStats) {
      try {
        api.saveStats(buildStatsPayload());
      } catch {
        /* 存档写入失败静默忽略 */
      }
    }
  }
  function scheduleSave() {
    if (!(standalone && isElectron) || !api?.saveStats) return;
    if (saveTimer.current) return; // 已排队，等本轮触发
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      flushStats();
    }, 4000);
  }

  // 挂载时从磁盘恢复统计（仅同日内恢复，跨日视为新的一天清零）
  useEffect(() => {
    if (!(standalone && isElectron)) return;
    try {
      const saved = api?.loadStats?.();
      if (saved && saved.day === todayStr()) {
        if (Array.isArray(saved.costSeries) && saved.costSeries.length) {
          costSeriesRef.current = saved.costSeries.slice(-60);
          setCostSeries(costSeriesRef.current);
        }
        if (Array.isArray(saved.topModels) && saved.topModels.length) {
          const map = modelFreq.current;
          let maxTs = 0;
          for (const e of saved.topModels) {
            map.set(e.model, { model: e.model, provider: e.provider, count: e.count, lastTs: e.lastTs });
            if (e.lastTs > maxTs) maxTs = e.lastTs;
          }
          loadedMaxTs.current = maxTs;
          setTopModels(
            [...map.values()].sort((a, b) => b.count - a.count || b.lastTs - a.lastTs).slice(0, 5),
          );
        }
      }
    } catch {
      /* 无存档或格式损坏时静默忽略 */
    }
  }, []);

  // 统计变化时节流落盘（最多每 4s 一次）
  useEffect(() => {
    scheduleSave();
  }, [costSeries, topModels]);

  // 窗口关闭/隐藏时立即 flush 一次
  useEffect(() => {
    if (!(standalone && isElectron)) return;
    const onHide = () => flushStats();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, []);

  // 主进程全局快捷键转发：切换焦点指标 / 切换极简模式
  useEffect(() => {
    api?.onCycleFocus?.(() => setFocus((f) => FOCUS_NEXT[f]));
    api?.onToggleMinimal?.(() => setMinimal((m) => !m));
  }, []);

  // 双向联动：主窗口点模型 → 浮窗高亮提示（2.4s 后消失）
  useEffect(() => {
    api?.onHighlightModel?.((m: string) => {
      if (!m) return;
      setHlModel(m);
      window.setTimeout(() => setHlModel((cur) => (cur === m ? null : cur)), 2400);
    });
  }, []);

  // 浮窗内搜索框：回车深链到主窗口（容忍匹配 recentModels / topModels）
  const [q, setQ] = useState('');
  const runFloatSearch = () => {
    const term = q.trim().toLowerCase();
    if (!term) return;
    const pool = [
      ...(data?.recentModels ?? []).map((r) => r.model),
      ...topModels.map((t) => t.model),
    ];
    const hit = pool.find((m) => m.toLowerCase().includes(term)) || pool[0];
    if (hit) openModel(hit);
    setQ('');
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s = await fetchProxySummary();
        if (alive) {
          setData(s);
          if (s) {
            // 预算告警：超阈值弹系统通知（ref 防止重复，回落 90% 后可再提醒）
            const budget = cfgRef.current.budgetUsd;
            if (budget > 0) {
              const cost = s.todayCostUsd || 0;
              if (cost >= budget && !notifiedRef.current) {
                notifiedRef.current = true;
                api?.notify?.('预算告警', `今日成本 $${cost.toFixed(4)} 已达阈值 $${budget}`);
              } else if (cost < budget * 0.9) {
                notifiedRef.current = false;
              }
            }
            setSamples((prev) => {
              const next = [...prev, { in: s.inputRateTokS, out: s.outputRateTokS }];
              return next.length > 40 ? next.slice(next.length - 40) : next;
            });
            // 速率突增通知（alert 上升沿触发，回落可再提醒）
            const inL = spikeLevel(s.rateHistory, 'inRate');
            const outL = spikeLevel(s.rateHistory, 'outRate');
            if ((inL === 'alert' || outL === 'alert') && !spikeNotifiedRef.current) {
              spikeNotifiedRef.current = true;
              api?.notify?.('速率突增告警', '输入/输出速率相对近期基线突增，请关注');
            } else if (inL !== 'alert' && outL !== 'alert') {
              spikeNotifiedRef.current = false;
            }
            // 代理连接恢复通知（仅上升沿）
            if (wasAliveRef.current === false) {
              api?.notify?.('代理已恢复', '本地代理连接恢复正常');
            }
            wasAliveRef.current = true;
            setProxyAlive(true);
            // 今日累计成本曲线：采样 todayCostUsd（已为累计值，单调递增）
            setCostSeries((prev) => {
              const next = [...prev, s.todayCostUsd || 0];
              const capped = next.length > 60 ? next.slice(next.length - 60) : next;
              costSeriesRef.current = capped;
              return capped;
            });
            // Top 模型（调用频次）：用 recentModels 的 ts 去重累加，避免重复轮询重复计数。
            // 同时跳过已落盘水位（loadedMaxTs）之前的记录，防止重启后同一批历史调用被重复计数。
            const map = modelFreq.current;
            for (const r of s.recentModels) {
              if (seenTs.current.has(r.ts) || r.ts <= loadedMaxTs.current) continue;
              seenTs.current.add(r.ts);
              const e = map.get(r.model) ?? { model: r.model, provider: r.provider, count: 0, lastTs: r.ts };
              e.count += 1;
              e.lastTs = r.ts;
              e.provider = r.provider;
              map.set(r.model, e);
            }
            setTopModels(
              [...map.values()].sort((a, b) => b.count - a.count || b.lastTs - a.lastTs).slice(0, 5),
            );
          }
        }
      } catch {
        // 代理连接断开通知（仅上升沿，避免重复刷屏）
        if (wasAliveRef.current === true) {
          api?.notify?.('代理连接断开', '无法连接本地代理，统计已暂停');
        }
        wasAliveRef.current = false;
        /* 代理服务不可用或加锁时静默忽略 */
      }
    };
    void load();
    const t = setInterval(load, cfgRef.current.refreshMs || 2000);
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
    if (clickThrough) return; // 点击穿透时禁止拖拽
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

  // 模型深链：点模型行 → 主窗口打开该模型详情
  const openModel = (m: string) => {
    if (m && api?.openModel) api.openModel(m);
  };

  // 日终统计导出 CSV：汇总 + 今日成本序列 + Top 模型频次
  const exportStatsCsv = () => {
    const lines = [
      'section,key,value',
      `summary,todayCostUsd,${data?.todayCostUsd ?? 0}`,
      `summary,inputTokens,${data?.todayInputTokens ?? 0}`,
      `summary,outputTokens,${data?.todayOutputTokens ?? 0}`,
      `summary,cacheReadTokens,${data?.todayCacheReadTokens ?? 0}`,
      `summary,cacheHitRate,${data?.cacheHitRateToday ?? ''}`,
    ];
    costSeriesRef.current.forEach((v, i) => lines.push(`costSeries,${i},${v}`));
    [...modelFreq.current.values()]
      .sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
      .forEach((e) => lines.push(`topModel,${e.model},${e.count}`));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm-workbench-stats-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── 主题配色（浅/深）──
  const cardBase = theme === 'light' ? 'bg-white/95 text-neutral-900' : 'bg-panel/95 text-ink';
  const sub = theme === 'light' ? 'text-neutral-500' : 'text-muted';
  const chipBg = theme === 'light' ? 'bg-neutral-100' : 'bg-[#0d1728]';
  const hoverBg = theme === 'light' ? 'hover:bg-neutral-200' : 'hover:bg-[#16223a]';
  // 高对比模式：强制纯黑/纯白底 + 高对比边框与文字（覆盖主题透明底）
  const hcClass = highContrast
    ? theme === 'light'
      ? '!bg-white !text-black border-black/70'
      : '!bg-black !text-white border-white/70'
    : '';
  const hcSub = highContrast ? (theme === 'light' ? 'text-black/70' : 'text-white/70') : sub;
  const hcHover = highContrast ? (theme === 'light' ? 'hover:bg-neutral-300' : 'hover:bg-[#222]') : hoverBg;
  const zoomStyle: React.CSSProperties = fontScale !== 1 ? { zoom: fontScale } : {};

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

  // 极简模式（仅浮窗内）：单行展示核心数字，点展开按钮恢复完整卡片
  if (minimal && standalone) {
    return (
      <div
        ref={ref}
        className={
          'relative z-40 flex w-[200px] cursor-grab items-center gap-1.5 rounded-full border border-edge bg-panel/95 px-3 py-1.5 text-[11px] text-ink shadow-2xl backdrop-blur ' +
          hcClass
        }
        style={
          isElectron
            ? ({ WebkitAppRegion: 'drag', ...zoomStyle } as React.CSSProperties)
            : zoomStyle
        }
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
      >
        <Activity size={12} className={alertAny ? 'text-[#ef6b6b]' : 'text-accent'} />
        <span className="tabular-nums">{data ? `${data.inputRateTokS}/${data.outputRateTokS} t/s` : '—'}</span>
        <span className={hcSub}>·</span>
        <span className="tabular-nums">${data ? (data.todayCostUsd || 0).toFixed(4) : '0.0000'}</span>
        <span className={hcSub}>·</span>
        <span>{rate}</span>
        <button
          className={'ml-auto rounded p-0.5 ' + hcSub + ' ' + hcHover}
          style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMinimal(false)}
          title="展开完整卡片"
        >
          <ChevronUp size={12} />
        </button>
      </div>
    );
  }

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
        (docked
          ? 'relative w-full select-none rounded-xl border border-edge ' + cardBase
          : 'fixed z-40 w-[260px] select-none rounded-xl border border-edge ' + cardBase) +
        ' ' +
        hcClass +
        ' shadow-2xl backdrop-blur'
      }
      style={docked ? { width: '100%', ...zoomStyle } : { ...style, cursor: dragging ? 'grabbing' : 'default', ...zoomStyle }}
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
        style={standalone && isElectron ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
      >
        <GripHorizontal size={13} className={hcSub} />
        <Activity size={13} className={alertAny ? 'text-[#ef6b6b]' : 'text-accent'} />
        <span className="text-[11px] font-medium">实时代理统计</span>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: proxyAlive ? '#5ec8a0' : proxyAlive === false ? '#ef6b6b' : '#6b7280' }}
          title={proxyAlive ? '代理已连接' : proxyAlive === false ? '代理断开' : '代理状态未知'}
        />
        {clickThrough && (
          <span className="rounded bg-accent/20 px-1 text-[9px] text-accent" title="点击穿透已开启：浮窗不挡桌面">
            穿透
          </span>
        )}
        <button
          className={'ml-1 rounded p-0.5 ' + sub + ' ' + hoverBg}
          style={standalone && isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
          onClick={() => setFocus((f) => FOCUS_NEXT[f])}
          title="切换焦点指标"
        >
          <span className="text-[10px] tabular-nums">{FOCUS_LABEL[focus]}</span>
        </button>
        {standalone && (
          <button
            className={'rounded p-0.5 ' + sub + ' ' + hoverBg}
            style={standalone && isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
            onClick={() => setMinimal((m) => !m)}
            title="切换极简模式"
          >
            <span className="text-[10px] tabular-nums">{minimal ? '完整' : '极简'}</span>
          </button>
        )}
        <button
          className={'ml-auto rounded p-0.5 ' + sub + ' ' + hoverBg}
          style={standalone && isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
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
        {/* 浮窗内搜索：回车深链到主窗口对应模型（容忍匹配 recentModels / Top 模型） */}
        <div className={'flex items-center gap-1.5 rounded-md border border-edge px-1.5 ' + (highContrast ? 'border-white/50' : '')}>
          <Search size={12} className={hcSub} />
          <input
            className={'w-full bg-transparent py-1 text-[11px] text-ink outline-none placeholder:text-muted'}
            placeholder="搜索模型…（回车打开）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runFloatSearch();
            }}
          />
        </div>
        <Row label="输入速率" value={data ? `${data.inputRateTokS} tok/s` : '—'} tone={inLevel} active={focus === 'rate'} />
        <Row label="输出速率" value={data ? `${data.outputRateTokS} tok/s` : '—'} tone={outLevel} active={focus === 'rate'} />
        <Row label="请求速率" value={data ? `${data.reqRate}/s` : '—'} active={focus === 'rate'} />
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
          active={focus === 'model' || !!(hlModel && model && model.model.toLowerCase().includes(hlModel.toLowerCase()))}
          onClick={model ? () => openModel(model.model) : undefined}
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
            <div className="mt-2 space-y-2 border-t border-edge pt-2">
              <div className={'text-[10px] ' + sub}>速率状态：{alertAny ? '⚠ 突增' : '正常'}</div>

              {/* 今日累计成本曲线（costSeries 为 todayCostUsd 单调递增采样） */}
              <div>
                <div className={'mb-0.5 flex items-center justify-between text-[10px] ' + sub}>
                  <span>今日累计成本</span>
                  <span className="tabular-nums">
                    ${costSeries.length ? costSeries[costSeries.length - 1].toFixed(4) : '0.0000'}
                  </span>
                </div>
                <CostCurve values={costSeries} bg={chipBg} />
              </div>

              {/* 最近模型（本地累计调用频次 Top5，点击深链到主窗口） */}
              <div>
                <div className={'mb-0.5 text-[10px] ' + sub}>最近模型（按调用频次 · 点击打开）</div>
                <ul className="space-y-0.5">
                  {topModels.length === 0 && <li className={'text-[10px] ' + sub}>暂无记录</li>}
                  {topModels.map((m) => {
                    const max = topModels[0]?.count || 1;
                    const pct = Math.max(6, Math.round((m.count / max) * 100));
                    const isHl = hlModel && m.model.toLowerCase().includes(hlModel.toLowerCase());
                    return (
                      <li
                        key={m.model}
                        className={
                          'flex cursor-pointer items-center gap-1.5 rounded px-1 ' +
                          (highContrast ? hcHover : 'hover:bg-[#16223a]') +
                          (isHl ? ' ring-1 ring-accent bg-[#1b2c4a]' : '')
                        }
                        onClick={() => openModel(m.model)}
                        title={'点击在主窗口打开 ' + m.model}
                      >
                        <span className="w-24 shrink-0 truncate text-[10px]" title={m.model}>
                          {m.model}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#16223a]">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: pct + '%' }}
                          />
                        </span>
                        <span className="w-4 text-right tabular-nums text-[10px] text-muted">{m.count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
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
          <MenuItem label={minimal ? '切换完整模式' : '切换极简模式'} onClick={() => { setMinimal((m) => !m); setMenu(null); }} />
          <MenuItem label="切换焦点指标" onClick={() => { setFocus((f) => FOCUS_NEXT[f]); setMenu(null); }} />
          {isElectron && (
            <MenuItem
              label={clickThrough ? '关闭点击穿透' : '开启点击穿透'}
              onClick={() => {
                api?.toggleClickThrough?.();
                setMenu(null);
              }}
            />
          )}
          <MenuItem label="导出今日统计" onClick={() => { exportStatsCsv(); setMenu(null); }} />
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
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const colorClass =
    tone === 'alert' ? 'text-[#ef6b6b]' : tone === 'warn' ? 'text-[#e6b15e]' : accent ? 'text-accent' : 'text-ink';
  return (
    <div
      className={
        'flex items-center justify-between gap-2 rounded px-1 ' +
        (active ? 'ring-1 ring-accent/60 ' : '') +
        (onClick ? 'cursor-pointer hover:bg-[#16223a]' : '')
      }
      onClick={onClick}
      title={onClick ? '点击在主窗口打开该模型' : undefined}
    >
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

// 单值序列迷你面积图（今日累计成本曲线）
function CostCurve({ values, bg }: { values: number[]; bg: string }) {
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
