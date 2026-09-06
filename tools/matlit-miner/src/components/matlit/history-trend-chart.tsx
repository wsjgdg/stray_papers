'use client'

import { useState, useMemo, memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { TrendingUp, Loader2, Calendar, MousePointerClick, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'
import { useChartTheme } from '@/components/use-chart-theme'
import { useI18n } from '@/components/i18n/provider'

interface HistoryPoint {
  date: string
  count: number
  cumulative: number
}

interface HistoryResponse {
  points: HistoryPoint[]
  granularity: 'day' | 'week' | 'month'
  days: number
  total: number
}

type Granularity = 'day' | 'week' | 'month'
type Range = '30' | '90' | 'all'

// PERF-3 — lightweight year aggregates returned by
// /api/papers/summary?groupBy=year&includeEfficiency=true.
// Replaces the previous `/api/papers?limit=500` call that downloaded
// ~500 full paper objects (~50KB each) just to surface sample paper
// rows in the click popover. We now show server-side aggregates
// (count + efficiency stats) for the year of the selected bucket
// instead of shipping full paper objects client-side.
interface YearEfficiencyGroup {
  year: number
  count: number
  maxEfficiency: number | null
  avgEfficiency: number | null
}

/**
 * Composed chart showing papers added over time.
 *  - Bars: new papers per time bucket (left Y axis)
 *  - Area+Line: cumulative total (right Y axis)
 * Granularity + time-range are user-selectable.
 *
 * E3 — Materials Project-style interactivity: clicking any bar/dot opens a
 * popover showing the bucket's date, paper count, cumulative total, and a
 * short list of the most recent papers added in that bucket (title +
 * source). The popover is anchored to an invisible element below the chart
 * so it stays visible regardless of where in the chart the click landed.
 */
const HistoryTrendChart = memo(function HistoryTrendChart() {
  const { t } = useI18n()
  const chart = useChartTheme()
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [range, setRange] = useState<Range>('90')

  // Selected data point — null when the popover is closed.
  const [selected, setSelected] = useState<HistoryPoint | null>(null)

  const daysParam = range === 'all' ? 'all' : range
  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: QUERY_KEYS.statsHistory(granularity, daysParam),
    queryFn: () =>
      api<HistoryResponse>(
        `/api/stats/history?granularity=${granularity}&days=${daysParam}`,
      ),
    refetchInterval: 60_000,
  })

  const points = data?.points ?? []

  // For 'all' range, show the actual range covered by the data.
  const totalPapers = data?.total ?? 0
  const bucketCount = points.length
  const maxDaily = useMemo(
    () => points.reduce((m, p) => Math.max(m, p.count), 0),
    [points],
  )

  // Tooltip
  const tooltipStyle = {
    borderRadius: 8,
    border: `1px solid ${chart.tooltipBorder}`,
    fontSize: 12,
    background: chart.tooltipBg,
    color: chart.tooltipText,
  } as const

  // ─── E3/PERF-3: year aggregates for the selected bucket ──────────────
  // The popover now shows the (count, maxEfficiency, avgEfficiency) for
  // the year of the bucket the user clicked — pulled from the lightweight
  // /api/papers/summary endpoint (no abstracts/titles/authors shipped).
  // The query fires once on mount and is cached by TanStack Query for 5
  // minutes, so every subsequent popover open is instant.
  const { data: yearAggregates, isLoading: aggregatesLoading } = useQuery<YearEfficiencyGroup[]>({
    queryKey: QUERY_KEYS.papersSummary,
    queryFn: () =>
      api<YearEfficiencyGroup[]>(
        '/api/papers/summary?groupBy=year&includeEfficiency=true',
      ),
    staleTime: STALE_TIMES.papersSummary,
  })

  // Resolve the clicked bucket's date ("YYYY-MM-DD") to its year so we
  // can look up the matching aggregate row.
  const selectedYear = useMemo(() => {
    if (!selected?.date) return null
    const m = selected.date.match(/^(\d{4})/)
    return m ? parseInt(m[1] ?? '0', 10) || null : null
  }, [selected])

  const yearAgg = useMemo(() => {
    if (selectedYear === null) return undefined
    return (yearAggregates ?? []).find((a) => a.year === selectedYear)
  }, [yearAggregates, selectedYear])

  const closePopover = () => setSelected(null)

  // i18n strings used inside the popover.
  const newPapersLabel = t('historyTrend.newPapers')
  const cumulativeLabel = t('historyTrend.cumulative')
  // PERF-3 — popover now shows year-level efficiency aggregates
  // (count / max / avg) instead of sample paper rows.
  const yearSummaryLabel = t('historyTrend.yearSummary')
  const yearCountLabel = t('historyTrend.yearCount')
  const maxEffLabel = t('historyTrend.maxEff')
  const avgEffLabel = t('historyTrend.avgEff')
  const noYearDataLabel = t('historyTrend.noYearData')
  const loadingAggLabel = t('historyTrend.loadingAgg')
  const clickHint = t('historyTrend.clickHint')
  const granularityLabel =
    granularity === 'day'
      ? t('dashboard.history.granularity.day')
      : granularity === 'week'
        ? t('dashboard.history.granularity.week')
        : t('dashboard.history.granularity.month')

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-500" />
              {t('dashboard.history.title')}
              <Badge variant="outline" className="ml-1 text-[9px] gap-0.5 hidden sm:inline-flex">
                <MousePointerClick className="w-2.5 h-2.5" />
                {t('historyTrend.clickable')}
              </Badge>
            </CardTitle>
            <CardDescription>
              {t('dashboard.history.desc')}
              {bucketCount > 0 && (
                <span className="ml-1 text-slate-400">
                  · {bucketCount} {t('dashboard.history.buckets')}
                  {' · '}{totalPapers} {t('dashboard.history.cumulative').toLowerCase()}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
              <SelectTrigger className="w-[110px] h-8 text-xs">
                <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t('dashboard.history.granularity.day')}</SelectItem>
                <SelectItem value="week">{t('dashboard.history.granularity.week')}</SelectItem>
                <SelectItem value="month">{t('dashboard.history.granularity.month')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-[110px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">{t('dashboard.history.range.30')}</SelectItem>
                <SelectItem value="90">{t('dashboard.history.range.90')}</SelectItem>
                <SelectItem value="all">{t('dashboard.history.range.all')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : points.length === 0 ? (
          <div className="h-[280px] flex flex-col items-center justify-center text-slate-400 text-sm">
            <TrendingUp className="w-8 h-8 mb-2 opacity-40" />
            {t('dashboard.history.empty')}
          </div>
        ) : (
          <div className="relative">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={points}
                margin={{ top: 8, right: 16, left: -8, bottom: 32 }}
                // E3: clicking anywhere on the chart resolves to the nearest
                // data point and opens the detail popover.
                onClick={(nextState) => {
                  const idx = nextState?.activeTooltipIndex
                  if (typeof idx === 'number' && points[idx]) {
                    setSelected(points[idx])
                  }
                }}
              >
                <defs>
                  <linearGradient id="historyCumulativeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: chart.axis }}
                  stroke={chart.axis}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                  tickFormatter={(v: string) => {
                    if (!v) return ''
                    if (granularity === 'month' && v.length >= 7) return v.slice(0, 7)
                    return v
                  }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: chart.axis }}
                  stroke={chart.axis}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: chart.axis }}
                  stroke={chart.axis}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: chart.tooltipText, fontWeight: 600 }}
                  formatter={(v, name) => {
                    if (name === t('dashboard.history.newPapers')) return [v, t('dashboard.history.newPapers')]
                    if (name === t('dashboard.history.cumulative')) return [v, t('dashboard.history.cumulative')]
                    return [v, name]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: chart.legendColor }} />
                <Bar
                  yAxisId="left"
                  dataKey="count"
                  name={t('dashboard.history.newPapers')}
                  fill="#0ea5e9"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                  // Cursor affordance — make it obvious the bars are clickable.
                  className="cursor-pointer"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulative"
                  name={t('dashboard.history.cumulative')}
                  stroke="#14b8a6"
                  strokeWidth={2}
                  fill="url(#historyCumulativeFill)"
                  dot={false}
                  activeDot={{ r: 5, className: 'cursor-pointer' }}
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Hint line under the chart — visible only when no popover is open */}
            {!selected && (
              <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-slate-400">
                <MousePointerClick className="w-2.5 h-2.5" />
                {clickHint}
              </div>
            )}

            {/* E3: detail popover anchored to an invisible element under the chart.
                Using PopoverAnchor + a hidden span lets us control placement
                (we always anchor to the chart container, not the click position,
                so the popover stays inside the card on small screens). */}
            <Popover open={!!selected} onOpenChange={(o) => { if (!o) closePopover() }}>
              <PopoverAnchor asChild>
                <span className="absolute left-1/2 top-[140px] w-0 h-0" aria-hidden="true" />
              </PopoverAnchor>
              <PopoverContent
                className="w-[320px] p-0 max-h-[380px] overflow-hidden flex flex-col"
                sideOffset={4}
              >
                {selected && (
                  <>
                    <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Calendar className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                          <span className="font-mono text-xs font-semibold truncate">
                            {selected.date}
                          </span>
                          <Badge variant="outline" className="text-[9px] shrink-0">
                            {granularityLabel}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          onClick={closePopover}
                          aria-label={t('common.close')}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                    <div className="px-3 py-2 grid grid-cols-2 gap-2 text-xs border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                          {newPapersLabel}
                        </div>
                        <div className="text-base font-bold tabular-nums text-sky-600 dark:text-sky-400">
                          {selected.count}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                          {cumulativeLabel}
                        </div>
                        <div className="text-base font-bold tabular-nums text-teal-600 dark:text-teal-400">
                          {selected.cumulative}
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-2 overflow-y-auto max-h-[220px]">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-amber-500" />
                        {yearSummaryLabel}
                        {selectedYear !== null && (
                          <Badge variant="outline" className="ml-auto text-[9px] tabular-nums">
                            {selectedYear}
                          </Badge>
                        )}
                      </div>
                      {aggregatesLoading ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {loadingAggLabel}
                        </div>
                      ) : !yearAgg ? (
                        <div className="text-[11px] text-slate-400 italic py-2">
                          {noYearDataLabel}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-md border border-slate-100 dark:border-slate-800 p-1.5">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide">
                              {yearCountLabel}
                            </div>
                            <div className="text-sm font-bold tabular-nums text-sky-600 dark:text-sky-400">
                              {yearAgg.count}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-100 dark:border-slate-800 p-1.5">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide">
                              {maxEffLabel}
                            </div>
                            <div className="text-sm font-bold tabular-nums text-teal-600 dark:text-teal-400">
                              {yearAgg.maxEfficiency !== null
                                ? `${yearAgg.maxEfficiency.toFixed(1)}%`
                                : '—'}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-100 dark:border-slate-800 p-1.5">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide">
                              {avgEffLabel}
                            </div>
                            <div className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
                              {yearAgg.avgEfficiency !== null
                                ? `${yearAgg.avgEfficiency.toFixed(1)}%`
                                : '—'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
        {/* Summary line */}
        {!isLoading && points.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500" />
              {t('dashboard.history.newPapers')}: max {maxDaily}/{t('dashboard.history.buckets').toLowerCase()}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-teal-500" />
              {t('dashboard.history.cumulative')}: {totalPapers}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
})

export { HistoryTrendChart }
