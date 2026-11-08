'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Trophy,
  Medal,
  Award,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { api, doiUrl } from '@/lib/api-client'
import { useChartTheme } from '@/components/use-chart-theme'
import { useI18n } from '@/components/i18n/provider'

interface TopItem {
  id: string
  title?: string
  name?: string
  citationCount: number
  year?: number | null
  doi?: string
  materialName?: string
  paperCount?: number
}

interface TopResponse {
  type: 'papers' | 'materials'
  items: TopItem[]
}

const RANK_ICONS = [Trophy, Medal, Award]
const RANK_BG = [
  'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
  'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300',
  'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
]
const RANK_BAR = ['#f59e0b', '#94a3b8', '#a78bfa', '#0ea5e9']

export function CitationRanking() {
  const { t } = useI18n()
  const chart = useChartTheme()
  const [tab, setTab] = useState<'papers' | 'materials'>('papers')

  const { data, isLoading } = useQuery<TopResponse>({
    queryKey: ['citations-top', tab],
    queryFn: () => api(`/api/citations/top?limit=10&type=${tab}`),
    refetchInterval: 30000,
  })

  const items = data?.items ?? []

  const chartData = items.map((it) => {
    const longName = tab === 'papers' ? it.title ?? '—' : it.name ?? '—'
    return {
      name:
        longName.length > 28
          ? longName.slice(0, 25) + '…'
          : longName,
      fullName: longName,
      citations: it.citationCount,
    }
  })

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as 'papers' | 'materials')}
      className="w-full"
    >
      <TabsList>
        <TabsTrigger value="papers">
          {t('dashboard.citations.topPapers')}
        </TabsTrigger>
        <TabsTrigger value="materials">
          {t('dashboard.citations.topMaterials')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value={tab} className="mt-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            {t('dashboard.citations.empty')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Horizontal bar chart */}
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chart.grid}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: chart.axis }}
                    stroke={chart.axis}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: chart.axis }}
                    stroke={chart.axis}
                    width={130}
                  />
                  <Tooltip
                    cursor={{ fill: chart.cursorFill }}
                    contentStyle={{
                      borderRadius: 8,
                      border: `1px solid ${chart.tooltipBorder}`,
                      fontSize: 12,
                      background: chart.tooltipBg,
                      color: chart.tooltipText,
                    }}
                    formatter={(v) => [
                      v as number,
                      t('dashboard.citations.citations'),
                    ]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName ?? ''
                    }
                  />
                  <Bar dataKey="citations" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={i < 3 ? RANK_BAR[i] : RANK_BAR[3]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Ranked list */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {items.map((it, i) => {
                const Icon = i < 3 ? RANK_ICONS[i] : null
                const isPaper = tab === 'papers'
                return (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                  >
                    <span
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                        RANK_BG[i] || RANK_BG[3]
                      }`}
                    >
                      {Icon ? <Icon className="w-3.5 h-3.5" /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {isPaper ? it.title : it.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        {isPaper ? (
                          <>
                            {it.year && (
                              <span className="tabular-nums">{it.year}</span>
                            )}
                            {it.materialName && (
                              <Badge
                                variant="outline"
                                className="text-[9px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900"
                              >
                                {it.materialName}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <>
                            {it.paperCount !== undefined && (
                              <span className="tabular-nums">
                                {it.paperCount}{' '}
                                {t('dashboard.citations.papers')}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="secondary"
                        className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 tabular-nums"
                      >
                        {it.citationCount}
                      </Badge>
                      {isPaper && it.doi && (
                        <a
                          href={doiUrl(it.doi)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                          title={t('dashboard.citations.viewPaper')}
                          aria-label={t('dashboard.citations.viewPaper')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

export default CitationRanking
