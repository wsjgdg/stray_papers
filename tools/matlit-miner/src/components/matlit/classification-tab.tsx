'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles,
  Loader2,
  Play,
  Filter,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Quote,
  Gauge,
  FlaskRound,
  Zap,
  GitBranch,
  RefreshCw,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Scale,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { api, doiUrl } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import { useProgressSocket } from '@/hooks/use-progress-socket'
import { useBrowserNotification } from '@/hooks/use-browser-notification'
import { EmptyState } from '@/components/matlit/empty-state'
import { RunDialog, type RunScope } from '@/components/matlit/run-dialog'

// Scite-style citation context label (mirrors the API response type).
// See src/app/api/classify/context/route.ts.
type CitationContext = 'supporting' | 'disputing' | 'mentioning' | 'neutral'

interface ContextEntry {
  context: CitationContext
  reason: string
}

// Max papers per /api/classify/context call (matches the server cap).
const CONTEXT_BATCH_SIZE = 20

interface Classification {
  id: string
  paperId: string
  materialId: string
  synthesized: string
  hasBandgap: boolean
  hasMethod: boolean
  hasEfficiency: boolean
  hasPhaseDiagram: boolean
  evidence: string
  confidence: number
  status: string
  paper?: {
    id: string
    title: string
    doi: string
    year: number | null
    abstract: string
    material: { name: string }
  }
}

export default function ClassificationTab({ focusMaterialId, onConsumeFocus }: { focusMaterialId?: string | null; onConsumeFocus?: () => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [scope, setScope] = useState<string>('') // '' = all materials
  const [filterSynth, setFilterSynth] = useState('all')
  const [minConfidence, setMinConfidence] = useState(0)
  const [featBandgap, setFeatBandgap] = useState(false)
  const [featMethod, setFeatMethod] = useState(false)
  const [featEfficiency, setFeatEfficiency] = useState(false)
  const [featPhaseDiagram, setFeatPhaseDiagram] = useState(false)

  // Scite-style citation context: paperId → { context, reason }.
  // Filled by the "Run context analysis" button below; surfaced as badges
  // on each classified paper card and used by the context filter chips.
  const [contextMap, setContextMap] = useState<Record<string, ContextEntry>>({})
  const [contextFilter, setContextFilter] = useState<'all' | CitationContext>('all')
  const [contextProgress, setContextProgress] = useState<{ done: number; total: number } | null>(null)

  // When navigated here with a focusMaterialId, set the scope filter
  useEffect(() => {
    if (focusMaterialId) {
      setScope(focusMaterialId)
      onConsumeFocus?.()
    }
  }, [focusMaterialId, onConsumeFocus])

  const { data: matData } = useQuery<{ materials: Array<{ id: string; name: string }> }>({
    queryKey: ['materials-mini'],
    queryFn: () => api('/api/materials'),
  })

  // Fetch classified papers
  const { data: papersData, isLoading } = useQuery<{ papers: Array<{ id: string; title: string; doi: string; year: number | null; abstract: string; material: { name: string; id: string }; classification: Classification | null }>; count: number }>({
    queryKey: ['papers-for-classify'],
    queryFn: () => api('/api/papers?limit=300'),
  })

  const { data: statsData } = useQuery<{ counts: { papers: number; classifications: number; synthesized: number } }>({
    queryKey: ['stats'],
    queryFn: () => api('/api/stats'),
    refetchInterval: 8000,
  })

  const classifyMut = useMutation({
    mutationFn: () =>
      api<{ processed: number; total: number }>('/api/classify', {
        method: 'POST',
        body: JSON.stringify({ materialId: scope || undefined, limit: 50 }),
      }),
    onSuccess: (d: { processed: number; total: number }) => {
      toast.success(t('classify.success', { processed: d.processed, total: d.total }))
      qc.invalidateQueries({ queryKey: ['papers-for-classify'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`${t('classify.failed')}: ${(e as Error).message}`),
  })

  const [reclassifyPaperId, setReclassifyPaperId] = useState<string | null>(null)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const reclassifyMut = useMutation({
    mutationFn: (paperId: string) => api(`/api/papers/${paperId}/reclassify`, { method: 'POST' }),
    onMutate: (paperId: string) => setReclassifyPaperId(paperId),
    onSuccess: () => {
      toast.success(t('classify.reclassify.success'))
      qc.invalidateQueries({ queryKey: ['papers-for-classify'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setReclassifyPaperId(null)
    },
    onError: (e) => {
      toast.error(`${t('classify.reclassify.failed')}: ${(e as Error).message}`)
      setReclassifyPaperId(null)
    },
  })

  const { startJob, completeJob } = useProgressSocket()
  const { notify } = useBrowserNotification()
  const [batchJobId, setBatchJobId] = useState<string | null>(null)
  const batchClassifyMut = useMutation({
    mutationFn: () => {
      const jobId = `classify-${Date.now()}`
      setBatchJobId(jobId)
      return api<{ processed: number; errors: number; total: number }>('/api/classify/batch', { method: 'POST', body: JSON.stringify({ limit: 500, jobId }) })
    },
    onMutate: () => {
      // startJob is called with the jobId that will be set in mutationFn
      // But mutationFn runs first, so we use a small delay
    },
    onSuccess: (d: { processed: number; errors: number; total: number }) => {
      toast.success(t('classify.batch.complete', { processed: d.processed, errors: d.errors }))
      notify('Batch Classification Complete', { body: `${d.processed} papers classified, ${d.errors} errors` })
      if (batchJobId) completeJob(batchJobId, 'completed')
      qc.invalidateQueries({ queryKey: ['papers-for-classify'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => {
      notify('Batch Classification Failed', { body: (e as Error).message })
      if (batchJobId) completeJob(batchJobId, 'failed')
      toast.error(`${t('classify.batch.failed')}: ${(e as Error).message}`)
    },
  })

  // ─── Scite-style citation context analysis ────────────────────────────
  // Calls POST /api/classify/context in batches of CONTEXT_BATCH_SIZE for
  // every classified paper currently in view (or in the chosen scope).
  // The server caches each paper's context for 1h, so re-runs are cheap.
  const [contextRunning, setContextRunning] = useState(false)
  const runContextAnalysis = async (paperIds: string[]) => {
    if (paperIds.length === 0) {
      toast.info(t('classify.context.noPapers'))
      return
    }
    setContextRunning(true)
    setContextProgress({ done: 0, total: paperIds.length })
    // Chunk into groups of CONTEXT_BATCH_SIZE and fire them in parallel.
    // The server caps concurrency at 3 per call, so 5 parallel batches →
    // ~15 in-flight LLM calls at a time (well within rate limits).
    const chunks: string[][] = []
    for (let i = 0; i < paperIds.length; i += CONTEXT_BATCH_SIZE) {
      chunks.push(paperIds.slice(i, i + CONTEXT_BATCH_SIZE))
    }
    let done = 0
    const counts: Record<CitationContext, number> = {
      supporting: 0,
      disputing: 0,
      mentioning: 0,
      neutral: 0,
    }
    try {
      await Promise.all(
        chunks.map(async (chunk) => {
          const resp = await api<{
            results: Array<{ paperId: string; context: CitationContext; reason: string }>
          }>('/api/classify/context', {
            method: 'POST',
            body: JSON.stringify({ paperIds: chunk }),
          })
          setContextMap((prev) => {
            const next = { ...prev }
            for (const r of resp.results) {
              next[r.paperId] = { context: r.context, reason: r.reason }
              counts[r.context] = (counts[r.context] ?? 0) + 1
            }
            return next
          })
          done += chunk.length
          setContextProgress({ done, total: paperIds.length })
        }),
      )
      toast.success(
        t('classify.context.success', {
          total: paperIds.length,
          supporting: counts.supporting,
          disputing: counts.disputing,
          mentioning: counts.mentioning,
        }),
      )
    } catch (e) {
      toast.error(`${t('classify.context.failed')}: ${(e as Error).message}`)
    } finally {
      setContextRunning(false)
      setContextProgress(null)
    }
  }

  const handleRunContext = () => {
    const classifiedIds = allPapers.filter((p) => p.classification).map((p) => p.id)
    void runContextAnalysis(classifiedIds)
  }

  const allPapers = papersData?.papers ?? []
  const filtered = allPapers.filter((p) => {
    if (scope && p.material.id !== scope) return false
    if (filterSynth === 'unclassified' && p.classification) return false
    if (filterSynth !== 'all' && filterSynth !== 'unclassified') {
      if (!p.classification || p.classification.synthesized !== filterSynth) return false
    }
    // Confidence filter (only applies to classified papers)
    if (minConfidence > 0) {
      if (!p.classification || p.classification.confidence * 100 < minConfidence) return false
    }
    // Feature toggle filters
    if (featBandgap && (!p.classification || !p.classification.hasBandgap)) return false
    if (featMethod && (!p.classification || !p.classification.hasMethod)) return false
    if (featEfficiency && (!p.classification || !p.classification.hasEfficiency)) return false
    if (featPhaseDiagram && (!p.classification || !p.classification.hasPhaseDiagram)) return false
    // Citation-context filter (Scite-style). Papers with no entry yet are
    // hidden when a non-'all' filter is active, EXCEPT 'neutral' which also
    // matches missing entries (so users can find unanalyzed papers).
    if (contextFilter !== 'all') {
      const entry = contextMap[p.id]
      const ctx: CitationContext = entry?.context ?? 'neutral'
      if (ctx !== contextFilter) return false
    }
    return true
  })

  const unclassifiedCount = allPapers.filter((p) => !p.classification).length
  const coverage = statsData && statsData.counts.papers > 0
    ? (statsData.counts.classifications / statsData.counts.papers) * 100
    : 0

  // Per-context counts for the filter chips (only counts classified papers,
  // since context only applies to classified papers).
  const contextCounts = useMemo(() => {
    const counts: Record<CitationContext, number> = {
      supporting: 0,
      disputing: 0,
      mentioning: 0,
      neutral: 0,
    }
    for (const p of allPapers) {
      if (!p.classification) continue
      const entry = contextMap[p.id]
      const ctx: CitationContext = entry?.context ?? 'neutral'
      counts[ctx] = (counts[ctx] ?? 0) + 1
    }
    return counts
  }, [allPapers, contextMap])

  // U8: compute per-scope counts for the unified Run dialog
  const currentMaterialName = scope
    ? matData?.materials.find((m) => m.id === scope)?.name ?? null
    : null
  const currentUnclassified = scope
    ? allPapers.filter((p) => p.material.id === scope && !p.classification).length
    : unclassifiedCount
  const batchUnclassified = unclassifiedCount

  const cap = 50
  const clSeconds = (n: number) => Math.min(n, cap) * 1.2
  const clCost = (n: number) =>
    `~${Math.min(n, cap)} LLM calls · ~${clSeconds(n).toFixed(0)}s · ~$${(Math.min(n, cap) * 0.001).toFixed(2)}`

  const runScopes: RunScope[] = [
    {
      value: 'current',
      label: currentMaterialName
        ? t('classify.scope.current.named', { name: currentMaterialName })
        : t('classify.scope.quick'),
      description: currentMaterialName
        ? t('classify.scope.current.named.desc', { name: currentMaterialName })
        : t('classify.runHint', { n: Math.min(currentUnclassified, cap) }),
      costEstimate: clCost(currentUnclassified),
      estimatedSeconds: clSeconds(currentUnclassified),
      count: currentUnclassified,
      disabled: currentUnclassified === 0,
    },
    {
      value: 'batch',
      label: t('classify.scope.batch'),
      description: t('classify.batch.desc'),
      costEstimate: clCost(batchUnclassified),
      estimatedSeconds: clSeconds(batchUnclassified),
      count: batchUnclassified,
      disabled: batchUnclassified === 0,
    },
  ]

  const handleRunConfirm = (runScope: string) => {
    if (runScope === 'batch') batchClassifyMut.mutate()
    else classifyMut.mutate()
  }

  return (
    <div className="space-y-4">
      {/* Action panel */}
      <Card className="border-violet-200/60 dark:border-violet-900/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" /> {t('classify.title')}
          </CardTitle>
          <CardDescription>
            {t('classify.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <MetricBox
              label={t('classify.metric.total')}
              value={statsData?.counts.papers ?? 0}
              icon={Quote}
              color="slate"
            />
            <MetricBox
              label={t('classify.metric.unclassified')}
              value={unclassifiedCount}
              icon={HelpCircle}
              color="amber"
            />
            <MetricBox
              label={t('classify.metric.synthesized')}
              value={statsData?.counts.synthesized ?? 0}
              icon={CheckCircle2}
              color="emerald"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t('classify.coverage')}</span>
              <span className="text-slate-500 tabular-nums">{coverage.toFixed(0)}%</span>
            </div>
            <Progress value={coverage} className="h-2 [&>div]:bg-violet-500" />
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{t('classify.scope')}</label>
              <Select value={scope || '__all__'} onValueChange={(v) => setScope(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder={t('common.allMaterials')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('common.allMaterials')}</SelectItem>
                  {(matData?.materials ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setRunDialogOpen(true)}
              disabled={classifyMut.isPending || batchClassifyMut.isPending || unclassifiedCount === 0}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {(classifyMut.isPending || batchClassifyMut.isPending) ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1.5" />
              )}
              {t('common.run')}
            </Button>
            <p className="text-xs text-slate-500 ml-auto">
              {t('classify.runHint', { n: Math.min(unclassifiedCount, 50) })}
            </p>
          </div>

          {/* Scite-style citation context analysis panel */}
          <div className="mt-3 flex flex-wrap items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-rose-50 dark:from-emerald-950/30 dark:to-rose-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
            <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {t('classify.context.panel.title')}
              </div>
              <div className="text-[11px] sm:text-[10px] text-slate-500">
                {contextRunning && contextProgress
                  ? t('classify.context.panel.analyzing', { done: contextProgress.done, total: contextProgress.total })
                  : t('classify.context.panel.desc')}
              </div>
            </div>
            {contextRunning && contextProgress && (
              <div className="w-32 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${(contextProgress.done / Math.max(1, contextProgress.total)) * 100}%` }}
                />
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunContext}
              disabled={contextRunning || allPapers.filter((p) => p.classification).length === 0}
              className="h-7 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              {contextRunning ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Scale className="w-3 h-3 mr-1" />
              )}
              {t('classify.context.run')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* U8: unified Run dialog with scope selection + cost estimate */}
      <RunDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        title={t('classify.runDialog.title')}
        description={t('classify.runDialog.desc')}
        icon={<Sparkles className="w-4 h-4 text-violet-500" />}
        scopes={runScopes}
        defaultScope="current"
        onConfirm={handleRunConfirm}
        isPending={classifyMut.isPending || batchClassifyMut.isPending}
        accent="violet"
      />

      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" /> {t('classify.results.title')}
                <Badge variant="secondary" className="ml-1">{filtered.length}</Badge>
              </CardTitle>
              <CardDescription>{t('classify.results.desc')}</CardDescription>
            </div>
            <Select value={filterSynth} onValueChange={setFilterSynth}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('classify.filter.all')}</SelectItem>
                <SelectItem value="unclassified">{t('classify.filter.unclassified')}</SelectItem>
                <SelectItem value="yes">{t('classify.filter.synthYes')}</SelectItem>
                <SelectItem value="no">{t('classify.filter.synthNo')}</SelectItem>
                <SelectItem value="uncertain">{t('classify.filter.synthUncertain')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Advanced filters */}
          <div className="mt-3 flex flex-wrap items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
            {/* Confidence slider */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="text-xs text-slate-500 whitespace-nowrap">{t('classify.filter.confidence', { n: minConfidence })}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="flex-1 h-1.5 accent-violet-500 cursor-pointer"
              />
            </div>
            {/* Feature toggles */}
            <div className="flex flex-wrap items-center gap-1.5">
              <FeatureToggle label={t('classify.filter.hasBandgap')} active={featBandgap} onClick={() => setFeatBandgap(!featBandgap)} color="emerald" />
              <FeatureToggle label={t('classify.filter.hasMethod')} active={featMethod} onClick={() => setFeatMethod(!featMethod)} color="violet" />
              <FeatureToggle label={t('classify.filter.hasEfficiency')} active={featEfficiency} onClick={() => setFeatEfficiency(!featEfficiency)} color="orange" />
              <FeatureToggle label={t('classify.filter.hasPhaseDiagram')} active={featPhaseDiagram} onClick={() => setFeatPhaseDiagram(!featPhaseDiagram)} color="sky" />
            </div>
          </div>

          {/* Citation-context filter chips (Scite-style) */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] sm:text-[10px] text-slate-500 inline-flex items-center gap-0.5">
              <Scale className="w-3 h-3" />
              {t('classify.context.label')}
            </span>
            <ContextChip
              label={t('classify.context.all')}
              active={contextFilter === 'all'}
              onClick={() => setContextFilter('all')}
              color="slate"
              count={null}
            />
            <ContextChip
              label={t('classify.context.supporting')}
              active={contextFilter === 'supporting'}
              onClick={() => setContextFilter('supporting')}
              color="emerald"
              count={contextCounts.supporting}
              icon={ThumbsUp}
            />
            <ContextChip
              label={t('classify.context.disputing')}
              active={contextFilter === 'disputing'}
              onClick={() => setContextFilter('disputing')}
              color="rose"
              count={contextCounts.disputing}
              icon={ThumbsDown}
            />
            <ContextChip
              label={t('classify.context.mentioning')}
              active={contextFilter === 'mentioning'}
              onClick={() => setContextFilter('mentioning')}
              color="slate"
              count={contextCounts.mentioning}
              icon={Minus}
            />
            <ContextChip
              label={t('classify.context.neutral')}
              active={contextFilter === 'neutral'}
              onClick={() => setContextFilter('neutral')}
              color="slate"
              count={contextCounts.neutral}
            />
            {Object.keys(contextMap).length === 0 && (
              <span className="text-[11px] sm:text-[10px] text-slate-400 italic ml-1">
                {t('classify.context.runFirst')}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="w-10 h-10" />}
              title={
                allPapers.length === 0
                  ? t('classify.empty.noPapers.title')
                  : t('classify.empty.noMatch.title')
              }
              description={
                allPapers.length === 0
                  ? t('classify.empty.noPapers.desc')
                  : t('classify.empty.noMatch.desc')
              }
              action={
                allPapers.length === 0
                  ? undefined
                  : {
                      label: t('classify.empty.noMatch.cta'),
                      onClick: () => setRunDialogOpen(true),
                    }
              }
              hint={
                allPapers.length === 0
                  ? undefined
                  : t('classify.empty.noMatch.hint')
              }
            />
          ) : (
            <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
              {filtered.map((p) => (
                <ClassRow
                  key={p.id}
                  paper={p}
                  onReclassify={reclassifyMut.mutate}
                  reclassifyingId={reclassifyMut.isPending ? reclassifyPaperId : null}
                  contextEntry={contextMap[p.id]}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricBox({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
    amber: 'text-amber-600 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300',
    emerald: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300',
  }
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-md flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}

function ClassRow({ paper, onReclassify, reclassifyingId, contextEntry }: { paper: { id: string; title: string; doi: string; year: number | null; material: { name: string }; classification: Classification | null }; onReclassify: (paperId: string) => void; reclassifyingId: string | null; contextEntry?: ContextEntry }) {
  const { t } = useI18n()
  const cls = paper.classification
  const isReclassifying = reclassifyingId === paper.id
  const [editing, setEditing] = useState(false)
  const [editSynth, setEditSynth] = useState(cls?.synthesized || 'uncertain')
  const qc = useQueryClient()

  const saveEdit = async () => {
    if (!cls) return
    await api(`/api/classification/${cls.id}`, { method: 'PUT', body: JSON.stringify({ synthesized: editSynth }) })
    toast.success(t('common.saved'))
    setEditing(false)
    qc.invalidateQueries({ queryKey: ['papers-for-classify'] })
  }

  return (
    <div className={`rounded-lg border p-3 bg-white dark:bg-slate-900 ${isReclassifying ? 'ring-2 ring-violet-400 animate-pulse' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className="text-[11px] sm:text-[10px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
              {paper.material.name}
            </Badge>
            {paper.year && <span className="text-xs text-slate-500">{paper.year}</span>}
          </div>
          <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">{paper.title}</h4>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {paper.doi && (
            <a href={doiUrl(paper.doi)} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 dark:text-sky-400 hover:underline">DOI ↗</a>
          )}
          <div className="flex items-center gap-1">
            {cls && !editing && (
              <button onClick={() => setEditing(true)} className="text-[11px] sm:text-[10px] text-slate-500 hover:text-amber-600 inline-flex items-center gap-0.5" title={t('common.edit')}>
                <Pencil className="w-3 h-3" />
              </button>
            )}
            <button onClick={() => onReclassify(paper.id)} disabled={isReclassifying} className="text-[11px] sm:text-[10px] text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 inline-flex items-center gap-0.5 disabled:opacity-50" title={t('classify.reclassify.title')}>
              {isReclassifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
      {!cls ? (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <HelpCircle className="w-3 h-3" /> {t('classify.pending')}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SynthBadge value={cls.synthesized} />
            <FeatureTag active={cls.hasBandgap} icon={Gauge} label={t('extract.field.bandgap')} />
            <FeatureTag active={cls.hasMethod} icon={FlaskRound} label={t('extract.field.method')} />
            <FeatureTag active={cls.hasEfficiency} icon={Zap} label={t('extract.field.efficiency')} />
            <FeatureTag active={cls.hasPhaseDiagram} icon={GitBranch} label={t('extract.field.phaseDiagram')} />
            <Badge variant="outline" className="text-[11px] sm:text-[10px] ml-auto">
              conf {(cls.confidence * 100).toFixed(0)}%
            </Badge>
          </div>
          {/* Scite-style citation context badge */}
          {contextEntry && (
            <div className="flex items-center gap-1.5">
              <CitationContextBadge entry={contextEntry} />
            </div>
          )}
          {cls.evidence && (
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded border-l-2 border-violet-400">
              <span className="text-violet-600 dark:text-violet-400 font-medium">{t('classify.evidence')}: </span>
              {cls.evidence}
            </div>
          )}
          {editing && (
            <div className="flex items-center gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <span className="text-[11px] sm:text-[10px] text-slate-500">synthesized:</span>
              <select value={editSynth} onChange={(e) => setEditSynth(e.target.value)} className="text-xs h-7 rounded border border-input bg-transparent px-2">
                <option value="yes">yes</option>
                <option value="no">no</option>
                <option value="uncertain">uncertain</option>
              </select>
              <Button size="sm" className="h-9 sm:h-6 text-[11px] sm:text-[10px]" onClick={saveEdit}>{t('common.save')}</Button>
              <Button size="sm" variant="ghost" className="h-9 sm:h-6 text-[11px] sm:text-[10px]" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Scite-style citation context badge with a tooltip showing the LLM's
 * one-sentence reason. Colors mirror the spec:
 *   supporting → emerald (ThumbsUp)
 *   disputing  → rose     (ThumbsDown)
 *   mentioning → slate    (Minus)
 *   neutral    → slate outline
 */
function CitationContextBadge({ entry }: { entry: ContextEntry }) {
  const { t } = useI18n()
  const { context, reason } = entry
  const labelKey: Record<CitationContext, string> = {
    supporting: 'classify.context.supporting',
    disputing: 'classify.context.disputing',
    mentioning: 'classify.context.mentioning',
    neutral: 'classify.context.neutral',
  }
  const label = t(labelKey[context])

  const styles: Record<CitationContext, { className: string; Icon: React.ElementType }> = {
    supporting: {
      className:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
      Icon: ThumbsUp,
    },
    disputing: {
      className:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
      Icon: ThumbsDown,
    },
    mentioning: {
      className:
        'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
      Icon: Minus,
    },
    neutral: {
      className:
        'bg-transparent text-slate-500 border-slate-300 dark:border-slate-700',
      Icon: HelpCircle,
    },
  }
  const { className, Icon } = styles[context]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`text-[11px] sm:text-[10px] cursor-help ${className}`}
        >
          <Icon className="w-2.5 h-2.5" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-[11px] leading-snug whitespace-normal">
        <span className="font-medium">{label}:</span> {reason}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Filter chip for the citation-context filter row. Shows the count next to
 * the label so users see how many papers fall in each bucket.
 */
function ContextChip({
  label,
  active,
  onClick,
  color,
  count,
  icon: Icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  color: 'slate' | 'emerald' | 'rose'
  count: number | null
  icon?: React.ElementType
}) {
  const colorMap: Record<string, string> = {
    slate: active
      ? 'bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
      : '',
    emerald: active
      ? 'bg-emerald-100 text-emerald-700 border-emerald-400 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700'
      : '',
    rose: active
      ? 'bg-rose-100 text-rose-700 border-rose-400 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700'
      : '',
  }
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[11px] sm:text-[10px] border transition-all inline-flex items-center gap-0.5 ${
        active
          ? colorMap[color]
          : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
      }`}
    >
      {Icon && <Icon className="w-2.5 h-2.5" />}
      {label}
      {count != null && count > 0 && (
        <span className="ml-0.5 tabular-nums opacity-70">{count}</span>
      )}
    </button>
  )
}

function SynthBadge({ value }: { value: string }) {
  const { t } = useI18n()
  if (value === 'yes') {
    return (
      <Badge variant="outline" className="text-[11px] sm:text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> {t('dashboard.progress.synthesized')}: {t('common.yes')}
      </Badge>
    )
  }
  if (value === 'no') {
    return (
      <Badge variant="outline" className="text-[11px] sm:text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
        <XCircle className="w-2.5 h-2.5 mr-0.5" /> {t('dashboard.progress.synthesized')}: {t('common.no')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[11px] sm:text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900">
      <HelpCircle className="w-2.5 h-2.5 mr-0.5" /> {t('dashboard.progress.synthesized')}: {t('common.uncertain')}
    </Badge>
  )
}

function FeatureTag({ active, icon: Icon, label }: { active: boolean; icon: React.ElementType; label: string }) {
  if (active) {
    return (
      <Badge variant="outline" className="text-[11px] sm:text-[10px] gap-0.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900">
        <Icon className="w-2.5 h-2.5" /> {label}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[11px] sm:text-[10px] gap-0.5 opacity-50 line-through">
      <Icon className="w-2.5 h-2.5" /> {label}
    </Badge>
  )
}

function FeatureToggle({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: active ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800' : '',
    violet: active ? 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800' : '',
    orange: active ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800' : '',
    sky: active ? 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800' : '',
  }
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[11px] sm:text-[10px] border transition-all ${active ? colorMap[color] : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
    >
      {label}
    </button>
  )
}
