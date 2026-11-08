/**
 * 校园地图 · 归档（批次 BY「归档」）
 * 说明装订成卷——封卷、铅封、编号、入柜。说明的最后一站。
 * 落点：归档不是结束，是说明换了一种存放方式——柜子不问你写了什么，只问封条颜色和编号对不对得上。
 */
import { useState } from "react";
import { FolderLock } from "lucide-react";

interface SealOverlayProps {
  /** 归档发生在第几天 */
  day: number;
  /** 卷号（学期内递增） */
  volume: number;
  /** 封条颜色（种子派生，同一颗种子同一色） */
  seal: string;
  /** 归档完成（落档 + 收浮层） */
  onAck: () => void;
}

/** 四步流程：封卷 → 铅封 → 编号 → 入柜 */
const STEPS = ["封卷", "铅封", "编号", "入柜"];

export function SealOverlay({ day, volume, seal, onAck }: SealOverlayProps) {
  const [step, setStep] = useState(0);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="归档"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FolderLock size={13} aria-hidden />
            学工办 · 归档
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">{STEPS[step] ?? "封卷"}</h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {STEPS.indexOf(STEPS[step] ?? "封卷") + 1}/4 步 · 第 {day} 天
          </p>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                说明装订成卷了。和它一起装进去的还有：通知条、传阅单、各部门的评语——原来它们不是散件，是一卷的不同页。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                卷脊上贴了标签。标签上没有名字，只有学期号和编号——名字不参与检索。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                装订成卷不是结束，是换一种存放方式：从一张纸变成一册卷，从你手里挪进柜子里。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  铅封
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                封条贴上去了，颜色是{seal}色的。三个章一个没少——制度不核对内容，只核对封条颜色和编号对不对得上。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                铅封之后，这份卷就不再打开了。「不打开」也是它的一部分——比内容还结实的那部分。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你在事由栏写的那一行，现在在{seal}色的封条底下。没人会再读它，包括盖了章的那些。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  编号
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                编号打上了：本学期第 {volume} 卷。编号顺延——上一卷是几，这一卷就是几加一，柜子不问内容。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                编号之间没有关系。柜子里的每份卷都有编号，编号不参与检索——检索要查内容，查内容要先开卷，开卷要先承认铅封可以被打开。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你那行字从此有了编号。有编号的东西都算在册——在册的意思是：它存在，它不被阅读。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  入柜
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                卷塞进了柜子，柜门合上。这一栏从此不归你管——它归柜子管，柜子归制度管，制度不问内容。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                说明的最后一站是这里。从通知条到卷脊标签，一共走了三站，每一站都只有一个章。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                归档不是结束——是说明换了一种存放方式。柜子不问你写了什么，只问封条颜色和编号对不对得上。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onAck}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
