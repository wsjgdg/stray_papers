// 中继天线三段对准：指针匀速扫过的圆形刻度盘, 指针进入高亮目标扇区时点「锁定」——三段全部锁上完成信号锁定。
// 锁偏一发即失败收卡。目标扇区三段各自随机; 判定相位与 CSS 指针动画同周期（antenna-spin 2s, 与 CYCLE_MS 严格同步）。
// 干扰变体：reverse 反转局（指针倒扫, 判定相位取反）; dual 双针局（副针忽快忽慢纯视觉干扰 + 目标扇区缓慢漂移）。
import { useEffect, useRef, useState } from "react";
import { Satellite } from "lucide-react";
import { playAckConfirm, playAlarmBeep } from "@/lib/missionAudio";
import { tokenHsl, tokenShiftHsl } from "@/lib/themeColors";

const CYCLE_MS = 2000; // 指针旋转周期（与 index.css antenna-spin-fx 严格一致, 改一处必须同步另一处）
const HALF_WIN = 0.055; // 每段目标扇区半宽（相位占比, 约 ±110ms）
const STAGES = 3;
const DRIFT_AMP = 0.06; // 双针局扇区漂移幅度（相位占比, ≈±21.6°）
const DRIFT_PERIOD_MS = 5000; // 扇区漂移周期

interface AntennaCardProps {
  /** 剩余响应秒数（超时由 useHome 收卡） */
  remainS: number;
  /** 反转干扰局：指向机构卡滞, 指针倒转（判定相位同步取反） */
  reverse?: boolean;
  /** 双针干扰局：盘面叠一根不同速反向的半透明副针（纯视觉干扰, 判定只认实色主针） */
  dual?: boolean;
  /** 对准结束回调: true = 三段全锁, false = 锁偏 */
  onDone: (ok: boolean) => void;
}

export function AntennaCard({ remainS, reverse, dual, onDone }: AntennaCardProps) {
  // 组件挂载即计时起点（与指针 CSS 动画同一 commit 启动, 误差 ≤1 帧）
  const startRef = useRef(performance.now());
  // 三段目标扇区随机中心（0.1-0.9 相位内错开, 不贴起点）
  const [centers] = useState(() =>
    Array.from({ length: STAGES }, (_, i) => 0.12 + ((i * 0.31 + Math.random() * 0.22) % 0.78)),
  );
  const [locked, setLocked] = useState(0);
  const lockedRef = useRef(0);
  const doneRef = useRef(false);
  // 双针局渲染驱动：每 60ms 强制刷新一帧, 让漂移的目标扇区动起来（常规局静态不跑 interval）
  const [, setDriftTick] = useState(0);
  useEffect(() => {
    if (!dual) return;
    const iv = window.setInterval(() => setDriftTick((n) => n + 1), 60);
    return () => window.clearInterval(iv);
  }, [dual]);

  /** 目标扇区当前中心：常规局静态; 双针局正弦漂移且越锁越快（周期 5s→3.1s→2.3s）——相位连续积分, 提速瞬间不跳位 */
  const driftPhaseRef = useRef(0);
  const lastDriftRef = useRef(startRef.current);
  const centerAt = (i: number, nowMs: number) => {
    const base = centers[i];
    if (!dual) return base;
    const dtMs = Math.max(0, nowMs - lastDriftRef.current);
    lastDriftRef.current = nowMs;
    driftPhaseRef.current += (dtMs / (DRIFT_PERIOD_MS / (1 + lockedRef.current * 0.6))) * Math.PI * 2;
    return base + DRIFT_AMP * Math.sin(driftPhaseRef.current + i * 2.1);
  };

  const lock = () => {
    if (doneRef.current) return;
    const nowMs = performance.now();
    const raw = ((nowMs - startRef.current) % CYCLE_MS) / CYCLE_MS;
    // 反转局指针倒扫: 判定相位同步取反（动画 direction reverse 与本公式严格一致）
    const phase = reverse ? (1 - raw) % 1 : raw;
    const c = centerAt(lockedRef.current, nowMs);
    let diff = Math.abs(phase - c);
    if (diff > 0.5) diff = 1 - diff;
    if (diff <= HALF_WIN) {
      playAckConfirm();
      lockedRef.current += 1;
      setLocked(lockedRef.current);
      if (lockedRef.current >= STAGES) {
        doneRef.current = true;
        onDone(true);
      }
    } else {
      playAlarmBeep("caution");
      doneRef.current = true;
      onDone(false);
    }
  };

  const cur = centerAt(Math.min(locked, STAGES - 1), performance.now());
  const sectorFrom = (cur - HALF_WIN) * 360;
  const sectorSpan = HALF_WIN * 2 * 360;
  // 残影颜色随锁定数转金：0 锁红影 → 1 锁淡金 → 2 锁亮金（primary 调相派生, 逼近全锁的仪式感）
  const goldGhost = { hue: -168, sat: 0.85, light: 1.05 };
  const ghostA =
    locked >= 2 ? tokenShiftHsl("--primary", goldGhost, 0.5) : locked === 1 ? tokenShiftHsl("--primary", goldGhost, 0.32) : tokenHsl("--destructive", 0.25);
  const ghostB =
    locked >= 2 ? tokenShiftHsl("--primary", goldGhost, 0.3) : locked === 1 ? tokenShiftHsl("--primary", goldGhost, 0.18) : tokenHsl("--destructive", 0.15);

  return (
    <div className="pointer-events-auto absolute right-4 top-14 z-40 w-56 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="overflow-hidden rounded-lg border-2 border-primary/60 bg-card/95 shadow-xl backdrop-blur" role="dialog" aria-label="中继天线对准">
        <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-1.5">
          <Satellite className="h-4 w-4 shrink-0 animate-pulse text-primary" aria-hidden="true" />
          <p className="font-display text-xs font-bold text-primary">
            中继天线 · 三段对准{reverse ? " · 反转" : ""}{dual ? " · 双针" : ""}
          </p>
          <span className="ml-auto rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-primary">
            T-{remainS}s
          </span>
        </div>
        <div className="flex flex-col items-center px-3 py-2.5">
          {/* 刻度盘：目标扇区高亮（conic-gradient token 色）+ 匀速旋转指针; 三段全锁瞬间盘面转金 + 光环爆散庆典 */}
          <div
            className={`relative h-32 w-32 rounded-full border-2 bg-background/60 shadow-inner ${locked >= STAGES ? "border-primary" : "border-primary/50"}`}
            style={locked >= STAGES ? { boxShadow: `0 0 18px ${tokenShiftHsl("--primary", goldGhost, 0.45)}` } : undefined}
          >
            {locked >= STAGES && (
              <span
                className="antenna-lock-burst pointer-events-none absolute inset-0 rounded-full border-2"
                style={{ borderColor: tokenShiftHsl("--primary", goldGhost, 0.8) }}
                aria-hidden="true"
              />
            )}
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from ${sectorFrom}deg, hsl(var(--primary) / 0.38) 0deg ${sectorSpan}deg, transparent ${sectorSpan}deg 360deg)`,
              }}
              aria-hidden="true"
            />
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" aria-hidden="true" />
            {/* 双针局主针拖运动残影：两枚延迟启动的淡色指针跟在主针身后（正 delay = 角度滞后; 颜色随锁定数由红转金） */}
            {dual && (
              <span className="pointer-events-none absolute bottom-1/2 left-1/2 -translate-x-1/2" aria-hidden="true">
                <span
                  className={`antenna-spin block h-[60px] w-0.5 origin-bottom rounded-full ${reverse ? "antenna-spin-rev" : ""}`}
                  style={{ animationDelay: "140ms", backgroundColor: ghostA }}
                />
              </span>
            )}
            {dual && (
              <span className="pointer-events-none absolute bottom-1/2 left-1/2 -translate-x-1/2" aria-hidden="true">
                <span
                  className={`antenna-spin block h-[60px] w-0.5 origin-bottom rounded-full ${reverse ? "antenna-spin-rev" : ""}`}
                  style={{ animationDelay: "70ms", backgroundColor: ghostB }}
                />
              </span>
            )}
            <span className="pointer-events-none absolute bottom-1/2 left-1/2 -translate-x-1/2" aria-hidden="true">
              <span className={`antenna-spin block h-[60px] w-0.5 origin-bottom rounded-full bg-destructive shadow ${reverse ? "antenna-spin-rev" : ""}`} />
            </span>
            {dual && (
              <span className="pointer-events-none absolute bottom-1/2 left-1/2 -translate-x-1/2" aria-hidden="true">
                <span className="antenna-spin-2 block h-[52px] w-0.5 origin-bottom rounded-full bg-destructive/45" />
              </span>
            )}
            {[0, 90, 180, 270].map((deg) => (
              <span
                key={deg}
                className="pointer-events-none absolute left-1/2 top-1/2 h-full w-px origin-center bg-border"
                style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) scaleY(0.94)` }}
                aria-hidden="true"
              />
            ))}
          </div>
          <p className="mt-2 text-center text-xs leading-relaxed text-card-foreground">
            {reverse ? (
              <>指向机构卡滞, 主针<b className="text-destructive">反转</b>——扫进<b className="text-primary">高亮扇区</b>时点锁定{dual ? "; 副针是干扰, 目标扇区还会漂移且越锁越快——追着亮区打" : ""}。</>
            ) : (
              <>主针扫进<b className="text-primary">高亮扇区</b>时点锁定——三段全锁接通链路, 锁偏一发即失败{dual ? "。半透明副针是干扰, 目标扇区还会漂移且越锁越快——追着亮区打" : ""}。</>
            )}
          </p>
          {/* 三段锁定进度灯 */}
          <div className="mt-1.5 flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: STAGES }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full border ${
                  i < locked ? "border-primary bg-primary" : "border-primary/40 bg-primary/10"
                }`}
              />
            ))}
            <span className="ml-1 font-mono text-[9px] tracking-widest text-muted-foreground">LOCK {locked}/{STAGES}</span>
          </div>
          <button
            type="button"
            onClick={lock}
            disabled={doneRef.current}
            aria-label={`锁定天线第 ${locked + 1} 段, 指针进入高亮扇区时点击`}
            className="mt-2 w-full rounded-md border border-primary bg-primary/10 px-3 py-2 font-mono text-sm font-bold tracking-widest text-primary shadow-sm transition hover:bg-primary/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
          >
            {locked >= STAGES ? "链路锁定 ✓" : `锁定 LOCK ${locked + 1}/${STAGES}`}
          </button>
        </div>
      </div>
    </div>
  );
}
