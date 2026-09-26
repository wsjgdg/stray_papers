// 评估台（个人 golden set）：调提示词 / 换模型后的「固定考卷」。
// 设计立场：机器能算的不让人打——
// ① 评估集管理：给代表性会议打星标（建议 5-10 场，每次运行可抽样 2-3 场控制成本）；
// ② 一键重跑：按当前提示词与模型跑完整生产管线，产出快照只存评估记录，绝不覆盖既有纪要；
//    顺手本地免费算三个自动指标：引用校验通过率（忠实度）、事实引用率与遗漏候选数（覆盖率）；
// ③ 评估以「对比判定」为主路径：与上一次运行并排看，点 本次更好 / 差不多 / 本次更差 三按钮即可，
//    四维细打分保留为可选的深度评估；每次运行留档，历史趋势可追踪。

import { useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Loader2,
  Play,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DIMENSION_HINTS,
  DIMENSION_LABELS,
  EVAL_DIMENSIONS,
  quotePassRateOf,
  runAverages,
  runScoredCount,
  runVerdictTally,
  type EvalDimension,
  type EvalMeetingResult,
  type EvalRun,
  type EvalScores,
} from "@/lib/evalRun"
import type { Meeting } from "@/lib/store"

interface EvalBenchDialogProps {
  open: boolean
  onClose: () => void
  meetings: Meeting[]
  evalBusy: boolean
  evalProgress: { done: number; total: number; title: string } | null
  evalError: string
  evalRuns: EvalRun[]
  onToggleGolden: (meetingId: string) => void
  onRun: (label: string, sample: number) => void
  onSaveScores: (runId: string, meetingId: string, patch: EvalScores) => void
  onSetLabel: (runId: string, label: string) => void
  onDeleteRun: (runId: string) => void
}

// 抽样档位：0 = 全量。默认抽 3 场——小成本高频跑，多次运行轮换覆盖评估集
const SAMPLE_OPTIONS = [
  { value: 2, label: "抽 2 场" },
  { value: 3, label: "抽 3 场" },
  { value: 0, label: "全量" },
]

export function EvalBenchDialog({
  open,
  onClose,
  meetings,
  evalBusy,
  evalProgress,
  evalError,
  evalRuns,
  onToggleGolden,
  onRun,
  onSaveScores,
  onSetLabel,
  onDeleteRun,
}: EvalBenchDialogProps) {
  const [label, setLabel] = useState("")
  const [sample, setSample] = useState(3)
  // 选中的历史运行（"" = 跟随最新）：新运行完成后 evalRuns[0] 即新记录，自动展示；
  // 用户点选历史运行时才固定——派生取值，不用 effect 同步状态
  const [selectedRunId, setSelectedRunId] = useState("")
  const [showPicker, setShowPicker] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const golden = useMemo(() => meetings.filter((m) => m.golden), [meetings])
  const runnable = golden.filter((m) => m.transcript.trim().length >= 20)
  const activeRun = evalRuns.find((r) => r.id === selectedRunId) ?? evalRuns[0] ?? null
  // 对比基准：activeRun 的上一次运行（evalRuns 新在前，往后找同会议有产出的最近一次）
  const prevRun = useMemo(() => {
    if (!activeRun) return null
    const idx = evalRuns.findIndex((r) => r.id === activeRun.id)
    return idx >= 0 ? (evalRuns[idx + 1] ?? null) : null
  }, [evalRuns, activeRun])

  const runCount = sample > 0 ? Math.min(sample, runnable.length) : runnable.length

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 dark:bg-background/70"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[var(--radius-lg)] border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-[var(--font-display)] text-sm font-semibold tracking-tight text-foreground">
            <FlaskConical className="h-4 w-4 text-primary" />
            评估台
            <span className="font-normal text-muted-foreground cjk-latin">
              · 评估集 {runnable.length} 场 · 历史运行 {evalRuns.length} 次
            </span>
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭评估台"
            className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* ── 运行区 ── */}
          <section>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              调完提示词或换完模型，用同一套评估集重跑生成管线。忠实度与覆盖率由机器自动算
              （引用校验通过率 / 事实引用率 / 遗漏候选数，本地免费），你只需要和上一次运行
              <span className="text-foreground/80">并排对比，点一下哪边更好</span>。重跑结果只存进评估记录，
              <span className="text-foreground/80">不会改动任何既有纪要</span>。
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="本次改了什么（选填），如：抽取提示词 v2 / 换模型"
                maxLength={40}
                className="h-8 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
              />
              <div
                className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] border border-border bg-background p-0.5"
                role="group"
                aria-label="抽样场数"
              >
                {SAMPLE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setSample(o.value)}
                    disabled={o.value > 0 && o.value >= runnable.length && runnable.length > 0}
                    title={
                      o.value > 0
                        ? `随机抽 ${o.value} 场运行，多次运行轮换覆盖评估集（省钱省时）`
                        : `运行评估集全部 ${runnable.length} 场`
                    }
                    className={cn(
                      "rounded-[var(--radius-sm)] px-2 py-1 text-[11px] transition-colors disabled:opacity-40",
                      sample === o.value
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                disabled={evalBusy || runnable.length === 0}
                onClick={() => {
                  setSelectedRunId("") // 运行结束后自动落在新记录上
                  onRun(label, sample > 0 && sample < runnable.length ? sample : 0)
                }}
                title={
                  runnable.length === 0
                    ? "先在下方给会议打上「评估集」星标"
                    : `按当前提示词与模型重跑 ${runCount} 场（每场最多 3 次调用），先弹费用确认`
                }
                className="h-8 shrink-0 gap-1.5 rounded-[var(--radius-md)] bg-primary px-3.5 text-xs text-primary-foreground hover:bg-primary/90"
              >
                {evalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {evalBusy ? "评估中…" : `运行评估（${runCount} 场）`}
              </Button>
            </div>
            {evalBusy && evalProgress ? (
              <div className="mt-2 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2">
                <p className="text-xs text-foreground/85">
                  正在评估 {evalProgress.done + 1}/{evalProgress.total}：《{evalProgress.title}》…
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-[var(--radius-pill)] bg-primary/15">
                  <div
                    className="h-full rounded-[var(--radius-pill)] bg-primary transition-all"
                    style={{ width: `${(evalProgress.done / evalProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}
            {evalError ? (
              <p className="mt-2 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
                {evalError}
              </p>
            ) : null}
          </section>

          {/* ── 评估集管理 ── */}
          <section>
            <button
              onClick={() => setShowPicker((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPicker ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              评估集成员（{golden.length}）
              <span className="font-normal">· 点星号增减</span>
            </button>
            {showPicker ? (
              <>
                <p className="mt-1.5 pl-4 text-[10px] leading-relaxed text-muted-foreground">
                  建议选 5-10 场有代表性的会议固定下来：中英混说、多人讨论、专有名词密集、无明确结论……
                  类型覆盖越全，评估越能反映真实质量；转写稿少于 20 字的会议不会被运行
                </p>
                <ul className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto pl-4 pr-1">
                  {[...meetings]
                    .sort((a, b) => Number(Boolean(b.golden)) - Number(Boolean(a.golden)) || b.updatedAt - a.updatedAt)
                    .map((m) => (
                      <li key={m.id}>
                        <button
                          onClick={() => onToggleGolden(m.id)}
                          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left transition-colors hover:bg-background/70"
                        >
                          <Star
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 transition-colors",
                              m.golden ? "fill-amber-400 text-amber-500" : "text-muted-foreground/40",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/85">
                            {m.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground cjk-latin tabular-nums">
                            {m.date} · {m.transcript.length.toLocaleString()} 字
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </section>

          {/* ── 历史运行趋势 ── */}
          {evalRuns.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground">历史运行（点选查看与打分）</h3>
              <ul className="mt-1.5 space-y-1">
                {evalRuns.map((r) => {
                  const avg = runAverages(r)
                  const scored = runScoredCount(r)
                  const tally = runVerdictTally(r)
                  const active = activeRun?.id === r.id
                  return (
                    <li key={r.id}>
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 transition-colors",
                          active
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-background hover:border-primary/25",
                        )}
                      >
                        <button
                          onClick={() => setSelectedRunId(r.id)}
                          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                        >
                          <span className="shrink-0 text-[10px] text-muted-foreground cjk-latin tabular-nums">
                            {new Date(r.at).toLocaleString("zh-CN", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground/85">
                            {r.label || "（未标注改动）"}
                            {r.sampledCount ? (
                              <span className="ml-1.5 font-normal text-muted-foreground cjk-latin tabular-nums">
                                抽 {r.sampledCount}/{r.goldenTotal} 场
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground cjk-latin tabular-nums">
                            {tally.total > 0
                              ? `↑${tally.better} ＝${tally.same} ↓${tally.worse}`
                              : EVAL_DIMENSIONS.map((d) =>
                                  avg[d] !== null ? `${DIMENSION_LABELS[d][0]}${avg[d]!.toFixed(1)}` : null,
                                )
                                  .filter(Boolean)
                                  .join(" ") || "未评判"}
                            {" · "}
                            {scored}/{r.results.length} 已评
                          </span>
                        </button>
                        <button
                          onClick={() => onDeleteRun(r.id)}
                          aria-label="删除这次运行"
                          className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-muted-foreground/50 transition-colors hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {/* ── 当前运行详情：与上一次运行并排对比，三按钮判定 ── */}
          {activeRun ? <RunDetail
            key={activeRun.id}
            run={activeRun}
            prevRun={prevRun}
            expanded={expanded}
            setExpanded={setExpanded}
            onSaveScores={onSaveScores}
            onSetLabel={onSetLabel}
          /> : null}
        </div>
      </div>
    </div>
  )
}

function RunDetail({
  run,
  prevRun,
  expanded,
  setExpanded,
  onSaveScores,
  onSetLabel,
}: {
  run: EvalRun
  prevRun: EvalRun | null
  expanded: Record<string, boolean>
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onSaveScores: (runId: string, meetingId: string, patch: EvalScores) => void
  onSetLabel: (runId: string, label: string) => void
}) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState(run.label)

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          运行详情 ·{" "}
          {new Date(run.at).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          <span className="ml-1 font-normal cjk-latin">
            （首选模型 {run.preferredModel}
            {run.sampledCount ? ` · 抽样 ${run.sampledCount}/${run.goldenTotal} 场` : ""}）
          </span>
        </h3>
        {editingLabel ? (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSetLabel(run.id, labelDraft.trim())
                  setEditingLabel(false)
                }
                if (e.key === "Escape") setEditingLabel(false)
              }}
              maxLength={40}
              className="h-6 w-40 rounded-[var(--radius-sm)] border border-primary bg-background px-1.5 text-[11px] outline-none"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                onSetLabel(run.id, labelDraft.trim())
                setEditingLabel(false)
              }}
            >
              保存
            </Button>
          </span>
        ) : (
          <button
            onClick={() => {
              setLabelDraft(run.label)
              setEditingLabel(true)
            }}
            className="text-[10px] text-primary/80 underline underline-offset-2 hover:text-primary"
          >
            {run.label ? "改标注" : "补一句本次改了什么"}
          </button>
        )}
      </div>

      <ul className="mt-2 space-y-2.5">
        {run.results.map((r) => {
          const scores = run.scores[r.meetingId] ?? {}
          const isOpen = expanded[r.meetingId] ?? true
          const prev = prevRun?.results.find((p) => p.meetingId === r.meetingId && !p.error) ?? null
          return (
            <li key={r.meetingId} className="rounded-[var(--radius-md)] border border-border bg-background">
              <button
                onClick={() => setExpanded((prev2) => ({ ...prev2, [r.meetingId]: !isOpen }))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                  《{r.title}》
                </span>
                {r.error ? (
                  <span className="shrink-0 rounded-[var(--radius-pill)] border border-destructive/40 bg-destructive/5 px-1.5 py-px text-[10px] text-destructive">
                    失败
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground cjk-latin">
                    {r.model !== run.preferredModel ? `${r.model}（降级） · ` : ""}
                    事实 {r.factsCount} 条{r.usedFallback ? " · 回退一次成稿" : ""} · 丢弃 {r.discardedCount}
                    {scores.verdict
                      ? ` · ${scores.verdict === "better" ? "判定更好" : scores.verdict === "worse" ? "判定更差" : "判定持平"}`
                      : ""}
                  </span>
                )}
              </button>

              {isOpen && !r.error ? (
                <div className="space-y-2.5 border-t border-border px-3 py-2.5">
                  <AutoMetricsRow result={r} />

                  {/* 对比判定：主评估路径。与上一次运行的同场产出并排，点一下哪边更好 */}
                  {prev ? (
                    <div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <SummaryBlock caption={`上一次 · ${prevRun?.label || "未标注"}`} result={prev} dim />
                        <SummaryBlock caption="本次运行" result={r} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-[10px] text-muted-foreground">本次比上一次：</span>
                        {(
                          [
                            { v: "better", label: "本次更好", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
                            { v: "same", label: "差不多", cls: "border-border bg-muted text-muted-foreground" },
                            { v: "worse", label: "本次更差", cls: "border-destructive/40 bg-destructive/5 text-destructive" },
                          ] as const
                        ).map((o) => (
                          <button
                            key={o.v}
                            onClick={() => onSaveScores(run.id, r.meetingId, { verdict: o.v })}
                            className={cn(
                              "rounded-[var(--radius-pill)] border px-2.5 py-1 text-[11px] transition-colors",
                              scores.verdict === o.v
                                ? o.cls
                                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                            )}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <SummaryBlock caption="本次产出" result={r} />
                      <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                        这场会议在上一次运行里没有产出（首次运行或未抽中）——再运行一次后即可并排对比、三按钮判定
                      </p>
                    </>
                  )}

                  {/* 本次抽取的行动项明细（对比视图里默认收起，评可操作性时展开看） */}
                  {r.actions.length > 0 ? (
                    <details className="rounded-[var(--radius-md)] border border-border/70 bg-card/40">
                      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground cjk-latin">
                        抽取的行动项（{r.actions.length}）
                      </summary>
                      <ul className="space-y-0.5 border-t border-border/70 px-2.5 py-2">
                        {r.actions.map((a, i) => (
                          <li key={i} className="text-[11px] leading-relaxed text-foreground/75">
                            □ {a.content}
                            {a.assignee ? <span className="text-muted-foreground"> @{a.assignee}</span> : null}
                            {a.dueDate ? (
                              <span className="text-muted-foreground cjk-latin"> · 截止 {a.dueDate}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  {/* 四维细打分：降级为可选的深度评估，默认收起 */}
                  <details className="rounded-[var(--radius-md)] border border-border/70 bg-card/40">
                    <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
                      细打分（可选）· 忠实度 / 覆盖率 / 可操作性 / 可读性
                      {runScoredCount({ ...run, results: [r] }) > 0 ? " · 已打" : ""}
                    </summary>
                    <div className="space-y-1.5 border-t border-border/70 px-2.5 py-2">
                      <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                        忠实度与覆盖率已有自动指标参考（上方）；人工分更适合可操作性与可读性这类主观维度
                      </p>
                      {EVAL_DIMENSIONS.map((dim) => (
                        <ScoreRow
                          key={dim}
                          dim={dim}
                          value={scores[dim]}
                          onPick={(v) => onSaveScores(run.id, r.meetingId, { [dim]: v })}
                        />
                      ))}
                      <input
                        defaultValue={scores.note ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v !== (scores.note ?? "")) {
                            onSaveScores(run.id, r.meetingId, { note: v })
                          }
                        }}
                        placeholder="备注（如「定价议题又漏了」「负责人张冠李戴」）"
                        maxLength={100}
                        className="h-7 w-full rounded-[var(--radius-sm)] border border-border bg-background px-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary"
                      />
                    </div>
                  </details>
                </div>
              ) : null}
              {isOpen && r.error ? (
                <p className="border-t border-border px-3 py-2 text-[11px] text-destructive">{r.error}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// 自动指标行：机器算出来的忠实度 / 覆盖率代理，本地免费，跑管线时顺手产出
function AutoMetricsRow({ result }: { result: EvalMeetingResult }) {
  const pass = result.auto ? quotePassRateOf(result) : null
  const ref = result.auto?.factReferenceRate ?? null
  const om = result.auto?.omissionCount ?? null
  if (pass === null && ref === null && om === null) {
    return (
      <p className="text-[10px] text-muted-foreground/70">
        这次运行没有自动指标（旧记录或回退路径）——对比判定与细打分仍可用
      </p>
    )
  }
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)
  const passLow = pass !== null && pass < 0.8
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-muted/50 px-2.5 py-1.5 text-[10px] text-muted-foreground">
      <span className="font-medium text-foreground/70">自动指标</span>
      <span
        className={cn("cjk-latin tabular-nums", passLow && "font-medium text-amber-600 dark:text-amber-500")}
        title="模型给出的事实引用中，通过原文逐字对账的比例——越低说明编造/改写越多（忠实度的机器代理）"
      >
        引用校验通过率 {pct(pass)}
      </span>
      <span
        className="cjk-latin tabular-nums"
        title="已核验事实中被议题要点实际引用的比例——低说明高价值事实没被组织进摘要（覆盖率的机器代理）"
      >
        事实引用率 {pct(ref)}
      </span>
      <span
        className={cn("cjk-latin tabular-nums", (om ?? 0) > 0 && "text-foreground/75")}
        title="本地规则从转写稿抽关键实体/数字/时间点，摘要未提及的条数（遗漏自查同口径）"
      >
        疑似遗漏 {om ?? "—"} 处
      </span>
    </div>
  )
}

// 摘要快照块：对比时左右各一个，本次运行的一侧视觉更实
function SummaryBlock({
  caption,
  result,
  dim,
}: {
  caption: string
  result: EvalMeetingResult
  dim?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-2.5 py-2",
        dim ? "border-border/70 bg-card/40" : "border-primary/25 bg-primary/[0.03]",
      )}
    >
      <p className="text-[10px] font-medium text-muted-foreground">{caption}</p>
      {result.brief ? (
        <p className={cn("mt-1 text-[11px] font-medium leading-relaxed", dim ? "text-foreground/70" : "text-foreground")}>
          {result.brief}
        </p>
      ) : null}
      <ol className="mt-1 space-y-0.5">
        {result.topics.map((t, i) => (
          <li key={i} className="text-[10px] leading-relaxed">
            <span className={cn("font-semibold", dim ? "text-foreground/70" : "text-foreground/85")}>
              {i + 1}. {t.topic}
            </span>
            <span className={cn("ml-1", dim ? "text-muted-foreground/80" : "text-foreground/65")}>
              {t.points.join("；").slice(0, 120)}
              {t.points.join("；").length > 120 ? "…" : ""}
            </span>
          </li>
        ))}
      </ol>
      {result.actions.length > 0 ? (
        <p className="mt-1 text-[10px] text-muted-foreground cjk-latin tabular-nums">
          行动项 {result.actions.length} 条
          {result.actions.filter((a) => a.assignee).length > 0
            ? ` · 带负责人 ${result.actions.filter((a) => a.assignee).length}`
            : ""}
        </p>
      ) : null}
    </div>
  )
}

function ScoreRow({
  dim,
  value,
  onPick,
}: {
  dim: EvalDimension
  value?: number
  onPick: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-16 shrink-0 text-[11px] text-muted-foreground"
        title={DIMENSION_HINTS[dim]}
      >
        {DIMENSION_LABELS[dim]}
      </span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => onPick(v)}
            title={`${DIMENSION_LABELS[dim]} ${v} 分`}
            className={cn(
              "h-5 w-5 rounded-[var(--radius-sm)] border text-[10px] transition-colors cjk-latin tabular-nums",
              value === v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/70">
        {DIMENSION_HINTS[dim]}
      </span>
    </div>
  )
}
