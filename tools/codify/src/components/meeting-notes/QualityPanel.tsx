// 「质量信号」面板：用户修正即反馈——把 editLog 里的修正事件聚合成生成质量的可观测信号。
// 与「用量统计」并排放置：用量回答「花了多少」，质量信号回答「产出好不好、该调什么」。
// 全部本地聚合、免费实时计算；结论只是提示（阈值保守，宁少说勿空话），改不改由用户决定。

import { useMemo, useState } from "react"
import { Lightbulb, TriangleAlert, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { analyzeQuality } from "@/lib/quality"
import { clearEditLog, loadEditLog, type EditEvent } from "@/lib/editLog"
import type { Meeting, MeetingTemplate } from "@/lib/store"

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`

export function QualityPanel({
  meetings,
  templates,
}: {
  meetings: Meeting[]
  templates: MeetingTemplate[]
}) {
  const [events, setEvents] = useState<EditEvent[]>(() => loadEditLog())
  const [confirmClear, setConfirmClear] = useState(false)

  const report = useMemo(() => analyzeQuality(events, meetings, templates), [events, meetings, templates])

  if (events.length === 0) {
    return (
      <section>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Lightbulb className="h-3 w-3" />
          质量信号
        </h3>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          你的每次修正都是质量信号：手改摘要 / 议题、删改行动项、放弃待确认条目、修改转写稿、
          还原整理稿——都会自动记在本机并聚合成「哪里生成得不好、该调什么」的证据，
          而不是等不满意积累成抱怨。开始正常使用后这里会自动出现分析
        </p>
      </section>
    )
  }

  const t = report.transcript
  const editTotal = t ? t.subs + t.inserts + t.deletes : 0

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Lightbulb className="h-3 w-3" />
          质量信号
          <span className="font-normal cjk-latin tabular-nums">
            · {report.events} 条修正记录
            {report.oldestAt
              ? `（自 ${new Date(report.oldestAt).toLocaleDateString("zh-CN")}）`
              : ""}
          </span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirmClear) {
              clearEditLog()
              setEvents([])
              setConfirmClear(false)
            } else {
              setConfirmClear(true)
              window.setTimeout(() => setConfirmClear(false), 3000)
            }
          }}
          className={cn(
            "h-6 shrink-0 gap-1 rounded-[var(--radius-sm)] px-2 text-[10px]",
            confirmClear ? "text-destructive" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Trash2 className="h-3 w-3" />
          {confirmClear ? "再点一次确认清空" : "清空记录"}
        </Button>
      </div>

      <div className="mt-2 space-y-2.5">
        {report.insights.length > 0 ? (
          <ul className="space-y-1.5">
            {report.insights.map((ins, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-[11px] leading-relaxed",
                  ins.level === "warn"
                    ? "border-amber-500/30 bg-amber-500/5 text-foreground/85"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {ins.level === "warn" ? (
                  <TriangleAlert className="mt-px h-3 w-3 shrink-0 text-amber-600 dark:text-amber-500" />
                ) : (
                  <Lightbulb className="mt-px h-3 w-3 shrink-0 text-primary/70" />
                )}
                <span className="min-w-0 flex-1">{ins.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: "摘要手改", value: `${report.summary.briefEdits + report.summary.outlineEdits} 次` },
            { label: "行动项删除", value: `${report.actions.deleted} 条` },
            { label: "手动补行动项", value: `${report.actions.addedManually} 条` },
            { label: "整理稿还原", value: `${report.polishUndos} 次` },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--radius-md)] border border-border bg-background px-2 py-1.5 text-center"
            >
              <p className="text-[13px] font-semibold text-foreground cjk-latin tabular-nums">{s.value}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {t ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-2">
            <p className="text-[11px] font-medium text-foreground">
              转写修正率 <span className="cjk-latin tabular-nums">{pct(t.rate)}</span>
              <span className="ml-1 font-normal text-muted-foreground cjk-latin">
                （{t.sessions} 次修正会话 · 改动 {t.editChars} 字 / 涉及会议共 {t.baseChars.toLocaleString()} 字）
              </span>
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              比 WER 更贴近实际体验的度量：你真正动手改了多少。
              {editTotal > 0
                ? `构成：同音错字替换 ${t.subs} 字（${pct(t.subs / editTotal)}）、删字 ${t.deletes}、补字 ${t.inserts}`
                : "尚无内容级改动"}
              {t.punctSessions > 0 ? `；只动标点 ${t.punctSessions} 次` : ""}
              {t.segmentSessions > 0 ? `；动断句 ${t.segmentSessions} 次` : ""}
              {t.speakerSessions > 0 ? `；动说话人标注 ${t.speakerSessions} 次` : ""}
            </p>
            {t.byKind.length > 1 ? (
              <ul className="mt-1.5 space-y-0.5">
                {t.byKind.slice(0, 4).map((k) => (
                  <li key={k.kind} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="w-24 shrink-0 truncate">{k.kind}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-muted">
                      <span
                        className={cn(
                          "block h-full rounded-[var(--radius-pill)]",
                          k.rate >= 0.08 ? "bg-amber-500/70" : "bg-primary/50",
                        )}
                        style={{ width: `${Math.min(100, k.rate * 400)}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right cjk-latin tabular-nums">
                      {pct(k.rate)} · {k.sessions} 次
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {report.summary.hotTopics.length > 0 ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-2">
            <p className="text-[11px] font-medium text-foreground">反复被手改的议题</p>
            <ul className="mt-1 space-y-0.5">
              {report.summary.hotTopics.map((h) => (
                <li key={h.topic} className="flex items-baseline gap-2 text-[10px] text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">「{h.topic}」</span>
                  <span className="shrink-0 cjk-latin tabular-nums">改过 {h.count} 次</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              同一议题反复被改 = 该类议题生成不稳定，可在「会议模板」的提示语里补组织要求
            </p>
          </div>
        ) : null}

        {report.actions.deleted > 0 ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-2">
            <p className="text-[11px] font-medium text-foreground">
              行动项删除率 <span className="cjk-latin tabular-nums">{pct(report.actions.deleteRate)}</span>
              <span className="ml-1 font-normal text-muted-foreground cjk-latin">
                （删 {report.actions.deleted} / 现存 AI 条目 {report.actions.aiOpen}）
              </span>
            </p>
            {report.actions.recentDeleted.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {report.actions.recentDeleted.map((d, i) => (
                  <li key={i} className="truncate text-[10px] text-muted-foreground">
                    被删：{d}
                  </li>
                ))}
              </ul>
            ) : null}
            {report.actions.pendingRejected + report.actions.pendingAccepted > 0 ? (
              <p className="mt-1 text-[10px] text-muted-foreground/80 cjk-latin">
                待确认队列：采纳 {report.actions.pendingAccepted} · 放弃 {report.actions.pendingRejected}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="text-[10px] leading-relaxed text-muted-foreground/80">
          修正记录只存本机（滚动保留最近 500 条），不进备份、不上传；转写修正的类型拆分
          （同音错字 / 丢词 / 断句 / 说话人）复用保真校验的字符级对齐引擎，非估算
        </p>
      </div>
    </section>
  )
}
