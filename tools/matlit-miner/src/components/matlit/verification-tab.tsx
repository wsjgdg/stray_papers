'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Flag,
  ExternalLink,
  Save,
  AlertCircle,
  RotateCcw,
  UserPlus,
  MessageSquare,
  Send,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { api, doiUrl } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import { useProject } from '@/components/project-provider'
import { EmptyState } from '@/components/matlit/empty-state'
import {
  VerifyPrefill,
  LoadExtractedButton,
  AutoBadge,
  type PrefillData,
} from '@/components/matlit/verify-prefill'

/** Response shape from GET /api/verify (used by the reviewer-picker). */
interface ReviewersResponse {
  records: Array<{ reviewer: string }>
}

/** Response shape from GET /api/verify/[id]/notes. */
interface NotesResponse {
  notes: Array<{
    timestamp: string
    reviewer: string
    note: string
    legacy?: boolean
  }>
}

// Deterministic color picker for reviewer avatars. Hashes the reviewer name
// into a small palette of pastel Tailwind class triples so the same reviewer
// always gets the same color across renders.
const REVIEWER_PALETTE: Array<{ bg: string; text: string; ring: string }> = [
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-300 dark:ring-emerald-700' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', ring: 'ring-amber-300 dark:ring-amber-700' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', ring: 'ring-rose-300 dark:ring-rose-700' },
  { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-700 dark:text-sky-300', ring: 'ring-sky-300 dark:ring-sky-700' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300', ring: 'ring-violet-300 dark:ring-violet-700' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', ring: 'ring-teal-300 dark:ring-teal-700' },
]

function reviewerColor(name: string): { bg: string; text: string; ring: string } {
  if (!name) return REVIEWER_PALETTE[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return REVIEWER_PALETTE[hash % REVIEWER_PALETTE.length]
}

/** Take the first letter of each whitespace-separated token (max 2). */
function reviewerInitials(name: string): string {
  if (!name || name === 'anonymous') return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/** Format an ISO timestamp for the notes thread. */
function formatTimestamp(iso: string, locale: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const opts: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
    // `locale` is already a BCP 47 tag ('en' or 'zh') — Intl.DateTimeFormat
    // accepts both, resolving to the region default (en-US / zh-Hans).
    return d.toLocaleString(locale, opts)
  } catch {
    return iso
  }
}

interface MaterialRow {
  id: string
  name: string
  aliases: string
  category: string
  _count: { papers: number; efficiencies: number; verifications: number }
  papers: Array<{ doi: string; title: string }>
  classifications: Array<{ synthesized: string; bandgapValue: string; synthesisMethod: string; conditions: string; efficiencyValue: string; phaseDiagramInfo: string; status: string }>
  efficiencies: Array<{ efficiencyValue: number; certified: boolean; source: string; doi: string }>
  verifications: Array<{ id: string; status: string; reviewer: string; notes: string; checkedFields: string; doiChecked: string }>
}

const CHECK_FIELDS = [
  { id: 'bandgap', labelKey: 'extract.field.bandgap' },
  { id: 'method', labelKey: 'extract.field.method' },
  { id: 'conditions', labelKey: 'extract.field.conditions' },
  { id: 'efficiency', labelKey: 'extract.field.efficiency' },
  { id: 'phaseDiagram', labelKey: 'extract.field.phaseDiagram' },
]

export default function VerificationTab({ focusMaterialId, onConsumeFocus }: { focusMaterialId?: string | null; onConsumeFocus?: () => void }) {
  const { t } = useI18n()
  const { project, reviewer } = useProject()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string>('')
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set())
  // U6: search + status filter + sort
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'verified' | 'flagged'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'papers' | 'status'>('name')

  // When navigated here with a focusMaterialId, select that material
  useEffect(() => {
    if (focusMaterialId) {
      setSelectedId(focusMaterialId)
      onConsumeFocus?.()
    }
  }, [focusMaterialId, onConsumeFocus])

  const { data: matData, isLoading } = useQuery<{ materials: MaterialRow[] }>({
    queryKey: ['materials-verify'],
    queryFn: () => api('/api/materials?full=true'),
  })

  const materials = matData?.materials ?? []
  // U6: apply search + status filter + sort
  const filteredMaterials = materials
    .filter((m) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchesName = m.name.toLowerCase().includes(q)
        const matchesAlias = m.aliases?.toLowerCase().includes(q)
        if (!matchesName && !matchesAlias) return false
      }
      // Status filter
      if (statusFilter !== 'all') {
        const ver = m.verifications[0]
        const status = ver?.status || 'pending'
        if (status !== statusFilter) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'papers') return b._count.papers - a._count.papers
      if (sortBy === 'status') {
        const sa = a.verifications[0]?.status || 'z'
        const sb = b.verifications[0]?.status || 'z'
        return sa.localeCompare(sb)
      }
      return 0
    })
  const selected = materials.find((m) => m.id === selectedId) || materials[0]

  // Verification stats
  const verStats = materials.reduce((acc, m) => {
    const ver = m.verifications[0]
    if (ver) {
      acc[ver.status] = (acc[ver.status] || 0) + 1
    } else {
      acc.pending = (acc.pending || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)
  const verifiedCount = verStats.verified || 0
  const flaggedCount = verStats.flagged || 0
  const rejectedCount = verStats.rejected || 0
  const pendingCount = verStats.pending || 0
  const verProgress = materials.length > 0 ? (verifiedCount / materials.length) * 100 : 0

  const verifyMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/api/verify', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Verification saved')
      qc.invalidateQueries({ queryKey: ['materials-verify'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Save failed: ${(e as Error).message}`),
  })

  const batchVerifyMut = useMutation({
    mutationFn: (data: { materialIds: string[]; status: string }) =>
      api<{ updated: number }>('/api/verify/batch', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (d: { updated: number }) => {
      toast.success(`Batch verified ${d.updated} materials`)
      setBatchSelected(new Set())
      qc.invalidateQueries({ queryKey: ['materials-verify'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Batch verify failed: ${(e as Error).message}`),
  })

  const toggleBatchSelect = (id: string) => {
    setBatchSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <Card className="border-emerald-200/60 dark:border-emerald-900/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> {t('verify.title')}
          </CardTitle>
          <CardDescription>
            {t('verify.desc')}
          </CardDescription>
          {/* Quick stats */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-lg p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-lg font-bold tabular-nums text-slate-700 dark:text-slate-200">{materials.length}</div>
              <div className="text-[11px] sm:text-[10px] text-slate-500">{t('verify.stats.total')}</div>
            </div>
            <div className="rounded-lg p-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center">
              <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{verifiedCount}</div>
              <div className="text-[11px] sm:text-[10px] text-emerald-600 dark:text-emerald-400">{t('verify.stats.verified')}</div>
            </div>
            <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-center">
              <div className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{flaggedCount}</div>
              <div className="text-[11px] sm:text-[10px] text-amber-600 dark:text-amber-400">{t('verify.stats.flagged')}</div>
            </div>
            <div className="rounded-lg p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-lg font-bold tabular-nums text-slate-600 dark:text-slate-300">{pendingCount}</div>
              <div className="text-[11px] sm:text-[10px] text-slate-500">{t('verify.stats.pending')}</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] sm:text-[10px] text-slate-500 whitespace-nowrap">{t('verify.stats.progress')}</span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${verProgress}%` }} />
            </div>
            <span className="text-[11px] sm:text-[10px] tabular-nums text-slate-400">{verProgress.toFixed(0)}%</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
          ) : materials.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title={t('verify.empty')}
              description={t('verify.empty.desc')}
              hint={t('verify.empty.hint')}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Material list */}
              <div className="lg:col-span-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">{t('verify.select')}</span>
                  {batchSelected.size > 0 && (
                    <span className="text-[11px] sm:text-[10px] text-emerald-600 dark:text-emerald-400">{batchSelected.size} selected</span>
                  )}
                </div>
                {/* U6: search + filter + sort toolbar */}
                <div className="mb-2 space-y-1.5">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('verify.searchPh')}
                    className="h-8 text-xs"
                  />
                  <div className="flex gap-1.5">
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                      <SelectTrigger className="h-7 text-[11px] flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('verify.filterAll')}</SelectItem>
                        <SelectItem value="pending">{t('verify.filterPending')}</SelectItem>
                        <SelectItem value="verified">{t('verify.filterVerified')}</SelectItem>
                        <SelectItem value="flagged">{t('verify.filterFlagged')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                      <SelectTrigger className="h-7 text-[11px] flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">{t('verify.sortName')}</SelectItem>
                        <SelectItem value="papers">{t('verify.sortPapers')}</SelectItem>
                        <SelectItem value="status">{t('verify.sortStatus')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-[11px] sm:text-[10px] text-slate-400">
                    {t('verify.filterCount', { shown: filteredMaterials.length, total: materials.length })}
                  </div>
                </div>
                {/* Batch actions toolbar */}
                {batchSelected.size > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <Button size="sm" variant="outline" className="h-9 sm:h-6 text-[11px] sm:text-[10px] border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300" onClick={() => batchVerifyMut.mutate({ materialIds: Array.from(batchSelected), status: 'verified' })} disabled={batchVerifyMut.isPending}>
                      <CheckCircle2 className="w-3 h-3 mr-0.5" /> Verify all
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 sm:h-6 text-[11px] sm:text-[10px] border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300" onClick={() => batchVerifyMut.mutate({ materialIds: Array.from(batchSelected), status: 'flagged' })} disabled={batchVerifyMut.isPending}>
                      <AlertCircle className="w-3 h-3 mr-0.5" /> Flag all
                    </Button>
                    <button onClick={() => setBatchSelected(new Set())} className="text-[11px] sm:text-[10px] text-slate-500 hover:text-slate-700 ml-auto">
                      Clear
                    </button>
                  </div>
                )}
                <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredMaterials.map((m) => {
                    const ver = m.verifications[0]
                    const isActive = (selected?.id === m.id)
                    const isBatchSelected = batchSelected.has(m.id)
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center gap-1.5 p-2.5 rounded-lg border transition-all ${
                          isActive
                            ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700'
                            : isBatchSelected
                            ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <Checkbox checked={isBatchSelected} onCheckedChange={() => toggleBatchSelect(m.id)} className="shrink-0" />
                        <button
                          onClick={() => setSelectedId(m.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-medium truncate">{m.name}</span>
                            {ver ? (
                              <VerifyBadge status={ver.status} />
                            ) : (
                              <Badge variant="outline" className="text-[10px] sm:text-[9px] text-slate-400">{t('common.pending')}</Badge>
                            )}
                          </div>
                          <div className="text-[11px] sm:text-[10px] text-slate-500 mt-0.5">
                          {m._count.papers} {m._count.papers === 1 ? t('common.paper') : t('common.papers').toLowerCase()} · {m.classifications[0]?.synthesized ? t(`common.${m.classifications[0].synthesized}`) : t('classify.metric.unclassified')}
                        </div>
                        </button>
                      </div>
                    )
                  })}
                  {filteredMaterials.length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-400">{t('verify.noMatch')}</div>
                  )}
                </div>
              </div>

              {/* Verification form */}
              <div className="lg:col-span-8">
                {selected ? (
                  <VerifyForm
                    key={selected.id}
                    material={selected}
                    project={project}
                    isPending={verifyMut.isPending}
                    onSubmit={(body) => verifyMut.mutate({ ...body, materialId: selected.id, project, reviewer })}
                  />
                ) : (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    {t('empty.selectMaterialHint')}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function VerifyForm({
  material,
  project,
  onSubmit,
  isPending,
}: {
  material: MaterialRow
  project: string
  onSubmit: (body: Record<string, unknown>) => void
  isPending: boolean
}) {
  const { t } = useI18n()
  const existing = material.verifications?.[0]
  const cls = material.classifications?.[0]
  const eff = material.efficiencies?.[0]
  const primaryDoi = material.papers.find((p) => p.doi)?.doi || eff?.doi || ''

  const [status, setStatus] = useState(existing?.status ?? 'verified')
  const [doiChecked, setDoiChecked] = useState(existing?.doiChecked ?? primaryDoi)
  const [checked, setChecked] = useState<Set<string>>(
    new Set(existing?.checkedFields ? existing.checkedFields.split(';').filter(Boolean) : [])
  )

  // Auto-fill working-copy fields (these are local-only — the Verification
  // model doesn't store them, but they let the reviewer cross-check against
  // the source paper and tweak values before saving the verification).
  const [bandgap, setBandgap] = useState(cls?.bandgapValue ?? '')
  const [efficiency, setEfficiency] = useState(
    cls?.efficiencyValue ?? (eff ? String(eff.efficiencyValue) : '')
  )
  const [method, setMethod] = useState(cls?.synthesisMethod ?? '')
  const [conditions, setConditions] = useState(cls?.conditions ?? '')

  // Track the most recent auto-fill snapshot (for the "Reset to auto-fill"
  // button and the "auto" badges next to each input).
  const [autoFill, setAutoFill] = useState<{
    bandgap: string
    efficiency: string
    method: string
    conditions: string
    doi: string
  } | null>(null)

  // Refresh key for the prefill query (incremented when the user clicks
  // "Load extracted data" to force a refetch).
  const [refreshKey, setRefreshKey] = useState(0)

  const handlePrefill = useCallback((data: PrefillData | null) => {
    if (!data) {
      setAutoFill(null)
      return
    }
    const snapshot = {
      bandgap: data.bandgap || '',
      efficiency: data.efficiency || '',
      method: data.method || '',
      conditions: data.conditions || '',
      doi: data.doi || '',
    }
    setAutoFill(snapshot)
    // Seed the working-copy state with the auto values (only if the user
    // hasn't already typed something — i.e. on first load / new material).
    setBandgap((prev) => (prev === '' ? snapshot.bandgap : prev))
    setEfficiency((prev) => (prev === '' ? snapshot.efficiency : prev))
    setMethod((prev) => (prev === '' ? snapshot.method : prev))
    setConditions((prev) => (prev === '' ? snapshot.conditions : prev))
    // Refresh the DOI input if it is empty or still equals the prior auto
    // value (i.e. the user hasn't manually typed a different DOI).
    setDoiChecked((prev) => {
      const priorAuto = autoFill?.doi ?? ''
      if (!prev || prev === priorAuto) return snapshot.doi || prev
      return prev
    })
  }, [autoFill])

  const resetToAutoFill = () => {
    if (!autoFill) return
    setBandgap(autoFill.bandgap)
    setEfficiency(autoFill.efficiency)
    setMethod(autoFill.method)
    setConditions(autoFill.conditions)
    if (autoFill.doi) setDoiChecked(autoFill.doi)
    toast.success(t('verification.prefill.reset'))
  }

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold font-mono">{material.name}</h3>
          <p className="text-xs text-slate-500">{material.aliases || t('verify.noAliases')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <LoadExtractedButton
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={!material.id}
          />
          {primaryDoi && (
            <a
              href={doiUrl(primaryDoi)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline bg-sky-50 dark:bg-sky-950/30 px-2 py-1 rounded"
            >
              {t('verify.openDoi')} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* B7: Collaborative reviewer assignment */}
      <AssignmentPanel
        materialId={material.id}
        project={project}
        currentReviewer={existing?.reviewer ?? 'anonymous'}
      />

      {/* VerifyPrefill banner */}
      <VerifyPrefill
        materialId={material.id}
        refreshKey={refreshKey}
        onData={handlePrefill}
      />

      {/* Auto-filled editable working-copy inputs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 text-emerald-500" />
            {t('verify.workingCopy.title')}
          </Label>
          {autoFill && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
              onClick={resetToAutoFill}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              {t('verification.prefill.reset')}
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="v-bandgap" className="text-xs flex items-center">
              {t('extract.field.bandgap')}
              <AutoBadge active={!!autoFill && autoFill.bandgap !== '' && bandgap === autoFill.bandgap} />
            </Label>
            <Input
              id="v-bandgap"
              value={bandgap}
              onChange={(e) => setBandgap(e.target.value)}
              placeholder="1.55 eV"
              className={autoFill && bandgap === autoFill.bandgap && autoFill.bandgap !== '' ? 'border-emerald-300 dark:border-emerald-800' : ''}
            />
          </div>
          <div>
            <Label htmlFor="v-efficiency" className="text-xs flex items-center">
              {t('extract.field.efficiency')}
              <AutoBadge active={!!autoFill && autoFill.efficiency !== '' && efficiency === autoFill.efficiency} />
            </Label>
            <Input
              id="v-efficiency"
              value={efficiency}
              onChange={(e) => setEfficiency(e.target.value)}
              placeholder="23.08 %"
              className={autoFill && efficiency === autoFill.efficiency && autoFill.efficiency !== '' ? 'border-emerald-300 dark:border-emerald-800' : ''}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="v-method" className="text-xs flex items-center">
              {t('extract.field.method')}
              <AutoBadge active={!!autoFill && autoFill.method !== '' && method === autoFill.method} />
            </Label>
            <Input
              id="v-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder={t('verify.workingCopy.methodPh')}
              className={autoFill && method === autoFill.method && autoFill.method !== '' ? 'border-emerald-300 dark:border-emerald-800' : ''}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="v-conditions" className="text-xs flex items-center">
              {t('extract.field.conditions')}
              <AutoBadge active={!!autoFill && autoFill.conditions !== '' && conditions === autoFill.conditions} />
            </Label>
            <Input
              id="v-conditions"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder={t('verify.workingCopy.conditionsPh')}
              className={autoFill && conditions === autoFill.conditions && autoFill.conditions !== '' ? 'border-emerald-300 dark:border-emerald-800' : ''}
            />
          </div>
        </div>
      </div>

      {/* Extracted data summary */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Summary label={t('verify.summary.synth')} value={cls?.synthesized ? t(`common.${cls.synthesized}`) : '—'} />
        <Summary label={t('verify.summary.bandgap')} value={cls?.bandgapValue || '—'} />
        <Summary label={t('verify.summary.method')} value={cls?.synthesisMethod || '—'} />
        <Summary label={t('verify.summary.conditions')} value={cls?.conditions || '—'} />
        <Summary label={t('verify.summary.maxEff')} value={eff ? `${eff.efficiencyValue.toFixed(2)}%${eff.certified ? ` (${t('verify.certSuffix')})` : ''}` : '—'} />
        <Summary label={t('verify.summary.papers')} value={String(material._count.papers)} />
      </div>

      {/* Verification form */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">
        <div>
          <Label className="text-xs">{t('verify.fieldsChecked')}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
            {CHECK_FIELDS.map((f) => (
              <label
                key={f.id}
                className="flex items-center gap-2 text-xs cursor-pointer rounded-md border border-slate-200 dark:border-slate-800 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <Checkbox checked={checked.has(f.id)} onCheckedChange={() => toggle(f.id)} />
                {t(f.labelKey)}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="v-status" className="text-xs">{t('verify.status')}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="v-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="verified">{t('common.verified')}</SelectItem>
              <SelectItem value="flagged">{t('common.flagged')}</SelectItem>
              <SelectItem value="rejected">{t('common.rejected')}</SelectItem>
              <SelectItem value="pending">{t('common.pending')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="v-doi" className="text-xs flex items-center">
            {t('verify.doiChecked')}
            <AutoBadge active={!!autoFill && autoFill.doi !== '' && doiChecked === autoFill.doi} />
          </Label>
          <Input
            id="v-doi"
            value={doiChecked}
            onChange={(e) => setDoiChecked(e.target.value)}
            placeholder={t('verify.doiPh')}
            className={autoFill && doiChecked === autoFill.doi && autoFill.doi !== '' ? 'border-emerald-300 dark:border-emerald-800' : ''}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() =>
              onSubmit({
                status,
                // Preserve the assigned reviewer + existing notes log so the
                // regular verification save doesn't clobber them — assignment
                // and notes are managed via /api/verify/[id]/assign and /notes.
                reviewer: existing?.reviewer ?? 'anonymous',
                notes: existing?.notes ?? '',
                checkedFields: Array.from(checked).join(';'),
                doiChecked,
              })
            }
            disabled={isPending}
            className={
              status === 'verified'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : status === 'rejected'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {t('verify.save')}
          </Button>
        </div>
      </div>

      {/* B7: Collaborative reviewer notes thread */}
      <NotesThread materialId={material.id} project={project} />
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2 border border-slate-100 dark:border-slate-800">
      <div className="text-[11px] sm:text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-medium mt-0.5 break-words">{value}</div>
    </div>
  )
}

function VerifyBadge({ status }: { status: string }) {
  const { t } = useI18n()
  if (status === 'verified') {
    return (
      <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
        <CheckCircle2 className="w-2.5 h-2.5" /> {t('common.verified')}
      </Badge>
    )
  }
  if (status === 'flagged') {
    return (
      <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900">
        <Flag className="w-2.5 h-2.5" /> {t('common.flagged')}
      </Badge>
    )
  }
  if (status === 'rejected') {
    return (
      <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
        <XCircle className="w-2.5 h-2.5" /> {t('common.rejected')}
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-[10px] sm:text-[9px] text-slate-400">{t('common.pending')}</Badge>
}

// --- B7: Assignment panel + Notes thread ---

// Shows the current assigned reviewer and lets the user pick a new one
// from a dropdown of known reviewers (fetched from /api/verify) or enter a
// brand new name. Calls /api/verify/[id]/assign.
function AssignmentPanel({
  materialId,
  project,
  currentReviewer,
}: {
  materialId: string
  project: string
  currentReviewer: string
}) {
  const { t } = useI18n()
  const { reviewer: self } = useProject()
  const qc = useQueryClient()
  const [assignInput, setAssignInput] = useState('')

  // Fetch the full verification list once and derive distinct reviewers
  // client-side. Reuse the same queryKey as anyone else hitting /api/verify.
  const { data: knownReviewers } = useQuery<string[]>({
    queryKey: ['verify-reviewers'],
    queryFn: async () => {
      const resp = await api<ReviewersResponse>('/api/verify')
      const set = new Set<string>()
      for (const r of resp.records) {
        if (r.reviewer && r.reviewer !== 'anonymous') set.add(r.reviewer)
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    },
    staleTime: 30_000,
  })

  const assignMut = useMutation({
    mutationFn: (vars: { reviewer: string; note?: string }) =>
      api(`/api/verify/${materialId}/assign?project=${encodeURIComponent(project)}`, {
        method: 'POST',
        body: JSON.stringify({ reviewer: vars.reviewer, note: vars.note }),
      }),
    onSuccess: (_d, vars) => {
      toast.success(t('verify.assign.toast.assigned', { reviewer: vars.reviewer }))
      setAssignInput('')
      qc.invalidateQueries({ queryKey: ['materials-verify'] })
      qc.invalidateQueries({ queryKey: ['verify-notes', materialId] })
      qc.invalidateQueries({ queryKey: ['verify-reviewers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(t('verify.assign.toast.failed', { msg: (e as Error).message })),
  })

  const color = reviewerColor(currentReviewer)
  const hasReviewer = !!currentReviewer && currentReviewer !== 'anonymous'

  return (
    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          {t('verify.assign.title')}
        </span>
        {/* Current reviewer badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] sm:text-[10px] font-semibold ring-1 shrink-0 ${color.bg} ${color.text} ${color.ring}`}
          >
            {reviewerInitials(currentReviewer)}
          </span>
          <Badge
            variant="outline"
            className={`text-[11px] sm:text-[10px] gap-1 ${color.bg} ${color.text} ${color.ring} border-current truncate max-w-[160px]`}
          >
            {hasReviewer ? currentReviewer : t('verify.assign.unassigned')}
          </Badge>
        </div>
      </div>

      {/* Assign to dropdown + free-text input */}
      <div className="flex flex-wrap gap-1.5">
        <Select
          value=""
          onValueChange={(v) => {
            if (v && v !== '__none') assignMut.mutate({ reviewer: v })
          }}
        >
          <SelectTrigger className="h-7 text-[11px] flex-1 min-w-[140px]">
            <span className="text-slate-500">{t('verify.assign.to')}</span>
          </SelectTrigger>
          <SelectContent>
            {(!knownReviewers || knownReviewers.length === 0) && (
              <SelectItem value="__none" disabled>
                {t('verify.assign.noPrior')}
              </SelectItem>
            )}
            {knownReviewers?.map((r) => (
              <SelectItem key={r} value={r}>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] sm:text-[9px] font-semibold ${reviewerColor(r).bg} ${reviewerColor(r).text}`}
                  >
                    {reviewerInitials(r)}
                  </span>
                  {r}
                </span>
              </SelectItem>
            ))}
            {self && self !== 'anonymous' && (!knownReviewers || !knownReviewers.includes(self)) && (
              <SelectItem value={self}>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] sm:text-[9px] font-semibold ${reviewerColor(self).bg} ${reviewerColor(self).text}`}
                  >
                    {reviewerInitials(self)}
                  </span>
                  {self} {t('verify.assign.me')}
                </span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <Input
          value={assignInput}
          onChange={(e) => setAssignInput(e.target.value)}
          placeholder={t('verify.assign.namePh')}
          className="h-7 text-[11px] flex-1 min-w-[140px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && assignInput.trim() && !assignMut.isPending) {
              assignMut.mutate({ reviewer: assignInput.trim() })
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
          disabled={!assignInput.trim() || assignMut.isPending}
          onClick={() => assignInput.trim() && assignMut.mutate({ reviewer: assignInput.trim() })}
        >
          {assignMut.isPending ? <Loader2 className="w-3 h-3 mr-0.5 animate-spin" /> : <UserPlus className="w-3 h-3 mr-0.5" />}
          {t('verify.assign.btn')}
        </Button>
      </div>
    </div>
  )
}

// Lists notes parsed from the Verification `notes` field (newest first) and
// lets the user append new ones via /api/verify/[id]/notes.
function NotesThread({ materialId, project }: { materialId: string; project: string }) {
  const { t, locale } = useI18n()
  const { reviewer } = useProject()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')

  const { data, isLoading } = useQuery<NotesResponse>({
    queryKey: ['verify-notes', materialId],
    queryFn: () =>
      api<NotesResponse>(`/api/verify/${materialId}/notes?project=${encodeURIComponent(project)}`),
  })

  const addNoteMut = useMutation({
    mutationFn: (body: { reviewer: string; note: string }) =>
      api(`/api/verify/${materialId}/notes?project=${encodeURIComponent(project)}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey: ['verify-notes', materialId] })
      qc.invalidateQueries({ queryKey: ['materials-verify'] })
    },
    onError: (e) => toast.error(t('verify.notes.toast.failed', { msg: (e as Error).message })),
  })

  const notes = data?.notes ?? []
  const sorted = [...notes].reverse() // newest first

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          {t('verify.notes.title')}
        </span>
        <span className="text-[11px] sm:text-[10px] text-slate-400">
          {t('verify.notes.count', { count: notes.length })}
        </span>
      </div>

      {/* Notes list (scrollable, newest first) */}
      <div className="max-h-48 overflow-y-auto pr-1 space-y-1.5">
        {isLoading ? (
          <div className="text-center py-4 text-xs text-slate-400"><Loader2 className="w-4 h-4 mx-auto animate-spin" /></div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-400">
            {t('verify.notes.empty')}
          </div>
        ) : (
          sorted.map((n, i) => {
            const color = reviewerColor(n.reviewer)
            return (
              <div key={`${n.timestamp}-${i}`} className="flex gap-2 items-start text-xs">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] sm:text-[10px] font-semibold shrink-0 mt-0.5 ${color.bg} ${color.text}`}
                >
                  {reviewerInitials(n.reviewer)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
                      {n.reviewer || t('verify.notes.anonymous')}
                    </span>
                    {!n.legacy && n.timestamp && (
                      <span className="text-[11px] sm:text-[10px] text-slate-400 shrink-0">{formatTimestamp(n.timestamp, locale)}</span>
                    )}
                    {n.legacy && (
                      <span className="text-[11px] sm:text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
                        {t('verify.notes.legacy')}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 break-words whitespace-pre-wrap">{n.note}</p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add note */}
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('verify.notes.ph')}
          className="h-7 text-[11px] flex-1"
          disabled={addNoteMut.isPending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim() && !addNoteMut.isPending) {
              addNoteMut.mutate({ reviewer: reviewer || 'anonymous', note: draft.trim() })
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
          disabled={!draft.trim() || addNoteMut.isPending}
          onClick={() => draft.trim() && addNoteMut.mutate({ reviewer: reviewer || 'anonymous', note: draft.trim() })}
        >
          {addNoteMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          <span className="ml-1">{t('verify.notes.btn')}</span>
        </Button>
      </div>
    </div>
  )
}
