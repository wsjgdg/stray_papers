/**
 * 标题画面 · 学籍信息补全表（批次 CO「姓名」）
 * 入学登记时姓名栏留空的，行政楼递一张《学籍信息补全表》——
 * 「有名字的才好被处理。」填了，档案处处带你的名；不填，永远「该蛙未登记姓名」。
 * 补录不受理第二次。
 */
import { useState } from "react";
import { UserRound } from "lucide-react";
import { clsx } from "clsx";
import { persistPlayerDisplayName, REPORT_STUDENT_ID } from "@/lib/gameSave";

interface EnrollmentFixOverlayProps {
  /** 填了（落档 + 全系统带名） */
  onConfirm: (name: string) => void;
  /** 不填（「再看看」——标题页留一行「学籍信息不全」） */
  onClose: () => void;
}

export function EnrollmentFixOverlay({ onConfirm, onClose }: EnrollmentFixOverlayProps) {
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="学籍信息补全表"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <UserRound size={13} aria-hidden />
            学籍信息 · 补全
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-widest text-card-foreground">
            {done ? "已补全" : "学籍信息补全表"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            学号 {REPORT_STUDENT_ID}
          </p>

          {!done ? (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                「学籍信息不全：姓名栏空着。」行政楼的蛙把一张表推出来。「有名字的才好被处理——
                点名要点、成绩单要写、材料要抄。没有名字的，档案上写『该蛙未登记姓名』，一直写下去。」
              </p>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={12}
                aria-label="姓名（最多十二字）"
                placeholder="姓名（可留空，留空就一直是该蛙）"
                className="mt-4 w-full border-b border-dashed border-border bg-transparent px-1 py-2 text-base font-bold text-card-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                补全不受理第二次——填了，这个名字就跟着你到毕业；不填，就一直是「该蛙」。窗口认号，批语认字。你想让哪一边知道你是谁。
              </p>
              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  再看看
                </button>
                <button
                  type="button"
                  onClick={() => {
                    persistPlayerDisplayName(name);
                    setDone(true);
                    onConfirm(name);
                  }}
                  className={clsx(
                    "rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-transform duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                    name.trim().length > 0
                      ? "bg-primary text-primary-foreground hover:scale-105"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name.trim().length > 0 ? "提交" : "留空归档"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                {name.trim().length > 0
                  ? `表收上去了。窗口那栏没抬头——它把你的名字抄进名册的那一格，和学号并排。从这一刻起，档案上每一处「该蛙未登记姓名」都换成了「${name.trim()}」。有名字的才好被处理——你现在好了。`
                  : "你把表交了回去，姓名栏还空着。窗口的蛙看了一眼，在旁边盖了个章：该蛙未登记姓名，已知悉。档案上会一直写「该蛙」——你知道自己是谁，就够了。"}
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
