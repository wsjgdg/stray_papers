'use client'

import { useQuery } from '@tanstack/react-query'
import { HeartPulse } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { api } from '@/lib/api-client'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'
import { useI18n } from '@/components/i18n/provider'
import type { TabValue } from '@/app/page'
import type { HealthMetric, HealthMetrics, HealthData } from './types'

// Re-export so NextStepsGuidanceCard can use the same REC_L10N table without
// duplicating it. (NextStepsGuidanceCard reads the same /api/health endpoint
// and renders the same `key` strings.)
export { type HealthData }
export type { HealthMetrics, HealthMetric }

/**
 * Pick a Tailwind color triplet (ring stroke / bar fill / text) for a given
 * 0–100 health score.
 *   <40  → rose   (action needed)
 *   40–69 → amber (in progress)
 *   ≥70  → emerald (healthy)
 */
export function healthColor(h: number): {
  ring: string
  text: string
  bar: string
} {
  if (h < 40)
    return {
      ring: 'stroke-rose-500',
      text: 'text-rose-600 dark:text-rose-400',
      bar: 'bg-rose-500',
    }
  if (h < 70)
    return {
      ring: 'stroke-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
      bar: 'bg-amber-500',
    }
  return {
    ring: 'stroke-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-500',
  }
}

/**
 * Client-side localization table for the recommendation `key`s emitted by
 * /api/health. The server returns English text for direct display; when the
 * user has switched to Chinese we rebuild the strings from the live metrics
 * so numbers stay in sync with the meter.
 */
export const REC_L10N: Record<
  string,
  {
    action: string
    target: string
    desc: (m: HealthMetrics, t: (key: string, vars?: Record<string, string | number>) => string) => string
  }
> = {
  classify: {
    action: 'dashboard.dataHealth.rec.classify.action',
    target: 'dashboard.dataHealth.rec.classify.target',
    desc: (m, t) => {
      const unclassified = Math.max(
        0,
        (m.classifications.total ?? 0) - m.classifications.count,
      )
      const pctUnc =
        (m.classifications.total ?? 0) > 0
          ? (100 - (m.classifications.pct ?? 0)).toFixed(1)
          : '0.0'
      return t('dashboard.dataHealth.rec.classify.desc', { count: unclassified, pct: pctUnc })
    },
  },
  efficiency: {
    action: 'dashboard.dataHealth.rec.efficiency.action',
    target: 'dashboard.dataHealth.rec.efficiency.target',
    desc: (m, t) => {
      const needed = Math.max(0, m.materials.count - m.efficiencies.count)
      return t('dashboard.dataHealth.rec.efficiency.desc', { count: m.efficiencies.count, needed })
    },
  },
  extract: {
    action: 'dashboard.dataHealth.rec.extract.action',
    target: 'dashboard.dataHealth.rec.extract.target',
    desc: (m, t) =>
      t('dashboard.dataHealth.rec.extract.desc', { count: m.extractions.count, total: m.extractions.eligible ?? 0 }),
  },
  verify: {
    action: 'dashboard.dataHealth.rec.verify.action',
    target: 'dashboard.dataHealth.rec.verify.target',
    desc: (m, t) =>
      t('dashboard.dataHealth.rec.verify.desc', { count: m.verifications.count, total: m.materials.count }),
  },
}

/**
 * DataHealthCard — weighted overall data completeness meter.
 *
 * Reads /api/health, draws a circular progress ring for the overall score,
 * and shows six per-dimension mini-bars (materials / papers / classifications
 * / extractions / efficiencies / verifications). Clicking any bar jumps to
 * that tab.
 *
 * DB-only aggregate — 30s staleTime replaces the old 5s/15s polls. That's
 * still plenty fresh for the hero meter, and cuts redundant requests when
 * the user flips between dashboard tabs.
 */
export function DataHealthCard({
  onNavigate,
}: {
  onNavigate: (t: TabValue) => void
}) {
  const { t } = useI18n()
  const { data, isLoading } = useQuery<HealthData>({
    queryKey: QUERY_KEYS.health,
    queryFn: () => api<HealthData>('/api/health'),
    staleTime: STALE_TIMES.health,
  })

  const overall = data?.overallHealth ?? 0
  const color = healthColor(overall)
  const title = t('dashboard.dataHealth.title')
  const desc = t('dashboard.dataHealth.desc')
  const loadingText = t('dashboard.dataHealth.loading')
  const overallLabel = t('dashboard.dataHealth.overall')

  const m = data?.metrics
  const rows: Array<{
    key: string
    label: string
    tab: TabValue
    metric?: HealthMetric
    display: string
  }> = [
    {
      key: 'materials',
      label: t('dashboard.dataHealth.materials'),
      tab: 'materials',
      metric: m?.materials,
      display: m ? `${m.materials.count}/${m.materials.target ?? '?'}` : '—',
    },
    {
      key: 'papers',
      label: t('dashboard.dataHealth.papers'),
      tab: 'papers',
      metric: m?.papers,
      display: m
        ? `${m.papers.count} · ${m.papers.avgPerMaterial?.toFixed(1) ?? '0'}/mat`
        : '—',
    },
    {
      key: 'classifications',
      label: t('dashboard.dataHealth.classifications'),
      tab: 'classification',
      metric: m?.classifications,
      display: m ? `${m.classifications.count}/${m.classifications.total} · ${m.classifications.pct?.toFixed(1) ?? '0'}%` : '—',
    },
    {
      key: 'extractions',
      label: t('dashboard.dataHealth.extractions'),
      tab: 'extraction',
      metric: m?.extractions,
      display: m
        ? `${m.extractions.count}/${m.extractions.eligible ?? 0}`
        : '—',
    },
    {
      key: 'efficiencies',
      label: t('dashboard.dataHealth.efficiencies'),
      tab: 'efficiency',
      metric: m?.efficiencies,
      display: m
        ? `${m.efficiencies.count}/${m.efficiencies.target ?? '?'}`
        : '—',
    },
    {
      key: 'verifications',
      label: t('dashboard.dataHealth.verifications'),
      tab: 'verification',
      metric: m?.verifications,
      display: m
        ? `${m.verifications.count}/${m.materials?.count ?? m.verifications.count}`
        : '—',
    },
  ]

  // Circular progress ring geometry. r=36 ⇒ circumference ≈ 226.2.
  const R = 36
  const C = 2 * Math.PI * R
  const dash = C - (overall / 100) * C

  return (
    <Card className="border-emerald-200/60 dark:border-emerald-900/50 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HeartPulse className={`w-4 h-4 ${color.text}`} />
          {title}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !m ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">
            <HeartPulse className="w-4 h-4 mr-2 animate-pulse" />
            {loadingText}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {/* Circular overall-health ring */}
            <div className="relative w-24 h-24 shrink-0">
              <svg
                className="w-24 h-24 -rotate-90"
                viewBox="0 0 96 96"
                role="img"
                aria-label={t('dashboard.dataHealth.aria', { pct: overall })}
              >
                <circle
                  cx="48"
                  cy="48"
                  r={R}
                  fill="none"
                  strokeWidth="8"
                  className="stroke-slate-200 dark:stroke-slate-700"
                />
                <circle
                  cx="48"
                  cy="48"
                  r={R}
                  fill="none"
                  strokeWidth="8"
                  className={color.ring}
                  strokeDasharray={C}
                  strokeDashoffset={dash}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={`text-2xl font-bold tabular-nums leading-tight ${color.text}`}
                >
                  {overall}%
                </span>
                <span className="text-[10px] sm:text-[9px] uppercase tracking-wide text-slate-400">
                  {overallLabel}
                </span>
              </div>
            </div>

            {/* Per-dimension mini-bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 w-full">
              {rows.map((r) => {
                const h = r.metric?.health ?? 0
                const c = healthColor(h)
                return (
                  <button
                    key={r.key}
                    onClick={() => onNavigate(r.tab)}
                    className="group text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 hover:shadow-sm transition-all p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    title={t('dashboard.dataHealth.goTo', { label: r.label })}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {r.label}
                      </span>
                      <span
                        className={`text-[10px] tabular-nums ${c.text}`}
                      >
                        {h}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${c.bar}`}
                        style={{ width: `${Math.max(2, h)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums truncate">
                      {r.display}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
