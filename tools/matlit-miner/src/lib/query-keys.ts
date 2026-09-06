/**
 * Centralised React Query cache-policy constants.
 *
 * ── Why this file exists (M8) ─────────────────────────────────────────────
 * Before M8, the 34 queries across the app each picked a `staleTime` ad-hoc,
 * ranging from 5s to 10min with no clear convention. That made it hard to
 * reason about cache freshness (e.g. a "stats" query at 5s vs an identical
 * one at 60s) and made refetch behaviour surprising on tab switches.
 *
 * This file is the single source of truth for staleTime by query *category*.
 * New `useQuery` calls should import the matching constant instead of
 * hardcoding a number. The convention is intentionally coarse (one value per
 * data category, not per endpoint) so it's easy to reason about:
 *
 *   30s   → real-time-ish counters (stats, health)
 *   60s   → DB-backed list / detail (materials, papers, coverage, efficiency)
 *   5min  → heavy aggregations / graph layouts (KG, citation network, activity)
 *   10min+→ LLM results (discover, predict, draft, review)
 *
 * The global default in query-provider.tsx is `staleTime: 60_000`, so only
 * queries that deviate from "1 min" need to pass an explicit `staleTime`.
 */

export const STALE_TIMES = {
  // Real-time data — changes often (but no polling by default; we rely on
  // refetchOnMount + window-focus for the occasional refresh).
  stats: 30_000, // 30s
  health: 30_000, // 30s
  notifications: 60_000, // 1min

  // DB data — changes on user action (create/update/delete), not on its own.
  materials: 60_000, // 1min
  papers: 60_000, // 1min
  efficiency: 60_000, // 1min
  coverage: 60_000, // 1min

  // Heavy aggregations — don't change often, expensive to recompute.
  knowledgeGraph: 5 * 60_000, // 5min
  citationNetwork: 5 * 60_000, // 5min
  activity: 5 * 60_000, // 5min
  efficiencyTrend: 5 * 60_000, // 5min

  // Shared year-aggregate summary used by both PapersTimeline and
  // HistoryTrendChart — bucket the two together so they share one cache
  // entry (TanStack Query dedupes by key).
  papersSummary: 5 * 60_000, // 5min

  // LLM results — very stable; only re-run on explicit user action.
  discover: 10 * 60_000, // 10min
  predict: 10 * 60_000, // 10min
  review: 60 * 60_000, // 1h
  draft: 30 * 60_000, // 30min
} as const

/**
 * Centralised query-key factory.
 *
 * Passing `QUERY_KEYS.stats` instead of the literal `['stats']` makes
 * refactorings safer (rename once, catch typos at compile time) and lets
 * `qc.invalidateQueries({ queryKey: QUERY_KEYS.stats })` reach every
 * consumer of that key without grepping for the literal.
 *
 * Keys that take a parameter (e.g. per-material records) are exposed as
 * functions; static keys are exposed as readonly tuples so callers can pass
 * them directly to `queryKey:` without spreading.
 */
export const QUERY_KEYS = {
  stats: ['stats'] as const,
  health: ['health'] as const,
  notifications: ['notifications'] as const,

  materials: ['materials'] as const,
  materialsFull: ['materials-full'] as const,
  papers: ['papers'] as const,
  papersSummary: ['papers-summary-year-efficiency'] as const,
  coverage: ['coverage'] as const,

  knowledgeGraph: ['knowledge-graph'] as const,
  citationNetwork: (materialId?: string) =>
    materialId
      ? (['citation-network', materialId] as const)
      : (['citation-network'] as const),
  activity: ['activity'] as const,
  efficiencyTrend: ['efficiency-trend'] as const,
  efficiencyLeaderboard: ['efficiency-leaderboard'] as const,
  efficiencyRecords: (materialId: string) =>
    ['efficiency-records', materialId] as const,
  efficiencyAllRecords: ['efficiency-all-records'] as const,
  paperDetail: (paperId: string) => ['paper-detail', paperId] as const,

  discover: ['discover'] as const,
  predict: ['predict-efficiency'] as const,

  // Stats history — keyed by [granularity, days] for granular invalidation.
  statsHistory: (granularity: string, days: string | number) =>
    ['stats-history', granularity, String(days)] as const,
} as const
