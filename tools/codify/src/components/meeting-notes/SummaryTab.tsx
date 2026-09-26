import { useEffect, useMemo, useState } from "react"
import {
  BookmarkPlus,
  Check,
  EyeOff,
  Link2,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getActiveTts, getProviderConfig } from "@/lib/providers"
import { detectOmissions, type OmissionCandidate, type OmissionKind } from "@/lib/omission"
import type { DigestRow, RelatedMeetingHint } from "@/hooks/useMeetingNotes"
import type { ReviewIssueType, SummaryReview } from "@/lib/ai"
import { layerStale, isOpenStatus, dueDayOffset, ACTION_STATUSES, type Meeting, type OutlineTopic } from "@/lib/store"

interface SummaryTabProps {
  meeting: Meeting
  genNotice: string
  summaryBusy: boolean
  relatedMeetings: RelatedMeetingHint[]
  pastOpenCount: number
  digestReport: DigestRow[] | null
  digestBusy: boolean
  digestError: string
  /** 双模型交叉审查报告（meetingId 与当前会议匹配时才展示） */
  reviewReport: (SummaryReview & { meetingId: string }) | null
  reviewBusy: boolean
  reviewError: string
  onReviewSummary: () => void
  onApplyReview: () => void
  onClearReview: () => void
  onEditBrief: (content: string) => void
  onEditOutline: (topics: OutlineTopic[]) => void
  onGoTranscript: () => void
  onRegenerate: () => void
  onJumpMeeting: (meetingId: string) => void
  onDigest: () => void
  onApplyDigest: (rows: DigestRow[]) => void
  onClearDigest: () => void
  /** 把这场会的议题结构存成新模板；返回空串 = 成功，否则是失败原因 */
  onExtractTemplate: (label: string) => string
  /** 阅读模式内联的行动项/决议区 →「管理全部行动项」跳转到行动项页 */
  onGoActions?: () => void
}

const ISSUE_META: Record<ReviewIssueType, { label: string; cls: string }> = {
  structure: { label: "结构性", cls: "border-border bg-muted text-muted-foreground" },
  omission: { label: "遗漏", cls: "border-destructive/30 bg-destructive/5 text-destructive" },
  irrelevant: { label: "无关内容", cls: "border-border bg-muted text-muted-foreground" },
  factual: { label: "事实性", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
}

const VERDICT_META: Record<DigestRow["verdict"], { label: string; cls: string }> = {
  done: { label: "已完成", cls: "border-primary/30 bg-primary/10 text-primary" },
  progress: { label: "有进展", cls: "border-primary/25 bg-primary/5 text-primary/90" },
  blocked: { label: "被阻塞", cls: "border-destructive/30 bg-destructive/5 text-destructive" },
  unmentioned: { label: "未提及", cls: "border-border bg-muted text-muted-foreground" },
}

// 遗漏自查的条目类型徽标
const OMISSION_KIND_META: Record<OmissionKind, { label: string; cls: string }> = {
  fact: { label: "高显著度事实", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500" },
  person: { label: "人物", cls: "border-primary/30 bg-primary/5 text-primary" },
  term: { label: "专有名词", cls: "border-border bg-muted text-muted-foreground" },
  number: { label: "关键数字", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500" },
  date: { label: "时间点", cls: "border-border bg-muted text-muted-foreground" },
}

export function SummaryTab({
  meeting,
  genNotice,
  summaryBusy,
  relatedMeetings,
  pastOpenCount,
  digestReport,
  digestBusy,
  digestError,
  reviewReport,
  reviewBusy,
  reviewError,
  onReviewSummary,
  onApplyReview,
  onClearReview,
  onEditBrief,
  onEditOutline,
  onGoTranscript,
  onRegenerate,
  onJumpMeeting,
  onDigest,
  onApplyDigest,
  onClearDigest,
  onExtractTemplate,
  onGoActions,
}: SummaryTabProps) {
  const hasSummary = Boolean(meeting.brief?.content) || (meeting.outline?.topics.length ?? 0) > 0
  const [extracting, setExtracting] = useState(false)
  const [tplName, setTplName] = useState("")
  const [tplMsg, setTplMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // ── 遗漏自查（反向覆盖检查）：幻觉是「说了不该说的」（交叉审查管），遗漏是「该说的没说」（这里管）。
  // 纯本地规则 + 已有事实层，零 LLM 调用、免费、随摘要/转写变化实时重算：
  // 从转写稿抽关键实体（说话人/负责人/专有名词）与关键数字/时间点，加上高显著度却
  // 没被议题引用的已核验事实，逐个检查摘要里有没有对应提及，未提及的列为「可能遗漏」。
  const omissions = useMemo<OmissionCandidate[]>(() => {
    if (!hasSummary) return []
    const summaryText = [
      meeting.brief?.content ?? "",
      ...(meeting.outline?.topics ?? []).flatMap((t) => [t.topic, ...t.points]),
    ].join("\n")
    const extraTerms: { token: string; kind: OmissionKind }[] = [
      ...meeting.actions
        .map((a) => a.assignee.trim())
        .filter((v, i, arr) => v && arr.indexOf(v) === i)
        .map((token) => ({ token, kind: "person" as const })),
      ...(meeting.entities ?? []).map((e) => ({
        token: e.name,
        kind: (e.type === "person" ? "person" : "term") as OmissionKind,
      })),
    ]
    return detectOmissions({
      transcript: meeting.cleaned || meeting.transcript,
      summaryText,
      extraTerms,
      facts: meeting.facts,
      referencedFactIds: (meeting.outline?.topics ?? []).flatMap((t) => t.factIds ?? []),
    })
  }, [hasSummary, meeting])
  // 消化面板勾选：有明确跟进判定（可写状态）的默认采纳，未提及的仅展示
  const [digestChecked, setDigestChecked] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!digestReport) return
    const init: Record<string, boolean> = {}
    for (const r of digestReport) init[r.actionId] = Boolean(r.applyStatus)
    setDigestChecked(init)
  }, [digestReport])

  // 朗读纪要：通过 Provider 注册表取当前生效的 TTS（默认浏览器本机合成，免费；
  // 音色 / 语速在「设置 → 服务商」里配置，换引擎无需改代码）
  const tts = useMemo(() => getActiveTts(), [])
  const [speaking, setSpeaking] = useState(false)
  const speechText = useMemo(() => {
    const parts: string[] = []
    if (meeting.brief?.content) parts.push(meeting.brief.content)
    for (const t of meeting.outline?.topics ?? []) {
      parts.push(`${t.topic}：${t.points.join("；")}。`)
    }
    return parts.join("\n")
  }, [meeting.brief, meeting.outline])

  // 切换会议或组件卸载时停止朗读
  useEffect(() => {
    setSpeaking(false)
    return () => tts?.stop()
  }, [meeting.id, tts])

  const toggleSpeak = () => {
    if (!tts) return
    if (speaking) {
      tts.stop()
      setSpeaking(false)
      return
    }
    if (!speechText.trim()) return
    setSpeaking(true)
    tts.speak(speechText, getProviderConfig("tts", tts.meta.id), {
      onEnd: () => setSpeaking(false),
    })
  }

  if (!hasSummary) {
    const hasTranscript = meeting.transcript.trim().length >= 20
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary/10 text-primary">
          <Pencil className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">还没有生成纪要</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasTranscript
              ? "转写稿已就绪——直接生成一句话摘要与分议题要点（调用 AI，会先请你确认费用）"
              : "先在「转写文本」里粘贴会议内容，再一键生成摘要与行动项"}
          </p>
        </div>
        <div className="flex gap-2">
          {hasTranscript ? (
            // 空状态直接给动作：一键生成，不跳页签（成本确认在生成入口内部）
            <Button
              size="sm"
              onClick={onRegenerate}
              disabled={summaryBusy}
              className="gap-1.5 rounded-[var(--radius-md)] bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {summaryBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {summaryBusy ? "生成中…" : "一键生成纪要"}
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
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 py-1 pr-2">
        {/* 提示文字与操作按钮各占一行：按钮行可换行，提示独占整行，互不挤压 */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(meeting.outline?.topics.length ?? 0) > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setExtracting((v) => !v)
                  setTplMsg(null)
                }}
                title="把这场会的议题结构保存为新模板，下次同类会议在顶栏直接选用"
                className="h-8 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:text-primary"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                提取为模板
              </Button>
            ) : null}
            {tts && speechText.trim() ? (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSpeak}
                title={
                  speaking
                    ? "停止朗读"
                    : `朗读纪要（${tts.meta.name}${tts.meta.runtime === "local" ? " · 本机 · 免费" : " · 云端 · 计费"}）`
                }
                className={cn(
                  "h-8 gap-1.5 rounded-[var(--radius-md)] text-xs",
                  speaking
                    ? "border-primary/40 text-primary"
                    : "text-muted-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {speaking ? "停止朗读" : "朗读纪要"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={onReviewSummary}
              disabled={reviewBusy || summaryBusy}
              title="请第二个 AI 模型对照转写原文交叉审查这份摘要：按 结构性 / 遗漏 / 无关 / 事实性 分类列出问题并给修正稿；采纳与否由你决定（计费，会先请你确认）"
              className="h-8 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              {reviewBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {reviewBusy ? "审查中…" : "AI 交叉审查"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={summaryBusy}
              className="h-8 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              {summaryBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {summaryBusy ? "重新生成中…" : "重新生成摘要"}
            </Button>
          </div>
          {genNotice ? (
            <p className="rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-foreground/80">
              {genNotice}
            </p>
          ) : null}
        </div>

        {extracting ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2">
            <input
              autoFocus
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tplName.trim()) {
                  const err = onExtractTemplate(tplName)
                  if (err) setTplMsg({ text: err, ok: false })
                  else {
                    setExtracting(false)
                    setTplName("")
                    setTplMsg({ text: "已存为模板，顶栏下拉即可选用", ok: true })
                  }
                }
                if (e.key === "Escape") setExtracting(false)
              }}
              placeholder="模板名称，如：项目周会"
              maxLength={20}
              className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary"
            />
            <Button
              size="sm"
              disabled={!tplName.trim()}
              onClick={() => {
                const err = onExtractTemplate(tplName)
                if (err) setTplMsg({ text: err, ok: false })
                else {
                  setExtracting(false)
                  setTplName("")
                  setTplMsg({ text: "已存为模板，顶栏下拉即可选用", ok: true })
                }
              }}
              className="h-7 shrink-0 rounded-[var(--radius-sm)] bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
            >
              保存模板
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExtracting(false)}
              className="h-7 shrink-0 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-foreground"
            >
              取消
            </Button>
          </div>
        ) : null}

        {tplMsg ? (
          <p
            className={cn(
              "rounded-[var(--radius-md)] px-3 py-1.5 text-xs",
              tplMsg.ok
                ? "border border-primary/25 bg-primary/5 text-foreground/80"
                : "border border-destructive/30 bg-destructive/5 text-destructive",
            )}
          >
            {tplMsg.text}
          </p>
        ) : null}

        <BriefCard meeting={meeting} onEditBrief={onEditBrief} />
        <OutlineCard meeting={meeting} onEditOutline={onEditOutline} />

        {omissions.length > 0 ? (
          <details open className="rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/[0.04]">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 px-4 py-3 text-sm font-medium text-foreground">
              <EyeOff className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
              <span className="text-muted-foreground">遗漏自查 ·</span>
              <span className="cjk-latin tabular-nums">{omissions.length}</span> 个转写关键点未在摘要提及
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                （本机规则反向覆盖检查 · 免费 · 不调 AI）
              </span>
            </summary>
            <div className="border-t border-amber-500/20 px-4 py-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                幻觉是「说了不该说的」，遗漏是「该说的没说」——下列关键信息（人物 / 专有名词 /
                数字 / 时间点 / 高显著度事实）在转写稿里出现过，但摘要全文找不到对应提及。
                未提及不等于必须写进摘要，由你判断是否需要补充：
              </p>
              <ul className="mt-2 space-y-1.5">
                {omissions.map((o, i) => {
                  const meta = OMISSION_KIND_META[o.kind]
                  return (
                    <li
                      key={i}
                      className="rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-1.5"
                    >
                      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                        <span
                          className={cn(
                            "shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px]",
                            meta.cls,
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="font-medium text-foreground">{o.text}</span>
                        {o.count > 1 ? (
                          <span className="text-[10px] text-muted-foreground cjk-latin tabular-nums">
                            转写中出现 {o.count} 次
                          </span>
                        ) : null}
                      </p>
                      {o.example ? (
                        <p className="mt-0.5 truncate pl-0.5 text-[10px] text-muted-foreground" title={o.example}>
                          {o.example}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          </details>
        ) : null}

        {reviewError ? (
          <p className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {reviewError}
          </p>
        ) : null}

        {reviewReport && reviewReport.meetingId === meeting.id ? (
          <section className="rounded-[var(--radius-lg)] border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  交叉审查报告
                  <span className="font-normal text-muted-foreground">
                    · 审查模型 {reviewReport.reviewerModel}
                    {reviewReport.reviewerModel === (meeting.brief?.model || meeting.outline?.model)
                      ? "（与生成模型相同，仅换了审查视角）"
                      : "（与生成模型不同，独立第二意见）"}
                  </span>
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  审查只是建议——你点「采纳修正稿」才会写入摘要层；手动改过的层不会被覆盖
                </p>
              </div>
              <button
                onClick={onClearReview}
                aria-label="关闭审查报告"
                className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {reviewReport.issues.length === 0 ? (
              <p className="mt-2.5 rounded-[var(--radius-md)] border border-primary/25 bg-background px-3 py-2 text-xs text-foreground/80">
                未发现结构性 / 遗漏 / 无关 / 事实性问题——这份摘要通过了交叉审查
              </p>
            ) : (
              <ul className="mt-2.5 space-y-1.5">
                {reviewReport.issues.map((iss, i) => {
                  const meta = ISSUE_META[iss.type]
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-2"
                    >
                      <span
                        className={cn(
                          "mt-px shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px]",
                          meta.cls,
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground/85">
                        {iss.detail}
                        {iss.fix ? (
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">建议：{iss.fix}</span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            {reviewReport.revised ? (
              <div className="mt-2.5 rounded-[var(--radius-md)] border border-border bg-background px-3 py-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">修正稿预览</p>
                {reviewReport.revised.brief ? (
                  <p className="mt-1 text-[13px] font-medium leading-relaxed text-foreground">
                    {reviewReport.revised.brief}
                  </p>
                ) : null}
                <ol className="mt-1.5 space-y-1.5">
                  {reviewReport.revised.topics.map((t, i) => (
                    <li key={i}>
                      <p className="text-[12px] font-semibold text-foreground">
                        {i + 1}. {t.topic}
                      </p>
                      <ul className="mt-0.5 space-y-0.5 pl-4">
                        {t.points.map((p, j) => (
                          <li key={j} className="text-[12px] leading-relaxed text-foreground/75">
                            · {p}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    onClick={onApplyReview}
                    className="h-7 gap-1 rounded-[var(--radius-sm)] bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                  >
                    <Check className="h-3.5 w-3.5" />
                    采纳修正稿
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {(meeting.facts?.length ?? 0) > 0 ? (
          <details className="rounded-[var(--radius-lg)] border border-border bg-background">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 px-4 py-3 text-sm font-medium text-foreground">
              <ListChecks className="h-3.5 w-3.5 text-primary/70" />
              <span className="text-muted-foreground">事实层 ·</span>
              {meeting.facts!.length} 条已核验的原子事实
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                （摘要的中间产物：每条都通过原文支撑校验，议题要点按编号回溯到这里）
              </span>
              {meeting.transcriptUpdatedAt && meeting.factsAt && meeting.transcriptUpdatedAt > meeting.factsAt ? (
                <span className="ml-1 rounded-[var(--radius-pill)] border border-destructive/40 bg-destructive/5 px-1.5 py-px text-[10px] font-medium text-destructive">
                  转写稿后来改过，事实层可能过时
                </span>
              ) : null}
            </summary>
            <ul className="max-h-80 space-y-1 overflow-y-auto border-t border-border px-4 py-3">
              {meeting.facts!.map((f) => (
                <li key={f.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-mono text-[10px] text-primary/70">{f.id}</span>
                  <span className="min-w-0 flex-1 leading-relaxed text-foreground/85">
                    {f.statement}
                    {f.speaker ? <span className="ml-1 text-muted-foreground">（{f.speaker}）</span> : null}
                  </span>
                  <span
                    className="shrink-0 text-[10px] text-muted-foreground/70"
                    title={`原文支撑：「${f.sourceQuote}」`}
                  >
                    段{f.segId} · {Math.round(f.salience * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {relatedMeetings.length > 0 ? (
          <section className="rounded-[var(--radius-lg)] border border-border bg-background p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Link2 className="h-3 w-3 text-primary/70" />
              可能相关的会议
              <span className="font-normal">· 本机自动关联（共同标签 / 内容相似 / 共同负责人），不调 AI、不花钱</span>
            </h3>
            <ul className="mt-2 space-y-1">
              {relatedMeetings.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onJumpMeeting(r.id)}
                    className="flex w-full items-baseline gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="shrink-0 text-[13px] font-medium text-foreground">《{r.title}》</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground cjk-latin tabular-nums">{r.date}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {r.reasons.join("；")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {pastOpenCount > 0 || digestReport || digestBusy ? (
          <section className="rounded-[var(--radius-lg)] border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground">上期行动项跟进</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  历史会议还有 {pastOpenCount} 条未结行动项——消化会拿本场会议内容逐条对照：完成了、在推进、被阻塞、还是压根没提（没提且已逾期或久未动 = 疑似遗忘）。调用 AI 会先请你确认；判定只是建议，勾选采纳才更新状态
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onDigest}
                disabled={digestBusy || pastOpenCount === 0}
                className="h-8 shrink-0 gap-1.5 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
              >
                {digestBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {digestBusy ? "消化中…" : digestReport ? "重新消化" : "消化上期行动项"}
              </Button>
            </div>

            {digestError ? (
              <p className="mt-2 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {digestError}
              </p>
            ) : null}

            {digestReport ? (
              <>
                <ul className="mt-2.5 space-y-1">
                  {digestReport.map((r) => {
                    const meta = VERDICT_META[r.verdict]
                    return (
                      <li
                        key={r.actionId}
                        className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-2"
                      >
                        <input
                          type="checkbox"
                          disabled={!r.applyStatus}
                          checked={Boolean(digestChecked[r.actionId])}
                          onChange={(e) =>
                            setDigestChecked((prev) => ({ ...prev, [r.actionId]: e.target.checked }))
                          }
                          title={r.applyStatus ? `采纳后该条状态改为「${VERDICT_META[r.verdict].label}」对应状态` : "未提及的条目不更新状态，仅作提醒"}
                          className="mt-1 accent-[hsl(var(--primary))] disabled:opacity-30"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium leading-snug text-foreground">
                            {r.content}
                            {r.assignee ? <span className="ml-1.5 font-normal text-muted-foreground">@{r.assignee}</span> : null}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            来自《{r.fromTitle}》
                            {r.evidence ? ` · 依据：「${r.evidence}」` : ""}
                          </p>
                        </div>
                        <span className={cn("shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[10px]", meta.cls)}>
                          {meta.label}
                        </span>
                        {r.suspectedForgotten ? (
                          <span
                            className="shrink-0 rounded-[var(--radius-pill)] border border-destructive/40 px-1.5 py-px text-[10px] font-medium text-destructive"
                            title="本场没提到，且已逾期或 ≥14 天没动——建议主动追问或取消"
                          >
                            疑似遗忘
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
                <div className="mt-2.5 flex items-center justify-end gap-2">
                  <span className="mr-auto text-[11px] text-muted-foreground cjk-latin tabular-nums">
                    将更新 {digestReport.filter((r) => r.applyStatus && digestChecked[r.actionId]).length} 条状态
                    {digestReport.some((r) => r.suspectedForgotten)
                      ? ` · ${digestReport.filter((r) => r.suspectedForgotten).length} 条疑似遗忘待追问`
                      : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearDigest}
                    className="h-7 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-foreground"
                  >
                    关闭
                  </Button>
                  <Button
                    size="sm"
                    disabled={digestReport.filter((r) => r.applyStatus && digestChecked[r.actionId]).length === 0}
                    onClick={() =>
                      onApplyDigest(digestReport.filter((r) => r.applyStatus && digestChecked[r.actionId]))
                    }
                    className="h-7 rounded-[var(--radius-sm)] bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                  >
                    采纳并更新状态
                  </Button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {(meeting.notes?.length ?? 0) > 0 ? (
          <section className="rounded-[var(--radius-lg)] border border-border bg-background p-4">
            <h3 className="text-xs font-semibold text-muted-foreground">
              我的随手记
              <span className="ml-1.5 font-normal">· 生成摘要时已交给 AI，你的批注被优先呼应而非替代</span>
            </h3>
            <ul className="mt-2 space-y-1">
              {(meeting.notes ?? []).map((n) => (
                <li key={n.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 text-[10px] text-primary/80 cjk-latin tabular-nums">
                    {n.elapsedLabel ??
                      new Date(n.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-relaxed text-foreground/85">
                    {n.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 阅读模式的收口层：摘要 → 议题之后直接给行动项与决议，不用切页签；
            低置信度条目用统一的「待核对」语言（左侧橙色竖线），其余按原生内容呈现 */}
        {meeting.actions.length > 0 || meeting.decisions.length > 0 ? (
          <section className="rounded-[var(--radius-lg)] border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground">
                行动项与决议
                <span className="ml-1.5 font-normal cjk-latin tabular-nums">
                  {meeting.actions.filter((a) => isOpenStatus(a.status)).length} 项未完成 · {meeting.decisions.length} 条决议
                </span>
              </h3>
              {onGoActions ? (
                <button
                  onClick={onGoActions}
                  className="shrink-0 text-[11px] font-medium text-primary transition-opacity hover:opacity-75"
                >
                  管理全部行动项 →
                </button>
              ) : null}
            </div>

            {meeting.actions.length > 0 ? (
              <ul className="mt-2.5 space-y-1">
                {[...meeting.actions]
                  .sort((a, b) => Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status)))
                  .slice(0, 8)
                  .map((a) => {
                    const done = !isOpenStatus(a.status)
                    const off = dueDayOffset(a.dueDate)
                    const overdue = off !== null && off < 0 && !done
                    const lowConf =
                      !done && typeof a.confidence === "number" && a.confidence < 0.75 && !a.editedByUser
                    const st = ACTION_STATUSES.find((s) => s.value === a.status)
                    return (
                      <li
                        key={a.id}
                        className={cn(
                          "flex items-baseline gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] leading-snug",
                          lowConf && "border-l-2 border-l-amber-500 bg-amber-500/[0.04]",
                        )}
                        title={lowConf ? "AI 建议，置信度较低，请对照原文核对" : undefined}
                      >
                        <span
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            done
                              ? "bg-emerald-500/70"
                              : a.status === "blocked"
                                ? "bg-destructive"
                                : a.status === "doing"
                                  ? "bg-primary"
                                  : "bg-border",
                          )}
                        />
                        <span className={cn("min-w-0 flex-1 text-foreground/90", done && "text-muted-foreground line-through")}>
                          {a.content}
                        </span>
                        {a.assignee ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">@{a.assignee}</span>
                        ) : null}
                        {a.dueDate ? (
                          <span
                            className={cn(
                              "shrink-0 text-[10px] cjk-latin tabular-nums",
                              overdue ? "font-medium text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {a.dueDate}
                          </span>
                        ) : null}
                        {!done && st && a.status !== "open" ? (
                          <span className={cn("shrink-0 rounded-[var(--radius-pill)] border px-1.5 py-px text-[9px]", st.pill)}>
                            {st.label}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
              </ul>
            ) : null}

            {meeting.decisions.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                {meeting.decisions.slice(0, 5).map((d) => (
                  <li key={d.id} className="flex items-baseline gap-2 px-2 text-[12px] leading-snug">
                    <Scale className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 text-foreground/85">
                      {d.content}
                      {d.supersededBy ? (
                        <span className="ml-1.5 rounded-[var(--radius-pill)] border border-border bg-muted px-1.5 py-px text-[9px] text-muted-foreground">
                          已被取代
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {meeting.transcript.trim() ? (
          <details className="group rounded-[var(--radius-lg)] border border-border bg-background">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-foreground">
              <span className="text-muted-foreground">详细层 ·</span> 带时间戳转写全文
              <span className="ml-2 text-xs font-normal text-muted-foreground">（直接使用原文，不经 AI 改写）</span>
            </summary>
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap border-t border-border px-4 py-3 font-[var(--font-body)] text-[13px] leading-relaxed text-foreground/85">
              {meeting.transcript}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  )
}

// AI 隐形化：摘要是会议的默认内容，不贴「AI 生成」标签；
// 只标记用户确认过的部分——改过的内容用细微徽标注明「已编辑」
function LayerBadge({ edited }: { edited: boolean }) {
  if (!edited) return null
  return (
    <Badge variant="outline" className="rounded-[var(--radius-pill)] border-border px-2 py-0 text-[10px] font-medium text-muted-foreground">
      已编辑 · 重新生成不覆盖
    </Badge>
  )
}

// 漂移感知标记：底层转写在生成之后变过 → 结论降级为「可能过时」，不伪装成新鲜事实
function StaleBadge({ hint }: { hint: string }) {
  return (
    <Badge
      variant="outline"
      title={hint}
      className="rounded-[var(--radius-pill)] border-destructive/40 bg-destructive/5 px-2 py-0 text-[10px] font-medium text-destructive hover:bg-destructive/5"
    >
      可能过时
    </Badge>
  )
}

function BriefCard({ meeting, onEditBrief }: { meeting: Meeting; onEditBrief: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  useEffect(() => setEditing(false), [meeting.id])

  const brief = meeting.brief
  if (!brief || !brief.content.trim()) return null

  return (
    <section className={cn("rounded-[var(--radius-lg)] border border-border bg-background p-4 transition-shadow hover:shadow-[var(--elev-ring)]")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">一句话摘要</h3>
        <div className="flex items-center gap-2">
          <LayerBadge edited={brief.editedByUser} />
          {layerStale(meeting, brief) ? (
            <StaleBadge hint="转写稿在这份摘要生成之后又改过，摘要可能已过时——建议重新生成" />
          ) : null}
          {editing ? null : (
            <button
              onClick={() => {
                setDraft(brief.content)
                setEditing(true)
              }}
              className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="编辑摘要"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-[var(--radius-md)] border border-primary bg-background p-2.5 text-sm leading-relaxed text-foreground outline-none shadow-[var(--focus-ring)]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
              取消
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 rounded-[var(--radius-sm)] bg-primary text-xs text-primary-foreground hover:bg-primary/90"
              disabled={!draft.trim()}
              onClick={() => {
                onEditBrief(draft.trim())
                setEditing(false)
              }}
            >
              <Check className="h-3.5 w-3.5" />
              保存
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-base font-medium leading-relaxed tracking-tight text-foreground text-pretty">{brief.content}</p>
      )}
    </section>
  )
}

function OutlineCard({ meeting, onEditOutline }: { meeting: Meeting; onEditOutline: (t: OutlineTopic[]) => void }) {
  const [editingIdx, setEditingIdx] = useState(-1)
  const [draftTopic, setDraftTopic] = useState("")
  const [draftPoints, setDraftPoints] = useState("")
  useEffect(() => setEditingIdx(-1), [meeting.id])

  const outline = meeting.outline
  if (!outline || outline.topics.length === 0) return null

  const startEdit = (idx: number) => {
    const t = outline.topics[idx]
    setDraftTopic(t.topic)
    setDraftPoints(t.points.join("\n"))
    setEditingIdx(idx)
  }

  const saveEdit = () => {
    const next = outline.topics.map((t, i) =>
      i === editingIdx
        ? {
            topic: draftTopic.trim() || t.topic,
            points: draftPoints
              .split("\n")
              .map((p) => p.trim())
              .filter(Boolean),
          }
        : t,
    )
    onEditOutline(next.filter((t) => t.points.length > 0))
    setEditingIdx(-1)
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">议题纪要</h3>
        <div className="flex items-center gap-2">
          <LayerBadge edited={outline.editedByUser} />
          {layerStale(meeting, outline) ? (
            <StaleBadge hint="转写稿在这份议题纪要生成之后又改过，纪要可能已过时——建议重新生成" />
          ) : null}
        </div>
      </div>
      <ol className="space-y-4">
        {outline.topics.map((t, idx) => (
          <li key={idx} className="group/topic relative">
            {editingIdx === idx ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={draftTopic}
                  onChange={(e) => setDraftTopic(e.target.value)}
                  className="w-full rounded-[var(--radius-sm)] border border-primary bg-background px-2 py-1 text-sm font-semibold text-foreground outline-none shadow-[var(--focus-ring)]"
                />
                <textarea
                  value={draftPoints}
                  onChange={(e) => setDraftPoints(e.target.value)}
                  rows={Math.max(3, draftPoints.split("\n").length + 1)}
                  className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-background p-2 text-[13px] leading-relaxed text-foreground outline-none focus-visible:border-primary"
                />
                <p className="text-[11px] text-muted-foreground">每行一个要点</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditingIdx(-1)}>
                    <X className="h-3.5 w-3.5" />
                    取消
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 gap-1 rounded-[var(--radius-sm)] bg-primary text-xs text-primary-foreground hover:bg-primary/90"
                    onClick={saveEdit}
                  >
                    <Check className="h-3.5 w-3.5" />
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2.5">
                  <span className="shrink-0 text-xs font-semibold text-primary cjk-latin">{idx + 1}.</span>
                  <h4 className="text-sm font-semibold tracking-tight text-foreground">{t.topic}</h4>
                  {(t.factIds?.length ?? 0) > 0 ? (
                    <span
                      className="shrink-0 rounded-[var(--radius-pill)] border border-border bg-muted px-1.5 py-px text-[10px] text-muted-foreground cjk-latin tabular-nums"
                      title={`本议题要点引用了 ${t.factIds!.length} 条已核验事实（${t.factIds!.join("、")}），可在下方「事实层」面板逐条查看`}
                    >
                      {t.factIds!.length} 条事实支撑
                    </span>
                  ) : null}
                </div>
                <ul className="mt-1.5 space-y-1 pl-[26px]">
                  {t.points.map((p, i) => (
                    <li key={i} className="relative text-[13px] leading-relaxed text-foreground/85">
                      <span className="absolute -left-3.5 top-[9px] h-1 w-1 rounded-full bg-border" />
                      {p}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => startEdit(idx)}
                  className="absolute -top-1 right-0 hidden rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground group-hover/topic:block"
                  aria-label={`编辑议题 ${t.topic}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
