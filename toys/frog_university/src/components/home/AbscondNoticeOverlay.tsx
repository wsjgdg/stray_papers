/**
 * 标题画面 · 不告而别说明（批次 CN「不告而别」）
 * 没有退出只有申请离校——直接关掉页面，也算一次离校（未办手续）。
 * 它不怪你，它只是记录：攒到第三次，开学弹一张《离校情况说明》。
 * 三种选择：补一张表（销记录）/ 下不为例（它不信，但照收）/ 「毕业了不算离校」（狡辩——核为不实）。
 */
import { useState } from "react";
import { FileWarning } from "lucide-react";
import { RichText } from "@/components/common/RichText";

interface AbscondNoticeOverlayProps {
  /** 未办手续离校的次数 */
  count: number;
  /** 选择（落档在标题侧） */
  onRespond: (response: "settle" | "promise" | "claim") => void;
  /** 收下 */
  onClose: () => void;
}

const OUTCOMES: Record<"settle" | "promise" | "claim", { title: string; body: string; filing: string }> = {
  settle: {
    title: "补一张表",
    body:
      "你把《离校情况说明》填了：事由一栏写「忘了」。窗口的蛙把表收进去，在你的档案上盖了一枚章，然后把「离校，未办手续」那几行划掉了——划掉不等于没有，但至少这一页翻过去了。",
    filing: "手续办了，记录撤了。下次关窗口之前，记得先走申请离校——行政规定第八条。",
  },
  promise: {
    title: "下不为例",
    body:
      "「下次会办的。」你说。窗口的蛙点了点头，没有翻你的档案——它不需要翻。它见过太多只说「下次」的蛙。它把这次的记录照收，往档案最底下压了压。",
    filing: "档案照收。「下次」是它收到的理由里最常见的一种——不受理，也不驳回，就压在最底下。",
  },
  claim: {
    title: "「毕业了不算离校」",
    body:
      "你说你上学期毕业了，毕业不算离校。窗口的蛙翻了翻名册，抬起头：「该蛙在册。」它把这句回答原样抄了进去，然后盖了章。",
    filing: "档案照写：该蛙称其离校属毕业，核为不实。狡辩也是记录的一部分——记录不挑好听的话。",
  },
};

export function AbscondNoticeOverlay({ count, onRespond, onClose }: AbscondNoticeOverlayProps) {
  const [stage, setStage] = useState<"notice" | "outcome" | "done">("notice");
  const [choice, setChoice] = useState<"settle" | "promise" | "claim" | null>(null);

  return (
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="离校情况说明"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileWarning size={13} aria-hidden />
            行政事务
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-widest text-card-foreground">
            {stage === "notice" ? "离校情况说明" : stage === "outcome" ? (choice === "settle" ? "已补办" : choice === "promise" ? "照收" : "核为不实") : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            累计 {count} 次 · 未办手续
          </p>

          {stage === "notice" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                「上学期你没有办手续。」开学第一天，行政楼的蛙在门口等你。不是批评——它手里拿着你的档案，
                档案上多了 {count} 行「离校，未办手续」。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                每一次你直接关掉页面，它都记一笔。它不怪你——它只是记录。记录不需要你同意，也不需要你在场。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("outcome")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  说明情况
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种说法。没有正确的——只有档案收下哪一种。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("settle");
                    onRespond("settle");
                    setStage("done");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">补一张表</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    事由写「忘了」，盖章，记录撤了。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("promise");
                    onRespond("promise");
                    setStage("done");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">下不为例</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    「下次会办的。」它点头，照收，压在最底下。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("claim");
                    onRespond("claim");
                    setStage("done");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">「毕业了不算离校」</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    它翻了名册：「该蛙在册。」原样抄进去，盖章。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "done" && choice !== null && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={OUTCOMES[choice].filing} />
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
