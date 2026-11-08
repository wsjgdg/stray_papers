'use client'

/**
 * Global job-progress indicator rendered in the app header.
 *
 * Renders a compact button (matching other header controls) with an SVG
 * progress ring + per-job-type icon + "completed/total" label. Clicking opens
 * a popover listing all running jobs plus recently-finished ones (the
 * run-dialog auto-removes terminal jobs after 30s, so the list stays short).
 *
 * Driven entirely by the client-side Zustand job-store (`@/lib/job-store`) —
 * no API polling, no server state. The run-dialog registers jobs as users
 * confirm batch operations and simulates per-item progress.
 *
 * ─── T6: persistence ──────────────────────────────────────────────────
 * On mount (and on window focus / cross-tab `storage` events) we call
 * `loadJobs()` to re-hydrate any jobs persisted to localStorage by a prior
 * session. This means a refresh mid-batch keeps the indicator visible — the
 * user can see the orphan running job and dismiss it manually once they've
 * confirmed the server-side work finished elsewhere.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import {
  Sparkles,
  Beaker,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  X,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/provider'
import {
  useJobs,
  useJobStore,
  type Job,
  type JobType,
  type JobAccent,
} from '@/lib/job-store'

const JOB_ICON: Record<JobType, React.ElementType> = {
  classify: Sparkles,
  extract: Beaker,
  search: Search,
}

const ACCENT: Record<JobAccent, { text: string; bar: string; ring: string }> = {
  violet: {
    text: 'text-violet-600 dark:text-violet-400',
    bar: 'bg-violet-500',
    ring: 'stroke-violet-500',
  },
  rose: {
    text: 'text-rose-600 dark:text-rose-400',
    bar: 'bg-rose-500',
    ring: 'stroke-rose-500',
  },
  emerald: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-500',
    ring: 'stroke-emerald-500',
  },
  amber: {
    text: 'text-amber-600 dark:text-amber-400',
    bar: 'bg-amber-500',
    ring: 'stroke-amber-500',
  },
  sky: {
    text: 'text-sky-600 dark:text-sky-400',
    bar: 'bg-sky-500',
    ring: 'stroke-sky-500',
  },
}

function formatElapsed(startedAt: number, finishedAt: number | null): string {
  const end = finishedAt ?? Date.now()
  const sec = Math.max(0, Math.floor((end - startedAt) / 1000))
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

/** Compact SVG progress ring with the job-type icon centered inside. */
function ProgressRing({
  pct,
  Icon,
  accent,
  size = 18,
}: {
  pct: number
  Icon: React.ElementType
  accent: JobAccent
  size?: number
}) {
  const stroke = 2
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  const a = ACCENT[accent]
  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={cn('transition-[stroke-dasharray] duration-300 ease-out', a.ring)}
        />
      </svg>
      <Icon className={cn('absolute', a.text)} style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  )
}

/** Single row inside the popover — used for both running and terminal jobs. */
function JobRow({
  job,
  onDismiss,
}: {
  job: Job
  onDismiss: () => void
}) {
  const { t } = useI18n()
  const Icon = JOB_ICON[job.type]
  const a = ACCENT[job.accent]
  const pct = job.total > 0 ? Math.min(100, (job.completed / job.total) * 100) : 0
  const isRunning = job.status === 'running'
  const isDone = job.status === 'done'
  const isError = job.status === 'error'
  const typeLabel = t(`jobs.type.${job.type}`)
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-3 py-2">
      <div className="flex items-center gap-2">
        {isRunning ? (
          <ProgressRing pct={pct} Icon={Icon} accent={job.accent} size={20} />
        ) : isDone ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        ) : isError ? (
          <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
              {job.label}
            </span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full border tabular-nums shrink-0',
                a.text,
                'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
              )}
            >
              {typeLabel}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div
              className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              aria-label={t('jobs.ariaProgress')}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300 ease-out',
                  isError ? 'bg-rose-500' : isDone ? 'bg-emerald-500' : a.bar,
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {Math.floor(job.completed)}/{job.total}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
              {isRunning
                ? t('jobs.elapsed', { time: formatElapsed(job.startedAt, null) })
                : t('jobs.done', { time: formatElapsed(job.startedAt, job.finishedAt) })}
            </span>
            {!isRunning && (
              <button
                onClick={onDismiss}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                aria-label={t('jobs.dismiss')}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function HeaderJobIndicator() {
  const { t } = useI18n()
  const jobs = useJobs()
  const removeJob = useJobStore((s) => s.removeJob)
  const clearFinished = useJobStore((s) => s.clearFinished)
  const loadJobs = useJobStore((s) => s.loadJobs)

  // T6: re-hydrate from localStorage on mount (picks up jobs that survived
  // a page refresh) and on window focus (picks up jobs persisted by other
  // tabs). The store's `loadJobs()` already filters out entries older than
  // 24h and no-ops if the parsed list matches current state.
  useEffect(() => {
    loadJobs()
    const onFocus = () => loadJobs()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'matlit-jobs') loadJobs()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [loadJobs])

  const running = jobs.filter((j) => j.status === 'running')
  const finished = jobs.filter((j) => j.status !== 'running')

  // Aggregate progress across all running jobs.
  const totalRunning = running.reduce((s, j) => s + j.total, 0)
  const completedRunning = running.reduce((s, j) => s + j.completed, 0)
  const aggPct =
    totalRunning > 0 ? Math.min(100, (completedRunning / totalRunning) * 100) : 0

  // Drive the ring icon from the most recent running job (or fall back to the
  // most recent finished job so the indicator can briefly show "100%" before
  // the auto-remove kicks in).
  const primary = running[0] ?? finished[0]
  const showIndicator = jobs.length > 0 && primary

  if (!showIndicator || !primary) return null

  const PrimaryIcon = JOB_ICON[primary.type]
  const isPrimaryRunning = primary.status === 'running'
  // When the primary job is finished, show the ring at 100% briefly.
  const ringPct = isPrimaryRunning ? aggPct : 100

  return (
    <Popover>
      <AnimatePresence>
        <motion.div
          key="job-indicator"
          initial={{ opacity: 0, scale: 0.85, width: 0 }}
          animate={{ opacity: 1, scale: 1, width: 'auto' }}
          exit={{ opacity: 0, scale: 0.85, width: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'gap-1.5 h-8 px-2.5',
                isPrimaryRunning && 'border-slate-300 dark:border-slate-700',
              )}
              aria-label={t('jobs.ariaButton', { done: Math.floor(completedRunning), total: totalRunning })}
              title={t('jobs.titleRunning', { running: running.length, finished: finished.length })}
            >
              {isPrimaryRunning ? (
                <ProgressRing pct={ringPct} Icon={PrimaryIcon} accent={primary.accent} size={18} />
              ) : primary.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-500" />
              )}
              <span className="text-xs tabular-nums font-medium text-slate-700 dark:text-slate-300">
                {isPrimaryRunning
                  ? `${Math.floor(completedRunning)}/${totalRunning}`
                  : t('jobs.doneShort')}
              </span>
              {isPrimaryRunning && (
                <Activity className="w-3 h-3 text-slate-400 animate-pulse" aria-hidden="true" />
              )}
            </Button>
          </PopoverTrigger>
        </motion.div>
      </AnimatePresence>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 p-3"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {t('jobs.backgroundJobs')}
            </span>
          </div>
          {finished.length > 0 && (
            <button
              onClick={clearFinished}
              className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              {t('jobs.clearFinished')}
            </button>
          )}
        </div>
        {jobs.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
            {t('jobs.noJobs')}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
            {running.map((j) => (
              <JobRow key={j.id} job={j} onDismiss={() => removeJob(j.id)} />
            ))}
            {finished.map((j) => (
              <JobRow key={j.id} job={j} onDismiss={() => removeJob(j.id)} />
            ))}
          </div>
        )}
        <p className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
          {t('jobs.disclaimer')}
        </p>
      </PopoverContent>
    </Popover>
  )
}
