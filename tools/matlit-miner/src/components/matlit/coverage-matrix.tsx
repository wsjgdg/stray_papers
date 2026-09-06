'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, AlertCircle, FlaskConical, FileText, Sparkles, Microscope, Zap, ShieldCheck, Search, Filter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/components/i18n/provider'
import { api } from '@/lib/api-client'

interface CoverageRow {
  id: string
  name: string
  category: string
  paperCount: number
  hasClassification: boolean
  synthesizedCount: number
  extractedCount: number
  hasEfficiency: boolean
  verificationStatus: string
}

interface CoverageData {
  matrix: CoverageRow[]
  summary: {
    total: number
    withPapers: number
    withClassification: number
    withSynthesis: number
    withExtraction: number
    withEfficiency: number
    verified: number
    flagged: number
  }
}

const CATEGORY_TINT: Record<string, string> = {
  perovskite: 'border-l-emerald-400',
  chalcogenide: 'border-l-amber-400',
  oxide: 'border-l-sky-400',
  other: 'border-l-slate-400',
}

function statusColor(done: boolean, partial = false): string {
  if (done) return 'bg-emerald-500 text-white'
  if (partial) return 'bg-amber-400 text-amber-900'
  return 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
}

function verifyColor(status: string): string {
  if (status === 'verified') return 'bg-emerald-500 text-white'
  if (status === 'flagged') return 'bg-amber-500 text-white'
  if (status === 'rejected') return 'bg-red-500 text-white'
  return 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
}

export default function CoverageMatrix({ onNavigate }: { onNavigate: (materialId: string, tab?: 'papers' | 'classification' | 'extraction' | 'efficiency' | 'verification') => void }) {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false)
  const { data, isLoading } = useQuery<CoverageData>({
    queryKey: ['coverage'],
    queryFn: () => api('/api/coverage'),
    refetchInterval: 15000,
  })

  const rawMatrix = data?.matrix ?? []
  const summary = data?.summary ?? { total: 0, withPapers: 0, withClassification: 0, withSynthesis: 0, withExtraction: 0, withEfficiency: 0, verified: 0, flagged: 0 }
  // U15: apply search + category filter + incomplete-only
  const matrix = useMemo(() => {
    return rawMatrix.filter((m) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!m.name.toLowerCase().includes(q)) return false
      }
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false
      if (showIncompleteOnly) {
        const stagesDone = [m.paperCount > 0, m.synthesizedCount > 0, m.extractedCount > 0, m.hasEfficiency, m.verificationStatus === 'verified'].filter(Boolean).length
        if (stagesDone === 5) return false
      }
      return true
    })
  }, [rawMatrix, searchQuery, categoryFilter, showIncompleteOnly])

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-slate-400 text-sm">
          {t('common.loading')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-teal-200/60 dark:border-teal-900/60">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-teal-500" /> {t('coverage.title')}
            </CardTitle>
            <CardDescription>{t('coverage.desc', { n: summary.total })}</CardDescription>
          </div>
          {/* Summary chips */}
          <div className="flex flex-wrap gap-1.5">
            <SummaryChip value={summary.withPapers} total={summary.total} label={t('coverage.summary.withPapers')} color="sky" icon={FileText} />
            <SummaryChip value={summary.withSynthesis} total={summary.total} label={t('coverage.summary.withSynth')} color="violet" icon={Sparkles} />
            <SummaryChip value={summary.withExtraction} total={summary.total} label={t('coverage.summary.withExtract')} color="rose" icon={Microscope} />
            <SummaryChip value={summary.withEfficiency} total={summary.total} label={t('coverage.summary.withEff')} color="orange" icon={Zap} />
            <SummaryChip value={summary.verified} total={summary.total} label={t('coverage.summary.verified')} color="emerald" icon={ShieldCheck} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* U15: search + filter toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('coverage.searchPh')}
              className="h-7 text-xs pl-7"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-7 text-[11px] w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('coverage.allCategories')}</SelectItem>
              <SelectItem value="perovskite">{t('coverage.catPerovskite')}</SelectItem>
              <SelectItem value="chalcogenide">{t('coverage.catChalcogenide')}</SelectItem>
              <SelectItem value="oxide">{t('coverage.catOxide')}</SelectItem>
              <SelectItem value="other">{t('coverage.catOther')}</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showIncompleteOnly}
              onChange={(e) => setShowIncompleteOnly(e.target.checked)}
              className="accent-teal-500"
            />
            {t('coverage.incompleteOnly')}
          </label>
          <span className="text-[10px] text-slate-400 ml-auto">
            {t('coverage.filterCount', { shown: matrix.length, total: rawMatrix.length })}
          </span>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mb-3 text-xs text-slate-500">
          <span className="font-medium">{t('coverage.legend')}:</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> {t('coverage.legend.done')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> {t('coverage.legend.partial')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-700" /> {t('coverage.legend.todo')}</span>
        </div>

        {/* Matrix grid - responsive: 1 col on mobile, up to 5 on xl */}
        <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {matrix.map((m) => {
            const hasClass = m.hasClassification
            const hasSynth = m.synthesizedCount > 0
            const hasExtract = m.extractedCount > 0
            // overall progress: count of completed stages out of 5
            const stagesDone = [m.paperCount > 0, hasSynth, hasExtract, m.hasEfficiency, m.verificationStatus === 'verified'].filter(Boolean).length
            const overall = stagesDone === 5 ? 'done' : stagesDone > 0 ? 'partial' : 'todo'
            const overallColor =
              overall === 'done' ? 'ring-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : overall === 'partial' ? 'ring-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
              : 'ring-slate-200 dark:ring-slate-700'

            return (
              <div
                key={m.id}
                onClick={() => onNavigate(m.id, 'papers')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(m.id, 'papers') } }}
                className={`text-left rounded-lg border border-l-4 ${CATEGORY_TINT[m.category] || CATEGORY_TINT.other} bg-white dark:bg-slate-900 p-2.5 ring-1 ${overallColor} hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer w-full`}
                title={`${m.name} — ${t('coverage.clickToView')}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-semibold truncate" title={m.name}>{m.name}</span>
                  <span className={`text-[9px] px-1 rounded ${overall === 'done' ? 'bg-emerald-500 text-white' : overall === 'partial' ? 'bg-amber-400 text-amber-900' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                    {stagesDone}/5
                  </span>
                </div>
                {/* Status dots row - each cell is clickable to jump to the relevant tab */}
                <div className="grid grid-cols-5 gap-1">
                  <StatusCell done={m.paperCount > 0} count={m.paperCount} icon={FileText} title={t('coverage.col.papers')} onClick={() => onNavigate(m.id, 'papers')} targetTabLabel={t('coverage.cell.papersTab')} />
                  <StatusCell done={hasSynth} count={m.synthesizedCount} icon={Sparkles} title={t('coverage.col.synth')} onClick={() => onNavigate(m.id, 'classification')} targetTabLabel={t('coverage.cell.classificationTab')} />
                  <StatusCell done={hasExtract} count={m.extractedCount} icon={Microscope} title={t('coverage.col.extract')} onClick={() => onNavigate(m.id, 'extraction')} targetTabLabel={t('coverage.cell.extractionTab')} />
                  <StatusCell done={m.hasEfficiency} icon={Zap} title={t('coverage.col.eff')} onClick={() => onNavigate(m.id, 'efficiency')} targetTabLabel={t('coverage.cell.efficiencyTab')} />
                  <StatusCell done={m.verificationStatus === 'verified'} partial={m.verificationStatus === 'flagged'} icon={ShieldCheck} title={t('coverage.col.verify')} customColor={verifyColor(m.verificationStatus)} onClick={() => onNavigate(m.id, 'verification')} targetTabLabel={t('coverage.cell.verificationTab')} />
                </div>
              </div>
            )
          })}
        </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}

function StatusCell({ done, partial, count, icon: Icon, title, customColor, onClick, targetTabLabel }: { done: boolean; partial?: boolean; count?: number; icon: React.ElementType; title: string; customColor?: string; onClick?: () => void; targetTabLabel?: string }) {
  const { t } = useI18n()
  const color = customColor || statusColor(done, partial)
  const valueText = count !== undefined ? String(count) : done ? '✓' : '—'
  const tooltipContent = (
    <div className="text-xs space-y-0.5">
      <div className="font-medium">{title}: {valueText}</div>
      {targetTabLabel && (
        <div className="text-[10px] opacity-70">{t('coverage.cell.clickHint', { tab: targetTabLabel })}</div>
      )}
    </div>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${title}: ${valueText}`}
          onClick={(e) => {
            e.stopPropagation()
            onClick?.()
          }}
          className={`flex flex-col items-center justify-center rounded h-9 ${color} hover:ring-2 hover:ring-slate-400 dark:hover:ring-slate-500 transition-all cursor-pointer`}
        >
          <Icon className="w-3 h-3 mb-0.5" />
          {count !== undefined && (
            <span className="text-[9px] font-bold leading-none tabular-nums">{count}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
}

function SummaryChip({ value, total, label, color, icon: Icon }: { value: number; total: number; label: string; color: string; icon: React.ElementType }) {
  const colorMap: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
    violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    orange: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  }
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] ${colorMap[color]}`}>
      <Icon className="w-2.5 h-2.5" />
      <span className="font-bold tabular-nums">{value}</span>
      <span className="opacity-60">/{total}</span>
      <span className="hidden md:inline opacity-70 ml-0.5">{label}</span>
    </Badge>
  )
}
