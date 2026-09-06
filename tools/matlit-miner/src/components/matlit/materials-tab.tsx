'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, FlaskConical, Trash2, Pencil, Sprout, Loader2, Upload, Download, Tag as TagIcon, GitCompare, Sparkles, DollarSign, Star, FolderOpen, X, TestTube2, ShieldCheck, Layers, FileJson, FileText, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import { FormulaViewer } from '@/components/matlit/formula-viewer'
import { MaterialTags } from '@/components/matlit/material-tags'
import { CompareDialog } from '@/components/matlit/compare-dialog'
import { DeviceStructureView } from '@/components/matlit/device-structure'
import TabErrorBoundary from '@/components/matlit/tab-error-boundary'
import { Checkbox } from '@/components/ui/checkbox'
import { useFavorites } from '@/lib/favorites-store'
import { dispatchUndoableAction } from '@/lib/undo-store'
import { downloadJSON, downloadFromAPI } from '@/lib/export-helper'
import { type Material, CATEGORIES, categoryStyle } from '@/components/matlit/materials/shared'
import { ReviewDialog, type ReviewResponse } from '@/components/matlit/materials/review-dialog'
import { SimilarDialog, type SimilarMaterial, type SimilarResponse } from '@/components/matlit/materials/similar-dialog'
import { ExperimentDialog, type ExperimentResponse } from '@/components/matlit/materials/experiment-dialog'
import { CostDialog, type CostResponse } from '@/components/matlit/materials/cost-dialog'
import { StabilityDialog, type StabilityRecord } from '@/components/matlit/materials/stability-dialog'
import { ExperimentEntryDialog } from '@/components/matlit/materials/experiment-entry-dialog'

// Predicted bandgap entry returned by /api/predict/bandgap.
// Kept local (instead of importing from @/lib/bandgap-predictor) so the client
// bundle doesn't pull in any server-side code paths.
interface BandgapPredictionInfo {
  materialId: string
  materialName: string
  predictedBandgap: number
  confidence: number
  method: string
  nearestNeighbors: Array<{ name: string; bandgap: number; similarity: number }>
}

export default function MaterialsTab() {
  const { t, locale } = useI18n()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // C3 — Material favorites / collections (client-side, localStorage-backed).
  // `showFavOnly` toggles a filter that hides non-favorited materials.
  // `favCollection` further narrows the view to a single named collection
  // (only meaningful when `showFavOnly` is on — collections only exist for
  // favorited materials).
  const favs = useFavorites()
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [favCollection, setFavCollection] = useState<string>('all')
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 4) next.add(id)
      else return prev // max 4 for compare
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      // Use visibleMaterials so "select all" only affects the rows the user
      // can actually see — important when the favorites filter is active.
      if (prev.size === visibleMaterials.length) return new Set()
      return new Set(visibleMaterials.slice(0, 4).map((m) => m.id))
    })
  }
  const [csvText, setCsvText] = useState('')
  const [parsedMaterials, setParsedMaterials] = useState<Array<{ name: string; aliases: string; category: string; notes: string }>>([])

  // ── B2: AI literature review dialog state + per-material cache ─────────────
  // The review endpoint caches server-side for 1h, but we additionally cache
  // the response in component state so re-opening the dialog for the same
  // material is instant (no spinner, no network round-trip).
  const [reviewCache, setReviewCache] = useState<Map<string, ReviewResponse>>(new Map())
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean
    materialId: string | null
    materialName: string
    loading: boolean
    error: string | null
    data: ReviewResponse | null
  }>({ open: false, materialId: null, materialName: '', loading: false, error: null, data: null })

  const openReview = async (m: Material) => {
    const cached = reviewCache.get(m.id)
    if (cached) {
      setReviewDialog({ open: true, materialId: m.id, materialName: m.name, loading: false, error: null, data: cached })
      return
    }
    setReviewDialog({ open: true, materialId: m.id, materialName: m.name, loading: true, error: null, data: null })
    try {
      const data = await api<ReviewResponse>(`/api/materials/${m.id}/review`)
      setReviewCache((prev) => new Map(prev).set(m.id, data))
      setReviewDialog((s) => (s.materialId === m.id ? { ...s, loading: false, data } : s))
    } catch (e) {
      setReviewDialog((s) => (s.materialId === m.id ? { ...s, loading: false, error: (e as Error).message } : s))
    }
  }

  const refreshReview = async () => {
    if (!reviewDialog.materialId) return
    const id = reviewDialog.materialId
    setReviewDialog((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api<ReviewResponse>(`/api/materials/${id}/review?refresh=1`)
      setReviewCache((prev) => new Map(prev).set(id, data))
      setReviewDialog((s) => (s.materialId === id ? { ...s, loading: false, data } : s))
    } catch (e) {
      setReviewDialog((s) => (s.materialId === id ? { ...s, loading: false, error: (e as Error).message } : s))
    }
  }

  // ── B4: Similar material dialog state + per-material cache ─────────────────
  const [similarCache, setSimilarCache] = useState<Map<string, SimilarResponse>>(new Map())
  const [similarDialog, setSimilarDialog] = useState<{
    open: boolean
    materialId: string | null
    materialName: string
    loading: boolean
    error: string | null
    data: SimilarResponse | null
  }>({ open: false, materialId: null, materialName: '', loading: false, error: null, data: null })

  const openSimilar = async (m: Material) => {
    const cached = similarCache.get(m.id)
    if (cached) {
      setSimilarDialog({ open: true, materialId: m.id, materialName: m.name, loading: false, error: null, data: cached })
      return
    }
    setSimilarDialog({ open: true, materialId: m.id, materialName: m.name, loading: true, error: null, data: null })
    try {
      const data = await api<SimilarResponse>(`/api/materials/${m.id}/similar`)
      setSimilarCache((prev) => new Map(prev).set(m.id, data))
      setSimilarDialog((s) => (s.materialId === m.id ? { ...s, loading: false, data } : s))
    } catch (e) {
      setSimilarDialog((s) => (s.materialId === m.id ? { ...s, loading: false, error: (e as Error).message } : s))
    }
  }

  // Click on a similar material row → dispatch a navigation event the app
  // shell (page.tsx) can listen for, then close the dialog and toast so the
  // user gets feedback even if no listener is attached. Mirrors the pattern
  // used by command-palette.tsx.
  const navigateToMaterialPapers = (similar: SimilarMaterial) => {
    setSimilarDialog((s) => ({ ...s, open: false }))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('matlit-navigate', { detail: { tab: 'papers', materialId: similar.materialId } }),
      )
    }
    toast.info(t('materials.similar.selected', { name: similar.name }))
  }

  // ── N5: AI experiment plan dialog state + per-material cache ───────────
  // Same caching pattern as the review/similar dialogs: server caches for 1h,
  // we additionally cache in component state so re-opening is instant.
  const [experimentCache, setExperimentCache] = useState<Map<string, ExperimentResponse>>(new Map())
  const [experimentDialog, setExperimentDialog] = useState<{
    open: boolean
    materialId: string | null
    materialName: string
    loading: boolean
    error: string | null
    data: ExperimentResponse | null
  }>({ open: false, materialId: null, materialName: '', loading: false, error: null, data: null })

  const openExperiment = async (m: Material) => {
    const cached = experimentCache.get(m.id)
    if (cached) {
      setExperimentDialog({ open: true, materialId: m.id, materialName: m.name, loading: false, error: null, data: cached })
      return
    }
    setExperimentDialog({ open: true, materialId: m.id, materialName: m.name, loading: true, error: null, data: null })
    try {
      const data = await api<ExperimentResponse>(`/api/materials/${m.id}/experiment`)
      setExperimentCache((prev) => new Map(prev).set(m.id, data))
      setExperimentDialog((s) => (s.materialId === m.id ? { ...s, loading: false, data } : s))
    } catch (e) {
      setExperimentDialog((s) => (s.materialId === m.id ? { ...s, loading: false, error: (e as Error).message } : s))
    }
  }

  const refreshExperiment = async () => {
    if (!experimentDialog.materialId) return
    const id = experimentDialog.materialId
    setExperimentDialog((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api<ExperimentResponse>(`/api/materials/${id}/experiment?refresh=1`)
      setExperimentCache((prev) => new Map(prev).set(id, data))
      setExperimentDialog((s) => (s.materialId === id ? { ...s, loading: false, data } : s))
    } catch (e) {
      setExperimentDialog((s) => (s.materialId === id ? { ...s, loading: false, error: (e as Error).message } : s))
    }
  }

  // ── G4: Manual experiment entry dialog state ────────────────────────
  // Opens the "Add experiment" dialog for a specific material. We track
  // the material being edited (instead of just a boolean) so the dialog
  // header can show the formula and so the form can pre-fill the
  // materialId field. Set to null when the dialog is closed.
  const [experimentTarget, setExperimentTarget] = useState<Material | null>(null)

  // ── G6: Device structure visualization dialog state ─────────────────
  // Opens a dialog showing a solar cell layer-stack diagram for the
  // material. The diagram itself is rendered purely from `materialName`
  // + `category` (so the dialog opens instantly with no network round-
  // trip); we additionally lazy-fetch the material's classification to
  // surface the synthesisMethod as a caption when available.
  // `staleTime: 5min` so re-opening the dialog for the same material is
  // instant (the underlying /api/materials?full=true response is large).
  const [deviceTarget, setDeviceTarget] = useState<Material | null>(null)
  const { data: deviceFullData, isLoading: deviceLoading } = useQuery<{
    materials: Array<{
      id: string
      classifications: Array<{ synthesisMethod: string }>
    }>
  }>({
    queryKey: ['materials-full-for-device'],
    queryFn: () => api('/api/materials?full=true'),
    enabled: !!deviceTarget,
    staleTime: 5 * 60 * 1000,
  })
  // Look up the synthesis method for the currently-open device dialog.
  // Falls back to undefined (no caption) when the lazy fetch hasn't
  // returned yet or when the material has no classification.
  const deviceSynthesisMethod = deviceTarget
    ? deviceFullData?.materials.find((m) => m.id === deviceTarget.id)?.classifications?.[0]
        ?.synthesisMethod
    : undefined

  // ── G5: Stability database dialog state ─────────────────────────────
  // Same pattern as experimentTarget — holds the material the dialog is
  // open for, or null when closed. The stability records themselves are
  // loaded lazily by the StabilityDialog's own useQuery (so opening the
  // dialog for one material doesn't fire requests for every other row).
  const [stabilityTarget, setStabilityTarget] = useState<Material | null>(null)

  // ── N6: Material cost estimator dialog state + per-material cache ──────
  const [costCache, setCostCache] = useState<Map<string, CostResponse>>(new Map())
  const [costDialog, setCostDialog] = useState<{
    open: boolean
    materialId: string | null
    materialName: string
    loading: boolean
    error: string | null
    data: CostResponse | null
  }>({ open: false, materialId: null, materialName: '', loading: false, error: null, data: null })

  const openCost = async (m: Material) => {
    const cached = costCache.get(m.id)
    if (cached) {
      setCostDialog({ open: true, materialId: m.id, materialName: m.name, loading: false, error: null, data: cached })
      return
    }
    setCostDialog({ open: true, materialId: m.id, materialName: m.name, loading: true, error: null, data: null })
    try {
      const data = await api<CostResponse>(`/api/materials/${m.id}/cost`)
      setCostCache((prev) => new Map(prev).set(m.id, data))
      setCostDialog((s) => (s.materialId === m.id ? { ...s, loading: false, data } : s))
    } catch (e) {
      setCostDialog((s) => (s.materialId === m.id ? { ...s, loading: false, error: (e as Error).message } : s))
    }
  }

  const { data: tagsData } = useQuery<{ tags: Array<{ tag: string; count: number }> }>({
    queryKey: ['material-tags'],
    queryFn: () => api('/api/materials/tags'),
  })
  const allTags = tagsData?.tags ?? []

  const { data, isLoading } = useQuery<{ materials: Material[] }>({
    queryKey: ['materials', q, category, tagFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (category !== 'all') params.set('category', category)
      if (tagFilter !== 'all') params.set('tag', tagFilter)
      return api(`/api/materials?${params.toString()}`)
    },
  })

  // Multi-format export: JSON is built client-side from the currently-loaded
  // materials list (so it respects the active search/category/tag filter);
  // CSV and Markdown are server-rendered. Markdown pulls the full results
  // table via /api/export/markdown (no params → all materials).
  const handleExportJSON = () => {
    const list = data?.materials ?? []
    if (list.length === 0) {
      toast.error(t('materials.export.empty'))
      return
    }
    downloadJSON({ materials: list, exportedAt: new Date().toISOString() }, `matlit-materials-${Date.now()}.json`)
    toast.success(t('materials.export.json', { n: list.length }))
  }

  const seedMut = useMutation({
    mutationFn: () => api<{ seeded: number; total: number }>('/api/materials/seed', { method: 'POST' }),
    onSuccess: (d) => {
      toast.success(`Seeded ${d.seeded} default materials (total: ${d.total})`)
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Seed failed: ${(e as Error).message}`),
  })

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ material: Material }>('/api/materials', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Material created')
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setAddOpen(false)
    },
    onError: (e) => toast.error(`Create failed: ${(e as Error).message}`),
  })

  const importMut = useMutation({
    mutationFn: (materials: Array<{ name: string; aliases: string; category: string; notes: string }>) =>
      api<{ inserted: number; skipped: number; errors: Array<{ name: string; error: string }>; total: number }>('/api/materials/import', {
        method: 'POST',
        body: JSON.stringify({ materials }),
      }),
    onSuccess: (d) => {
      toast.success(t('materials.import.result', { inserted: d.inserted, skipped: d.skipped, errors: d.errors.length }))
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setImportOpen(false)
      setCsvText('')
      setParsedMaterials([])
    },
    onError: (e) => toast.error(`Import failed: ${(e as Error).message}`),
  })

  // Simple CSV parser (handles quoted fields with commas)
  const parseCsv = (text: string) => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return []
    // Check if first line is header
    const firstLine = lines[0].toLowerCase()
    const hasHeader = firstLine.includes('material_name') || firstLine.includes('name')
    const dataLines = hasHeader ? lines.slice(1) : lines
    const parseLine = (line: string) => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          result.push(current); current = ''
        } else {
          current += ch
        }
      }
      result.push(current)
      return result
    }
    return dataLines.map(line => {
      const cols = parseLine(line)
      return {
        name: (cols[0] || '').trim(),
        aliases: (cols[1] || '').trim(),
        category: (cols[2] || 'other').trim().toLowerCase() || 'other',
        notes: (cols[3] || '').trim(),
      }
    }).filter(m => m.name)
  }

  const handleParse = () => {
    const parsed = parseCsv(csvText)
    setParsedMaterials(parsed)
  }

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/materials/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Material updated')
      qc.invalidateQueries({ queryKey: ['materials'] })
      setEditing(null)
    },
    onError: (e) => toast.error(`Update failed: ${(e as Error).message}`),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/materials/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Material deleted (and its papers)')
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Delete failed: ${(e as Error).message}`),
  })

  // ── G4: Manual experiment submission ─────────────────────────────────
  // POSTs the user's lab data to /api/experiments, which writes both an
  // Efficiency row (if PCE provided) and a Classification row (if bandgap
  // / method / conditions provided). On success we invalidate the
  // materials list (so the "_count.efficiencies" badge refreshes) plus
  // the efficiency / stats queries consumed by other tabs.
  const experimentMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ ok: boolean; efficiency: unknown; classification: unknown }>('/api/experiments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (_d, _vars) => {
      toast.success(t('materials.experiment.saved'))
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['efficiencies'] })
      qc.invalidateQueries({ queryKey: ['efficiency-trend'] })
      setExperimentTarget(null)
    },
    onError: (e) => toast.error(
      t('common.saveFailed', { msg: (e as Error).message }),
    ),
  })

  // ── G5: Stability record submission ─────────────────────────────────
  // POSTs a user-entered T80 / degradation-rate / test-condition record
  // to /api/stability. The API keeps the records in an in-memory Map
  // (no schema change) — they survive across requests but are lost on
  // dev-server restart, which is acceptable for a demo.
  const stabilityMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ ok: boolean; record: StabilityRecord; total: number }>('/api/stability', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success(t('materials.stability.saved'))
      // Invalidate the per-material stability query so the new record
      // shows up immediately in the dialog's table.
      qc.invalidateQueries({ queryKey: ['stability'] })
    },
    onError: (e) => toast.error(
      t('common.saveFailed', { msg: (e as Error).message }),
    ),
  })


  // Predictions for materials without a bandgap. Enabled only once the
  // materials list itself has loaded (so we don't fire on an empty screen).
  const { data: predictionsData } = useQuery<{ predictions: BandgapPredictionInfo[] }>({
    queryKey: ['bandgap-predictions'],
    queryFn: () => api('/api/predict/bandgap'),
    enabled: !!data,
  })
  const predictionMap = new Map<string, BandgapPredictionInfo>(
    (predictionsData?.predictions ?? []).map((p) => [p.materialId, p]),
  )

  const materials = data?.materials ?? []

  // C3 — client-side favorites filter. The server query already narrows by
  // search / category / tag; we layer the favorites + collection filter on
  // top so users can build a "shortlist" view without server round-trips.
  // Favorites live entirely in localStorage (see @/lib/favorites-store).
  const visibleMaterials = showFavOnly
    ? materials.filter((m) => {
        if (!favs.isFavorite(m.id)) return false
        if (favCollection !== 'all') {
          return favs.collectionOf(m.id) === favCollection
        }
        return true
      })
    : materials

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-emerald-500" /> {t('materials.title')}
              </CardTitle>
              <CardDescription>
                {t('materials.desc', { count: materials.length })}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedMut.mutate()}
                disabled={seedMut.isPending}
              >
                {seedMut.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Sprout className="w-4 h-4 mr-1" />
                )}
                {t('materials.seedDefaults')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="w-4 h-4 mr-1" /> {t('materials.import')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-1" /> {t('materials.export')}
                    <ChevronDown className="w-3.5 h-3.5 ml-1 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-slate-500 uppercase tracking-wide">
                    {t('materials.export.format')}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => downloadFromAPI('/api/materials/export')}
                    className="gap-2.5 py-2"
                    title={t('materials.export.csv.title')}
                  >
                    <Download className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-sm">CSV</span>
                      <span className="text-[11px] text-slate-400">{t('materials.export.csv.fullTable')}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleExportJSON}
                    className="gap-2.5 py-2"
                    title={t('materials.export.json.title')}
                  >
                    <FileJson className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-sm">JSON</span>
                      <span className="text-[11px] text-slate-400">{t('materials.export.json.currentFilter')}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => downloadFromAPI('/api/export/markdown')}
                    className="gap-2.5 py-2"
                    title={t('materials.export.markdown.title')}
                  >
                    <FileText className="w-4 h-4 text-sky-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-sm">Markdown</span>
                      <span className="text-[11px] text-slate-400">{t('materials.export.markdown.fullReport')}</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {selectedIds.size >= 2 && (
                <CompareDialog materialIds={Array.from(selectedIds)} />
              )}
              {selectedIds.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs"
                >
                  {t('materials.selection.clear', { n: selectedIds.size })}
                </Button>
              )}
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-4 h-4 mr-1" /> {t('materials.add')}
                  </Button>
                </DialogTrigger>
                <MaterialForm
                  onSubmit={(b) => createMut.mutate(b)}
                  isPending={createMut.isPending}
                />
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t('materials.searchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder={t('materials.col.category')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.allCategories')}</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{t(`materials.cat.${c.value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <div className="flex items-center gap-1.5">
                  <TagIcon className="w-3.5 h-3.5 text-slate-400" />
                  <SelectValue placeholder={t('materials.tags.filter')} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('materials.tags.all')}</SelectItem>
                {allTags.map((tg) => (
                  <SelectItem key={tg.tag} value={tg.tag}>
                    {tg.tag} ({tg.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* C3 — Favorites filter toggle. When active, only favorited
                materials are shown (layered on top of the server-side search
                / category / tag filters). The badge shows the total favorite
                count so users know how many they have at a glance. */}
            <Button
              variant={showFavOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFavOnly((v) => !v)}
              className={`h-9 gap-1.5 shrink-0 ${showFavOnly ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' : 'text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-950/30'}`}
              aria-pressed={showFavOnly}
              title={t('materials.favorites.showOnly')}
            >
              <Star className={`w-3.5 h-3.5 ${showFavOnly ? 'fill-current' : ''}`} />
              <span className="text-xs">
                {t('materials.favorites.label')}
              </span>
              {favs.count > 0 && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[11px] sm:text-[10px] tabular-nums ${showFavOnly ? 'bg-white/20' : 'bg-amber-100 dark:bg-amber-950/50'}`}>
                  {favs.count}
                </span>
              )}
            </Button>
            {/* C3 — Collection filter (only shown in favorites mode, since
                collections only apply to favorited materials). Lets users
                narrow the view to a single named bucket. */}
            {showFavOnly && favs.collections.length > 0 && (
              <Select value={favCollection} onValueChange={setFavCollection}>
                <SelectTrigger className="w-full sm:w-44">
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                    <SelectValue placeholder={t('materials.favorites.allCollections')} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('materials.favorites.allCollections')}</SelectItem>
                  {favs.collections.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Table */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
                <TableRow>
                  <TableHead className="w-[40px]"><Checkbox checked={visibleMaterials.length > 0 && selectedIds.size === visibleMaterials.length} onCheckedChange={toggleSelectAll} aria-label={t('materials.aria.selectAll')} /></TableHead>
                  <TableHead className="w-[28%]">{t('materials.col.material')}</TableHead>
                  <TableHead>{t('materials.col.aliases')}</TableHead>
                  <TableHead className="w-[100px]">{t('materials.col.category')}</TableHead>
                  <TableHead className="text-center w-[60px]">{t('materials.col.papers')}</TableHead>
                  <TableHead className="text-center w-[60px]">{t('materials.col.eff')}</TableHead>
                  <TableHead className="w-[240px] text-right">{t('materials.col.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                      <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : visibleMaterials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                      {t('materials.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleMaterials.map((m) => {
                    const catBorder = m.category === 'perovskite' ? 'border-l-4 border-l-emerald-400' : m.category === 'chalcogenide' ? 'border-l-4 border-l-amber-400' : m.category === 'oxide' ? 'border-l-4 border-l-sky-400' : 'border-l-4 border-l-slate-300'
                    const mTags = (m.tags || '').split(';').map(s => s.trim()).filter(Boolean)
                    return (
                    <TableRow key={m.id} className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 ${catBorder} ${selectedIds.has(m.id) ? 'bg-emerald-50/40 dark:bg-emerald-950/15' : ''}`}>
                      <TableCell className="align-middle"><Checkbox checked={selectedIds.has(m.id)} onCheckedChange={() => toggleSelect(m.id)} aria-label={t('materials.aria.select', { name: m.name })} /></TableCell>
                      <TableCell>
                        <div className="flex items-center flex-wrap gap-1">
                          <FormulaViewer formula={m.name} size="sm" className="font-medium" />
                          <PredictedBandgapBadge
                            prediction={predictionMap.get(m.id)}
                          />
                          {/* C3 — Show a small amber badge when this material
                              belongs to a favorites collection, so the
                              assignment is visible at a glance without opening
                              the collection popover. */}
                          {(() => {
                            const col = favs.collectionOf(m.id)
                            if (!col) return null
                            return (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] sm:text-[9px] bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                                title={t('materials.favorites.collectionTitle', { name: col })}
                              >
                                <FolderOpen className="w-2.5 h-2.5" />
                                {col}
                              </span>
                            )
                          })()}
                        </div>
                        {m.notes && (
                          <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{m.notes}</div>
                        )}
                        {mTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {mTags.slice(0, 3).map((tg, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] sm:text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                                {tg}
                              </span>
                            ))}
                            {mTags.length > 3 && (
                              <span className="text-[10px] sm:text-[9px] text-slate-400">+{mTags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                        {m.aliases ? (
                          <div className="flex flex-wrap gap-1">
                            {m.aliases.split(';').map((a, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] sm:text-[10px]">
                                {a.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[11px] sm:text-[10px] capitalize ${categoryStyle(m.category)}`}>
                          {t(`materials.cat.${m.category}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{m._count.papers}</TableCell>
                      <TableCell className="text-center tabular-nums">{m._count.efficiencies}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {/* C3 — Favorite toggle (Star). Filled amber when
                              favorited, outline slate when not. Tapping adds
                              or removes the material from the localStorage
                              favorites list. */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              const nowFav = favs.toggle(m.id, m.name)
                              toast.success(
                                nowFav
                                  ? t('materials.favorites.added', { name: m.name })
                                  : t('materials.favorites.removed', { name: m.name }),
                              )
                            }}
                            title={favs.isFavorite(m.id) ? t('materials.favorites.removeTitle') : t('materials.favorites.addTitle')}
                            aria-label={favs.isFavorite(m.id) ? t('materials.favorites.removeAria', { name: m.name }) : t('materials.favorites.addAria', { name: m.name })}
                            aria-pressed={favs.isFavorite(m.id)}
                          >
                            <Star className={`w-3.5 h-3.5 ${favs.isFavorite(m.id) ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                          </Button>
                          {/* C3 — Collection assignment popover. Lets users
                              type a new collection name or pick from existing
                              ones. Also favorites the material if it isn't
                              already (so users can pick a collection from a
                              material row without first clicking the star). */}
                          <CollectionAssignPopover
                            materialName={m.name}
                            currentCollection={favs.collectionOf(m.id)}
                            collections={favs.collections}
                            isFavorite={favs.isFavorite(m.id)}
                            onAssign={(collection) => {
                              favs.moveToCollection(m.id, collection)
                              toast.success(
                                collection
                                  ? t('materials.favorites.assigned', { name: m.name, collection })
                                  : t('materials.favorites.cleared', { name: m.name }),
                              )
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openExperiment(m)}
                            title={t('materials.actions.experiment.title')}
                            aria-label={t('materials.actions.experiment.aria', { name: m.name })}
                          >
                            <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
                          </Button>
                          {/* G4 — Manual experiment entry. Opens the dialog
                              that lets the user record their own lab data
                              (PCE / Voc / Jsc / FF / bandgap / method /
                              conditions) directly into the database,
                              bypassing the AI-extraction pipeline. */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setExperimentTarget(m)}
                            title={t('materials.actions.addExperiment.title')}
                            aria-label={t('materials.actions.addExperiment.aria', { name: m.name })}
                          >
                            <TestTube2 className="w-3.5 h-3.5 text-rose-500" />
                          </Button>
                          {/* G5 — Stability database. Opens the dialog that
                              shows T80 / degradation-rate / ISOS test
                              protocol records for this material, with
                              curated benchmarks + a form to add the
                              user's own measurements. */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setStabilityTarget(m)}
                            title={t('materials.actions.stability.title')}
                            aria-label={t('materials.actions.stability.aria', { name: m.name })}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openCost(m)}
                            title={t('materials.actions.cost.title')}
                            aria-label={t('materials.actions.cost.aria', { name: m.name })}
                          >
                            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openReview(m)}
                            title={t('materials.actions.review.title')}
                            aria-label={t('materials.actions.review.aria', { name: m.name })}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openSimilar(m)}
                            title={t('materials.actions.similar.title')}
                            aria-label={t('materials.actions.similar.aria', { name: m.name })}
                          >
                            <GitCompare className="w-3.5 h-3.5 text-sky-500" />
                          </Button>
                          {/* G6 — Device structure visualization. Opens a dialog
                              showing a vertical layer-stack diagram of the
                              typical solar cell built from this material
                              (FTO | ETL | absorber | HTL | electrode). The
                              structure is inferred from the material category
                              + name + synthesis method. */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setDeviceTarget(m)}
                            title={t('materials.actions.device.title')}
                            aria-label={t('materials.actions.device.aria', { name: m.name })}
                          >
                            <Layers className="w-3.5 h-3.5 text-teal-500" />
                          </Button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title={t('materials.tags.editTags')}
                                aria-label={t('materials.tags.editAria', { name: m.name })}
                              >
                                <TagIcon className="w-3.5 h-3.5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-3" align="end">
                              <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <TagIcon className="w-3 h-3 text-emerald-500" />
                                {t('materials.tags.title')}
                                <span className="font-mono text-[11px] sm:text-[10px] text-slate-400 ml-auto">
                                  <FormulaViewer formula={m.name} size="sm" colorful={false} />
                                </span>
                              </div>
                              <MaterialTags materialId={m.id} tags={m.tags || ''} compact />
                            </PopoverContent>
                          </Popover>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setEditing(m)}
                            aria-label={t('materials.aria.edit')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-500 hover:text-red-600"
                            onClick={() => {
                              if (confirm(`Delete "${m.name}"? This also deletes its papers.`)) {
                                // Q5 — capture a snapshot of the material BEFORE
                                // the delete goes through, so the user can undo
                                // via Ctrl+Z or the History panel in the header.
                                // The undo callback re-creates the material via
                                // POST /api/materials with its original data
                                // (name / aliases / category / notes). Tags and
                                // child papers/efficiencies are NOT restored —
                                // undo is best-effort and the user is warned in
                                // the toast.
                                const snapshot = {
                                  name: m.name,
                                  aliases: m.aliases,
                                  category: m.category,
                                  notes: m.notes,
                                }
                                dispatchUndoableAction({
                                  description: `Deleted material ${m.name}`,
                                  category: 'material',
                                  undo: async () => {
                                    await api('/api/materials', {
                                      method: 'POST',
                                      body: JSON.stringify(snapshot),
                                    })
                                    qc.invalidateQueries({ queryKey: ['materials'] })
                                  },
                                })
                                deleteMut.mutate(m.id)
                              }
                            }}
                            aria-label={t('materials.aria.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* AI literature review dialog (B2) */}
      <TabErrorBoundary tabName={t('materials.tabs.review')}>
        <ReviewDialog
          state={reviewDialog}
          locale={locale}
          onClose={() => setReviewDialog((s) => ({ ...s, open: false }))}
          onRefresh={refreshReview}
        />
      </TabErrorBoundary>

      {/* Similar materials dialog (B4) */}
      <TabErrorBoundary tabName={t('materials.tabs.similar')}>
        <SimilarDialog
          state={similarDialog}
          locale={locale}
          onClose={() => setSimilarDialog((s) => ({ ...s, open: false }))}
          onPick={navigateToMaterialPapers}
        />
      </TabErrorBoundary>

      {/* AI experiment plan dialog (N5) */}
      <TabErrorBoundary tabName={t('materials.tabs.experiment')}>
        <ExperimentDialog
          state={experimentDialog}
          locale={locale}
          onClose={() => setExperimentDialog((s) => ({ ...s, open: false }))}
          onRefresh={refreshExperiment}
        />
      </TabErrorBoundary>

      {/* Material cost estimate dialog (N6) */}
      <TabErrorBoundary tabName={t('materials.tabs.cost')}>
        <CostDialog
          state={costDialog}
          locale={locale}
          onClose={() => setCostDialog((s) => ({ ...s, open: false }))}
        />
      </TabErrorBoundary>

      {/* G4 — Manual experiment entry dialog. Lets the user record their
          own lab data (PCE / Voc / Jsc / FF / bandgap / method /
          conditions) and submit it via the /api/experiments endpoint. */}
      <TabErrorBoundary tabName={t('materials.tabs.experimentEntry')}>
        <ExperimentEntryDialog
          target={experimentTarget}
          locale={locale}
          isPending={experimentMut.isPending}
          onClose={() => setExperimentTarget(null)}
          onSubmit={(body) => experimentMut.mutate(body)}
        />
      </TabErrorBoundary>

      {/* G5 — Stability database dialog. Shows T80 / degradation-rate
          records for the material (curated benchmarks + user-submitted)
          and provides a form to add new measurements. */}
      <TabErrorBoundary tabName={t('materials.tabs.stability')}>
        <StabilityDialog
          target={stabilityTarget}
          locale={locale}
          isPending={stabilityMut.isPending}
          onClose={() => setStabilityTarget(null)}
          onSubmit={(body) => stabilityMut.mutate(body)}
        />
      </TabErrorBoundary>

      {/* G6 — Device structure visualization dialog. Renders a vertical
          layer-stack diagram of the typical solar cell built from the
          material (substrate / TCO / ETL / absorber / HTL / electrode).
          The diagram itself renders instantly from materialName + category;
          the synthesis-method caption lazy-loads from the full materials
          list (see `deviceFullData` / `deviceSynthesisMethod` above). */}
      <Dialog open={!!deviceTarget} onOpenChange={(o) => !o && setDeviceTarget(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-500" />
              {t('materials.device.title')}
              {deviceTarget && (
                <span className="font-mono text-xs text-slate-500 ml-1">
                  <FormulaViewer formula={deviceTarget.name} size="sm" colorful={false} />
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {t('materials.device.desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="py-1 max-h-[65vh] overflow-y-auto pr-1">
            {deviceTarget && (
              <DeviceStructureView
                materialName={deviceTarget.name}
                category={deviceTarget.category}
                method={deviceSynthesisMethod}
                locale={locale}
                synthesisMethodCaption={
                  deviceLoading
                    ? t('materials.device.loadingMethod')
                    : deviceSynthesisMethod
                }
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceTarget(null)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <MaterialForm
          initial={editing ?? undefined}
          onSubmit={(b) => editing && updateMut.mutate({ id: editing.id, body: b })}
          isPending={updateMut.isPending}
        />
      </Dialog>

      {/* Import CSV dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setCsvText(''); setParsedMaterials([]) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-500" /> {t('materials.import.title')}
            </DialogTitle>
            <DialogDescription>{t('materials.import.desc')}</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{t('materials.import.preview', { n: parsedMaterials.length })}</span>
              <button
                onClick={() => {
                  const template = 'material_name,aliases,category,notes\nMAPbI3,CH3NH3PbI3; methylammonium lead iodide,perovskite,Classic perovskite\nCsPbI3,cesium lead iodide,perovskite,Inorganic'
                  setCsvText(template)
                }}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
              >
                {t('materials.export.template')}
              </button>
            </div>
            {/* Drop zone + textarea */}
            <label
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-emerald-400', 'bg-emerald-50/50', 'dark:bg-emerald-950/20') }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('border-emerald-400', 'bg-emerald-50/50', 'dark:bg-emerald-950/20') }}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-emerald-400', 'bg-emerald-50/50', 'dark:bg-emerald-950/20')
                const file = e.dataTransfer.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = () => setCsvText(String(reader.result || ''))
                  reader.readAsText(file)
                }
              }}
              className="block cursor-pointer"
            >
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={t('materials.import.placeholder')}
                rows={6}
                className="font-mono text-xs"
              />
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = () => setCsvText(String(reader.result || ''))
                    reader.readAsText(file)
                  }
                }}
              />
            </label>
            {parsedMaterials.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
                {parsedMaterials.slice(0, 20).map((m, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0 text-xs">
                    <span className="font-mono font-medium">{m.name}</span>
                    <Badge variant="outline" className="text-[10px] sm:text-[9px] capitalize">{m.category}</Badge>
                    {m.aliases && <span className="text-slate-400 truncate">{m.aliases.split(';')[0]}</span>}
                  </div>
                ))}
                {parsedMaterials.length > 20 && (
                  <div className="px-2 py-1 text-[11px] sm:text-[10px] text-slate-400 text-center">+{parsedMaterials.length - 20} more…</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setCsvText(''); setParsedMaterials([]) }}>
              {t('common.cancel')}
            </Button>
            {parsedMaterials.length === 0 ? (
              <Button onClick={handleParse} disabled={!csvText.trim()}>
                {t('materials.import.parse')}
              </Button>
            ) : (
              <Button onClick={() => importMut.mutate(parsedMaterials)} disabled={importMut.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {importMut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {t('materials.import.confirm', { n: parsedMaterials.length })}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MaterialForm({
  initial,
  onSubmit,
  isPending,
}: {
  initial?: Material
  onSubmit: (body: Record<string, unknown>) => void
  isPending: boolean
}) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [aliases, setAliases] = useState(initial?.aliases ?? '')
  const [category, setCategoryVal] = useState(initial?.category ?? 'perovskite')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{initial ? t('materials.form.editTitle') : t('materials.form.addTitle')}</DialogTitle>
        <DialogDescription>
          {t('materials.form.desc')}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        {/* Formula live preview */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
          <div className="text-[11px] sm:text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">
            {t('materials.formula.preview')}
          </div>
          <div className="flex items-center justify-center min-h-[40px]">
            <FormulaViewer formula={name || '?'} size="lg" />
          </div>
          {/* color legend */}
          <div className="mt-2 flex flex-wrap gap-1.5 justify-center text-[10px] sm:text-[9px] text-slate-500">
            <span className="text-rose-600 dark:text-rose-400">Metal</span>
            <span className="text-emerald-600 dark:text-emerald-400">Halogen</span>
            <span className="text-amber-600 dark:text-amber-400">H</span>
            <span className="text-purple-600 dark:text-purple-400">N</span>
            <span className="text-red-600 dark:text-red-400">O</span>
            <span className="text-slate-700 dark:text-slate-300">C / Organic</span>
          </div>
        </div>
        <div>
          <Label htmlFor="m-name">{t('materials.form.name')}</Label>
          <Input
            id="m-name"
            placeholder={t('materials.form.namePh')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="m-aliases">{t('materials.form.aliases')}</Label>
          <Textarea
            id="m-aliases"
            placeholder={t('materials.form.aliasesPh')}
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            rows={2}
          />
        </div>
        <div>
          <Label>{t('materials.col.category')}</Label>
          <Select value={category} onValueChange={setCategoryVal}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{t(`materials.cat.${c.value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="m-notes">{t('materials.form.notes')}</Label>
          <Textarea
            id="m-notes"
            placeholder={t('materials.form.notesPh')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
        {/* Material tags — only when editing (need an existing id) */}
        {initial && (
          <div>
            <Label className="flex items-center gap-1.5">
              <TagIcon className="w-3 h-3 text-emerald-500" />
              {t('materials.tags.title')}
            </Label>
            <div className="mt-1 rounded-md border border-slate-200 dark:border-slate-800 p-2">
              <MaterialTags materialId={initial.id} tags={initial.tags || ''} compact />
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button
          onClick={() => onSubmit({ name, aliases, category, notes })}
          disabled={isPending || !name.trim()}
        >
          {isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          {initial ? t('materials.form.save') : t('materials.form.create')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/**
 * Small "Predicted: ~X.XX eV" badge shown next to a material's formula when
 * the material has no measured bandgap but the prediction API was able to
 * estimate one with at least moderate confidence (≥ 0.4). Clicking opens a
 * popover with the prediction method, confidence %, and the nearest neighbors
 * the estimate was derived from.
 */
function PredictedBandgapBadge({
  prediction,
}: {
  prediction?: BandgapPredictionInfo
}) {
  const { t } = useI18n()
  if (!prediction || prediction.confidence < 0.4) return null

  const neighbors = prediction.nearestNeighbors.slice(0, 5)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] sm:text-[10px] bg-amber-50 text-amber-600/80 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300/70 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
          title={t('materials.bandgap.predictionTitle')}
          aria-label={t('materials.bandgap.predictionAria', { value: prediction.predictedBandgap.toFixed(2) })}
        >
          <Sparkles className="w-2.5 h-2.5" />
          <span className="font-mono">~{prediction.predictedBandgap.toFixed(2)} eV</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs" align="start">
        <div className="font-semibold mb-1 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" />
          {t('materials.bandgap.title')}:{' '}
          <span className="font-mono">{prediction.predictedBandgap.toFixed(2)} eV</span>
        </div>
        <div className="text-slate-500 dark:text-slate-400 mb-2">
          {t('materials.bandgap.confidence')}:{' '}
          <span className="font-mono">{Math.round(prediction.confidence * 100)}%</span>
          {' · '}
          {t('materials.bandgap.method')}:{' '}
          <span className="font-mono">{prediction.method}</span>
        </div>
        {neighbors.length > 0 && (
          <>
            <div className="text-slate-600 dark:text-slate-300 font-medium mb-1">
              {t('materials.bandgap.basedOn')}:
            </div>
            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
              {neighbors.map((n, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="font-mono truncate">{n.name}</span>
                  <span className="text-slate-500 tabular-nums shrink-0">
                    {n.bandgap.toFixed(2)} eV
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * C3 — Collection assignment popover.
 *
 * A small inline popover that lets the user assign a material to a named
 * favorites collection. The trigger is a folder icon; the popover body has
 * a text input (pre-filled with the current collection name) plus quick-pick
 * chips for existing collections. Saving with an empty string clears the
 * assignment. If the material isn't favorited yet, the assign action also
 * favorites it (delegated to the parent via `onAssign`).
 *
 * Self-contained: manages its own input + open state so it can be rendered
 * in a table row without polluting the parent's state.
 */
function CollectionAssignPopover({
  materialName,
  currentCollection,
  collections,
  isFavorite,
  onAssign,
}: {
  materialName: string
  currentCollection?: string
  collections: string[]
  isFavorite: boolean
  onAssign: (collection: string) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(currentCollection ?? '')

  // Re-sync the input whenever the popover opens or the underlying
  // collection changes (e.g. another tab updated localStorage).
  useEffect(() => {
    if (open) setInput(currentCollection ?? '')
  }, [open, currentCollection])

  const save = () => {
    const trimmed = input.trim()
    onAssign(trimmed)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 relative"
          title={currentCollection
            ? t('materials.favorites.assignTitle', { name: currentCollection })
            : t('materials.favorites.assignTitleEmpty')}
          aria-label={t('materials.favorites.assignAria', { name: materialName })}
        >
          <FolderOpen className={`w-3.5 h-3.5 ${currentCollection ? 'text-amber-500' : 'text-slate-400'}`} />
          {currentCollection && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <FolderOpen className="w-3 h-3 text-amber-500" />
          {t('materials.favorites.collection')}
          <span className="font-mono text-[11px] sm:text-[10px] text-slate-400 ml-auto truncate max-w-[120px]">
            <FormulaViewer formula={materialName} size="sm" colorful={false} />
          </span>
        </div>
        {!isFavorite && (
          <div className="mb-2 text-[11px] sm:text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Star className="w-2.5 h-2.5" />
            {t('materials.favorites.saveAlsoFav')}
          </div>
        )}
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('materials.favorites.collectionPh')}
          className="h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
          }}
        />
        {collections.length > 0 && (
          <div className="mt-2">
            <div className="text-[11px] sm:text-[10px] text-slate-500 mb-1">{t('materials.favorites.existing')}</div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {collections.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setInput(c)}
                  className={`px-1.5 py-0.5 rounded text-[11px] sm:text-[10px] border transition-colors ${
                    input.trim() === c
                      ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-amber-950/30'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-between gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-slate-500 hover:text-red-500"
            onClick={() => {
              setInput('')
              onAssign('')
              setOpen(false)
            }}
            disabled={!currentCollection}
          >
            <X className="w-3 h-3 mr-0.5" />
            {t('common.clear')}
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
            onClick={save}
          >
            {t('common.save')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
