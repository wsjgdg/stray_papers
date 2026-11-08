import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Crown } from "lucide-react";
import { playStormThunder, playTripleFanfare } from "@/lib/missionAudio";
import { effectiveProfile, PERF_TIER_LABEL, type PerfTier } from "@/lib/perfTier";
import type { MissionLevel, useHome } from "./useHome";
import { formatStormRemain } from "./useHome";
import { MissionHeader } from "@/components/home/MissionHeader";
import { StarfieldCanvas } from "@/components/home/StarfieldCanvas";
import { RadarScope } from "@/components/home/RadarScope";
import { TelemetryPanel } from "@/components/home/TelemetryPanel";
import { EventLogStream } from "@/components/home/EventLogStream";
import { GroundStationBar } from "@/components/home/GroundStationBar";
import { BootOverlay } from "@/components/home/BootOverlay";
import { MetricDetailDialog } from "@/components/home/MetricDetailDialog";
import { LaunchControl } from "@/components/home/LaunchControl";
import { PhaseChain } from "@/components/home/PhaseChain";
import { SurfaceChain } from "@/components/home/SurfaceChain";
import { MainQuest } from "@/components/home/MainQuest";
import { GoalHintCard } from "@/components/home/GoalHintCard";
import { LandingOverlay } from "@/components/home/LandingOverlay";
import { CommSubtitle } from "@/components/home/CommSubtitle";
import { ReplayBar } from "@/components/home/ReplayBar";
import { CameraSwitcher } from "@/components/home/CameraSwitcher";
import { ReplayCamLog, ReplayCamRadar, ReplayCamTelemetry } from "@/components/home/ReplayCameras";
import { AchievementToast } from "@/components/home/AchievementToast";
import { MeteorShowerBanner, CryoVentBanner, FogBankBanner } from "@/components/home/SurfaceEventBanners";
import { ManualLanding } from "@/components/home/ManualLanding";
import { CrisisCard } from "@/components/home/CrisisCard";
import { HandshakeCard } from "@/components/home/HandshakeCard";
import { DiagCard } from "@/components/home/DiagCard";
import { QuizCard } from "@/components/home/QuizCard";
import { AntennaCard } from "@/components/home/AntennaCard";
import { DutyBoard } from "@/components/home/DutyBoard";
import { WarpTransition } from "@/components/home/WarpTransition";

// 非首屏的重型面板与弹层按需分包（首次挂载/打开时才拉取对应 chunk, 压低首屏包体与主线程解析成本;
// 弹层组件内部本就有 !open → null 守卫, 条件挂载与既有进出场表现一致, 无退场动画依赖）
const RoverControl = lazy(() => import("@/components/home/RoverControl").then((m) => ({ default: m.RoverControl })));
const SampleMuseum = lazy(() => import("@/components/home/SampleMuseum").then((m) => ({ default: m.SampleMuseum })));
const SampleReportDialog = lazy(() =>
  import("@/components/home/SampleReportDialog").then((m) => ({ default: m.SampleReportDialog })),
);
const AchievementWall = lazy(() => import("@/components/home/AchievementWall").then((m) => ({ default: m.AchievementWall })));
const MissionOverview = lazy(() => import("@/components/home/MissionOverview").then((m) => ({ default: m.MissionOverview })));
const CareerStats = lazy(() => import("@/components/home/CareerStats").then((m) => ({ default: m.CareerStats })));
const DailyChallenge = lazy(() => import("@/components/home/DailyChallenge").then((m) => ({ default: m.DailyChallenge })));
const MissionDebrief = lazy(() => import("@/components/home/MissionDebrief").then((m) => ({ default: m.MissionDebrief })));
const AnimationGuide = lazy(() => import("@/components/home/AnimationGuide").then((m) => ({ default: m.AnimationGuide })));
const MissionBriefing = lazy(() => import("@/components/home/MissionBriefing").then((m) => ({ default: m.MissionBriefing })));
const MusicJukebox = lazy(() => import("@/components/home/MusicJukebox").then((m) => ({ default: m.MusicJukebox })));
const OnboardGuide = lazy(() => import("@/components/home/OnboardGuide").then((m) => ({ default: m.OnboardGuide })));

const ONBOARD_KEY = "dsc-onboarded";

function hasSeenOnboard(): boolean {
  try {
    return window.localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return true; // 存储不可用时不自动弹（可从顶栏「?」重开）
  }
}

export function HomePage(p: ReturnType<typeof useHome>) {
  // 配乐名目试听面板开关（音频设置面板内入口打开）
  const [jukeboxOpen, setJukeboxOpen] = useState(false);
  // 新手引导（批次 P-8）：首次进场自动弹一次, 关闭后写已读标记; 顶栏「?」随时重开
  const [onboardOpen, setOnboardOpen] = useState(() => !hasSeenOnboard());
  const closeOnboard = () => {
    try {
      window.localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      // 存储不可用时仅本次会话不再弹
    }
    setOnboardOpen(false);
  };

  // 阶段推进过场光带：phaseIndex 前进一步就在主视口横扫一道光（回放中不触发）
  const [phaseFx, setPhaseFx] = useState(0);
  const prevPhaseRef = useRef(p.phaseIndex);
  const phaseTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (p.phaseIndex !== prevPhaseRef.current) {
      const advanced = p.phaseIndex > prevPhaseRef.current;
      prevPhaseRef.current = p.phaseIndex;
      if (advanced && !p.replayMode) {
        setPhaseFx((n) => n + 1);
        if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
        phaseTimerRef.current = window.setTimeout(() => setPhaseFx(0), 800);
      }
    }
  }, [p.phaseIndex, p.replayMode]);

  // 任务切换信号重锁定：切换瞬间全屏扫描线叠层 + 文字闪烁 ~1.2s
  const [relockFx, setRelockFx] = useState(0);
  const prevMissionRef = useRef(p.activeMissionId);
  const relockTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (p.activeMissionId !== prevMissionRef.current) {
      prevMissionRef.current = p.activeMissionId;
      setRelockFx((n) => n + 1);
      if (relockTimerRef.current !== null) window.clearTimeout(relockTimerRef.current);
      relockTimerRef.current = window.setTimeout(() => setRelockFx(0), 1300);
    }
  }, [p.activeMissionId]);

  // 黑障恢复信号雪花：signalLoss 由 true 转 false 的瞬间全屏扫描线闪烁 ~0.9s
  const [staticFx, setStaticFx] = useState(0);
  const prevLossRef = useRef(p.signalLoss);
  const staticTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevLossRef.current && !p.signalLoss && !p.replayMode) {
      setStaticFx((n) => n + 1);
      if (staticTimerRef.current !== null) window.clearTimeout(staticTimerRef.current);
      staticTimerRef.current = window.setTimeout(() => setStaticFx(0), 1000);
    }
    prevLossRef.current = p.signalLoss;
  }, [p.signalLoss, p.replayMode]);

  // 成就解锁全屏金光扫过：toast 换成就 id 时横贯一道亮带 ~0.85s；三星/四星统帅另加全屏庆典 ~3.4s
  const [achBurst, setAchBurst] = useState(0);
  const [tripleFx, setTripleFx] = useState(0);
  const [crownKind, setCrownKind] = useState<"triple" | "quad">("triple");
  const prevToastIdRef = useRef<string | null>(p.achievementToastDef?.id ?? null);
  const burstTimerRef = useRef<number | null>(null);
  const tripleTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const id = p.achievementToastDef?.id ?? null;
    if (id !== null && id !== prevToastIdRef.current) {
      setAchBurst((n) => n + 1);
      if (burstTimerRef.current !== null) window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = window.setTimeout(() => setAchBurst(0), 950);
      if (id === "triple_landing" || id === "quadruple_landing") {
        setCrownKind(id === "quadruple_landing" ? "quad" : "triple");
        setTripleFx((n) => n + 1);
        playTripleFanfare();
        if (tripleTimerRef.current !== null) window.clearTimeout(tripleTimerRef.current);
        tripleTimerRef.current = window.setTimeout(() => setTripleFx(0), 3500);
      }
    }
    prevToastIdRef.current = id;
  }, [p.achievementToastDef]);

  // 全球风暴闪电调度：随机 4-10s 一道闪电（key 重挂载播双闪动画）+ 同步滚雷音效
  // 两种落点交替：远落点（左上）低沉长滚雷 / 近落点（右中）略高短滚雷
  const [boltFx, setBoltFx] = useState(0);
  const boltSeqRef = useRef(0);
  const boltTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!p.globalStormActive || p.replayMode) return;
    let cancelled = false;
    const schedule = () => {
      boltTimerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        boltSeqRef.current += 1;
        setBoltFx(boltSeqRef.current);
        playStormThunder(boltSeqRef.current % 2 === 0);
        schedule();
      }, 4000 + Math.random() * 6000);
    };
    schedule();
    return () => {
      cancelled = true;
      if (boltTimerRef.current !== null) window.clearTimeout(boltTimerRef.current);
    };
  }, [p.globalStormActive, p.replayMode]);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
      if (relockTimerRef.current !== null) window.clearTimeout(relockTimerRef.current);
      if (staticTimerRef.current !== null) window.clearTimeout(staticTimerRef.current);
      if (burstTimerRef.current !== null) window.clearTimeout(burstTimerRef.current);
      if (tripleTimerRef.current !== null) window.clearTimeout(tripleTimerRef.current);
    };
  }, []);

  const alarmLevelFor = (metricKey: string): MissionLevel => {
    if (p.alarmMetricKey !== metricKey) return "nominal";
    return p.missionStatus === "critical" ? "critical" : "caution";
  };

  const targetView = p.moonMix > 0.5;
  const replaying = p.replayMode;
  // 化验报告弹层数据源：陈列厅打开的报告优先于遥控面板打开的报告
  const reportView = p.museumReport ?? p.activeSampleReport;
  // 性能档位生效剖面（reducedMotion 优先级最高, 开启时无视档位取 saver）
  const effTier: PerfTier = p.reducedMotion ? "saver" : p.perfTier;
  const perf = effectiveProfile(p.perfTier, p.reducedMotion);
  const perfClass = effTier === "full" ? "" : `perf-${effTier}`;

  return (
    <div
      className={`min-h-screen bg-background font-sans text-foreground ${p.shaking ? "animate-mission-shake" : ""} ${
        p.cinemaMode ? "cursor-none" : ""
      } ${p.warpLabel ? "warp-scene-distort" : ""} ${p.reducedMotion ? "reduce-motion" : ""} ${perfClass}`}
    >
      <MissionHeader
        missionCode={p.missionCode}
        missionTitle={p.missionTitle}
        missionBadge={p.missionBadge}
        headerEn={p.headerEn}
        activeMissionId={p.activeMissionId}
        missionOptions={p.missionOptions}
        missionSwitchable={p.missionSwitchable}
        onSwitchMission={p.onSwitchMission}
        clockText={p.clockText}
        missionStatus={p.missionStatus}
        bootPhase={p.bootPhase}
        phaseLabel={p.phaseLabel}
        phaseLabelEn={p.phaseLabelEn}
        cinemaMode={p.cinemaMode}
        onToggleCinema={p.toggleCinema}
        soundOn={p.soundOn}
        onToggleSound={p.toggleSound}
        bgmOn={p.bgmOn}
        onToggleBgm={p.toggleBgm}
        bgmVolume={p.bgmVolume}
        onBgmVolume={p.changeBgmVolume}
        onOpenJukebox={() => setJukeboxOpen(true)}
        alarmActive={p.alarmActive}
        ackCount={p.ackCount}
        onAckAlarm={p.ackAlarm}
        replayMode={p.replayMode}
        replayEnabled={p.replayEnabled}
        onToggleReplay={p.toggleReplay}
        exportEnabled={p.exportEnabled}
        onExportArchive={p.onExportArchive}
        achievementCount={p.achievementCount}
        achievementTotal={p.achievementTotal}
        onOpenAchievements={p.openAchievementWall}
        museumCount={p.museumCount}
        onOpenMuseum={p.openMuseum}
        onOpenOverview={p.openOverview}
        onOpenCareer={p.openCareer}
        onOpenDaily={p.openDaily}
        dailyDoneToday={p.dailyDoneToday}
        challengeActive={p.challengeActive}
        debriefAvailable={p.debriefAvailable}
        onOpenDebrief={p.openDebrief}
        onOpenGuide={p.openGuide}
        onOpenOnboard={() => setOnboardOpen(true)}
        reducedMotion={p.reducedMotion}
        onToggleReducedMotion={p.toggleReducedMotion}
        perfTier={p.perfTier}
        perfTierLabel={PERF_TIER_LABEL[p.perfTier]}
        onCyclePerfTier={p.cyclePerfTier}
      />

      {replaying && (
        <ReplayBar
          frameIndex={p.replayFrameIndex}
          frameCount={p.replayFrameCount}
          playing={p.replayPlaying}
          speed={p.replaySpeed}
          clockText={p.clockText}
          phaseLabel={p.phaseLabel}
          onTogglePlay={p.toggleReplayPlay}
          onSeek={p.seekReplayFrame}
          onStepFrame={p.stepReplayFrame}
          onSpeedChange={p.changeReplaySpeed}
          onExit={p.exitReplay}
        />
      )}

      {!p.cinemaMode && !replaying && (
        <PhaseChain
          phaseIndex={p.phaseIndex}
          phases={p.phases}
          missionCode={p.missionCode}
          canJump={p.canJumpPhase}
          onJumpPhase={p.onJumpPhase}
          onSkipPhase={p.onSkipPhase}
        />
      )}
      {!p.cinemaMode && !replaying && (
        <MainQuest
          missionId={p.activeMissionId}
          phaseId={p.phaseId}
          roverUnlocked={p.roverUnlocked}
          samplesCount={p.roverSamples.length}
          reportsCount={Object.keys(p.sampleReports).length}
          debriefDone={p.debriefData !== null}
        />
      )}
      {!p.cinemaMode && !replaying && (
        <GoalHintCard
          list={p.achievementList}
          unlockedMap={p.achievementMap}
          onOpenWall={p.openAchievementWall}
        />
      )}
      {!p.cinemaMode && !replaying && p.flightActive && p.phaseId === "landed" && (
        <SurfaceChain
          missionId={p.activeMissionId}
          missionCode={p.missionCode}
          meteorActive={p.meteorBanner !== null}
          stormActive={p.dustStormActive || p.globalStormActive || p.stormClearing}
          geyserActive={p.cryoVentBanner !== null}
          fogActiveNow={p.fogActive || p.fogBanner !== null}
          venusSurvivalRemainS={p.venusSurvivalRemainS}
          venusEvacuating={p.venusEvacuating}
          onTriggerEvent={p.onTriggerSurfaceEvent}
          onTriggerEvac={p.onTriggerVenusEvac}
          onOpenDebrief={p.openDebrief}
          onRedeploy={p.redeployToStandby}
        />
      )}

      <main
        className={`mx-auto grid max-w-screen-2xl items-stretch gap-3 p-2 sm:gap-4 sm:p-4 ${
          p.cinemaMode ? "grid-cols-1" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)_minmax(0,4fr)]"
        }`}
      >
        {!p.cinemaMode && (
          <section
            aria-label="遥测面板群"
            className="order-2 animate-in fade-in slide-in-from-bottom-4 duration-500 lg:order-none"
          >
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">遥测面板群</h2>
              {/* 巡视车低电量联动警戒（电量 ≤15% 且未耗尽） */}
              {p.roverUnlocked && !p.roverSnap.batteryDead && p.roverSnap.battery <= 15 && (
                <span className="animate-pulse rounded-sm border border-destructive/60 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-destructive">
                  ⚠ ROVER LOW BATT {p.roverSnap.battery.toFixed(0)}%
                </span>
              )}
              <p className="font-mono text-xs tracking-widest text-muted-foreground">TELEMETRY · 1HZ REFRESH</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {p.metrics.map((metric, i) => (
                <TelemetryPanel
                  key={metric.key}
                  metric={metric}
                  alarmLevel={alarmLevelFor(metric.key)}
                  lit={p.bootPhase === "online" || i < p.litPanelCount}
                  onOpen={p.openMetric}
                />
              ))}
            </div>
          </section>
        )}

        {/* 移动端主视口排第一（order-1）, 桌面端恢复三栏原始顺序 */}
        <div className="order-1 flex min-w-0 flex-col lg:order-none">
        {replaying && <CameraSwitcher cam={p.replayCam} onSelect={p.selectReplayCam} />}
        <section
          aria-label="主视口"
          className={`relative flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-in fade-in duration-700 ${
            p.cinemaMode ? "min-h-[72vh]" : "dsc-viewport-canvas min-h-72 sm:min-h-96"
          }`}
        >
          {/* 影院模式入场：上下黑幕从主视口向两侧滑开（一次性幕布开启仪式） */}
          {p.cinemaMode && (
            <>
              <div className="cinema-curtain-top pointer-events-none absolute inset-x-0 top-0 z-30 h-1/2 bg-background" aria-hidden="true" />
              <div className="cinema-curtain-bottom pointer-events-none absolute inset-x-0 bottom-0 z-30 h-1/2 bg-background" aria-hidden="true" />
            </>
          )}
          {replaying && p.replayCam !== "cam1" ? (
            <div key={p.replayCam} className="cam-switch-fx absolute inset-0">
              {p.replayCam === "cam2" && (
                <ReplayCamTelemetry
                  metrics={p.metrics}
                  phaseLabelEn={p.phaseLabelEn}
                  onOpenMetric={p.openMetric}
                />
              )}
              {p.replayCam === "cam3" && <ReplayCamRadar metrics={p.metrics} stationList={p.stationList} />}
              {p.replayCam === "cam4" && <ReplayCamLog logEntries={p.logEntries} />}
            </div>
          ) : (
          <div
            key="cam-viewport"
            className={`absolute inset-0 ${replaying ? "cam-switch-fx" : ""}`}
          >
          <div
            className={`absolute inset-0 transition-opacity duration-1000 ${
              p.bootPhase === "online" ? "opacity-100" : "opacity-25"
            } ${p.cinemaMode ? "cinema-breath" : ""}`}
          >
            <StarfieldCanvas
              moonMix={p.moonMix}
              visual={p.missionVisual}
              showerActive={!!p.shower && !replaying}
              onMeteorHit={p.onMeteorHit}
              auroraActive={!!p.aurora && !replaying}
              auroraRare={p.aurora?.rare}
              onAuroraHit={p.onAuroraHit}
              onConstellationHit={p.wishConstellation}
            />
          </div>

          {p.missionVisual.planet === "mars" && p.dustIntensity > 0.02 && (
            <div
              className="pointer-events-none absolute inset-0 bg-background transition-opacity duration-1000"
              style={{
                opacity: Math.min(
                  p.globalStormActive ? 0.82 : 0.62,
                  p.dustIntensity * (p.globalStormActive ? 0.82 : 0.62),
                ),
              }}
              aria-hidden="true"
            />
          )}

          {/* 金星酸雾遮罩：赭黄 token 派生（destructive 低透明度）, 强度随 dustIntensity 同构渐变 */}
          {p.missionVisual.planet === "venus" && p.dustIntensity > 0.02 && (
            <div
              className="pointer-events-none absolute inset-0 bg-destructive/30 transition-opacity duration-1000"
              style={{ opacity: Math.min(0.75, p.dustIntensity * 0.75) }}
              aria-hidden="true"
            />
          )}

          {/* 泰坦甲烷浓雾遮罩：橙褐雾幕（destructive 低透明度 token 派生）, 浓度随 fogLevel 渐变 */}
          {p.missionVisual.planet === "titan" && p.fogLevel > 0.02 && (
            <div
              className="pointer-events-none absolute inset-0 bg-destructive/25 transition-opacity duration-1000"
              style={{ opacity: Math.min(0.7, p.fogLevel * 0.7) }}
              aria-hidden="true"
            />
          )}

          {/* 全球沙尘暴闪电：随机调度的一次性双闪（两种落点交替, 与滚雷音效同步） */}
          {p.globalStormActive && !replaying && boltFx > 0 && (
            <span
              key={boltFx}
              className={`pointer-events-none absolute inset-0 z-10 ${
                boltFx % 2 === 1 ? "storm-lightning" : "storm-lightning storm-lightning-2"
              }`}
              aria-hidden="true"
            />
          )}

          {p.globalStormActive && (
            <div className="pointer-events-none absolute inset-x-0 top-1/4 z-20 flex justify-center px-4">
              <span className="storm-banner animate-pulse rounded-md border-2 border-destructive bg-background/70 px-4 py-1.5 text-center font-mono text-sm font-bold tracking-widest text-destructive shadow-lg backdrop-blur-sm">
                GLOBAL DUST STORM · 全球性沙尘暴警报
                {p.globalStormRemainS !== null && (
                  <span
                    className={`ml-3 rounded-sm border px-1.5 py-0.5 tabular-nums tracking-normal ${
                      p.globalStormRemainS <= 10
                        ? "countdown-urgent border-destructive bg-destructive font-extrabold text-destructive-foreground"
                        : "border-primary/50 bg-primary/10 text-primary"
                    }`}
                  >
                    预计过境 T-{formatStormRemain(p.globalStormRemainS)}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* 金星酸雾锋面横幅（区域级, 不走全球级升级路径） */}
          {p.missionVisual.planet === "venus" && p.dustStormActive && !p.globalStormActive && (
            <div className="pointer-events-none absolute inset-x-0 top-1/4 z-20 flex justify-center px-4">
              <span className="storm-banner animate-pulse rounded-md border-2 border-destructive bg-background/70 px-4 py-1.5 text-center font-mono text-sm font-bold tracking-widest text-destructive shadow-lg backdrop-blur-sm">
                ACID HAZE · 酸雾锋面警报 · 能见度受限
              </span>
            </div>
          )}

          {/* 月球微陨石雨横幅（表面级事件, 调度节拍对齐区域风暴; 回放态隐藏） */}
          {!replaying && <MeteorShowerBanner banner={p.meteorBanner} />}

          {/* 欧罗巴冰裂隙喷发横幅（地震预警 / 喷发中断 / 新鲜冰晶黄金窗口三态） */}
          {!replaying && <CryoVentBanner banner={p.cryoVentBanner} />}

          {/* 泰坦甲烷浓雾横幅（雾锋面逼近 / 浓雾笼罩两态; 回放态隐藏） */}
          {!replaying && <FogBankBanner banner={p.fogBanner} />}

          {/* 金星生存窗口倒计时 HUD（VNS-1 专属: 触地 240s; 最后 30 秒红色脉冲） */}
          {!replaying && p.venusSurvivalRemainS !== null && (
            <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-4">
              <span
                className={`rounded-md border-2 bg-background/70 px-4 py-1.5 text-center font-mono text-sm font-bold tracking-widest shadow-lg backdrop-blur-sm ${
                  p.venusSurvivalRemainS <= 30
                    ? "countdown-urgent border-destructive text-destructive"
                    : "border-primary/60 text-primary"
                }`}
              >
                SURVIVAL WINDOW · 表面生存窗口 T-{formatStormRemain(p.venusSurvivalRemainS)}
                <span className="ml-3 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 tracking-normal text-primary">
                  465°C · 92 atm
                </span>
                {/* 热管理博弈：热负载条与倒计时同框（正常 primary 琥珀系, 过热 destructive 红闪） */}
                <span
                  className={`ml-3 inline-flex items-center gap-2 rounded-sm border px-1.5 py-0.5 tracking-normal ${
                    p.venusOverheat
                      ? "countdown-urgent border-destructive bg-destructive/15 text-destructive"
                      : "border-primary/50 bg-primary/10 text-primary"
                  }`}
                >
                  THERMAL · 热负载 {p.hullTemp}%
                  <span className="relative block h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                        p.venusOverheat ? "bg-destructive" : p.hullTemp >= 75 ? "bg-destructive/70" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(2, p.hullTemp))}%` }}
                    />
                  </span>
                </span>
              </span>
            </div>
          )}

          {/* 紧急上升撤离横幅（生存窗口归零后常驻至任务切换） */}
          {!replaying && p.venusEvacuating && (
            <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-4">
              <span className="clearing-banner animate-pulse rounded-md border-2 border-primary bg-background/70 px-4 py-1.5 text-center font-mono text-sm font-bold tracking-widest text-primary shadow-lg backdrop-blur-sm">
                EMERGENCY ASCENT · 紧急上升撤离 · 金星表面不是久留之地
              </span>
            </div>
          )}

          {p.stormClearing && (
            <>
              {/* 放晴过渡：阳光破尘放射光效 + 顶部光幕 + 掠光横幅, 尘土遮罩随强度衰减自然变亮 */}
              <div className="clearing-sunburst pointer-events-none absolute inset-0 z-10" aria-hidden="true" />
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent animate-in fade-in duration-1000"
                aria-hidden="true"
              />
              <div className="pointer-events-none absolute inset-x-0 top-1/4 z-20 flex justify-center px-4">
                <span className="clearing-banner rounded-md border border-primary/60 bg-background/70 px-4 py-1.5 text-center font-mono text-sm font-bold tracking-widest text-primary shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-500">
                  尘带消散 · 天空放晴 · SKIES CLEARING
                </span>
              </div>
            </>
          )}

          <div className="pointer-events-none absolute left-4 top-4">
            <p className="font-mono text-xs tracking-widest text-primary">
              {targetView ? p.approachEn : "LC-101 PAD · TRACKING LOCK"}
            </p>
            <h2
              className={`mt-1 font-display font-bold leading-tight text-foreground drop-shadow-lg ${
                p.cinemaMode ? "text-5xl" : "text-3xl"
              }`}
            >
              {targetView ? (
                <>{p.planetWord}<span className="text-primary">主视口</span></>
              ) : (
                <>深空<span className="text-primary">主视口</span></>
              )}
            </h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              MAIN VIEWPORT · {p.phaseLabelEn} PHASE
            </p>
          </div>

          <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-primary/50 bg-background/60 px-3 py-1 font-mono text-xs tracking-widest text-primary backdrop-blur-sm">
            {p.phaseLabelEn}
          </div>

          {!p.cinemaMode && (
            <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-center gap-1">
              <div className="h-36 w-36 lg:h-52 lg:w-52">
                <RadarScope rangeMult={p.fogActive ? 0.6 : 1} />
              </div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground">雷达扫描 RADAR SWEEP</p>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-xs text-muted-foreground">
            <p>TGT · {p.missionCode} LANDER</p>
            <p className={`tabular-nums ${p.signalLoss ? "animate-pulse text-destructive" : "text-primary"}`}>
              {p.signalLoss ? "LOSS OF SIGNAL · BLACKOUT" : p.linkEn}
            </p>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-3">
            {!replaying && (
              <LaunchControl
                flightActive={p.flightActive}
                coverOpen={p.coverOpen}
                onToggleCover={p.toggleCover}
                onIgnite={p.ignite}
                countdownText={p.clockText}
                phaseLabel={p.phaseLabel}
                missionCode={p.missionCode}
              />
            )}
          </div>

          <div className="pointer-events-none absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-primary/50" />
          <div className="pointer-events-none absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-primary/50" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-primary/50" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-primary/50" />
          {/* 阶段推进过场光带：一道斜切竖光带从左至右横扫主视口（一次性 0.7s） */}
          {phaseFx > 0 && (
            <span
              key={phaseFx}
              className="phase-flash-band pointer-events-none absolute inset-y-0 left-0 z-30 w-1/3"
              aria-hidden="true"
            />
          )}
          {/* 主发动机尾焰：点火上升段视口底部双层高频抖动喷焰 */}
          {!replaying && p.flightActive && p.phaseIndex >= 1 && p.phaseIndex <= 2 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center" aria-hidden="true">
              <span className="engine-plume-outer absolute bottom-0 h-44 w-64" />
              <span className="engine-plume-core absolute bottom-0 h-28 w-24" />
            </div>
          )}
          {/* retro 引擎反推：动力下降段间歇脉冲光锥（点几下停一下的减速节奏） */}
          {!replaying && p.flightActive && p.phaseIndex === 5 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center" aria-hidden="true">
              <span className="retro-plume absolute bottom-0 h-32 w-40" />
              <span className="retro-plume-core absolute bottom-0 h-20 w-16" />
            </div>
          )}
          {/* 回放老电视滤镜：扫描线噪点常驻 + 横向亮带缓慢垂直滚动（倍速越高噪点越浓、滚动越快） */}
          {replaying && (
            <>
              <span
                className="replay-static pointer-events-none absolute inset-[-5%] z-30"
                style={{
                  opacity: Math.min(0.95, 0.4 + p.replaySpeed * 0.12),
                  animationDuration: `${(0.3 / Math.min(p.replaySpeed, 2)).toFixed(2)}s`,
                }}
                aria-hidden="true"
              />
              <span
                className="replay-roll-bar pointer-events-none absolute inset-x-0 top-0 z-30 h-14"
                style={{ animationDuration: `${(7 / p.replaySpeed).toFixed(2)}s` }}
                aria-hidden="true"
              />
            </>
          )}
          </div>
          )}

          {/* 跳过流程按钮：自检期直接完成; 飞行期 3 秒速览（末段触地慢放）; ×2 按钮 1.5 秒直达 */}
          {(p.bootPhase === "boot" || (p.flightActive && p.phaseId !== "landed")) && !replaying && (
            <div className="absolute right-4 top-3 z-50 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => p.skipSequence()}
                aria-label={p.bootPhase === "boot" ? "跳过开机自检" : "跳过飞行流程直接着陆"}
                title={p.bootPhase === "boot" ? "跳过开机自检, 直接进入射前常态" : "3 秒速览剩余飞行阶段, 末段触地慢放"}
                className="animate-pulse rounded-md border border-primary/50 bg-background/80 px-3 py-1 font-mono text-xs font-bold tracking-widest text-primary shadow backdrop-blur-sm transition hover:bg-primary/15 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
              >
                ⏩ 跳过流程
              </button>
              {p.bootPhase !== "boot" && (
                <button
                  type="button"
                  onClick={() => p.skipSequence(true)}
                  aria-label="二倍速快进到着陆"
                  title="二倍速快进——1.5 秒直达着陆"
                  className="rounded-md border border-primary bg-primary px-2 py-1 font-mono text-xs font-bold tracking-widest text-primary-foreground shadow transition hover:bg-primary/90 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                >
                  ⏩⏩ ×2
                </button>
              )}
            </div>
          )}

          {/* 流星雨观测窗口横幅：点击星野中的流星即记录（canvas 内判定命中） */}
          {p.shower && !replaying && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
              <span className="rounded-md border border-primary/60 bg-background/80 px-3 py-1 font-mono text-xs tracking-widest text-primary shadow backdrop-blur-sm">
                ☄ 流星雨观测窗口 T-{p.shower.remainS}s · 点击流星记录 {p.shower.hits}/5 · 普通 +3 / 金色连抓 +15→+85
                {p.shower.golds > 0 ? ` · 金色 ×${p.shower.golds}` : ""}
              </span>
            </div>
          )}

          {/* 突发紧急演练标靶：随机位置 4s 内点击（命中 +10 功勋; 35% 升级三连靶挑战, 全中额外 +30） */}
          {p.drill && !replaying && (
            <button
              type="button"
              onClick={p.onDrillHit}
              aria-label={`点击演练标靶, 剩余 ${p.drill.remainS} 秒`}
              title={
                p.drill.total > 1
                  ? p.drill.dash
                    ? `加速冲刺靶——目标 ${p.drill.seq}/${p.drill.total}, 标靶高速游走, 盯紧落点果断出手!`
                    : p.drill.moving
                      ? `漂移移动靶——目标 ${p.drill.seq}/${p.drill.total}, 标靶在游走, 预判着点!`
                      : `三连靶挑战——目标 ${p.drill.seq}/${p.drill.total}, 立即点击标靶!`
                  : "突发紧急演练——立即点击标靶!"
              }
              className={`countdown-urgent absolute z-40 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-destructive bg-destructive/20 shadow-lg backdrop-blur-sm ${
                p.drill.dash ? "drill-dash" : p.drill.moving ? "drill-drift" : ""
              }`}
              style={{ left: `${p.drill.xPct}%`, top: `${p.drill.yPct}%` }}
            >
              <span className="absolute inset-2 rounded-full border border-destructive/70" aria-hidden="true" />
              <span className="absolute h-3 w-3 rounded-full bg-destructive" aria-hidden="true" />
              <span className="absolute -bottom-5 whitespace-nowrap font-mono text-[9px] font-bold tracking-widest text-destructive">
                {p.drill.total > 1
                  ? `DRILL · 三连靶${p.drill.dash ? "·冲刺" : p.drill.moving ? "·移动" : ""} ${p.drill.seq}/${p.drill.total} · T-${p.drill.remainS}s`
                  : `DRILL · 演练 T-${p.drill.remainS}s`}
              </span>
            </button>
          )}

          {/* 中继握手请求卡：长按 2s 完成链路校准（常规 +20 / 信号干扰局 +30 功勋, 12s 响应窗口） */}
          {p.handshake && !replaying && (
            <HandshakeCard
              remainS={p.handshake.remainS}
              totalS={12}
              interference={p.handshake.interference}
              onDone={p.completeHandshake}
            />
          )}

          {/* 红色罕见极光全屏幕布：血红渐变天光呼吸（装饰层, 不挡点击; 省电档不渲染全屏幕布层） */}
          {p.aurora?.rare && !replaying && perf.screenLayers && (
            <div className="aurora-veil pointer-events-none absolute inset-0 z-10" aria-hidden="true" />
          )}

          {/* 极光观测窗口横幅：20s 内点击星野中的极光带记录光谱（绿色每段 +10 / 红色罕见 +20, 上限 3 段） */}
          {p.aurora && !replaying && (
            <div className="pointer-events-none absolute inset-x-0 top-12 z-20 flex justify-center px-4">
              <span
                className={`rounded-md border px-3 py-1 font-mono text-xs tracking-widest shadow backdrop-blur-sm ${
                  p.aurora.rare ? "border-destructive/60 bg-background/80 text-destructive" : "border-primary/60 bg-background/80 text-primary"
                }`}
              >
                {p.aurora.rare
                  ? `✦ 红色罕见极光 T-${p.aurora.remainS}s · 点击血红光幕记录光谱 ${p.aurora.hits}/3 · 每段 +20 翻倍!`
                  : `✦ 极光观测窗口 T-${p.aurora.remainS}s · 点击画面中的极光带记录光谱 ${p.aurora.hits}/3 · 每段 +10`}
              </span>
            </div>
          )}

          {/* 系统诊断快检：记忆灯序复点（六步全对 +35 / 盲灯极速八步 +60 功勋; 假灯强度随满序次数递增） */}
          {p.diag && !replaying && (
            <DiagCard remainS={p.diag.remainS} decoyRate={p.diag.decoyRate} hintGlow={p.diag.hintGlow} extreme={p.diag.extreme} onDone={p.completeDiag} />
          )}

          {/* 北京呼号抽问：四选一应答（连对 +20→+40 递增, 答对 50% 触发 6s 限时追问; key 换题重挂载清作答态） */}
          {p.quiz && !replaying && (
            <QuizCard key={p.quiz.id} question={p.quiz.question} remainS={p.quiz.remainS} onAnswer={p.answerQuiz} />
          )}

          {/* 中继天线三段对准：指针进扇区锁定（三段全锁 +30 功勋, 15s 窗口; 40% 反转干扰局指针倒扫, 30% 双针干扰局） */}
          {p.antenna && !replaying && (
            <AntennaCard remainS={p.antenna.remainS} reverse={p.antenna.reverse} dual={p.antenna.dual} onDone={p.completeAntenna} />
          )}

          {/* 航行突发事件卡：转移/制动段随机弹出, 12s 内二选一处置 */}
          {p.crisis && !replaying && (
            <CrisisCard
              event={p.crisis.event}
              remainS={p.crisis.remainS}
              totalS={12}
              chainPos={p.crisis.chainPos}
              chainLen={p.crisis.chainLen}
              onChoose={p.resolveCrisis}
            />
          )}
        </section>

        {!replaying && (
          <CommSubtitle
            line={p.commLine}
            visible={p.commVisible}
            cinemaMode={p.cinemaMode}
            onClose={p.closeComm}
            onReopen={p.reopenComm}
          />
        )}

        {!p.cinemaMode && !replaying && (
          <Suspense fallback={null}>
          <RoverControl
            snap={p.roverSnap}
            unlocked={p.roverUnlocked}
            samples={p.roverSamples}
            onPressDir={p.pressRoverDir}
            onReleaseDir={p.releaseRoverDir}
            onRescue={p.requestRescue}
            onDustClean={p.startDustClean}
            onHonk={p.honkRover}
            onFlash={p.flashRoverLights}
            onMorse={p.morseFlash}
            onPressSpin={p.pressRoverSpin}
            onReleaseSpin={p.releaseRoverSpin}
            onToggleFine={p.toggleRoverFine}
            onPhoto={p.takeRoverPhoto}
            onCycleFilter={p.cycleRoverPhotoFilter}
            photoLog={p.roverPhotoLog}
            onRemovePhoto={p.removeRoverPhoto}
            onGrainLevel={p.setRoverGrainLevel}
            onToggleArmPause={p.toggleRoverArmPause}
            onCancelArm={p.cancelRoverArm}
            actionKeys={p.roverActionKeys}
            onRebindKey={p.setRoverActionKey}
            onResetKeys={p.resetRoverActionKeys}
            onStartSampling={p.startRoverSampling}
            roverName={p.roverName}
            roverNameEn={p.roverNameEn}
            surfaceWord={p.roverSurfaceWord}
            visual={p.missionVisual}
            craterNamer={p.craterNamer}
            sampleReports={p.sampleReports}
            analysis={p.analysisState}
            onStartAnalysis={p.startSampleAnalysis}
            onOpenReport={p.openSampleReport}
            dustIntensity={p.dustIntensity}
            fogIntensity={p.fogLevel}
            stormHalt={p.globalStormActive}
            stormRemainS={p.globalStormRemainS}
            boltFx={p.globalStormActive ? boltFx : 0}
            thermalHud={{ active: p.thermalWindowActive, temp: p.hullTemp, overheat: p.venusOverheat }}
            onEmergencyCooling={p.emergencyCooling}
            iceProbeEnabled={p.iceProbeEnabled}
            iceProbe={p.iceProbeState}
            iceProbeLatest={p.iceProbeLatest}
            onStartIceProbe={p.startIceProbe}
            crackProbe={p.crackProbeState}
            crackProbeLatest={p.crackProbeLatest}
            onStartCrackProbe={p.startCrackProbe}
            oceanSample={p.oceanSampleState}
            oceanSampleTaken={p.oceanSampleTaken}
            onStartOceanSample={p.startOceanSample}
            rallyHud={p.rallyHud}
            rallyResult={p.rallyResult}
            rallyBestS={p.rallyBestS}
            rallyBestRevS={p.rallyBestRevS}
            rallyBestNightS={p.rallyBestNightS}
            onStartRally={p.startRally}
          />
          </Suspense>
        )}
        </div>

        {!p.cinemaMode && (
          <div className="order-3 flex min-w-0 flex-col lg:order-none">
            {/* 值班指令面板：功勋值 + 军衔 + 当前限时指令 */}
            {!replaying && (
              <DutyBoard merit={p.dutyMerit} task={p.dutyTask} doneCount={p.dutyDoneCount} />
            )}
            <section
              aria-label="事件日志"
              className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <EventLogStream logEntries={p.logEntries} alarmActive={p.alarmActive} onAckAlarm={p.ackAlarm} />
            </section>
          </div>
        )}
      </main>

      {!p.cinemaMode && (
        <GroundStationBar
          stationList={p.stationList}
          linkZh={p.linkZh}
          linkEn={p.linkEn}
          missionCode={p.missionCode}
          missionTitle={p.missionTitle}
          signalLoss={p.signalLoss}
          dustStorm={p.dustStormActive}
          globalStorm={p.globalStormActive}
        />
      )}

      {/* 黑障恢复信号雪花：交叉扫描线全屏高频闪烁后消散（一次性 ~0.9s） */}
      {staticFx > 0 && (
        <div key={staticFx} className="signal-static pointer-events-none fixed inset-0 z-[65]" aria-hidden="true" />
      )}

      {/* 成就解锁全屏金光扫过：与 toast 弹跳同步的一道横贯亮带（一次性 ~0.85s） */}
      {achBurst > 0 && (
        <span
          key={achBurst}
          className="ach-burst-band pointer-events-none fixed inset-y-0 left-0 z-[55] w-1/3"
          aria-hidden="true"
        />
      )}

      {/* 三星统帅全屏庆典：径向辉光 + 两道金光扫过 + 皇冠大标题弹入（一次性 ~3.4s） */}
      {tripleFx > 0 && (
        <div
          key={tripleFx}
          className="triple-celebration pointer-events-none fixed inset-0 z-[58] flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="ach-burst-band absolute inset-y-0 left-0 w-1/3" />
          <span className="ach-burst-band absolute inset-y-0 left-0 w-1/3" style={{ animationDelay: "0.45s" }} />
          {/* 彩带粒子：按性能档位 12 / 6 片三色小矩形旋转飘落 */}
          {Array.from({ length: perf.confettiCount }, (_, i) => (
            <span key={`cf-${i + 1}`} className={`confetti cf-${i + 1}`} />
          ))}
          <span className="triple-banner flex flex-col items-center gap-2 rounded-xl border-2 border-primary bg-background/90 px-10 py-6 text-center shadow-2xl backdrop-blur">
            <Crown className="h-10 w-10 text-primary" />
            <span className="font-display text-4xl font-bold text-foreground">
              {crownKind === "quad" ? "四星统帅" : "三星统帅"}
            </span>
            <span className="font-mono text-xs tracking-widest text-primary">
              {crownKind === "quad" ? "QUAD CROWN · 四条任务全部软着陆" : "TRIPLE CROWN · 三条任务全部软着陆"}
            </span>
            {/* 任务回顾数据：一路走来的成绩单 */}
            <span className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
              <span>
                成就 <b className="text-primary">{p.achievementCount}/{p.achievementTotal}</b>
              </span>
              <span>
                藏品 <b className="text-primary">{p.museumCount}</b> 件
              </span>
              <span>
                警报处置 <b className="text-primary">{p.ackCount}</b> 次
              </span>
            </span>
          </span>
        </div>
      )}

      {/* 任务切换信号重锁定：全屏扫描线叠层 + 闪烁文字, 一次性 ~1.2s */}
      {relockFx > 0 && (
        <div
          key={relockFx}
          className="relock-overlay pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="relock-text rounded-md border border-primary/50 bg-background/85 px-4 py-1.5 font-mono text-sm font-bold tracking-widest text-primary shadow-lg">
            SIGNAL RE-LOCK · 链路重锁定 · {p.missionCode}
          </span>
        </div>
      )}

      {/* 影院模式常驻暗角：四角压暗的电影 vignette 氛围（黑幕开启后淡入）+ 胶片颗粒抖动（省电档禁颗粒层） */}
      {p.cinemaMode && (
        <>
          <div
            className="cinema-vignette pointer-events-none fixed inset-0 z-30 animate-in fade-in duration-1000"
            aria-hidden="true"
          />
          {perf.screenLayers && (
            <div
              className="film-grain pointer-events-none fixed inset-[-5%] z-30 animate-in fade-in duration-1000"
              aria-hidden="true"
            />
          )}
        </>
      )}

      {/* 警报全屏边缘闪烁：critical 红 vignette 急促呼吸 / caution 白色缓慢呼吸（回放中不显示） */}
      {!replaying && p.alarmActive && (
        <div
          className={`pointer-events-none fixed inset-0 z-40 ${
            p.missionStatus === "critical" ? "alarm-vignette" : "alarm-vignette-caution"
          }`}
          aria-hidden="true"
        />
      )}

      {/* 读屏播报区：警报纯视觉+声音, 这里给屏幕阅读器一条断言级文字通道（不占视觉空间） */}
      <div className="sr-only" role="status" aria-live="assertive">
        {!replaying && p.alarmActive ? `警报：${p.alarmMessage}` : ""}
      </div>

      {/* 本地存档写失败常驻提示（存储满 / 隐私模式）：不再静默丢成就, 写成功后自动消失 */}
      {p.saveFailed && (
        <div
          role="alert"
          className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border border-destructive/60 bg-card px-4 py-2 shadow-lg"
        >
          <span aria-hidden="true" className="text-base">⚠</span>
          <p className="font-mono text-xs text-card-foreground">
            进度保存失败：浏览器存储不可用（可能已满或处于隐私模式）, 本次成就与纪录暂时无法持久保存
          </p>
        </div>
      )}

      {replaying && (
        <>
          <div className="pointer-events-none fixed inset-0 z-50 border-4 border-destructive/70" aria-hidden="true" />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" aria-hidden="true">
            <span className="-rotate-12 font-mono text-6xl font-bold tracking-widest text-destructive/25 lg:text-8xl">
              REPLAY
            </span>
          </div>
        </>
      )}

      <BootOverlay
        bootVisibleLines={p.bootVisibleLines}
        bootProgress={p.bootProgress}
        bootDone={p.bootPhase === "online"}
      />
      <MetricDetailDialog metric={p.selectedMetric} logEntries={p.logEntries} onClose={p.closeMetric} />
      {p.museumOpen && (
        <Suspense fallback={null}>
          <SampleMuseum
            open={p.museumOpen}
            entries={p.museumEntries}
            celebrateKeys={p.museumCelebrateKeys}
            onClose={p.closeMuseum}
            onOpenReport={p.openMuseumReport}
          />
        </Suspense>
      )}
      {reportView && (
        <Suspense fallback={null}>
          <SampleReportDialog
            sample={reportView.sample}
            report={reportView.report}
            onClose={p.museumReport ? p.closeMuseumReport : p.closeSampleReport}
          />
        </Suspense>
      )}
      {p.achievementWallOpen && (
        <Suspense fallback={null}>
          <AchievementWall
            open={p.achievementWallOpen}
            list={p.achievementList}
            unlockedMap={p.achievementMap}
            onClose={p.closeAchievementWall}
          />
        </Suspense>
      )}
      {p.overviewOpen && (
        <Suspense fallback={null}>
          <MissionOverview
            open={p.overviewOpen}
            rows={p.missionProgress}
            achievementCount={p.achievementCount}
            onClose={p.closeOverview}
          />
        </Suspense>
      )}
      {p.careerOpen && (
        <Suspense fallback={null}>
          <CareerStats
            open={p.careerOpen}
            snap={p.careerSnap}
            onClose={p.closeCareer}
            onClearSave={p.clearSave}
          />
        </Suspense>
      )}
      {p.dailyOpen && (
        <Suspense fallback={null}>
          <DailyChallenge
            open={p.dailyOpen}
            snap={p.dailySnap}
            onClose={p.closeDaily}
            onStart={p.startDailyChallenge}
          />
        </Suspense>
      )}
      {p.debriefOpen && p.debriefData && (
        <Suspense fallback={null}>
          <MissionDebrief open={p.debriefOpen} data={p.debriefData} onClose={p.closeDebrief} reducedMotion={p.reducedMotion} />
        </Suspense>
      )}
      <ManualLanding
        open={p.manualLandingOpen && !replaying}
        missionId={p.activeMissionId}
        missionCode={p.missionCode}
        onComplete={p.completeManualLanding}
        windBoost={p.manualWindBoost}
        tightZone={p.manualTightZone}
      />
      {p.guideOpen && (
        <Suspense fallback={null}>
          <AnimationGuide open={p.guideOpen} onClose={p.closeGuide} />
        </Suspense>
      )}
      <AchievementToast achievement={p.achievementToastDef} missionBadge={p.achievementToast?.missionBadge ?? p.missionBadge} />
      <LandingOverlay
        visible={p.landingVisible}
        onDismiss={p.dismissLanding}
        clockText={p.clockText}
        missionCode={p.missionCode}
        surfaceWord={p.roverSurfaceWord}
        landingSite={p.landingSite}
        bodyText={p.landingBody}
      />
      {p.briefingOpen && (
        <Suspense fallback={null}>
          <MissionBriefing
            open={p.briefingOpen}
            missionCode={p.missionCode}
            missionTitle={p.missionTitle}
            missionBadge={p.missionBadge}
            headerEn={p.headerEn}
            landingSite={p.landingSite}
            planetWord={p.planetWord}
            lightDelayNote={p.lightDelayNote}
            phases={p.phases}
            stations={p.briefingStations}
            onDismiss={p.dismissBriefing}
          />
        </Suspense>
      )}
      {p.warpLabel && (
        <WarpTransition
          key={p.warpSeq}
          label={p.warpLabel}
          reducedMotion={p.reducedMotion}
          onDone={p.clearWarp}
        />
      )}
      {jukeboxOpen && (
        <Suspense fallback={null}>
          <MusicJukebox
            open={jukeboxOpen}
            onPreview={p.previewMusic}
            onStopPreview={p.stopMusicPreview}
            onClose={() => setJukeboxOpen(false)}
          />
        </Suspense>
      )}
      {onboardOpen && (
        <Suspense fallback={null}>
          <OnboardGuide open={onboardOpen} onClose={closeOnboard} />
        </Suspense>
      )}
    </div>
  );
}
