'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Microscope,
  Loader2,
  Play,
  Gauge,
  FlaskRound,
  Thermometer,
  GitBranch,
  Zap,
  Quote,
  ExternalLink,
  RefreshCw,
  Beaker,
  LayoutTemplate,
  FlaskConical,
  ShieldCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Search,
  CheckCircle2,
  FileText,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api, doiUrl } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import { useProgressSocket } from '@/hooks/use-progress-socket'
import { useBrowserNotification } from '@/hooks/use-browser-notification'
import { RunDialog, type RunScope } from '@/components/matlit/run-dialog'
import { EmptyState } from '@/components/matlit/empty-state'
import {
  TEMPLATES,
  type ExtractionField,
} from '@/lib/extraction-templates'
import type { TabValue } from '@/app/page'

interface ExtractionRow {
  id: string
  materialId: string
  synthesized: string
  bandgapValue: string
  synthesisMethod: string
  conditions: string
  phaseDiagramInfo: string
  efficiencyValue: string
  evidence: string
  confidence: number
  status: string
  paper: {
    id: string
    title: string
    doi: string
    year: number | null
    material: { name: string; id: string }
  }
}

export default function ExtractionTab({ focusMaterialId, onConsumeFocus, onNavigate }: { focusMaterialId?: string | null; onConsumeFocus?: () => void; onNavigate?: (tab: TabValue) => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [scope, setScope] = useState<string>('')
  const [onlySynth, setOnlySynth] = useState(true)
  const [minConfidence, setMinConfidence] = useState(0)
  const [featBandgap, setFeatBandgap] = useState(false)
  const [featMethod, setFeatMethod] = useState(false)
  const [featEfficiency, setFeatEfficiency] = useState(false)
  const [featPhaseDiagram, setFeatPhaseDiagram] = useState(false)
  // U3: extracted vs pending sub-tab (default 'extracted' so users see real data first)
  const [extractView, setExtractView] = useState<'extracted' | 'pending'>('extracted')

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

  // Fetch papers that have a classification, then map into ExtractionRow shape
  const { data, isLoading } = useQuery<{ papers: Array<{ id: string; title: string; doi: string; year: number | null; material: { name: string; id: string }; classification: Omit<ExtractionRow, 'paper'> | null }> }>({
    queryKey: ['papers-for-extract'],
    queryFn: () => api('/api/papers?limit=300'),
  })

  const { data: statsData } = useQuery<{ counts: { synthesized: number; extracted: number } }>({
    queryKey: ['stats'],
    queryFn: () => api('/api/stats'),
    refetchInterval: 8000,
  })

  const extractMut = useMutation({
    mutationFn: () =>
      api<{ processed: number; total: number }>('/api/extract', {
        method: 'POST',
        body: JSON.stringify({ materialId: scope || undefined, onlySynthesized: onlySynth, limit: 30 }),
      }),
    onSuccess: (d: { processed: number; total: number }) => {
      toast.success(`Extracted data from ${d.processed} / ${d.total} papers`)
      qc.invalidateQueries({ queryKey: ['papers-for-extract'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Extraction failed: ${(e as Error).message}`),
  })

  const [reextractPaperId, setReextractPaperId] = useState<string | null>(null)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const reextractMut = useMutation({
    mutationFn: (paperId: string) => api(`/api/papers/${paperId}/reextract`, { method: 'POST' }),
    onMutate: (paperId: string) => setReextractPaperId(paperId),
    onSuccess: () => {
      toast.success(t('extract.reextract.success'))
      qc.invalidateQueries({ queryKey: ['papers-for-extract'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setReextractPaperId(null)
    },
    onError: (e) => {
      toast.error(`${t('extract.reextract.failed')}: ${(e as Error).message}`)
      setReextractPaperId(null)
    },
  })

  const { startJob, completeJob } = useProgressSocket()
  const { notify } = useBrowserNotification()
  const [batchJobId, setBatchJobId] = useState<string | null>(null)
  const batchExtractMut = useMutation({
    mutationFn: () => {
      const jobId = `extract-${Date.now()}`
      setBatchJobId(jobId)
      return api<{ processed: number; errors: number; total: number }>('/api/extract/batch', { method: 'POST', body: JSON.stringify({ limit: 500, onlySynthesized: onlySynth, jobId }) })
    },
    onSuccess: (d: { processed: number; errors: number; total: number }) => {
      toast.success(t('extract.batch.complete', { processed: d.processed, errors: d.errors }))
      notify('Batch Extraction Complete', { body: `${d.processed} papers extracted, ${d.errors} errors` })
      if (batchJobId) completeJob(batchJobId, 'completed')
      qc.invalidateQueries({ queryKey: ['papers-for-extract'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => {
      notify('Batch Extraction Failed', { body: (e as Error).message })
      if (batchJobId) completeJob(batchJobId, 'failed')
      toast.error(`${t('extract.batch.failed')}: ${(e as Error).message}`)
    },
  })

  const allPapers = data?.papers ?? []
  const rows: ExtractionRow[] = []
  for (const p of allPapers) {
    if (p.classification) {
      if (scope && p.material.id !== scope) continue
      // U3: respect extractView sub-tab
      if (extractView === 'extracted' && p.classification.status !== 'extracted') continue
      if (extractView === 'pending' && p.classification.status === 'extracted') continue
      // Confidence filter
      if (minConfidence > 0 && p.classification.confidence * 100 < minConfidence) continue
      // Feature filters (only apply to extracted rows)
      if (p.classification.status === 'extracted') {
        if (featBandgap && !p.classification.bandgapValue) continue
        if (featMethod && !p.classification.synthesisMethod) continue
        if (featEfficiency && !p.classification.efficiencyValue) continue
        if (featPhaseDiagram && !p.classification.phaseDiagramInfo) continue
      }
      // attach the parent paper info so the card can render title/doi/material
      rows.push({
        ...p.classification,
        paper: {
          id: p.id,
          title: p.title,
          doi: p.doi,
          year: p.year,
          material: p.material,
        },
      })
    }
  }
  // U3: compute counts for sub-tabs
  const extractedRowsCount = allPapers.filter(p => p.classification?.status === 'extracted').length
  const pendingRowsCount = allPapers.filter(p => p.classification && p.classification.status !== 'extracted').length
  // U17: compute per-filter counts from extracted rows
  const countBandgap = allPapers.filter(p => p.classification?.status === 'extracted' && p.classification.bandgapValue).length
  const countMethod = allPapers.filter(p => p.classification?.status === 'extracted' && p.classification.synthesisMethod).length
  const countEfficiency = allPapers.filter(p => p.classification?.status === 'extracted' && p.classification.efficiencyValue).length
  const countPhaseDiagram = allPapers.filter(p => p.classification?.status === 'extracted' && p.classification.phaseDiagramInfo).length
  // sort: extracted first, then by confidence desc
  rows.sort((a, b) => {
    if (a.status === 'extracted' && b.status !== 'extracted') return -1
    if (b.status === 'extracted' && a.status !== 'extracted') return 1
    return b.confidence - a.confidence
  })

  const extractedCount = statsData?.counts.extracted ?? 0
  const synthCount = statsData?.counts.synthesized ?? 0
  const pendingExtraction = Math.max(0, synthCount - extractedCount)

  // U8: compute per-scope pending counts for the unified Run dialog
  const isPendingForExtract = (p: typeof allPapers[number]) => {
    if (!p.classification) return false
    if (p.classification.status === 'extracted') return false
    if (onlySynth && p.classification.synthesized !== 'yes') return false
    return true
  }
  const currentMaterialName = scope
    ? matData?.materials.find((m) => m.id === scope)?.name ?? null
    : null
  const currentPending = scope
    ? allPapers.filter((p) => p.material.id === scope && isPendingForExtract(p)).length
    : allPapers.filter((p) => isPendingForExtract(p)).length
  const batchPending = pendingExtraction

  const cap = 30
  const exSeconds = (n: number) => Math.min(n, cap) * 2.4
  const exCost = (n: number) =>
    `~${Math.min(n, cap)} LLM calls · ~${exSeconds(n).toFixed(0)}s · ~$${(Math.min(n, cap) * 0.002).toFixed(2)}`

  const runScopes: RunScope[] = [
    {
      value: 'current',
      label: currentMaterialName
        ? t('extract.scope.current.named', { name: currentMaterialName })
        : t('extract.scope.quick'),
      description: currentMaterialName
        ? t('extract.scope.current.named.desc', { name: currentMaterialName })
        : t('extract.runHint', { n: Math.min(currentPending, cap) }),
      costEstimate: exCost(currentPending),
      estimatedSeconds: exSeconds(currentPending),
      count: currentPending,
      disabled: currentPending === 0,
    },
    {
      value: 'batch',
      label: t('extract.scope.batch'),
      description: t('extract.batch.desc'),
      costEstimate: exCost(batchPending),
      estimatedSeconds: exSeconds(batchPending),
      count: batchPending,
      disabled: batchPending === 0,
    },
  ]

  const handleRunConfirm = (runScope: string) => {
    if (runScope === 'batch') batchExtractMut.mutate()
    else extractMut.mutate()
  }

  return (
    <div className="space-y-4">
      <StructuredExtractionCard
        materials={matData?.materials ?? []}
      />
      <Card className="border-rose-200/60 dark:border-rose-900/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Microscope className="w-4 h-4 text-rose-500" /> {t('extract.title')}
          </CardTitle>
          <CardDescription>
            {t('extract.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Metric label={t('extract.metric.synthesized')} value={synthCount} color="emerald" />
            <Metric label={t('extract.metric.extracted')} value={extractedCount} color="rose" />
            <Metric label={t('extract.metric.pending')} value={pendingExtraction} color="amber" />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{t('extract.scope')}</label>
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
            <div className="flex items-center gap-2 pb-2">
              <Switch id="only-synth" checked={onlySynth} onCheckedChange={setOnlySynth} />
              <Label htmlFor="only-synth" className="text-xs cursor-pointer">{t('extract.onlySynth')}</Label>
            </div>
            <Button
              onClick={() => setRunDialogOpen(true)}
              disabled={extractMut.isPending || batchExtractMut.isPending || pendingExtraction === 0}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {(extractMut.isPending || batchExtractMut.isPending) ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1.5" />
              )}
              {t('common.run')}
            </Button>
            <p className="text-xs text-slate-500 ml-auto">
              {t('extract.runHint', { n: Math.min(pendingExtraction, 30) })}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* U8: unified Run dialog with scope selection + cost estimate */}
      <RunDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        title={t('extract.runDialog.title')}
        description={t('extract.runDialog.desc')}
        icon={<Microscope className="w-4 h-4 text-rose-500" />}
        scopes={runScopes}
        defaultScope="current"
        onConfirm={handleRunConfirm}
        isPending={extractMut.isPending || batchExtractMut.isPending}
        accent="rose"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Microscope className="w-4 h-4 text-slate-500" /> {t('extract.results.title')}
            {/* U3: sub-tabs replacing misleading single count */}
            <div className="ml-2 flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setExtractView('extracted')}
                className={`px-2.5 h-7 text-xs transition-colors ${extractView === 'extracted' ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {t('extract.subExtracted', { n: extractedRowsCount })}
              </button>
              <button
                onClick={() => setExtractView('pending')}
                className={`px-2.5 h-7 text-xs transition-colors ${extractView === 'pending' ? 'bg-slate-700 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {t('extract.subPending', { n: pendingRowsCount })}
              </button>
            </div>
            <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
          </CardTitle>
          <CardDescription>{t('extract.results.desc')}</CardDescription>
          {/* Advanced filters */}
          <div className="mt-3 flex flex-wrap items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="text-xs text-slate-500 whitespace-nowrap">{t('extract.filter.confidence', { n: minConfidence })}</span>
              <input
                type="range"
                aria-label={t('extract.filter.confidenceAria')}
                min={0}
                max={100}
                step={5}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="flex-1 h-1.5 accent-rose-500 cursor-pointer"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ExtractFeatureToggle label={`${t('extract.filter.hasBandgap')} (${countBandgap})`} active={featBandgap} onClick={() => setFeatBandgap(!featBandgap)} color="emerald" />
              <ExtractFeatureToggle label={`${t('extract.filter.hasMethod')} (${countMethod})`} active={featMethod} onClick={() => setFeatMethod(!featMethod)} color="violet" />
              <ExtractFeatureToggle label={`${t('extract.filter.hasEfficiency')} (${countEfficiency})`} active={featEfficiency} onClick={() => setFeatEfficiency(!featEfficiency)} color="orange" />
              <ExtractFeatureToggle label={`${t('extract.filter.hasPhaseDiagram')} (${countPhaseDiagram})`} active={featPhaseDiagram} onClick={() => setFeatPhaseDiagram(!featPhaseDiagram)} color="sky" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Beaker />}
              title={t('extract.empty.title')}
              description={t('extract.empty.desc')}
              action={
                onNavigate
                  ? {
                      label: t('extract.empty.cta'),
                      onClick: () => onNavigate('classification'),
                    }
                  : undefined
              }
              hint={t('extract.empty.hint')}
            />
          ) : (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {rows.map((r) => (
                <ExtractCard key={r.id} row={r} onReextract={reextractMut.mutate} reextractingId={reextractMut.isPending ? reextractPaperId : null} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400',
    rose: 'border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400',
    amber: 'border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400',
  }
  return (
    <div className={`rounded-lg border p-3 ${colorMap[color]}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  )
}

function ExtractCard({ row, onReextract, reextractingId }: { row: ExtractionRow; onReextract: (paperId: string) => void; reextractingId: string | null }) {
  const { t } = useI18n()
  const isExtracted = row.status === 'extracted'
  const isReextracting = reextractingId === row.paper.id
  return (
    <div className={`rounded-lg border p-3 bg-white dark:bg-slate-900 ${isExtracted ? 'border-rose-200 dark:border-rose-900' : 'border-slate-200 dark:border-slate-800'} ${isReextracting ? 'ring-2 ring-sky-400 animate-pulse' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
              {row.paper.material.name}
            </Badge>
            {row.paper.year && <span className="text-xs text-slate-500">{row.paper.year}</span>}
            <Badge variant="outline" className={`text-[10px] ${isExtracted ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900' : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              {isExtracted ? t('extract.statusExtracted') : t('extract.statusClassified')}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              conf {(row.confidence * 100).toFixed(0)}%
            </Badge>
          </div>
          <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
            {row.paper.title}
          </h4>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {row.paper.doi && (
            <a
              href={doiUrl(row.paper.doi)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5"
            >
              DOI <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={() => onReextract(row.paper.id)}
            disabled={isReextracting}
            className="text-[10px] text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 inline-flex items-center gap-0.5 disabled:opacity-50"
            title={t('extract.reextract.title')}
          >
            {isReextracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {t('extract.reextract.button')}
          </button>
        </div>
      </div>
      {isExtracted ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <Field icon={Gauge} label={t('extract.field.bandgap')} value={row.bandgapValue || '—'} unit="eV" highlight={!!row.bandgapValue} />
          <Field icon={Zap} label={t('extract.field.efficiency')} value={row.efficiencyValue || '—'} unit="%" highlight={!!row.efficiencyValue} />
          <Field icon={FlaskRound} label={t('extract.field.method')} value={row.synthesisMethod || '—'} />
          <Field icon={Thermometer} label={t('extract.field.conditions')} value={row.conditions || '—'} />
          {row.phaseDiagramInfo && (
            <div className="sm:col-span-2">
              <Field icon={GitBranch} label={t('extract.field.phaseDiagram')} value={row.phaseDiagramInfo} />
            </div>
          )}
          {row.evidence && (
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded border-l-2 border-rose-400">
                <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 mb-1">
                  <Quote className="w-3 h-3" /> {t('extract.evidence')}
                </span>
                {row.evidence}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-500 mt-1 italic">{t('extract.awaiting')}</div>
      )}
    </div>
  )
}

function Field({ icon: Icon, label, value, unit, highlight }: { icon: React.ElementType; label: string; value: string; unit?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md p-2 border ${highlight ? 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900' : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'}`}>
      <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words">
        {value}{unit && value !== '—' && value !== '' && <span className="text-slate-400 ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}

function ExtractFeatureToggle({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: active ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800' : '',
    violet: active ? 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800' : '',
    orange: active ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800' : '',
    sky: active ? 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800' : '',
  }
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${active ? colorMap[color] : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// StructuredExtractionCard (E1)
// Elicit-style template-driven extraction: pick a template (Solar cell /
// Synthesis / Stability), run extraction across the chosen material's papers,
// and render a cross-paper comparison table that is sortable, searchable,
// CSV-exportable, and clickable to open the paper drawer.
// ---------------------------------------------------------------------------

type FieldValue = number | string | boolean | null

interface TemplateApiRow {
  paperId: string
  title: string
  year: number | null
  doi: string
  materialId: string
  materialName: string
  data: Record<string, FieldValue>
}

interface TemplateApiResponse {
  templateId: string
  templateName: string
  results: TemplateApiRow[]
  cached: boolean
  message?: string
}

const TEMPLATE_ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  FlaskConical,
  ShieldCheck,
}

type SortDir = 'asc' | 'desc'
interface SortState {
  field: string // field.key OR 'title' / 'year'
  dir: SortDir
}

function StructuredExtractionCard({
  materials,
}: {
  materials: Array<{ id: string; name: string }>
}) {
  const { t } = useI18n()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(TEMPLATES[0]?.id ?? '')
  const [materialId, setMaterialId] = useState<string>('') // '' = all
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)

  const template = useMemo(
    () => TEMPLATES.find((t) => t.id === selectedTemplateId) ?? null,
    [selectedTemplateId],
  )

  const { data, isPending, mutate, reset } = useMutation<TemplateApiResponse, Error, void>({
    mutationFn: () =>
      api<TemplateApiResponse>('/api/extract/template', {
        method: 'POST',
        body: JSON.stringify({
          templateId: selectedTemplateId,
          materialId: materialId || undefined,
        }),
      }),
    onError: (e) => {
      toast.error(t('extract.template.failed', { message: e.message }))
    },
  })

  const results = data?.results ?? []

  // Filter by title search.
  const filtered = useMemo(() => {
    if (!search.trim()) return results
    const q = search.trim().toLowerCase()
    return results.filter((r) => r.title.toLowerCase().includes(q))
  }, [results, search])

  // Sort by current sort state.
  const sorted = useMemo(() => {
    if (!sort) return filtered
    const arr = [...filtered]
    const dirMul = sort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const av = getSortValue(a, sort.field)
      const bv = getSortValue(b, sort.field)
      if (av === null && bv === null) return 0
      if (av === null) return 1 // nulls last regardless of direction
      if (bv === null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dirMul
      return String(av).localeCompare(String(bv)) * dirMul
    })
    return arr
  }, [filtered, sort])

  const handleSort = (field: string) => {
    setSort((prev) => {
      if (prev?.field === field) {
        return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { field, dir: 'asc' }
    })
  }

  const handleRun = () => {
    if (!template) return
    reset()
    mutate()
  }

  const handleExportCsv = () => {
    if (!template || sorted.length === 0) return
    const headers = [
      'Title',
      'Year',
      'Material',
      'DOI',
      ...template.fields.map((f) => `${f.label}${f.unit ? ` (${f.unit})` : ''}`),
    ]
    const escape = (v: string) => {
      const s = v.replace(/"/g, '""')
      return /[",\n]/.test(s) ? `"${s}"` : s
    }
    const lines = [headers.map(escape).join(',')]
    for (const r of sorted) {
      const cells: string[] = [
        r.title,
        r.year != null ? String(r.year) : '',
        r.materialName,
        r.doi,
        ...template.fields.map((f) => {
          const v = r.data[f.key]
          if (v === null || v === undefined) return ''
          if (typeof v === 'boolean') return v ? 'yes' : 'no'
          return String(v)
        }),
      ]
      lines.push(cells.map(escape).join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extraction-${template.id}-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(t('extract.csv.downloaded'))
  }

  const openPaperDrawer = (row: TemplateApiRow) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('matlit:open-paper', {
        detail: {
          id: row.paperId,
          title: row.title,
          year: row.year,
          doi: row.doi,
          materialId: row.materialId,
          materialName: row.materialName,
        },
      }),
    )
  }

  return (
    <Card className="border-emerald-200/60 dark:border-emerald-900/60">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutTemplate className="w-4 h-4 text-emerald-500" />
          {t('extract.template.title')}
        </CardTitle>
        <CardDescription>
          {t('extract.template.desc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template picker — 3 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TEMPLATES.map((tpl) => {
            const Icon = TEMPLATE_ICON_MAP[tpl.icon] ?? LayoutTemplate
            const active = tpl.id === selectedTemplateId
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedTemplateId(tpl.id)}
                aria-pressed={active}
                className={`text-left rounded-lg border p-3 transition-all ${
                  active
                    ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30 ring-1 ring-emerald-400/40'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300 dark:hover:border-emerald-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      className={`w-4 h-4 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
                    />
                    <span className="text-sm font-medium">{tpl.name}</span>
                  </div>
                  {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug mb-1">{tpl.description}</p>
                <span className="text-[10px] text-slate-400">
                  {tpl.fields.length} {t('extract.template.fields')}
                </span>
              </button>
            )
          })}
        </div>

        {/* Material selector + Run button */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              {t('extract.template.materialScope')}
            </label>
            <Select value={materialId || '__all__'} onValueChange={(v) => setMaterialId(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder={t('common.allMaterials')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">
                  {t('extract.template.allMaterials')}
                </SelectItem>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleRun}
            disabled={isPending || !template}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-1.5" />
            )}
            {t('extract.template.run')}
          </Button>
          <p className="text-xs text-slate-500 ml-auto">
            {t('extract.template.runHint')}
          </p>
        </div>

        {/* Results section */}
        {isPending && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        )}

        {!isPending && data && results.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-sm text-slate-500">
            {data.message ?? t('extract.template.empty')}
          </div>
        )}

        {!isPending && results.length > 0 && template && (
          <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('extract.template.filterPlaceholder')}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="h-8"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {t('extract.template.exportCsv')}
              </Button>
              {data?.cached && (
                <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                  {t('extract.template.fromCache')}
                </Badge>
              )}
              <Badge variant="secondary" className="text-[10px]">
                {sorted.length} / {results.length} {t('extract.template.rows')}
              </Badge>
            </div>

            {/* Table — horizontally scrollable on small screens */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
                  <TableRow>
                    <SortableTh
                      label={t('extract.template.col.paper')}
                      field="title"
                      sort={sort}
                      onSort={handleSort}
                      className="min-w-[200px]"
                    />
                    <SortableTh
                      label={t('extract.template.col.year')}
                      field="year"
                      sort={sort}
                      onSort={handleSort}
                      className="w-[70px]"
                    />
                    {template.fields.map((f) => (
                      <SortableTh
                        key={f.key}
                        label={f.label}
                        field={f.key}
                        sort={sort}
                        onSort={handleSort}
                        className="min-w-[110px]"
                      />
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r) => (
                    <TableRow
                      key={r.paperId}
                      onClick={() => openPaperDrawer(r)}
                      className="cursor-pointer"
                    >
                      <TableCell className="max-w-[280px]">
                        <div className="flex items-start gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                              {r.title}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{r.materialName}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {r.year ?? '—'}
                      </TableCell>
                      {template.fields.map((f) => (
                        <TableCell key={f.key}>
                          <FieldCell value={r.data[f.key]} field={f} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function getSortValue(row: TemplateApiRow, field: string): FieldValue {
  if (field === 'title') return row.title
  if (field === 'year') return row.year
  const v = row.data[field]
  if (v === null || v === undefined) return null
  return v
}

function SortableTh({
  label,
  field,
  sort,
  onSort,
  className,
}: {
  label: string
  field: string
  sort: SortState | null
  onSort: (field: string) => void
  className?: string
}) {
  const active = sort?.field === field
  const Icon = !active ? ArrowUpDown : sort?.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 text-xs font-medium hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        {label}
        <Icon
          className={`w-3 h-3 ${active ? 'text-emerald-500' : 'text-slate-400'}`}
        />
      </button>
    </TableHead>
  )
}

function FieldCell({ value, field }: { value: FieldValue; field: ExtractionField }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-300 dark:text-slate-600">—</span>
  }
  switch (field.type) {
    case 'number':
      return (
        <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {typeof value === 'number' ? value : String(value)}
          {field.unit && <span className="ml-0.5 text-[10px] font-normal text-slate-400">{field.unit}</span>}
        </span>
      )
    case 'boolean':
      return value === true ? (
        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          yes
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
          no
        </Badge>
      )
    case 'enum':
      return (
        <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
          {String(value)}
        </Badge>
      )
    case 'string':
    default:
      return (
        <span className="text-xs text-slate-700 dark:text-slate-300 break-words">
          {String(value)}
        </span>
      )
  }
}
