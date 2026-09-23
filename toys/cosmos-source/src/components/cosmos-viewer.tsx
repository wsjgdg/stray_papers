'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CosmosEngine, type EngineState, type BodyInfo } from '@/lib/cosmos/engine';
import { SCALE_LEVELS } from '@/lib/cosmos/cosmos-views';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Pause, Play, Rewind, Zap, CalendarClock, Compass, Snowflake, RotateCcw, Navigation, Rocket,
  Orbit, Tag, Asterisk, Disc, Sparkles, Star, Flame, Moon, Sun,
  ChevronDown, ChevronUp, Layers, Ruler,
} from 'lucide-react';

const EU = (
  <svg viewBox="0 0 436 336" width="100%" style={{ maxWidth: 436 }}>
    <defs>
      <radialGradient id="gOcean" cx=".38" cy=".32" r=".85">
        <stop offset="0" stopColor="#2e86bd" /><stop offset="1" stopColor="#0f2f4a" />
      </radialGradient>
      <linearGradient id="gPlume" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#cfeaff" stopOpacity=".85" />
        <stop offset="1" stopColor="#cfeaff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <g stroke="#f5a623" strokeOpacity=".5" strokeWidth="1">
      <path d="M10 78 V244" strokeDasharray="5 5" />
      <path d="M6 86 L10 74 L14 86" fill="none" /><path d="M6 236 L10 248 L14 236" fill="none" />
    </g>
    <path d="M112 56 C110 34, 122 30, 118 8 C132 24, 134 40, 132 56 Z" fill="url(#gPlume)" />
    <circle cx="128" cy="158" r="108" fill="#cfe4f2" />
    <circle cx="128" cy="158" r="94" fill="url(#gOcean)" />
    <circle cx="128" cy="158" r="68" fill="#4a352b" />
    <circle cx="128" cy="158" r="26" fill="#6e3324" />
    <circle cx="128" cy="158" r="108" fill="none" stroke="#9fd0ff" strokeOpacity=".7" />
    <circle cx="128" cy="158" r="94" fill="none" stroke="#7fc3f0" strokeOpacity=".35" />
    <circle cx="128" cy="158" r="68" fill="none" stroke="#c9a08a" strokeOpacity=".35" />
    <g stroke="#8fb8d4" strokeOpacity=".5" fill="none">
      <path d="M52 108 q40 26 22 66" /><path d="M188 88 q-14 40 12 64" /><path d="M84 236 q34 -20 76 -6" />
    </g>
    <g fill="#ffb347" opacity=".85">
      <path d="M146 196 l6 -12 l6 12 z" /><circle cx="152" cy="198" r="3" />
    </g>
    <g stroke="#6fa8dc" strokeOpacity=".35" strokeDasharray="3 4">
      <path d="M208 91 L256 52" /><path d="M206 150 L256 104" /><path d="M158 194 L256 156" />
      <path d="M168 208 L256 208" /><path d="M134 172 L256 258" /><path d="M120 24 L256 302" />
    </g>
    <g fontSize="11.5" fill="#dce3f0" letterSpacing=".5">
      <text x="262" y="48">冰壳 · 10–30 km</text>
      <text x="262" y="100">液态海洋 · 60–155 km</text>
      <text x="262" y="152">海底热液喷口</text>
      <text x="262" y="204">硅酸盐岩幔</text>
      <text x="262" y="254">铁镍核 · 半径约 400 km</text>
      <text x="262" y="298">喷泉羽流 · 高约 200 km</text>
    </g>
    <g fontSize="9.5" fill="#8b97ad">
      <text x="262" y="62">含盐水冰 · 混沌地形与裂纹</text>
      <text x="262" y="114">全球性海洋 · 水量 ＞ 地球海洋 2 倍</text>
      <text x="262" y="166">“黑烟囱” · 提供化学能</text>
      <text x="262" y="218">潮汐摩擦 → 内部持续生热</text>
      <text x="262" y="268">可能产生微弱感应磁场</text>
      <text x="262" y="312">哈勃曾观测到疑似羽流</text>
    </g>
    <text x="262" y="330" fill="#5f7388" fontSize="9">各层厚度为示意放大 · 数据：伽利略号 / 哈勃</text>
    <text x="24" y="292" fill="#8b97ad" fontSize="9.5">木星潮汐力 ↑↓</text>
  </svg>
);

const LAYERS = [
  { key: 'orb', label: '轨道', icon: Orbit },
  { key: 'lab', label: '标签', icon: Tag },
  { key: 'belt', label: '小天体', icon: Asterisk },
  { key: 'mw', label: '银河', icon: Disc },
  { key: 'dso', label: '深空', icon: Sparkles },
  { key: 'con', label: '星座', icon: Star },
  { key: 'comet', label: '彗星', icon: Flame },
  { key: 'met', label: '流星', icon: Sparkles },
  { key: 'zodi', label: '黄道光', icon: Sun },
  { key: 'shadow', label: '地影', icon: Moon },
] as const;

export default function CosmosViewer() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CosmosEngine | null>(null);

  const [info, setInfo] = useState<BodyInfo | null>(null);
  const [state, setState] = useState<EngineState>({
    daysPerSec: 5, dir: 1, paused: false, horizonMode: false, eps: 23.44,
    site: { lat: 39.9, lon: 116.4 }, show: {
      orb: true, lab: true, belt: true, mw: true, dso: true, con: true,
      comet: true, met: true, zodi: true, shadow: true,
    }, scaleLevel: 0, fps: 0, dprScale: 1, clock: '————–—— –——:——', focusName: '',
    simT: 0, transit: 0, flyMode: false, flySpeed: 8, tourActive: false, realScale: false,
  });
  const [spdVal, setSpdVal] = useState(560);
  const [eclVal, setEclVal] = useState(234);
  const [latVal, setLatVal] = useState(399);
  const [warpKey, setWarpKey] = useState(0);     // bumped on every scale change → retriggers CSS flash
  const [tourCaption, setTourCaption] = useState('');
  const [lonVal, setLonVal] = useState(1164);
  const [europaOpen, setEuropaOpen] = useState(false);
  const [infoMin, setInfoMin] = useState(false);
  const [revOn, setRevOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    if (!sceneRef.current || !labelRef.current) return;
    const eng = new CosmosEngine(sceneRef.current, labelRef.current, {
      onInfoChange: setInfo,
      onStateChange: (s) => setState((p) => ({ ...p, ...s })),
    });
    try {
      eng.init();
    } catch (err) {
      console.error('[CosmosEngine] init failed:', err);
      // One-time error signal on init failure (not a render-sync anti-pattern);
      // intentionally set inside the effect's catch path.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWebglError(true);
      return;
    }
    eng.setTourCaptionCallback((c) => setTourCaption(c));
    engineRef.current = eng;
    return () => { eng.dispose(); engineRef.current = null; };
  }, []);

  // Bump the warp-flash overlay whenever the cosmic scale changes
  const prevLevel = useRef(0);
  useEffect(() => {
    if (state.scaleLevel !== prevLevel.current) {
      prevLevel.current = state.scaleLevel;
      setWarpKey((k) => k + 1);
    }
  }, [state.scaleLevel]);

  // fly/tour UI state is derived directly from engine state (state.flyMode / state.tourActive),
  // which the engine pushes (~2 Hz). This avoids redundant React state + setState-in-effect.
  const toggleFly = () => { engineRef.current?.toggleFly(); };
  const toggleTour = () => { engineRef.current?.toggleTour(); };

  // ---- Timeline (date scrubber) helpers ----
  const EPOCH = Date.UTC(2000, 0, 1, 12, 0, 0);
  const TL_MIN = Date.UTC(1850, 0, 1);
  const TL_MAX = Date.UTC(2200, 0, 1);
  const tlRange = (TL_MAX - TL_MIN) / 86400000;            // days
  const simMillis = EPOCH + state.simT * 86400000;
  const tlValue = Math.max(0, Math.min(1000, ((simMillis - TL_MIN) / 86400000 / tlRange) * 1000));
  const tlYear = new Date(simMillis).getUTCFullYear();
  const tlMonth = new Date(simMillis).getUTCMonth() + 1;
  const onTimeline = (v: number) => {
    const days = (v / 1000) * tlRange;
    engineRef.current?.setSimTime(days);
  };
  const jumpToYear = (year: number) => {
    const d = (Date.UTC(year, 0, 1) - EPOCH) / 86400000;
    engineRef.current?.setSimTime(d);
  };
  const PRESETS = [
    { label: 'J2000', year: 2000 },
    { label: '1986 哈雷', year: 1986 },
    { label: '今天', year: new Date().getFullYear() },
    { label: '2061 哈雷', year: 2061 },
    { label: '2114', year: 2114 },
  ];

  const rateFromSlider = useCallback((v: number) => {
    setSpdVal(v);
    engineRef.current?.setRate(v / 1000);
  }, []);

  const fmtRate = (d: number) => {
    const a = Math.abs(d);
    return (d < 0 ? '⇄ ' : '×') + (a >= 1 ? a.toFixed(1) : a.toFixed(3)) + ' 天 / 秒';
  };

  const swatch = info ? '#' + info.c.toString(16).padStart(6, '0') : '#f5a623';

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#03050a] text-[#dce3f0]"
      style={{ fontFamily: 'ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      {/* 3D scene + labels */}
      <div ref={sceneRef} className="absolute inset-0" />
      <div ref={labelRef} className="absolute inset-0 pointer-events-none z-[4]" />

      {/* WebGL unavailable fallback */}
      {webglError && (
        <div className="absolute inset-0 z-[20] flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="text-[15px] text-[#f5a623] tracking-[.2em]">无法启动 3D 渲染</div>
          <div className="text-[12px] text-[#9aa7bd] leading-relaxed max-w-[420px]">
            当前浏览器或设备未启用 WebGL。请更新浏览器、开启硬件加速，或在支持 WebGL 的环境
            （如桌面版 Chrome / Edge / Firefox）中打开本页面。
          </div>
        </div>
      )}

      {/* label tag styles injected once */}
      <style>{`
        .tag{position:absolute;top:0;left:0;transform:translate(-50%,-140%);font-size:11px;letter-spacing:.14em;
          color:#dce3f0;text-shadow:0 1px 4px #000;white-space:nowrap;padding:2px 7px;
          border:1px solid rgba(125,165,225,.18);border-radius:999px;background:rgba(8,12,20,.55)}
        .tag b{color:#f5a623;font-weight:600}
        .tag.deep{border-color:rgba(95,211,255,.3);color:#bcd6e8}
        .tag.deep b{color:#5fd3ff}
        .tag.moon{font-size:9.5px;padding:1px 6px;opacity:.8}
        .tag.sky{border-color:rgba(245,166,35,.35)}
        .tag.card{border:0;background:none;color:#6fb6d8;letter-spacing:.3em;font-size:11px;opacity:.85}
        .tag.con{font-size:10px;letter-spacing:.34em;color:#7f9dc4;border:0;background:none;opacity:.62}
        @keyframes cosmosWarp{0%{opacity:0}40%{opacity:.85}100%{opacity:0}}
        @keyframes cosmosRing{0%{transform:scale(.4);opacity:0}35%{opacity:.6}100%{transform:scale(2.2);opacity:0}}
      `}</style>

      {/* Cosmic warp flash overlay — retriggers on every scale-level change */}
      <div key={warpKey} className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          background: 'radial-gradient(circle at center, rgba(95,211,255,.35), rgba(245,166,35,.18) 40%, rgba(3,5,10,0) 70%)',
          animation: warpKey === 0 ? undefined : 'cosmosWarp 0.9s ease-out',
        }} />
      {warpKey > 0 && (
        <div key={`ring-${warpKey}`}
          className="pointer-events-none absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-2 border-[#5fd3ff]"
          style={{ animation: 'cosmosRing 0.9s ease-out' }} />
      )}

      {/* Auto-tour caption overlay */}
      {state.tourActive && tourCaption && (
        <div className="pointer-events-none absolute bottom-[110px] left-1/2 -translate-x-1/2 z-[6]
          max-w-[80vw] px-4 py-2 rounded-lg bg-[rgba(9,13,22,.78)] border border-[rgba(245,166,35,.4)]
          text-center backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-center gap-2 mb-0.5">
            <Rocket className="w-3.5 h-3.5 text-[#f5a623]" />
            <span className="text-[9px] tracking-[.3em] text-[#f5a623]/80 uppercase">Auto Tour · 自动巡航</span>
          </div>
          <div className="text-[13px] text-[#f5e6c8] tracking-[.04em] leading-relaxed">{tourCaption}</div>
          <div className="mt-1 text-[9px] text-[#8b97ad] tracking-[.08em]">拖拽取消 · 点击「跳过」进入下一站</div>
        </div>
      )}
      {/* Tour skip button (only while tour active) */}
      {state.tourActive && (
        <button onClick={() => engineRef.current?.tourSkip()}
          className="absolute bottom-[60px] right-3 z-[6] px-3 py-1.5 rounded-lg border border-[rgba(245,166,35,.5)]
            bg-[rgba(245,166,35,.12)] text-[#f5a623] text-[11px] tracking-[.1em] hover:bg-[rgba(245,166,35,.22)] transition-colors">
          跳过 ›
        </button>
      )}

      {/* Fly-mode crosshair + HUD */}
      {state.flyMode && (
        <div className="pointer-events-none absolute inset-0 z-[5]">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10">
            <div className="w-10 h-[2px] bg-[#5fd3ff] absolute top-1/2 -translate-y-1/2" />
            <div className="h-10 w-[2px] bg-[#5fd3ff] absolute left-1/2 -translate-x-1/2" />
            <div className="w-3 h-3 rounded-full border-2 border-[#5fd3ff] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ boxShadow: '0 0 8px rgba(95,211,255,.8)' }} />
          </div>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[rgba(9,13,22,.7)] border border-[rgba(95,211,255,.35)] text-[10.5px] tracking-[.2em] text-[#5fd3ff]">
            ✦ 漫游飞行 · FREE FLIGHT ✦
          </div>
        </div>
      )}

      {/* ───────── TOP-LEFT: Title + clock + controls ───────── */}
      <header className="absolute top-3 left-3 z-[6] w-[290px] max-w-[calc(100vw-1.5rem)]
        rounded-xl border border-[rgba(125,165,225,.18)] bg-[rgba(9,13,22,.62)] backdrop-blur-md p-3.5 shadow-2xl">
        <div className="text-[10px] tracking-[.32em] uppercase text-[#8b97ad] mb-1.5">
          Digital Orrery · Planetarium · Cosmos
        </div>
        <h1 className="text-base tracking-[.12em] font-semibold">
          <span className="text-[#f5a623]">太阳系</span>模拟器
        </h1>
        <div className="mt-2 tabular-nums text-[21px] tracking-[.06em]">{state.clock}</div>
        <div className="text-[11px] text-[#5fd3ff] tracking-[.08em] mt-0.5 tabular-nums">
          {state.paused ? '⏸ 已暂停' : fmtRate(state.daysPerSec)}
        </div>

        <Separator className="my-3 bg-[rgba(125,165,225,.18)]" />

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] tracking-[.22em] text-[#8b97ad]">时间倍率 TIME RATE</span>
        </div>
        <Slider value={[spdVal]} min={0} max={1000} step={1}
          onValueChange={(v) => rateFromSlider(v[0])}
          className="[&_[role=slider]]:bg-[#f5a623] [&_[role=slider]]:border-[#f5a623]" />

        {/* Time-scrub timeline — drag to any date 1850–2200 */}
        <div className="flex items-center justify-between mt-3 mb-1">
          <span className="text-[10px] tracking-[.22em] text-[#8b97ad]">时间轴 TIMELINE</span>
          <span className="text-[10px] text-[#5fd3ff] tabular-nums tracking-wide">
            {tlYear}–{String(tlMonth).padStart(2, '0')}
          </span>
        </div>
        <Slider value={[Math.round(tlValue)]} min={0} max={1000} step={1}
          onValueChange={(v) => onTimeline(v[0])}
          className="[&_[role=slider]]:bg-[#5fd3ff] [&_[role=slider]]:border-[#5fd3ff]" />
        <div className="flex justify-between text-[8.5px] text-[#5f7388] tabular-nums mt-0.5">
          <span>1850</span><span>2000</span><span>2200</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {PRESETS.map((p) => (
            <button key={p.label}
              onClick={() => jumpToYear(p.year)}
              className="text-[9.5px] px-1.5 py-0.5 rounded border border-[rgba(125,165,225,.18)] text-[#8b97ad] hover:border-[#5fd3ff] hover:text-white transition-colors">
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <Button size="sm" variant="ghost"
            className={`h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)] ${paused ? '!border-[#f5a623] !text-[#f5a623] !bg-[rgba(245,166,35,.1)]' : ''}`}
            onClick={() => { const p = engineRef.current?.togglePause() ?? false; setPaused(p); }}>
            {paused ? <><Play className="w-3 h-3 mr-1" />继续</> : <><Pause className="w-3 h-3 mr-1" />暂停</>}
          </Button>
          <Button size="sm" variant="ghost"
            className={`h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)] ${revOn ? '!border-[#f5a623] !text-[#f5a623] !bg-[rgba(245,166,35,.1)]' : ''}`}
            onClick={() => { const nd = -state.dir; engineRef.current?.setDir(nd); setRevOn(nd < 0); engineRef.current?.setRate(spdVal / 1000); }}>
            <Rewind className="w-3 h-3 mr-1" />逆行
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)]"
                  onClick={() => engineRef.current?.setRealTime()}>
                  <Zap className="w-3 h-3 mr-1" />实时
                </Button>
              </TooltipTrigger>
              <TooltipContent>实时 1 秒 = 1 秒</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)]"
            onClick={() => engineRef.current?.jumpToNow()}>
            <CalendarClock className="w-3 h-3 mr-1" />今天
          </Button>
          <Button size="sm" variant="ghost"
            className={`h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)] ${state.horizonMode ? '!border-[#f5a623] !text-[#f5a623] !bg-[rgba(245,166,35,.1)]' : ''}`}
            onClick={() => engineRef.current?.toggleHorizon()}>
            <Compass className="w-3 h-3 mr-1" />地平
          </Button>
          <Button size="sm" variant="ghost"
            className={`h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)] ${europaOpen ? '!border-[#f5a623] !text-[#f5a623] !bg-[rgba(245,166,35,.1)]' : ''}`}
            onClick={() => setEuropaOpen(v => !v)}>
            <Snowflake className="w-3 h-3 mr-1" />冰下海
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)]"
            onClick={() => engineRef.current?.resetView()}>
            <RotateCcw className="w-3 h-3 mr-1" />重置
          </Button>
          <Button size="sm" variant="ghost"
            className={`h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)] ${state.flyMode ? '!border-[#5fd3ff] !text-[#5fd3ff] !bg-[rgba(95,211,255,.12)]' : ''}`}
            onClick={toggleFly} title="漫游飞行模式：WASD 移动 · Shift 加速 · 空格/E 上升 · Q 下降 · 拖拽转向">
            <Navigation className="w-3 h-3 mr-1" />漫游
          </Button>
          <Button size="sm" variant="ghost"
            className={`h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)] ${state.tourActive ? '!border-[#f5a623] !text-[#f5a623] !bg-[rgba(245,166,35,.12)]' : ''}`}
            onClick={toggleTour} title="自动巡航：沿预设路径飞越太阳系到可观测宇宙">
            <Rocket className="w-3 h-3 mr-1" />巡航
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost"
                  className={`h-7 px-2.5 text-[11px] border border-[rgba(125,165,225,.18)] ${state.realScale ? '!border-[#5fd3ff] !text-[#5fd3ff] !bg-[rgba(95,211,255,.12)]' : ''}`}
                  onClick={() => engineRef.current?.setRealScale(!state.realScale)}>
                  <Ruler className="w-3 h-3 mr-1" />{state.realScale ? '真实比例' : '真实比例'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                真实比例模式：行星距离按真实 AU 线性缩放（地球 1 · 木星 5.2 · 海王星 30），
                天体尺寸按真实比例放大至可见；太阳已封顶以免遮挡水星。此模式只影响太阳系层级。
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Fly-mode control hint */}
        {state.flyMode && (
          <div className="mt-2.5 text-[10px] leading-[1.7] text-[#5fd3ff]/85 bg-[rgba(95,211,255,.06)] border border-[rgba(95,211,255,.25)] rounded-md px-2.5 py-1.5">
            <b className="text-[#5fd3ff]">漫游模式</b> · <b>W/A/S/D</b> 前后左右 · <b>空格</b>/<b>E</b> 升 · <b>Q</b> 降 · <b>Shift</b> 加速 · <b>拖拽</b> 转向 · <b>滚轮</b> 调速
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[#5fd3ff]/70 tracking-[.1em]">速度</span>
              <Slider value={[Math.round(state.flySpeed)]} min={1} max={200} step={1}
                onValueChange={(v) => engineRef.current?.setFlySpeed(v[0])}
                className="flex-1 min-w-0 [&_[role=slider]]:bg-[#5fd3ff] [&_[role=slider]]:border-[#5fd3ff]" />
              <b className="text-[#5fd3ff] tabular-nums w-12 text-right">×{state.flySpeed.toFixed(0)}</b>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 text-[11px] text-[#8b97ad]">
          {LAYERS.map(L => (
            <label key={L.key} className="flex items-center gap-1 cursor-pointer tracking-[.04em] hover:text-[#dce3f0] transition-colors">
              <Checkbox checked={state.show[L.key as keyof typeof state.show]}
                onCheckedChange={(c) => engineRef.current?.toggleLayer(L.key, !!c)}
                className="size-3.5 border-[#5fd3ff] data-[state=checked]:bg-[#5fd3ff] data-[state=checked]:border-[#5fd3ff]" />
              {L.label}
            </label>
          ))}
        </div>

        <Separator className="my-3 bg-[rgba(125,165,225,.18)]" />

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] tracking-[.22em] text-[#8b97ad]">黄赤交角 ε OBLIQUITY</span>
          <span className="text-[#f5a623] text-[11px] tabular-nums">{state.eps.toFixed(2)}°</span>
        </div>
        <Slider value={[eclVal]} min={0} max={450} step={1}
          onValueChange={(v) => { setEclVal(v[0]); engineRef.current?.setObliquity(v[0] / 10); }}
          className="[&_[role=slider]]:bg-[#f5a623] [&_[role=slider]]:border-[#f5a623]" />

        {state.horizonMode && (
          <div className="mt-3">
            <div className="text-[10px] tracking-[.22em] text-[#8b97ad] mb-1.5">观测站 SITE</div>
            <div className="flex gap-2.5">
              <div className="flex-1 min-w-0">
                <Slider value={[latVal]} min={-600} max={600} step={1}
                  onValueChange={(v) => { setLatVal(v[0]); engineRef.current?.setLat(v[0] / 10); }}
                  className="[&_[role=slider]]:bg-[#5fd3ff] [&_[role=slider]]:border-[#5fd3ff]" />
                <span className="block text-[10px] text-[#8b97ad] tracking-[.1em] mt-0.5">
                  纬度 {Math.abs(latVal / 10).toFixed(1)}°{latVal < 0 ? 'S' : 'N'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <Slider value={[lonVal]} min={-1800} max={1800} step={1}
                  onValueChange={(v) => { setLonVal(v[0]); engineRef.current?.setLon(v[0] / 10); }}
                  className="[&_[role=slider]]:bg-[#5fd3ff] [&_[role=slider]]:border-[#5fd3ff]" />
                <span className="block text-[10px] text-[#8b97ad] tracking-[.1em] mt-0.5">
                  经度 {Math.abs(lonVal / 10).toFixed(1)}°{lonVal < 0 ? 'W' : 'E'}
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ───────── TOP-RIGHT: Body Dossier ───────── */}
      <aside className={`absolute top-3 right-3 z-[6] w-[262px] max-w-[calc(100vw-1.5rem)]
        rounded-xl border border-[rgba(125,165,225,.18)] bg-[rgba(9,13,22,.62)] backdrop-blur-md p-3.5 shadow-2xl`}>
        <div className="flex justify-between items-center gap-2 mb-1.5">
          <span className="text-[10px] tracking-[.32em] uppercase text-[#8b97ad]">Body Dossier</span>
          <button onClick={() => setInfoMin(v => !v)}
            className="w-[22px] h-[22px] flex items-center justify-center rounded-md border border-[rgba(125,165,225,.18)] text-[13px] hover:border-[#5fd3ff] hover:text-white transition-colors">
            {infoMin ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
        {!infoMin && info && (
          <>
            <div className="text-[18px] tracking-[.08em] flex items-center gap-2.5">
              <i className="w-[11px] h-[11px] rounded-full flex-none" style={{ background: swatch, boxShadow: `0 0 10px ${swatch}` }} />
              <b className="font-medium">{info.n}</b>
            </div>
            <div className="text-[10px] tracking-[.28em] text-[#8b97ad] mt-1 mb-2.5 ml-5">{info.en}</div>
            <div className="max-h-[44vh] overflow-y-auto pr-1
              [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[rgba(125,165,225,.25)] [&::-webkit-scrollbar-thumb]:rounded-full">
              {info.rows.map((r, i) => (
                <div key={i} className="flex justify-between items-baseline py-1.5 gap-2.5
                  border-b border-dashed border-[rgba(125,165,225,.12)] text-[12px]">
                  <span className="text-[#8b97ad] tracking-[.08em] flex-none">{r[0]}</span>
                  <b className="font-medium tabular-nums tracking-[.03em] text-right">{r[1]}</b>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-[1.75] text-[#aab6c9]">{info.note}</p>
          </>
        )}
      </aside>

      {/* ───────── BOTTOM-CENTER: Cosmic Scale Switcher ───────── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[6]
        rounded-xl border border-[rgba(125,165,225,.18)] bg-[rgba(9,13,22,.62)] backdrop-blur-md px-3 py-2 shadow-2xl">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[92vw]">
          <Layers className="w-3.5 h-3.5 text-[#8b97ad] flex-none mr-1" />
          {SCALE_LEVELS.map(L => {
            const active = state.scaleLevel === L.id;
            return (
              <button key={L.id}
                onClick={() => engineRef.current?.setScaleLevel(L.id)}
                title={`${L.name} · ${L.span}\n${L.description}`}
                className={`flex-none flex flex-col items-center px-2.5 py-1 rounded-lg border transition-all
                  ${active
                    ? 'border-[#f5a623] text-[#f5a623] bg-[rgba(245,166,35,.12)]'
                    : 'border-[rgba(125,165,225,.18)] text-[#8b97ad] hover:border-[#5fd3ff] hover:text-white'}`}>
                <span className="text-[10px] font-semibold tracking-wider whitespace-nowrap">{L.name}</span>
                <span className={`text-[8px] tracking-[.15em] ${active ? 'text-[#f5a623]/70' : 'text-[#8b97ad]/60'} whitespace-nowrap`}>{L.en}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 px-1 text-center">
          <div className="text-[10px] text-[#5fd3ff] tracking-[.1em] tabular-nums">
            {SCALE_LEVELS[state.scaleLevel].span}
          </div>
          <div className="text-[10px] text-[#8b97ad] leading-[1.5] mt-0.5 max-w-[60vw] mx-auto">
            {SCALE_LEVELS[state.scaleLevel].description}
          </div>
          {state.realScale && (
            <div className="mt-1 px-1 text-center text-[10px] text-[#5fd3ff] tracking-[.08em] leading-[1.5] max-w-[60vw] mx-auto">
              真实比例 · 距离线性 · 天体尺寸按比例放大至可见（太阳封顶）
            </div>
          )}
        </div>
      </div>

      {/* ───────── BOTTOM-LEFT: Europa diagram ───────── */}
      {europaOpen && (
        <aside className="absolute bottom-[92px] left-3 z-[6] w-[452px] max-w-[calc(100vw-1.5rem)]
          rounded-xl border border-[rgba(125,165,225,.18)] bg-[rgba(9,13,22,.62)] backdrop-blur-md p-3.5 pb-3 shadow-2xl">
          <div className="text-[10px] tracking-[.32em] uppercase text-[#8b97ad] mb-1">
            Europa · Subsurface Ocean · 内部剖面
          </div>
          {EU}
          <p className="text-[11px] leading-[1.75] text-[#9fb0c6] mt-1">
            木星的引力让欧罗巴轨道带有微小<b className="text-[#f5a623] font-medium">偏心率</b>，冰壳在每一圈公转中被反复揉搓、
            拉伸再回弹——<b className="text-[#f5a623] font-medium">潮汐加热</b>维持了冰壳之下这片液态海。它是太阳系除地球外最有希望孕育生命的地方。
            探测计划：NASA <b className="text-[#f5a623] font-medium">「欧罗巴快船」</b> · ESA <b className="text-[#f5a623] font-medium">「JUICE」</b>。
          </p>
        </aside>
      )}

      {/* ───────── footer hint ───────── */}
      <div className="absolute bottom-3 right-3 z-[6] text-[10.5px] tracking-[.14em] text-[#8b97ad] tabular-nums">
        {state.fps} FPS · {(state.horizonMode ? 'PLANETARIUM' : 'ORRERY')} · ε {state.eps.toFixed(2)}°
        {state.realScale ? ' · 真实比例' : ' · 可读性缩放'}
        {state.dprScale < 1 ? ` · DPR×${state.dprScale.toFixed(2)}` : ''}
      </div>
      <div className="absolute bottom-3 left-3 z-[6] hidden sm:block text-[10.5px] tracking-[.12em] text-[#8b97ad]">
        <b className="text-[#5fd3ff] font-medium">拖拽</b> 转视角 · <b className="text-[#5fd3ff] font-medium">滚轮</b> 缩放 · <b className="text-[#5fd3ff] font-medium">点击天体</b> 聚焦 · <b className="text-[#5fd3ff] font-medium">Shift+拖拽</b> 平移
      </div>
    </div>
  );
}
