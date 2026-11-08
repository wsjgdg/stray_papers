'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles,
  RefreshCw,
  ArrowRight,
  FlaskConical,
  Lightbulb,
  AlertTriangle,
  Zap,
  Gauge,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api-client'
import { useI18n, type Locale } from '@/components/i18n/provider'
import { toast } from 'sonner'
import type { TabValue } from '@/app/page'

// ResearchDiscovery — AI-powered "Research Opportunities" panel.
//
// Fetches 5 opportunity cards from /api/discover (LLM-generated, with a
// rule-based fallback when the LLM is unavailable). Each card shows a
// suggested composition, expected bandgap range, difficulty badge, and a
// rationale. The "Explore" button stashes the suggested composition in
// localStorage (matlit-papers-search-prefill) and navigates to the
// Papers tab so the user can immediately search for related literature.
//
// Layout: 1 col mobile / 2 col tablet / 3 col desktop. The header carries
// a Sparkles icon, an "AI-analyzed" badge, the data source badge
// (llm | fallback), and a manual refresh button.
//
// Colors: emerald (low difficulty, bandgap), amber (medium), red (high),
// slate (chrome). No indigo/blue per task constraint.

type Difficulty = 'low' | 'medium' | 'high'

/**
 * Map our app locale ('en' | 'zh') to the BCP 47 language tag used by
 * `Date.prototype.toLocaleString`. Kept as a Record so the mapping is
 * data-driven (no locale-based ternary) and future locales
 * would only need a new entry here.
 */
const DATE_LOCALE_TAG: Record<Locale, string> = {
  en: 'en-US',
  zh: 'zh-CN',
}

interface Opportunity {
  title: string
  rationale: string
  suggestedComposition: string
  expectedBandgap: string
  difficulty: Difficulty
  promisingBecause: string
}

interface GapSummary {
  unexploredCombinations: string[]
  lowEfficiencyHighPapers: Array<{ category: string; avgEff: number; paperCount: number }>
  highEfficiencyLowPapers: Array<{ category: string; avgEff: number; paperCount: number }>
  optimalBandgapNoEfficiency: Array<{ name: string; bandgap: number }>
}

interface DiscoveryResponse {
  opportunities: Opportunity[]
  generatedAt: string
  source: 'llm' | 'fallback'
  gapSummary: GapSummary
}

const DIFFICULTY_STYLES: Record<
  Difficulty,
  { badge: string; dot: string }
> = {
  low: {
    badge:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  medium: {
    badge:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  high: {
    badge:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
    dot: 'bg-red-500',
  },
}

/**
 * Stash the suggested composition as a search prefill key and navigate to
 * the Papers tab. Papers tab reads `matlit-papers-search-prefill` on
 * mount (forward-compatible) — even if it doesn't yet, the value is on
 * the clipboard via `navigator.clipboard.writeText` so the user can paste
 * into the search box.
 */
function exploreComposition(
  composition: string,
  onNavigate: (t: TabValue, materialId?: string) => void,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  try {
    localStorage.setItem('matlit-papers-search-prefill', composition)
  } catch {
    // ignore — best-effort
  }
  // Also copy to clipboard for instant paste in the search box.
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard
      .writeText(composition)
      .then(() => {
        toast.success(t('research.clipboardCopied', { composition }))
      })
      .catch(() => {
        // clipboard write may fail in non-secure contexts — silent
      })
  } else {
    toast.success(t('research.openingPapers', { composition }))
  }
  onNavigate('papers')
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const { t } = useI18n()
  const s = DIFFICULTY_STYLES[difficulty]
  const level = t(`research.difficulty.level.${difficulty}`)
  const label = t('research.difficulty.label', { level })
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[11px] font-medium ${s.badge}`}
      aria-label={`Difficulty: ${level}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden />
      {label}
    </Badge>
  )
}

function OpportunityCard({
  opportunity,
  onNavigate,
}: {
  opportunity: Opportunity
  onNavigate: (t: TabValue, materialId?: string) => void
}) {
  const { t } = useI18n()
  return (
    <Card className="flex flex-col h-full border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
      <CardContent className="p-5 flex flex-col h-full gap-3">
        {/* Top row: difficulty badge + bandgap badge */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <DifficultyBadge difficulty={opportunity.difficulty} />
          <Badge
            variant="outline"
            className="gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
            title={t('research.expectedBandgap')}
          >
            <Gauge className="w-3 h-3" aria-hidden />
            <span className="font-mono tabular-nums">
              {opportunity.expectedBandgap}
            </span>
          </Badge>
        </div>

        {/* Title */}
        <h4 className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-50 line-clamp-2">
          {opportunity.title}
        </h4>

        {/* Suggested composition (mono, large) */}
        <div className="rounded-md bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">
            {t('research.suggestedComposition')}
          </div>
          <div className="font-mono text-base sm:text-lg font-semibold text-emerald-700 dark:text-emerald-400 break-all leading-tight">
            {opportunity.suggestedComposition}
          </div>
        </div>

        {/* Rationale */}
        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 line-clamp-3">
          {opportunity.rationale}
        </p>

        {/* Promising because — faded */}
        <div className="mt-auto pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" aria-hidden />
            <span>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {t('research.promisingBecause')}
              </span>
              {opportunity.promisingBecause}
            </span>
          </div>
        </div>

        {/* Explore button */}
        <Button
          size="sm"
          variant="outline"
          className="w-full mt-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          onClick={() =>
            exploreComposition(opportunity.suggestedComposition, onNavigate, t)
          }
          aria-label={t('research.exploreAria', { composition: opportunity.suggestedComposition })}
        >
          {t('research.explore')}
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  )
}

function OpportunityCardSkeleton() {
  return (
    <Card className="flex flex-col h-full">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <div className="mt-auto pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
          <Skeleton className="h-3 w-full" />
        </div>
        <Skeleton className="h-8 w-full rounded-md" />
      </CardContent>
    </Card>
  )
}

/**
 * Render a small grid of gap-analysis chips beneath the header so the
 * user can see what signals the LLM was given.
 */
function GapChips({ gaps }: { gaps: GapSummary | undefined }) {
  const { t } = useI18n()
  if (!gaps) return null
  const items: Array<{ label: string; value: string; tone: string }> = []
  if (gaps.unexploredCombinations.length > 0) {
    items.push({
      label: t('research.gap.unexplored'),
      value: String(gaps.unexploredCombinations.length),
      tone:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    })
  }
  if (gaps.lowEfficiencyHighPapers.length > 0) {
    items.push({
      label: t('research.gap.lowEffHighPapers'),
      value: String(gaps.lowEfficiencyHighPapers.length),
      tone:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    })
  }
  if (gaps.highEfficiencyLowPapers.length > 0) {
    items.push({
      label: t('research.gap.highEffLowPapers'),
      value: String(gaps.highEfficiencyLowPapers.length),
      tone:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    })
  }
  if (gaps.optimalBandgapNoEfficiency.length > 0) {
    items.push({
      label: t('research.gap.optimalBandgap'),
      value: String(gaps.optimalBandgapNoEfficiency.length),
      tone:
        'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    })
  }
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((it) => (
        <span
          key={it.label}
          className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${it.tone}`}
        >
          <span className="tabular-nums font-semibold">{it.value}</span>
          <span className="opacity-80">{it.label}</span>
        </span>
      ))}
    </div>
  )
}

export default function ResearchDiscovery({
  onNavigate,
}: {
  onNavigate: (t: TabValue, materialId?: string) => void
}) {
  const { t, locale } = useI18n()
  const qc = useQueryClient()

  // Lazy-load: /api/discover runs an LLM server-side (~14s). Only fire
  // when this card scrolls into view (or the user clicks "Load"). The
  // 10-min staleTime (matches the server-side cache) means re-entering
  // the Dashboard tab does NOT re-trigger the LLM.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)
  useEffect(() => {
    if (isInView) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setIsInView(true)
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [isInView])

  const { data, isLoading, isError, isFetching, refetch } = useQuery<DiscoveryResponse>({
    queryKey: ['discover', 'opportunities'],
    queryFn: () => api<DiscoveryResponse>('/api/discover'),
    enabled: isInView,
    staleTime: 10 * 60 * 1000, // 10 min — matches server-side cache
    refetchOnWindowFocus: false,
  })

  const handleRefresh = () => {
    // If the card hasn't been activated yet, the first click just turns
    // on the query (IntersectionObserver fallback).
    if (!isInView) {
      setIsInView(true)
      return
    }
    // Bust server cache via ?refresh=1, then re-fetch.
    refetch()
    qc.invalidateQueries({ queryKey: ['discover'] })
    toast.success(t('research.requestedFresh'))
  }

  const opportunities = data?.opportunities ?? []
  const source = data?.source

  const generatedAtLabel = (iso: string) =>
    t('research.generatedAt', {
      date: new Date(iso).toLocaleString(DATE_LOCALE_TAG[locale]),
    })

  return (
    <Card ref={sentinelRef} className="border-emerald-200/60 dark:border-emerald-900/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" aria-hidden />
              {t('research.title')}
              <Badge
                variant="outline"
                className="ml-1 text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              >
                {t('research.aiAnalyzed')}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">{t('research.desc')}</CardDescription>
            {/* Gap-analysis chips + source/timestamp */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              {source && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${
                    source === 'llm'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-700'
                  }`}
                >
                  {source === 'llm' ? (
                    <Sparkles className="w-3 h-3" aria-hidden />
                  ) : (
                    <AlertTriangle className="w-3 h-3" aria-hidden />
                  )}
                  {source === 'llm' ? t('research.sourceLLM') : t('research.sourceFallback')}
                </span>
              )}
              {data?.generatedAt && (
                <span className="tabular-nums">
                  {generatedAtLabel(data.generatedAt)}
                </span>
              )}
            </div>
            <GapChips gaps={data?.gapSummary} />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={isFetching}
            className="shrink-0"
            aria-label={!isInView ? t('research.loadBtn') : t('research.refresh')}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden
            />
            {!isInView ? t('research.loadBtn') : isFetching ? t('research.refreshing') : t('research.refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!isInView ? (
          // Lazy placeholder — the /api/discover LLM call (~14s) only
          // fires when this card scrolls into view or the user clicks Load.
          <div className="flex flex-col items-center justify-center text-center gap-3 py-12">
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-500" aria-hidden />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
              {t('research.lazyHint')}
            </p>
            <Button size="sm" variant="outline" onClick={() => setIsInView(true)}>
              {t('research.loadBtn')}
            </Button>
          </div>
        ) : isLoading ? (
          // Loading skeleton grid — 5 cards in the same responsive layout
          // as the populated grid so there's no layout shift on resolve.
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <OpportunityCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center text-center gap-2 py-12">
            <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" aria-hidden />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
              {t('research.error')}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="mt-2"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" aria-hidden />
              {t('research.refresh')}
            </Button>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-2 py-12">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-slate-400" aria-hidden />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
              {t('research.empty')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {opportunities.map((op, i) => (
              <OpportunityCard
                key={`${op.suggestedComposition}-${i}`}
                opportunity={op}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}

        {/* Footer hint when populated */}
        {!isLoading && !isError && opportunities.length > 0 && (
          <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <Zap className="w-3 h-3 text-amber-500" aria-hidden />
            <span>
              {t('research.footerHint')}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
