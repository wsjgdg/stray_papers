/**
 * 申请离校（批次 CH「行政化」）：退出不是退出，是申请离校——填表才能走。
 * 事由四选一，系统照收，档案不问真假。没有正确的理由。
 * 表交上去，档案柜与图鉴原样保留；「离校」只是把窗口关掉。
 */
import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { clsx } from "clsx";
import { recordLeaveSchool, REPORT_STUDENT_ID } from "@/lib/gameSave";

interface LeaveSchoolOverlayProps {
  /** 本学期号（表头用） */
  playthrough: number;
  /** 表交上去之后才真的离校（跳回标题） */
  onConfirm: () => void;
  /** 不填了（收回申请） */
  onClose: () => void;
}

const REASONS: { key: "transfer" | "physical" | "normal" | "other"; label: string; hint: string }[] = [
  { key: "transfer", label: "转学", hint: "去另一所学校——那份档案不在本校，本柜不管" },
  { key: "physical", label: "体检", hint: "该蛙身体不适，需要休整一段时间" },
  { key: "normal", label: "正常毕业", hint: "课程修完，准予离校（档案上会照写）" },
  { key: "other", label: "其他", hint: "事由自填——系统照收，不问真假" },
];

export function LeaveSchoolOverlay({ playthrough, onConfirm, onClose }: LeaveSchoolOverlayProps) {
  const [reason, setReason] = useState<"transfer" | "physical" | "normal" | "other" | null>(null);
  const [note, setNote] = useState("");

  const submit = () => {
    if (!reason) return;
    recordLeaveSchool(reason, reason === "other" ? note : undefined);
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-[95] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="离校申请表"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <DoorOpen size={13} aria-hidden />
            行政事务
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">离校申请表</h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {playthrough} 学期 · 学号 {REPORT_STUDENT_ID}
          </p>

          <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
            离校要办手续。事由一栏请勾选——没有正确的理由，系统照收，档案不问真假。
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {REASONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setReason(item.key)}
                className={clsx(
                  "rounded-xl border p-3 text-left transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                  reason === item.key
                    ? "border-primary bg-primary/5"
                    : "border-dashed border-border bg-background/60 hover:border-primary/50",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={clsx(
                      "mt-1 inline-block h-3 w-3 shrink-0 border",
                      reason === item.key ? "border-primary bg-primary" : "border-border bg-background",
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-bold text-card-foreground">{item.label}</span>
                </span>
                <span className="mt-1 block pl-5 text-xs leading-relaxed text-muted-foreground">{item.hint}</span>
              </button>
            ))}
          </div>

          {reason === "other" && (
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={40}
              aria-label="其他事由（原文自填）"
              placeholder="事由（可留空）"
              className="mt-3 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
            />
          )}

          <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            表交上去，档案柜与图鉴原样保留。「离校」只是把窗口关掉——下次打开，档案还在原位。
          </p>

          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              收回申请
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!reason}
              className={clsx(
                "rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-transform duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                reason
                  ? "bg-primary text-primary-foreground hover:scale-105"
                  : "cursor-not-allowed bg-muted text-muted-foreground/60 shadow-none",
              )}
            >
              提交申请
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
