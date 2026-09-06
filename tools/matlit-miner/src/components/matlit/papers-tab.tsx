'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  FileText,
  Loader2,
  Trash2,
  BookOpen,
  FileDown,
  Database,
  Layers,
  History,
  RefreshCw,
  LayoutGrid,
  List,
  ShieldCheck,
  Smartphone,
  X,
  CheckCircle2,
  ChevronRight,
  Languages,
  Hash,
  Upload,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { PaperDrawer } from '@/components/matlit/paper-drawer'
import { DoiValidator } from '@/components/matlit/doi-validator'
import { FormulaViewer } from '@/components/matlit/formula-viewer'
import { Pagination } from '@/components/matlit/pagination'
import { useMediaQuery } from '@/hooks/use-media-query'
// M1b: satellite dialog + card components extracted to ./papers/* to keep
// this file under ~1.8k LOC. They own their own state (where practical)
// and use useQueryClient/useI18n internally.
import { Paper, isChinesePaper, SOURCE_META, ALL_SOURCES } from './papers/shared'
import { PaperCard } from './papers/paper-card'
import { PaperCardSkeleton } from './papers/paper-card-skeleton'
import { BatchConfirmDialog, PendingBatch } from './papers/batch-confirm-dialog'
import { UploadPdfDialog } from './papers/upload-pdf-dialog'
import { ImportBibtexDialog } from './papers/import-bibtex-dialog'
import { ImportDoisDialog } from './papers/import-dois-dialog'


export default function PapersTab({ focusMaterialId, onConsumeFocus }: { focusMaterialId?: string | null; onConsumeFocus?: () => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [materialId, setMaterialId] = useState<string>('')
  const [limit, setLimit] = useState(15)
  const [useAlias, setUseAlias] = useState(false)
  // P2-8: when true, the search also fires /api/papers/search-cn (CrossRef
  // queried with a Chinese-translated query, results filtered to CJK titles)
  // and merges the Chinese hits into the same Paper list.
  const [searchCn, setSearchCn] = useState(false)
  const [filterSynth, setFilterSynth] = useState('all')
  const [filterMatId, setFilterMatId] = useState('')
  const [selectedSources, setSelectedSources] = useState<string[]>([...ALL_SOURCES])
  const [recentSearches, setRecentSearches] = useState<Array<{ id: string; name: string; ts: number }>>([])
  const [searchPresets, setSearchPresets] = useState<Array<{ name: string; materialId: string; sources: string[]; limit: number; useAlias: boolean }>>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'year' | 'citations' | 'title' | 'source'>('year')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [abstractSearch, setAbstractSearch] = useState('')
  // Debounced abstract search - the value actually sent to the API.
  const [abstractSearchDebounced, setAbstractSearchDebounced] = useState('')
  // Pagination state (server-side).
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // Incremental rendering for the mobile card list — instead of rendering
  // every card returned by the API in one go (which can jank on mobile when
  // pageSize is bumped up), we render the first N and reveal more via an
  // IntersectionObserver sentinel + an explicit "Load more" button.
  const [visibleCount, setVisibleCount] = useState(20)
  const [drawerPaper, setDrawerPaper] = useState<Paper | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [doiValidateOpen, setDoiValidateOpen] = useState(false)

  // G1G2: BibTeX/RIS + DOI batch import dialogs — extracted to
  // ./papers/import-bibtex-dialog.tsx + ./papers/import-dois-dialog.tsx.
  // These own their content/materialId/result state internally; the parent
  // just tracks open/close so the trigger button can show them.
  const [bibtexOpen, setBibtexOpen] = useState(false)

  const [doiImportOpen, setDoiImportOpen] = useState(false)

  // ── G8: PDF upload + VLM/LLM extraction dialog state ───────────────────
  // Extracted to ./papers/upload-pdf-dialog.tsx — that component owns the
  // file list, drag flag, target material, running flag, and the per-file
  // extraction fetch loop. The parent only tracks open/close.
  const [uploadOpen, setUploadOpen] = useState(false)

  // D4: ref used to ferry the distinct-material count from the moment
  // the user confirms a batch (in executePendingBatch) to the mutation's
  // onSuccess callback (which fires later, after pendingBatch has been
  // cleared). Stays 0 for non-batch (e.g. programmatic) invocations so
  // the legacy toast fallback is preserved.
  const lastBatchMaterialCountRef = useRef(0)

  // Mobile detection: forces card view on small screens.
  const isMobile = useMediaQuery('(max-width: 640px)')
  const effectiveViewMode: 'cards' | 'table' = isMobile ? 'cards' : viewMode

  // Touch detection (D5): enables swipe-to-select / swipe-to-delete gestures
  // on PaperCards. Only active on mobile + touch devices — desktop cards
  // remain click-to-open. We detect touch capability after mount so the SSR
  // pass stays deterministic (false on first render, resolves to true on
  // touch devices after hydration).
  const [hasTouch, setHasTouch] = useState(false)
  useEffect(() => {
    setHasTouch(
      typeof window !== 'undefined' &&
        ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0),
    )
  }, [])
  const enableSwipe = isMobile && hasTouch

  // Debounce the abstract search input (300ms) so we don't spam the API on
  // every keystroke.
  useEffect(() => {
    const h = setTimeout(() => {
      setAbstractSearchDebounced(abstractSearch.trim())
    }, 300)
    return () => clearTimeout(h)
  }, [abstractSearch])

  // Reset to page 1 whenever the filters or search query change.
  useEffect(() => {
    setPage(1)
  }, [filterMatId, filterSynth, abstractSearchDebounced])

  // Load recent searches + presets from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('matlit-recent-searches')
      if (raw) setRecentSearches(JSON.parse(raw))
      const presetsRaw = localStorage.getItem('matlit-search-presets')
      if (presetsRaw) setSearchPresets(JSON.parse(presetsRaw))
    } catch {
      // ignore
    }
  }, [])

  const savePreset = (name: string) => {
    if (!materialId) {
      toast.error(t('papers.search.selectMaterialFirst'))
      return
    }
    const preset = { name, materialId, sources: selectedSources, limit, useAlias }
    setSearchPresets((prev) => {
      const next = [...prev.filter((p) => p.name !== name), preset].slice(0, 10)
      try { localStorage.setItem('matlit-search-presets', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    toast.success(t('papers.preset.saved', { name }))
  }

  const loadPreset = (preset: { materialId: string; sources: string[]; limit: number; useAlias: boolean }) => {
    setMaterialId(preset.materialId)
    setSelectedSources(preset.sources)
    setLimit(preset.limit)
    setUseAlias(preset.useAlias)
    toast.success(t('papers.preset.loaded'))
  }

  const deletePreset = (name: string) => {
    setSearchPresets((prev) => {
      const next = prev.filter((p) => p.name !== name)
      try { localStorage.setItem('matlit-search-presets', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const clearHistory = () => {
    setRecentSearches([])
    try {
      localStorage.removeItem('matlit-recent-searches')
    } catch {
      // ignore
    }
  }

  // When navigated here from another tab with a focusMaterialId, set the filter.
  useEffect(() => {
    if (focusMaterialId) {
      setFilterMatId(focusMaterialId)
      onConsumeFocus?.()
    }
  }, [focusMaterialId, onConsumeFocus])

  // D2: Listen for `matlit:open-paper` events dispatched by the command
  // palette when the user picks a paper from the global search group.
  // The payload carries the lightweight paper shape returned by
  // /api/papers/search (id / title / doi / year / materialId / materialName).
  // We synthesize a minimal Paper object so the drawer opens instantly
  // with title + DOI + material badge; the rest of the fields are empty
  // until either (a) the papers list query loads the matching record, or
  // (b) the user opens a full card from the list.
  useEffect(() => {
    type OpenPaperDetail = {
      id: string
      title: string
      doi: string
      year: number | null
      materialId: string
      materialName: string
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenPaperDetail>).detail
      if (!detail || !detail.id) return
      setFilterMatId(detail.materialId)
      setDrawerPaper({
        id: detail.id,
        materialId: detail.materialId,
        title: detail.title,
        year: detail.year,
        doi: detail.doi,
        abstract: '',
        authors: '',
        venue: '',
        url: detail.doi ? `https://doi.org/${detail.doi}` : '',
        citationCount: 0,
        source: '',
        material: { name: detail.materialName, id: detail.materialId },
      })
      setDrawerOpen(true)
    }
    window.addEventListener('matlit:open-paper', handler)
    return () => window.removeEventListener('matlit:open-paper', handler)
  }, [])

  const toggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  const { data: matData } = useQuery<{ materials: Array<{ id: string; name: string }> }>({
    queryKey: ['materials-mini'],
    queryFn: () => api('/api/materials'),
    // The materials list rarely changes once a project is set up — cache it
    // aggressively so re-mounts of PapersTab don't refetch.
    staleTime: 5 * 60 * 1000,
  })

  const { data, isLoading, isFetching } = useQuery<{
    papers: Paper[]
    count: number
    total?: number
    page?: number
    pageSize?: number
    totalPages?: number
  }>({
    queryKey: ['papers', filterMatId, filterSynth, abstractSearchDebounced, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filterMatId) params.set('materialId', filterMatId)
      if (filterSynth !== 'all') params.set('synthesized', filterSynth)
      if (abstractSearchDebounced) params.set('q', abstractSearchDebounced)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      return api(`/api/papers?${params.toString()}`)
    },
    // Keep the previous page's data visible while the next page is fetching
    // so switching pages doesn't flash an empty list (P1-5 perf opt).
    placeholderData: (prev) => prev,
    // Papers list itself is reasonably stable between filter changes — a
    // short staleTime avoids hammering the API on tab re-mounts.
    staleTime: 60 * 1000,
  })

  // Derived papers/materials — declared early so the D2 useEffect below
  // (and prepareBatch further down) can reference `papers` without
  // tripping the "accessed before declaration" rule.
  const papers = data?.papers ?? []
  const materials = matData?.materials ?? []
  const totalPapers = data?.total ?? data?.count ?? 0

  // D2: When the papers list finishes loading for the focused material,
  // replace the synthesized (partial) drawer paper with the full record
  // so the drawer shows abstract / authors / venue / classification once
  // they're available. Only fires once per drawer open: once the abstract
  // is non-empty we consider the drawer paper "fully populated".
  useEffect(() => {
    if (!drawerPaper || !drawerOpen) return
    if (drawerPaper.abstract && drawerPaper.authors) return
    const full = papers.find((p) => p.id === drawerPaper.id)
    if (full && (full.abstract || full.authors)) {
      setDrawerPaper(full)
    }
  }, [papers, drawerPaper, drawerOpen])

  // P2-8: search mutation runs both the regular English search AND, when
  // `searchCn` is enabled, the Chinese-source search in parallel. The two
  // responses are merged into a single result object so the existing
  // onSuccess handler stays unchanged.
  const searchMut = useMutation({
    mutationFn: async () => {
      const enPromise = api<{
        found: number
        inserted: number
        updated?: number
        sourceCounts?: Record<string, number>
        errors?: Array<{ source: string; error: string }>
      }>('/api/papers/search', {
        method: 'POST',
        body: JSON.stringify({ materialId, limit, useAlias, sources: selectedSources }),
      })

      if (!searchCn) return enPromise

      // Fire the Chinese-source search in parallel; persist=true (default)
      // so the new CN papers are saved against the selected material and
      // surface in the regular paginated list via qc.invalidateQueries.
      const cnPromise = api<{
        found: number
        inserted?: number
        updated?: number
        chineseQueries?: string[]
        errors?: Array<{ source: string; error: string }>
      }>('/api/papers/search-cn', {
        method: 'POST',
        body: JSON.stringify({ materialId, limit, persist: true }),
      }).catch((e): { found: 0; inserted: 0; updated: 0; chineseQueries: string[]; errors: Array<{ source: string; error: string }> } => ({
        found: 0,
        inserted: 0,
        updated: 0,
        chineseQueries: [],
        errors: [{ source: 'search-cn', error: (e as Error).message }],
      }))

      const [en, cn] = await Promise.all([enPromise, cnPromise])
      return {
        found: en.found + (cn.found || 0),
        inserted: en.inserted + (cn.inserted || 0),
        updated: (en.updated || 0) + (cn.updated || 0),
        sourceCounts: en.sourceCounts,
        cnFound: cn.found,
        cnQueries: cn.chineseQueries,
        errors: [...(en.errors || []), ...(cn.errors || [])],
      }
    },
    onSuccess: (d: { found: number; inserted: number; updated?: number; sourceCounts?: Record<string, number>; cnFound?: number; cnQueries?: string[]; errors?: Array<{ source: string; error: string }> }) => {
      const parts = [`${d.found} ${t('papers.search.found')}`, `${d.inserted} ${t('papers.search.new')}`]
      if (d.updated) parts.push(`${d.updated} ${t('papers.search.updated')}`)
      if (d.cnFound && d.cnFound > 0) {
        parts.push(`${d.cnFound} ${t('papers.search.cn')}`)
      }
      toast.success(parts.join(' · '))
      if (d.cnQueries && d.cnQueries.length > 0) {
        toast.info(`${t('papers.search.cnQueries')}: ${d.cnQueries.join(' · ')}`, { duration: 6000 })
      }
      if (d.errors && d.errors.length) {
        toast.warning(`${t('papers.search.someFailed')}: ${d.errors.map((e) => e.source).join(', ')}`)
      }
      // Record to search history (inline to avoid closure timing issues)
      if (materialId) {
        const mat = (matData?.materials ?? []).find((m) => m.id === materialId)
        const name = mat?.name || materialId
        setRecentSearches((prev) => {
          const filtered = prev.filter((r) => r.id !== materialId)
          const next = [{ id: materialId, name, ts: Date.now() }, ...filtered].slice(0, 8)
          try {
            localStorage.setItem('matlit-recent-searches', JSON.stringify(next))
          } catch {
            // ignore
          }
          return next
        })
      }
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`${t('papers.search.failed')}: ${(e as Error).message}`),
  })

  const enrichMut = useMutation({
    mutationFn: () =>
      api<{ processed: number; total: number }>('/api/papers/enrich', { method: 'POST', body: JSON.stringify({ materialId: filterMatId || undefined, limit: 100 }) }),
    onSuccess: (d: { processed: number; total: number }) => {
      toast.success(t('papers.enrich.success', { processed: d.processed, total: d.total }))
      qc.invalidateQueries({ queryKey: ['papers'] })
    },
    onError: (e) => toast.error(`${t('papers.enrich.failed')}: ${(e as Error).message}`),
  })

  // P2-8: batch translate non-English papers (titles + abstracts → English)
  // via /api/papers/translate. Collects up to 20 paper IDs on the current
  // page that look Chinese (CJK title or originalLanguage==='zh') AND lack
  // a translatedTitle, then POSTs them in a single call. The endpoint
  // hard-caps at 20 per call so we don't blow through the LLM quota.
  const translateAllMut = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ translated: number; skipped: number; failed: number; total: number; capped?: boolean }>(
        '/api/papers/translate',
        { method: 'POST', body: JSON.stringify({ paperIds: ids }) },
      ),
    onSuccess: (d) => {
      if (d.translated > 0) {
        toast.success(
          d.failed
            ? t('papers.translate.successWithFailed', { n: d.translated, failed: d.failed })
            : t('papers.translate.success', { n: d.translated }),
        )
      } else if (d.skipped > 0) {
        toast.info(t('papers.translate.allEnglish'))
      } else {
        toast.info(t('papers.translate.noneToTranslate'))
      }
      qc.invalidateQueries({ queryKey: ['papers'] })
    },
    onError: (e) => toast.error(`${t('papers.translate.failed')}: ${(e as Error).message}`),
  })

  // P2-8: derived list of paper IDs on the current page that still need
  // translation (Chinese AND no translatedTitle). Capped at 20 to match
  // the server-side limit.
  const translatableIds = useMemo(() => {
    const out: string[] = []
    for (const p of papers) {
      if (!isChinesePaper(p)) continue
      if (p.translatedTitle && p.translatedTitle.trim()) continue
      out.push(p.id)
      if (out.length >= 20) break
    }
    return out
  }, [papers])

  const [batchOpen, setBatchOpen] = useState(false)
  const [batchOnlyEmpty, setBatchOnlyEmpty] = useState(true)
  const batchMut = useMutation({
    mutationFn: () =>
      api<{ materialsProcessed: number; totalInserted: number; totalErrors: number; perMaterial: Array<{ material: string; inserted: number; errors: string[] }> }>('/api/papers/search-batch', {
        method: 'POST',
        body: JSON.stringify({ limit, sources: selectedSources, onlyEmpty: batchOnlyEmpty, maxMaterials: 60 }),
      }),
    onSuccess: (d: { materialsProcessed: number; totalInserted: number; totalErrors: number; perMaterial: Array<{ material: string; inserted: number; errors: string[] }> }) => {
      toast.success(t('papers.batch.complete', { inserted: d.totalInserted, processed: d.materialsProcessed }))
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setBatchResult(d)
    },
    onError: (e) => toast.error(`${t('papers.batch.failed')}: ${(e as Error).message}`),
  })
  const [batchResult, setBatchResult] = useState<{ materialsProcessed: number; totalInserted: number; totalErrors: number; perMaterial: Array<{ material: string; inserted: number; errors: string[] }> } | null>(null)

  const clearMut = useMutation({
    mutationFn: (id: string) => api(`/api/papers?materialId=${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Cleared papers for this material')
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`Clear failed: ${(e as Error).message}`),
  })

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api<{ deleted: number }>('/api/papers/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: (d: { deleted: number }) => {
      // D4: enhanced toast — includes the material count captured at the
      // moment the user confirmed the batch (see executePendingBatch).
      const matCount = lastBatchMaterialCountRef.current
      lastBatchMaterialCountRef.current = 0
      if (matCount > 0) {
        toast.success(
          t('papers.bulk.deleteFromMaterials', { matCount, deleted: d.deleted }),
        )
      } else {
        toast.success(t('papers.bulk.deleteComplete', { n: d.deleted }))
      }
      setSelectedIds(new Set())
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`${t('papers.bulk.deleteFailed')}: ${(e as Error).message}`),
  })

  const bulkReclassifyMut = useMutation({
    mutationFn: (ids: string[]) => api<{ processed: number; total: number }>('/api/papers/bulk-reclassify', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: (d: { processed: number; total: number }) => {
      // D4: enhanced toast — includes the material count captured at the
      // moment the user confirmed the batch.
      const matCount = lastBatchMaterialCountRef.current
      lastBatchMaterialCountRef.current = 0
      if (matCount > 0) {
        toast.success(
          t('papers.bulk.reclassifyFromMaterials', { matCount, processed: d.processed, total: d.total }),
        )
      } else {
        toast.success(t('papers.bulk.reclassifyComplete', { processed: d.processed, total: d.total }))
      }
      setSelectedIds(new Set())
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`${t('papers.bulk.reclassifyFailed')}: ${(e as Error).message}`),
  })

  // Single-paper actions for drawer
  const drawerReclassifyMut = useMutation({
    mutationFn: (paperId: string) => api(`/api/papers/${paperId}/reclassify`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('papers.reclassify.success'))
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`${t('papers.reclassify.failed')}: ${(e as Error).message}`),
  })

  const drawerReextractMut = useMutation({
    mutationFn: (paperId: string) => api(`/api/papers/${paperId}/reextract`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('papers.reextract.success'))
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(`${t('papers.reextract.failed')}: ${(e as Error).message}`),
  })

  // G1G2: BibTeX/RIS + DOI batch import mutations moved into the
  // extracted ImportBibtexDialog + ImportDoisDialog components — they own
  // their own state (content/materialId/result) and call useQueryClient
  // internally to invalidate ['papers']/['stats'] on success.

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── D4: Batch operation confirmation dialog ────────────────────────────
  // The PendingBatch type + the dialog's JSX live in
  // ./papers/batch-confirm-dialog.tsx (extracted M1b). We keep the
  // pendingBatch state + prepareBatch/executePendingBatch here because they
  // depend on selection + the bulkDelete/bulkReclassify mutations.
  const [pendingBatch, setPendingBatch] = useState<PendingBatch | null>(null)

  // Build the pending batch payload from the current selection. Pulls
  // paper titles + material names from the loaded `papers` array; any
  // selected IDs that aren't in the current page are counted as "more".
  const prepareBatch = useCallback((type: 'delete' | 'classify') => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const previews: PendingBatch['previews'] = []
    const distinctMaterialIds = new Set<string>()
    for (const p of papers) {
      if (selectedIds.has(p.id)) {
        previews.push({ id: p.id, title: p.title, materialName: p.material.name })
        distinctMaterialIds.add(p.material.id)
      }
    }
    setPendingBatch({ type, previews, totalCount: ids.length, distinctMaterialIds })
  }, [selectedIds, papers])

  // Execute the pending batch — wired to the existing mutations so all
  // invalidation + toast logic stays untouched.
  const executePendingBatch = useCallback(() => {
    if (!pendingBatch) return
    const ids = Array.from(selectedIds)
    // Capture the distinct-material count so the success toast can show
    // "Deleted N papers from M materials" / "Re-classified N papers
    // across M materials" — richer than the legacy "Deleted N papers".
    lastBatchMaterialCountRef.current = pendingBatch.distinctMaterialIds.size
    if (pendingBatch.type === 'delete') {
      bulkDeleteMut.mutate(ids)
    } else {
      bulkReclassifyMut.mutate(ids)
    }
    setPendingBatch(null)
  }, [pendingBatch, selectedIds, bulkDeleteMut, bulkReclassifyMut])

  // Sorted papers — only re-orders within the current page (server-side
  // pagination already returns the right page; sort applies to that page).
  const sortedPapers = useMemo(() => {
    const arr = [...papers]
    arr.sort((a, b) => {
      if (sortBy === 'year') return (b.year ?? 0) - (a.year ?? 0)
      if (sortBy === 'citations') return (b.citationCount ?? 0) - (a.citationCount ?? 0)
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'source') return a.source.localeCompare(b.source)
      return 0
    })
    return arr
  }, [papers, sortBy])

  // P1-5: Virtualized table body. The desktop "table" view used to render
  // a <tr> per paper in a scrollable <tbody>; with 1303 papers on a single
  // page that's 1303+ DOM nodes — slow to mount, paint, and scroll. We
  // virtualize the body so only the visible rows (+ a small overscan) are
  // in the DOM at any time. The header stays sticky above the virtual list.
  //
  // Layout: we replace the native <table> with a CSS-grid div structure so
  // we can absolutely position each virtualized row. Column template is
  // responsive (matches the old w-8/w-16/w-32/w-24/w-16/w-20/w-16 hints
  // and the sm:/md: visibility rules).
  const isSm = useMediaQuery('(min-width: 640px)')
  const isMd = useMediaQuery('(min-width: 768px)')
  const gridTemplateColumns = useMemo(() => {
    // 1: checkbox (32px) | 2: title (1fr) | 3: year (64px) | 4: authors (128px)
    // 5: source (96px)   | 6: citations (64px) | 7: synth (80px) | 8: doi (64px)
    if (!isSm) {
      // mobile: hide authors (4) + source (5)
      return '32px minmax(0,1fr) 64px 64px 80px 64px'
    }
    if (!isMd) {
      // sm–md: hide source (5)
      return '32px minmax(0,1fr) 64px 128px 64px 80px 64px'
    }
    return '32px minmax(0,1fr) 64px 128px 96px 64px 80px 64px'
  }, [isSm, isMd])

  // Fixed row height — single-line content, ~40px keeps the dense look.
  const VIRTUAL_ROW_HEIGHT = 40
  const tableScrollRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns non-memoizable functions; React Compiler correctly skips auto-memoization.
  const rowVirtualizer = useVirtualizer({
    count: sortedPapers.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    // Render a few extra rows above/below the viewport so quick scrolls
    // don't flash empty space.
    overscan: 8,
    // Ensure each row's measured size is the fixed height (avoids layout
    // thrash if content ever wraps mid-measurement).
    measureElement: undefined,
  })

  // Reset incremental rendering ("load more") whenever the filter, search,
  // sort, or pagination changes — otherwise the user could be left looking
  // at stale "hidden" cards from the previous query.
  useEffect(() => {
    setVisibleCount(20)
  }, [filterMatId, filterSynth, abstractSearchDebounced, page, pageSize, sortBy])

  // Infinite-scroll sentinel — observes a trailing element and reveals the
  // next batch of cards when it enters the viewport. Re-subscribes whenever
  // the "has more" condition flips so we always observe the live element.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMore = sortedPapers.length > visibleCount
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => c + 20)
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore])

  const addToHistory = (id: string) => {
    const mat = materials.find((m) => m.id === id)
    const name = mat?.name || id
    setRecentSearches((prev) => {
      const filtered = prev.filter((r) => r.id !== id)
      const next = [{ id, name, ts: Date.now() }, ...filtered].slice(0, 8)
      try {
        localStorage.setItem('matlit-recent-searches', JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // ── G8: PDF upload helpers ──────────────────────────────────────────────
  // All upload-related helpers (addPdfFiles, removeUploadItem, runPdfUpload,
  // resetUploadDialog, uploadCounts) moved into ./papers/upload-pdf-dialog.tsx
  // along with the dialog itself. The parent only tracks open/close.

  return (
    <div className={`space-y-4 ${selectedIds.size > 0 ? 'pb-28 sm:pb-24' : ''}`}>
      {/* Search panel */}
      <Card className="border-sky-200/60 dark:border-sky-900/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-sky-500" /> {t('papers.search.title')}
          </CardTitle>
          <CardDescription>
            {t('papers.search.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2 lg:col-span-2">
              <Label htmlFor="p-mat">{t('papers.search.target')}</Label>
              <Select value={materialId} onValueChange={setMaterialId}>
                <SelectTrigger id="p-mat">
                  <SelectValue placeholder={t('papers.search.targetPh')} />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="p-limit">{t('papers.search.perQuery')}</Label>
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger id="p-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4 pb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch id="p-alias" checked={useAlias} onCheckedChange={setUseAlias} />
                <Label htmlFor="p-alias" className="text-xs cursor-pointer">{t('papers.search.alias')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="p-cn" checked={searchCn} onCheckedChange={setSearchCn} />
                <Label htmlFor="p-cn" className="text-xs cursor-pointer flex items-center gap-1">
                  <Languages className="w-3 h-3 text-amber-500" />
                  {t('papers.chineseSources')}
                </Label>
              </div>
            </div>
          </div>

          {/* Source selector */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-500" /> {t('papers.search.sources')}
              </Label>
              <button
                onClick={() => setSelectedSources(selectedSources.length === ALL_SOURCES.length ? [] : [...ALL_SOURCES])}
                className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
              >
                {t('papers.search.selectAll')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_SOURCES.map((src) => {
                const meta = SOURCE_META[src]
                const active = selectedSources.includes(src)
                return (
                  <button
                    key={src}
                    onClick={() => toggleSource(src)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-all flex items-center gap-1.5 ${
                      active
                        ? meta.color
                        : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-800'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-current' : 'bg-slate-300 dark:bg-slate-700'}`} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <History className="w-3 h-3" /> {t('papers.recent')}
                </span>
                <button
                  onClick={clearHistory}
                  className="text-[11px] sm:text-[10px] text-slate-400 hover:text-red-500"
                >
                  {t('papers.recent.clear')}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setMaterialId(r.id)}
                    className="px-2 py-0.5 rounded-full text-[11px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 transition-colors font-mono"
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => searchMut.mutate()}
              disabled={!materialId || searchMut.isPending || selectedSources.length === 0}
              className="bg-sky-600 hover:bg-sky-700"
            >
              {searchMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-1" />
              )}
              {t('papers.search.run')}
            </Button>
            <Button
              variant="outline"
              onClick={() => enrichMut.mutate()}
              disabled={enrichMut.isPending || papers.length === 0}
            >
              {enrichMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
              {t('papers.results.enrich')}
            </Button>
            {materialId && (
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm(t('papers.clearConfirm'))) clearMut.mutate(materialId)
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" /> {t('papers.search.clear')}
              </Button>
            )}
            {/* G8: Upload PDF — bypasses remote API search by letting the
                user drag-drop local PDFs and using the LLM to auto-extract
                a Paper record + Classification from the PDF text. */}
            <Button
              variant="outline"
              onClick={() => setUploadOpen(true)}
              className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300"
              title={t('papers.uploadPdf.title')}
              aria-label={t('papers.uploadPdf.title')}
            >
              <Upload className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">
                {t('papers.uploadPdf.button')}
              </span>
            </Button>
            {/* G1G2: Import existing libraries (Zotero/Mendeley BibTeX/RIS)
                + DOI lists — for researchers who already maintain a library
                outside MatLit Miner. */}
            <Button
              variant="outline"
              onClick={() => setBibtexOpen(true)}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
              title={t('papers.importBibtex.title')}
            >
              <FileText className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">{t('papers.importBibtex.button')}</span>
              <span className="sm:hidden">Bib</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setDoiImportOpen(true)}
              className="border-cyan-300 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-800 dark:text-cyan-300"
              title={t('papers.importDois.title')}
            >
              <Hash className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">{t('papers.importDois.button')}</span>
              <span className="sm:hidden">DOI</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => { setBatchResult(null); setBatchOpen(true) }}
              className="ml-auto bg-gradient-to-r from-sky-100 to-cyan-100 text-sky-800 border-sky-200 hover:from-sky-200 hover:to-cyan-200 dark:from-sky-950/50 dark:to-cyan-950/50 dark:text-sky-200 dark:border-sky-900"
            >
              <Layers className="w-4 h-4 mr-1" /> {t('papers.batch.run')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Batch search dialog */}
      <Dialog open={batchOpen} onOpenChange={(o) => { setBatchOpen(o); if (!o) setBatchResult(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-500" /> {t('papers.batch.title')}
            </DialogTitle>
            <DialogDescription>{t('papers.batch.desc')}</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex items-center gap-2">
              <Switch id="batch-only-empty" checked={batchOnlyEmpty} onCheckedChange={setBatchOnlyEmpty} />
              <Label htmlFor="batch-only-empty" className="text-xs cursor-pointer">{t('papers.batch.onlyEmpty')}</Label>
            </div>
            <div className="text-xs text-slate-500 flex flex-wrap gap-1.5">
              {selectedSources.map((s) => {
                const meta = SOURCE_META[s]
                return meta ? <span key={s} className={`px-1.5 py-0.5 rounded text-[11px] sm:text-[10px] border ${meta.color}`}>{meta.label}</span> : null
              })}
              <span className="text-slate-400">· {limit}/source</span>
            </div>
            {batchMut.isPending && (
              <div className="flex items-center gap-2 text-sm text-sky-600 dark:text-sky-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('papers.batch.inProgress')}
              </div>
            )}
            {batchResult && !batchMut.isPending && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-sky-50 dark:bg-sky-950/30 p-2 border border-sky-200 dark:border-sky-900">
                    <div className="text-lg font-bold text-sky-700 dark:text-sky-300 tabular-nums">{batchResult.materialsProcessed}</div>
                    <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.batch.stats.materials')}</div>
                  </div>
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-2 border border-emerald-200 dark:border-emerald-900">
                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{batchResult.totalInserted}</div>
                    <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.batch.stats.inserted')}</div>
                  </div>
                  <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 border border-amber-200 dark:border-amber-900">
                    <div className="text-lg font-bold text-amber-700 dark:text-amber-300 tabular-nums">{batchResult.totalErrors}</div>
                    <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.batch.stats.errors')}</div>
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-2">{t('papers.batch.summary')}</div>
                <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
                  {batchResult.perMaterial.filter((m) => m.inserted > 0 || m.errors.length > 0).length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 text-center">{t('papers.batch.empty')}</div>
                  ) : (
                    batchResult.perMaterial.filter((m) => m.inserted > 0 || m.errors.length > 0).map((m) => (
                      <div key={m.material} className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 text-xs">
                        <span className="font-mono">{m.material}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">+{m.inserted}</span>
                          {m.errors.length > 0 && <span className="text-amber-500" title={m.errors.join('; ')}>⚠{m.errors.length}</span>}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>
              {batchResult ? t('common.close') : t('common.cancel')}
            </Button>
            {!batchResult && (
              <Button onClick={() => batchMut.mutate()} disabled={batchMut.isPending || selectedSources.length === 0} className="bg-sky-600 hover:bg-sky-700">
                {batchMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Layers className="w-4 h-4 mr-1" />}
                {t('papers.batch.run')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <FileText className="w-4 h-4 text-slate-500" /> {t('papers.results.title')}
                <Badge variant="secondary" className="ml-1">{totalPapers}</Badge>
                {isMobile && (
                  <Badge
                    variant="outline"
                    className="ml-1 text-[10px] sm:text-[9px] gap-0.5 bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900"
                    title={t('papers.view.mobileHint')}
                  >
                    <Smartphone className="w-2.5 h-2.5" />
                    {t('papers.view.mobileHint')}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{t('papers.results.desc')}</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={filterMatId || '__all__'} onValueChange={(v) => setFilterMatId(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-[160px] sm:w-[180px]">
                  <SelectValue placeholder={t('common.allMaterials')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('common.allMaterials')}</SelectItem>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSynth} onValueChange={setFilterSynth}>
                <SelectTrigger className="w-[120px] sm:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allPapers')}</SelectItem>
                  <SelectItem value="yes">{t('classify.filter.synthYes')}</SelectItem>
                  <SelectItem value="no">{t('classify.filter.synthNo')}</SelectItem>
                  <SelectItem value="uncertain">{t('classify.filter.synthUncertain')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'year' | 'citations' | 'title' | 'source')}>
                <SelectTrigger className="w-[110px] sm:w-[120px] hidden sm:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">{t('papers.sort.year')}</SelectItem>
                  <SelectItem value="citations">{t('papers.sort.citations')}</SelectItem>
                  <SelectItem value="title">{t('papers.sort.title')}</SelectItem>
                  <SelectItem value="source">{t('papers.sort.source')}</SelectItem>
                </SelectContent>
              </Select>
              {/* View toggle — hidden on mobile (mobile always uses card view) */}
              {!isMobile && (
                <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`px-2 h-8 text-xs flex items-center gap-1 transition-colors ${viewMode === 'cards' ? 'bg-sky-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    title={t('papers.view.cards')}
                    aria-label={t('papers.view.cards')}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-2 h-8 text-xs flex items-center gap-1 transition-colors ${viewMode === 'table' ? 'bg-sky-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    title={t('papers.view.table')}
                    aria-label={t('papers.view.table')}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {/* DOI batch validate */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDoiValidateOpen(true)}
                disabled={papers.length === 0}
                className="h-8 gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                title={t('papers.doi.title')}
                aria-label={t('papers.doi.title')}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('papers.doi.validate')}</span>
              </Button>
              {/* P2-8: batch translate non-English (Chinese) papers to English.
                  Disabled when there are no translatable papers on the
                  current page. Shows the pending count when > 0. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => translateAllMut.mutate(translatableIds)}
                disabled={translateAllMut.isPending || translatableIds.length === 0}
                className="h-8 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
                title={t('papers.translateAll.title')}
                aria-label={t('papers.translateAll.title')}
              >
                {translateAllMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Languages className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {t('papers.translateAll.button')}
                </span>
                {translatableIds.length > 0 && !translateAllMut.isPending && (
                  <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px] sm:text-[9px] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900">
                    {translatableIds.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
          {/* Abstract search — now server-side via `q` param */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={abstractSearch}
              onChange={(e) => setAbstractSearch(e.target.value)}
              placeholder={t('papers.results.abstractSearch')}
              className="pl-9 h-8 text-sm"
            />
            {abstractSearch && abstractSearch !== abstractSearchDebounced && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 animate-spin" />
            )}
          </div>
          {/* Bulk actions now live in a sticky bottom bar (see end of component). */}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2 pr-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <PaperCardSkeleton key={`init-skel-${i}`} />
              ))}
            </div>
          ) : papers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t('papers.results.empty')}</p>
            </div>
          ) : effectiveViewMode === 'cards' ? (
            <>
              {/* Sticky result-count header — also serves as the
                  `papers-list-top` scroll anchor for pagination. Lets the
                  user see how many cards are visible vs the page total. */}
              <div
                id="papers-list-top"
                className="sticky top-0 z-10 mb-2 py-1.5 px-1 -mx-1 bg-background/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800"
              >
                <span className="text-xs text-slate-500 tabular-nums">
                  {t('papers.showing', { visible: Math.min(visibleCount, sortedPapers.length), total: sortedPapers.length })}
                </span>
              </div>
              {/* Card list — no nested scroll; the page itself scrolls so
                  mobile users get native momentum scrolling. */}
              <div className="space-y-2 pr-1">
                {sortedPapers.slice(0, visibleCount).map((p) => (
                  <PaperCard
                    key={p.id}
                    paper={p}
                    selected={selectedIds.has(p.id)}
                    onToggleSelect={() => toggleSelect(p.id)}
                    onOpenDrawer={() => { setDrawerPaper(p); setDrawerOpen(true) }}
                    enableSwipe={enableSwipe}
                    onDelete={() => {
                      // Swipe-left → delete. Mirror the batch toolbar's confirm
                      // pattern so users get a safety net on mobile (where a
                      // stray swipe is easy). We reuse bulkDeleteMut with a
                      // single-id array — there's no separate single-paper
                      // delete endpoint, and bulk-delete is idempotent for
                      // arrays of any length.
                      const titlePreview = p.title.length > 48 ? `${p.title.slice(0, 48)}…` : p.title
                      if (confirm(t('papers.deleteConfirm', { title: titlePreview }))) {
                        bulkDeleteMut.mutate([p.id])
                      }
                    }}
                  />
                ))}
                {/* Skeleton placeholders shown while a background refetch is
                    in flight (e.g. filter/search/page change) but we still
                    have prior data on screen. Placed after the visible cards
                    so the user sees the existing content + a "loading more"
                    hint at the bottom, mirroring the Load-more affordance.
                    `isLoading` is false here (handled above), so this branch
                    only fires on `isFetching` with cached data. */}
                {isFetching && !isLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <PaperCardSkeleton key={`fetch-skel-${i}`} />
                  ))}
                {/* Infinite-scroll sentinel + explicit "Load more" fallback.
                    The sentinel triggers the IO observer when scrolled into
                    view; the button is a manual fallback for users with IO
                    quirks or who prefer explicit actions. Hidden while
                    refetch skeletons are showing to avoid a confusing
                    double-affordance. */}
                {hasMore && !isFetching && (
                  <div ref={sentinelRef} className="py-3 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleCount((c) => c + 20)}
                      className="min-h-[44px] text-xs gap-1.5"
                    >
                      <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                      {t('papers.loadMore', { remaining: sortedPapers.length - visibleCount })}
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div
              ref={tableScrollRef}
              className="max-h-[65vh] overflow-auto pr-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              {/* Sticky header — CSS-grid div mirroring the row template so
                  column widths line up exactly between header and rows. */}
              <div
                className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 grid items-center text-left text-slate-500 text-xs border-b border-slate-200 dark:border-slate-800"
                style={{ gridTemplateColumns }}
                role="row"
              >
                <div className="p-2" role="columnheader" />
                <div className="p-2 font-medium" role="columnheader">{t('papers.table.title')}</div>
                <div className="p-2 font-medium" role="columnheader">{t('papers.table.year')}</div>
                {isSm && (
                  <div className="p-2 font-medium" role="columnheader">{t('papers.table.authors')}</div>
                )}
                {isMd && (
                  <div className="p-2 font-medium" role="columnheader">{t('papers.table.source')}</div>
                )}
                <div className="p-2 font-medium text-right" role="columnheader">{t('papers.table.citations')}</div>
                <div className="p-2 font-medium" role="columnheader">{t('papers.table.synth')}</div>
                <div className="p-2 font-medium" role="columnheader">{t('papers.table.doi')}</div>
              </div>
              {/* Virtualized body — the inner div is sized to the total
                  scrollable height; each row is absolutely positioned at
                  its virtual offset so only visible rows are mounted. */}
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: 'relative',
                  width: '100%',
                }}
                role="rowgroup"
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const p = sortedPapers[virtualRow.index]
                  if (!p) return null
                  const cls = p.classification
                  const authors = p.authors ? p.authors.split(';')[0]?.trim() : ''
                  return (
                    <div
                      key={p.id}
                      role="row"
                      className={`absolute top-0 left-0 w-full grid items-center text-xs border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 ${selectedIds.has(p.id) ? 'bg-sky-50/50 dark:bg-sky-950/20' : ''}`}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        gridTemplateColumns,
                      }}
                    >
                      <div className="p-2" role="cell">
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                          aria-label={t('papers.select')}
                        />
                      </div>
                      <div className="p-2 min-w-0" role="cell">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Badge variant="outline" className="text-[10px] sm:text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900 shrink-0">
                            <FormulaViewer formula={p.material.name} size="sm" colorful={false} />
                          </Badge>
                          {/* P2-8: compact 中文 badge in the table view */}
                          {isChinesePaper(p) && (
                            <span
                              className="text-[10px] sm:text-[9px] px-1 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900 shrink-0 inline-flex items-center gap-0.5"
                              title={p.translatedTitle
                                ? t('papers.translatedAvailable')
                                : t('papers.translateForEnglish')}
                            >
                              <Languages className="w-2.5 h-2.5" />中
                            </span>
                          )}
                          <span
                            className="font-medium line-clamp-1 cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                            onClick={() => { setDrawerPaper(p); setDrawerOpen(true) }}
                            title={t('papers.detail.title')}
                          >
                            {p.title}
                          </span>
                        </div>
                        {/* P2-8: English translation shown beneath the title */}
                        {p.translatedTitle && p.translatedTitle.trim() && p.translatedTitle.trim() !== p.title.trim() && (
                          <p className="text-[11px] sm:text-[10px] text-slate-500 dark:text-slate-400 italic line-clamp-1 mt-0.5 ml-1">
                            ({p.translatedTitle})
                          </p>
                        )}
                      </div>
                      <div className="p-2 tabular-nums text-slate-500" role="cell">{p.year || '—'}</div>
                      {isSm && (
                        <div className="p-2 text-slate-500 line-clamp-1" role="cell">{authors}</div>
                      )}
                      {isMd && (
                        <div className="p-2" role="cell">
                          <span className="text-[11px] sm:text-[10px] px-1 rounded text-slate-500 bg-slate-100 dark:bg-slate-800">{p.source}</span>
                        </div>
                      )}
                      <div className="p-2 text-right tabular-nums text-slate-500" role="cell">{p.citationCount || 0}</div>
                      <div className="p-2" role="cell">
                        {cls && (
                          <span className={`text-[11px] sm:text-[10px] px-1.5 py-0.5 rounded ${cls.synthesized === 'yes' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : cls.synthesized === 'no' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                            {t(`common.${cls.synthesized}`)}
                          </span>
                        )}
                      </div>
                      <div className="p-2" role="cell">
                        {p.doi ? (
                          <a href={doiUrl(p.doi)} target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline text-xs">
                            DOI ↗
                          </a>
                        ) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {/* Pagination footer */}
          {!isLoading && !isFetching && papers.length > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={totalPapers}
              onPageChange={(p) => {
                setPage(p)
                // Scroll the paper list back to top on page change.
                if (typeof window !== 'undefined') {
                  window.requestAnimationFrame(() => {
                    const el = document.getElementById('papers-list-top')
                    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                  })
                }
              }}
              onPageSizeChange={(s) => {
                setPageSize(s)
                setPage(1)
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Paper detail drawer */}
      <PaperDrawer
        paper={drawerPaper}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onReclassify={(paperId) => drawerReclassifyMut.mutate(paperId)}
        onReextract={(paperId) => drawerReextractMut.mutate(paperId)}
        reclassifying={drawerReclassifyMut.isPending}
        reextracting={drawerReextractMut.isPending}
      />

      {/* DOI batch validation dialog */}
      <Dialog open={doiValidateOpen} onOpenChange={setDoiValidateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-rose-500" /> {t('papers.doi.title')}
            </DialogTitle>
            <DialogDescription>
              {t('papers.doi.dialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <DoiValidator
              paperIds={selectedIds.size > 0 ? Array.from(selectedIds) : undefined}
              onClose={() => setDoiValidateOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* G8: PDF upload + LLM extraction dialog — extracted to
          ./papers/upload-pdf-dialog.tsx (M1b). The dialog owns its
          file list, drag flag, target-material selector, and the
          per-file extraction fetch loop; it invalidates the papers
          query on success via useQueryClient. */}
      <UploadPdfDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        materials={materials}
      />

      {/* D4: Batch operation confirmation dialog — extracted to
          ./papers/batch-confirm-dialog.tsx (M1b). The dialog is a dumb
          presentation component; pendingBatch state + execute handler
          + bulkDelete/bulkReclassify mutation pending flags are passed
          in from this parent. */}
      <BatchConfirmDialog
        pendingBatch={pendingBatch}
        onClose={() => setPendingBatch(null)}
        onConfirm={executePendingBatch}
        isDeletePending={bulkDeleteMut.isPending}
        isClassifyPending={bulkReclassifyMut.isPending}
      />

      {/* Sticky bottom batch action bar — appears only when ≥1 paper is selected.
          Pinned to the viewport bottom so users don't have to scroll back to
          the top of the list to perform batch operations. */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            key="papers-batch-bar"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 z-40 px-3 sm:px-6 lg:px-8 pb-3 pointer-events-none"
          >
            <div className="max-w-[1400px] mx-auto pointer-events-auto">
              <div
                role="toolbar"
                aria-label={t('papers.bulk.toolbarAria')}
                className="flex flex-wrap items-center gap-2 p-2.5 sm:p-3 rounded-t-xl bg-background/95 backdrop-blur shadow-lg border border-b-0 border-slate-200 dark:border-slate-800"
              >
                <Badge
                  variant="outline"
                  className="gap-1.5 bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/50 dark:text-sky-200 dark:border-sky-800 shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('papers.bulk.selected', { n: selectedIds.size })}
                </Badge>

                {/* Action buttons: horizontally scrollable on small screens */}
                <div
                  className="flex items-center gap-2 flex-1 sm:flex-none overflow-x-auto sm:overflow-visible -mx-1 px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  role="group"
                  aria-label={t('papers.bulk.actionsAria')}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => prepareBatch('classify')}
                    disabled={bulkReclassifyMut.isPending}
                    className="h-11 min-h-[44px] border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 shrink-0"
                  >
                    {bulkReclassifyMut.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1.5" />
                    )}
                    <span className="text-xs">{t('papers.bulk.reclassify')}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => prepareBatch('delete')}
                    disabled={bulkDeleteMut.isPending}
                    className="h-11 min-h-[44px] border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 shrink-0"
                  >
                    {bulkDeleteMut.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1.5" />
                    )}
                    <span className="text-xs">{t('papers.bulk.delete')}</span>
                  </Button>
                </div>

                <div className="ml-auto flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set())}
                    className="h-11 min-h-[44px] px-3 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label={t('papers.bulk.clear')}
                    title={t('papers.bulk.clear')}
                  >
                    <span className="text-xs hidden sm:inline">{t('papers.bulk.clear')}</span>
                    <span className="text-xs sm:hidden">{t('papers.bulk.clearShort')}</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set())}
                    aria-label={t('papers.bulk.dismiss')}
                    title={t('papers.bulk.dismiss')}
                    className="h-11 w-11 min-h-[44px] min-w-[44px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* G1G2: BibTeX / RIS import dialog — extracted to
          ./papers/import-bibtex-dialog.tsx (M1b). The dialog owns its
          text content, material selector, result state, and the import
          mutation; invalidates papers/stats on success. */}
      <ImportBibtexDialog
        open={bibtexOpen}
        onOpenChange={setBibtexOpen}
        materials={materials}
      />

      {/* G1G2: DOI batch import dialog — extracted to
          ./papers/import-dois-dialog.tsx (M1b). The dialog owns its
          DOI text, material selector, result state, and the import
          mutation; invalidates papers/stats on success. */}
      <ImportDoisDialog
        open={doiImportOpen}
        onOpenChange={setDoiImportOpen}
        materials={materials}
      />

    </div>
  )
}
