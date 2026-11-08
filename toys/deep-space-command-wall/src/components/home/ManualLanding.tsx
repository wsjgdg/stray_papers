// 手动着陆挑战：动力下降段接管操纵杆的小游戏。
// 100ms 物理步进——油门对抗重力控制下降率 + 侧风扰动横向漂移（←/→ 横推修正）,
// 燃料有限, 触地速度与横向偏移共同定 S-D 着陆评级; 超速或飘出安全区 = 硬着陆（可重试或按 D 级接受）。
// 颜色全部 token 类, 无 hex。
import { useEffect, useRef, useState } from "react";
import { Flame, RotateCcw, Rocket, Wind } from "lucide-react";
import type { MissionId } from "@/lib/missions";
import { Button } from "@/components/ui/button";

export type LandingGrade = "S" | "A" | "B" | "C" | "D" | "AUTO";

interface ManualLandingProps {
  open: boolean;
  missionId: MissionId;
  missionCode: string;
  /** 着陆结束（含自动着陆 / 接受硬着陆）: 回传评级 + 触地速度 + 横向偏移, useHome 恢复飞行时钟 */
  onComplete: (grade: LandingGrade, touchdownV: number, driftM?: number) => void;
  /** 每日挑战「精密着陆」修饰: 侧风强度倍率（×1.5） */
  windBoost?: number;
  /** 每日挑战「精密着陆」修饰: 成功着陆区收窄（飘出判硬着陆阈值 42m→30m, 降档阈值收紧） */
  tightZone?: boolean;
}

const GRAVITY: Record<MissionId, number> = { luna9: 1.62, ares1: 3.72, europa1: 1.31, venus1: 8.87, titan1: 1.35 };
/** 阵风强度系数：金星稠密大气侧风最猛, 泰坦稠密冷大气次之, 火星再次, 月球近乎无风 */
const WIND_MULT: Record<MissionId, number> = { luna9: 0.55, ares1: 1.5, europa1: 0.9, venus1: 1.8, titan1: 1.2 };
const WIND_WORD: Record<MissionId, string> = { luna9: "月面近乎真空 · 弱扰动", ares1: "火星稀薄大气 · 强阵风", europa1: "冰原升华气流 · 中等阵风", venus1: "金星稠密大气 · 烈性侧风", titan1: "泰坦稠密冷大气 · 黏滞侧风" };
const START_ALT = 800; // m
const START_VS = 25; // m/s 下降率
const START_THROTTLE = 0.3;
const THRUST_MULT = 2.4; // 满油门加速度 = 2.4g（悬停油门 ~42%）
const VENUS_THRUST_MULT = 3.4; // 金星高重力下反推上调, 保证下降段操控裕度可玩
const FUEL_BURN = 0.85; // %/s @ 满油门
const DT = 0.1; // 物理步长 s
const CRASH_VS = 12; // 超过即硬着陆
const LATERAL_THRUST = 2.6; // 横推 RCS 加速度 m/s²
const GUST_MAX = 1.6; // 阵风基础幅值 m/s²（乘天体系数）
const SURGE_MULT = 2.8; // 突发狂风期间阵风幅值倍数
const OFFPAD_CRASH = 42; // 触地横向偏移超过即飘出安全区（硬着陆）
const GRADE_ORDER: LandingGrade[] = ["S", "A", "B", "C", "D"];

function gradeOf(vs: number): LandingGrade {
  if (vs <= 1.5) return "S";
  if (vs <= 3) return "A";
  if (vs <= 6) return "B";
  if (vs <= CRASH_VS) return "C";
  return "D";
}

/** 横向偏移降档：≤10m 不降, ≤22m 降一档, 更远降两档（精密着陆修饰: 阈值收紧为 6m/14m） */
function applyDriftPenalty(grade: LandingGrade, drift: number, tight = false): LandingGrade {
  const tiers = tight ? (drift <= 6 ? 0 : drift <= 14 ? 1 : 2) : drift <= 10 ? 0 : drift <= 22 ? 1 : 2;
  const idx = Math.min(GRADE_ORDER.length - 1, GRADE_ORDER.indexOf(grade) + tiers);
  return GRADE_ORDER[idx];
}

const GRADE_WORD: Record<LandingGrade, string> = {
  S: "羽量级触地 · 教科书着陆",
  A: "轻柔触地 · 漂亮",
  B: "平稳触地 · 合格",
  C: "重触地 · 着陆腿呻吟了一声",
  D: "硬着陆 · 着陆器受损",
  AUTO: "自动着陆 · 稳健保守",
};

interface SimState {
  alt: number;
  vs: number;
  throttle: number;
  fuel: number;
  t: number;
  /** 横向偏移 (m, 右为正) */
  x: number;
  /** 横向速度 (m/s) */
  vx: number;
  /** 当前侧风加速度 (m/s², 右为正) */
  wind: number;
  /** 突发狂风紧急事件进行中（GUST SURGE, 阵风幅值 ×2.8） */
  surge: boolean;
}

function initialSim(fuelPct: number): SimState {
  return { alt: START_ALT, vs: START_VS, throttle: START_THROTTLE, fuel: fuelPct, t: 0, x: 0, vx: 0, wind: 0, surge: false };
}

function initialWind() {
  return {
    v: 0,
    tick: 0,
    next: 12 + Math.floor(Math.random() * 14),
    // 突发狂风调度：首次 5–9s, 之后每 7–13s 一阵, 每阵持续 2.5–4s
    surgeUntil: -1,
    nextSurge: 50 + Math.floor(Math.random() * 40),
  };
}

export function ManualLanding({ open, missionId, missionCode, onComplete, windBoost = 1, tightZone = false }: ManualLandingProps) {
  const g = GRAVITY[missionId] ?? 1.62;
  // 每日挑战「精密着陆」: 侧风 ×1.5 + 着陆区收窄（飘出阈值 42m→30m）
  const windMult = (WIND_MULT[missionId] ?? 1) * windBoost;
  const offpadCrash = tightZone ? 30 : OFFPAD_CRASH;
  const thrustMult = missionId === "venus1" ? VENUS_THRUST_MULT : THRUST_MULT;
  const [sim, setSim] = useState<SimState>(() => initialSim(100));
  const [phase, setPhase] = useState<"fly" | "result" | "crashed">("fly");
  const [result, setResult] = useState<{ grade: LandingGrade; vs: number; fuel: number; drift: number; crashReason?: string } | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  // 阵风与突发狂风调度（interval 回调内推进, 不放 setState updater 里保持纯净）
  const windRef = useRef(initialWind());

  // 重新开局（重试硬着陆）
  const restart = (fuelPct: number) => {
    setSim(initialSim(fuelPct));
    windRef.current = initialWind();
    setResult(null);
    setPhase("fly");
  };

  // 物理步进（100ms）：油门键持续调节 + 阵风/突发狂风横向扰动 + 横推修正, 燃料耗尽自由落体
  useEffect(() => {
    if (!open || phase !== "fly") return;
    const timer = window.setInterval(() => {
      // 阵风换向调度：常规每 1.2–2.6s 随机一阵; 突发狂风（GUST SURGE）期间每步重掷 ×2.8 倍狂风
      const w = windRef.current;
      w.tick += 1;
      const surging = w.tick <= w.surgeUntil;
      if (surging) {
        w.v = (Math.random() * 2 - 1) * GUST_MAX * windMult * SURGE_MULT;
      } else if (w.tick >= w.next) {
        w.next = w.tick + 12 + Math.floor(Math.random() * 15);
        w.v = (Math.random() * 2 - 1) * GUST_MAX * windMult;
      }
      if (!surging && w.tick >= w.nextSurge) {
        w.surgeUntil = w.tick + 25 + Math.floor(Math.random() * 16);
        w.nextSurge = w.surgeUntil + 70 + Math.floor(Math.random() * 60);
      }
      setSim((prev) => {
        let throttle = prev.throttle;
        if (keysRef.current.has("up")) throttle = Math.min(1, throttle + 0.045);
        if (keysRef.current.has("down")) throttle = Math.max(0, throttle - 0.045);
        let fuel = prev.fuel - throttle * FUEL_BURN * DT;
        if (fuel <= 0) {
          fuel = 0;
          throttle = 0;
        }
        const accel = g - throttle * thrustMult * g; // 向下为正
        const vs = Math.max(-6, prev.vs + accel * DT); // 允许小幅上升（上限 6 m/s）
        const alt = prev.alt - vs * DT;
        // 横向：侧风推动 + RCS 横推修正 + 轻微阻尼
        let lateral = w.v;
        if (keysRef.current.has("left")) lateral -= LATERAL_THRUST;
        if (keysRef.current.has("right")) lateral += LATERAL_THRUST;
        const vx = (prev.vx + lateral * DT) * 0.995;
        const x = prev.x + vx * DT;
        const t = prev.t + DT;
        if (alt <= 0) {
          const drift = Math.abs(x);
          const wind = w.v;
          if (vs > CRASH_VS) {
            setPhase("crashed");
            setResult({ grade: "D", vs, fuel, drift, crashReason: "overspeed" });
          } else if (drift > offpadCrash) {
            setPhase("crashed");
            setResult({ grade: "D", vs, fuel, drift, crashReason: "offpad" });
          } else {
            setPhase("result");
            setResult({ grade: applyDriftPenalty(gradeOf(vs), drift, tightZone), vs, fuel, drift });
          }
          return { alt: 0, vs: 0, throttle, fuel, t, x, vx: 0, wind, surge: false };
        }
        return { alt, vs, throttle, fuel, t, x, vx, wind: w.v, surge: surging };
      });
    }, DT * 1000);
    return () => window.clearInterval(timer);
  }, [open, phase, g, windMult, thrustMult, offpadCrash, tightZone]);

  // 键盘：↑/W 加油, ↓/S 减油, ←/A 左推, →/D 右推（阻止页面滚动）
  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "w", "W"].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add("up");
      } else if (["ArrowDown", "s", "S"].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add("down");
      } else if (["ArrowLeft", "a", "A"].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add("left");
      } else if (["ArrowRight", "d", "D"].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add("right");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowUp", "w", "W"].includes(e.key)) keysRef.current.delete("up");
      else if (["ArrowDown", "s", "S"].includes(e.key)) keysRef.current.delete("down");
      else if (["ArrowLeft", "a", "A"].includes(e.key)) keysRef.current.delete("left");
      else if (["ArrowRight", "d", "D"].includes(e.key)) keysRef.current.delete("right");
    };
    const blur = () => keysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [open]);

  if (!open) return null;
  const vsPct = Math.max(0, Math.min(1, sim.vs / 35));
  const altPct = Math.max(0, Math.min(1, sim.alt / START_ALT));
  const vsColor = sim.vs <= 3 ? "text-primary" : sim.vs <= 6 ? "text-foreground" : "text-destructive";
  // 横向偏移：安全区绿 / 降档区内白 / 更远红（精密着陆修饰收紧阈值）; 偏移带全幅 ±45m
  const driftSafe = tightZone ? 6 : 10;
  const driftWarn = tightZone ? 14 : 22;
  const driftAbs = Math.abs(sim.x);
  const driftColor = driftAbs <= driftSafe ? "text-primary" : driftAbs <= driftWarn ? "text-foreground" : "text-destructive";
  const driftPct = Math.max(-1, Math.min(1, sim.x / 45));
  const windAbs = Math.abs(sim.wind);
  const windStrong = windAbs > 1.4 * windMult;

  const holdBtn = (dir: "up" | "down", label: string) => (
    <button
      type="button"
      aria-label={label}
      disabled={phase !== "fly"}
      onPointerDown={(e) => {
        e.preventDefault();
        keysRef.current.add(dir);
      }}
      onPointerUp={() => keysRef.current.delete(dir)}
      onPointerLeave={() => keysRef.current.delete(dir)}
      onPointerCancel={() => keysRef.current.delete(dir)}
      className="flex h-14 w-full touch-none select-none items-center justify-center rounded-md border border-primary bg-primary/10 font-mono text-lg font-bold text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground active:scale-95 active:bg-primary active:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );

  const lateralBtn = (dir: "left" | "right", label: string) => (
    <button
      type="button"
      aria-label={label}
      disabled={phase !== "fly"}
      onPointerDown={(e) => {
        e.preventDefault();
        keysRef.current.add(dir);
      }}
      onPointerUp={() => keysRef.current.delete(dir)}
      onPointerLeave={() => keysRef.current.delete(dir)}
      onPointerCancel={() => keysRef.current.delete(dir)}
      className="flex h-11 flex-1 touch-none select-none items-center justify-center rounded-md border border-border bg-background font-mono text-sm font-bold text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary active:scale-95 active:border-primary active:bg-primary active:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="手动着陆挑战">
      <div className="max-h-[92vh] w-full max-w-2xl animate-in fade-in zoom-in-95 overflow-y-auto rounded-lg border-2 border-primary/50 bg-card p-5 shadow-xl duration-300">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-card-foreground">
              手动着陆接管 <span className="text-primary">·</span> MANUAL LANDING
            </h2>
            <p className="mt-0.5 font-mono text-xs tracking-widest text-muted-foreground">
              {missionCode} · 动力下降段 · 重力 {g.toFixed(2)} m/s² · {WIND_WORD[missionId]}
            </p>
          </div>
          {phase === "fly" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onComplete("AUTO", START_VS)}
              className="shrink-0 border-border font-mono focus-visible:shadow-focus"
              title="交还制导计算机, 按自动着陆完成（结算按 B 级稳健计）"
            >
              转自动着陆
            </Button>
          )}
        </div>

        {phase === "fly" && (
          <>
            {/* 突发狂风紧急事件横幅（GUST SURGE 期间红色心跳警示） */}
            {sim.surge && (
              <div className="countdown-urgent mt-3 flex items-center justify-center gap-2 rounded-md border-2 border-destructive bg-destructive/15 px-3 py-1.5">
                <Wind className="h-4 w-4 text-destructive" aria-hidden="true" />
                <p className="font-mono text-xs font-bold tracking-widest text-destructive">
                  ⚠ 突发狂风 GUST SURGE · 阵风幅值 ×{SURGE_MULT.toFixed(1)} · 全力横推压住漂移!
                </p>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)_150px]">
              {/* 高度带 */}
              <div className="relative h-52 overflow-hidden rounded-md border border-border bg-background">
                <div className="absolute inset-x-0 bottom-0 bg-primary/15 transition-all duration-100" style={{ height: `${altPct * 100}%` }} />
                <div className="absolute inset-x-0 border-t-2 border-primary" style={{ bottom: `${altPct * 100}%` }}>
                  <Rocket className="absolute -top-3 left-1/2 h-5 w-5 -translate-x-1/2 rotate-180 text-primary" aria-hidden="true" />
                </div>
                <p className="absolute inset-x-0 bottom-1 text-center font-mono text-[10px] tracking-widest text-muted-foreground">SURFACE</p>
              </div>

              {/* 主读数 */}
              <div className="flex flex-col justify-between gap-2">
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="font-mono text-xs tracking-widest text-muted-foreground">高度 ALT</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-primary">{Math.max(0, sim.alt).toFixed(0)} m</p>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="font-mono text-xs tracking-widest text-muted-foreground">垂直速度 V/S</p>
                  <p className={`font-mono text-3xl font-bold tabular-nums ${vsColor}`}>
                    {sim.vs > 0.05 ? "↓" : sim.vs < -0.05 ? "↑" : "·"} {Math.abs(sim.vs).toFixed(1)} m/s
                  </p>
                  {/* 下降率色带：绿区 ≤3 */}
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-100 ${sim.vs <= 3 ? "bg-primary" : sim.vs <= 6 ? "bg-foreground" : "bg-destructive"}`}
                      style={{ width: `${Math.max(2, vsPct * 100)}%` }}
                    />
                  </div>
                </div>
                {/* 侧风 + 横向偏移 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className={`rounded-md border bg-background px-3 py-1.5 ${sim.surge || windStrong ? "border-destructive/60" : "border-border"}`}>
                    <p className="flex items-center gap-1 font-mono text-xs tracking-widest text-muted-foreground">
                      <Wind className={`h-3 w-3 ${sim.surge || windStrong ? "text-destructive" : "text-primary"}`} aria-hidden="true" />
                      侧风 WIND{sim.surge ? " · SURGE" : ""}
                    </p>
                    <p className={`font-mono text-base font-bold tabular-nums ${sim.surge || windStrong ? "text-destructive" : "text-foreground"}`}>
                      {windAbs < 0.08 ? " calm" : `${sim.wind < 0 ? "←" : "→"} ${windAbs.toFixed(1)} m/s²`}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-1.5">
                    <p className="font-mono text-xs tracking-widest text-muted-foreground">偏移 DRIFT</p>
                    <p className={`font-mono text-base font-bold tabular-nums ${driftColor}`}>
                      {sim.x < -0.05 ? "←" : sim.x > 0.05 ? "→" : "·"} {driftAbs.toFixed(1)} m
                    </p>
                  </div>
                </div>
                {/* 横向偏移带：中央 primary 安全区 ±10m, 着陆器游标随偏移滑动 */}
                <div className="relative h-4 overflow-hidden rounded-md border border-border bg-background">
                  <div className={`absolute inset-y-0 left-1/2 ${tightZone ? "w-[13%]" : "w-[22%]"} -translate-x-1/2 bg-primary/15`} aria-hidden="true" />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-primary/50" aria-hidden="true" />
                  <div
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-primary bg-primary shadow-sm"
                    style={{ left: `${50 + driftPct * 50}%` }}
                    aria-hidden="true"
                  />
                  <p className="absolute inset-x-0 -bottom-px text-center font-mono text-[8px] tracking-widest text-muted-foreground">着陆区偏移带 · 中央为安全区</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <p className="font-mono text-xs tracking-widest text-muted-foreground">油门 THR</p>
                    <p className="font-mono text-lg font-bold tabular-nums text-primary">{Math.round(sim.throttle * 100)}%</p>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <p className="font-mono text-xs tracking-widest text-muted-foreground">燃料 FUEL</p>
                    <p className={`font-mono text-lg font-bold tabular-nums ${sim.fuel <= 15 ? "text-destructive" : "text-foreground"}`}>
                      {sim.fuel.toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* 油门杆 + 尾焰（控制区: 触屏禁滚动/禁选中, 长按连续加减油不被手势打断） */}
              <div className="flex touch-none select-none flex-col gap-2">
                {holdBtn("up", "▲ 加油")}
                <div className="relative flex h-16 items-end justify-center overflow-hidden rounded-md border border-border bg-background">
                  {sim.throttle > 0.03 && (
                    <span
                      className="engine-plume-core absolute bottom-0 w-4 rounded-t-full"
                      style={{ height: `${Math.max(10, sim.throttle * 100)}%`, opacity: 0.5 + sim.throttle * 0.5 }}
                      aria-hidden="true"
                    />
                  )}
                  <Flame className={`relative z-10 mb-1 h-5 w-5 ${sim.throttle > 0.03 ? "text-primary" : "text-muted-foreground/40"}`} aria-hidden="true" />
                </div>
                {holdBtn("down", "▼ 减油")}
              </div>
            </div>
            {/* 横推修正按钮（控制区: 触屏禁滚动/禁选中） */}
            <div className="mt-2 flex touch-none select-none gap-2">
              {lateralBtn("left", "◀ 左推修正")}
              {lateralBtn("right", "右推修正 ▶")}
            </div>
            <p className="mt-3 text-center font-mono text-xs leading-relaxed tracking-widest text-muted-foreground">
              按住 <span className="text-primary">↑ / W</span> 加油门 · <span className="text-primary">↓ / S</span> 减油门 · <span className="text-primary">← →</span> 横推对抗侧风
              <br />
              阵风每 1-3 秒换向 · <span className="text-destructive">突发狂风随机来袭</span> · 触地偏移 ≤{driftSafe}m 不降档 · 飘出 {offpadCrash}m 判硬着陆{tightZone ? " · 精密着陆: 着陆区收窄" : ""}
            </p>
          </>
        )}

        {phase === "crashed" && result && (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
            <p className="font-display text-3xl font-bold text-destructive">硬着陆!</p>
            <p className="text-sm text-muted-foreground">
              {result.crashReason === "offpad" ? (
                <>
                  触地横向偏移 <b className="font-mono text-destructive">{result.drift.toFixed(1)} m</b> 飘出安全着陆区, 着陆器侧翻在着陆垫外——乘组安全, 但任务评价受损。
                </>
              ) : (
                <>
                  触地速度 <b className="font-mono text-destructive">{result.vs.toFixed(1)} m/s</b> 超出结构极限, 着陆腿坍塌、贮箱变形——乘组安全, 但任务评价受损。
                </>
              )}
            </p>
            <div className="mt-2 flex gap-2">
              <Button onClick={() => restart(70)} className="gap-2 font-mono">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                重试下降（燃料 70%）
              </Button>
              <Button variant="outline" onClick={() => onComplete("D", result.vs, result.drift)} className="border-border font-mono">
                接受 D 级 · 继续任务
              </Button>
            </div>
          </div>
        )}

        {phase === "result" && result && (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
            <div className={`grade-flip relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground shadow-lg`}>
              {result.grade === "S" && (
                <>
                  <span className="grade-sparkle gsf-1 pointer-events-none absolute top-2" aria-hidden="true" />
                  <span className="grade-sparkle gsf-2 pointer-events-none absolute top-0" aria-hidden="true" />
                  <span className="grade-sparkle gsf-3 pointer-events-none absolute top-4" aria-hidden="true" />
                </>
              )}
              <span className="font-display text-5xl font-bold">{result.grade}</span>
            </div>
            <p className="font-display text-lg font-bold text-card-foreground">{GRADE_WORD[result.grade]}</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>触地速度 <b className="tabular-nums text-primary">{result.vs.toFixed(2)} m/s</b></span>
              <span>横向偏移 <b className={`tabular-nums ${result.drift <= driftSafe ? "text-primary" : "text-destructive"}`}>{result.drift.toFixed(1)} m</b></span>
              <span>剩余燃料 <b className="tabular-nums text-primary">{Math.max(0, result.fuel).toFixed(0)}%</b></span>
              <span>下降用时 <b className="tabular-nums text-primary">{sim.t.toFixed(0)}s</b></span>
            </div>
            <Button onClick={() => onComplete(result.grade, result.vs, result.drift)} className="mt-2 font-mono">
              确认着陆 · 继续任务
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
