'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Table2,
  Download,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Braces,
  Quote,
  FileSpreadsheet,
  Sigma,
  Trophy,
  Link2,
  FileCode,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { api, doiUrl } from '@/lib/api-client'
import { getBenchmark, shortSource } from '@/lib/benchmarks'
import { downloadJSON, downloadFromAPI } from '@/lib/export-helper'
import { toast } from 'sonner'
import { useI18n } from '@/components/i18n/provider'
import { useProject } from '@/components/project-provider'
import { PresetMenu, type SavedPreset, SAVED_PRESETS_KEY, presetToQuery } from '@/components/matlit/results/preset-menu'
import { ExportPreviewDialog, type ExportPreviewState, type ExportPreviewFormat } from '@/components/matlit/results/export-preview-dialog'
import { ProvenanceDialog, type ProvenanceTarget, type ProvenanceResponse } from '@/components/matlit/results/provenance-dialog'
import { BibtexExportDialog, type BibtexExportFilters } from '@/components/matlit/results/bibtex-dialog'
import { CustomFilterDialog } from '@/components/matlit/results/custom-filter-dialog'

interface ResultRow {
  id: string
  name: string
  aliases: string
  category: string
  notes: string
  papers: Array<{ doi: string; title: string }>
  classifications: Array<{
    synthesized: string
    bandgapValue: string
    synthesisMethod: string
    conditions: string
    phaseDiagramInfo: string
    efficiencyValue: string
    confidence: number
    status: string
    /**
     * Supporting quote from the paper abstract (Prisma `Classification.evidence`).
     * Optional because some older rows may not have it populated yet — the
     * original ResultRow type omitted this field, but the UI has been reading
     * `cls.evidence` since the results-tab was first written. Adding it here
     * makes that access type-safe.
     */
    evidence?: string
  }>
  efficiencies: Array<{
    efficiencyValue: number
    source: string
    certified: boolean
    doi: string
  }>
  verifications: Array<{
    status: string
    reviewer: string
    notes: string
  }>
  _count: { papers: number }
}

export default function ResultsTab({ onNavigate }: { onNavigate?: (tab: 'papers' | 'classification' | 'extraction' | 'efficiency' | 'verification' | 'results' | 'dashboard' | 'materials' | 'sources', materialId?: string) => void }) {
  const { t } = useI18n()
  const { projects } = useProject()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')

  const { data: matData, isLoading } = useQuery<{ materials: ResultRow[] }>({
    queryKey: ['materials-full'],
    queryFn: () => api('/api/materials?full=true'),
  })

  // Fetch all verification records client-side so we can dedupe the reviewer
  // list for the custom-filter dialog. Re-uses the /api/verify GET route.
  const { data: verData } = useQuery<{ records: Array<{ reviewer: string }> }>({
    queryKey: ['verifications', 'for-export'],
    queryFn: () => api('/api/verify'),
  })
  const reviewers = useMemo(() => {
    const set = new Set<string>()
    for (const v of verData?.records ?? []) {
      if (v.reviewer && v.reviewer !== 'anonymous') set.add(v.reviewer)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [verData])

  // ─── Benchmark + provenance state (G3 + G7) ──────────────────────────
  // `showBenchmarks` toggles the dedicated "Benchmark" column in the results
  // table (NREL / SQ-limit reference values alongside the user's max eff).
  // `provTarget` controls the provenance-chain dialog: when set, we fetch
  // /api/materials/[id]/provenance and render a vertical timeline of every
  // paper that reported the bandgap or efficiency value.
  const [showBenchmarks, setShowBenchmarks] = useState(true)
  const [provTarget, setProvTarget] = useState<ProvenanceTarget | null>(null)

  // Total column count for the results table — changes when the benchmark
  // column is shown/hidden so the empty-state + evidence-expansion rows
  // keep their colSpan in sync.
  const totalCols = showBenchmarks ? 11 : 10

  // Provenance chain fetch (G7). Only fires when the user clicks a
  // bandgap / efficiency value in the table to open the citation-chain
  // dialog. Lazy via `enabled` so we don't pay the cost on tab mount.
  // `staleTime: 5min` — provenance is DB-derived (cheap) but rarely changes
  // within a session, so we avoid refetching on every dialog re-open.
  const { data: provData, isLoading: provLoading } = useQuery<ProvenanceResponse>({
    queryKey: ['provenance', provTarget?.materialId],
    queryFn: () => api(`/api/materials/${provTarget?.materialId}/provenance`),
    enabled: !!provTarget,
    staleTime: 5 * 60 * 1000,
  })

  const filtered = useMemo(() => {
    const list = matData?.materials ?? []
    return list.filter((m) => {
      if (category !== 'all' && m.category !== category) return false
      if (q) {
        const ql = q.toLowerCase()
        if (!m.name.toLowerCase().includes(ql) && !m.aliases.toLowerCase().includes(ql)) return false
      }
      return true
    })
  }, [matData, q, category])

  // ─── Export preview dialog ──────────────────────────────────────────
  // Every export button (CSV / LaTeX / BibTeX / JSON / Excel / preset) opens
  // a preview dialog first so the user can sanity-check the format and the
  // applied filters before committing to a download. The dialog's Download
  // button then fires `downloadFromAPI` to the unmodified export URL.
  const [previewState, setPreviewState] = useState<ExportPreviewState | null>(null)

  const closePreview = () => setPreviewState(null)

  // Trigger the actual download (called by the dialog's Download button) and
  // close the dialog. We intentionally use downloadFromAPI to the unmodified
  // export URL so the server returns the real file (not the preview JSON).
  const confirmPreviewDownload = (state: ExportPreviewState) => {
    downloadFromAPI(state.downloadUrl)
    toast.success(state.toastMsg)
    setPreviewState(null)
  }

  // Open the export preview dialog for the given format. `query` is the
  // raw query string (without leading '?') forwarded to /api/export or
  // /api/export/bibtex; it carries the active filter params.
  const openExportPreview = (
    format: ExportPreviewFormat,
    opts: { query?: string; title?: string; toastMsg?: string } = {},
  ) => {
    const qs = (opts.query ?? '').replace(/^[?&]/, '')
    const sep = qs ? `?${qs}` : ''
    // For /api/export we append `&preview=true` (or `?preview=true` if no other
    // params exist) so the route returns the structured JSON preview.
    const previewQs = qs ? `${qs}&preview=true` : 'preview=true'
    let downloadUrl: string
    let previewUrl: string | null
    let title: string
    let toastMsg: string
    switch (format) {
      case 'csv':
        downloadUrl = `/api/export${sep}`
        previewUrl = `/api/export?${previewQs}`
        title = opts.title ?? t('results.export.preview.csv')
        toastMsg = opts.toastMsg ?? t('results.export.downloaded.csv')
        break
      case 'latex': {
        const latexQs = qs ? `${qs}&format=latex` : 'format=latex'
        downloadUrl = `/api/export?${latexQs}`
        previewUrl = `/api/export?${latexQs}&preview=true`
        title = opts.title ?? t('results.export.preview.latex')
        toastMsg = opts.toastMsg ?? t('results.export.downloaded.latex')
        break
      }
      case 'bibtex':
        downloadUrl = `/api/export/bibtex${sep}`
        previewUrl = `/api/export/bibtex${sep}`
        title = opts.title ?? t('results.export.preview.bibtex')
        toastMsg = opts.toastMsg ?? t('results.export.downloaded.bibtex')
        break
      case 'json':
        downloadUrl = '/api/export/json'
        previewUrl = '/api/export/json'
        title = opts.title ?? t('results.export.preview.json')
        toastMsg = opts.toastMsg ?? t('results.export.downloaded.json')
        break
      case 'xlsx':
        downloadUrl = '/api/export/xlsx'
        previewUrl = null
        title = opts.title ?? t('results.export.preview.excel')
        toastMsg = opts.toastMsg ?? t('results.export.downloaded.excel')
        break
      case 'markdown':
        // Markdown export — fetches the full /api/export/markdown endpoint
        // (no preview=true short-circuit on the server; we just slice the
        // first ~80 lines client-side). The download URL carries no query
        // string → server emits the full results table by default. Pass
        // `?ids=` via opts.query to get a comparison doc, or
        // `?materialId=` for a single-material card.
        downloadUrl = `/api/export/markdown${sep}`
        previewUrl = `/api/export/markdown${sep}`
        title = opts.title ?? t('results.export.preview.markdown')
        toastMsg = opts.toastMsg ?? t('results.export.downloaded.markdown')
        break
    }
    setPreviewState({ format, downloadUrl, previewUrl, title, toastMsg })
  }

  const handleExport = () => {
    openExportPreview('csv')
  }

  // LaTeX tabular export — opens a preview dialog (which then triggers the
  // real download via /api/export?format=latex). Only the active category is
  // forwarded; the free-text `q` filter is client-side only and intentionally
  // not replicated on the server.
  const handleLatexExport = () => {
    const qs = category !== 'all' ? `category=${category}` : ''
    openExportPreview('latex', { query: qs })
  }

  // Preset export — opens the preview dialog with the preset's filters
  // applied, so the user sees exactly which rows the preset will export
  // before committing to a download.
  const handlePresetExport = (params: string, presetName: string) => {
    openExportPreview('csv', {
      query: params,
      title: `${presetName} — ${t('results.export.preview.csv')}`,
      toastMsg: t('presets.exported', { preset: presetName }),
    })
  }

  // BibTeX filtered export dialog open-state. The dialog owns its own filter
  // state (material / category / synthOnly + count fetch); on Export it
  // calls `handleBibExport` with the current filters, which builds the
  // /api/export/bibtex URL and opens the preview dialog.
  const [bibOpen, setBibOpen] = useState(false)
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null)

  const handleBibExport = (filters: BibtexExportFilters) => {
    const params = new URLSearchParams()
    if (filters.materialId) params.set('materialId', filters.materialId)
    if (filters.category !== 'all') params.set('category', filters.category)
    if (filters.synthOnly) params.set('synthOnly', 'true')
    const qs = params.toString()
    // Open the preview dialog (BibTeX format) instead of downloading directly.
    openExportPreview('bibtex', {
      query: qs,
      toastMsg: t('results.export.downloaded.bibtex'),
    })
    setBibOpen(false)
  }

  // Custom CSV filter dialog state — combines reviewer / project / year range
  // into a single export URL. Each field is optional; empty fields are skipped.
  const [customOpen, setCustomOpen] = useState(false)
  const [customReviewer, setCustomReviewer] = useState('')
  const [customProject, setCustomProject] = useState('')
  const [customFromYear, setCustomFromYear] = useState('')
  const [customToYear, setCustomToYear] = useState('')

  // User-saved export presets (localStorage-persisted). Loaded on mount in an
  // effect (SSR-safe — localStorage is only ever touched inside useEffect,
  // never during render). The isFirstRender ref guards the save effect so the
  // initial empty-state write doesn't clobber presets stored from a previous
  // session before the load effect has had a chance to populate state.
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const isFirstRender = useRef(true)

  // Load saved presets from localStorage on mount (SSR-safe: only runs in the
  // browser, inside useEffect). Parse errors / unavailable localStorage are
  // swallowed so a corrupted entry never crashes the Results tab.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_PRESETS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (p): p is SavedPreset =>
            p != null &&
            typeof p.id === 'string' &&
            typeof p.name === 'string' &&
            typeof p.filters === 'object' &&
            p.filters !== null &&
            typeof p.createdAt === 'number',
        )
        if (valid.length > 0) setSavedPresets(valid)
      }
    } catch {
      // ignore parse errors (corrupted JSON) — start with an empty list
    }
  }, [])

  // Persist saved presets to localStorage whenever they change. The first
  // render is skipped (isFirstRender ref) so we don't overwrite a previous
  // session's presets with `[]` before the load effect above has run.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    try {
      localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(savedPresets))
    } catch {
      // ignore quota-exceeded / unavailable localStorage — presets stay in
      // memory for the current session only
    }
  }, [savedPresets])

  // Build the export URL from the four custom-filter fields, skipping any
  // empty values. The /api/export route handles each param independently and
  // AND-combines them at the Prisma where level.
  const doCustomExport = () => {
    const params = new URLSearchParams()
    if (customReviewer) params.set('reviewer', customReviewer)
    if (customProject) params.set('project', customProject)
    if (customFromYear && /^\d+$/.test(customFromYear)) params.set('fromYear', customFromYear)
    if (customToYear && /^\d+$/.test(customToYear)) params.set('toYear', customToYear)
    const qs = params.toString()
    // Open the preview dialog (CSV format) instead of downloading directly.
    openExportPreview('csv', {
      query: qs,
      title: t('results.export.customCsvPreview'),
      toastMsg: t('results.export.customCsvDownloaded'),
    })
    setCustomOpen(false)
  }

  // Save the current custom-filter combo as a named preset in localStorage.
  // Validates: name not empty, not a duplicate of an existing preset.
  const savePreset = () => {
    const trimmedName = presetName.trim()
    if (!trimmedName) {
      toast.error(t('results.preset.enterName'))
      return
    }
    if (savedPresets.some((p) => p.name === trimmedName)) {
      toast.error(t('results.preset.duplicate'))
      return
    }
    const fromYearNum =
      customFromYear && /^\d+$/.test(customFromYear) ? Number(customFromYear) : undefined
    const toYearNum =
      customToYear && /^\d+$/.test(customToYear) ? Number(customToYear) : undefined
    const preset: SavedPreset = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      filters: {
        reviewer: customReviewer || undefined,
        project: customProject || undefined,
        fromYear: fromYearNum,
        toYear: toYearNum,
      },
      createdAt: Date.now(),
    }
    setSavedPresets((prev) => [preset, ...prev])
    toast.success(t('results.preset.saved'))
    setPresetName('')
    setCustomOpen(false)
  }

  // Delete a saved preset by id (also removes it from localStorage via the
  // save effect).
  const deletePreset = (id: string) => {
    setSavedPresets((prev) => prev.filter((p) => p.id !== id))
    toast.success(t('results.preset.deleted'))
  }

  // Re-run a saved preset: open the preview dialog with the preset's filters
  // applied, so the user can confirm the rows before downloading.
  const runSavedPreset = (preset: SavedPreset) => {
    const qs = presetToQuery(preset.filters)
    openExportPreview('csv', {
      query: qs,
      title: `${preset.name} — ${t('results.export.preview.csv')}`,
      toastMsg: t('presets.exported', { preset: preset.name }),
    })
  }

  // Export all saved presets as a JSON file the user can move between
  // devices / browsers. Filename includes the current date so multiple
  // snapshots don't collide.
  const handleExportPresets = () => {
    if (savedPresets.length === 0) {
      toast.error(t('results.preset.noExport'))
      return
    }
    try {
      downloadJSON(savedPresets, `matlit-presets-${new Date().toISOString().slice(0, 10)}.json`)
      toast.success(t('results.preset.exportedCount', { n: savedPresets.length }))
    } catch {
      toast.error(t('results.preset.exportFailed'))
    }
  }

  // Validate that a parsed JSON value is shaped like a SavedPreset. Mirrors
  // the load-from-localStorage validator above but exported so the import
  // path can reuse it. Accepts extra fields gracefully (only checks for the
  // presence + type of the four shape-defining fields).
  const isSavedPreset = (v: unknown): v is SavedPreset => {
    if (v == null || typeof v !== 'object') return false
    const p = v as Record<string, unknown>
    return (
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.filters === 'object' &&
      p.filters !== null &&
      typeof p.createdAt === 'number'
    )
  }

  // Import presets from a user-selected JSON file. The file is read as text,
  // parsed, validated, then merged into the existing list with dedupe-by-name
  // (imported presets win — same-named existing ones are replaced). The merged
  // list is written to localStorage via the existing save effect.
  const handleImportPresets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input value so picking the same file twice fires change again.
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!Array.isArray(parsed)) {
          toast.error(t('results.preset.invalidJsonArray'))
          return
        }
        const valid = parsed.filter(isSavedPreset)
        if (valid.length === 0) {
          toast.error(t('results.preset.invalidShape'))
          return
        }
        // Merge: imported presets win on name conflicts. Existing presets
        // whose name does NOT appear in the import are kept.
        const importedNames = new Set(valid.map((p) => p.name))
        const kept = savedPresets.filter((p) => !importedNames.has(p.name))
        const merged = [...valid, ...kept]
        setSavedPresets(merged)
        toast.success(t('results.preset.importedCount', { n: valid.length }))
      } catch {
        toast.error(t('results.preset.importFailed'))
      }
    }
    reader.onerror = () => {
      toast.error(t('results.preset.readFailed'))
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Table2 className="w-4 h-4 text-teal-500" /> {t('results.title')}
              </CardTitle>
              <CardDescription>
                {t('results.desc')}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder={t('results.searchPh')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full sm:w-[180px]"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="all">{t('common.all')}</option>
                <option value="perovskite">{t('materials.cat.perovskite')}</option>
                <option value="chalcogenide">{t('materials.cat.chalcogenide')}</option>
                <option value="oxide">{t('materials.cat.oxide')}</option>
                <option value="other">{t('materials.cat.other')}</option>
              </select>
              <PresetMenu
                savedPresets={savedPresets}
                onPresetExport={handlePresetExport}
                onRunSavedPreset={runSavedPreset}
                onDeletePreset={deletePreset}
                onExportPresets={handleExportPresets}
                onImportPresets={handleImportPresets}
                onOpenCustomFilter={() => setCustomOpen(true)}
              />
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-1" /> {t('results.exportCsv')}
              </Button>
              <Button variant="outline" onClick={handleLatexExport} title={t('results.export.latexTitle')}>
                <Sigma className="w-4 h-4 mr-1" /> LaTeX
              </Button>
              <Button variant="outline" onClick={() => setBibOpen(true)}>
                <FileText className="w-4 h-4 mr-1" /> BibTeX
              </Button>
              <Button variant="outline" onClick={() => openExportPreview('json')}>
                <Braces className="w-4 h-4 mr-1" /> JSON
              </Button>
              <Button variant="outline" onClick={() => openExportPreview('xlsx')}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
              {/* G10 — Markdown export (Notion / Obsidian friendly). Opens
                  the standard preview dialog with the first ~80 lines of
                  the .md file visible before download. */}
              <Button
                variant="outline"
                onClick={() => openExportPreview('markdown')}
                title={t('results.export.markdownTitle')}
              >
                <FileCode className="w-4 h-4 mr-1" /> Markdown
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </div>
          ) : (
            <>
            {/* Benchmark toggle + count summary — a thin toolbar above the
                table. The toggle controls the dedicated "Benchmark" column
                (NREL / SQ-limit reference values next to the user's max eff). */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {filtered.length}{' '}
                {t('results.records')}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-benchmarks"
                  checked={showBenchmarks}
                  onCheckedChange={setShowBenchmarks}
                />
                <Label
                  htmlFor="show-benchmarks"
                  className="text-xs cursor-pointer flex items-center gap-1 select-none"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  {t('results.showBenchmarks')}
                </Label>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 hidden sm:block">
              <table className="w-full text-xs sm:text-sm min-w-[900px]">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr className="text-left text-slate-500">
                    <th className="p-2.5 font-medium sticky left-0 z-20 bg-slate-50 dark:bg-slate-900 min-w-[120px]">{t('materials.col.material')}</th>
                    <th className="p-2.5 font-medium">{t('results.col.synth')}</th>
                    <th className="p-2.5 font-medium">{t('results.col.bandgap')}</th>
                    <th className="p-2.5 font-medium">{t('results.col.method')}</th>
                    <th className="p-2.5 font-medium">{t('results.col.conditions')}</th>
                    <th className="p-2.5 font-medium">{t('results.col.phaseDiagram')}</th>
                    <th className="p-2.5 font-medium text-right">{t('results.col.maxEff')}</th>
                    {showBenchmarks && (
                      <th className="p-2.5 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Trophy className="w-3 h-3 text-amber-500" />
                          {t('results.benchmark')}
                        </span>
                      </th>
                    )}
                    <th className="p-2.5 font-medium">{t('results.col.verify')}</th>
                    <th className="p-2.5 font-medium">{t('results.col.doi')}</th>
                    <th className="p-2.5 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const cls = m.classifications[0]
                    const eff = m.efficiencies[0]
                    const ver = m.verifications[0]
                    const primaryDoi =
                      m.papers.find((p) => p.doi)?.doi || m.papers[0]?.doi || eff?.doi || ''
                    return (
                      <Fragment key={m.id}>
                      <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 align-top">
                        <td className="p-2.5 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-900/50 min-w-[120px]">
                          <button
                            onClick={() => onNavigate?.('papers', m.id)}
                            className="font-mono font-medium text-left hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
                            title={t('papers.detail.title')}
                          >
                            {m.name}
                          </button>
                          <Badge variant="outline" className="text-[10px] sm:text-[9px] mt-0.5 capitalize">{t(`materials.cat.${m.category}`)}</Badge>
                          {m._count.papers > 0 && (
                            <div className="text-[11px] sm:text-[10px] text-slate-400 mt-0.5">{m._count.papers} {t('nav.papers').toLowerCase()}</div>
                          )}
                        </td>
                        <td className="p-2.5">
                          <SynthMini value={cls?.synthesized} />
                        </td>
                        <td className="p-2.5 tabular-nums">
                          {cls?.bandgapValue ? (
                            <button
                              onClick={() => setProvTarget({ materialId: m.id, materialName: m.name, field: 'bandgap' })}
                              className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer align-baseline"
                              title={t('results.viewCitationChain')}
                            >
                              {cls.bandgapValue}
                              <Link2 className="w-3 h-3 opacity-60" />
                            </button>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </td>
                        <td className="p-2.5 text-xs">
                          {cls?.synthesisMethod ? (
                            <span className="line-clamp-2">{cls.synthesisMethod}</span>
                          ) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                        </td>
                        <td className="p-2.5 text-xs">
                          {cls?.conditions ? (
                            <span className="line-clamp-2">{cls.conditions}</span>
                          ) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                        </td>
                        <td className="p-2.5 text-xs">
                          {cls?.phaseDiagramInfo ? (
                            <span className="line-clamp-2 text-violet-600 dark:text-violet-400">{cls.phaseDiagramInfo}</span>
                          ) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">
                          {eff ? (
                            <div>
                              <button
                                onClick={() => setProvTarget({ materialId: m.id, materialName: m.name, field: 'efficiency' })}
                                className="font-bold text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer align-baseline"
                                title={t('results.viewCitationChain')}
                              >
                                {eff.efficiencyValue.toFixed(2)}
                                <Link2 className="w-3 h-3 opacity-60" />
                              </button>
                              {eff.certified && (
                                <div className="text-[10px] sm:text-[9px] text-emerald-600">{t('dashboard.charts.certified')}</div>
                              )}
                            </div>
                          ) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                        </td>
                        {showBenchmarks && (() => {
                          const bench = getBenchmark(m.category, m.name)
                          if (!bench) {
                            return (
                              <td className="p-2.5 tabular-nums">
                                <span className="text-slate-300 dark:text-slate-700">—</span>
                              </td>
                            )
                          }
                          const userEff = eff?.efficiencyValue ?? null
                          const gap = userEff != null ? userEff - bench.efficiency : null
                          const ahead = gap != null && gap >= 0
                          return (
                            <td className="p-2.5 tabular-nums">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex flex-col gap-1 cursor-help">
                                    <span className="font-medium text-slate-600 dark:text-slate-300">
                                      {bench.efficiency.toFixed(1)}%
                                    </span>
                                    {gap != null && (
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] sm:text-[9px] gap-0.5 ${ahead ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900'}`}
                                      >
                                        {ahead ? '+' : '−'}{Math.abs(gap).toFixed(1)}% vs {shortSource(bench.source)}
                                      </Badge>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {bench.source} ({bench.year}): {bench.efficiency}%
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          )
                        })()}
                        <td className="p-2.5">
                          {ver ? <VerifyMini status={ver.status} /> : <span className="text-[11px] sm:text-[10px] text-slate-400">{t('common.pending')}</span>}
                        </td>
                        <td className="p-2.5">
                          {primaryDoi ? (
                            <a
                              href={doiUrl(primaryDoi)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5 text-xs"
                            >
                              DOI <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                        </td>
                        <td className="p-2.5">
                          {cls?.evidence ? (
                            <button
                              onClick={() => setExpandedEvidence(expandedEvidence === m.id ? null : m.id)}
                              className="text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                              title={t('results.viewEvidence')}
                              aria-label={t('results.viewEvidence')}
                            >
                              <Quote className="w-3.5 h-3.5" />
                            </button>
                          ) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                        </td>
                      </tr>
                      {expandedEvidence === m.id && cls?.evidence && (
                        <tr className="border-t-0">
                          <td colSpan={totalCols} className="p-2.5 bg-violet-50/30 dark:bg-violet-950/10">
                            <div className="text-xs">
                              <span className="text-violet-600 dark:text-violet-400 font-medium">{t('classify.evidence')}: </span>
                              <span className="text-slate-600 dark:text-slate-300">{cls.evidence}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={totalCols} className="text-center py-8 text-slate-400">
                        <Table2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        {t('empty.noMaterialsMatch')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile card view (sm:hidden) */}
            <div className="sm:hidden space-y-2 max-h-[65vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Table2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  {t('empty.noMaterialsMatch')}
                </div>
              ) : (
                filtered.map((m) => {
                  const cls = m.classifications[0]
                  const eff = m.efficiencies[0]
                  const ver = m.verifications[0]
                  const primaryDoi = m.papers.find((p) => p.doi)?.doi || m.papers[0]?.doi || eff?.doi || ''
                  return (
                    <div key={m.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <button
                            onClick={() => onNavigate?.('papers', m.id)}
                            className="font-mono text-sm font-semibold text-left hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                          >
                            {m.name}
                          </button>
                          <Badge variant="outline" className="text-[10px] sm:text-[9px] ml-1 capitalize">{t(`materials.cat.${m.category}`)}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <SynthMini value={cls?.synthesized} />
                          {ver && <VerifyMini status={ver.status} />}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <MobileField
                          label={t('results.col.bandgap')}
                          value={cls?.bandgapValue ? `${cls.bandgapValue} eV` : '—'}
                          highlight={!!cls?.bandgapValue}
                          onClick={
                            cls?.bandgapValue
                              ? () => setProvTarget({ materialId: m.id, materialName: m.name, field: 'bandgap' })
                              : undefined
                          }
                          chainIcon={!!cls?.bandgapValue}
                        />
                        <MobileField
                          label={t('results.col.maxEff')}
                          value={eff ? `${eff.efficiencyValue.toFixed(2)}%` : '—'}
                          highlight={!!eff}
                          onClick={
                            eff
                              ? () => setProvTarget({ materialId: m.id, materialName: m.name, field: 'efficiency' })
                              : undefined
                          }
                          chainIcon={!!eff}
                        />
                      </div>
                      {showBenchmarks && (() => {
                        const bench = getBenchmark(m.category, m.name)
                        if (!bench) return null
                        const userEff = eff?.efficiencyValue ?? null
                        const gap = userEff != null ? userEff - bench.efficiency : null
                        const ahead = gap != null && gap >= 0
                        return (
                          <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900 p-1.5 text-xs flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                              <Trophy className="w-3 h-3" />
                              {t('results.benchmark')}: <strong>{bench.efficiency.toFixed(1)}%</strong>
                            </span>
                            {gap != null && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] sm:text-[9px] gap-0.5 ${ahead ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900'}`}
                              >
                                {ahead ? '+' : '−'}{Math.abs(gap).toFixed(1)}% vs {shortSource(bench.source)}
                              </Badge>
                            )}
                          </div>
                        )
                      })()}
                      {cls?.synthesisMethod && (
                        <div className="mt-1.5 text-xs">
                          <span className="text-slate-500">{t('results.col.method')}: </span>
                          <span className="line-clamp-2">{cls.synthesisMethod}</span>
                        </div>
                      )}
                      {cls?.conditions && (
                        <div className="mt-1 text-xs">
                          <span className="text-slate-500">{t('results.col.conditions')}: </span>
                          <span className="line-clamp-2">{cls.conditions}</span>
                        </div>
                      )}
                      {primaryDoi && (
                        <a
                          href={doiUrl(primaryDoi)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 text-xs text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5"
                        >
                          DOI <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Provenance chain dialog (G7) — opened by clicking a bandgap /
          efficiency value in the table. Shows the historical citation
          chain for the value: a vertical timeline of every paper that
          reported it, sorted by year ascending, with the supporting
          evidence quote + DOI link per entry. */}
      <ProvenanceDialog
        target={provTarget}
        data={provData ?? null}
        loading={provLoading}
        onClose={() => setProvTarget(null)}
      />

      {/* BibTeX filtered export dialog */}
      <BibtexExportDialog
        open={bibOpen}
        onOpenChange={setBibOpen}
        materials={matData?.materials ?? []}
        onExport={handleBibExport}
      />

      {/* Custom CSV filter dialog — combines reviewer / project / year range */}
      <CustomFilterDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        presetName={presetName}
        onPresetNameChange={setPresetName}
        reviewer={customReviewer}
        onReviewerChange={setCustomReviewer}
        project={customProject}
        onProjectChange={setCustomProject}
        fromYear={customFromYear}
        onFromYearChange={setCustomFromYear}
        toYear={customToYear}
        onToYearChange={setCustomToYear}
        reviewers={reviewers}
        projects={projects}
        onSavePreset={savePreset}
        onExport={doCustomExport}
      />

      {/* Export preview dialog — opened by every export button (CSV / LaTeX /
          BibTeX / JSON / Excel / Markdown / preset) so the user can
          sanity-check the format and the applied filters before committing
          to a download. The Download button fires `downloadFromAPI` to the
          unmodified export URL (no preview=true), which the server answers
          with the actual file. */}
      <ExportPreviewDialog
        state={previewState}
        onClose={closePreview}
        onConfirmDownload={confirmPreviewDownload}
      />
    </div>
  )
}

function SynthMini({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-700 text-xs">—</span>
  if (value === 'yes') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
  if (value === 'no') return <XCircle className="w-4 h-4 text-red-400" />
  return <HelpCircle className="w-4 h-4 text-amber-500" />
}

function VerifyMini({ status }: { status: string }) {
  const { t } = useI18n()
  if (status === 'verified') {
    return (
      <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
        <ShieldCheck className="w-2.5 h-2.5" /> {t('common.verified')}
      </Badge>
    )
  }
  if (status === 'flagged') {
    return (
      <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900">
        <ShieldAlert className="w-2.5 h-2.5" /> {t('common.flagged')}
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
  return <span className="text-[11px] sm:text-[10px] text-slate-400">{t('common.pending')}</span>
}

function MobileField({
  label,
  value,
  highlight,
  onClick,
  chainIcon,
}: {
  label: string
  value: string
  highlight?: boolean
  /** When provided, the value is rendered as a button that opens the provenance dialog. */
  onClick?: () => void
  /** When true, render a small chain icon next to the value to signal clickability. */
  chainIcon?: boolean
}) {
  return (
    <div
      className={`rounded-md p-1.5 border ${highlight ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900' : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'}`}
    >
      <div className="text-[10px] sm:text-[9px] text-slate-500 uppercase tracking-wide">{label}</div>
      {onClick ? (
        <button
          onClick={onClick}
          className={`text-xs font-medium inline-flex items-center gap-0.5 hover:underline cursor-pointer ${highlight ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}
        >
          {value}
          {chainIcon && <Link2 className="w-2.5 h-2.5 opacity-60" />}
        </button>
      ) : (
        <div className={`text-xs font-medium ${highlight ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
          {value}
        </div>
      )}
    </div>
  )
}
