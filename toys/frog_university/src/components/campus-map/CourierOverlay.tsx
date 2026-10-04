/**
 * 校园地图 · 递件（批次 CB「递件」）
 * 加入没有免费的——团体要你办的第一件事，是替它把一份表交上去。
 * 被反映人一栏写着 036。事由一栏写的是你自己。
 * 落点：署名的不是你，经手的是你——档案里每一行「经手」都记在你名下。
 */
import { useState } from "react";
import { Inbox } from "lucide-react";
import { clsx } from "clsx";
import { REPORT_STUDENT_ID } from "@/lib/gameSave";
import type { CourierScript } from "@/data/couriers";
import type { CourierFact } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface CourierOverlayProps {
  /** 哪个团体托的 */
  script: CourierScript;
  /** 受托发生在第几天 */
  day: number;
  /** 是不是第二次受托（递过一次之后，它说话就顺了） */
  repeat: boolean;
  /** 那张表写的你自己——事由与出处 */
  fact: CourierFact;
  /** 递上去 / 压下去（落档在地图侧；浮层留在原地展示回执） */
  onDecide: (verdict: "delivered" | "held") => void;
  /** 收下 */
  onClose: () => void;
}

const STEP_TITLES = ["受托", "表格", "窗口前", "回执"];

export function CourierOverlay({ script, day, repeat, fact, onDecide, onClose }: CourierOverlayProps) {
  const [step, setStep] = useState(0);
  const [decided, setDecided] = useState<"delivered" | "held" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="递件"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Inbox size={13} aria-hidden />
            《{script.formName}》· 递件
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {STEP_TITLES[step] ?? "受托"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {step + 1}/{STEP_TITLES.length} 步 · 第 {day} 天
          </p>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                {repeat ? script.askRepeat : script.ask}
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                加入没有免费的。它们做过的事你都在场——现在轮到一件需要你的手的事。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  接过来
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  《{script.formName}》
                </p>
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  被反映人：<span className="font-bold text-primary">{REPORT_STUDENT_ID}</span>（你）
                </p>
                <p className="mt-1 text-sm leading-relaxed text-card-foreground">事由：{fact.text}</p>
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  署名：（空白）· 经手：（空白）
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                事由那一栏已经填好了——写的是你自己。这一行来自「{fact.from}」。写它的是谁，表上没写；写的是不是真的，表上也不用你核。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你看了一遍就合上了——不看第二遍，是因为第一遍已经够了。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  到窗口了
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={script.atWindow} />
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                递上去：经手是你，档案记你一笔——它记下了（好感 +4），办事利落也记你一笔（表演分 +2）。
                <br />
                压下去：私扣不在流程里，没有一栏收它——但它记住了（好感 −6），你藏了一件东西（沉默 +2）。
              </p>
              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDecided("held");
                    onDecide("held");
                    setStep(3);
                  }}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  压下去
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDecided("delivered");
                    onDecide("delivered");
                    setStep(3);
                  }}
                  className={clsx(
                    "rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none",
                  )}
                >
                  递上去
                </button>
              </div>
            </>
          )}

          {step === 3 && decided !== null && (
            <>
              <p className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed text-card-foreground">
                {decided === "delivered" ? script.deliveredNote : script.heldNote}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                {decided === "delivered" ? script.replyDelivered : script.replyHeld}
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                {decided === "delivered"
                  ? "档案照写：该蛙经手《情况反映》一份（被反映人：本人）。"
                  : "档案照写：该蛙经手未交。私扣不在流程里——但经手在。"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                署名的不是你，经手的是你。档案里的每一行「经手」，都记在你名下——你替它们扛的第一件，写的是你自己。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
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
