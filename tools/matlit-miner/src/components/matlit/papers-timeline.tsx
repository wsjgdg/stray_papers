'use client'

import { memo, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useI18n } from '@/components/i18n/provider'
import { useChartTheme } from '@/components/use-chart-theme'
import { api } from '@/lib/api-client'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// Lightweight summary shape returned by /api/papers/summary?groupBy=year:
//   [{ year, count }]
// PERF-3 — previously this component called `/api/papers?limit=500` and
// reduced 500 full paper objects (~50KB each) into a by-year count map
// client-side. The summary endpoint does that aggregation server-side
// and returns only the (year, count) pairs we need.
interface YearSummary {
  year: number
  count: number
}

function PapersTimeline() {
  const { t } = useI18n()
  const chart = useChartTheme()
  const { data, isLoading } = useQuery<YearSummary[]>({
    // Shared queryKey with history-trend-chart — single network request
    // serves both components (the efficiency fields are unused here but cheap).
    queryKey: QUERY_KEYS.papersSummary,
    queryFn: () => api<YearSummary[]>('/api/papers/summary?groupBy=year&includeEfficiency=true'),
    staleTime: STALE_TIMES.papersSummary,
  })

  // M9 — wrap the map→sort→slice chain in useMemo so the chart data array
  // keeps a stable reference across re-renders that don't change `data`
  // (e.g. parent re-rendering because of an unrelated stats refetch).
  // The transform is cheap individually but Recharts does shallow-compares
  // its `data` prop, so a stable reference skips its internal re-layout.
  const chartData = useMemo(
    () =>
      (data ?? [])
        .map((d) => ({ year: String(d.year), count: d.count }))
        .sort((a, b) => Number(a.year) - Number(b.year))
        .slice(-20), // last 20 years
    [data],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 text-sky-500" /> Papers by Year
        </CardTitle>
        <CardDescription>Distribution of retrieved papers by publication year (last 20 years)</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-slate-400 text-sm">
            <Calendar className="w-8 h-8 mb-2 opacity-40" />
            No papers with year data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: chart.axis }} stroke={chart.axis} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.axis} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: `1px solid ${chart.tooltipBorder}`,
                  fontSize: 12,
                  background: chart.tooltipBg,
                  color: chart.tooltipText,
                }}
              />
              <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// M9 — React.memo: PapersTimeline takes no props, so memoising means the
// parent (DashboardTab) re-rendering for any reason (stats query refetch,
// dialog open/close, etc.) no longer causes this chart to re-render.
// Combined with the memoised `chartData`, the recharts layout is skipped
// entirely on unrelated re-renders.
export default memo(PapersTimeline)
