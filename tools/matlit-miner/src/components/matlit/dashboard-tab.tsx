'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FlaskConical,
  FileText,
  Sparkles,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Circle,
  TrendingUp,
  ArrowRight,
  FileDown,
  Database,
  AlertTriangle,
  Trophy,
  Target,
  Activity as ActivityIcon,
  Lightbulb,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api-client'
import CoverageMatrix from '@/components/matlit/coverage-matrix'
import ActivityTimeline from '@/components/matlit/activity-timeline'
import KnowledgeGraph from '@/components/matlit/knowledge-graph'
import ResearchDiscovery from '@/components/matlit/research-discovery'
import DraftGeneratorDialog from '@/components/matlit/draft-generator'
import MaterialRecommenderDialog from '@/components/matlit/material-recommender'
import { BatchProgressPanel } from '@/components/matlit/batch-progress-panel'
import { StatCardSkeleton, CoverageMatrixSkeleton, ActivityTimelineSkeleton } from '@/components/matlit/skeletons'
import PapersTimeline from '@/components/matlit/papers-timeline'
import { HistoryTrendChart } from '@/components/matlit/history-trend-chart'
import { OneClickPipeline, NextStepsCard } from '@/components/matlit/pipeline'
import { CitationRanking } from '@/components/matlit/citation-ranking'
import TabErrorBoundary from '@/components/matlit/tab-error-boundary'
import { useChartTheme } from '@/components/use-chart-theme'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'
import type { TabValue } from '@/app/page'
import { useI18n } from '@/components/i18n/provider'
import { StatCard, StatPill } from '@/components/matlit/dashboard/stat-card'
import { DataHealthCard } from '@/components/matlit/dashboard/data-health-card'
import { NextStepsGuidanceCard } from '@/components/matlit/dashboard/next-steps-card'
import { DemoDataButton } from '@/components/matlit/dashboard/demo-data-button'
import { FillAllDataHeroButton } from '@/components/matlit/dashboard/fill-all-button'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts'

interface Stats {
  counts: {
    materials: number
    papers: number
    classifications: number
    synthesized: number
    extracted: number
    efficiency: number
    verified: number
    pendingVerification: number
  }
  papersPerMaterial: Array<{ name: string; count: number }>
  byCategory: Array<{ category: string; count: number }>
  bySynthesized: Array<{ synthesized: string; count: number }>
  topEfficiencies: Array<{ material: string; efficiency: number; certified: boolean; source: string }>
}

const CATEGORY_COLORS = ['#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ec4899']
const SYNTH_COLORS: Record<string, string> = {
  yes: '#10b981',
  no: '#ef4444',
  uncertain: '#f59e0b',
}

const WORKFLOW = [
  { step: 1, labelKey: 'dashboard.workflow.materials', descKey: 'dashboard.workflow.materialsDesc', tab: 'materials' as TabValue, icon: FlaskConical },
  { step: 2, labelKey: 'dashboard.workflow.search', descKey: 'dashboard.workflow.searchDesc', tab: 'papers' as TabValue, icon: FileText },
  { step: 3, labelKey: 'dashboard.workflow.classify', descKey: 'dashboard.workflow.classifyDesc', tab: 'classification' as TabValue, icon: Sparkles },
  { step: 4, labelKey: 'dashboard.workflow.extract', descKey: 'dashboard.workflow.extractDesc', tab: 'extraction' as TabValue, icon: TrendingUp },
  { step: 5, labelKey: 'dashboard.workflow.efficiency', descKey: 'dashboard.workflow.efficiencyDesc', tab: 'efficiency' as TabValue, icon: Zap },
  { step: 6, labelKey: 'dashboard.workflow.verify', descKey: 'dashboard.workflow.verifyDesc', tab: 'verification' as TabValue, icon: ShieldCheck },
]

export default function DashboardTab({ onNavigate }: { onNavigate: (t: TabValue, materialId?: string) => void }) {
  const { t } = useI18n()
  const chart = useChartTheme()
  // G12 / G13 — dialog open state for the AI paper-draft generator and
  // the smart material recommender. Both are lazy: only the dialog content
  // mounts when the user clicks the trigger button. The recommender is a
  // pure filter+score endpoint (no LLM); the draft generator hits the LLM
  // only when the user clicks "Generate draft" inside the dialog.
  const [draftOpen, setDraftOpen] = useState(false)
  const [recommendOpen, setRecommendOpen] = useState(false)
  const { data, isLoading } = useQuery<Stats>({
    queryKey: QUERY_KEYS.stats,
    queryFn: () => api<Stats>('/api/stats'),
    // T4: stats is one of the slowest first-load queries (up to ~220ms on
    // a cold cache). It's a pure DB aggregation that only changes on
    // mutations — and those mutations all call `invalidate('stats:')` on
    // the server AND `queryClient.invalidateQueries({queryKey:['stats']})`
    // on the client, so a 5-min client staleTime is safe and still feels
    // fresh. The previous 30s window caused a redundant refetch on every
    // tab switch / window focus, which on a slow connection re-triggered
    // the heavy aggregation query.
    staleTime: 5 * 60_000, // 5 min
  })

  const c = data?.counts
  const classificationRate = c && c.papers > 0 ? (c.classifications / c.papers) * 100 : 0
  const extractionRate = c && c.synthesized > 0 ? (c.extracted / c.synthesized) * 100 : 0
  const verificationRate = c && c.materials > 0 ? (c.verified / c.materials) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative overflow-hidden border-emerald-200/60 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/30">
        <CardContent className="p-6 sm:p-8 relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <Badge className="mb-3 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-800">
                <Sparkles className="w-3 h-3 mr-1" /> {t('dashboard.hero.badge')}
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {t('dashboard.hero.title')}
              </h2>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('dashboard.hero.desc')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <Button onClick={() => onNavigate('materials')} className="bg-emerald-600 hover:bg-emerald-700">
                  {t('dashboard.hero.start')} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
                <Button variant="outline" onClick={() => onNavigate('results')}>
                  {t('dashboard.hero.viewResults')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => window.print()} title={t('dashboard.exportPdf')} aria-label={t('dashboard.exportPdf')}>
                  <FileDown className="w-3.5 h-3.5 mr-1" /> {t('dashboard.exportPdfShort')}
                </Button>
                <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                <DemoDataButton />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 min-w-[260px] items-stretch">
              <StatPill icon={FlaskConical} label={t('dashboard.stat.materials')} value={c?.materials ?? 0} color="emerald" />
              <StatPill icon={FileText} label={t('nav.papers')} value={c?.papers ?? 0} color="sky" />
              <StatPill icon={Sparkles} label={t('dashboard.stat.classified')} value={c?.classifications ?? 0} color="violet" />
              <StatPill icon={Zap} label={t('nav.efficiency')} value={c?.efficiency ?? 0} color="orange" />
            </div>
          </div>
        </CardContent>
        <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />
      </Card>

      {/* Data Health meter + Next Steps smart guidance (data-gap driven) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DataHealthCard onNavigate={onNavigate} />
        <NextStepsGuidanceCard onNavigate={onNavigate} />
      </div>

      {/* P0-1: One-click "Fill all data automatically" hero button.
          Sits directly above the OneClickPipeline card so users see a large
          emerald CTA the moment they land on the dashboard. Clicking it runs
          the full client-orchestrated pipeline (search → classify → extract)
          and opens a modal with live per-step progress. */}
      <FillAllDataHeroButton />

      {/* One-click pipeline + Next steps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OneClickPipeline onNavigate={onNavigate} stats={c} />
        <NextStepsCard onNavigate={onNavigate} stats={c} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
        <StatCard
          icon={FlaskConical}
          label={t('dashboard.stat.materials')}
          value={c?.materials ?? 0}
          sub={`${data?.byCategory.length ?? 0} ${t('dashboard.stat.categories')}`}
          color="emerald"
        />
        <StatCard
          icon={FileText}
          label={t('dashboard.stat.papers')}
          value={c?.papers ?? 0}
          sub={`${c?.classifications ?? 0} ${t('dashboard.stat.classified')}`}
          color="sky"
          progress={c && c.papers > 0 ? (c.classifications / c.papers) * 100 : 0}
        />
        <StatCard
          icon={CheckCircle2}
          label={t('dashboard.stat.synthesized')}
          value={c?.synthesized ?? 0}
          sub={`${c?.extracted ?? 0} ${t('dashboard.stat.deepExtracted')}`}
          color="violet"
          progress={c && c.synthesized > 0 ? (c.extracted / c.synthesized) * 100 : 0}
        />
        <StatCard
          icon={ShieldCheck}
          label={t('dashboard.stat.verified')}
          value={c?.verified ?? 0}
          sub={`${c?.pendingVerification ?? 0} ${t('dashboard.stat.pending')}`}
          color="amber"
          progress={c && c.materials > 0 ? (c.verified / c.materials) * 100 : 0}
        />
          </>
        )}
      </div>

      {/* Workflow progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.workflow.title')}</CardTitle>
          <CardDescription>{t('dashboard.workflow.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {WORKFLOW.map((w, i) => {
              const Icon = w.icon
              // Determine completion state per step from stats
              const isComplete =
                (w.tab === 'materials' && (c?.materials ?? 0) > 0) ||
                (w.tab === 'papers' && (c?.papers ?? 0) > 0) ||
                (w.tab === 'classification' && (c?.classifications ?? 0) > 0 && (c?.papers ?? 0) > 0 && (c?.classifications ?? 0) >= (c?.papers ?? 0)) ||
                (w.tab === 'extraction' && (c?.synthesized ?? 0) > 0 && (c?.extracted ?? 0) >= (c?.synthesized ?? 0)) ||
                (w.tab === 'efficiency' && (c?.efficiency ?? 0) > 0) ||
                (w.tab === 'verification' && (c?.materials ?? 0) > 0 && (c?.verified ?? 0) >= (c?.materials ?? 0))
              const hasProgress =
                (w.tab === 'materials' && (c?.materials ?? 0) > 0) ||
                (w.tab === 'papers' && (c?.papers ?? 0) > 0) ||
                (w.tab === 'classification' && (c?.classifications ?? 0) > 0) ||
                (w.tab === 'extraction' && (c?.extracted ?? 0) > 0) ||
                (w.tab === 'efficiency' && (c?.efficiency ?? 0) > 0) ||
                (w.tab === 'verification' && (c?.verified ?? 0) > 0)
              return (
                <button
                  key={w.step}
                  onClick={() => onNavigate(w.tab)}
                  className={`group relative rounded-xl border p-3 text-left transition-all ${
                    isComplete
                      ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 hover:shadow-md'
                      : hasProgress
                      ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 hover:shadow-md'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-mono ${isComplete ? 'text-emerald-600 dark:text-emerald-400' : hasProgress ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                      {t('dashboard.workflow.step')} {w.step}
                    </span>
                    <div className="flex items-center gap-1">
                      {isComplete && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {!isComplete && hasProgress && <Circle className="w-4 h-4 text-amber-500" />}
                      {!isComplete && !hasProgress && <Icon className={`w-4 h-4 ${hasProgress ? 'text-amber-500' : 'text-emerald-500'}`} />}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t(w.labelKey)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t(w.descKey)}</div>
                  {i < WORKFLOW.length - 1 && (
                    <ArrowRight className="hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-slate-700 z-10" />
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-6 space-y-4">
            <ProgressRow label={t('dashboard.progress.classification')} value={classificationRate} hint={`${c?.classifications ?? 0}/${c?.papers ?? 0} ${t('nav.papers').toLowerCase()}`} color="emerald" />
            <ProgressRow label={t('dashboard.progress.extraction')} value={extractionRate} hint={`${c?.extracted ?? 0}/${c?.synthesized ?? 0} ${t('dashboard.progress.synthesized')}`} color="violet" />
            <ProgressRow label={t('dashboard.progress.verification')} value={verificationRate} hint={`${c?.verified ?? 0}/${c?.materials ?? 0} ${t('dashboard.progress.materials')}`} color="amber" />
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-500" /> {t('dashboard.charts.papersPerMaterial')}
            </CardTitle>
            <CardDescription>{t('dashboard.charts.papersDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || !data?.papersPerMaterial?.length ? (
              <EmptyChart label={t('empty.noPapersChart')} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.papersPerMaterial} margin={{ top: 4, right: 8, left: -16, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" height={60} tick={{ fontSize: 10, fill: chart.axis }} stroke={chart.axis} />
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-500" /> {t('dashboard.charts.byCategory')}
            </CardTitle>
            <CardDescription>{t('dashboard.charts.categoryDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.byCategory?.length ? (
              <EmptyChart label={t('empty.noMaterialsChart')} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.byCategory}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {data.byCategory.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${chart.tooltipBorder}`, fontSize: 12, background: chart.tooltipBg, color: chart.tooltipText }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: chart.axis }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top efficiencies + synthesized breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500" /> {t('dashboard.charts.topEff')}
            </CardTitle>
            <CardDescription>{t('dashboard.charts.topEffDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.topEfficiencies?.length ? (
              <EmptyChart label={t('empty.noEfficiencyChart')} />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {data.topEfficiencies.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{e.material}</div>
                        <div className="text-xs text-slate-500 truncate">{e.source}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {e.certified && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px]">
                          {t('dashboard.charts.certified')}
                        </Badge>
                      )}
                      <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                        {e.efficiency.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> {t('dashboard.charts.synthJudgment')}
            </CardTitle>
            <CardDescription>{t('dashboard.charts.synthDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.bySynthesized?.length ? (
              <EmptyChart label={t('empty.noClassificationsChart')} />
            ) : (
              <div className="space-y-3">
                {data.bySynthesized.map((s) => {
                  const total = data.bySynthesized.reduce((a, b) => a + b.count, 0)
                  const pct = total > 0 ? (s.count / total) * 100 : 0
                  return (
                    <div key={s.synthesized}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="capitalize font-medium">{t(`common.${s.synthesized}`)}</span>
                        <span className="text-slate-500">{s.count} · {pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: SYNTH_COLORS[s.synthesized] || '#94a3b8' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity heatmap (last 90 days) */}
      <TabErrorBoundary tabName={t('dashboard.tab.activityHeatmap')}>
        <ActivityHeatmap />
      </TabErrorBoundary>

      {/* Material knowledge graph (force-directed, full width) */}
      <TabErrorBoundary tabName={t('dashboard.tab.knowledgeGraph')}>
        <KnowledgeGraph onNavigate={onNavigate} />
      </TabErrorBoundary>

      {/* Efficiency trend by year */}
      <EfficiencyTrendChart />

      {/* Efficiency threshold-crossing predictions (linear regression) */}
      <TabErrorBoundary tabName={t('dashboard.tab.efficiencyPredictions')}>
        <EfficiencyPredictions onNavigate={onNavigate} />
      </TabErrorBoundary>

      {/* Papers timeline */}
      <PapersTimeline />

      {/* Paper acquisition trend (history) */}
      <TabErrorBoundary tabName={t('dashboard.tab.historyTrend')}>
        <HistoryTrendChart />
      </TabErrorBoundary>

      {/* Citation ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> {t('dashboard.citations.title')}
          </CardTitle>
          <CardDescription>{t('dashboard.citations.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <TabErrorBoundary tabName={t('dashboard.tab.citationRanking')}>
            <CitationRanking />
          </TabErrorBoundary>
        </CardContent>
      </Card>

      {/* Batch progress + Coverage matrix + Activity timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CoverageMatrix onNavigate={(materialId, tab) => onNavigate(tab || 'papers', materialId)} />
        </div>
        <div className="lg:col-span-1 space-y-6">
          <BatchProgressPanel />
          <ActivityTimeline />
        </div>
      </div>

      {/* AI-powered Research Opportunities (full width) */}
      <TabErrorBoundary tabName={t('dashboard.tab.researchDiscovery')}>
        <ResearchDiscovery onNavigate={onNavigate} />
      </TabErrorBoundary>

      {/* G12 + G13 — AI paper-draft generator & smart material recommender.
          Two side-by-side cards that open lazy-mounted dialogs. The draft
          generator is LLM-backed (so the dialog content is only rendered
          when first opened — no IntersectionObserver needed because no
          network call fires until the user clicks "Generate"). */}
      <AIAssistantCard
        onOpenDraft={() => setDraftOpen(true)}
        onOpenRecommend={() => setRecommendOpen(true)}
      />

      {/* Lazy-mounted dialogs — the heavy components (and their data
          fetches) only initialise when the user opens them. */}
      {draftOpen && (
        <DraftGeneratorDialog open={draftOpen} onOpenChange={setDraftOpen} />
      )}
      {recommendOpen && (
        <MaterialRecommenderDialog
          open={recommendOpen}
          onOpenChange={setRecommendOpen}
          onNavigate={onNavigate}
        />
      )}
    </div>
  )
}

/**
 * G12 + G13 dual card — sits below ResearchDiscovery. Two side-by-side
 * tiles, one for the AI paper-draft generator (LLM-backed) and one for the
 * smart material recommender (pure filter+score). Both open their respective
 * dialogs on click. Inline i18n per task spec — no provider changes.
 */
function AIAssistantCard({
  onOpenDraft,
  onOpenRecommend,
}: {
  onOpenDraft: () => void
  onOpenRecommend: () => void
}) {
  const { t } = useI18n()

  const draftTitle = t('dashboard.aiAssistant.draft.title')
  const draftDesc = t('dashboard.aiAssistant.draft.desc')
  const draftCta = t('dashboard.aiAssistant.draft.cta')

  const recommendTitle = t('dashboard.aiAssistant.recommend.title')
  const recommendDesc = t('dashboard.aiAssistant.recommend.desc')
  const recommendCta = t('dashboard.aiAssistant.recommend.cta')
  const aiBadge = t('dashboard.aiAssistant.aiBadge')
  const filterBadge = t('dashboard.aiAssistant.filterBadge')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* G12 — Draft generator */}
      <Card className="border-emerald-200/60 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/40 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <FileText className="w-5 h-5" aria-hidden />
            </div>
            <Badge
              variant="outline"
              className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
            >
              {aiBadge}
            </Badge>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{draftTitle}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              {draftDesc}
            </p>
          </div>
          <Button
            onClick={onOpenDraft}
            className="mt-auto bg-emerald-600 hover:bg-emerald-700 w-full"
            size="sm"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" aria-hidden />
            {draftCta}
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden />
          </Button>
        </CardContent>
      </Card>

      {/* G13 — Material recommender */}
      <Card className="border-amber-200/60 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/40 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <Lightbulb className="w-5 h-5" aria-hidden />
            </div>
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
            >
              {filterBadge}
            </Badge>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{recommendTitle}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              {recommendDesc}
            </p>
          </div>
          <Button
            onClick={onOpenRecommend}
            variant="outline"
            className="mt-auto border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40 w-full"
            size="sm"
          >
            <Search className="w-3.5 h-3.5 mr-1.5" aria-hidden />
            {recommendCta}
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ProgressRow({ label, value, hint, color }: { label: string; value: number; hint: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: '[&>div]:bg-emerald-500',
    violet: '[&>div]:bg-violet-500',
    amber: '[&>div]:bg-amber-500',
  }
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-medium">{label}</span>
        <span className="text-slate-500 text-xs tabular-nums">{hint} · {value.toFixed(0)}%</span>
      </div>
      <Progress value={value} className={`h-2 ${colorMap[color]}`} />
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex flex-col items-center justify-center text-center text-slate-400 text-sm">
      <Database className="w-8 h-8 mb-2 opacity-50" />
      {label}
    </div>
  )
}

function EfficiencyTrendChart() {
  const { t } = useI18n()
  const chart = useChartTheme()
  const { data, isLoading } = useQuery<{ trend: Array<{ year: number; maxEff: number; count: number; certified: number }> }>({
    queryKey: QUERY_KEYS.efficiencyTrend,
    queryFn: () => api('/api/efficiency-trend'),
    // DB-only aggregation — 5-min staleTime is plenty for a yearly trend
    // (the underlying data changes only on user action, and the chart
    // is small enough that a slightly stale series is invisible).
    staleTime: STALE_TIMES.efficiencyTrend,
  })

  const trend = data?.trend ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-orange-500" /> {t('dashboard.charts.effTrend')}
        </CardTitle>
        <CardDescription>{t('dashboard.charts.effTrendDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">{t('common.loading')}</div>
        ) : trend.length === 0 ? (
          <div className="h-[220px] flex flex-col items-center justify-center text-slate-400 text-sm">
            <TrendingUp className="w-8 h-8 mb-2 opacity-40" />
            {t('dashboard.charts.effTrendEmpty')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.axis} />
              <YAxis tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.axis} unit="%" />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: `1px solid ${chart.tooltipBorder}`,
                  fontSize: 12,
                  background: chart.tooltipBg,
                  color: chart.tooltipText,
                }}
                formatter={(v) => [`${(v as number).toFixed(2)}%`, t('dashboard.charts.effTrend')]}
              />
              <Line
                type="monotone"
                dataKey="maxEff"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ fill: '#f97316', r: 4 }}
                activeDot={{ r: 6 }}
                name={t('dashboard.charts.effTrend')}
              />
              {trend.some((d) => d.certified > 0) && (
                <Line
                  type="monotone"
                  dataKey="certified"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#10b981', r: 3 }}
                  name="certified"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Efficiency threshold-crossing predictions
// ---------------------------------------------------------------------------

interface PredictionDataPoint {
  year: number
  eff: number
}

interface MaterialPrediction {
  materialId: string
  materialName: string
  currentBest: number
  slope: number // pp/year
  intercept: number
  r2: number
  predictions: {
    threshold25: number | null
    threshold30: number | null
    threshold33: number | null
  }
  dataPoints: PredictionDataPoint[]
}

interface PredictionResponse {
  predictions: MaterialPrediction[]
  generatedAt: string
}

/**
 * Render a tiny inline sparkline of historical data points (emerald, solid)
 * plus a dashed orange projection to the next threshold year (or +5 years
 * when all tracked thresholds are already achieved).
 *
 * The SVG uses a fixed 120×40 viewBox and scales to its container via
 * `w-full`. The y-axis is clamped so the projection never escapes the
 * canvas — this is a visual hint, not a precise chart.
 */
function PredictionSparkline({
  points,
  slope,
  intercept,
  projectedYear,
  projectedEff,
}: {
  points: PredictionDataPoint[]
  slope: number
  intercept: number
  projectedYear: number
  projectedEff: number
}) {
  const W = 120
  const H = 40
  const pad = 4
  if (points.length === 0) return null

  const lastActual = points[points.length - 1]
  const allEffs = [...points.map((p) => p.eff), projectedEff]
  const allYears = [...points.map((p) => p.year), projectedYear]
  const minY = Math.min(...allEffs, 0)
  const maxY = Math.max(...allEffs, 25)
  const minX = Math.min(...allYears)
  const maxX = Math.max(...allYears)
  const rangeX = Math.max(1, maxX - minX)
  const rangeY = Math.max(0.5, maxY - minY)
  const sx = (x: number) => pad + ((x - minX) / rangeX) * (W - 2 * pad)
  const sy = (y: number) => H - pad - ((y - minY) / rangeY) * (H - 2 * pad)

  const actualPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.year).toFixed(1)} ${sy(p.eff).toFixed(1)}`)
    .join(' ')
  const projX = sx(projectedYear)
  const projY = sy(projectedEff)
  const lastX = sx(lastActual.year)
  const lastY = sy(lastActual.eff)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-10"
      preserveAspectRatio="none"
      role="img"
      aria-label="historical efficiency trend with projection"
    >
      {/* baseline grid hint */}
      <line
        x1={pad}
        y1={H - pad}
        x2={W - pad}
        y2={H - pad}
        stroke="currentColor"
        strokeWidth={0.5}
        className="text-slate-300 dark:text-slate-700"
      />
      {/* actual data line (emerald, solid) */}
      <path
        d={actualPath}
        stroke="#10b981"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* projection line (orange, dashed) */}
      <path
        d={`M ${lastX.toFixed(1)} ${lastY.toFixed(1)} L ${projX.toFixed(1)} ${projY.toFixed(1)}`}
        stroke="#f97316"
        strokeWidth={1.5}
        strokeDasharray="3 2"
        fill="none"
        strokeLinecap="round"
      />
      {/* actual data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={sx(p.year).toFixed(1)}
          cy={sy(p.eff).toFixed(1)}
          r={1.8}
          fill="#10b981"
        />
      ))}
      {/* projected end marker (hollow) */}
      <circle
        cx={projX.toFixed(1)}
        cy={projY.toFixed(1)}
        r={2.2}
        fill="none"
        stroke="#f97316"
        strokeWidth={1.2}
      />
    </svg>
  )
}

/**
 * Choose the next un-achieved threshold and its predicted year, plus the
 * projected efficiency value at that year for the sparkline.
 *
 * Priority: 30% first (the headline silicon-perovskite tandem target),
 * then 33% (the Shockley–Queisser single-junction limit neighborhood).
 * When both are already achieved we project +3 years for visual context.
 */
function chooseTarget(p: MaterialPrediction): {
  threshold: number
  year: number
  achieved: boolean
  effAtTarget: number
} {
  const currentYear = new Date().getFullYear()
  if (p.predictions.threshold30 != null) {
    const year = p.predictions.threshold30
    return { threshold: 30, year, achieved: false, effAtTarget: p.slope * year + p.intercept }
  }
  if (p.predictions.threshold33 != null) {
    const year = p.predictions.threshold33
    return { threshold: 33, year, achieved: false, effAtTarget: p.slope * year + p.intercept }
  }
  // Both 30% and 33% already crossed — project +3y for visual continuity.
  const year = currentYear + 3
  return { threshold: 33, year, achieved: true, effAtTarget: p.slope * year + p.intercept }
}

function EfficiencyPredictions({
  onNavigate,
}: {
  onNavigate: (t: TabValue, materialId?: string) => void
}) {
  const { t } = useI18n()

  // Lazy-load: /api/predict/efficiency runs an LLM (or heavy regression)
  // server-side and can take ~14s. Only fire it when this card scrolls
  // into view (or the user clicks "Load"). The 10-min staleTime means
  // re-entering the Dashboard tab does NOT re-trigger the request.
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

  const { data, isLoading } = useQuery<PredictionResponse>({
    queryKey: QUERY_KEYS.predict,
    queryFn: () => api<PredictionResponse>('/api/predict/efficiency'),
    enabled: isInView,
    // LLM-backed — cache for 10 min so predictions don't re-run on every
    // tab switch or window focus. NO refetchInterval (would re-run the
    // LLM every minute otherwise).
    staleTime: STALE_TIMES.predict,
  })

  const predictions = (data?.predictions ?? []).slice(0, 5)
  const title = t('dashboard.predictions.title')
  const desc = t('dashboard.predictions.desc')
  const emptyText = t('dashboard.predictions.empty')
  const loadingText = t('common.loading')
  const viewBtn = t('dashboard.predictions.viewBtn')
  const slopeLabel = t('dashboard.predictions.slope')
  const currentBestLabel = t('dashboard.predictions.currentBest')
  const forWord = t('dashboard.predictions.for')
  const achievedWord = t('dashboard.predictions.achieved')
  const r2Label = t('dashboard.predictions.r2')
  const lazyHint = t('dashboard.predictions.lazyHint')
  const loadBtn = t('dashboard.predictions.loadBtn')

  return (
    <Card ref={sentinelRef} className="border-emerald-200/60 dark:border-emerald-900/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-500" /> {title}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>
        {!isInView ? (
          <div className="h-[180px] flex flex-col items-center justify-center text-center gap-3">
            <Target className="w-8 h-8 text-slate-300 dark:text-slate-600" aria-hidden />
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">{lazyHint}</p>
            <Button size="sm" variant="outline" onClick={() => setIsInView(true)}>
              {loadBtn}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">
            <TrendingUp className="w-4 h-4 mr-2 animate-pulse" /> {loadingText}
          </div>
        ) : predictions.length === 0 ? (
          <div className="h-[180px] flex flex-col items-center justify-center text-center text-slate-400 text-sm gap-2">
            <Database className="w-8 h-8 opacity-40" />
            <p className="max-w-md">{emptyText}</p>
          </div>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x"
            role="list"
            aria-label={title}
          >
            {predictions.map((p) => {
              const target = chooseTarget(p)
              const targetText = target.achieved
                ? `${target.threshold}% ${achievedWord} ✓`
                : `~${target.year} ${forWord} ${target.threshold}%`
              const projectedEff = Math.max(
                p.currentBest,
                Math.min(40, target.effAtTarget),
              )
              return (
                <button
                  key={p.materialId}
                  role="listitem"
                  onClick={() => onNavigate('efficiency', p.materialId)}
                  className="snap-start shrink-0 w-[260px] text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 hover:shadow-md transition-all p-3 flex flex-col gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  title={viewBtn}
                >
                  {/* Material name */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {p.materialName}
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-700 shrink-0"
                    >
                      r²={p.r2.toFixed(2)}
                    </Badge>
                  </div>

                  {/* Current best */}
                  <div>
                    <div className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400 leading-tight">
                      {p.currentBest.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                      {currentBestLabel}
                    </div>
                  </div>

                  {/* Slope */}
                  <div className="flex items-center gap-1.5 text-sm">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{p.slope.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-500">{slopeLabel}</span>
                  </div>

                  {/* Predicted target year */}
                  <div className="flex items-center gap-1.5 text-sm">
                    <Target
                      className={`w-3.5 h-3.5 shrink-0 ${
                        target.achieved ? 'text-emerald-500' : 'text-amber-500'
                      }`}
                    />
                    <span
                      className={`font-medium ${
                        target.achieved
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {targetText}
                    </span>
                  </div>

                  {/* Sparkline */}
                  <div className="mt-1 rounded-md bg-slate-50 dark:bg-slate-950/50 p-1.5 border border-slate-100 dark:border-slate-800">
                    <PredictionSparkline
                      points={p.dataPoints}
                      slope={p.slope}
                      intercept={p.intercept}
                      projectedYear={target.year}
                      projectedEff={projectedEff}
                    />
                    <div className="flex items-center justify-between mt-1 text-[10px] sm:text-[9px] text-slate-400 tabular-nums">
                      <span>{p.dataPoints[0]?.year ?? '—'}</span>
                      <span className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-2 h-0.5 bg-emerald-500" />
                          {t('dashboard.predictions.legend.hist')}
                        </span>
                        <span className="flex items-center gap-1">
                          <span
                            className="inline-block w-2 h-0.5 border-t border-dashed border-orange-500"
                            style={{ borderTop: '1px dashed #f97316' }}
                          />
                          {t('dashboard.predictions.legend.proj')}
                        </span>
                      </span>
                      <span>{target.year}</span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="mt-auto pt-1 flex items-center justify-end text-[11px] text-slate-500 dark:text-slate-400 group-hover:text-emerald-600">
                    {viewBtn}
                    <ArrowRight className="w-3 h-3 ml-0.5" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Activity heatmap (last 90 days)
// ---------------------------------------------------------------------------

interface HeatmapEntry {
  date: string // YYYY-MM-DD (UTC)
  count: number
  types: { papers: number; classify: number; extract: number; verify: number }
}

interface ActivityHeatmapResponse {
  heatmap: HeatmapEntry[]
}

// Day-of-week labels for the left gutter. Index 0 = Sunday (top row), 6 = Saturday.
// Empty strings leave a blank row to keep the 7-row grid aligned.
const HEATMAP_DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

/** Pick the cell background class for a given daily count. */
function heatmapCellClass(count: number): string {
  if (count === 0) return 'bg-slate-100 dark:bg-slate-800'
  if (count <= 2) return 'bg-emerald-200 dark:bg-emerald-900'
  if (count <= 5) return 'bg-emerald-400 dark:bg-emerald-700'
  return 'bg-emerald-600 dark:bg-emerald-500'
}

/**
 * Group the flat 90-day list into column-major weeks (so the CSS grid can use
 * `grid-rows-7 grid-flow-col`). Each week is a 7-entry array indexed by
 * `getUTCDay()` (0=Sun..6=Sat); the first / last week may contain leading /
 * trailing nulls when the 90-day window doesn't start on a Sunday.
 */
function buildHeatmapWeeks(cells: HeatmapEntry[]): (HeatmapEntry | null)[][] {
  if (cells.length === 0) return []
  const weeks: (HeatmapEntry | null)[][] = []
  let currentWeek: (HeatmapEntry | null)[] = Array(7).fill(null)

  cells.forEach((cell, i) => {
    const d = new Date(cell.date + 'T00:00:00Z')
    const day = d.getUTCDay()
    if (i === 0) {
      // Pad the start of the first week so the first real cell lands on its
      // correct day-of-week row.
      for (let j = 0; j < day; j++) currentWeek[j] = null
    }
    currentWeek[day] = cell
    if (day === 6) {
      weeks.push(currentWeek)
      currentWeek = Array(7).fill(null)
    }
  })
  // Push the trailing partial week (if the window doesn't end on a Saturday).
  if (currentWeek.some((c) => c !== null)) {
    weeks.push(currentWeek)
  }
  return weeks
}

function ActivityHeatmap() {
  const { t } = useI18n()
  const { data, isLoading } = useQuery<ActivityHeatmapResponse>({
    // Same endpoint as ActivityTimeline — React Query dedupes the request so
    // both components share a single network round-trip.
    queryKey: QUERY_KEYS.activity,
    queryFn: () => api<ActivityHeatmapResponse>('/api/activity'),
    // Activity events don't change every 30s — 5-min staleTime is enough.
    // Removed refetchInterval to avoid wasteful periodic polling.
    staleTime: STALE_TIMES.activity,
  })

  const heatmap = data?.heatmap ?? []
  const weeks = buildHeatmapWeeks(heatmap)

  // Month labels: one per week column, shown only when the month changes from
  // the previous column (GitHub-style).
  const monthLabels = weeks.map((week, i) => {
    const first = week.find((c): c is HeatmapEntry => c !== null)
    if (!first) return ''
    const d = new Date(first.date + 'T00:00:00Z')
    const monthName = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    const prev = i > 0 ? weeks[i - 1].find((c): c is HeatmapEntry => c !== null) : null
    if (!prev) return monthName
    const prevD = new Date(prev.date + 'T00:00:00Z')
    return d.getUTCMonth() !== prevD.getUTCMonth() ? monthName : ''
  })

  const total = heatmap.reduce((sum, c) => sum + c.count, 0)
  const activeDays = heatmap.filter((c) => c.count > 0).length
  const maxDay = heatmap.reduce((max, c) => Math.max(max, c.count), 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-emerald-500" />
              {t('dashboard.heatmap.title')}
            </CardTitle>
            <CardDescription className="mt-1">
              {t('dashboard.heatmap.desc', { total, activeDays, maxDay })}
            </CardDescription>
          </div>
          {/* Inline legend */}
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <span>{t('dashboard.heatmap.legend.less')}</span>
            <div className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-800" />
            <div className="w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-900" />
            <div className="w-3 h-3 rounded-sm bg-emerald-400 dark:bg-emerald-700" />
            <div className="w-3 h-3 rounded-sm bg-emerald-600 dark:bg-emerald-500" />
            <span>{t('dashboard.heatmap.legend.more')}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">{t('common.loading')}</div>
        ) : heatmap.length === 0 ? (
          <div className="h-[180px] flex flex-col items-center justify-center text-slate-400 text-sm text-center">
            <ActivityIcon className="w-8 h-8 mb-2 opacity-40" />
            {t('dashboard.heatmap.empty')}
          </div>
        ) : (
          <div className="flex gap-2">
            {/* Day-of-week gutter */}
            <div className="grid grid-rows-7 gap-1 text-[10px] sm:text-[9px] text-slate-400 pt-[18px] pr-1 select-none shrink-0">
              {HEATMAP_DAY_LABELS.map((label, i) => (
                <div key={i} className="h-3 leading-3 flex items-center">
                  {label}
                </div>
              ))}
            </div>
            {/* Heatmap grid (horizontal scroll on mobile) */}
            <div className="flex-1 min-w-0 overflow-x-auto">
              {/* Month labels (one per week column) */}
              <div
                className="grid grid-flow-col gap-1 mb-1"
                style={{ gridAutoColumns: '12px', gridAutoRows: '12px' }}
              >
                {monthLabels.map((m, i) => (
                  <div
                    key={i}
                    className="text-[10px] sm:text-[9px] text-slate-400 leading-3 h-3 whitespace-nowrap overflow-visible"
                  >
                    {m}
                  </div>
                ))}
              </div>
              {/* Cells: 7 rows × N week columns, auto-flowing column-by-column */}
              <div
                className="grid grid-rows-7 grid-flow-col gap-1"
                style={{ gridAutoColumns: '12px', gridAutoRows: '12px' }}
              >
                {weeks.flat().map((cell, i) =>
                  cell ? (
                    <div
                      key={cell.date}
                      className={`w-3 h-3 rounded-sm ${heatmapCellClass(cell.count)} hover:ring-1 hover:ring-emerald-400 transition-all cursor-default`}
                      title={t('dashboard.heatmap.cell.title', { date: cell.date, count: cell.count, papers: cell.types.papers, classify: cell.types.classify, extract: cell.types.extract, verify: cell.types.verify })}
                    />
                  ) : (
                    // Placeholder for padding slots outside the 90-day window
                    <div key={`empty-${i}`} className="w-3 h-3" />
                  ),
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
