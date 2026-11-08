'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Lightbulb, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'
import { useI18n } from '@/components/i18n/provider'
import type { TabValue } from '@/app/page'
import type { HealthData } from './types'
import { REC_L10N } from './data-health-card'

/**
 * NextStepsGuidanceCard — auto-prioritized "what should I do next?" list.
 *
 * Reads the same /api/health cache key as DataHealthCard (React Query
 * dedupes the request so both cards share a single network round-trip),
 * then renders the recommendations array sorted by priority (high → medium
 * → low). Each row has a priority badge, an action title, a description
 * (rebuilt from live metrics when the user is on Chinese locale so the
 * numbers stay in sync with the meter), and a "Go" button that jumps to
 * the recommended tab.
 *
 * When there are zero recommendations the card collapses to a friendly
 * "All caught up!" empty state.
 */
export function NextStepsGuidanceCard({
  onNavigate,
}: {
  onNavigate: (t: TabValue) => void
}) {
  const { t } = useI18n()
  const { data, isLoading } = useQuery<HealthData>({
    // Same cache key as DataHealthCard — React Query dedupes.
    queryKey: QUERY_KEYS.health,
    queryFn: () => api<HealthData>('/api/health'),
    staleTime: STALE_TIMES.health,
  })

  const recs = data?.recommendations ?? []
  const title = t('dashboard.nextSteps.title')
  const desc = t('dashboard.nextSteps.desc')
  const loadingText = t('dashboard.nextSteps.loading')
  const goLabel = t('dashboard.nextSteps.goLabel')
  const caughtUpTitle = t('dashboard.nextSteps.caughtUpTitle')
  const caughtUpDesc = t('dashboard.nextSteps.caughtUpDesc')

  const priorityBadge: Record<string, string> = {
    high: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-900',
    medium:
      'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    low: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  }
  const priorityRing: Record<string, string> = {
    high: 'border-l-rose-500',
    medium: 'border-l-amber-500',
    low: 'border-l-slate-400',
  }
  const priorityLabelKey: Record<string, string> = {
    high: 'dashboard.nextSteps.priority.high',
    medium: 'dashboard.nextSteps.priority.medium',
    low: 'dashboard.nextSteps.priority.low',
  }

  return (
    <Card className="border-emerald-200/60 dark:border-emerald-900/50 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          {title}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">
            <Lightbulb className="w-4 h-4 mr-2 animate-pulse" />
            {loadingText}
          </div>
        ) : recs.length === 0 ? (
          <div className="h-[220px] flex flex-col items-center justify-center text-center text-emerald-600 dark:text-emerald-400 gap-2">
            <CheckCircle2 className="w-10 h-10" />
            <p className="text-sm font-semibold">{caughtUpTitle}</p>
            <p className="text-xs text-slate-500">{caughtUpDesc}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 -mr-1">
            {recs.map((r, i) => {
              const l10n = REC_L10N[r.key]
              const action = l10n ? t(l10n.action) : r.action
              const target = l10n ? t(l10n.target) : r.target
              const rdesc = l10n
                ? l10n.desc(data.metrics, t)
                : r.desc
              const ps = priorityBadge[r.priority] ?? priorityBadge.low
              const pr = priorityRing[r.priority] ?? priorityRing.low
              const pl = t(priorityLabelKey[r.priority] ?? priorityLabelKey.low)
              return (
                <div
                  key={`${r.key}-${i}`}
                  className={`rounded-lg border border-slate-200 dark:border-slate-800 border-l-4 ${pr} bg-white dark:bg-slate-900 p-3`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${ps}`}>
                          {pl}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {action}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {rdesc}
                      </p>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {target}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onNavigate(r.cta.tab as TabValue)}
                      className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                      aria-label={t('dashboard.nextSteps.goAria', { target })}
                    >
                      {goLabel}
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
