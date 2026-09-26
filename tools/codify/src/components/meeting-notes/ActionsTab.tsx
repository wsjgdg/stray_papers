import { useEffect, useRef, useState } from "react"
import { Check, CornerDownLeft, ListTodo, Loader2, Plus, Quote, RefreshCw, ShieldCheck, Sparkles, TriangleAlert, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ACTION_STATUSES, extractionStale, isOpenStatus, type Meeting, type MeetingAction, type MeetingDecision, type SourceAnchor, type SupportStrength } from "@/lib/store"
import type { SupportSummary } from "@/hooks/useMeetingNotes"

interface ActionsTabProps {
  meeting: Meeting
  extractBusy: boolean
  /** 支撑核验（引用是否真正支撑结论）：busy / 错误 / 汇总结果 / 触发与关闭 */
  supportBusy: boolean
  supportError: string
  supportSummary: SupportSummary | null
  /** 全库已知负责人（行内改派时的快速切换候选，datalist 下拉） */
  assigneeOptions: string[]
  onCheckSupport: () => void
  onDismissSupport: () => void
  onToggle: (actionId: string) => void
  onUpdateAction: (actionId: string, patch: Partial<Omit<MeetingAction, "id">>) => void
  onRemoveAction: (actionId: string) => void
  onAddAction: () => void
  onUpdateDecision: (decisionId: string, patch: Partial<Omit<MeetingDecision, "id">>) => void
  onRemoveDecision: (decisionId: string) => void
  onResolvePending: (actionId: string, accept: boolean) => void
  onApproveAllPending: () => void
  onGoTranscript: () => void
  onRegenerate: () => void
  onQuoteJump?: (anchor: SourceAnchor) => void
}

// 低于此值的条目在 UI 上显式标注「请核对」，不假装 AI 都对
const LOW_CONFIDENCE = 0.7

// 引用支撑强度徽标：弱/无支撑用警示色，提示用户优先核对——「引用存在」≠「引用支撑结论」
const SUPPORT_META: Record<SupportStrength["level"], { label: string; cls: string }> = {
  strong: { label: "强支撑", cls: "border-primary/30 bg-primary/5 text-primary" },
  weak: { label: "弱支撑 · 请核对", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500" },
  none: { label: "引用不支撑", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
}

// 把条目上的锚点字段收拢成 SourceAnchor
function anchorOf(item: { sourceLine?: number; sourceStart?: number; sourceEnd?: number }): SourceAnchor | undefined {
  if (typeof item.sourceLine !== "number") return undefined
  return { line: item.sourceLine, start: item.sourceStart, end: item.sourceEnd }
}

// 出处引用：带锚点的可点击，跳回转写原文并精确选中引用片段；无锚点的（手动添加/旧数据）仅展示
function SourceQuote({
  quote,
  anchor,
  onQuoteJump,
  className,
}: {
  quote: string
  anchor?: SourceAnchor
  onQuoteJump?: (anchor: SourceAnchor) => void
  className?: string
}) {
  if (!quote) return null
  const jumpable = Boolean(anchor && onQuoteJump)
  const inner = (
    <>
      <Quote className="mt-px h-3 w-3 shrink-0 text-primary/60" />
      <span className="line-clamp-2">{quote}</span>
      {jumpable ? (
        <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-primary opacity-0 transition-opacity group-hover/quote:opacity-100 cjk-latin">
          <CornerDownLeft className="h-2.5 w-2.5" />
          第 {anchor?.line} 行
        </span>
      ) : null}
    </>
  )
  if (jumpable) {
    return (
      <button
        onClick={() => onQuoteJump?.(anchor as SourceAnchor)}
        title={`跳到转写原文第 ${anchor?.line} 行并选中出处`}
        className={cn(
          "group/quote mt-1.5 flex w-full items-start gap-1.5 rounded-[var(--radius-sm)] pl-1 pr-1.5 text-left text-[11px] leading-relaxed text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground",
          className,
        )}
      >
        {inner}
      </button>
    )
  }
  return (
    <p className={cn("mt-1.5 flex items-start gap-1.5 pl-1 text-[11px] leading-relaxed text-muted-foreground", className)}>
      {inner}
    </p>
  )
}

export function ActionsTab({
  meeting,
  extractBusy,
  supportBusy,
  supportError,
  supportSummary,
  assigneeOptions,
  onCheckSupport,
  onDismissSupport,
  onToggle,
  onUpdateAction,
  onRemoveAction,
  onAddAction,
  onUpdateDecision,
  onRemoveDecision,
  onResolvePending,
  onApproveAllPending,
  onGoTranscript,
  onRegenerate,
  onQuoteJump,
}: ActionsTabProps) {
  const pending = meeting.pendingActions ?? []
  const hasAny = meeting.actions.length > 0 || meeting.decisions.length > 0 || pending.length > 0
  const openCount = meeting.actions.filter((a) => isOpenStatus(a.status)).length
  const blockedCount = meeting.actions.filter((a) => a.status === "blocked").length
  const doneCount = meeting.actions.length - openCount
  const hasTranscript = meeting.transcript.trim().length >= 20

  // ── 行内键盘光标（Linear 式）：↑↓/J K 移动，D 完成/取消完成，E 编辑内容，Esc 退出 ──
  // 只在行动项页签挂载时生效（CenterHost 条件渲染）；输入框聚焦 / 弹层打开 / 输入法
  // 组合态一律让位——会后快速整理行动项的全键盘通道。
  // 光标存 {会议 id, 行号}，渲染期派生合法性（换会议 / 行被删自动失效），不用 effect 回写
  const [cursorState, setCursorState] = useState<{ meetingId: string; idx: number } | null>(null)
  const actionsLen = meeting.actions.length
  const cursor =
    cursorState && cursorState.meetingId === meeting.id && cursorState.idx < actionsLen
      ? cursorState.idx
      : null
  const listRef = useRef<HTMLUListElement>(null)
  const moveCursor = (next: number) => {
    setCursorState({ meetingId: meeting.id, idx: next })
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-action-row="${next}"]`)
        ?.scrollIntoView({ block: "nearest" })
    })
  }
  // 点击行 / 聚焦行内输入框 = 光标就位（键盘与鼠标共享同一个「当前行」概念）
  const activate = (idx: number) => setCursorState({ meetingId: meeting.id, idx })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.isComposing || e.keyCode === 229) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      )
        return
      // 任一弹层打开（命令面板 / 设置 / 成本确认…）时不抢键
      if (document.querySelector('[role="dialog"]')) return
      if (actionsLen === 0) return
      const down = e.key === "ArrowDown" || e.key === "j"
      const up = e.key === "ArrowUp" || e.key === "k"
      if (down || up) {
        e.preventDefault()
        moveCursor(
          cursor === null
            ? down
              ? 0
              : actionsLen - 1
            : down
              ? Math.min(cursor + 1, actionsLen - 1)
              : Math.max(cursor - 1, 0),
        )
        return
      }
      if (cursor === null) return
      const active = meeting.actions[cursor]
      if (!active) return
      if (e.key === "d" || e.key === "D") {
        e.preventDefault()
        onToggle(active.id)
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault()
        const input = listRef.current?.querySelector<HTMLInputElement>(
          `[data-action-input="${active.id}"]`,
        )
        input?.focus()
        input?.select()
      } else if (e.key === "Escape") {
        setCursorState(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!hasAny) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary/10 text-primary">
          <ListTodo className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">还没有行动项</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasTranscript
              ? "转写稿已就绪——直接抽取，每条都会附原文引用（调用 AI，会先请你确认费用）"
              : "先在「转写文本」里粘贴会议内容，即可一键抽取带原文引用的行动项与决议"}
          </p>
        </div>
        <div className="flex gap-2">
          {hasTranscript ? (
            // 空状态直接给动作（引导操作而非指路）：一键抽取，不跳页签
            <Button
              size="sm"
              onClick={onRegenerate}
              disabled={extractBusy}
              className="gap-1.5 rounded-[var(--radius-md)] bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {extractBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {extractBusy ? "抽取中…" : "一键抽取行动项"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onGoTranscript}
              className="rounded-[var(--radius-md)] border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
            >
              去粘贴转写文本
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddAction}
            className="gap-1 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            手动添加
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 py-1 pr-2">
        {pending.length > 0 ? (
          <section className="rounded-[var(--radius-lg)] border border-destructive/30 bg-destructive/5 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  待你确认（{pending.length}）
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  抽取 Agent 对这些条目把握不足，主动停下来请你拍板——采纳前不进正式清单、不计入任何统计；采纳后成为你的条目，重新抽取不会覆盖
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onApproveAllPending}
                className="h-7 shrink-0 gap-1 rounded-[var(--radius-sm)] border-primary/40 text-xs text-primary hover:bg-primary/5 hover:text-primary"
              >
                <Check className="h-3.5 w-3.5" />
                全部采纳
              </Button>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {pending.map((a) => (
                <li
                  key={a.id}
                  className="rounded-[var(--radius-md)] border border-border bg-background px-3 py-2.5"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug text-foreground">{a.content}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {a.assignee ? <span>负责人 {a.assignee}</span> : null}
                        {a.dueDate ? <span className="cjk-latin tabular-nums">截止 {a.dueDate}</span> : null}
                        {typeof a.confidence === "number" ? (
                          <span
                            className="rounded-[var(--radius-pill)] border border-destructive/30 bg-destructive/5 px-1.5 py-px text-[10px] text-destructive/85 cjk-latin tabular-nums"
                            title="AI 自评置信度——低于确认门槛的条目都会先扣在这里"
                          >
                            置信度 {Math.round(a.confidence * 100)}%
                          </span>
                        ) : null}
                      </div>
                      {a.sourceQuote ? (
                        <SourceQuote quote={a.sourceQuote} anchor={anchorOf(a)} onQuoteJump={onQuoteJump} />
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => onResolvePending(a.id, true)}
                        className="rounded-[var(--radius-pill)] bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        采纳
                      </button>
                      <button
                        onClick={() => onResolvePending(a.id, false)}
                        className="rounded-[var(--radius-pill)] border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                      >
                        放弃
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              行动项
              <span className="ml-2 text-xs font-normal text-muted-foreground cjk-latin tabular-nums">
                {openCount} 未完成{blockedCount > 0 ? `（含 ${blockedCount} 阻塞）` : ""} · {doneCount} 已结束
              </span>
              <span
                className="ml-2 hidden text-[10px] font-normal text-muted-foreground/60 lg:inline cjk-latin"
                title="全键盘整理：↑↓ 或 J K 移动光标，D 完成/取消完成，E 编辑内容，Esc 退出光标；所有改动即时保存"
              >
                ↑↓ 选择 · D 完成 · E 编辑
              </span>
              {extractionStale(meeting) ? (
                <span
                  className="ml-2 rounded-[var(--radius-pill)] border border-destructive/40 bg-destructive/5 px-1.5 py-px text-[10px] font-normal text-destructive"
                  title="抽取之后转写稿又改过，下列结果可能已过时——建议重新抽取（你手改过的条目不会被覆盖）"
                >
                  可能过时
                </span>
              ) : null}
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onCheckSupport}
                disabled={supportBusy || extractBusy}
                title="锚点对账的扩展：「引用存在」不等于「引用支撑结论」。让 AI 逐条判定每个行动项的原文引用是否真的撑得起结论（强/弱/无支撑三级），弱支撑的条目会标黄提示优先核对（计费，会先请你确认）"
                className="h-7 gap-1 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-primary"
              >
                {supportBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {supportBusy ? "核验中…" : "支撑核验"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={extractBusy}
                className="h-7 gap-1 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-primary"
              >
                {extractBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {extractBusy ? "抽取中…" : "重新抽取"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddAction}
                className="h-7 gap-1 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </Button>
            </div>
          </div>

          {supportError ? (
            <p className="mb-2 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
              {supportError}
            </p>
          ) : null}

          {supportSummary && supportSummary.meetingId === meeting.id ? (
            <div
              className={cn(
                "mb-2 flex items-start justify-between gap-2 rounded-[var(--radius-md)] border px-3 py-2",
                supportSummary.weak + supportSummary.none > 0
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-primary/25 bg-primary/5",
              )}
            >
              <p className="min-w-0 text-[11px] leading-relaxed text-foreground/80">
                <ShieldCheck className="mr-1 inline h-3 w-3 align-[-2px] text-primary/70" />
                支撑核验完成（模型 {supportSummary.model}）：共 {supportSummary.checked} 条，
                <span className="text-primary"> 强支撑 {supportSummary.strong}</span> ·
                <span className="text-amber-600 dark:text-amber-500"> 弱支撑 {supportSummary.weak}</span> ·
                <span className="text-destructive"> 无支撑 {supportSummary.none}</span>
                {supportSummary.weak + supportSummary.none > 0
                  ? "——弱/无支撑的条目已标色，建议对照原文优先核对，判定只是提示、不自动删改"
                  : "——所有条目的原文引用都能撑得起结论"}
              </p>
              <button
                onClick={onDismissSupport}
                aria-label="关闭核验结果"
                className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {/* 历史负责人候选：负责人输入框的快速切换下拉（datalist 原生渲染，仍可自由输入新名字） */}
          {assigneeOptions.length > 0 ? (
            <datalist id="mn-assignee-options">
              {assigneeOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          ) : null}

          <ul ref={listRef} className="space-y-1.5">
            {meeting.actions.map((a, idx) => {
              const closed = a.status === "done" || a.status === "cancelled"
              const active = cursor === idx
              return (
              <li
                key={a.id}
                data-action-row={idx}
                onClick={() => activate(idx)}
                className={cn(
                  "rounded-[var(--radius-md)] border bg-background px-3 py-2.5 transition-shadow hover:shadow-[var(--elev-ring)]",
                  active ? "border-primary/60 shadow-[var(--focus-ring)]" : "border-border",
                  closed && "opacity-60",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggle(a.id)
                    }}
                    aria-label={closed ? "标记未完成" : "标记完成"}
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-colors",
                      closed
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:border-primary",
                    )}
                  >
                    {closed ? <Check className="h-3 w-3" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <input
                      value={a.content}
                      data-action-input={a.id}
                      onChange={(e) => onUpdateAction(a.id, { content: e.target.value })}
                      onFocus={() => activate(idx)}
                      placeholder="要做什么…"
                      className={cn(
                        "w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-foreground outline-none transition-colors hover:border-border focus-visible:border-primary",
                        closed && "line-through",
                      )}
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1">
                      <select
                        value={a.status}
                        onChange={(e) =>
                          onUpdateAction(a.id, { status: e.target.value as MeetingAction["status"] })
                        }
                        title="生命周期：提出 → 进行中 → 阻塞 → 完成 / 取消；改派直接改负责人"
                        className={cn(
                          "cursor-pointer rounded-[var(--radius-pill)] border bg-background px-1.5 py-px text-[10px] outline-none transition-colors focus-visible:border-primary",
                          ACTION_STATUSES.find((s) => s.value === a.status)?.pill ?? "border-border text-muted-foreground",
                        )}
                      >
                        {ACTION_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        负责人
                        <input
                          value={a.assignee}
                          onChange={(e) => onUpdateAction(a.id, { assignee: e.target.value })}
                          onFocus={() => activate(idx)}
                          placeholder="未指定"
                          list={assigneeOptions.length > 0 ? "mn-assignee-options" : undefined}
                          title="点击可直接输入，或从历史负责人里选（改派负责人即改派行动项）"
                          className="w-16 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-px text-[11px] text-foreground outline-none hover:border-border focus-visible:border-primary"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        截止
                        <input
                          type="date"
                          value={a.dueDate}
                          onChange={(e) => onUpdateAction(a.id, { dueDate: e.target.value })}
                          onFocus={() => activate(idx)}
                          title="点击弹出日期选择器；清空即取消截止日"
                          className="rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-px text-[11px] text-foreground outline-none hover:border-border focus-visible:border-primary"
                        />
                      </label>
                      {a.editedByUser ? (
                        <span className="rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                          已手动修改
                        </span>
                      ) : null}
                      {typeof a.confidence === "number" && a.confidence < LOW_CONFIDENCE && !a.editedByUser ? (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-destructive/30 bg-destructive/5 px-1.5 py-px text-[10px] text-destructive/80"
                          title={`AI 置信度 ${Math.round(a.confidence * 100)}%，建议对照原文核实`}
                        >
                          <TriangleAlert className="h-2.5 w-2.5" />
                          低置信 · 请核对
                        </span>
                      ) : null}
                      {a.support ? (
                        <span
                          className={cn(
                            "rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px]",
                            SUPPORT_META[a.support.level].cls,
                          )}
                          title={
                            `引用支撑强度：${a.support.reason || "（未给出理由）"}` +
                            `（模型 ${a.support.model} · ${new Date(a.support.at).toLocaleString("zh-CN")}）` +
                            (meeting.transcriptUpdatedAt && meeting.transcriptUpdatedAt > a.support.at
                              ? "；转写稿在核验后又改过，此判定可能过时"
                              : "") +
                            (a.support.level !== "strong" ? "。建议对照原文优先核对——判定只是提示，不自动删改" : "")
                          }
                        >
                          {SUPPORT_META[a.support.level].label}
                        </span>
                      ) : null}
                    </div>
                    {a.sourceQuote ? (
                      <SourceQuote quote={a.sourceQuote} anchor={anchorOf(a)} onQuoteJump={onQuoteJump} />
                    ) : null}
                  </div>
                  <button
                    onClick={() => onRemoveAction(a.id)}
                    className="mt-0.5 shrink-0 rounded-[var(--radius-sm)] p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="删除行动项"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
              )
            })}
          </ul>
        </section>

        {meeting.decisions.length > 0 ? (
          <section>
            <h3 className="mb-2.5 text-sm font-semibold tracking-tight text-foreground">决议</h3>
            <ul className="space-y-1.5">
              {meeting.decisions.map((d) => (
                <li
                  key={d.id}
                  className="rounded-[var(--radius-md)] border border-border bg-card/60 px-3 py-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <input
                        value={d.content}
                        onChange={(e) => onUpdateDecision(d.id, { content: e.target.value })}
                        className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-foreground outline-none transition-colors hover:border-border focus-visible:border-primary"
                      />
                      {d.sourceQuote ? (
                        <SourceQuote quote={d.sourceQuote} anchor={anchorOf(d)} onQuoteJump={onQuoteJump} className="mt-1" />
                      ) : null}
                    </div>
                    <button
                      onClick={() => onRemoveDecision(d.id)}
                      className="mt-0.5 shrink-0 rounded-[var(--radius-sm)] p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="删除决议"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
