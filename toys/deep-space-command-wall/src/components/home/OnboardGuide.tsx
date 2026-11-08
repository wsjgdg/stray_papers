// 新手引导（批次 P-8）：首次进场自动弹出的七步卡片式导览——从选任务、点火起飞、
// 迁跃跳阶段、手动着陆到巡视车作业、事件/结算/重新部署与值班配乐，一遍讲清核心玩法。
// 已读状态经 localStorage（键 dsc-onboarded）记忆不再自动弹; 顶栏「?」按钮随时重开。
// ESC / 跳过 / 完成任一动作都算已读。
// 区域高亮（批次 Q）：每步可带 target 选择器——命中元素时发光框圈出对应区域,
// 卡片自动移到底部让位; 目标当前不可见（如待机时的巡视车面板）则优雅降级为无高亮居中卡片。
// 颜色全部 token 类。
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, ChevronRight, ClipboardCheck, Disc3, Gamepad2, HelpCircle, Orbit, Rocket, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OnboardStep {
  icon: LucideIcon;
  title: string;
  en: string;
  body: string;
  /** 对应区域的 CSS 选择器（逗号列表按文档序取第一个命中; 缺省或找不到 = 不高亮） */
  target?: string;
}

const STEPS: OnboardStep[] = [
  {
    icon: Rocket,
    title: "欢迎, 值班指挥官",
    en: "BRIEFING 1/7 · WELCOME",
    body: "这里是深空指挥墙——你将执掌五个天体任务的全程飞行: 点火起飞、级段分离、轨道转移、制动下降, 直至软着陆与表面作业。",
  },
  {
    icon: Orbit,
    title: "选一颗天体出击",
    en: "BRIEFING 2/7 · MISSION",
    body: "顶栏任务下拉可在月球、火星、木卫二、金星、土卫六之间切换。每颗天体都有专属着陆区、表面事件与着陆配乐。",
    target: '[aria-label="任务切换"]',
  },
  {
    icon: Gamepad2,
    title: "点火与迁跃",
    en: "BRIEFING 3/7 · FLIGHT",
    body: "开机自检通过后掀开点火按钮安全盖即可起飞。想快进流程时, 点击飞行阶段链上的空闲节点就能迁跃直达该阶段, 带全屏过场动画。",
    target: '[aria-label="飞行阶段链"], [aria-label="主视口"]',
  },
  {
    icon: HelpCircle,
    title: "手动着陆挑战",
    en: "BRIEFING 4/7 · TOUCHDOWN",
    body: "动力下降段可选手动接管: 油门 + 横推对抗重力与侧风, 触地按落点精度评 S–D 级; 不接管则由自动驾驶完成着陆。",
    target: '[aria-label="主视口"]',
  },
  {
    icon: Bot,
    title: "巡视车表面作业",
    en: "BRIEFING 5/7 · ROVER",
    body: "触地后放出巡视车: 驾驶钻取 3 份样品、送分析舱化验出 3 份报告。主线目标面板常驻显示当前该干什么与完成进度。",
    target: '[aria-label="主线目标"], [aria-label$="巡视车遥控"]',
  },
  {
    icon: ClipboardCheck,
    title: "事件 · 结算 · 重新部署",
    en: "BRIEFING 6/7 · SURFACE OPS",
    body: "着陆后可在表面作业链触发天体事件（陨石雨、沙尘暴这类）, 随时出具任务结算单; 点「重新部署」归档本场出击, 即可切换下一颗天体。",
    target: '[aria-label="表面作业链"], [aria-label="主视口"]',
  },
  {
    icon: Disc3,
    title: "值班玩法与配乐",
    en: "BRIEFING 7/7 · DUTY & MUSIC",
    body: "右栏会随时弹出值班指令、中继握手等限时小游戏, 完成赚功勋升军衔。每个阶段都有专属配乐, 顶栏音频面板里的「配乐名目」可试听全部曲目。",
    target: '[aria-label="值班指令面板"], [aria-label="音频设置"]',
  },
];

interface OnboardGuideProps {
  open: boolean;
  /** 关闭即记为已读（跳过 / 完成 / ESC 同效） */
  onClose: () => void;
}

export function OnboardGuide({ open, onClose }: OnboardGuideProps) {
  const [stepIdx, setStepIdx] = useState(0);
  // 当前步骤目标区域的视口矩形（null = 无 target 或目标当前不可见, 降级为居中卡片无高亮）
  const [spot, setSpot] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  // 箭头指引线（批次 R）：卡片 → 高亮框的虚线箭头（tip = 指向高亮框一端; 两者重叠时不画）
  const [arrow, setArrow] = useState<{ tipX: number; tipY: number; baseX: number; baseY: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 每次打开都回到第一步
  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open]);

  // 测量目标区域与箭头端点：步骤切换 / 窗口缩放时重测; 定时重测跟踪布局变化（面板展开、卡片高度变化等）
  const spotRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null);
  const arrowRef = useRef<{ tipX: number; tipY: number; baseX: number; baseY: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      spotRef.current = null;
      arrowRef.current = null;
      setSpot(null);
      setArrow(null);
      return;
    }
    const near = (a: number, b: number) => Math.abs(a - b) < 1;
    const measure = () => {
      const sel = STEPS[stepIdx].target;
      const el = sel ? document.querySelector(sel) : null;
      const r = el?.getBoundingClientRect();
      const nextSpot =
        r && (r.width >= 4 || r.height >= 4)
          ? { top: r.top, left: r.left, width: r.width, height: r.height }
          : null;
      const prevSpot = spotRef.current;
      const spotSame =
        nextSpot === prevSpot ||
        (nextSpot !== null &&
          prevSpot !== null &&
          near(nextSpot.top, prevSpot.top) &&
          near(nextSpot.left, prevSpot.left) &&
          near(nextSpot.width, prevSpot.width) &&
          near(nextSpot.height, prevSpot.height));
      if (!spotSame) {
        spotRef.current = nextSpot;
        setSpot(nextSpot); // 几乎重合就不产生新对象, 避免定时重测造成无谓渲染
      }
      // 箭头端点：高亮框在卡片上方 → 从卡片顶边中点指到框底边; 在下方则反之; 太近或重叠不画
      let nextArrow: { tipX: number; tipY: number; baseX: number; baseY: number } | null = null;
      const card = cardRef.current?.getBoundingClientRect();
      if (nextSpot && card) {
        const sCy = nextSpot.top + nextSpot.height / 2;
        const cCy = card.top + card.height / 2;
        const above = sCy < cCy;
        const tipX = nextSpot.left + nextSpot.width / 2;
        const tipY = above ? nextSpot.top + nextSpot.height + 4 : nextSpot.top - 4;
        const baseX = card.left + card.width / 2;
        const baseY = above ? card.top - 6 : card.top + card.height + 6;
        if (Math.hypot(tipX - baseX, tipY - baseY) >= 24) nextArrow = { tipX, tipY, baseX, baseY };
      }
      const prevArrow = arrowRef.current;
      const arrowSame =
        nextArrow === prevArrow ||
        (nextArrow !== null &&
          prevArrow !== null &&
          near(nextArrow.tipX, prevArrow.tipX) &&
          near(nextArrow.tipY, prevArrow.tipY) &&
          near(nextArrow.baseX, prevArrow.baseX) &&
          near(nextArrow.baseY, prevArrow.baseY));
      if (!arrowSame) {
        arrowRef.current = nextArrow;
        setArrow(nextArrow);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    const timer = window.setInterval(measure, 800);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(timer);
    };
  }, [open, stepIdx]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // 拦截, 不透传全局关闭链
        onClose();
      } else if (e.key === "ArrowRight" && stepIdx < STEPS.length - 1) {
        setStepIdx((i) => i + 1);
      } else if (e.key === "ArrowLeft" && stepIdx > 0) {
        setStepIdx((i) => i - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, stepIdx, onClose]);

  if (!open) return null;

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const StepIcon = step.icon;

  return (
    <div
      className={`fixed inset-0 z-[85] flex justify-center bg-background/85 p-4 backdrop-blur-sm animate-in fade-in duration-200 ${
        spot ? "items-end pb-5" : "items-center"
      }`}
      onClick={onClose}
      role="presentation"
    >
      {/* 箭头指引线（批次 R）：卡片 → 高亮框的流动虚线箭头（纯视觉, 不挡点击） */}
      {arrow && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <marker id="ob-arrow-head" markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" style={{ fill: "hsl(var(--primary))" }} />
            </marker>
          </defs>
          <line
            x1={arrow.baseX}
            y1={arrow.baseY}
            x2={arrow.tipX}
            y2={arrow.tipY}
            strokeWidth={1.5}
            strokeDasharray="6 5"
            markerEnd="url(#ob-arrow-head)"
            style={{ stroke: "hsl(var(--primary) / 0.75)" }}
          >
            <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1.2s" repeatCount="indefinite" />
          </line>
        </svg>
      )}
      {/* 目标区域高亮框：呼吸辉光描出当前步骤对应的界面区域（纯视觉, 不挡点击） */}
      {spot && (
        <div
          className="phase-node-glow pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-300"
          style={{ top: spot.top - 6, left: spot.left - 6, width: spot.width + 12, height: spot.height + 12 }}
          aria-hidden="true"
        />
      )}
      <div ref={cardRef} className="flex w-full max-w-md flex-col items-center">
        {spot && (
          <p className="mb-2 animate-pulse font-mono text-[10px] tracking-widest text-primary">▲ 发光框即对应区域</p>
        )}
        <div
          className="w-full overflow-hidden rounded-lg border-2 border-primary/40 bg-card shadow-xl animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="新手引导"
        >
        {/* 头部：引导标识 + 关闭 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.3em] text-primary">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            新手引导 · ONBOARDING
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭新手引导"
            className="rounded-sm p-1 text-muted-foreground transition hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* 步骤正文 */}
        <div key={stepIdx} className="px-6 py-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-md">
            <StepIcon className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">{step.en}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-card-foreground">{step.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        </div>

        {/* 进度点 */}
        <div className="flex items-center justify-center gap-1.5 px-6 pb-4" aria-hidden="true">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setStepIdx(i)}
              aria-label={`跳到第 ${i + 1} 步`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIdx ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-primary/50"
              }`}
            />
          ))}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="font-mono text-xs text-muted-foreground focus-visible:shadow-focus">
            跳过引导
          </Button>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStepIdx((i) => i - 1)} className="border-border font-mono focus-visible:shadow-focus">
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                上一步
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={onClose} className="bg-primary font-mono font-bold text-primary-foreground hover:bg-primary/90 focus-visible:shadow-focus">
                开始值班
                <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStepIdx((i) => i + 1)} className="bg-primary font-mono font-bold text-primary-foreground hover:bg-primary/90 focus-visible:shadow-focus">
                下一步
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
