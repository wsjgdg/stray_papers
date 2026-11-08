/**
 * Client-side job tracking store.
 *
 * LLM batch operations (classify / extract / search-batch) are fire-and-forget
 * mutations from React Query's perspective. To give the user a global progress
 * signal in the app header without touching the batch API endpoints, we track
 * jobs locally in Zustand. The RunDialog registers a job when the user confirms
 * and then drives `completed` upward via an interval (estimated completion);
 * when the underlying mutation settles, the dialog flips the job to
 * `done` / `error`.
 *
 * The store is intentionally framework-agnostic: it knows nothing about
 * React Query, fetch, or any specific tab. Components opt-in via
 * `useJobs()` / `useJobProgress(type)` and the action helpers.
 *
 * ─── T6: persistence ──────────────────────────────────────────────────
 * Jobs are now persisted to localStorage (`matlit-jobs`) so that a page
 * refresh mid-batch keeps the indicator visible. The persistence layer:
 *   - `loadJobs()` — read on store creation (client only); filters out any
 *     job older than 24h (avoids stale clutter from yesterday's runs).
 *   - `persistJobs()` — called at the tail of every mutating action so the
 *     on-disk copy is always in sync with in-memory state.
 *   - A `matlit:jobs-changed` CustomEvent is dispatched on every persist so
 *     other tabs / components can re-subscribe if needed (mirrors the
 *     pattern in `recent-materials.ts`).
 *
 * What "resume polling" means here: the original RunDialog drives `completed`
 * upward via an interval estimated from `total`. After a refresh, that
 * interval is gone (the dialog component remounts and doesn't know about
 * the orphan job). We surface the orphan running jobs in the indicator so
 * the user sees them and can dismiss them manually — server-side progress
 * polling is intentionally out of scope per the store's "no server state"
 * design contract.
 */
import { create } from 'zustand'

export type JobType = 'classify' | 'extract' | 'search'
export type JobStatus = 'running' | 'done' | 'error'
export type JobAccent = 'violet' | 'rose' | 'emerald' | 'amber' | 'sky'

export interface Job {
  id: string
  type: JobType
  label: string
  total: number
  completed: number
  status: JobStatus
  startedAt: number
  finishedAt: number | null
  /** Visual accent for the indicator (defaults derived from type). */
  accent: JobAccent
  /** Optional short error message surfaced in the popover. */
  error?: string
}

interface JobStore {
  jobs: Job[]
  addJob: (j: {
    type: JobType
    label: string
    total: number
    accent?: JobAccent
  }) => string
  updateJob: (id: string, patch: Partial<Omit<Job, 'id' | 'type'>>) => void
  removeJob: (id: string) => void
  clearFinished: () => void
  /** Re-read persisted jobs from localStorage (used on mount / focus). */
  loadJobs: () => void
}

const DEFAULT_ACCENT: Record<JobType, JobAccent> = {
  classify: 'violet',
  extract: 'rose',
  search: 'sky',
}

// ─── persistence (T6) ──────────────────────────────────────────────────────

const STORAGE_KEY = 'matlit-jobs'
const CHANGE_EVENT = 'matlit:jobs-changed'
/** Jobs older than this many ms are dropped on load (default: 24h). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function isJobShape(x: unknown): x is Job {
  if (typeof x !== 'object' || x === null) return false
  const j = x as Record<string, unknown>
  return (
    typeof j.id === 'string' &&
    typeof j.type === 'string' &&
    typeof j.label === 'string' &&
    typeof j.total === 'number' &&
    typeof j.completed === 'number' &&
    typeof j.status === 'string' &&
    typeof j.startedAt === 'number' &&
    (j.finishedAt === null || typeof j.finishedAt === 'number') &&
    typeof j.accent === 'string'
  )
}

/**
 * Read persisted jobs from localStorage, dropping anything older than 24h.
 * Returns `[]` on SSR / parse failure / quota issues.
 */
function loadJobs(): Job[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed
      .filter(isJobShape)
      .filter((j) => {
        // Drop jobs whose terminal-or-start time is older than the cutoff.
        // Use `finishedAt` when present, else `startedAt`.
        const anchor = j.finishedAt ?? j.startedAt
        return now - anchor < MAX_AGE_MS
      })
  } catch {
    return []
  }
}

/** Persist current jobs to localStorage + dispatch a change event. */
function persistJobs(jobs: Job[]): void {
  if (typeof window === 'undefined') return
  try {
    // Cap the persisted list at 50 entries to bound localStorage usage
    // (running jobs first, then newest-finished).
    const sorted = [...jobs].sort((a, b) => {
      const ra = a.status === 'running' ? 0 : 1
      const rb = b.status === 'running' ? 0 : 1
      if (ra !== rb) return ra - rb
      return (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt)
    })
    const capped = sorted.slice(0, 50)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // localStorage unavailable (private mode, quota) — silently skip. The
    // in-memory store keeps working; we just lose the refresh-survival.
  }
}

function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
  } catch {
    /* ignore */
  }
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const useJobStore = create<JobStore>((set, get) => ({
  // Hydrate from localStorage on first client render. On SSR this returns
  // [] (loadJobs is a no-op), so the initial server HTML is stable.
  jobs: loadJobs(),
  addJob: ({ type, label, total, accent }) => {
    const id = uid()
    const job: Job = {
      id,
      type,
      label,
      total: Math.max(0, Math.floor(total)),
      completed: 0,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      accent: accent ?? DEFAULT_ACCENT[type],
    }
    set((s) => {
      const jobs = [job, ...s.jobs]
      persistJobs(jobs)
      return { jobs }
    })
    return id
  },
  updateJob: (id, patch) => {
    set((s) => {
      const jobs = s.jobs.map((j) => {
        if (j.id !== id) return j
        const next: Job = { ...j, ...patch }
        // If status flips to a terminal state, stamp finishedAt.
        if (
          patch.status &&
          patch.status !== 'running' &&
          j.status === 'running'
        ) {
          next.finishedAt = Date.now()
          // Clamp completed to total on done so the bar reaches 100%.
          if (patch.status === 'done' && j.total > 0) {
            next.completed = j.total
          }
        }
        return next
      })
      persistJobs(jobs)
      return { jobs }
    })
  },
  removeJob: (id) => {
    set((s) => {
      const jobs = s.jobs.filter((j) => j.id !== id)
      persistJobs(jobs)
      return { jobs }
    })
  },
  clearFinished: () => {
    set((s) => {
      const jobs = s.jobs.filter((j) => j.status === 'running')
      persistJobs(jobs)
      return { jobs }
    })
  },
  loadJobs: () => {
    // Re-read from localStorage — used on mount / focus to pick up jobs
    // persisted by other tabs. The 24h filter in `loadJobs()` already prunes
    // stale entries. We only replace state if the parsed list differs from
    // what we have (avoids spurious re-renders).
    const fresh = loadJobs()
    const cur = get().jobs
    if (fresh.length === cur.length) {
      const same = fresh.every((f, i) => f.id === cur[i]?.id && f.status === cur[i]?.status && f.completed === cur[i]?.completed)
      if (same) return
    }
    set({ jobs: fresh })
  },
}))

/* ----------------------------- selector hooks ----------------------------- */

/** All jobs, newest first (addJob prepends). */
export function useJobs(): Job[] {
  return useJobStore((s) => s.jobs)
}

/** Only currently-running jobs. */
export function useRunningJobs(): Job[] {
  return useJobStore((s) => s.jobs.filter((j) => j.status === 'running'))
}

/** Aggregate progress for a given job type (e.g. sum of completed/total). */
export function useJobProgress(
  type?: JobType,
): { running: number; completed: number; total: number; pct: number } {
  return useJobStore((s) => {
    const filtered = type ? s.jobs.filter((j) => j.type === type) : s.jobs
    const running = filtered.filter((j) => j.status === 'running').length
    const completed = filtered.reduce((sum, j) => sum + j.completed, 0)
    const total = filtered.reduce((sum, j) => sum + j.total, 0)
    const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0
    return { running, completed, total, pct }
  })
}
