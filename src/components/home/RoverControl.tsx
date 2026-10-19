import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Lock, Maximize2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { RoverCanvas } from "@/components/home/RoverCanvas";
import { ColumnGroup } from "@/components/home/rover/ColumnGroup";
import { RoverAlbumPanel } from "@/components/home/rover/RoverAlbumPanel";
import { RoverEuropaPanels } from "@/components/home/rover/RoverEuropaPanels";
import { RoverRallyPanel } from "@/components/home/rover/RoverRallyPanel";
import { RoverScienceOps } from "@/components/home/rover/RoverScienceOps";
import { fmtOdo } from "@/components/home/rover/shared";
import type { MissionVisual } from "@/lib/missions";
import type { SampleReport } from "@/lib/sampleAnalysis";
import { isAudioMuted, playCoverClick, playRoverFlash, playRoverHorn } from "@/lib/missionAudio";
import { formatStormRemain } from "@/pages/Home/useHome";
import { tugWindowAt, type AnalysisProgress, type CrackProbeResult, type IceProbeProgress, type IceProbeResult, type RallyResult, type RallyVariant, type RoverDir, type RoverSample, type RoverSnapshot } from "@/pages/Home/useRover";

/** 摩斯灯语常用预设短句（点击即填入输入框） */
const MORSE_PRESETS = ["HI", "OK", "CQ", "MOON", "LUNA", "ARES"];

interface RoverControlProps {
  snap: RoverSnapshot;
  unlocked: boolean;
  samples: RoverSample[];
  onPressDir: (dir: RoverDir) => void;
  onReleaseDir: (dir: RoverDir) => void;
  /** 陷车且救援车就位后请求拖曳（立即脱困不耗电） */
  onRescue?: () => void;
  /** 启动太阳能板清扫刷（积尘 ≥20% 可用） */
  onDustClean?: () => void;
  /** 巡视车动作组：喇叭 / 前照灯双闪 / 摩斯灯语（自定义短句）/ 漂移旋转（按住-松开）/ 精细模式 / 拍照 */
  onHonk?: () => void;
  onFlash?: () => void;
  onMorse?: (text: string) => void;
  onPressSpin?: () => void;
  onReleaseSpin?: () => void;
  onToggleFine?: () => void;
  onPhoto?: () => void;
  /** 拍照滤镜手动切换（标准/金色纪念/冰蓝 循环） */
  onCycleFilter?: () => void;
  /** 拍照相册（最新在前; 面板相册回看消费, 单张可删除, ts = 拍摄时刻毫秒） */
  photoLog?: { n: number; filter: number; x: number; y: number; ts: number }[];
  onRemovePhoto?: (n: number) => void;
  /** 复古滤镜颗粒浓度滑杆（0-200） */
  onGrainLevel?: (v: number) => void;
  /** 机械臂 deploy/drill 阶段暂停/续钻（暂停中才可一键收臂放弃） */
  onToggleArmPause?: () => void;
  /** 机械臂暂停中一键收臂（放弃本次钻取） */
  onCancelArm?: () => void;
  /** 动作快捷键当前映射与重绑回调（horn 喇叭 / flash 双闪 / drift 漂移, 键位持久化会话记忆; 可一键恢复默认） */
  actionKeys?: { honk: string; flash: string; drift: string };
  onRebindKey?: (action: "honk" | "flash" | "drift", key: string) => void;
  onResetKeys?: () => void;
  onStartSampling: () => void;
  /** 巡视车名：玉兔号 / 祝融号 */
  roverName: string;
  roverNameEn: string;
  /** 地表语境词：月面 / 火面 */
  surfaceWord: string;
  visual: MissionVisual;
  craterNamer: (id: number) => string;
  /** 已出报告（按样品 id），清单行显示评级 + 报告按钮 */
  sampleReports: Record<number, SampleReport>;
  /** 化验进行中状态（null = 空闲） */
  analysis: AnalysisProgress | null;
  onStartAnalysis: (sampleId: number) => void;
  onOpenReport: (sampleId: number) => void;
  /** 火星沙尘暴强度 0..1（canvas 尘土粒子 + 遮罩, 回充停止提示） */
  dustIntensity: number;
  /** 泰坦甲烷浓雾浓度 0..1（canvas 橙褐雾幕 + 湖面若隐若现; 不锁车不禁采样） */
  fogIntensity?: number;
  /** 全球级沙尘暴: 强制停车（D-pad 禁用 + 采样禁止 + 「风暴停车 · 全员隐蔽」提示） */
  stormHalt: boolean;
  /** 全球风暴生存倒计时剩余整秒（null = 不显示, 回放模式恒为 null） */
  stormRemainS?: number | null;
  /** 闪电计数（全球风暴随机调度, 每次 +1 → canvas 场景瞬间照亮） */
  boltFx?: number;
  /** 金星热管理博弈（VNS-1 生存窗口专属）：active=窗口进行中, temp=热负载 0–100, overheat=过热保护锁定 */
  thermalHud?: { active: boolean; temp: number; overheat: boolean } | null;
  /** 应急散热（热负载立降 35 / 生存窗口 -15s; 热负载 <20 禁用） */
  onEmergencyCooling?: () => void;
  /** 冰下海洋探测（木卫二专属）：enabled 才渲染探测块 */
  iceProbeEnabled?: boolean;
  iceProbe?: IceProbeProgress | null;
  iceProbeLatest?: IceProbeResult | null;
  onStartIceProbe?: () => void;
  /** 冰裂隙深度探测（停在裂隙旁 snap.crackNearby 时可发起） */
  crackProbe?: { progress: number } | null;
  crackProbeLatest?: CrackProbeResult | null;
  onStartCrackProbe?: () => void;
  /** 冰下海洋取水（测深判定直通海洋后, 该裂隙一次性提取特殊水样） */
  oceanSample?: { progress: number } | null;
  oceanSampleTaken?: boolean;
  onStartOceanSample?: () => void;
  /** 越野拉力赛（限时依次过检查点, 撞坑罚时, 三任务通用; 正序/倒序/夜航三航线分记最佳） */
  rallyHud?: { remainS: number; got: number; total: number; penaltyS: number; variant: RallyVariant } | null;
  rallyResult?: RallyResult | null;
  rallyBestS?: number | null;
  rallyBestRevS?: number | null;
  rallyBestNightS?: number | null;
  onStartRally?: (variant: RallyVariant) => void;
}

/** 节奏震动花样解析：逗号分隔毫秒序列 → 有效段（每段 5-50ms, 最多 8 段; 空/全非法回落默认五格爬升） */
function parseVibratePattern(txt: string): number[] {
  const arr = txt
    .split(",")
    .map((s) => Math.round(Number(s.trim())))
    .filter((v) => Number.isFinite(v) && v >= 5 && v <= 50);
  return arr.length > 0 ? arr.slice(0, 8) : [6, 10, 14, 18, 22];
}

/** 画面高度滑杆（批次 Q）的 localStorage 记忆键与上下限（px） */
const CANVAS_H_KEY = "rover-canvas-h";
const CANVAS_H_MIN = 240;
const CANVAS_H_MAX = 560;
const CANVAS_H_DEFAULT = 288;

export function RoverControl({
  snap,
  unlocked,
  samples,
  onPressDir,
  onReleaseDir,
  onRescue,
  onDustClean,
  onHonk,
  onFlash,
  onMorse,
  onPressSpin,
  onReleaseSpin,
  onToggleFine,
  onPhoto,
  onCycleFilter,
  photoLog,
  onRemovePhoto,
  onGrainLevel,
  onToggleArmPause,
  onCancelArm,
  actionKeys,
  onRebindKey,
  onResetKeys,
  onStartSampling,
  roverName,
  roverNameEn,
  surfaceWord,
  visual,
  craterNamer,
  sampleReports,
  analysis,
  onStartAnalysis,
  onOpenReport,
  dustIntensity,
  fogIntensity = 0,
  stormHalt,
  stormRemainS,
  boltFx,
  thermalHud,
  onEmergencyCooling,
  iceProbeEnabled,
  iceProbe,
  iceProbeLatest,
  onStartIceProbe,
  crackProbe,
  crackProbeLatest,
  onStartCrackProbe,
  oceanSample,
  oceanSampleTaken,
  onStartOceanSample,
  rallyHud,
  rallyResult,
  rallyBestS,
  rallyBestRevS,
  rallyBestNightS,
  onStartRally,
}: RoverControlProps) {
  // 摩斯灯语自定义短句（≤6 个字母, 自动大写并过滤非法字符）
  const [morseText, setMorseText] = useState("HI");
  // 快捷键重绑：点键位徽章进入捕获态, 按下任意键（可带 Ctrl/Shift/Alt 组合）即完成重映射（Esc 取消）
  const [rebinding, setRebinding] = useState<"honk" | "flash" | "drift" | null>(null);
  // 拍照相册回看面板开合
  const [showAlbum, setShowAlbum] = useState(false);
  // 键位徽章悬停预览
  const [hoverAction, setHoverAction] = useState<"honk" | "flash" | "drift" | null>(null);
  // 画面高度滑杆（批次 Q）：宽屏下遥控画面的最小高度, localStorage 记忆（隐私模式静默降级）
  const [canvasH, setCanvasH] = useState<number>(() => {
    try {
      const v = Number(window.localStorage.getItem(CANVAS_H_KEY));
      return Number.isFinite(v) && v >= CANVAS_H_MIN && v <= CANVAS_H_MAX ? v : CANVAS_H_DEFAULT;
    } catch {
      return CANVAS_H_DEFAULT;
    }
  });
  const changeCanvasH = (v: number) => {
    setCanvasH(v);
    try {
      window.localStorage.setItem(CANVAS_H_KEY, String(v));
    } catch {
      // 存储不可用时仅本次会话生效
    }
  };
  // 颗粒预设长按连调：按住后每 50ms 向目标档步进 ±10, 到达自停（松开/移出即停; 短按仍走 onClick 直达）
  const grainHoldRef = useRef<number | null>(null);
  const stopGrainHold = () => {
    if (grainHoldRef.current !== null) {
      window.clearInterval(grainHoldRef.current);
      grainHoldRef.current = null;
    }
  };
  // 震动反馈模式三档循环：弱（每格 8ms 轻触）/ 强（每格 20ms + 到档双震）/ 节奏（长短拍交替花样 + 到档五连奏）
  // localStorage 记忆（旧版强弱布尔键自动迁移）; 不支持 Vibration API 的设备无声无感
  const [vibrateMode, setVibrateMode] = useState<"soft" | "strong" | "rhythm">(() => {
    try {
      const m = window.localStorage.getItem("rover-vibrate-mode");
      if (m === "soft" || m === "strong" || m === "rhythm") return m;
      return window.localStorage.getItem("rover-vibrate-strong") === "1" ? "strong" : "soft";
    } catch {
      return "soft";
    }
  });
  const cycleVibrateMode = () => {
    setVibrateMode((prev) => {
      const next = prev === "soft" ? "strong" : prev === "strong" ? "rhythm" : "soft";
      try {
        window.localStorage.setItem("rover-vibrate-mode", next);
      } catch {
        // 忽略
      }
      // 切换瞬间先震一下对应节奏, 让用户立刻感知新档位
      try {
        navigator.vibrate?.(next === "soft" ? 8 : next === "strong" ? 18 : parseVibratePattern(vibratePatternText));
      } catch {
        // 忽略
      }
      return next;
    });
  };
  // 自定义节奏花样：逗号分隔毫秒序列（每段 5-50ms, 最多 8 段）, localStorage 记忆; 节奏档长按连调按此序列循环震动
  const [vibratePatternText, setVibratePatternText] = useState<string>(() => {
    try {
      return window.localStorage.getItem("rover-vibrate-pattern") ?? "6,10,14,18,22";
    } catch {
      return "6,10,14,18,22";
    }
  });
  const holdGrainTo = (target: number) => {
    stopGrainHold();
    let cur = Math.round(snap.grainLevel / 10) * 10;
    if (cur === target) return;
    const mode = vibrateMode;
    const pat = parseVibratePattern(vibratePatternText);
    let bar = 0;
    grainHoldRef.current = window.setInterval(() => {
      cur += cur < target ? 10 : -10;
      onGrainLevel?.(cur);
      bar++;
      // 逐格震动反馈（节奏档按自定义花样序列循环, 默认五格爬升与锁定音阶同步）
      try {
        navigator.vibrate?.(mode === "soft" ? 8 : mode === "strong" ? 20 : pat[bar % pat.length]);
      } catch {
        // 忽略
      }
      if (cur === target) {
        stopGrainHold();
        // 到档确认震：强档双震 / 节奏档五连奏
        try {
          if (mode === "strong") navigator.vibrate?.([12, 30, 12]);
          if (mode === "rhythm") navigator.vibrate?.([10, 20, 10, 20, 10]);
        } catch {
          // 忽略
        }
      }
    }, 50);
  };
  useEffect(() => stopGrainHold, []);
  useEffect(() => {
    if (!rebinding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRebinding(null);
        return;
      }
      const base = e.key.toLowerCase();
      const pureMod = ["control", "shift", "alt", "meta"].includes(base);
      const mods: string[] = [];
      if (e.ctrlKey && base !== "control") mods.push("ctrl");
      if (e.shiftKey && base !== "shift") mods.push("shift");
      if (e.altKey && base !== "alt") mods.push("alt");
      const key = pureMod ? (base === "control" ? "ctrl" : base) : [...mods, base].join("+");
      if (key) onRebindKey?.(rebinding, key);
      setRebinding(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [rebinding, onRebindKey]);
  const fmtKey = (k?: string) => {
    if (!k) return "—";
    if (k === " ") return "空格";
    return k
      .split("+")
      .map((p) => (p === "ctrl" ? "⌃" : p === "shift" ? "⇧" : p === "alt" ? "⌥" : p === "meta" ? "⌘" : p === " " ? "空格" : p.toUpperCase()))
      .join("");
  };
  const batteryLow = snap.battery <= 20;
  const armBusy = snap.armPhase !== "idle";
  const stormBlocking = dustIntensity > 0.1;

  const padButton = (dir: RoverDir, label: string, icon: ReactNode, cellClass: string) => (
    <button
      type="button"
      aria-label={label}
      disabled={!unlocked || snap.batteryDead || stormHalt || !!thermalHud?.overheat}
      onPointerDown={(e) => {
        e.preventDefault();
        onPressDir(dir);
      }}
      onPointerUp={() => onReleaseDir(dir)}
      onPointerLeave={() => onReleaseDir(dir)}
      onPointerCancel={() => onReleaseDir(dir)}
      className={`flex h-11 touch-none items-center justify-center rounded-md border border-border bg-background text-primary shadow-sm transition select-none hover:border-primary/60 hover:bg-primary/10 active:scale-95 active:bg-primary active:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 ${cellClass}`}
    >
      {icon}
    </button>
  );

  const readout = (label: string, labelEn: string, value: string, unit: string, accent = false) => (
    <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm">
      <p className="text-xs text-muted-foreground">
        {label} <span className="font-mono tracking-widest">{labelEn}</span>
      </p>
      <p
        className={`font-mono text-lg font-bold tabular-nums leading-tight ${
          accent ? "text-destructive" : "text-primary"
        }`}
      >
        {value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  );

  return (
    <section
      aria-label={`${roverName}巡视车遥控`}
      className={`mt-4 rounded-lg border bg-card p-4 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500 ${
        unlocked && !snap.batteryDead && snap.battery <= 15 ? "border-destructive/60 shadow-destructive/10" : "border-border"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-card-foreground">
            {roverName} <span className="text-primary">·</span> {surfaceWord}遥控巡视
          </h2>
          <p className="font-mono text-xs tracking-widest text-muted-foreground">ROVER CTRL · {roverNameEn} SURFACE OPS</p>
        </div>
        {/* 徽标行可换行右对齐：多徽标同屏（低电量/积尘/补给/风暴/热负载…）时不再横向溢出挤压标题 */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {snap.crackReview && (
            <span className="animate-in fade-in zoom-in-75 rounded-full border border-primary bg-primary/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-primary shadow-sm duration-300">
              规避评价 · {snap.crackReview}
            </span>
          )}
          {snap.crackAlert && (
            <span className="animate-pulse rounded-full border-2 border-destructive bg-destructive/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
              CREVASSE · 前方冰裂隙 · 立即转向绕行
            </span>
          )}
          {snap.stuck && (
            <span className="countdown-urgent rounded-full border-2 border-destructive bg-destructive/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
              STUCK · 车轮陷沙 · 交替按前进/后退摇摆 {snap.stuck.alt}/6 · T-{snap.stuck.remainS}s
            </span>
          )}
          {snap.stuck && snap.stuck.rescueReady && (
            <button
              type="button"
              onClick={onRescue}
              aria-label={`挂接救援车钢缆, 已挂 ${snap.stuck.tug} / 3 次, 光标扫进中央亮区时点击`}
              title="救援车已就位——光标扫进中央亮区时点击才算挂牢钢缆, 连挂三次拖曳脱困（不耗电, 但自救摇摆更快）"
              className="flex min-h-11 touch-none flex-col items-stretch gap-1 rounded-xl border-2 border-primary bg-primary px-3 py-1 font-mono text-xs font-bold tracking-widest text-primary-foreground shadow-md transition hover:bg-primary/90 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus lg:min-h-0"
            >
              {/* 挂接时机条：光标 1.6s 匀速扫过（与 useRover 判定周期同步）, 中央绿区随挂接次数收窄（tugWindowAt 同源公式） */}
              <span className="relative block h-1 w-full overflow-hidden rounded-full bg-primary-foreground/25" aria-hidden="true">
                <span
                  className="absolute inset-y-0 rounded-full bg-primary-foreground/60 transition-all duration-300"
                  style={{
                    left: `${tugWindowAt(snap.stuck.tug).lo * 100}%`,
                    width: `${(tugWindowAt(snap.stuck.tug).hi - tugWindowAt(snap.stuck.tug).lo) * 100}%`,
                  }}
                />
                <span className="tug-sweep absolute inset-y-0 w-0.5 rounded-full bg-primary-foreground" />
              </span>
              <span>🚜 拖曳 · 绿区点击挂钢缆 {snap.stuck.tug}/3</span>
            </button>
          )}
          {snap.supply && (
            <span
              className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest shadow-sm ${
                snap.supply.rare && snap.supply.remainS <= 10
                  ? "countdown-urgent animate-pulse border-destructive bg-destructive/15 text-destructive"
                  : snap.supply.rare
                    ? "museum-rarity-s animate-pulse border-primary bg-primary/25 text-primary"
                    : "animate-pulse border-primary bg-primary/15 text-primary"
              }`}
            >
              {snap.supply.rare
                ? snap.supply.remainS <= 10
                  ? `★ RARE SUPPLY · 争夺告急 T-${snap.supply.remainS}s · 最后冲刺 +50% 电量`
                  : `★ RARE SUPPLY · 稀有物资信标 T-${snap.supply.remainS}s · 40s 争夺窗口 +50% 电量`
                : `SUPPLY · 补给箱信标 T-${snap.supply.remainS}s · 驶过拾取 +25% 电量`}
            </span>
          )}
          {unlocked && !snap.batteryDead && snap.battery <= 15 && (
            <span className="animate-pulse rounded-full border-2 border-destructive bg-destructive/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
              LOW BATTERY · 电量 {snap.battery.toFixed(0)}% · 停车回充
            </span>
          )}
          {unlocked && snap.dust >= 40 &&
            (snap.dustCleaning ? (
              <span className="rounded-full border border-primary bg-primary/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-primary shadow-sm">
                🧹 清扫刷行进中 · 积尘 {snap.dust}% 下降中
              </span>
            ) : (
              <button
                type="button"
                onClick={onDustClean}
                aria-label={`启动清扫刷清理太阳能板积尘, 当前 ${snap.dust}%`}
                title={`太阳能板积尘 ${snap.dust}%——回充效率被折减, 点击启动清扫刷（1.5 秒行程推尘归零）`}
                className={`min-h-11 rounded-full border-2 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest shadow-sm transition active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus lg:min-h-0 ${
                  snap.dust >= 70
                    ? "animate-pulse border-destructive bg-destructive/15 text-destructive"
                    : "border-primary bg-primary/15 text-primary"
                }`}
              >
                🧹 电池板积尘 {snap.dust}% · 点击清扫
              </button>
            ))}
          {stormHalt && (
            <span className="animate-pulse rounded-full border-2 border-destructive bg-destructive/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
              风暴停车 · 全员隐蔽
              {stormRemainS !== null && stormRemainS !== undefined && (
                <span
                  className={`ml-2 rounded-sm border px-1 py-0.5 tabular-nums tracking-normal ${
                    stormRemainS <= 10
                      ? "countdown-urgent border-destructive bg-destructive font-extrabold text-destructive-foreground"
                      : "border-primary/50 bg-primary/10 text-primary"
                  }`}
                >
                  预计过境 T-{formatStormRemain(stormRemainS)}
                </span>
              )}
            </span>
          )}
          {!stormHalt && stormBlocking && (
            <span className="animate-pulse rounded-full border border-destructive bg-destructive/10 px-2.5 py-0.5 font-mono text-xs tracking-widest text-destructive">
              沙尘暴 · 光学导航受限
            </span>
          )}
          {/* 金星热管理博弈（生存窗口专属）：热负载徽标 + 应急散热按钮 + 过热保护红闪 */}
          {thermalHud?.active &&
            (thermalHud.overheat ? (
              <span className="countdown-urgent animate-pulse rounded-full border-2 border-destructive bg-destructive/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm">
                OVERHEAT · 热负载 {thermalHud.temp}% · 全动作锁定 · 散热至 60% 解除
              </span>
            ) : (
              <span className="rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 font-mono text-xs tabular-nums tracking-widest text-primary">
                THERMAL · 热负载 {thermalHud.temp}%
              </span>
            ))}
          {thermalHud?.active && (
            <button
              type="button"
              onClick={onEmergencyCooling}
              disabled={thermalHud.temp < 20 || !onEmergencyCooling}
              aria-label={`应急散热, 当前热负载 ${thermalHud.temp}%, 立降 35 点并消耗生存窗口 15 秒`}
              title="应急散热——泄放冷却剂让热负载立降 35 点, 代价是生存窗口缩短 15 秒（热负载低于 20 时不可用）"
              className="min-h-11 rounded-full border-2 border-primary bg-primary/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-primary shadow-sm transition hover:bg-primary/25 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-0"
            >
              ❄ 应急散热 · 热负载 -35 · 窗口 -15s
            </button>
          )}
          {samples.length > 0 && (
            <span
              className="rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 font-mono text-xs tabular-nums tracking-widest text-primary"
              title="已采集样品数"
            >
              样品 {samples.length}
            </span>
          )}
          {snap.batteryDead && (
            <span className="animate-pulse rounded-full border border-destructive bg-destructive/10 px-2.5 py-0.5 font-mono text-xs tracking-widest text-destructive">
              电量耗尽 · 待机充电
            </span>
          )}
          {unlocked ? (
            <span className="rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 font-mono text-xs tracking-widest text-primary shadow-sm">
              遥控通道在线
            </span>
          ) : (
            <span className="rounded-full border border-border bg-background px-2.5 py-0.5 font-mono text-xs tracking-widest text-muted-foreground">
              着陆后解锁
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        {/* 左列 = 画面 + 驾驶控制 + 动作组（画面拉伸填满, 不再留大片空白）; 右列 = 数据与科学作业面板 */}
        <div className="flex min-w-0 flex-col gap-3">
        {/* 画面高度调节滑杆（批次 Q）：宽屏下调节遥控画面的最小高度（240–560px）, localStorage 记忆 */}
        <div className="hidden shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 shadow-sm md:flex">
          <Maximize2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">画面高度</span>
          <input
            type="range"
            min={CANVAS_H_MIN}
            max={CANVAS_H_MAX}
            step={8}
            value={canvasH}
            onChange={(e) => changeCanvasH(Number(e.target.value))}
            onDoubleClick={() => changeCanvasH(CANVAS_H_DEFAULT)}
            aria-label="调节巡视车遥控画面的最小高度（双击恢复默认）"
            title={`拖动调节宽屏下遥控画面的最小高度（画面仍会自动拉伸填满左列）· 双击恢复默认 ${CANVAS_H_DEFAULT}px`}
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
          <span className="w-11 shrink-0 text-right font-mono text-[10px] tabular-nums text-primary">{canvasH}px</span>
        </div>
        <div
          style={{ "--rover-h": `${canvasH}px` } as CSSProperties}
          className={`relative h-56 shrink-0 overflow-hidden rounded-md border border-border bg-background shadow-md md:h-auto md:min-h-[var(--rover-h)] md:flex-1 ${snap.hardBrake ? "rover-brake-shake" : ""}`}
        >
          <RoverCanvas snap={snap} unlocked={unlocked} visual={visual} craterNamer={craterNamer} dustIntensity={dustIntensity} fogIntensity={fogIntensity} boltFx={boltFx} />

          {unlocked && (
            <div className="pointer-events-none absolute left-3 top-3 font-mono text-xs text-muted-foreground">
              <p className="tracking-widest text-primary">{roverNameEn} · CAM FEED</p>
              <p className="tabular-nums">
                POS {snap.x.toFixed(1)}, {snap.y.toFixed(1)} m
              </p>
            </div>
          )}

          {!unlocked && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/85 backdrop-blur-sm">
              <Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">着陆后解锁</p>
              <p className="font-mono text-xs tracking-widest text-muted-foreground">ROVER CTRL LOCKED · AWAIT TOUCHDOWN</p>
            </div>
          )}
        </div>

          <div className="flex items-end justify-between gap-3">
            {/* D-pad 控制区: 触屏禁滚动/禁选中, 长按连续行驶不被浏览器手势打断（桌面键盘路径不受影响） */}
            <div className="grid touch-none select-none grid-cols-3 grid-rows-3 gap-1.5">
              <span />
              {padButton("up", "前进", <ChevronUp className="h-5 w-5" aria-hidden="true" />, "")}
              <span />
              {padButton("left", "左转", <ChevronLeft className="h-5 w-5" aria-hidden="true" />, "")}
              <span className="flex items-center justify-center font-mono text-xs text-muted-foreground">NAV</span>
              {padButton("right", "右转", <ChevronRight className="h-5 w-5" aria-hidden="true" />, "")}
              <span />
              {padButton("down", "后退", <ChevronDown className="h-5 w-5" aria-hidden="true" />, "")}
              <span />
            </div>
            <p className="max-w-40 text-right text-xs leading-relaxed text-muted-foreground">
              键盘 <span className="font-mono text-primary">W A S D</span> 或方向键遥控
              <br />
              <button
                type="button"
                onClick={() => setRebinding("honk")}
                onMouseEnter={() => {
                  setHoverAction("honk");
                  playRoverHorn(); // 悬停轻预览喇叭音（不计数不触发日志）
                }}
                onMouseLeave={() => setHoverAction((h) => (h === "honk" ? null : h))}
                aria-label="重绑喇叭快捷键"
                title="点击后按下新按键, 重绑喇叭快捷键（Esc 取消）"
                className={`rounded-sm border px-1 font-mono text-[10px] font-bold transition ${
                  rebinding === "honk"
                    ? "animate-pulse border-primary bg-primary text-primary-foreground"
                    : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                {rebinding === "honk" ? "按键…" : fmtKey(actionKeys?.honk)}
              </button>{" "}
              喇叭 ·{" "}
              <button
                type="button"
                onClick={() => setRebinding("flash")}
                onMouseEnter={() => {
                  setHoverAction("flash");
                  playRoverFlash(); // 悬停轻预览双闪音
                }}
                onMouseLeave={() => setHoverAction((h) => (h === "flash" ? null : h))}
                aria-label="重绑双闪快捷键"
                title="点击后按下新按键, 重绑双闪快捷键（Esc 取消）"
                className={`rounded-sm border px-1 font-mono text-[10px] font-bold transition ${
                  rebinding === "flash"
                    ? "animate-pulse border-primary bg-primary text-primary-foreground"
                    : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                {rebinding === "flash" ? "按键…" : fmtKey(actionKeys?.flash)}
              </button>{" "}
              双闪 ·{" "}
              <button
                type="button"
                onClick={() => setRebinding("drift")}
                onMouseEnter={() => {
                  setHoverAction("drift");
                  playCoverClick(); // 悬停轻预览（咔哒短音示意按住类动作）
                }}
                onMouseLeave={() => setHoverAction((h) => (h === "drift" ? null : h))}
                aria-label="重绑漂移快捷键"
                title="点击后按下新按键, 重绑漂移快捷键（按住该键 = 按住漂移按钮; Esc 取消）"
                className={`rounded-sm border px-1 font-mono text-[10px] font-bold transition ${
                  rebinding === "drift"
                    ? "animate-pulse border-primary bg-primary text-primary-foreground"
                    : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                {rebinding === "drift" ? "按键…" : fmtKey(actionKeys?.drift)}
              </button>{" "}
              漂移{" "}
              <button
                type="button"
                onClick={onResetKeys}
                aria-label="快捷键恢复默认"
                title="三枚动作快捷键恢复默认（空格=喇叭 / F=双闪 / Q=漂移）"
                className="rounded-sm border border-border px-1 font-mono text-[10px] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                ⟲
              </button>
              {hoverAction && (
                <span className={`font-mono text-[10px] font-bold ${isAudioMuted() ? "text-muted-foreground" : "text-primary"}`}>
                  {isAudioMuted()
                    ? "🔇 已静音 · 预览无声"
                    : hoverAction === "honk"
                      ? "= 喇叭"
                      : hoverAction === "flash"
                        ? "= 前照灯双闪"
                        : "= 漂移旋转(按住)"}
                </span>
              )}
              {/* 触屏无 hover: 键位徽章的点按重绑提示降级为常显（touch-only-hint 仅在 (hover: none) 下显示） */}
              <span className="touch-only-hint font-mono text-[10px] text-muted-foreground">
                点键位徽章可重绑 · 屏幕按钮支持长按连续动作
              </span>
              <br />
              静止时太阳能缓慢回充
            </p>
          </div>

          {/* 巡视车动作组：摩斯灯语（预设短语 + 自定义输入）/ 喇叭 / 双闪 / 漂移旋转（按住）——移动表现与互动彩蛋 */}
          {unlocked && !snap.batteryDead && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="font-mono text-[9px] tracking-widest text-muted-foreground">摩斯常用语</span>
                {MORSE_PRESETS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setMorseText(w)}
                    aria-label={`摩斯预设短句 ${w}`}
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest transition ${
                      morseText === w
                        ? "border-primary bg-primary/25 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="text"
                  value={morseText}
                  onChange={(e) => setMorseText(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6))}
                  aria-label="摩斯灯语短句（最多 6 个字母）"
                  placeholder="HI"
                  className="h-7 w-20 shrink-0 rounded-md border border-primary/40 bg-background px-2 font-mono text-xs font-bold tracking-widest text-primary placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                />
                <button
                  type="button"
                  onClick={() => onMorse?.(morseText)}
                  aria-label={`前照灯闪出摩斯灯语 ${morseText || "HI"}`}
                  title="前照灯按摩斯点划闪出自定义短句（最多 6 个字母, 向深空发一句问候）"
                  className="h-7 min-h-11 flex-1 rounded-md border border-primary/40 bg-primary/10 px-1 font-mono text-xs font-bold tracking-wide text-primary transition hover:bg-primary/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus lg:min-h-0"
                >
                  📡 摩斯闪「{morseText || "HI"}」
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={onHonk}
                  aria-label="按喇叭"
                  title="喇叭——声波环扩散; 3 秒内连按 8 声有音乐彩蛋（累计 10 声解锁成就）"
                  className="rounded-md border border-primary/40 bg-primary/10 min-h-11 px-1 py-1.5 font-mono text-xs font-bold tracking-wide lg:min-h-0 text-primary transition hover:bg-primary/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                >
                  🔊 喇叭
                </button>
                <button
                  type="button"
                  onClick={onFlash}
                  aria-label="前照灯双闪"
                  title="前照灯双闪三下——给周围的月壤打个灯光信号"
                  className="rounded-md border border-primary/40 bg-primary/10 min-h-11 px-1 py-1.5 font-mono text-xs font-bold tracking-wide lg:min-h-0 text-primary transition hover:bg-primary/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                >
                  💡 双闪
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    onPressSpin?.();
                  }}
                  onPointerUp={onReleaseSpin}
                  onPointerCancel={onReleaseSpin}
                  aria-label="按住漂移旋转"
                  title="按住原地漂移旋转——六轮扬起尘环并留下胎痕（耗电 0.6%/s, 累计 30 秒解锁成就）"
                  className={`rounded-md border touch-none min-h-11 px-1 py-1.5 font-mono text-xs font-bold tracking-wide lg:min-h-0 transition active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                    snap.spin
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  🌀 漂移
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={onToggleFine}
                  aria-label={`精细操作模式${snap.fineMode ? "已开启, 点击关闭" : "已关闭, 点击开启"}`}
                  title="精细操作模式——车速上限压到 40%, 采样对点与绕坑微调更稳（再点一次关闭）"
                  className={`rounded-md border min-h-11 px-1 py-1.5 font-mono text-xs font-bold tracking-wide lg:min-h-0 transition active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                    snap.fineMode
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  🐢 精细{snap.fineMode ? " · 开" : ""}
                </button>
                <button
                  type="button"
                  onClick={onCycleFilter}
                  aria-label={`切换拍照滤镜, 当前 ${["标准", "金色", "冰蓝", "复古"][snap.photoFilter]}`}
                  title="拍照滤镜切换——标准 / 金色纪念 / 冰蓝 / 复古 循环（取景框与闪光跟随染色）"
                  className="rounded-md border border-primary/40 bg-primary/10 min-h-11 px-1 py-1.5 font-mono text-xs font-bold tracking-wide lg:min-h-0 text-primary transition hover:bg-primary/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                >
                  🎨 {["标准", "金色", "冰蓝", "复古"][snap.photoFilter] ?? "标准"}
                </button>
                <button
                  type="button"
                  onClick={onPhoto}
                  aria-label="桅杆相机拍照"
                  title={`桅杆相机拍张纪念照——快门白闪, 当前滤镜「${["标准", "金色纪念", "冰蓝", "复古"][snap.photoFilter]}」（累计 10 张解锁成就）`}
                  className="rounded-md border border-primary/40 bg-primary/10 min-h-11 px-1 py-1.5 font-mono text-xs font-bold tracking-wide lg:min-h-0 text-primary transition hover:bg-primary/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                >
                  📷 拍照
                </button>
                <button
                  type="button"
                  onClick={() => setShowAlbum((v) => !v)}
                  aria-label={showAlbum ? "收起拍照相册" : "打开拍照相册"}
                  title="相册回看——每张纪念照的序号/滤镜/拍摄坐标"
                  className={`rounded-md border min-h-11 px-1 py-1.5 font-mono text-xs font-bold tracking-wide lg:min-h-0 transition active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                    showAlbum
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  📔 相册
                </button>
              </div>
              {snap.photoFilter === 3 && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="shrink-0 font-mono text-[9px] tracking-widest text-muted-foreground">颗粒</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={10}
                    value={snap.grainLevel}
                    onChange={(e) => onGrainLevel?.(Number(e.target.value))}
                    onDoubleClick={() => onGrainLevel?.(110)}
                    aria-label="复古滤镜颗粒浓度（双击恢复标准值 110）"
                    title="复古滤镜的噪点颗粒浓度（0-200）——取景时实时生效; 双击滑杆一键恢复标准值 110"
                    className="h-1 flex-1 cursor-pointer accent-primary"
                  />
                  <span className="w-7 shrink-0 text-right font-mono text-[9px] tabular-nums text-primary">{snap.grainLevel}</span>
                  {/* 三档快捷预设：一键跳到常用浓度（当前档高亮） */}
                  {[
                    { v: 60, label: "轻" },
                    { v: 110, label: "标准" },
                    { v: 180, label: "重" },
                  ].map((p) => (
                    <button
                      key={p.v}
                      type="button"
                      onClick={() => onGrainLevel?.(p.v)}
                      onPointerDown={() => holdGrainTo(p.v)}
                      onPointerUp={stopGrainHold}
                      onPointerLeave={stopGrainHold}
                      onPointerCancel={stopGrainHold}
                      aria-label={`颗粒浓度快捷预设 ${p.label} ${p.v}（长按从当前值连续调节）`}
                      aria-pressed={snap.grainLevel === p.v}
                      title={`一键跳到「${p.label}」档 ${p.v}; 按住不放则从当前值逐格连续调过去`}
                      className={`shrink-0 touch-none rounded-sm border px-1 py-0.5 font-mono text-[9px] font-bold transition ${
                        snap.grainLevel === p.v
                          ? "border-primary bg-primary/25 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={cycleVibrateMode}
                    aria-label={`长按连调震动反馈当前 ${vibrateMode === "soft" ? "弱" : vibrateMode === "strong" ? "强" : "节奏"} 档, 点击切换下一档`}
                    title={`长按预设连调时的震动反馈——弱: 每格 8ms 轻触; 强: 每格 20ms + 到档双震; 节奏: 长短拍交替 + 到档五连奏（记忆选择, 不支持震动的设备无感）`}
                    className={`shrink-0 rounded-sm border px-1 py-0.5 font-mono text-[9px] font-bold transition ${
                      vibrateMode !== "soft"
                        ? "border-primary bg-primary/25 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    📳 {vibrateMode === "soft" ? "弱" : vibrateMode === "strong" ? "强" : "节奏"}
                  </button>
                </div>
              )}
              {/* 自定义节奏花样：节奏档时浮现——逗号分隔毫秒序列（每段 5-50, 最多 8 段）, 改动即记忆 */}
              {snap.photoFilter === 3 && vibrateMode === "rhythm" && (
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="shrink-0 font-mono text-[9px] tracking-widest text-muted-foreground">节奏</span>
                  <input
                    type="text"
                    value={vibratePatternText}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9,]/g, "").slice(0, 40);
                      setVibratePatternText(v);
                      try {
                        window.localStorage.setItem("rover-vibrate-pattern", v);
                      } catch {
                        // 忽略
                      }
                    }}
                    aria-label="自定义节奏震动花样（逗号分隔毫秒, 每段 5-50, 最多 8 段）"
                    title="节奏档的震动花样——逗号分隔的毫秒序列（如 6,10,14,18,22）, 每段 5-50ms, 最多取前 8 段循环; 改动自动记忆"
                    placeholder="6,10,14,18,22"
                    className="h-5 w-32 shrink-0 rounded-sm border border-primary/40 bg-background px-1 font-mono text-[9px] tabular-nums text-primary placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                  />
                  <span className="shrink-0 font-mono text-[8px] tabular-nums text-muted-foreground">
                    {parseVibratePattern(vibratePatternText).length} 段 · 每段 5-50ms
                  </span>
                </div>
              )}
              {showAlbum && (
                <RoverAlbumPanel
                  photoLog={photoLog}
                  onRemovePhoto={onRemovePhoto}
                  roverName={roverName}
                  roverNameEn={roverNameEn}
                  odoMeters={snap.odometer}
                  batteryPct={snap.battery}
                  dustPct={snap.dust}
                />
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <ColumnGroup
            title="车辆遥测"
            en="TELEMETRY"
            badge={snap.batteryDead ? "电量耗尽" : `电量 ${snap.battery.toFixed(0)}%`}
            badgeWarn={snap.batteryDead || snap.battery <= 20}
            badgeTitle="巡视车当前电池电量——≤20% 转红警示, 耗尽后需停车等待太阳能回充"
          >
          <div className="grid grid-cols-2 gap-2">
            {readout("速度", "SPD", snap.speed.toFixed(2), "m/s")}
            {readout("行驶里程", "ODO", fmtOdo(snap.odometer), "")}
            {readout("车体温度", "TEMP", snap.tempC.toFixed(1), "℃")}
            {readout("电池电量", "BATT", snap.battery.toFixed(0), "%", batteryLow)}
          </div>

          <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <p className="font-mono text-xs tracking-widest text-muted-foreground">BATTERY BUS</p>
              <p className={`font-mono text-xs tabular-nums ${batteryLow || stormHalt ? "text-destructive" : "text-primary"}`}>
                {snap.batteryDead
                  ? "待机充电中"
                  : stormHalt
                    ? "风暴生存 · 电池亏损"
                    : stormBlocking
                      ? "沙尘遮光 · 回充停止"
                      : snap.moving
                        ? "行驶耗电"
                        : "太阳能回充"}
              </p>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-300 ${batteryLow ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.max(2, Math.min(100, snap.battery))}%` }}
              />
            </div>
          </div>

          {/* 太阳能发电报表：累计发电 vs 积尘折损（与积尘系统联动, 效率实时折算） */}
          <div className={`rounded-md border bg-background px-3 py-2 shadow-sm ${snap.dust >= 70 ? "border-destructive/60 shadow-destructive/10" : "border-border"}`}>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-mono text-xs tracking-widest text-muted-foreground">SOLAR GEN · 发电报表</p>
              <p className={`font-mono text-xs tabular-nums ${snap.dust >= 40 ? "text-destructive" : "text-primary"}`}>
                板面效率 {Math.max(0, Math.round(100 - (snap.dust / 130) * 100))}%
              </p>
            </div>
            <div className="flex items-center justify-between font-mono text-xs tabular-nums text-card-foreground">
              <span>
                累计发电 <b className="text-primary">{snap.gen.total}%</b>
              </span>
              <span>
                积尘折损 <b className={snap.gen.lost >= 30 ? "text-destructive" : "text-muted-foreground"}>{snap.gen.lost}%</b>
              </span>
            </div>
          </div>

          </ColumnGroup>
          <ColumnGroup
            title="采样与化验"
            en="SCIENCE OPS"
            badge={`样品 ${samples.length} · 报告 ${Object.keys(sampleReports).length}`}
            badgeTitle="已封装入舱的样品数与已出具的化验报告数——主线目标要求各 3 份"
          >
          <RoverScienceOps
            snap={snap}
            unlocked={unlocked}
            stormHalt={stormHalt}
            thermalHud={thermalHud}
            samples={samples}
            sampleReports={sampleReports}
            analysis={analysis}
            onStartAnalysis={onStartAnalysis}
            onOpenReport={onOpenReport}
            onStartSampling={onStartSampling}
            onToggleArmPause={onToggleArmPause}
            onCancelArm={onCancelArm}
            roverName={roverName}
            roverNameEn={roverNameEn}
          />
          <RoverEuropaPanels
            snap={snap}
            unlocked={unlocked}
            armBusy={armBusy}
            stormHalt={stormHalt}
            iceProbeEnabled={iceProbeEnabled}
            iceProbe={iceProbe}
            iceProbeLatest={iceProbeLatest}
            onStartIceProbe={onStartIceProbe}
            crackProbe={crackProbe}
            crackProbeLatest={crackProbeLatest}
            onStartCrackProbe={onStartCrackProbe}
            oceanSample={oceanSample}
            oceanSampleTaken={oceanSampleTaken}
            onStartOceanSample={onStartOceanSample}
          />

          </ColumnGroup>

          {/* 越野拉力赛：限时依次通过 3 个检查点, 擦撞坑沿罚时（三任务通用; 正序/倒序/夜航三航线分记最佳） */}
          {unlocked && (
            <RoverRallyPanel
              snap={snap}
              armBusy={armBusy}
              stormHalt={stormHalt}
              iceProbe={iceProbe}
              crackProbe={crackProbe}
              oceanSample={oceanSample}
              rallyHud={rallyHud}
              rallyResult={rallyResult}
              rallyBestS={rallyBestS}
              rallyBestRevS={rallyBestRevS}
              rallyBestNightS={rallyBestNightS}
              onStartRally={onStartRally}
            />
          )}
        </div>
      </div>
    </section>
  );
}
