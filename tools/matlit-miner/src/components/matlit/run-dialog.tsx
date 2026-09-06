'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Clock, Check, CheckCircle2, Layers, Target, AlertCircle, FileText, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/provider'
import { useJobStore, type JobType, type JobAccent } from '@/lib/job-store'

/**
 * Shape returned by GET /api/jobs/[id] (see src/lib/server-job-progress.ts).
 * Polled once per second while `phase === 'running'` so the progress bar
 * reflects REAL per-paper completion instead of a linear time-based estimate.
 * When the endpoint returns 404 (e.g. for `/api/extract` which doesn't yet
 * report progress here, or for very fast scopes that finish before the first
 * poll lands), the dialog silently falls back to the time-based estimate.
 */
interface ServerJobSnapshot {
  id: string
  completed: number
  total: number
  currentPaperTitle: string
  status: 'running' | 'done' | 'error'
  errors: number
  message: string
}

/**
 * Infer the global job type from the dialog title so we can route the run to
 * the correct header indicator icon without requiring every caller to pass an
 * explicit `jobType` prop (which would force edits to classification-tab /
 * extraction-tab — off-limits in this task).
 */
function inferJobType(title: string): JobType {
  const t = title.toLowerCase()
  if (t.includes('classif') || t.includes('分类')) return 'classify'
  if (t.includes('extract') || t.includes('提取')) return 'extract'
  return 'search'
}

export interface RunScope {
  value: string
  label: string
  description: string
  costEstimate: string
  /** Estimated wall-clock seconds for this scope (used by the countdown). */
  estimatedSeconds: number
  count: number
  disabled?: boolean
}

interface RunDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  icon?: React.ReactNode
  scopes: RunScope[]
  defaultScope?: string
  onConfirm: (scope: string) => void
  isPending?: boolean
  /** Color accent for the confirm button + selected card ring */
  accent?: 'violet' | 'rose' | 'emerald'
}

const accentMap = {
  violet: {
    btn: 'bg-violet-600 hover:bg-violet-700 text-white',
    ring: 'ring-violet-400 border-violet-400 bg-violet-50/50 dark:bg-violet-950/20',
    dot: 'text-violet-600 dark:text-violet-400',
    chip: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900',
    bar: 'bg-violet-500',
  },
  rose: {
    btn: 'bg-rose-600 hover:bg-rose-700 text-white',
    ring: 'ring-rose-400 border-rose-400 bg-rose-50/50 dark:bg-rose-950/20',
    dot: 'text-rose-600 dark:text-rose-400',
    chip: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900',
    bar: 'bg-rose-500',
  },
  emerald: {
    btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    ring: 'ring-emerald-400 border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20',
    dot: 'text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    bar: 'bg-emerald-500',
  },
} as const

type Phase = 'idle' | 'running' | 'completed'

export function RunDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  scopes,
  defaultScope,
  onConfirm,
  isPending = false,
  accent = 'violet',
}: RunDialogProps) {
  const { t } = useI18n()
  const firstEnabled = scopes.find((s) => !s.disabled)?.value ?? scopes[0]?.value
  const [selected, setSelected] = useState<string>(defaultScope ?? firstEnabled ?? '')

  // Countdown / progress state
  const [runningScope, setRunningScope] = useState<RunScope | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  // R5 — cancel support:
  // `cancelling` flips to true the moment the user clicks Cancel during a
  // run. While true, the Cancel button is disabled + relabeled and a
  // "Cancel requested" hint appears in the progress view. The state is
  // reset when the underlying mutation settles (isPending → false).
  const [cancelling, setCancelling] = useState(false)
  // `pendingCancel` covers the brief window between handleConfirm and the
  // first successful poll of /api/jobs/<id> — during that window we don't
  // yet know the server-side job id, so we can't POST to /cancel. We stash
  // the intent here and an effect fires the POST as soon as the polling
  // effect adopts a server job.
  const [pendingCancel, setPendingCancel] = useState(false)
  // Track whether we've ever seen isPending=true during the current run, so a
  // very-fast mutation (false on the first render after confirm) doesn't trip
  // the completion transition prematurely.
  const sawPendingRef = useRef(false)
  // Wall-clock start timestamp (ms) captured the instant a run begins. Used to
  // derive `elapsed` so the countdown stays accurate even if the browser
  // throttles the 1s interval (background tabs, slow event loop, etc.) and so
  // overtime is measured against real time, not tick count.
  const startRef = useRef<number | null>(null)
  // Global job id from the Zustand job-store. Non-null while a job is being
  // driven by this dialog instance (across the running + completed phases).
  const jobIdRef = useRef<string | null>(null)
  // Guards against double-marking the same job done (React strict-mode double
  // effects, or the watcher firing after a dismissal).
  const jobDoneRef = useRef(false)

  // ─── Real server-side progress (P0-3) ───────────────────────────────
  // The parent's `onConfirm(scope)` triggers a mutation that POSTs to
  // /api/classify (or /api/extract). The classify route now writes real
  // per-paper progress to an in-memory Map (src/lib/server-job-progress.ts)
  // and exposes it via GET /api/jobs/[id]. We poll that endpoint once per
  // second while `phase === 'running'` and use the real `completed/total`
  // when available. If the endpoint returns 404 (e.g. for /api/extract,
  // or for very fast scopes that finish before the first poll), we fall
  // back to the time-based estimate that was already in place.
  //
  // `serverJobIdRef` is set once we've adopted a specific job (so subsequent
  // polls hit /api/jobs/<id> directly instead of /api/jobs/latest). It's a
  // ref, not state, because changing it shouldn't trigger a re-render — the
  // polling effect reads it on each tick.
  const serverJobIdRef = useRef<string | null>(null)
  // `pollSinceRef` is the wall-clock timestamp used as the `?since=` filter
  // when discovering the server job. Set in handleConfirm; lets us avoid
  // adopting a stale job from a prior run.
  const pollSinceRef = useRef<number | null>(null)
  // Latest snapshot from the server (null = no server progress yet, fall
  // back to estimate). Kept in STATE (not a ref) because the progress bar
  // UI depends on it directly.
  const [serverProgress, setServerProgress] = useState<ServerJobSnapshot | null>(null)

  // Job-store actions (stable identities from Zustand).
  const addJob = useJobStore((s) => s.addJob)
  const updateJob = useJobStore((s) => s.updateJob)
  const removeJob = useJobStore((s) => s.removeJob)

  // Reset selection to the default/first-enabled scope whenever the dialog opens
  // or the scope list changes.
  useEffect(() => {
    if (open) {
      const next = defaultScope ?? scopes.find((s) => !s.disabled)?.value ?? scopes[0]?.value ?? ''
      setSelected(next)
    }
  }, [open, defaultScope, scopes])

  // Reset run state when the dialog closes (e.g. user dismissed via ESC or
  // backdrop click — though Cancel is disabled during running, this protects
  // against any external close). NOTE: we deliberately do NOT reset
  // `sawPendingRef` or `jobIdRef` here — if the dialog is dismissed while a
  // run is in flight, the global job watcher below still needs them to mark
  // the job done when the mutation eventually settles. They are reset in
  // `handleConfirm` (next run) and in the completion-path timeout (this run).
  useEffect(() => {
    if (!open) {
      setPhase('idle')
      setRunningScope(null)
      setElapsed(0)
      startRef.current = null
      // Clear server-progress state too — but keep `serverJobIdRef` until the
      // next handleConfirm so the isPending watcher can still see the final
      // snapshot if it needs to.
      setServerProgress(null)
      pollSinceRef.current = null
      // R5: clear cancel-related state so a re-open starts fresh.
      setCancelling(false)
      setPendingCancel(false)
    }
  }, [open])

  // Tick `elapsed` once per second while running. Derived from the actual
  // start timestamp so it counts UP past the estimate (overtime) without
  // clamping, and survives interval throttling.
  useEffect(() => {
    if (phase !== 'running') return
    const tickFn = () => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
      }
    }
    // Fire once immediately so the first second doesn't show a stale 0.
    tickFn()
    const id = setInterval(tickFn, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Simulate per-item progress for the global job so the header indicator
  // moves smoothly between registration and the actual mutation settling.
  // The simulation linearly ramps `completed` from 0 to `total` over the
  // scope's `estimatedSeconds`; when the mutation settles we clamp to total.
  // Dependent on `phase === 'running'` so the interval stops when the dialog
  // transitions to completed (or is dismissed externally).
  //
  // IMPORTANT (P0-3): this simulation is the FALLBACK. When the server-side
  // polling effect below has adopted a real job (`serverProgress !== null`),
  // we stop simulating so the real `completed` from /api/jobs/[id] is the
  // source of truth. This effect re-runs (and re-bails) whenever
  // `hasServerProgress` flips, cleaning up its interval via the returned
  // cleanup function.
  const hasServerProgress = serverProgress !== null
  useEffect(() => {
    if (phase !== 'running') return
    if (hasServerProgress) return // real progress is driving the store now
    const jobId = jobIdRef.current
    if (!jobId || !runningScope) return
    const total = Math.max(1, runningScope.count)
    const est = Math.max(1, runningScope.estimatedSeconds)
    const tickMs = 100
    const incPerTick = total / (est * (1000 / tickMs))
    const tickFn = () => {
      const cur = useJobStore.getState().jobs.find((j) => j.id === jobId)
      if (!cur || cur.status !== 'running') return
      const next = Math.min(cur.total, cur.completed + incPerTick)
      updateJob(jobId, { completed: next })
    }
    // Fire once immediately so the indicator shows > 0 right away.
    tickFn()
    const id = window.setInterval(tickFn, tickMs)
    return () => window.clearInterval(id)
  }, [phase, runningScope, updateJob, hasServerProgress])

  // ─── Real server-progress polling (P0-3) ─────────────────────────────
  // Polls /api/jobs/latest?type=<inferredType>&since=<pollSinceRef> every 1s
  // while `phase === 'running'` and we have NOT yet adopted a server job.
  // Once a job is found, switches to polling /api/jobs/<id> directly (faster
  // + avoids accidentally adopting a newer job from a different tab).
  //
  // The fetched `completed` is pushed to the Zustand job-store so the header
  // indicator reflects real progress too — not just this dialog.
  //
  // When the server reports `status === 'done' | 'error'`, we keep the last
  // snapshot (so the UI can show 100%) and stop polling. The actual dialog
  // `phase` transition to 'completed' is still driven by the isPending
  // watcher below — we don't preempt it because the POST response may carry
  // additional context (toast, invalidations) that the parent's onSuccess
  // handler needs.
  useEffect(() => {
    if (phase !== 'running') return
    if (pollSinceRef.current === null) return

    let cancelled = false
    const inferredType = inferJobType(title)

    async function pollOnce(): Promise<void> {
      if (cancelled) return
      try {
        // If we already have an adopted server job id, poll it directly.
        // Otherwise, discover it via /api/jobs/latest (filtered by type +
        // since-timestamp so we never adopt a stale job from a prior run).
        const path = serverJobIdRef.current
          ? `/api/jobs/${encodeURIComponent(serverJobIdRef.current)}`
          : `/api/jobs/latest?type=${encodeURIComponent(inferredType)}&since=${pollSinceRef.current!}`
        const resp = await fetch(path, { headers: { Accept: 'application/json' } })
        if (cancelled) return
        if (!resp.ok) return // 404 = no server job yet; fall back to estimate
        const data = (await resp.json()) as ServerJobSnapshot
        if (cancelled) return
        // Adopt the job id on first sighting (idempotent).
        if (!serverJobIdRef.current) {
          serverJobIdRef.current = data.id
        }
        setServerProgress(data)
        // Push REAL progress to the Zustand job-store so the app-header
        // indicator (header-job-indicator.tsx) shows real numbers too.
        const jobId = jobIdRef.current
        if (jobId) {
          updateJob(jobId, { completed: data.completed })
        }
      } catch {
        // Network/parse error — silently fall back to estimate.
      }
    }

    // Fire immediately, then every 1s.
    void pollOnce()
    const id = window.setInterval(() => void pollOnce(), 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // NOTE: `serverJobIdRef` and `pollSinceRef` are intentionally NOT deps —
    // they're refs and the polling closure reads them live on each tick.
    // `title` is included because it determines the inferred job type.
  }, [phase, title, updateJob])

  // Watch isPending for the running -> completed transition AND mark the
  // global job done. The job-marking is independent of dialog `phase` so that
  // an externally-dismissed dialog (ESC during running) still resolves the job
  // in the header indicator.
  useEffect(() => {
    if (isPending) {
      sawPendingRef.current = true
      return
    }
    if (!sawPendingRef.current) return
    // Mutation settled — mark the global job done (idempotent via jobDoneRef).
    const jobId = jobIdRef.current
    if (jobId && !jobDoneRef.current) {
      jobDoneRef.current = true
      updateJob(jobId, { status: 'done' })
      // Auto-remove the (now-terminal) job after 30s so the popover stays tidy.
      // If the user re-runs before this fires, jobIdRef is overwritten and the
      // old job is removed by THIS timer — never the new one.
      window.setTimeout(() => {
        removeJob(jobId)
      }, 30000)
    }
    sawPendingRef.current = false
    // R5: the mutation has settled (either normally or because the server
    // honoured our cancel flag and returned partial results). Either way
    // the cancel intent is no longer pending — clear it so a subsequent
    // run doesn't inherit a stale "cancelling" badge.
    setCancelling(false)
    setPendingCancel(false)
    // Dialog UI completion path (only when the dialog is still showing the
    // running view — if dismissed externally, phase is 'idle' and we skip).
    if (phase !== 'running') return
    setPhase('completed')
    const t = setTimeout(() => {
      setPhase('idle')
      setRunningScope(null)
      setElapsed(0)
      startRef.current = null
      sawPendingRef.current = false
      jobIdRef.current = null
      jobDoneRef.current = false
      onOpenChange(false)
    }, 1000)
    return () => clearTimeout(t)
  }, [phase, isPending, onOpenChange, updateJob, removeJob])

  // R5 ── deferred cancel: if the user clicked Cancel before the polling
  // effect had a chance to discover the server-side job id, we stashed the
  // intent in `pendingCancel`. As soon as `serverProgress` becomes non-null
  // (i.e. the polling effect adopted a job), fire the cancel POST.
  //
  // Why an effect and not inline in handleCancel: the dialog does not own
  // the underlying fetch (the parent tab's useMutation does), so we can't
  // AbortController the request directly. Instead we POST to
  // /api/jobs/[id]/cancel — but we need the server-side id first, and that
  // only arrives via polling 1-2s after handleConfirm. This effect bridges
  // that gap.
  useEffect(() => {
    if (!pendingCancel) return
    if (!serverProgress) return
    const id = serverProgress.id
    if (!id) return
    setPendingCancel(false)
    // Fire-and-forget — the server sets a flag; the running route
    // observes it on the next chunk boundary and returns partial results.
    void fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'user_request' }),
    }).catch(() => {
      // Silently ignore — worst case the job runs to completion, which is
      // the default behavior anyway. No need to alarm the user.
    })
  }, [pendingCancel, serverProgress])

  // R5 ── cancel handler. Wired to the Cancel button while a run is in
  // flight (the button is re-enabled during running specifically for this).
  // - If we already have the server job id (serverProgress non-null), POST
  //   to /cancel immediately and flip into the "cancelling" UX.
  // - If not, stash the intent in `pendingCancel`; the effect above will
  //   fire the POST as soon as polling discovers the id.
  // Either way we immediately show "Cancelling…" so the user gets feedback.
  const handleCancelRunning = () => {
    if (phase !== 'running' || cancelling) return
    setCancelling(true)
    const id = serverProgress?.id
    if (id) {
      // We have the server job id — fire the cancel POST right now.
      void fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user_request' }),
      }).catch(() => {
        // Silently ignore — the dialog will still show "Cancelling…" and
        // the mutation will settle naturally when the server finishes.
      })
    } else {
      // Polling hasn't discovered the server job yet — defer until it does.
      setPendingCancel(true)
    }
  }

  const selectedScope = scopes.find((s) => s.value === selected) ?? scopes[0]
  const a = accentMap[accent]

  const handleConfirm = () => {
    if (!selectedScope || selectedScope.disabled || selectedScope.count === 0) return
    onConfirm(selectedScope.value)
    setRunningScope(selectedScope)
    startRef.current = Date.now()
    setElapsed(0)
    sawPendingRef.current = false
    jobDoneRef.current = false
    // R5: clear any leftover cancel-related state from a previous run.
    setCancelling(false)
    setPendingCancel(false)
    // Reset server-progress state for the new run. The polling effect will
    // re-discover the new server job via /api/jobs/latest?since=<pollSinceRef>.
    serverJobIdRef.current = null
    setServerProgress(null)
    // Backdate the `since` filter by 2s to absorb client/server clock drift
    // and the delay between handleConfirm and the parent's POST reaching the
    // server (which is when trackJob() actually runs).
    pollSinceRef.current = Date.now() - 2000
    setPhase('running')
    // Register a global job in the Zustand store so the app-header progress
    // indicator can render live progress for this batch operation.
    const type = inferJobType(title)
    const accentForJob: JobAccent = accent
    jobIdRef.current = addJob({
      type,
      label: selectedScope.label,
      total: selectedScope.count,
      accent: accentForJob,
    })
  }

  // --- Progress view derived values ---
  const estimated = runningScope?.estimatedSeconds ?? 0
  const pct = estimated > 0 ? Math.min(100, (elapsed / estimated) * 100) : 0
  const remaining = Math.max(0, estimated - elapsed)
  const isRunning = phase === 'running'
  const isCompleted = phase === 'completed'
  // Overtime = strictly past the estimate. Progress bar clamps at 100% but
  // elapsed keeps counting up so the user sees real elapsed time.
  // When we have REAL server progress, "overtime" is meaningless — the bar
  // reflects actual completion, not a time guess — so we suppress it.
  const isOvertime =
    isRunning && serverProgress === null && estimated > 0 && elapsed > estimated
  // After 2x the estimate, surface an explicit "unusually long" hint.
  // Suppressed when real progress is being reported (the server is alive
  // and processing, just slowly — not "stuck" by our timer's standard).
  const isVeryLong =
    serverProgress === null && isOvertime && elapsed >= estimated * 2
  const showProgress = (isRunning || isCompleted) && runningScope

  // Real (server-reported) progress in [0, 100]. When non-null, the bar
  // reflects actual per-paper completion from /api/jobs/[id] instead of the
  // time-based `pct`. `null` = no server progress yet → fall back to estimate.
  const realPct =
    serverProgress && serverProgress.total > 0
      ? Math.min(100, (serverProgress.completed / serverProgress.total) * 100)
      : null
  // Effective percent: real if available, else time-based.
  const effectivePct =
    isCompleted ? 100 : realPct !== null ? realPct : pct
  // Real counts for the "X / Y" badge (only when server reports).
  const realCompleted = serverProgress?.completed ?? null
  const realTotal = serverProgress?.total ?? null
  // Live hint: the title of the paper currently being processed. The server
  // updates this BEFORE each DB upsert, so the user sees "what's happening
  // right now" rather than just a percentage.
  const currentPaperTitle = serverProgress?.currentPaperTitle ?? ''

  const confirmLabel = isRunning
    ? t('runDialog.confirm.running')
    : isCompleted
      ? t('runDialog.confirm.complete')
      : t('runDialog.confirm.run')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </DialogTitle>
          {description && !showProgress && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {showProgress ? (
          /* ---------- Progress view (replaces scope selection while running) ---------- */
          <div className="space-y-4 py-1">
            <div className="flex items-center gap-2 text-sm">
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Loader2 className={cn('w-4 h-4 animate-spin shrink-0', a.dot)} />
              )}
              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                {runningScope.label}
              </span>
              {/* Real vs estimated badge — surfaces the data source to the user
                  so they know the bar reflects actual work, not a time guess. */}
              {realPct !== null && !isCompleted && (
                <Badge
                  variant="outline"
                  className="ml-auto text-[10px] tabular-nums bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 shrink-0"
                >
                  {t('runDialog.badge.live')}
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <div
                className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(effectivePct)}
                aria-label={t('runDialog.progressAria')}
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500 ease-out',
                    isCompleted
                      ? 'bg-emerald-500'
                      : isOvertime
                        ? 'bg-amber-500 animate-pulse'
                        : a.bar
                  )}
                  style={{ width: `${effectivePct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="tabular-nums">
                  {isCompleted
                    ? t('runDialog.status.complete')
                    : realPct !== null && realCompleted !== null && realTotal !== null
                      ? t('runDialog.status.papers', { done: realCompleted, total: realTotal })
                      : isOvertime
                        ? t('runDialog.status.overtime', { elapsed })
                        : t('runDialog.status.remaining', { remaining })}
                </span>
                <span className="tabular-nums text-slate-400">
                  {elapsed}s / {estimated}s
                </span>
              </div>
            </div>

            {/* Live "now processing" hint: the title of the paper the LLM is
                currently classifying. Only shown when the server reports a
                non-empty title AND we're still running (not yet completed). */}
            {isRunning && currentPaperTitle && (
              <div className="rounded-md bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="truncate">
                  <span className="text-slate-400 dark:text-slate-500">
                    {t('runDialog.now')}
                  </span>
                  {currentPaperTitle}
                </span>
              </div>
            )}

            {/* Overtime hint: after 2x the estimate, surface an explicit nudge. */}
            {isVeryLong && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {t('runDialog.overtimeHint')}
                </span>
              </div>
            )}

            {/* R5: cancel-requested hint. Shown after the user clicks Cancel
                while the server is still finishing the current chunk. The
                running route observes the cancel flag between chunks and
                returns partial results, so this hint disappears once the
                mutation settles (cancelling resets to false). */}
            {cancelling && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Cancel requested — the job will stop after the current chunk completes. Partial results will be saved.
                </span>
              </div>
            )}

            <div className="rounded-md bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3 h-3 shrink-0" />
              <span className="tabular-nums">{runningScope.costEstimate}</span>
            </div>
          </div>
        ) : (
          /* ---------- Scope selection view (idle) ---------- */
          <>
            <RadioGroup
              value={selected}
              onValueChange={setSelected}
              className="gap-2"
            >
              {scopes.map((s) => {
                const isSelected = s.value === selected
                const disabled = s.disabled || s.count === 0
                return (
                  <label
                    key={s.value}
                    htmlFor={`scope-${s.value}`}
                    className={cn(
                      'relative flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                      'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700',
                      isSelected && !disabled && a.ring + ' ring-2',
                      disabled && 'opacity-50 cursor-not-allowed hover:border-slate-200 dark:hover:border-slate-800'
                    )}
                  >
                    <RadioGroupItem
                      id={`scope-${s.value}`}
                      value={s.value}
                      disabled={disabled}
                      className="mt-0.5 data-[state=checked]:text-violet-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          {s.value === 'batch' ? (
                            <Layers className={cn('w-3.5 h-3.5', isSelected ? a.dot : 'text-slate-400')} />
                          ) : (
                            <Target className={cn('w-3.5 h-3.5', isSelected ? a.dot : 'text-slate-400')} />
                          )}
                          {s.label}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] tabular-nums', isSelected ? a.chip : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700')}
                        >
                          {t('runDialog.papersCount', { count: s.count })}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {s.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span className="tabular-nums">{s.costEstimate}</span>
                      </div>
                    </div>
                  </label>
                )
              })}
            </RadioGroup>

            {/* Summary footer */}
            <div className="rounded-md bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {t('runDialog.estimated')}
              </span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                {selectedScope?.costEstimate ?? '—'}
              </span>
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          {/* R5: Cancel button — context-sensitive.
              - idle / completed: dismiss the dialog (existing behavior).
              - running: POST to /api/jobs/[id]/cancel to stop the batch
                after the current chunk. Disabled while a cancel is already
                in flight (cancelling === true) so the user can't spam it. */}
          <Button
            variant="outline"
            onClick={isRunning ? handleCancelRunning : () => onOpenChange(false)}
            disabled={isCompleted || cancelling}
          >
            {cancelling ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Cancelling…
              </>
            ) : (
              t('common.cancel')
            )}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isRunning || isCompleted || !selectedScope || selectedScope.count === 0}
            className={cn(isCompleted ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : a.btn, 'min-w-[120px]')}
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-1.5" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
