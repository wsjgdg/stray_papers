// C2：从 FloatingStats.tsx 抽出的浮窗非 UI 状态与副作用（纯搬运，行为不变）。
// 包含：应用设置读取、summary 轮询聚合与通知、统计持久化（节流落盘/pagehide flush/恢复）、
// Electron 桥接订阅（设置变更/快捷键/高亮/主题）。渲染与交互留在容器。
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { fetchProxySummary, type ProxySummary } from '../../api';
import { type Theme, type FocusMetric, FOCUS_NEXT, todayStr, spikeLevel } from './format';

export interface FloatStats {
  data: ProxySummary | null;
  samples: { in: number; out: number }[];
  focus: FocusMetric;
  setFocus: Dispatch<SetStateAction<FocusMetric>>;
  theme: Theme;
  minimal: boolean;
  setMinimal: Dispatch<SetStateAction<boolean>>;
  clickThrough: boolean;
  fontScale: number;
  highContrast: boolean;
  proxyAlive: boolean | null;
  hlModel: string | null;
  costSeries: number[];
  topModels: { model: string; provider: string; count: number; lastTs: number }[];
  modelFreq: MutableRefObject<
    Map<string, { model: string; provider: string; count: number; lastTs: number }>
  >;
  costSeriesRef: MutableRefObject<number[]>;
}

export function useFloatStats(standalone: boolean): FloatStats {
  const api = window.electron;
  const isElectron = !!api?.isElectron;
  const [data, setData] = useState<ProxySummary | null>(null);
  const [samples, setSamples] = useState<{ in: number; out: number }[]>([]);
  const [focus, setFocus] = useState<FocusMetric>('rate');
  const [theme, setTheme] = useState<Theme>('dark');
  const [minimal, setMinimal] = useState(false);
  const cfgRef = useRef<{ budgetUsd: number; refreshMs: number; defaultFocus: FocusMetric }>({
    budgetUsd: 0,
    refreshMs: 2000,
    defaultFocus: 'rate',
  });
  const notifiedRef = useRef(false);
  const spikeNotifiedRef = useRef(false);
  const wasAliveRef = useRef<boolean | null>(null);
  const [clickThrough, setClickThrough] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [proxyAlive, setProxyAlive] = useState<boolean | null>(null);
  const [hlModel, setHlModel] = useState<string | null>(null);
  // 信息密度：今日累计成本曲线 + Top 模型（调用频次，本地累积）
  const [costSeries, setCostSeries] = useState<number[]>([]);
  const [topModels, setTopModels] = useState<
    { model: string; provider: string; count: number; lastTs: number }[]
  >([]);
  const modelFreq = useRef<
    Map<string, { model: string; provider: string; count: number; lastTs: number }>
  >(new Map());
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
  }, [api]);

  // 设置面板保存后实时刷新外观/穿透状态（无需重载浮窗）
  useEffect(() => {
    api?.onSettingsChanged?.((cfg) => {
      if (!cfg) return;
      setClickThrough(!!cfg.clickThrough);
      setFontScale(Number(cfg.fontScale) || 1);
      setHighContrast(!!cfg.highContrast);
    });
  }, [api]);

  // ── 浮窗统计持久化（仅 Electron 内的 standalone 浮窗落盘，避免重载/重启清零）──
  const buildStatsPayload = useCallback(() => {
    const top = [...modelFreq.current.values()].map((e) => ({
      model: e.model,
      provider: e.provider,
      count: e.count,
      lastTs: e.lastTs,
    }));
    return { day: todayStr(), costSeries: costSeriesRef.current.slice(-60), topModels: top };
  }, []);
  const flushStats = useCallback(() => {
    if (standalone && isElectron && api?.saveStats) {
      try {
        api.saveStats(buildStatsPayload());
      } catch {
        /* 存档写入失败静默忽略 */
      }
    }
  }, [standalone, isElectron, api, buildStatsPayload]);
  const scheduleSave = useCallback(() => {
    if (!(standalone && isElectron) || !api?.saveStats) return;
    if (saveTimer.current) return; // 已排队，等本轮触发
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      flushStats();
    }, 4000);
  }, [standalone, isElectron, api, flushStats]);

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
            map.set(e.model, {
              model: e.model,
              provider: e.provider,
              count: e.count,
              lastTs: e.lastTs,
            });
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
  }, [standalone, isElectron, api]);

  // 统计变化时节流落盘（最多每 4s 一次）
  useEffect(() => {
    scheduleSave();
  }, [costSeries, topModels, scheduleSave]);

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
  }, [standalone, isElectron, flushStats]);

  // 主进程全局快捷键转发：切换焦点指标 / 切换极简模式
  useEffect(() => {
    api?.onCycleFocus?.(() => setFocus((f) => FOCUS_NEXT[f]));
    api?.onToggleMinimal?.(() => setMinimal((m) => !m));
  }, [api]);

  // 双向联动：主窗口点模型 → 浮窗高亮提示（2.4s 后消失）
  useEffect(() => {
    api?.onHighlightModel?.((m: string) => {
      if (!m) return;
      setHlModel(m);
      window.setTimeout(() => setHlModel((cur) => (cur === m ? null : cur)), 2400);
    });
  }, [api]);

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
              const e = map.get(r.model) ?? {
                model: r.model,
                provider: r.provider,
                count: 0,
                lastTs: r.ts,
              };
              e.count += 1;
              e.lastTs = r.ts;
              e.provider = r.provider;
              map.set(r.model, e);
            }
            setTopModels(
              [...map.values()]
                .sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
                .slice(0, 5),
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
  }, [api]);

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

  // D3：主题跟随 <html data-theme>（由 useTheme 在两种窗口里统一写入）。
  // 之前仅在 Electron 内用 getTheme，浏览器 / dev 下浮窗永远停在深色。
  useEffect(() => {
    const read = (): Theme => {
      const d = document.documentElement.dataset.theme;
      if (d === 'light' || d === 'dark') return d;
      const api = window.electron;
      const t = api?.getTheme?.();
      if (t === 'light' || t === 'dark') return t;
      return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    };
    setTheme(read());
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    const onMq = () => setTheme(read());
    mq?.addEventListener('change', onMq);
    return () => {
      obs.disconnect();
      mq?.removeEventListener('change', onMq);
    };
  }, []);

  return {
    data,
    samples,
    focus,
    setFocus,
    theme,
    minimal,
    setMinimal,
    clickThrough,
    fontScale,
    highContrast,
    proxyAlive,
    hlModel,
    costSeries,
    topModels,
    modelFreq,
    costSeriesRef,
  };
}
