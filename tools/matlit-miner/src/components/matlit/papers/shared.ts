/**
 * Shared types + constants for the papers-tab module.
 *
 * Extracted from `papers-tab.tsx` (M1b) so the satellite dialog/card
 * components (`paper-card.tsx`, `upload-pdf-dialog.tsx`, …) can import them
 * without re-declaring. **Nothing here is component JSX**, hence `.ts` and
 * not `.tsx`.
 */

/** Paper row shape — mirrors the `/api/papers` response (see papers-tab.tsx). */
export interface Paper {
  id: string
  materialId: string
  title: string
  year: number | null
  doi: string
  abstract: string
  authors: string
  venue: string
  url: string
  citationCount: number
  source: string
  altSources?: string
  oaUrl?: string
  oaStatus?: string
  notes?: string
  // multilingual (#P2-8): detected ISO 639-1 code + LLM-translated English fields
  originalLanguage?: string
  translatedTitle?: string
  translatedAbstract?: string
  material: { name: string; id: string }
  classification?: {
    synthesized: string
    hasBandgap: boolean
    hasMethod: boolean
    hasEfficiency: boolean
    hasPhaseDiagram: boolean
    status: string
    confidence: number
    evidence: string
    bandgapValue?: string
    synthesisMethod?: string
    conditions?: string
    phaseDiagramInfo?: string
    efficiencyValue?: string
  } | null
}

/** Simple client-side CJK detector — titles containing any CJK Unified
 *  Ideograph are treated as Chinese for badge purposes. Mirrors the
 *  server-side `containsCJK` heuristic in /api/papers/search-cn. */
export function isChinesePaper(p: Paper): boolean {
  if (p.originalLanguage === 'zh') return true
  return /[\u4e00-\u9fff]/.test(p.title || '')
}

/** All selectable paper-source APIs (used by the source toggle grid). */
export const ALL_SOURCES = ['semantic_scholar', 'crossref', 'openalex', 'arxiv', 'europepmc'] as const

/** Display metadata for each paper source — labels + tailwind color classes
 *  for the source badges used across card / table / dialog views. */
export const SOURCE_META: Record<string, { label: string; short: string; color: string }> = {
  semantic_scholar: { label: 'Semantic Scholar', short: 'S2', color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900' },
  crossref: { label: 'Crossref', short: 'CR', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900' },
  openalex: { label: 'OpenAlex', short: 'OA', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900' },
  arxiv: { label: 'arXiv', short: 'aX', color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900' },
  europepmc: { label: 'Europe PMC', short: 'PMC', color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900' },
}

/** Color classes for the OA-status badge on a paper card. Falls back to the
 *  generic `oa` style for unknown statuses. */
export const OA_STATUS_COLOR: Record<string, string> = {
  gold: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300',
  green: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300',
  hybrid: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/50 dark:text-violet-300',
  bronze: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300',
  oa: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300',
  closed: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
}
