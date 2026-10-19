import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, Calendar, ClipboardCheck, Disc3, Download, Flag, Gauge, HelpCircle, History as ReplayIcon, Landmark, Maximize2, Minimize2, Sparkles, Trophy, Volume2, VolumeX } from "lucide-react";
import type { MissionLevel } from "@/pages/Home/useHome";
import type { MissionId } from "@/lib/missions";
import { PERF_TIER_HINT, type PerfTier } from "@/lib/perfTier";

interface MissionHeaderProps {
  missionCode: string;
  missionTitle: string;
  missionBadge: string;
  headerEn: string;
  activeMissionId: MissionId;
  missionOptions: { id: MissionId; code: string }[];
  missionSwitchable: boolean;
  onSwitchMission: (id: MissionId) => void;
  clockText: string;
  missionStatus: MissionLevel;
  bootPhase: string;
  phaseLabel: string;
  phaseLabelEn: string;
  cinemaMode: boolean;
  onToggleCinema: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  /** BGM 环境音开关（飞行段引擎底噪 / 着陆后天体专属音色） */
  bgmOn: boolean;
  onToggleBgm: () => void;
  /** BGM 音量 0..1（独立于音效） */
  bgmVolume: number;
  onBgmVolume: (v: number) => void;
  /** 配乐名目试听面板入口 */
  onOpenJukebox: () => void;
  alarmActive: boolean;
  ackCount: number;
  onAckAlarm: () => void;
  replayMode: boolean;
  replayEnabled: boolean;
  onToggleReplay: () => void;
  exportEnabled: boolean;
  onExportArchive: () => void;
  achievementCount: number;
  achievementTotal: number;
  onOpenAchievements: () => void;
  museumCount: number;
  onOpenMuseum: () => void;
  /** 任务进度总览弹层入口 */
  onOpenOverview: () => void;
  /** 生涯统计弹层入口（本地存档持久计数总览） */
  onOpenCareer: () => void;
  /** 每日挑战弹层入口（当日确定性挑战 + 生涯连击） */
  onOpenDaily: () => void;
  /** 今日每日挑战是否已完成（按钮态变「今日已完成 ✓」） */
  dailyDoneToday: boolean;
  /** 每日挑战是否进行中（按钮 primary 高亮提示） */
  challengeActive: boolean;
  /** 任务结算单（当前任务着陆后可用） */
  debriefAvailable: boolean;
  onOpenDebrief: () => void;
  /** 动效导览弹层入口 */
  onOpenGuide: () => void;
  /** 新手引导弹层入口（首次进场自动弹过之后从这里重开） */
  onOpenOnboard: () => void;
  /** 减弱动画开关（开启后全页 CSS 动画瞬时完成） */
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  /** 性能档位三档循环切换（画质 / 均衡 / 省电, localStorage 记忆） */
  perfTier: PerfTier;
  perfTierLabel: string;
  onCyclePerfTier: () => void;
}

const LAMP_CLASS: Record<MissionLevel, string> = {
  nominal: "bg-primary ring-primary/25",
  caution: "bg-foreground ring-foreground/25 animate-pulse",
  critical: "bg-destructive ring-destructive/30 animate-pulse",
};

const STATUS_TEXT: Record<MissionLevel, { zh: string; en: string; cls: string }> = {
  nominal: { zh: "状态正常", en: "NOMINAL", cls: "text-primary" },
  caution: { zh: "注意", en: "CAUTION", cls: "text-foreground" },
  critical: { zh: "危急", en: "CRITICAL", cls: "text-destructive" },
};

export function MissionHeader({
  missionCode,
  missionTitle,
  missionBadge,
  headerEn,
  activeMissionId,
  missionOptions,
  missionSwitchable,
  onSwitchMission,
  clockText,
  missionStatus,
  bootPhase,
  phaseLabel,
  phaseLabelEn,
  cinemaMode,
  onToggleCinema,
  soundOn,
  onToggleSound,
  bgmOn,
  onToggleBgm,
  bgmVolume,
  onBgmVolume,
  onOpenJukebox,
  alarmActive,
  ackCount,
  onAckAlarm,
  replayMode,
  replayEnabled,
  onToggleReplay,
  exportEnabled,
  onExportArchive,
  achievementCount,
  achievementTotal,
  onOpenAchievements,
  museumCount,
  onOpenMuseum,
  onOpenOverview,
  onOpenCareer,
  onOpenDaily,
  dailyDoneToday,
  challengeActive,
  debriefAvailable,
  onOpenDebrief,
  onOpenGuide,
  onOpenOnboard,
  reducedMotion,
  onToggleReducedMotion,
  perfTier,
  perfTierLabel,
  onCyclePerfTier,
}: MissionHeaderProps) {
  const statusInfo = STATUS_TEXT[missionStatus];
  // 处置确认涟漪：ackCount 每增加一次, 状态灯角上播一次性 ✓ 弹跳 + 圆环扩散
  const [ackFx, setAckFx] = useState(0);
  const prevAckRef = useRef(ackCount);
  const ackTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (ackCount > prevAckRef.current) {
      setAckFx((n) => n + 1);
      if (ackTimerRef.current !== null) window.clearTimeout(ackTimerRef.current);
      ackTimerRef.current = window.setTimeout(() => setAckFx(0), 1000);
    }
    prevAckRef.current = ackCount;
  }, [ackCount]);
  useEffect(() => {
    return () => {
      if (ackTimerRef.current !== null) window.clearTimeout(ackTimerRef.current);
    };
  }, []);
  // 音频设置小弹层（音效 / BGM 开关 + BGM 音量滑杆）; 点击弹层外部自动收起
  const [audioOpen, setAudioOpen] = useState(false);
  const audioPanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!audioOpen) return;
    const onDown = (e: MouseEvent) => {
      if (audioPanelRef.current && !audioPanelRef.current.contains(e.target as Node)) setAudioOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAudioOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [audioOpen]);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="dsc-safe-top mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/50 bg-primary/10 font-mono text-sm font-bold text-primary shadow-md">
            {missionBadge}
          </span>
          <div>
            <h1 className="font-display text-xl font-bold leading-tight text-foreground">
              {missionCode} <span className="text-primary">·</span> {missionTitle}
            </h1>
            {!cinemaMode && (
              <p className="font-mono text-xs tracking-widest text-muted-foreground">{headerEn}</p>
            )}
          </div>
          {!cinemaMode && (
            <div
              className="ml-1 flex max-w-full items-center gap-1 overflow-x-auto rounded-md border border-border bg-card p-1 shadow-sm"
              role="tablist"
              aria-label="任务切换"
              title={missionSwitchable ? "待发射状态可切换任务剧情" : "点火后 / 回放中 / 巡视车解锁后不可切换任务"}
            >
              {missionOptions.map((opt) => {
                const active = opt.id === activeMissionId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={!missionSwitchable}
                    onClick={() => onSwitchMission(opt.id)}
                    className={`rounded-sm px-2.5 py-2 font-mono text-xs font-bold tracking-widest transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed lg:py-1 ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-primary disabled:opacity-40 disabled:hover:text-muted-foreground"
                    }`}
                  >
                    {opt.code}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!cinemaMode && (
          <div className="flex items-center gap-2">
            {replayMode ? (
              <span className="animate-pulse rounded-full border border-destructive bg-destructive/10 px-3 py-1 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
                REPLAY
              </span>
            ) : (
              <span className="rounded-full border border-primary bg-primary/10 px-3 py-1 font-mono text-xs tracking-widest text-primary shadow-sm">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary align-middle" aria-hidden="true" />
                LIVE TELEMETRY
              </span>
            )}
            <span className="rounded-full border border-border bg-card px-3 py-1 font-mono text-xs tracking-widest text-card-foreground shadow-sm">
              阶段 <span className="text-primary">{phaseLabel}</span> · {phaseLabelEn}
            </span>
          </div>
        )}

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2 lg:flex-nowrap lg:gap-6">
          <div className="text-right">
            {!cinemaMode && <p className="font-mono text-xs tracking-widest text-muted-foreground">任务时钟 MISSION CLOCK</p>}
            <p className={`font-mono font-bold tabular-nums leading-tight text-primary ${cinemaMode ? "text-3xl" : "text-2xl"}`}>
              {/* key 换时钟文本 → 每秒重挂载播一次 tick 上滑动画（翻页钟质感） */}
              <span key={clockText} className="clock-tick inline-block">
                {clockText}
              </span>
            </p>
          </div>
          <div className="relative flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 shadow-md">
            {ackFx > 0 && (
              <span key={ackFx} className="pointer-events-none absolute -right-2 -top-3 z-10 flex h-6 w-6 items-center justify-center">
                <span className="ack-ring absolute h-6 w-6 rounded-full border-2 border-primary" aria-hidden="true" />
                <span className="ack-float flex h-5 w-5 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground shadow-md">
                  ✓
                </span>
              </span>
            )}
            <span className={`h-3 w-3 rounded-full ring-4 ${LAMP_CLASS[missionStatus]}`} />
            <div className="leading-tight">
              <p className={`font-mono text-sm font-bold tracking-widest ${statusInfo.cls}`}>{statusInfo.en}</p>
              {!cinemaMode && (
                <p className="text-xs text-muted-foreground">
                  {statusInfo.zh} · {bootPhase === "online" ? "常态监测" : "上电自检"}
                </p>
              )}
            </div>
            {alarmActive && (
              <button
                type="button"
                onClick={onAckAlarm}
                aria-label="处置确认当前警报"
                title="处置 ACK · 立即解除警报"
                className="animate-pulse rounded-md border border-destructive/60 bg-destructive/10 px-2.5 py-1 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm transition hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
              >
                处置 ACK
              </button>
            )}
            {!cinemaMode && ackCount > 0 && (
              <span
                className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-xs tabular-nums text-primary"
                title="本次任务已处置警报数"
              >
                已处置 {ackCount}
              </span>
            )}
          </div>

          <div className="flex max-w-full flex-wrap items-center justify-end gap-2 lg:flex-nowrap">
            <button
              type="button"
              onClick={onToggleReplay}
              disabled={!replayEnabled && !replayMode}
              aria-label={replayMode ? "退出回放" : "进入发射回放"}
              title={
                replayMode
                  ? "退出回放 · 回到实时监测 (ESC)"
                  : replayEnabled
                    ? "回放本次发射与着陆全程遥测"
                    : "着陆完成后可回放本次任务"
              }
              className={`flex h-11 items-center gap-2 rounded-md border lg:h-10 px-3 font-mono text-xs tracking-widest shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 ${
                replayMode
                  ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "border-border bg-card text-muted-foreground hover:border-destructive/60 hover:text-destructive"
              }`}
            >
              <ReplayIcon className="h-4 w-4" aria-hidden="true" />
              {replayMode ? "退出回放" : "回放"}
            </button>
            <button
              type="button"
              onClick={onExportArchive}
              disabled={!exportEnabled}
              aria-label="导出任务档案"
              title={
                exportEnabled
                  ? "导出任务日志与遥测摘要（JSON + TXT 双格式）"
                  : "日志不足 5 条, 任务档案暂不可导出"
              }
              className="flex h-11 items-center gap-2 rounded-md border lg:h-10 border-border bg-card px-3 font-mono text-xs tracking-widest text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              导出
            </button>
            <button
              type="button"
              onClick={onOpenDebrief}
              disabled={!debriefAvailable}
              aria-label="打开任务结算单"
              title={debriefAvailable ? "任务结算单 · 五维评分与综合评级" : "当前任务完成软着陆后可查看结算单"}
              className="flex h-11 items-center gap-2 rounded-md border lg:h-10 border-border bg-card px-3 font-mono text-xs tracking-widest text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              战报
            </button>
            <button
              type="button"
              onClick={onOpenOverview}
              aria-label="打开任务进度总览"
              title="任务进度总览 · 四任务着陆 / 采样 / 成就战果一览"
              className="flex h-11 items-center gap-2 rounded-md border lg:h-10 border-border bg-card px-3 font-mono text-xs tracking-widest text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
            >
              <Flag className="h-4 w-4" aria-hidden="true" />
              总览
            </button>
            <button
              type="button"
              onClick={onOpenCareer}
              aria-label="打开生涯统计"
              title="生涯统计 · 着陆 / 里程 / 样品 / 玩法纪录跨会话累计总览"
              className="flex h-11 items-center gap-2 rounded-md border lg:h-10 border-border bg-card px-3 font-mono text-xs tracking-widest text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              生涯
            </button>
            <button
              type="button"
              onClick={onOpenDaily}
              aria-label="打开每日挑战"
              title={
                dailyDoneToday
                  ? "每日挑战 · 今日已完成, 连击已入账"
                  : challengeActive
                    ? "每日挑战 · 进行中"
                    : "每日挑战 · 全天同一套天体与条件, 连击计入生涯"
              }
              className={`flex h-11 items-center gap-2 rounded-md border lg:h-10 px-3 font-mono text-xs tracking-widest shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                dailyDoneToday
                  ? "border-primary bg-primary/10 text-primary"
                  : challengeActive
                    ? "border-primary/60 bg-card text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary"
              }`}
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              {dailyDoneToday ? "今日已完成 ✓" : "每日挑战"}
            </button>
            <button
              type="button"
              onClick={onOpenAchievements}
              aria-label="打开成就墙"
              title={`成就墙 · 全任务通用 · 已解锁 ${achievementCount}/${achievementTotal}`}
              className="flex h-11 items-center gap-2 rounded-md border lg:h-10 border-border bg-card px-3 font-mono text-xs tracking-widest text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
            >
              <Trophy className="h-4 w-4" aria-hidden="true" />
              成就
              <span className="rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-bold tabular-nums text-primary">
                {achievementCount}/{achievementTotal}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenMuseum}
              aria-label="打开样品博物馆陈列厅"
              title={`样品厅 · 跨任务陈列采集样品 · 已陈列 ${museumCount} 件`}
              className="flex h-11 items-center gap-2 rounded-md border lg:h-10 border-border bg-card px-3 font-mono text-xs tracking-widest text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
            >
              <Landmark className="h-4 w-4" aria-hidden="true" />
              样品厅
              <span className="rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-bold tabular-nums text-primary">
                {museumCount}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenOnboard}
              aria-label="打开新手引导"
              title="新手引导 · 七步速览核心玩法"
              className="flex h-11 w-11 items-center justify-center rounded-md border lg:h-10 lg:w-10 border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenGuide}
              aria-label="打开动效导览"
              title="动效导览 · 全部动画效果清单与触发方式"
              className="flex h-11 w-11 items-center justify-center rounded-md border lg:h-10 lg:w-10 border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onToggleReducedMotion}
              aria-label={reducedMotion ? "恢复全部动画" : "减弱动画"}
              aria-pressed={reducedMotion}
              title={reducedMotion ? "减弱动画已开启 · 点击恢复全部动画" : "减弱动画 · 一键静默循环与过场动画"}
              className={`flex h-11 w-11 items-center justify-center rounded-md border lg:h-10 lg:w-10 shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                reducedMotion
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary"
              }`}
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
            </button>
            {/* 性能档位循环切换：画质 FULL → 均衡 BALANCED → 省电 SAVER（localStorage 记忆; 减弱动画开启时档位让位） */}
            <button
              type="button"
              onClick={onCyclePerfTier}
              aria-label={`性能档位切换, 当前 ${perfTierLabel}`}
              title={`${perfTierLabel} · ${PERF_TIER_HINT[perfTier]} · 点击切换下一档${reducedMotion ? "（减弱动画开启中, 当前按省电剖面渲染）" : ""}`}
              className={`flex h-11 items-center gap-1.5 rounded-md border px-2.5 font-mono text-xs font-bold tracking-widest shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus lg:h-10 ${
                perfTier === "full"
                  ? "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary"
                  : "border-primary/60 bg-primary/10 text-primary"
              }`}
            >
              <Gauge className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">{perfTierLabel}</span>
            </button>
            {/* 静音态常驻徽标：一眼看出当前无声, 点徽标直接恢复音效（大屏显示, 窄屏收起只留按钮变色） */}
            {!soundOn && (
              <button
                type="button"
                onClick={onToggleSound}
                aria-label="已静音, 点击恢复音效"
                title="点击直接取消静音, 恢复全部音效"
                className="hidden items-center rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-primary shadow-sm transition hover:bg-primary/25 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus lg:inline-flex"
              >
                🔇 已静音 · 点击恢复
              </button>
            )}
            {/* 音频设置：点击弹出小面板（音效开关 / BGM 开关 / BGM 音量滑杆, 偏好随存档持久化） */}
            <div className="relative" ref={audioPanelRef}>
              <button
                type="button"
                onClick={() => setAudioOpen((v) => !v)}
                aria-label="音频设置"
                aria-expanded={audioOpen}
                title="音频设置 · 音效 / 环境音开关与音量"
                className={`flex h-11 w-11 items-center justify-center rounded-md border lg:h-10 lg:w-10 shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                  audioOpen || (!soundOn && !bgmOn)
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary"
                }`}
              >
                {soundOn ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
              </button>
              {audioOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-60 animate-in fade-in zoom-in-95 rounded-lg border border-border bg-card p-3 shadow-xl duration-150">
                  <p className="font-mono text-[10px] tracking-widest text-muted-foreground">AUDIO · 音频设置</p>
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      onClick={onToggleSound}
                      className="flex min-h-11 w-full items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-bold text-card-foreground transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0"
                    >
                      操作音效
                      <span className={`font-mono ${soundOn ? "text-primary" : "text-muted-foreground"}`}>
                        {soundOn ? "开" : "关"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onToggleBgm}
                      className="flex min-h-11 w-full items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-bold text-card-foreground transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0"
                    >
                      环境音 BGM
                      <span className={`font-mono ${bgmOn ? "text-primary" : "text-muted-foreground"}`}>
                        {bgmOn ? "开" : "关"}
                      </span>
                    </button>
                    <div className="rounded-md border border-border bg-background/60 px-3 py-2">
                      <label
                        htmlFor="bgm-volume"
                        className="flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground"
                      >
                        BGM 音量
                        <span className="tabular-nums text-card-foreground">{Math.round(bgmVolume * 100)}%</span>
                      </label>
                      <input
                        id="bgm-volume"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(bgmVolume * 100)}
                        disabled={!bgmOn}
                        onChange={(e) => onBgmVolume(Number(e.target.value) / 100)}
                        className="mt-1.5 h-6 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ accentColor: "hsl(var(--primary))" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAudioOpen(false);
                        onOpenJukebox();
                      }}
                      className="flex min-h-11 w-full items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0"
                    >
                      <span className="flex items-center gap-2">
                        <Disc3 className="h-3.5 w-3.5" aria-hidden="true" />
                        配乐名目 · 试听
                      </span>
                      <span className="font-mono text-[10px] tracking-widest text-muted-foreground">JUKEBOX</span>
                    </button>
                    <p className="font-mono text-[9px] leading-relaxed tracking-widest text-muted-foreground/70">
                      环境音随任务自动切换：飞行段引擎底噪 · 着陆后各天体专属氛围
                    </p>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onToggleCinema}
              aria-label={cinemaMode ? "退出影院模式" : "进入影院模式"}
              title={cinemaMode ? "退出影院模式 (ESC)" : "影院模式 · 全屏"}
              className={`flex h-11 w-11 items-center justify-center rounded-md border lg:h-10 lg:w-10 shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                cinemaMode
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary"
              }`}
            >
              {cinemaMode ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
