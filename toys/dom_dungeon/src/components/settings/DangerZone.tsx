import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react"

import type { ClearStep } from "@/pages/Settings/useSettings"

type DangerZoneProps = {
  clearStep: ClearStep
  onRequest: () => void
  onCancel: () => void
  onConfirm: () => void
  onDismiss: () => void
}

/** 清档必须手动输入这两个字才解锁确认按钮，防误触 */
const CLEAR_KEYWORD = "删除"

export function DangerZone({
  clearStep,
  onRequest,
  onCancel,
  onConfirm,
  onDismiss,
}: DangerZoneProps) {
  const [keyword, setKeyword] = useState("")

  /* 每次弹出确认框都把输入清空，不给「上次输过」留口子 */
  useEffect(() => {
    if (clearStep === "confirm") setKeyword("")
  }, [clearStep])

  const keywordReady = keyword.trim() === CLEAR_KEYWORD

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-destructive/40 bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-destructive">
        危险操作
      </p>
      <h2 className="mt-1 font-display text-xl font-bold">清除本地存档</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        会清掉碎片、解锁进度、历史战绩与这里的全部设置，清完没法找回。
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-destructive/40 bg-destructive/10 text-destructive"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">清除本地存档</span>
            <span className="block text-xs text-muted-foreground">
              碎片、解锁进度、历史战绩、设置一次清空
            </span>
          </span>
        </span>

        {clearStep === "done" ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
            <CheckCircle2 className="h-4 w-4" />
            已清空
          </span>
        ) : (
          <button
            type="button"
            onClick={onRequest}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/60 px-3 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Trash2 className="h-4 w-4" />
            清除本地存档
          </button>
        )}
      </div>

      {clearStep === "confirm" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="确认清除本地存档"
            className="w-full max-w-md rounded-lg border border-destructive/40 bg-card p-5 text-card-foreground shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300"
          >
            <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              再确认一次
            </p>
            <h3 className="mt-1 font-display text-2xl font-bold">
              确定要清空吗？
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              碎片、解锁进度、历史战绩和这里的设置都会归零，
              <span className="font-semibold text-destructive">
                此操作无法撤销
              </span>
              。
            </p>

            <label className="mt-4 block">
              <span className="block font-mono text-xs text-muted-foreground">
                请输入「{CLEAR_KEYWORD}」以确认
              </span>
              <input
                type="text"
                value={keyword}
                autoFocus
                autoComplete="off"
                placeholder={CLEAR_KEYWORD}
                onChange={(event) => setKeyword(event.target.value)}
                className="mt-2 w-full rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus-visible:border-destructive/70 focus-visible:shadow-focus"
              />
            </label>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onConfirm}
                disabled={!keywordReady}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-focus"
              >
                <Trash2 className="h-4 w-4" />
                确认清除
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clearStep === "done" ? (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 p-3"
        >
          <span className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            本地存档已清空，一切从头开始
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            知道了
          </button>
        </div>
      ) : null}
    </section>
  )
}
