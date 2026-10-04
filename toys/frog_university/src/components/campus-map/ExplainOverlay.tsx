/**
 * 校园地图 · 补录（批次 BW「补录」）
 * 未经申请的调阅要补一份《情况说明》——制度不追问内容，只核对有这份说明。
 * 落点：制度不追问内容，只收下你写的那一行；以前你档案里的每一页都是别人写的，
 * 这一页不一样——事由那一栏，字是你的。
 */
import { useState } from "react";
import { FileText } from "lucide-react";
import { clsx } from "clsx";
import type { ExplainRecord } from "@/lib/gameSave";

/** 四支事由的文案与口径（照深夜选项同一套：沉默 ±1 / ±0，≤0 收进真话罐） */
const SUBJECTS: Array<{
  mode: ExplainRecord["mode"];
  text: string;
  silenceDelta: number;
  /** 表演选择（识时务）与真话出口（逆着演）的角标文案 */
  sub: string;
}> = [
  {
    mode: "routine",
    text: "例行查看。",
    silenceDelta: 2,
    sub: "识时务的选择",
  },
  {
    mode: "unclear",
    text: "记不清了。",
    silenceDelta: 1,
    sub: "识时务的选择",
  },
  {
    mode: "confess",
    text: "我看见了不该看的。",
    silenceDelta: -1,
    sub: "逆着演的选择",
  },
  {
    mode: "confess-all",
    text: "把翻了什么也说清楚。",
    silenceDelta: -2,
    sub: "逆着演的选择",
  },
];

function deltaMeta(delta: number) {
  if (delta > 0) {
    return { label: `沉默 +${delta}`, sub: "识时务的选择", chip: "bg-primary/10 text-primary" };
  }
  if (delta === 0) {
    return { label: "沉默 ±0", sub: "真心话出口 · 这句会收进罐子", chip: "bg-muted text-muted-foreground" };
  }
  return { label: `沉默 ${delta}`, sub: "逆着演的选择", chip: "bg-secondary text-secondary-foreground" };
}

interface ExplainOverlayProps {
  /** 补录发生在第几天（登记行用） */
  day: number;
  /** 说明送达通知上的具体时刻（分钟，种子派生） */
  minute: number;
  /** 补录完成（落档 + 数值 + 收浮层） */
  onAck: (mode: ExplainRecord["mode"], subject: string) => void;
}

export function ExplainOverlay({ day, minute, onAck }: ExplainOverlayProps) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<(typeof SUBJECTS)[number] | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="补录说明"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileText size={13} aria-hidden />
            学工办 · 补录
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "通知" : step === 1 ? "表格" : step === 2 ? "事由" : "落档"}
          </h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                通知条下来了。落款不是档案室，是学工办：未经申请的调阅被记录在案，请补交《档案调阅情况说明》一份。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                没有批评。没有处分。表格随通知条一起来的，三个章一个没少。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你原来以为门后面有别的。门后面是文件。一排一排的柜子，每排贴着编号——编号比你知道的蛙多。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                表格随通知条一起来的，三个章一个没少。时间一栏已经填好，空着的只有下面那一行。
              </p>
              <div className="mt-3 rounded-xl border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
                时间：第 {day} 天 {String(minute).padStart(2, "0")} 分。
                事由：空白。
                后果：空白。
              </div>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                空着的那两栏只留给本人填——制度不追问内容，只核对有这份说明。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="anim-fade-up flex flex-col items-center gap-3 py-1">
              <p className="rounded-full bg-muted px-4 py-1.5 text-sm font-bold text-card-foreground">
                ——事由那一栏，怎么写？
              </p>
              {SUBJECTS.map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => {
                    setPicked(item);
                    setStep(3);
                  }}
                  className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="block text-base font-bold leading-relaxed text-card-foreground">
                    {item.text}
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        deltaMeta(item.silenceDelta).chip,
                      )}
                    >
                      {deltaMeta(item.silenceDelta).label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {deltaMeta(item.silenceDelta).sub}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 3 && picked && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                说明交上去了。柜台把它订进你的卷宗，编号顺延——制度不追问内容，只核对有这份说明。
              </p>
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
                {picked.mode === "routine"
                  ? "事由栏填「例行」。柜台看都没看就收下了——这行字它收得比谁都熟。"
                  : picked.mode === "unclear"
                    ? "事由栏记「不详」。不详也是一栏——栏目只收有没有，不收是什么。"
                    : picked.mode === "confess"
                      ? "事由栏照录。柜子合上的时候声音很轻——像这间屋子一直就是这个声音。"
                      : "事由栏全录。柜台没看内容，只核对有这份说明——内容不核对，只核对有这份说明。"}
              </div>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                以前你档案里的每一页都是别人写的——学工办写你的评语，宿舍写你的作息，图书馆写你的时长。
                这一页不一样：事由那一栏，字是你的。制度没有问你为什么，它只收下你写的那一行，装订，归档。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAck(picked.mode, picked.text)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  交上去
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
