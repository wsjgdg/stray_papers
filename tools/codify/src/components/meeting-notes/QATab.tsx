import { useState } from "react"
import { Loader2, MessageCircleQuestion, NotebookText, Search, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { QaRecord } from "@/lib/store"
import type { RelatedMeeting } from "@/lib/ai"
import type { MdBlock } from "@/lib/incrementalMd"
import { MarkdownBlocks } from "@/components/meeting-notes/MarkdownBlocks"

interface QATabProps {
  meetingCount: number
  allTags: string[]
  asking: boolean
  askError: string
  /** 流式通道的增量渲染块：非 null 时回答边生成边挂载（poll-first 下恒为 null） */
  streamingBlocks: MdBlock[] | null
  qaHistory: QaRecord[]
  finding: boolean
  findError: string
  findResults: RelatedMeeting[] | null
  findQuery: string
  staleIds: Set<string>
  onAsk: (question: string, scopeTag: string) => void
  onFind: (query: string, scopeTag: string) => void
  onClearFind: () => void
  onJumpMeeting: (meetingId: string) => void
  onRemoveRecord: (recordId: string) => void
  onClearHistory: () => void
}

const EXAMPLES = ["上次聊定价是什么时候，结论是什么？", "老王手上有哪些没完成的事？", "最近几次会议都定了哪些决议？"]

// 冷热分区（长对话场景的成熟做法）：最近 3 条完整渲染（热区），
// 更早的折叠成一行卡片（冷区），点开才展开全文——历史再长首屏 DOM 也不膨胀
const HOT_QA = 3

function fmtQaTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 问答记录卡片：热区完整渲染，冷区折叠成一行（summary 即问题），点开才展开全文
function QaCard({
  record,
  stale,
  collapsed,
  onRemove,
}: {
  record: QaRecord
  stale: boolean
  collapsed: boolean
  onRemove: (id: string) => void
}) {
  const meta = (
    <>
      {record.route === "structured" ? (
        <span
          className="shrink-0 rounded-[var(--radius-pill)] border border-emerald-500/40 bg-emerald-500/5 px-1.5 py-px text-[10px] font-normal text-emerald-600 dark:text-emerald-400"
          title={`结构化直答：规则路由判定这是可以从行动项 / 决议字段直接回答的事实查询，未调用 AI（${record.retrievalNote ?? ""}）`}
        >
          本地直答 · 未调用 AI
        </span>
      ) : null}
      {record.citations && record.citations.total > 0 ? (
        <span
          className={cn(
            "shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px] font-normal cjk-latin tabular-nums",
            record.citations.verified === record.citations.total
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              : "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400",
          )}
          title={
            record.citations.verified === record.citations.total
              ? `答案里 ${record.citations.total} 条「」引文全部逐字对上会议原文（本地机器对账，未调用 AI）`
              : `${record.citations.total} 条「」引文里 ${record.citations.total - record.citations.verified} 条没能在会议原文中逐字对上——可能是模型改写了引文，核对时请留意`
          }
        >
          引用核验 {record.citations.verified}/{record.citations.total}
        </span>
      ) : null}
      {record.route === "rag" && record.retrievalNote ? (
        <span
          className="hidden shrink-0 rounded-[var(--radius-pill)] border border-border px-1.5 py-px text-[10px] font-normal text-muted-foreground/70 sm:inline"
          title="本次回答的检索口径：哪些通道参与召回、重排后几场会议进了上下文"
        >
          {record.retrievalNote}
        </span>
      ) : null}
      {stale ? (
        <span
          className="shrink-0 rounded-[var(--radius-pill)] border border-destructive/40 bg-destructive/5 px-1.5 py-px text-[10px] font-normal text-destructive"
          title="回答之后，相关会议的转写 / 纪要 / 行动项有更新——这个答案可能已过时，可重新提问"
        >
          可能过时
        </span>
      ) : null}
      <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground/70 cjk-latin tabular-nums">
        {fmtQaTime(record.createdAt)}
      </span>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove(record.id)
        }}
        aria-label="删除这条问答记录"
        title="删除这条问答记录"
        className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground/50 opacity-0 transition-all hover:text-destructive group-hover/qa:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </>
  )
  if (collapsed) {
    return (
      <details className="group/qa rounded-[var(--radius-lg)] border border-border bg-card/40 px-4 py-2.5 transition-shadow hover:shadow-[var(--elev-ring)]">
        <summary className="flex cursor-pointer select-none items-start gap-2 text-[13px] font-medium text-foreground/80">
          <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
          <span className="min-w-0 flex-1 truncate">{record.question}</span>
          {meta}
        </summary>
        <p className="mt-1.5 whitespace-pre-wrap pl-[22px] text-[13px] leading-relaxed text-foreground/85">
          {record.answer}
        </p>
      </details>
    )
  }
  return (
    <div className="group/qa rounded-[var(--radius-lg)] border border-border bg-background px-4 py-3 transition-shadow hover:shadow-[var(--elev-ring)]">
      <p className="flex items-start gap-2 text-[13px] font-semibold text-foreground">
        <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">{record.question}</span>
        {meta}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap pl-[22px] text-[13px] leading-relaxed text-foreground/85">
        {record.answer}
      </p>
    </div>
  )
}

export function QATab({
  meetingCount,
  allTags,
  asking,
  askError,
  streamingBlocks,
  qaHistory,
  finding,
  findError,
  findResults,
  findQuery,
  staleIds,
  onAsk,
  onFind,
  onClearFind,
  onJumpMeeting,
  onRemoveRecord,
  onClearHistory,
}: QATabProps) {
  const [question, setQuestion] = useState("")
  const [scope, setScope] = useState("")
  const busy = asking || finding

  const submit = () => {
    const q = question.trim()
    if (!q || busy) return
    onAsk(q, scope)
    setQuestion("")
  }

  const submitFind = () => {
    const q = question.trim()
    if (!q || busy) return
    onFind(q, scope)
    setQuestion("")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-3xl space-y-3 py-1">
        <div>
          <h2 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-foreground">
            跨会议问答
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground cjk-latin tabular-nums">
            {scope
              ? `只在「${scope}」系列内回答——会议按时间排列，适合问「这个项目从启动到现在，阻塞点怎么演进的」`
              : `简单事实查询（谁负责 X / 未完成清单 / 截止日 / 决议）本地直答，零费用不调 AI；综合类问题走检索重排管线：召回相关片段 → 重排选出最相关的几场 → AI 综合作答，每条结论附原文支撑句并本地核验`}
          </p>
        </div>

        {allTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground">问答范围：</span>
            <button
              onClick={() => setScope("")}
              className={cn(
                "rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] transition-colors",
                scope === ""
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              全部会议
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setScope(scope === t ? "" : t)}
                className={cn(
                  "rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] transition-colors",
                  scope === t
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
                title={`只在带「${t}」标签的会议里问答（项目级问答，沿时间线回答演进类问题）`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-start gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={2}
            placeholder="问问你的会议档案，Enter 发送…"
            className="min-w-0 flex-1 resize-none rounded-[var(--radius-lg)] border border-border bg-background p-3 text-sm leading-relaxed text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
          />
          <div className="flex shrink-0 flex-col gap-1.5">
            <Button
              onClick={submit}
              disabled={!question.trim() || busy || meetingCount === 0}
              className="h-10 gap-1.5 rounded-[var(--radius-lg)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              提问
            </Button>
            <Button
              variant="outline"
              onClick={submitFind}
              disabled={!question.trim() || busy || meetingCount === 0}
              title="按语义找出相关的会议清单（不是生成答案），点击结果直达该会议"
              className="h-8 gap-1.5 rounded-[var(--radius-lg)] px-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              {finding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              找相关会议
            </Button>
          </div>
        </div>

        {qaHistory.length === 0 && findResults === null ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                onClick={() => setQuestion(q)}
                className="rounded-[var(--radius-pill)] border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}

        {askError ? (
          <p className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {askError}
          </p>
        ) : null}

        {findError ? (
          <p className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {findError}
          </p>
        ) : null}

        {findResults !== null && !finding ? (
          <div className="rounded-[var(--radius-lg)] border border-border bg-card/60 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-foreground">
                「{findQuery}」
                <span className="ml-1.5 font-normal text-muted-foreground cjk-latin">
                  {findResults.length > 0 ? `找到 ${findResults.length} 场相关会议（按相关度排序）` : "没有找到语义相关的会议"}
                </span>
              </p>
              <button
                onClick={onClearFind}
                aria-label="关闭检索结果"
                className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {findResults.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {findResults.map((r) => (
                  <li key={r.meetingId}>
                    <button
                      onClick={() => onJumpMeeting(r.meetingId)}
                      className="flex w-full items-baseline gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-background"
                    >
                      <NotebookText className="mt-0.5 h-3.5 w-3.5 shrink-0 self-center text-primary" />
                      <span className="shrink-0 text-[13px] font-medium text-foreground">《{r.title}》</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground cjk-latin tabular-nums">{r.date}</span>
                      {r.reason ? (
                        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                          {r.reason}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {asking ? (
          streamingBlocks && streamingBlocks.length > 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-primary/25 bg-card/60 px-4 py-3">
              <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                回答生成中——已完成的段落实时挂载，未收尾的标题 / 引用 / 列表项不会出现半截
              </p>
              <MarkdownBlocks blocks={streamingBlocks} />
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              正在翻阅你的会议档案…
            </div>
          )
        ) : null}

        {finding ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            正在按语义比对每场会议的摘要与议题…
          </div>
        ) : null}
      </div>

      {qaHistory.length > 0 ? (
        <div className="mx-auto mt-4 w-full max-w-3xl min-h-0 flex-1 pb-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">
              最近问答
              <span className="ml-2 font-normal text-muted-foreground/70">
                随全库备份导出；敏感提问可单条删除
                {qaHistory.length > HOT_QA ? `；仅最近 ${HOT_QA} 条展开，更早的已折叠为卡片，点开看全文` : ""}
              </span>
            </h3>
            <button
              onClick={onClearHistory}
              className="text-[11px] text-muted-foreground/70 transition-colors hover:text-destructive"
            >
              清空
            </button>
          </div>
          <ul className="space-y-2 overflow-y-auto pb-2" style={{ maxHeight: "calc(100vh - 420px)" }}>
            {qaHistory.map((r, i) => (
              <li key={r.id}>
                <QaCard
                  record={r}
                  stale={staleIds.has(r.id)}
                  collapsed={i >= HOT_QA}
                  onRemove={onRemoveRecord}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
