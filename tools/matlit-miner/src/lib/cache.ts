// In-memory TTL cache for expensive API operations.
// Single-process Next.js dev server keeps this in module scope.
// For multi-instance deployments, swap with Redis or similar.

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

// Use a single shared Map across hot reloads when possible.
const g = globalThis as unknown as {
  __matlitCache?: Map<string, CacheEntry<unknown>>
  __matlitCacheStats?: { hits: number; misses: number }
  __matlitCacheCallCount?: number
  __matlitCacheCleanupTimer?: ReturnType<typeof setInterval> | null
}

if (!g.__matlitCache) g.__matlitCache = new Map()
if (!g.__matlitCacheStats) g.__matlitCacheStats = { hits: 0, misses: 0 }
if (g.__matlitCacheCallCount === undefined) g.__matlitCacheCallCount = 0
if (g.__matlitCacheCleanupTimer === undefined) g.__matlitCacheCleanupTimer = null

const cache: Map<string, CacheEntry<unknown>> = g.__matlitCache
const stats: { hits: number; misses: number } = g.__matlitCacheStats
let callCount: number = g.__matlitCacheCallCount

// Run a full proactive sweep every Nth call to getOrSet/getCached.
// Tuned for a research tool: a sweep is O(n) over the Map; with typical
// cache sizes (<1000 entries) this is sub-millisecond and pays for itself
// by freeing memory that would otherwise sit until lazy eviction.
const SWEEP_EVERY_N_CALLS = 100
// Proactive interval-based sweep (best-effort; works in long-lived dev
// server processes — serverless deployments rely on the call-count sweep).
const SWEEP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Remove EVERY expired entry from the cache in a single pass.
 * Returns the number of entries evicted. Safe to call concurrently —
 * Map iteration is stable under deletion.
 */
export function sweepExpired(): number {
  const now = Date.now()
  let removed = 0
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) {
      cache.delete(key)
      removed++
    }
  }
  return removed
}

/**
 * Increment the call counter and run a proactive sweep every Nth call.
 * Called from `getCached` / `getOrSet` so the sweep is amortized across
 * real cache activity (no idle polling needed). Returns the post-increment
 * count (mostly for tests / debugging).
 */
function tickAndMaybeSweep(): number {
  callCount = (callCount + 1) % 1_000_000
  g.__matlitCacheCallCount = callCount
  if (callCount % SWEEP_EVERY_N_CALLS === 0) {
    try {
      sweepExpired()
    } catch {
      // Defensive: never let cache housekeeping break a read.
    }
  }
  return callCount
}

/**
 * Start a background interval that sweeps expired entries every 5 minutes.
 *
 * In a long-lived Next.js dev server this keeps the cache bounded even when
 * there are no reads (which is when the call-count sweep wouldn't fire).
 * In serverless / edge deployments intervals do NOT persist across requests,
 * so the call-count sweep in `tickAndMaybeSweep` is the real workhorse —
 * this function is a best-effort supplement for the dev-server case.
 *
 * Idempotent: calling it twice is a no-op (the prior timer is reused).
 * Safe to call from any module scope at import time.
 */
export function startCacheCleanup(): void {
  if (g.__matlitCacheCleanupTimer !== null) return
  g.__matlitCacheCleanupTimer = setInterval(() => {
    try {
      sweepExpired()
    } catch {
      // Silently ignore — housekeeping must never crash the process.
    }
  }, SWEEP_INTERVAL_MS)
  // Don't keep the Node process alive just for cache housekeeping.
  if (
    g.__matlitCacheCleanupTimer &&
    typeof g.__matlitCacheCleanupTimer.unref === 'function'
  ) {
    g.__matlitCacheCleanupTimer.unref()
  }
}

// Eagerly start the background sweep on module load. In the dev server this
// keeps the cache tidy even when reads are infrequent; in serverless it's a
// no-op (the timer can't persist across invocations, but the call-count
// sweep still fires on every read).
startCacheCleanup()

/**
 * Read a cached value if it exists and has not expired.
 * Returns null otherwise (and cleans up expired entries lazily).
 *
 * R7: also bumps the call counter so a full proactive sweep runs every
 * Nth read — this catches expired entries that are never read again
 * (the lazy path only evicts the entry being read).
 */
export function getCached<T>(key: string): T | null {
  tickAndMaybeSweep()
  const entry = cache.get(key)
  if (!entry) {
    stats.misses++
    return null
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    stats.misses++
    return null
  }
  stats.hits++
  return entry.value as T
}

/**
 * Store a value with a TTL (in milliseconds).
 */
export function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/**
 * Invalidate all cache entries whose key starts with the given prefix.
 * Use prefixes like 'stats:', 'citations:', 'materials:', 'coverage'.
 */
export function invalidate(prefix: string): number {
  let removed = 0
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
      removed++
    }
  }
  return removed
}

/**
 * Clear the entire cache.
 */
export function clearAll(): number {
  const n = cache.size
  cache.clear()
  return n
}

/**
 * Get-or-set helper: returns cached value if fresh, otherwise calls
 * the factory, caches the result, and returns it.
 *
 * R7: bumps the call counter via `getCached` so proactive sweeps fire
 * on the natural read cadence — no extra bookkeeping at the call site.
 */
export async function getOrSet<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>,
): Promise<T> {
  const cached = getCached<T>(key)
  if (cached !== null) return cached
  const value = await factory()
  setCached(key, value, ttlMs)
  return value
}

/**
 * Cache stats for the admin panel.
 */
export function getCacheStats(): {
  entries: number
  hits: number
  misses: number
  hitRate: number
} {
  const total = stats.hits + stats.misses
  return {
    entries: cache.size,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: total === 0 ? 0 : stats.hits / total,
  }
}
