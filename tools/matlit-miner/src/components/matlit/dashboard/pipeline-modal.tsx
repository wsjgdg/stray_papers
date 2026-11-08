'use client'

import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Ban,
  Minus,
  Search,
  Sparkles,
  Microscope,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useProgressSocket } from '@/hooks/use-progress-socket'
import { useI18n } from '@/components/i18n/provider'
import type { PipelineState } from './types'

/**
 * PipelineProgressModal — overlay shown while the fill-all-data pipeline runs.
 *
 * Subscribes to the batch-progress WebSocket (via useProgressSocket) so the
 * classify / extract steps can show fine-grained "X/Y papers" progress. When
 * the WebSocket isn't connected, falls back to step-level progress derived
 * from the API response totals.
 *
 * Behavior:
 *  - While running, ESC / outside-click are blocked (so the user can't
 *    accidentally dismiss the modal mid-pipeline). The Cancel button stops
 *    after the current step completes.
 *  - On done / cancelled / failed, a Close button replaces Cancel and the
 *    modal can be dismissed normally.
 *  - On done, a summary panel shows the inserted/processed counts and the
 *    health delta (start → end).
 *  - On failed, an error message panel shows `state.errorMessage`.
 */
export function PipelineProgressModal({
  open,
  onOpenChange,
  state,
  onCancel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: PipelineState
  onCancel: () => void
}) {
  const { t } = useI18n()
  const { jobs } = useProgressSocket()

  const isRunning =
    state.step === 'search' ||
    state.step === 'classify' ||
    state.step === 'extract'
  const isDone = state.step === 'done'
  const isCancelled = state.step === 'cancelled'
  const isFailed = state.step === 'failed'

  // Find the live WebSocket job for the current step (if any)
  const activeJobId =
    state.step === 'classify'
      ? state.classifyJobId
      : state.step === 'extract'
        ? state.extractJobId
        : null
  const wsJob = activeJobId
    ? jobs.find((j) => j.id === activeJobId)
    : undefined

  // --- i18n ---
  const titleText = t('dashboard.pipelineModal.title')
  const descText = t('dashboard.pipelineModal.desc')
  const overallLabelText = t('dashboard.pipelineModal.overall')
  const stepSearchLabel = t('dashboard.pipelineModal.step.search')
  const stepClassifyLabel = t('dashboard.pipelineModal.step.classify')
  const stepExtractLabel = t('dashboard.pipelineModal.step.extract')
  const cancelLabel = t('dashboard.pipelineModal.cancel')
  const closeLabel = t('dashboard.pipelineModal.close')
  const doneTitleLabel = t('dashboard.pipelineModal.doneTitle')
  const cancelledTitleLabel = t('dashboard.pipelineModal.cancelledTitle')
  const failedTitleLabel = t('dashboard.pipelineModal.failedTitle')
  const summaryLabel = t('dashboard.pipelineModal.summary')
  const papersWord = t('dashboard.pipelineModal.papersWord')
  const materialsWord = t('dashboard.pipelineModal.materialsWord')
  const healthWord = t('dashboard.pipelineModal.healthWord')
  const searchingHint = t('dashboard.pipelineModal.searchingHint')
  const classifyHint = t('dashboard.pipelineModal.classifyHint')
  const extractHint = t('dashboard.pipelineModal.extractHint')
  const noDataText = t('dashboard.pipelineModal.noData')

  // Compute overall percentage across the 3 steps.
  const computeOverallPct = () => {
    const stepsArr = [state.steps.search, state.steps.classify, state.steps.extract]
    let total = 0
    let done = 0
    for (const s of stepsArr) {
      if (s.status === 'completed' || s.status === 'skipped') {
        total += 1
        done += 1
      } else if (s.status === 'running') {
        total += 1
        if (s.total > 0) {
          done += Math.min(1, s.done / s.total)
        }
      } else if (s.status === 'pending') {
        total += 1
      } else if (s.status === 'failed') {
        total += 1
        // count failed step as 1 toward total but 0 toward done
      }
    }
    return total === 0 ? 0 : (done / total) * 100
  }
  const overallPct = computeOverallPct()

  // Resolve live progress for the currently-running classify / extract step.
  const resolveStepDisplay = (key: 'search' | 'classify' | 'extract') => {
    const s = state.steps[key]
    if (key === 'search') {
      // search-batch doesn't stream WS progress; just use the final state.
      return { done: s.done, total: s.total, inserted: s.inserted }
    }
    // For classify/extract, prefer live WS data when the step is running
    if (
      key === state.step &&
      wsJob &&
      wsJob.id === (key === 'classify' ? state.classifyJobId : state.extractJobId)
    ) {
      return { done: wsJob.done, total: wsJob.total, inserted: s.inserted }
    }
    return { done: s.done, total: s.total, inserted: s.inserted }
  }

  const stepDefs: Array<{
    key: 'search' | 'classify' | 'extract'
    icon: React.ElementType
    label: string
    hint: string
  }> = [
    { key: 'search', icon: Search, label: stepSearchLabel, hint: searchingHint },
    { key: 'classify', icon: Sparkles, label: stepClassifyLabel, hint: classifyHint },
    { key: 'extract', icon: Microscope, label: stepExtractLabel, hint: extractHint },
  ]

  const dialogTitle = isDone
    ? doneTitleLabel
    : isCancelled
      ? cancelledTitleLabel
      : isFailed
        ? failedTitleLabel
        : titleText

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!isRunning}
        // Prevent ESC / outside-click from closing while running
        onPointerDownOutside={(e) => {
          if (isRunning) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isRunning) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isDone ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : isCancelled ? (
              <Ban className="w-5 h-5 text-slate-500" />
            ) : isFailed ? (
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            )}
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>{descText}</DialogDescription>
        </DialogHeader>

        {/* Overall progress bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {overallLabelText}
            </span>
            <span className="tabular-nums text-slate-500">{overallPct.toFixed(0)}%</span>
          </div>
          <Progress value={overallPct} className="h-2 [&>div]:bg-emerald-500" />
        </div>

        {/* Step list */}
        <div className="space-y-2">
          {stepDefs.map((def) => {
            const Icon = def.icon
            const s = state.steps[def.key]
            const display = resolveStepDisplay(def.key)
            const isActive = state.step === def.key
            const isStepDone = s.status === 'completed'
            const isStepFailed = s.status === 'failed'
            const isStepSkipped = s.status === 'skipped'
            const isStepRunning = s.status === 'running'

            // Right-side status text
            let statusText = ''
            if (isStepDone) {
              if (def.key === 'search') {
                statusText =
                  display.inserted !== undefined && display.inserted > 0
                    ? `+${display.inserted} ${papersWord}`
                    : noDataText
              } else {
                statusText =
                  display.total > 0
                    ? `${display.done}/${display.total}`
                    : noDataText
              }
            } else if (isStepRunning) {
              statusText =
                display.total > 0
                  ? `${display.done}/${display.total}`
                  : def.hint
            } else if (isStepFailed) {
              statusText = t('dashboard.pipelineModal.status.failed')
            } else if (isStepSkipped) {
              statusText = t('dashboard.pipelineModal.status.skipped')
            } else {
              statusText = t('dashboard.pipelineModal.status.pending')
            }

            return (
              <div
                key={def.key}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  isActive
                    ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20'
                    : isStepDone
                      ? 'border-emerald-200 dark:border-emerald-800'
                      : isStepFailed
                        ? 'border-rose-200 dark:border-rose-800'
                        : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isStepDone
                      ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                      : isStepRunning
                        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                        : isStepFailed
                          ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                          : isStepSkipped
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {isStepDone ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isStepRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isStepFailed ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : isStepSkipped ? (
                    <Minus className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {def.label}
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums truncate">
                      {statusText}
                    </span>
                  </div>
                  {isStepRunning && display.total > 0 && (
                    <div className="mt-1.5 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (display.done / Math.max(1, display.total)) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  {isStepFailed && s.message && (
                    <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 truncate">
                      {s.message}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary on done */}
        {isDone && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-sm">
            <div className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {summaryLabel}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
              <div>
                {stepSearchLabel}: {state.steps.search.inserted ?? 0} {papersWord}{' '}
                <span className="text-slate-400">
                  ({state.steps.search.total} {materialsWord})
                </span>
              </div>
              <div>
                {stepClassifyLabel}: {state.steps.classify.processed ?? 0}/
                {state.steps.classify.total || (state.steps.classify.processed ?? 0)}
                {state.steps.classify.errors ? (
                  <span className="text-amber-600">
                    {' '}
                    · {state.steps.classify.errors}{' '}
                    {t('dashboard.pipelineModal.errors')}
                  </span>
                ) : null}
              </div>
              <div>
                {stepExtractLabel}: {state.steps.extract.processed ?? 0}/
                {state.steps.extract.total || (state.steps.extract.processed ?? 0)}
                {state.steps.extract.errors ? (
                  <span className="text-amber-600">
                    {' '}
                    · {state.steps.extract.errors}{' '}
                    {t('dashboard.pipelineModal.errors')}
                  </span>
                ) : null}
              </div>
              <div className="pt-1.5 mt-1.5 border-t border-emerald-200/60 dark:border-emerald-800/60">
                {healthWord}:{' '}
                <span className="font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {state.startHealth}
                </span>{' '}
                →{' '}
                <span className="font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {state.endHealth ?? state.startHealth}
                </span>
                {(state.endHealth ?? 0) > state.startHealth && (
                  <span className="ml-1 text-emerald-600">
                    (+{(state.endHealth ?? 0) - state.startHealth})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error message on failure */}
        {isFailed && state.errorMessage && (
          <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/20 p-3 text-sm text-rose-700 dark:text-rose-300">
            <div className="font-semibold mb-0.5 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {failedTitleLabel}
            </div>
            <div className="text-xs break-words">{state.errorMessage}</div>
          </div>
        )}

        {/* Cancelled note */}
        {isCancelled && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/20 p-3 text-xs text-slate-600 dark:text-slate-400">
            {t('dashboard.pipelineModal.cancelledNote')}
          </div>
        )}

        <DialogFooter>
          {isRunning && (
            <Button
              variant="outline"
              onClick={onCancel}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <Ban className="w-4 h-4 mr-1.5" />
              {cancelLabel}
            </Button>
          )}
          {(isDone || isCancelled || isFailed) && (
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {closeLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
