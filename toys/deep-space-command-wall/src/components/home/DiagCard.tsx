// 系统诊断快检：记忆序列小游戏——先看系统格按六步灯序闪亮, 再按同样顺序点回去完成全链路巡检。
// 主视口右上 absolute 弹入, primary 描边; 颜色全部 token 类。序列与演示计时全在组件内部, 对/错经 onDone 上报。
import { useEffect, useRef, useState } from "react";
import { Stethoscope } from "lucide-react";

interface DiagCardProps {
  /** 剩余响应秒数（超时由 useHome 收卡） */
  remainS: number;
  /** 假灯干扰概率（0-1, 随玩家满序次数由 useHome 递增下发, 缺省 0.35） */
  decoyRate?: number;
  /** 老手提示：满序 ≥2 次后明示「真灯带辉光」彩蛋（新手不显示, 留给自己发现） */
  hintGlow?: boolean;
  /** 盲灯极速模式：八步灯序 + 演示倍速, 奖励翻倍（useHome 按满序次数概率触发） */
  extreme?: boolean;
  /** 诊断结束回调: true = 灯序全对, false = 点错顺序 */
  onDone: (ok: boolean) => void;
}

const CELLS = [
  { label: "COMM", name: "通信" },
  { label: "PWR", name: "电源" },
  { label: "THML", name: "热控" },
  { label: "NAVG", name: "导航" },
];

export function DiagCard({ remainS, decoyRate, hintGlow, extreme, onDone }: DiagCardProps) {
  // 盲灯极速模式：八步灯序 + 演示倍速（240ms/110ms）, 奖励翻倍——满序 3 次以上的老手 30% 概率触发
  const FLASH_MS = extreme ? 240 : 480;
  const GAP_MS = extreme ? 110 : 220;
  const SEQ_LEN = extreme ? 8 : 6;
  const [seq] = useState(() => Array.from({ length: SEQ_LEN }, () => Math.floor(Math.random() * 4)));
  const [phase, setPhase] = useState<"demo" | "input">("demo");
  const [litIdx, setLitIdx] = useState(-1);
  // 干扰假灯：演示期随机格以「正式灯同款样式」短促闪现 150ms——混进灯序里, 唯一破绽是亮得短（正式灯 480ms）
  const [decoyIdx, setDecoyIdx] = useState(-1);
  const [step, setStep] = useState(0);
  const doneRef = useRef(false);
  const seqRef = useRef(seq);
  const stepRef = useRef(0);

  // 演示阶段：逐格闪灯（夹杂假灯干扰闪烁）, 放完自动进入输入阶段
  useEffect(() => {
    const timers: number[] = [];
    seq.forEach((cell, i) => {
      timers.push(window.setTimeout(() => setLitIdx(cell), i * (FLASH_MS + GAP_MS)));
      timers.push(window.setTimeout(() => setLitIdx(-1), i * (FLASH_MS + GAP_MS) + FLASH_MS));
    });
    const demoEnd = seq.length * (FLASH_MS + GAP_MS) + 240;
    timers.push(window.setTimeout(() => setPhase("input"), demoEnd));
    // 干扰假灯：每 600ms 按 decoyRate 概率随机一格同款样式闪现 150ms（不入序列; 靠亮灯时长区分真假——概率随玩家满序次数递增）
    const rate = decoyRate ?? 0.35;
    const decoyIv = window.setInterval(() => {
      if (Math.random() < rate) {
        const d = Math.floor(Math.random() * CELLS.length);
        setDecoyIdx(d);
        window.setTimeout(() => setDecoyIdx((cur) => (cur === d ? -1 : cur)), 150);
      }
    }, 600);
    const stopDecoy = window.setTimeout(() => window.clearInterval(decoyIv), demoEnd);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.clearInterval(decoyIv);
      window.clearTimeout(stopDecoy);
    };
  }, [seq]);

  const tap = (idx: number) => {
    if (doneRef.current || phase !== "input") return;
    if (idx === seqRef.current[stepRef.current]) {
      setLitIdx(idx);
      window.setTimeout(() => setLitIdx((cur) => (cur === idx ? -1 : cur)), 160);
      stepRef.current += 1;
      setStep(stepRef.current);
      if (stepRef.current >= seqRef.current.length) {
        doneRef.current = true;
        onDone(true);
      }
    } else {
      doneRef.current = true;
      onDone(false);
    }
  };

  return (
    <div className="pointer-events-auto absolute right-4 top-14 z-40 w-60 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="overflow-hidden rounded-lg border-2 border-primary/60 bg-card/95 shadow-xl backdrop-blur" role="dialog" aria-label="系统诊断快检">
        <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-1.5">
          <Stethoscope className="h-4 w-4 shrink-0 animate-pulse text-primary" aria-hidden="true" />
          <p className="font-display text-xs font-bold text-primary">
            系统诊断快检{extreme ? " · 盲灯极速" : ""}
          </p>
          <span className="ml-auto rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-primary">
            T-{remainS}s
          </span>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs leading-relaxed text-card-foreground">
            {phase === "demo" ? (
              <>系统格将按<b className="text-primary">{extreme ? "八步灯序加倍速" : "六步灯序"}</b>依次闪亮——记住顺序, 随后照序点回。
              <b className="text-destructive">假灯会混在其中</b>: 真灯亮得久, 假灯一闪而过{hintGlow ? <>（老手提示: <b className="text-primary">真灯带辉光</b>, 假灯不发）</> : null}。</>
            ) : (
              <>按闪灯顺序点击系统格 <b className="text-primary">{step}/{SEQ_LEN}</b>——全对完成全链路巡检。</>
            )}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {CELLS.map((c, i) => (
              <button
                key={c.label}
                type="button"
                onClick={() => tap(i)}
                disabled={phase !== "input" || doneRef.current}
                aria-label={`系统格 ${c.name} ${c.label}`}
                className={`rounded-md border font-mono text-xs font-bold tracking-widest transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                  litIdx === i
                    ? "border-primary bg-primary text-primary-foreground shadow-md"
                    : decoyIdx === i
                      ? // 彩蛋：假灯与真灯同色, 但不带辉光且暗半档——观察力强的值班员能靠这个秒辨真假
                        "border-primary bg-primary/90 text-primary-foreground"
                      : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 active:scale-95"
                }`}
              >
                {c.label}
                <span className="ml-1 text-[9px] opacity-70">{c.name}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-center font-mono text-[9px] tracking-widest text-muted-foreground">
            {phase === "demo" ? "DEMO · 灯序演示中 · 小心假灯" : "INPUT · 照序复点"}
          </p>
        </div>
      </div>
    </div>
  );
}
