// 中继握手请求卡：随机弹出的限时长按交互——按住按钮 2 秒完成握手链路校准, 赚功勋。
// 干扰模式（40% 概率）: 链路噪声导致进度更快回落 + 随机强干扰脉冲 + 按钮抖动, 完成奖励更高。
// 挂在主视口左上（absolute）, primary 描边; 颜色全部 token 类。
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Radio } from "lucide-react";

interface HandshakeCardProps {
  /** 剩余响应秒数 */
  remainS: number;
  /** 响应总时长（倒计时条比例用） */
  totalS: number;
  /** 信号干扰模式：进度快速回落 + 随机强干扰脉冲 + 按钮抖动（完成 +30 功勋） */
  interference?: boolean;
  /** 长按满 2 秒回调（useHome 发功勋并收卡） */
  onDone: () => void;
}

const HOLD_MS = 2000;

export function HandshakeCard({ remainS, totalS, interference, onDone }: HandshakeCardProps) {
  const [held, setHeld] = useState(0);
  const holdingRef = useRef(false);
  const doneRef = useRef(false);
  // 突然静默陷阱（干扰局专属）：按住时小概率链路骤然安静 1.5s——静默期不出脉冲（波形压平）,
  // 但静默结束瞬间必有干扰爆发回马枪砸掉一大截进度; 真值走 ref, state 只作渲染镜像
  const silentRef = useRef(false);
  const silenceUntilRef = useRef(0);
  const [silent, setSilent] = useState(false);

  // 长按进度推进（50ms 步进; 松开回落——干扰模式回落更快, 且每步 4% 概率强干扰脉冲砸掉一大截; 随机判定放回调体内不放 updater）
  useEffect(() => {
    const jam = interference ?? false;
    const timer = window.setInterval(() => {
      if (jam) {
        const now = performance.now();
        if (silentRef.current) {
          if (now >= silenceUntilRef.current) {
            // 静默结束：干扰爆发回马枪, 必砸掉一大截进度
            silentRef.current = false;
            setSilent(false);
            setHeld((h) => Math.max(0, h - 700));
          }
        } else if (holdingRef.current && now >= silenceUntilRef.current && Math.random() < 0.012) {
          silenceUntilRef.current = now + 1500;
          silentRef.current = true;
          setSilent(true);
        }
      }
      if (holdingRef.current) {
        if (jam && !silentRef.current && Math.random() < 0.04) setHeld((h) => Math.max(0, h - 450));
        else setHeld((h) => Math.min(HOLD_MS, h + 50));
      } else {
        setHeld((h) => (h > 0 ? Math.max(0, h - (jam ? 220 : 90)) : 0));
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [interference]);

  // 进度满即完成（副作用不放 updater 里）
  useEffect(() => {
    if (held >= HOLD_MS && !doneRef.current) {
      doneRef.current = true;
      holdingRef.current = false;
      onDone();
    }
  }, [held, onDone]);

  const pct = Math.min(100, (held / HOLD_MS) * 100);
  // 噪声波形振幅随长按进度压低：进度越满, 链路噪声越弱（0.3 封顶不清零）; 静默期波形压平到 0.08
  const jamLvl = silent ? 0.08 : Math.max(0.3, 1 - (pct / 100) * 0.7);
  return (
    <div className="pointer-events-auto absolute left-4 top-14 z-40 w-64 animate-in fade-in slide-in-from-top-4 duration-300">
      <div
        className={`overflow-hidden rounded-lg border-2 bg-card/95 shadow-xl backdrop-blur ${
          interference ? "border-destructive/70" : "border-primary/60"
        }`}
        role="dialog"
        aria-label="中继握手请求"
      >
        <div
          className={`flex items-center gap-2 border-b px-3 py-1.5 ${
            interference ? "border-destructive/30 bg-destructive/10" : "border-primary/30 bg-primary/10"
          }`}
        >
          <Radio
            className={`h-4 w-4 shrink-0 animate-pulse ${interference ? "text-destructive" : held > 0 ? "text-primary" : "text-primary"}`}
            aria-hidden="true"
          />
          <p className={`font-display text-xs font-bold ${interference ? "text-destructive" : "text-primary"}`}>
            {interference ? "中继握手 · 信号干扰" : "中继握手请求"}
          </p>
          <span
            className={`ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
              interference ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-primary/50 bg-primary/10 text-primary"
            }`}
          >
            T-{remainS}s
          </span>
        </div>
        <div className="px-3 py-2.5">
          {interference && (
            <>
              <p className="countdown-urgent mb-1 rounded-sm border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-center font-mono text-[10px] font-bold tracking-widest text-destructive">
                {silent ? "SILENCE · 链路突然安静… · 当心回马枪" : "SIGNAL JAMMING · 链路噪声 · 进度会被打回"}
              </p>
              {/* 噪声波形可视化：一排错峰跳动的竖条, 振幅随长按进度实时压低——进度越满噪声越弱 */}
              <div
                className="mb-1.5 flex h-5 items-center justify-center gap-[3px]"
                style={{ "--jam-lvl": jamLvl } as CSSProperties}
                aria-hidden="true"
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className="jam-wave-bar" />
                ))}
              </div>
            </>
          )}
          <p className="text-xs leading-relaxed text-card-foreground">
            {interference ? (
              <>
                中继链路正被噪声干扰——<b className="text-destructive">按住下方按钮 2 秒</b>顶住干扰完成握手（进度越满, 噪声波形越弱;
                链路可能突然安静——那是爆发回马枪前的宁静, 别松手）, 校准成功 <b className="text-primary">+30 功勋</b>。
              </>
            ) : (
              <>
                中继星请求手动链路校准——<b className="text-primary">按住下方按钮 2 秒</b>完成握手, 校准成功 +20 功勋。
              </>
            )}
          </p>
          <button
            type="button"
            aria-label={interference ? "按住顶住干扰完成中继握手" : "按住完成中继握手"}
            onPointerDown={(e) => {
              e.preventDefault();
              // 捕获指针：干扰抖动时按钮移动也不会丢长按
              e.currentTarget.setPointerCapture(e.pointerId);
              holdingRef.current = true;
            }}
            onPointerUp={() => {
              holdingRef.current = false;
            }}
            onPointerLeave={() => {
              holdingRef.current = false;
            }}
            onPointerCancel={() => {
              holdingRef.current = false;
            }}
            className={`relative mt-2 w-full select-none overflow-hidden rounded-md border px-3 py-2.5 font-mono text-sm font-bold tracking-widest shadow-sm transition hover:bg-primary/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
              interference
                ? "jam-shake border-destructive bg-destructive/10 text-destructive"
                : "border-primary bg-primary/10 text-primary"
            }`}
          >
            <span
              className={`absolute inset-y-0 left-0 transition-[width] duration-75 ${interference ? "bg-destructive/30" : "bg-primary/30"}`}
              style={{ width: `${pct}%` }}
              aria-hidden="true"
            />
            <span className="relative z-10">
              {held >= HOLD_MS ? "握手完成 ✓" : interference ? "顶住干扰 HOLD 2s" : "按住握手 HOLD 2s"}
            </span>
          </button>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${interference ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${Math.max(0, Math.min(100, (remainS / totalS) * 100))}%`, transitionTimingFunction: "linear" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
