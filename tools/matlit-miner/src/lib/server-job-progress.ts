/**
 * Server-side, in-memory progress tracking for long-running batch jobs.
 *
 * WHY: The batch classify / extract APIs process papers sequentially (or with
 * limited concurrency) and used to be a black box from the client's POV — the
 * POST `/api/classify` request would block until all papers were processed,
 * giving the user zero visibility into how far along it was. The RunDialog
 * simulated progress with a timer (see run-dialog.tsx, `incPerTick`), which
 * felt smooth but was disconnected from reality.
 *
 * WHAT THIS MODULE DOES: It exposes a module-level `Map<jobId, ServerJob>` that
 * route handlers write to as they iterate over their work items, and a polling
 * endpoint (`/api/jobs/[id]`) reads from. The RunDialog polls this endpoint
 * every second while a batch is running; when the server reports real
 * `completed / total`, the dialog switches from the time-based estimate to
 * real progress. If no server job is found (e.g. for `/api/extract` which
 * doesn't yet write here), the dialog gracefully falls back to the estimate.
 *
 * CAVEATS:
 *  - In-memory only. Survives within a single Next.js dev-server process; a
 *    process restart loses running jobs. Acceptable for a local-research tool.
 *  - Module-level state in Next.js route handlers IS shared across requests
 *    (the dev server is a single Node process per port), so writes from the
 *    classify route are immediately visible to the jobs route.
 *  - We auto-prune terminal jobs older than 5 minutes so the Map can't grow
 *    unbounded during a long session.
 */

export type ServerJobType = 'classify' | 'extract' | 'search' | 'unknown'
export type ServerJobStatus = 'running' | 'done' | 'error'

export interface ServerJob {
  /** Stable unique id (returned by the POST that started the job). */
  id: string
  /** Coarse category — used by `/api/jobs/latest?type=classify`. */
  type: ServerJobType
  /** Number of items fully processed (DB-upserted). */
  completed: number
  /** Total items the job will process. */
  total: number
  /** Lifecycle state. `running` while the route handler is still working. */
  status: ServerJobStatus
  /** Title of the paper currently being classified (for live UI hint). */
  currentPaperTitle: string
  /** Wall-clock ms when the job was registered. */
  startedAt: number
  /** Wall-clock ms when status flipped to `done` / `error`. */
  finishedAt: number | null
  /** Count of failed items (LLM errors, DB errors, etc.). */
  errors: number
  /** Short human message (e.g. "Classified 12/50"). */
  message: string
}

/** Public shape returned by the polling endpoint (omits internal bookkeeping). */
export type ServerJobSnapshot = ServerJob

// ────────────────────────────── storage ──────────────────────────────

const MAX_RETENTION_MS = 5 * 60 * 1000 // 5 minutes after terminal
const MAX_ENTRIES = 200 // hard cap to prevent runaway memory
const jobs = new Map<string, ServerJob>()

/** Generate a stable, URL-safe job id (server-side). */
function makeJobId(type: ServerJobType): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${type}-${rand}`
}

/** Drop terminal jobs that have been sitting around too long. */
function prune(): void {
  const now = Date.now()
  for (const [id, j] of jobs) {
    if (j.status !== 'running' && j.finishedAt !== null) {
      if (now - j.finishedAt > MAX_RETENTION_MS) {
        jobs.delete(id)
      }
    }
  }
  // Hard cap: if still too many, drop the oldest terminal entries.
  if (jobs.size > MAX_ENTRIES) {
    const terminal = [...jobs.entries()]
      .filter(([, j]) => j.status !== 'running')
      .sort((a, b) => (a[1].finishedAt ?? 0) - (b[1].finishedAt ?? 0))
    const excess = jobs.size - MAX_ENTRIES
    for (let i = 0; i < Math.min(excess, terminal.length); i++) {
      jobs.delete(terminal[i][0])
    }
  }
}

// ────────────────────────────── API ──────────────────────────────

/**
 * Register a new job. If `id` is omitted, one is generated and returned.
 * Safe to call from any route handler.
 */
export function trackJob(opts: {
  id?: string
  type: ServerJobType
  total: number
  message?: string
}): string {
  const id = opts.id ?? makeJobId(opts.type)
  const job: ServerJob = {
    id,
    type: opts.type,
    completed: 0,
    total: Math.max(0, Math.floor(opts.total)),
    status: 'running',
    currentPaperTitle: '',
    startedAt: Date.now(),
    finishedAt: null,
    errors: 0,
    message: opts.message ?? '',
  }
  // Replace any prior entry with the same id (defensive — shouldn't happen).
  jobs.set(id, job)
  prune()
  return id
}

/**
 * Patch a job's mutable fields. Common patches: `{ completed, currentPaperTitle }`
 * after each item, `{ errors, message }` after a failure. No-op if the job
 * isn't tracked (the caller may have passed a stale id).
 */
export function updateJob(
  id: string,
  patch: Partial<Pick<ServerJob, 'completed' | 'currentPaperTitle' | 'errors' | 'message' | 'total'>>,
): void {
  const j = jobs.get(id)
  if (!j) return
  if (patch.completed !== undefined) {
    j.completed = Math.max(0, Math.min(j.total, Math.floor(patch.completed)))
  }
  if (patch.currentPaperTitle !== undefined) j.currentPaperTitle = patch.currentPaperTitle
  if (patch.errors !== undefined) j.errors = Math.max(0, Math.floor(patch.errors))
  if (patch.message !== undefined) j.message = patch.message
  if (patch.total !== undefined) j.total = Math.max(j.total, Math.floor(patch.total))
}

/**
 * Flip a job to a terminal state. Idempotent — calling twice is safe.
 * `completed` is clamped to `total` on `done` so the UI reaches 100%.
 */
export function completeJob(
  id: string,
  status: 'done' | 'error',
  message?: string,
): void {
  const j = jobs.get(id)
  if (!j) return
  if (j.status !== 'running') return // already terminal
  j.status = status
  j.finishedAt = Date.now()
  if (message !== undefined) j.message = message
  if (status === 'done') j.completed = j.total
  prune()
}

/** Read a job's current snapshot. Returns `null` if not found. */
export function getJob(id: string): ServerJobSnapshot | null {
  const j = jobs.get(id)
  return j ? { ...j } : null
}

/**
 * Find the most recent job, optionally filtered by type. "Most recent" is
 * defined by `startedAt` descending. Useful for clients that don't know the
 * server-generated id ahead of time (e.g. the RunDialog polls
 * `/api/jobs/latest?type=classify` to discover the job it triggered).
 *
 * Pass `sinceMs` to restrict to jobs that started at-or-after a wall-clock
 * timestamp — guards against adopting a stale job from a previous run.
 */
export function getLatestActiveJob(
  type?: ServerJobType,
  sinceMs?: number,
): ServerJobSnapshot | null {
  let best: ServerJob | null = null
  for (const j of jobs.values()) {
    if (type && j.type !== type) continue
    if (sinceMs !== undefined && j.startedAt < sinceMs) continue
    if (!best || j.startedAt > best.startedAt) best = j
  }
  // Fall back to the most recent terminal job of the type if none running —
  // helps the client observe the `done` flip on the very last poll.
  if (!best || best.status !== 'running') {
    let terminal: ServerJob | null = null
    for (const j of jobs.values()) {
      if (type && j.type !== type) continue
      if (sinceMs !== undefined && j.startedAt < sinceMs) continue
      if (!terminal || (j.finishedAt ?? 0) > (terminal.finishedAt ?? 0)) {
        terminal = j
      }
    }
    if (terminal && (!best || (terminal.finishedAt ?? 0) > best.startedAt)) {
      best = terminal
    }
  }
  return best ? { ...best } : null
}
