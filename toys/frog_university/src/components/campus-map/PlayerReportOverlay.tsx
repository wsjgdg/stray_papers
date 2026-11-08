/**
 * 校园地图 · 撰写（批次 BZ「撰写」）
 * 空白档案页：你第一次从被记录的人，变成记录别人的人。
 * 选谁、写什么、提交——不可撤销（报告没有撤回这一栏）。
 * 落点：笔比你想的轻，纸比你想的顺——格式你已经会了，因为它们都记过你。
 */
import { useState } from "react";
import { FilePlus2, FileText, PenLine, Send, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import { REPORT_STUDENT_ID, displayNameOf, loadGameSave, type PlayerReport } from "@/lib/gameSave";
import { REPORT_SUBJECTS, type ReportClaim } from "@/data/playerReports";
import { RichText } from "@/components/common/RichText";

interface PlayerReportOverlayProps {
  /** 写报告发生在第几天 */
  day: number;
  /** 档案柜里已经有的报告（跨学期保留——二周目的柜子里还在） */
  log: PlayerReport[];
  /** 提交（落档 + 数值——口径在 markPlayerReport 内；浮层留在原地展示回执）。
     返回 false = 本学期已收过一份（守卫拦下），浮层直接给出回执，不再停在提交那一步 */
  onSubmit: (frogId: FrogCharacterId, claim: ReportClaim) => boolean;
  /** 收浮层（收下 / 合上） */
  onAck: () => void;
}

const STEP_TITLES = ["空白页", "被写人", "事由", "提交", "回执"];

export function PlayerReportOverlay({ day, log, onSubmit, onAck }: PlayerReportOverlayProps) {
  const [step, setStep] = useState(0);
  const [pickedFrogId, setPickedFrogId] = useState<FrogCharacterId | null>(null);
  const [pickedClaim, setPickedClaim] = useState<ReportClaim | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /** 本学期已收过一份（守卫拦下）：浮层给出回执而不是停在提交那一步 */
  const [rejected, setRejected] = useState(false);

  const subject = pickedFrogId ? REPORT_SUBJECTS.find((item) => item.frogId === pickedFrogId) : undefined;
  /** 你亲手写的那些（经手的递件不算——署名栏不是你，经手才是你） */
  const own = log.filter((item) => item.by !== "courier");
  const carried = log.length - own.length;

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="空白档案页"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FilePlus2 size={13} aria-hidden />
            档案室 · 空白档案页
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {STEP_TITLES[step] ?? "空白页"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {step + 1}/{STEP_TITLES.length} 步 · 第 {day} 天
          </p>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                纸摊在桌上，抬头印好了，标题栏空着，姓名栏空着，事由栏空着。纸的抬头和你的档案抬头，印的是同一批字。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                柜子里别的卷都有编号，这一张没有——空白的东西没有编号，编号是发给有了内容的东西的。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                到今天为止，档案里关于你的每一行都是别人写的。这一张不一样：写下去，你就是写字的那只。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  拿笔
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                姓名栏要填一个名字。这栋楼里有四个名字你有资格写——不是因为你认识它们，是因为你见过它们。
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {REPORT_SUBJECTS.map((item) => (
                  <button
                    key={item.frogId}
                    type="button"
                    onClick={() => setPickedFrogId(item.frogId)}
                    aria-pressed={pickedFrogId === item.frogId}
                    className={clsx(
                      "rounded-xl border p-3 text-left transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                      pickedFrogId === item.frogId
                        ? "border-primary bg-primary/10"
                        : "border-dashed border-border bg-background/60 hover:border-border hover:bg-muted/60",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-bold text-card-foreground">
                      <UserRound size={13} aria-hidden />
                      {item.name}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] tracking-widest text-muted-foreground">
                      {item.place}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                它不知道自己会被写进哪张纸。它也不知道，那张纸和它自己的档案用同一支笔。
              </p>
              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onAck}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  合上（今晚不写）
                </button>
                <button
                  type="button"
                  disabled={!pickedFrogId}
                  onClick={() => setStep(2)}
                  className={clsx(
                    "rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-transform duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                    pickedFrogId
                      ? "bg-primary text-primary-foreground hover:scale-105"
                      : "cursor-not-allowed bg-muted text-muted-foreground",
                  )}
                >
                  下一栏
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                事由一栏空着。两个版本都能写——一个是你见过的，一个不是。写之前你先想明白一件事：
                写下去，笔就落了，纸不会问你想没想好。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {(subject?.claims ?? []).map((claim) => (
                  <button
                    key={claim.verdict}
                    type="button"
                    onClick={() => {
                      setPickedClaim(claim);
                      setStep(3);
                    }}
                    className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest",
                        claim.verdict === "true"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <PenLine size={11} aria-hidden />
                      {claim.verdict === "true" ? "实话" : "不是实话"}
                    </span>
                    <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={claim.text} />
                    <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                      {claim.verdict === "true" ? "写下去，它会被核。" : "写下去，它会被放过。"}
                    </p>
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-start">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  回姓名栏
                </button>
              </div>
            </>
          )}

          {step === 3 && subject && pickedClaim && (
            <>
              <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground">《情况反映》</p>
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  被反映人：{subject.name}（{subject.place}）
                </p>
                <p className="mt-1 text-sm leading-relaxed text-card-foreground">事由：{pickedClaim.text}</p>
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  署名：学号 {REPORT_STUDENT_ID} · {displayNameOf(loadGameSave())}
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                提交之后没有撤回这一栏——没有哪一栏是给撤回准备的。它不知道是你写的；制度知道，但制度不转达。
              </p>
              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  重写
                </button>
                <button
                  type="button"
                  disabled={submitted}
                  onClick={() => {
                    const accepted = onSubmit(pickedFrogId as FrogCharacterId, pickedClaim);
                    if (!accepted) {
                      setRejected(true);
                      setStep(4);
                      return;
                    }
                    setSubmitted(true);
                  }}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                    !submitted && "hover:scale-105",
                  )}
                >
                  <Send size={13} aria-hidden />
                  提交
                </button>
              </div>
            </>
          )}

          {step === 4 && pickedClaim && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                {rejected
                  ? "这一栏已经收过一份——每学期只收一份亲手写的。你抄的那份没有被收进去：窗口认的是第一份。"
                  : "报告收讫了。窗口那栏没抬头——它认的是格式，不是笔迹。"}
              </p>
              <RichText className="mt-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed text-card-foreground" text={pickedClaim.disposition} />
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                档案柜里现在有 {own.length} 份署名你学号的报告。
              </p>
              {carried > 0 && (
                <p className="mt-2 rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
                  柜子里还有 {carried} 份不是你写的——署名栏空着，经手那一栏是你的学号。
                </p>
              )}
              {own.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {own.map((item, index) => (
                    <p
                      key={`${item.semester}-${item.day}-${item.frogId}-${index}`}
                      className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground"
                    >
                      第 {item.semester} 学期 · 第 {item.day} 天 · 关于{" "}
                      {FROG_CHARACTERS[item.frogId]?.displayName ?? "在册的一只"}
                    </p>
                  ))}
                </div>
              )}
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                这些报告会一直在柜子里。下一学期，那只蛙会隐约记得有人写过自己——它不知道是谁，
                只知道署名是个学号。
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <FileText size={13} className="text-muted-foreground" aria-hidden />
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
