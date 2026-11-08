'use client'

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Network as NetworkIcon,
  Loader2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  CircleDot,
  Scale,
  ThumbsUp,
  ThumbsDown,
  Minus,
  X,
  FileText,
  ChevronRight,
  FlaskConical,
  Zap,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'
import { useI18n } from '@/components/i18n/provider'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { TabValue } from '@/app/page'

// Category palette — per task spec (emerald / amber / sky / slate).
// "other" is slate-400 (#94a3b8), which reads as neutral grey in both
// light and dark themes.
const CATEGORY_COLORS: Record<string, string> = {
  perovskite: '#10b981',
  chalcogenide: '#f59e0b',
  oxide: '#0ea5e9',
  other: '#94a3b8',
}

// Edge color palette for the citation-context view mode (Scite-style).
//   supporting  → emerald solid   (#10b981, opacity 0.7)
//   disputing   → rose dashed      (#f43f5e, opacity 0.85, dasharray "4 3")
//   mentioning  → slate thin       (#64748b, opacity 0.35)
//   neutral/none → default grey    (#cbd5e1, opacity 0.2)
const CONTEXT_EDGE_STYLES = {
  supporting: { stroke: '#10b981', opacity: 0.7, width: 2.4, dasharray: '' },
  disputing: { stroke: '#f43f5e', opacity: 0.9, width: 2.8, dasharray: '5 3' },
  mentioning: { stroke: '#64748b', opacity: 0.4, width: 1, dasharray: '' },
  neutral: { stroke: '#cbd5e1', opacity: 0.2, width: 0.8, dasharray: '' },
  none: { stroke: '#cbd5e1', opacity: 0.2, width: 0.8, dasharray: '' },
} as const

type CitationContext = 'supporting' | 'disputing' | 'mentioning' | 'neutral'

interface ContextEntry {
  context: CitationContext
  reason: string
}

interface KGNode {
  id: string
  name: string
  category: string
  bandgap: number | null
  efficiency: number | null
  paperCount: number
}

interface KGEdge {
  source: string
  target: string
  weight: number
  reasons: string[]
}

interface KGResponse {
  nodes: KGNode[]
  edges: KGEdge[]
  generatedAt: string
}

/**
 * Material Knowledge Graph — a D3 force-directed graph of material-to-
 * material relationships. Edges encode shared chemistry, synthesis
 * method, bandgap similarity, or category. Nodes are sized by paper
 * count and colored by category.
 *
 * Interactions:
 *  - Drag a node to pin it (D3 drag sets fx/fy on the simulation).
 *  - Hover a node to highlight its neighbors + connecting edges; other
 *    nodes/edges fade.
 *  - Click a node to navigate to the Papers tab scoped to that material.
 *  - Scroll / pinch to zoom; drag the background to pan.
 *  - Reset view / zoom buttons restore the default transform.
 *
 * The D3 work runs in a lazy `import('d3')` so the (heavy) d3 bundle is
 * only loaded when this card mounts, mirroring the citation-network card.
 */
function KnowledgeGraph({
  onNavigate,
}: {
  onNavigate: (t: TabValue, materialId?: string) => void
}) {
  const { t } = useI18n()
  // P1-6 — mobile detection. Drives graph height, panel placement,
  // legend scroll behaviour, and label visibility. SSR-safe (false on
  // first render, then resolves to the real matchMedia value).
  const isMobile = useMediaQuery('(max-width: 640px)')
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    node: KGNode
    degree: number
  } | null>(null)
  // E3 — selected node for the Materials Project-style detail panel.
  // Clicking a node no longer navigates away; instead, it opens this
  // slide-in panel showing the material's stats, synthesis method, and a
  // list of all connected materials (with edge weight + reason). The
  // "View papers" button at the bottom performs the actual navigation.
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null)
  // P1-6 — mobile-only collapse state for the legend / view-mode / zoom
  // controls row. Defaults to closed so the graph gets maximum vertical
  // space on first paint; users tap "Show controls" to expand.
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false)
  // M2 — keyboard navigation state. `focusedNodeIndex` tracks which node
  // is currently keyboard-focused (null = no keyboard focus). It is
  // deliberately separate from `tooltip` (mouse hover) so the two input
  // modalities don't clobber each other — the user can be hovering one
  // node with the mouse while arrow-keying through others, and the
  // highlight effects layer rather than fight.
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number | null>(null)
  // M2 — toggled on container focus / blur so we can show a one-line
  // keyboard hint overlay (arrow keys / Enter / Escape) the moment the
  // SVG becomes keyboard-active.
  const [showKeyboardHint, setShowKeyboardHint] = useState(false)

  // i18n — kg.* keys live in src/components/i18n/provider.tsx
  const L = useMemo(
    () => ({
      title: t('kg.title'),
      desc: (n: number, e: number) => t('kg.desc', { n, e }),
      nodes: t('kg.nodes'),
      edges: t('kg.edges'),
      zoom: t('kg.zoom'),
      resetView: t('kg.resetView'),
      loading: t('kg.loading'),
      empty: t('kg.empty'),
      legend: t('kg.legend'),
      perovskite: t('kg.cat.perovskite'),
      chalcogenide: t('kg.cat.chalcogenide'),
      oxide: t('kg.cat.oxide'),
      other: t('kg.cat.other'),
      bandgap: t('kg.bandgap'),
      efficiency: t('kg.efficiency'),
      papers: t('kg.papers'),
      degree: t('kg.degree'),
      clickHint: t('kg.clickHint'),
      // Citation-context view mode labels
      modeRelationship: t('kg.modeRelationship'),
      modeContext: t('kg.modeContext'),
      modeRelHint: t('kg.modeRelHint'),
      modeCtxHint: t('kg.modeCtxHint'),
      ctxLoading: t('kg.ctxLoading'),
      ctxEmpty: t('kg.ctxEmpty'),
      ctxAnalyzeBtn: t('kg.ctxAnalyzeBtn'),
      ctxAnalyzed: t('kg.ctxAnalyzed'),
      ctxMissing: t('kg.ctxMissing'),
      ctxLegendSupporting: t('kg.ctxLegendSupporting'),
      ctxLegendDisputing: t('kg.ctxLegendDisputing'),
      ctxLegendMentioning: t('kg.ctxLegendMentioning'),
      // E3 — detail panel labels
      panelTitle: t('kg.panelTitle'),
      panelClose: t('kg.panelClose'),
      viewPapers: t('kg.viewPapers'),
      connections: t('kg.connections'),
      weight: t('kg.weight'),
      synthesisMethod: t('kg.synthesisMethod'),
      noSynthMethod: t('kg.noSynthMethod'),
      noConnections: t('kg.noConnections'),
      clickConnectionHint: t('kg.clickConnectionHint'),
      panelHint: t('kg.panelHint'),
      // M2 — keyboard navigation hint shown when the SVG container
      // receives keyboard focus (Tab or click-into). Lets screen-reader
      // and keyboard users know the graph is arrow-key navigable.
      keyboardHint: t('kg.keyboardHint'),
      // P1-6 — mobile-specific labels
      mobileFilters: t('kg.mobileFilters'),
      mobileFiltersOpen: t('kg.mobileFiltersOpen'),
      mobileFiltersClose: t('kg.mobileFiltersClose'),
    }),
    [t],
  )

  const categoryLabel = (cat: string) =>
    cat === 'perovskite'
      ? L.perovskite
      : cat === 'chalcogenide'
        ? L.chalcogenide
        : cat === 'oxide'
          ? L.oxide
          : L.other

  const { data, isLoading } = useQuery<KGResponse>({
    queryKey: QUERY_KEYS.knowledgeGraph,
    queryFn: () => api<KGResponse>('/api/knowledge-graph'),
    // DB-only query (fast, no LLM) — keep immediate but cache for 5 min
    // instead of re-fetching every 60s. Removed refetchInterval to stop
    // wasteful periodic polling.
    staleTime: STALE_TIMES.knowledgeGraph,
  })

  // ─── Scite-style citation context view mode ───────────────────────────
  // When the user toggles to "Citation context", we fetch every paper
  // belonging to the materials currently in the graph, look up their cached
  // citation contexts via GET /api/classify/context, and aggregate per edge:
  //   - any disputing paper on either endpoint → edge becomes "disputing"
  //   - else any supporting → "supporting"
  //   - else only mentioning (no neutral) → "mentioning"
  //   - else default grey
  //
  // Contexts are computed by POST /api/classify/context (typically triggered
  // from the Classification tab) and cached server-side for 1h, so reading
  // them here is essentially free.
  const [viewMode, setViewMode] = useState<'relationship' | 'context'>('relationship')
  const [contextMap, setContextMap] = useState<Record<string, ContextEntry>>({})
  const [materialPapers, setMaterialPapers] = useState<Record<string, string[]>>({})
  const [contextLoading, setContextLoading] = useState(false)
  const [contextMissing, setContextMissing] = useState(0)
  const [contextAnalyzing, setContextAnalyzing] = useState(false)

  const nodeIds = useMemo(() => new Set((data?.nodes ?? []).map((n) => n.id)), [data])

  /**
   * Fetch paper IDs grouped by material for the materials in the current
   * graph, then look up cached citation contexts. Papers with no cached
   * context are counted in `contextMissing` so the UI can offer a "run
   * analysis" button.
   *
   * PERF-3 — previously this called `/api/papers?limit=500` and filtered
   * client-side to the ~20 materials in the graph (downloading ~500 full
   * paper objects just to read their ids). The dedicated summary endpoint
   * does that aggregation server-side and returns only the (materialId,
   * paperIds[]) pairs for the materials we actually care about.
   */
  const loadContexts = useCallback(async () => {
    if (!data || data.nodes.length === 0) return
    setContextLoading(true)
    try {
      // /api/papers/summary?groupBy=material&materialIds=… returns
      // [{ materialId, paperIds: string[] }] — only the IDs we need,
      // server-side filtered to the materials in the current graph.
      const idsParam = encodeURIComponent(Array.from(nodeIds).join(','))
      const summary = await api<Array<{ materialId: string; paperIds: string[] }>>(
        `/api/papers/summary?groupBy=material&materialIds=${idsParam}`,
      )
      const byMaterial: Record<string, string[]> = {}
      const allIds: string[] = []
      for (const g of summary) {
        if (!nodeIds.has(g.materialId)) continue
        byMaterial[g.materialId] = g.paperIds
        for (const pid of g.paperIds) allIds.push(pid)
      }
      setMaterialPapers(byMaterial)
      if (allIds.length === 0) {
        setContextMap({})
        setContextMissing(0)
        return
      }
      // GET endpoint accepts up to 50 paperIds per request.
      const BATCH = 50
      const newMap: Record<string, ContextEntry> = {}
      let missing = 0
      for (let i = 0; i < allIds.length; i += BATCH) {
        const slice = allIds.slice(i, i + BATCH)
        const resp = await api<{
          results: Array<{ paperId: string; context: CitationContext; reason: string }>
        }>(`/api/classify/context?paperIds=${encodeURIComponent(slice.join(','))}`)
        for (const r of resp.results) {
          if (r.reason === 'Not yet analyzed' || r.reason === 'Paper not found') {
            missing++
            // Don't store — leave it as "missing" so the edge aggregation
            // treats it as 'none' rather than 'neutral'.
            continue
          }
          newMap[r.paperId] = { context: r.context, reason: r.reason }
        }
      }
      setContextMap(newMap)
      setContextMissing(missing)
    } catch {
      // Network/parse errors — leave contextMap empty; the UI will show
      // the "no data" hint with a manual analyze button.
      setContextMap({})
      setContextMissing(0)
    } finally {
      setContextLoading(false)
    }
  }, [data, nodeIds])

  // Auto-load when the user switches to context mode (only once per data
  // change — loadContexts is memoized on data/nodeIds).
  useEffect(() => {
    if (viewMode === 'context' && data && data.nodes.length > 0 && !contextLoading && Object.keys(contextMap).length === 0 && Object.keys(materialPapers).length === 0) {
      void loadContexts()
    }
  }, [viewMode, data, contextLoading, contextMap, materialPapers, loadContexts])

  /**
   * Run POST /api/classify/context in batches of 20 for every paper in the
   * graph that isn't already cached. Surfaces a "running…" badge while in
   * flight and refreshes the read cache when done.
   */
  const runAnalysis = useCallback(async () => {
    if (!data) return
    setContextAnalyzing(true)
    try {
      // Make sure we have the full paper list first.
      let byMat = materialPapers
      if (Object.keys(byMat).length === 0) {
        // PERF-3 — same lightweight summary endpoint as loadContexts.
        // Returns only (materialId, paperIds[]) for the materials in
        // the graph — no abstracts/titles/authors shipped over the wire.
        const idsParam = encodeURIComponent(Array.from(nodeIds).join(','))
        const summary = await api<Array<{ materialId: string; paperIds: string[] }>>(
          `/api/papers/summary?groupBy=material&materialIds=${idsParam}`,
        )
        byMat = {}
        for (const g of summary) {
          if (!nodeIds.has(g.materialId)) continue
          byMat[g.materialId] = g.paperIds
        }
        setMaterialPapers(byMat)
      }
      const allIds = Object.values(byMat).flat()
      const chunks: string[][] = []
      for (let i = 0; i < allIds.length; i += 20) {
        chunks.push(allIds.slice(i, i + 20))
      }
      await Promise.all(
        chunks.map(async (chunk) => {
          await api<{
            results: Array<{ paperId: string; context: CitationContext; reason: string }>
          }>('/api/classify/context', {
            method: 'POST',
            body: JSON.stringify({ paperIds: chunk }),
          })
        }),
      )
      // Reload the read cache now that everything is computed.
      await loadContexts()
    } catch {
      // ignore — loadContexts will surface whatever it can find
    } finally {
      setContextAnalyzing(false)
    }
  }, [data, materialPapers, nodeIds, loadContexts])

  /**
   * Aggregate per-edge citation context by reading contexts of every paper
   * attached to either endpoint material. Returns the strongest signal:
   *   disputing > supporting > mentioning > neutral/none
   * (disputing wins because a single contradiction is the most
   * scientifically interesting signal — Scite.ai's disputes are rare and
   * high-value).
   */
  const edgeContexts = useMemo(() => {
    const map = new Map<string, 'supporting' | 'disputing' | 'mentioning' | 'neutral' | 'none'>()
    if (!data) return map
    for (const e of data.edges) {
      const papersA = materialPapers[e.source] ?? []
      const papersB = materialPapers[e.target] ?? []
      const allPapers = [...papersA, ...papersB]
      let hasDisputing = false
      let hasSupporting = false
      let hasMentioning = false
      let hasAny = false
      for (const pid of allPapers) {
        const entry = contextMap[pid]
        if (!entry) continue
        hasAny = true
        if (entry.context === 'disputing') hasDisputing = true
        else if (entry.context === 'supporting') hasSupporting = true
        else if (entry.context === 'mentioning') hasMentioning = true
      }
      const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`
      if (!hasAny) map.set(key, 'none')
      else if (hasDisputing) map.set(key, 'disputing')
      else if (hasSupporting) map.set(key, 'supporting')
      else if (hasMentioning) map.set(key, 'mentioning')
      else map.set(key, 'neutral')
    }
    return map
  }, [data, materialPapers, contextMap])

  const analyzedCount = useMemo(() => Object.keys(contextMap).length, [contextMap])

  // ─── E3: Materials Project-style detail panel ────────────────────────
  // When the user clicks a node we open a slide-in panel (right side of
  // the graph container) showing the material's key stats, its synthesis
  // method (looked up via /api/materials?full=true on demand), and a list
  // of every other material it connects to (with edge weight + the
  // human-readable reason string the server already attached).
  //
  // The materials-full query is gated on `selectedNode` so we don't fire
  // it on initial mount; TanStack Query caches the result for 5 min so
  // re-opening the panel for the same node is instant.
  const { data: materialsFull, isLoading: synthLoading } = useQuery<{
    materials: Array<{
      id: string
      name: string
      aliases: string
      category: string
      notes: string
      tags: string
      classifications: Array<{ synthesisMethod: string; bandgapValue: string }>
      efficiencies: Array<{ efficiencyValue: number }>
      _count: { papers: number }
    }>
  }>({
    queryKey: ['materials-full-kg'],
    queryFn: () => api('/api/materials?full=true'),
    enabled: !!selectedNode,
    staleTime: STALE_TIMES.knowledgeGraph,
  })

  // Build materialId → synthesisMethod (and bandgapValue fallback) so the
  // panel can show the synthesis method for the selected node and for any
  // connection without re-fetching.
  const synthByMaterial = useMemo(() => {
    const m = new Map<string, string>()
    for (const mat of materialsFull?.materials ?? []) {
      const c = mat.classifications?.[0]
      if (c?.synthesisMethod && c.synthesisMethod.trim()) {
        m.set(mat.id, c.synthesisMethod.trim())
      }
    }
    return m
  }, [materialsFull])

  // Alias lookup so the panel can show alternative names for the material.
  const aliasesByMaterial = useMemo(() => {
    const m = new Map<string, string>()
    for (const mat of materialsFull?.materials ?? []) {
      if (mat.aliases?.trim()) m.set(mat.id, mat.aliases.trim())
    }
    return m
  }, [materialsFull])

  // All connections for the selected node, sorted by weight desc. Each
  // entry carries the *other* node + the edge weight + the reason string
  // the server already attached (e.g. "shares I, Pb" or "bandgap Δ=0.05 eV").
  const connections = useMemo(() => {
    if (!selectedNode || !data) return [] as Array<{ node: KGNode; weight: number; reasons: string[] }>
    const others: Array<{ node: KGNode; weight: number; reasons: string[] }> = []
    const nodeMap = new Map(data.nodes.map((n) => [n.id, n]))
    for (const e of data.edges) {
      if (e.source === selectedNode.id || e.target === selectedNode.id) {
        const otherId = e.source === selectedNode.id ? e.target : e.source
        const other = nodeMap.get(otherId)
        if (other) {
          others.push({ node: other, weight: e.weight, reasons: e.reasons })
        }
      }
    }
    others.sort((a, b) => b.weight - a.weight)
    return others
  }, [selectedNode, data])

  const resetView = useCallback(() => {
    if (!svgRef.current) return
    import('d3').then((d3) => {
      // D3 zoom transform on a transition needs an explicit `call(zoom.transform, identity)`
      // which TS can't express — cast through the same shape as citation-network.
      ;(
        d3.select(svgRef.current).transition().duration(500) as unknown as {
          call: (fn: unknown, ...args: unknown[]) => void
        }
      ).call(d3.zoom().transform, d3.zoomIdentity)
      setZoom(1)
    })
  }, [])

  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current) return
    import('d3').then((d3) => {
      ;(
        d3.select(svgRef.current).transition().duration(300) as unknown as {
          call: (fn: unknown, ...args: unknown[]) => void
        }
      ).call(d3.zoom().scaleBy, factor)
    })
  }, [])

  // Main D3 render effect — re-runs when data changes.
  useEffect(() => {
    if (!data || data.nodes.length === 0 || !svgRef.current) return
    let cancelled = false
    let simulation: { stop: () => void } | null = null

    import('d3').then((d3) => {
      if (cancelled || !svgRef.current) return
      const svg = d3.select(svgRef.current)
      svg.selectAll('*').remove()
      svg.on('zoom', null)

      const width = svgRef.current.clientWidth || 600
      // P1-6 — shrink graph height on mobile so the card doesn't push
      // the rest of the dashboard below the fold. The D3 simulation,
      // zoom, and drag behaviors all key off `height` so they adapt
      // automatically.
      const height = isMobile ? 300 : 400
      const cx = width / 2
      const cy = height / 2

      // Wrapper group — zoom transform applies to this, not individual layers
      const g = svg.append('g').attr('class', 'zoom-layer')

      const color = (d: KGNode) => CATEGORY_COLORS[d.category] || '#94a3b8'
      const maxPapers = Math.max(...data.nodes.map((n) => n.paperCount), 1)
      // Node radius scales from 5 to 18 px based on paperCount.
      const radius = (d: KGNode) => 5 + (d.paperCount / maxPapers) * 13

      // Mutable node copies — D3 will assign x/y during simulation.
      const nodeData: (KGNode & {
        x?: number
        y?: number
        fx?: number | null
        fy?: number | null
      })[] = data.nodes.map((n) => ({ ...n }))
      const nodeMap = new Map(nodeData.map((n) => [n.id, n]))

      const links = data.edges
        .filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target))
        .map((l) => ({
          source: l.source,
          target: l.target,
          weight: l.weight,
          reasons: l.reasons,
        }))

      // Adjacency for hover highlight + degree in tooltip
      const adjacency = new Map<string, Set<string>>()
      for (const l of links) {
        if (!adjacency.has(l.source)) adjacency.set(l.source, new Set())
        if (!adjacency.has(l.target)) adjacency.set(l.target, new Set())
        adjacency.get(l.source)!.add(l.target)
        adjacency.get(l.target)!.add(l.source)
      }

      // D3 mutates link.source / link.target into node references during
      // forceSimulation — these helpers extract the id back out either way.
      const linkSourceId = (l: { source: string | { id?: string } }) =>
        typeof l.source === 'string' ? l.source : (l.source as { id?: string }).id || ''
      const linkTargetId = (l: { target: string | { id?: string } }) =>
        typeof l.target === 'string' ? l.target : (l.target as { id?: string }).id || ''

      const maxWeight = Math.max(...links.map((l) => l.weight), 1)

      // Edge styling — depends on the active view mode.
      //   relationship: weight-based grey scale (default)
      //   context:      Scite-style — disputing=red dashed, supporting=emerald,
      //                 mentioning=slate thin, otherwise default grey
      // edgeContexts is a Map keyed by "a|b" (a<b by id) → context label.
      const edgeKey = (s: string, t: string) => (s < t ? `${s}|${t}` : `${t}|${s}`)
      const edgeCtxFor = (s: string, t: string) => edgeContexts.get(edgeKey(s, t)) ?? 'none'

      type LinkStyle = { stroke: string; opacity: number; width: number; dasharray: string }
      const baseLinkStyle = (w: number): LinkStyle => ({
        stroke: '#cbd5e1',
        opacity: 0.15 + 0.5 * (w / maxWeight),
        width: Math.max(0.6, 1 + 2 * (w / maxWeight)),
        dasharray: '',
      })
      const contextLinkStyle = (s: string, t: string): LinkStyle => {
        const ctx = edgeCtxFor(s, t)
        const style = CONTEXT_EDGE_STYLES[ctx as keyof typeof CONTEXT_EDGE_STYLES] ?? CONTEXT_EDGE_STYLES.none
        return { stroke: style.stroke, opacity: style.opacity, width: style.width, dasharray: style.dasharray }
      }
      const linkStyleFor = (s: string, t: string, w: number): LinkStyle =>
        viewMode === 'context' ? contextLinkStyle(s, t) : baseLinkStyle(w)

      // ---------- Edges ----------
      const linkG = g.append('g').attr('class', 'links')
      const link = linkG
        .selectAll<SVGLineElement, typeof links[number]>('line')
        .data(links)
        .join('line')
        .attr('stroke', (d) => linkStyleFor(d.source as string, d.target as string, d.weight).stroke)
        .attr('stroke-opacity', (d) => linkStyleFor(d.source as string, d.target as string, d.weight).opacity)
        .attr('stroke-width', (d) => linkStyleFor(d.source as string, d.target as string, d.weight).width)
        .attr('stroke-dasharray', (d) => linkStyleFor(d.source as string, d.target as string, d.weight).dasharray)
        .attr('stroke-linecap', 'round')

      // ---------- Nodes ----------
      const nodeG = g.append('g').attr('class', 'nodes')
      const node = nodeG
        .selectAll<SVGCircleElement, typeof nodeData[number]>('circle')
        .data(nodeData)
        .join('circle')
        .attr('class', 'node-circle')
        .attr('r', (d) => radius(d))
        .attr('fill', (d) => color(d))
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        // E3 — open the detail panel instead of navigating away. The
        // "View papers" button inside the panel performs the navigation.
        .on('click', (_e, d) => setSelectedNode(d as KGNode))

      // Hover — tooltip + highlight
      node
        .on('mouseenter', (event, d) => {
          const n = d as KGNode
          highlightNode(n)
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            const degree = adjacency.get(n.id)?.size ?? 0
            setTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              node: n,
              degree,
            })
          }
        })
        .on('mousemove', (event, d) => {
          const n = d as KGNode
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            const degree = adjacency.get(n.id)?.size ?? 0
            setTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              node: n,
              degree,
            })
          }
        })
        .on('mouseleave', () => {
          clearHighlight()
          setTooltip(null)
        })

      // Labels — shown only for hovered node + its neighbors.
      const label = g
        .append('g')
        .attr('class', 'labels')
        .selectAll<SVGTextElement, typeof nodeData[number]>('text')
        .data(nodeData)
        .join('text')
        .text((d) => (d.name.length > 18 ? d.name.slice(0, 15) + '…' : d.name))
        .attr('font-size', 10)
        .attr('font-weight', 600)
        .attr('fill', '#334155')
        .attr('text-anchor', 'middle')
        .attr('pointer-events', 'none')
        .attr('opacity', 0)

      function highlightNode(n: KGNode) {
        const neighbors = adjacency.get(n.id) || new Set<string>()
        neighbors.add(n.id)
        node
          .attr('stroke-width', (d) =>
            (d as KGNode).id === n.id ? 3.5 : neighbors.has((d as KGNode).id) ? 2 : 1.5,
          )
          .attr('stroke', (d) => ((d as KGNode).id === n.id ? '#0f172a' : '#fff'))
          .attr('opacity', (d) => (neighbors.has((d as KGNode).id) ? 1 : 0.2))
        link
          .attr('stroke-opacity', (d) => {
            const s = linkSourceId(d as { source: string | { id?: string } })
            const t = linkTargetId(d as { target: string | { id?: string } })
            if (s === n.id || t === n.id) return 0.95
            // Preserve context colors but dim non-incident edges heavily.
            return viewMode === 'context' ? 0.04 : 0.05
          })
          .attr('stroke', (d) => {
            const s = linkSourceId(d as { source: string | { id?: string } })
            const t = linkTargetId(d as { target: string | { id?: string } })
            if (s === n.id || t === n.id) {
              // Highlighted edge: use the context color if available, else
              // a strong slate so it stands out in either mode.
              if (viewMode === 'context') {
                return contextLinkStyle(s, t).stroke
              }
              return '#475569'
            }
            return linkStyleFor(s, t, (d as { weight: number }).weight).stroke
          })
          .attr('stroke-width', (d) => {
            const s = linkSourceId(d as { source: string | { id?: string } })
            const t = linkTargetId(d as { target: string | { id?: string } })
            const w = (d as { weight: number }).weight
            if (s === n.id || t === n.id) {
              return viewMode === 'context'
                ? Math.max(2.8, contextLinkStyle(s, t).width + 1)
                : 2.5
            }
            return linkStyleFor(s, t, w).width
          })
          .attr('stroke-dasharray', (d) => {
            const s = linkSourceId(d as { source: string | { id?: string } })
            const t = linkTargetId(d as { target: string | { id?: string } })
            return linkStyleFor(s, t, (d as { weight: number }).weight).dasharray
          })
        label.attr('opacity', (d) => (neighbors.has((d as KGNode).id) ? 1 : 0))
      }

      function clearHighlight() {
        node.attr('stroke-width', 1.5).attr('stroke', '#fff').attr('opacity', 1)
        link
          .attr('stroke-opacity', (d) => linkStyleFor(
            linkSourceId(d as { source: string | { id?: string } }),
            linkTargetId(d as { target: string | { id?: string } }),
            (d as { weight: number }).weight,
          ).opacity)
          .attr('stroke', (d) => linkStyleFor(
            linkSourceId(d as { source: string | { id?: string } }),
            linkTargetId(d as { target: string | { id?: string } }),
            (d as { weight: number }).weight,
          ).stroke)
          .attr('stroke-width', (d) => linkStyleFor(
            linkSourceId(d as { source: string | { id?: string } }),
            linkTargetId(d as { target: string | { id?: string } }),
            (d as { weight: number }).weight,
          ).width)
          .attr('stroke-dasharray', (d) => linkStyleFor(
            linkSourceId(d as { source: string | { id?: string } }),
            linkTargetId(d as { target: string | { id?: string } }),
            (d as { weight: number }).weight,
          ).dasharray)
        label.attr('opacity', 0)
      }

      // ---------- Force simulation ----------
      const sim = d3
        .forceSimulation(nodeData as unknown as d3.SimulationNodeDatum[])
        .force(
          'link',
          d3
            .forceLink(links as unknown as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
            .id((d: unknown) => (d as KGNode).id)
            .distance(70)
            .strength(0.3),
        )
        .force('charge', d3.forceManyBody().strength(-120))
        .force('center', d3.forceCenter(cx, cy))
        .force(
          'collision',
          d3.forceCollide<d3.SimulationNodeDatum>().radius((d) => radius(d as unknown as KGNode) + 2),
        )
        .alpha(1)
        .alphaDecay(0.045)

      sim.on('tick', () => {
        const tickLink = (d: unknown) =>
          (d as unknown as { source: { x: number; y: number } }).source
        const tickTarget = (d: unknown) =>
          (d as unknown as { target: { x: number; y: number } }).target
        link
          .attr('x1', (d) => tickLink(d).x)
          .attr('y1', (d) => tickLink(d).y)
          .attr('x2', (d) => tickTarget(d).x)
          .attr('y2', (d) => tickTarget(d).y)
        node
          .attr('cx', (d) => (d as unknown as { x: number }).x)
          .attr('cy', (d) => (d as unknown as { y: number }).y)
        label
          .attr('x', (d) => (d as unknown as { x: number }).x)
          .attr('y', (d) => (d as unknown as { x: number; y: number }).y - radius(d as unknown as KGNode) - 5)
      })
      simulation = sim

      // ---------- Drag ----------
      const drag = d3
        .drag<
          SVGCircleElement,
          KGNode & { x?: number; y?: number; fx?: number | null; fy?: number | null }
        >()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart()
          d.fx = (d as { x?: number }).x ?? null
          d.fy = (d as { y?: number }).y ?? null
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      node.call(drag)

      // ---------- Zoom & pan ----------
      // P1-6 — `.touchable(true)` forces D3 to bind touch event handlers
      // so pinch-to-zoom works on mobile (the default probes
      // `navigator.maxTouchPoints`, which is reliable on real devices
      // but not on every emulator). The SVG also carries `touch-none`
      // so the browser doesn't intercept the gesture for scrolling.
      const zoomBehavior = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .touchable(true)
        .on('zoom', (event) => {
          g.attr('transform', event.transform)
          setZoom(event.transform.k)
        })
      svg.call(zoomBehavior)
    })

    return () => {
      cancelled = true
      if (simulation) simulation.stop()
    }
  }, [data, onNavigate, viewMode, edgeContexts, isMobile])

  // P1-6 — mobile label-on-tap. On touch devices `mouseenter` never
  // fires, so the default label-on-hover UX is broken. We re-purpose
  // the detail-panel selection as the "show me this node's label" signal:
  // when the user taps a node, its label appears next to the circle
  // (and all other labels stay hidden). Clearing the panel hides it
  // again. On desktop this effect is a no-op so hover behaviour is
  // unchanged.
  useEffect(() => {
    if (!isMobile || !svgRef.current) return
    import('d3').then((d3) => {
      if (!svgRef.current) return
      d3.select(svgRef.current)
        .selectAll<SVGTextElement, KGNode>('text')
        .attr('opacity', (d) =>
          selectedNode && (d as KGNode).id === selectedNode.id ? 1 : 0,
        )
    })
  }, [isMobile, selectedNode])

  // M2 — Apply keyboard-focus highlight to the focused node's circle +
  // label. Re-runs when `tooltip` (mouse hover state) changes too so the
  // highlight is restored after a `mouseleave` clears it via the in-D3
  // `clearHighlight` closure. Mouse and keyboard use separate React
  // state but share the same SVG, so we re-apply the keyboard styling
  // whenever the mouse finishes its hover cycle.
  useEffect(() => {
    if (!svgRef.current) return
    const liveNodes = data?.nodes ?? []
    const focusedId =
      focusedNodeIndex != null ? liveNodes[focusedNodeIndex]?.id : null
    import('d3').then((d3) => {
      if (!svgRef.current) return
      const svg = d3.select(svgRef.current)
      svg
        .selectAll<SVGCircleElement, KGNode>('circle.node-circle')
        .attr('stroke-width', (d) =>
          focusedId && (d as KGNode).id === focusedId ? 3.5 : 1.5,
        )
        .attr('stroke', (d) =>
          focusedId && (d as KGNode).id === focusedId ? '#0f172a' : '#fff',
        )
      svg
        .selectAll<SVGTextElement, KGNode>('text')
        .attr('opacity', (d) =>
          focusedId && (d as KGNode).id === focusedId ? 1 : 0,
        )
    })
  }, [focusedNodeIndex, data, tooltip])

  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []

  // M2 — keyboard event handler bound to the SVG container div. Arrow
  // keys cycle through `nodes` (mod len), Enter/Space opens the same
  // detail panel a click would, Escape closes the panel + clears focus.
  // `preventDefault` stops the page from scrolling while the user is
  // arrow-keying through the graph.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (nodes.length === 0) return
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault()
          setFocusedNodeIndex((prev) =>
            prev == null ? 0 : (prev + 1) % nodes.length,
          )
          break
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault()
          setFocusedNodeIndex((prev) =>
            prev == null
              ? nodes.length - 1
              : (prev - 1 + nodes.length) % nodes.length,
          )
          break
        }
        case 'Enter':
        case ' ': {
          e.preventDefault()
          if (focusedNodeIndex != null && nodes[focusedNodeIndex]) {
            setSelectedNode(nodes[focusedNodeIndex])
          }
          break
        }
        case 'Escape': {
          e.preventDefault()
          setSelectedNode(null)
          setFocusedNodeIndex(null)
          break
        }
      }
    },
    [nodes, focusedNodeIndex],
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <NetworkIcon className="w-4 h-4 text-emerald-500" /> {L.title}
            </CardTitle>
            <CardDescription className="mt-1">
              {L.desc(nodes.length, edges.length)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="outline" className="text-[10px] sm:text-[9px]">
              {nodes.length} {L.nodes}
            </Badge>
            <Badge variant="outline" className="text-[10px] sm:text-[9px]">
              {edges.length} {L.edges}
            </Badge>
            <Badge variant="outline" className="text-[10px] sm:text-[9px]">
              {L.zoom} {zoom.toFixed(1)}x
            </Badge>
          </div>
        </div>

        {/* Legend + controls.
            P1-6 — on mobile, this row collapses into a horizontally
            scrollable strip (legend + view-mode + zoom + reset). A
            "Show controls" toggle hides it entirely so the graph gets
            maximum vertical space. */}
        {isMobile ? (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMobileControlsOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 h-11 px-2 -mx-2 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              aria-expanded={mobileControlsOpen}
              aria-controls="kg-mobile-controls"
            >
              <span className="inline-flex items-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5 text-slate-400" />
                {L.mobileFilters}
                {viewMode === 'context' && (
                  <Badge variant="outline" className="text-[10px] sm:text-[9px] ml-1 gap-0.5 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">
                    <Scale className="w-2.5 h-2.5" />
                    {analyzedCount > 0
                      ? L.ctxAnalyzed.replace('{n}', String(analyzedCount))
                      : L.modeContext}
                  </Badge>
                )}
              </span>
              <span className="text-[11px] sm:text-[10px] text-slate-400 inline-flex items-center gap-1">
                {mobileControlsOpen ? L.mobileFiltersClose : L.mobileFiltersOpen}
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${mobileControlsOpen ? 'rotate-90' : ''}`} />
              </span>
            </button>
            {mobileControlsOpen && (
              <div
                id="kg-mobile-controls"
                className="flex items-center gap-2 mt-2 overflow-x-auto pb-2 flex-nowrap [scrollbar-width:thin]"
              >
                <span className="text-[11px] sm:text-[10px] text-slate-400 inline-flex items-center gap-1 shrink-0">
                  <CircleDot className="w-3 h-3" /> {L.legend}:
                </span>
                {viewMode === 'relationship'
                  ? Object.entries(CATEGORY_COLORS).map(([cat, c]) => (
                      <div key={cat} className="flex items-center gap-1 text-[11px] sm:text-[10px] shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                        <span className="text-slate-500 capitalize">{categoryLabel(cat)}</span>
                      </div>
                    ))
                  : (
                    <>
                      <div className="flex items-center gap-1 text-[11px] sm:text-[10px] shrink-0">
                        <span className="w-4 h-0.5 bg-emerald-500" />
                        <ThumbsUp className="w-2.5 h-2.5 text-emerald-600" />
                        <span className="text-slate-500">{L.ctxLegendSupporting}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] sm:text-[10px] shrink-0">
                        <svg width="16" height="2" className="overflow-visible">
                          <line x1="0" y1="1" x2="16" y2="1" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="3 2" />
                        </svg>
                        <ThumbsDown className="w-2.5 h-2.5 text-rose-600" />
                        <span className="text-slate-500">{L.ctxLegendDisputing}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] sm:text-[10px] shrink-0">
                        <span className="w-4 h-px bg-slate-500" />
                        <Minus className="w-2.5 h-2.5 text-slate-500" />
                        <span className="text-slate-500">{L.ctxLegendMentioning}</span>
                      </div>
                    </>
                  )}
                {/* View-mode toggle (mobile) */}
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <Button
                    variant={viewMode === 'relationship' ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 text-[11px] sm:text-[10px] px-2"
                    onClick={() => setViewMode('relationship')}
                    title={L.modeRelHint}
                  >
                    <NetworkIcon className="w-3 h-3 mr-1" />
                    {L.modeRelationship}
                  </Button>
                  <Button
                    variant={viewMode === 'context' ? 'default' : 'outline'}
                    size="sm"
                    className={`h-9 text-[11px] sm:text-[10px] px-2 ${viewMode === 'context' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                    onClick={() => setViewMode('context')}
                    title={L.modeCtxHint}
                  >
                    <Scale className="w-3 h-3 mr-1" />
                    {L.modeContext}
                  </Button>
                </div>
                {/* Zoom controls (mobile) — 36px tap targets, still inside the scroll strip */}
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => zoomBy(1.2)}
                    title={t('kg.zoomIn')}
                    aria-label={t('kg.zoomIn')}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => zoomBy(1 / 1.2)}
                    title={t('kg.zoomOut')}
                    aria-label={t('kg.zoomOut')}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] sm:text-[10px] text-slate-400 inline-flex items-center gap-1">
            <CircleDot className="w-3 h-3" /> {L.legend}:
          </span>
          {viewMode === 'relationship' ? (
            Object.entries(CATEGORY_COLORS).map(([cat, c]) => (
              <div key={cat} className="flex items-center gap-1 text-[11px] sm:text-[10px]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-slate-500 capitalize">{categoryLabel(cat)}</span>
              </div>
            ))
          ) : (
            // Context-mode legend: shows the 3 meaningful edge colors.
            <>
              <div className="flex items-center gap-1 text-[11px] sm:text-[10px]">
                <span className="w-4 h-0.5 bg-emerald-500" />
                <ThumbsUp className="w-2.5 h-2.5 text-emerald-600" />
                <span className="text-slate-500">{L.ctxLegendSupporting}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] sm:text-[10px]">
                <svg width="16" height="2" className="overflow-visible">
                  <line x1="0" y1="1" x2="16" y2="1" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="3 2" />
                </svg>
                <ThumbsDown className="w-2.5 h-2.5 text-rose-600" />
                <span className="text-slate-500">{L.ctxLegendDisputing}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] sm:text-[10px]">
                <span className="w-4 h-px bg-slate-500" />
                <Minus className="w-2.5 h-2.5 text-slate-500" />
                <span className="text-slate-500">{L.ctxLegendMentioning}</span>
              </div>
            </>
          )}
          <div className="flex-1" />
          {/* View-mode toggle */}
          <div className="flex items-center gap-1 mr-1">
            <Button
              variant={viewMode === 'relationship' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-[11px] sm:text-[10px] px-2"
              onClick={() => setViewMode('relationship')}
              title={L.modeRelHint}
            >
              <NetworkIcon className="w-3 h-3 mr-1" />
              {L.modeRelationship}
            </Button>
            <Button
              variant={viewMode === 'context' ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-[11px] sm:text-[10px] px-2 ${viewMode === 'context' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
              onClick={() => setViewMode('context')}
              title={L.modeCtxHint}
            >
              <Scale className="w-3 h-3 mr-1" />
              {L.modeContext}
            </Button>
          </div>
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 sm:h-7 w-9 sm:w-7"
              onClick={() => zoomBy(1.2)}
              title={t('kg.zoomIn')}
              aria-label={t('kg.zoomIn')}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 sm:h-7 w-9 sm:w-7"
              onClick={() => zoomBy(1 / 1.2)}
              title={t('kg.zoomOut')}
              aria-label={t('kg.zoomOut')}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={resetView}
              title={L.resetView}
              aria-label={L.resetView}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              <span className="text-[11px]">{L.resetView}</span>
            </Button>
          </div>
        </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className={`${isMobile ? 'h-[300px]' : 'h-[400px]'} flex flex-col items-center justify-center text-slate-400`}>
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <span className="text-xs">{L.loading}</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className={`${isMobile ? 'h-[300px]' : 'h-[400px]'} flex flex-col items-center justify-center text-slate-400 text-sm text-center`}>
            <NetworkIcon className="w-10 h-10 mb-2 opacity-40" />
            <p>{L.empty}</p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="relative outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 rounded-lg"
            tabIndex={0}
            role="application"
            aria-label={L.title}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowKeyboardHint(true)}
            onBlur={() => setShowKeyboardHint(false)}
          >
            {/* M2 — keyboard hint overlay. Shown while the container has
                focus so keyboard / screen-reader users learn the
                interaction model. Pointer-events disabled so it never
                blocks clicks on the underlying SVG. */}
            {showKeyboardHint && (
              <div
                className="pointer-events-none absolute top-2 left-2 z-30 max-w-[260px] px-2.5 py-1.5 rounded-md bg-slate-900/85 dark:bg-slate-100/90 text-white dark:text-slate-900 text-[11px] leading-relaxed backdrop-blur-sm shadow-md"
                role="note"
              >
                {L.keyboardHint}
              </div>
            )}
            {/* Citation-context status banner (only in context mode) */}
            {viewMode === 'context' && (
              <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 shadow-sm">
                {contextLoading || contextAnalyzing ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-500 shrink-0" />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                      {contextAnalyzing
                        ? t('kg.ctxAnalyzing')
                        : L.ctxLoading}
                    </span>
                  </>
                ) : analyzedCount === 0 ? (
                  <>
                    <Scale className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 flex-1 min-w-0">
                      {L.ctxEmpty}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] sm:text-[10px] px-2 shrink-0 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      onClick={() => void runAnalysis()}
                      disabled={contextAnalyzing}
                    >
                      {L.ctxAnalyzeBtn}
                    </Button>
                  </>
                ) : (
                  <>
                    <Scale className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 flex-1 min-w-0 truncate">
                      {L.ctxAnalyzed.replace('{n}', String(analyzedCount))}
                      {contextMissing > 0 && (
                        <span className="ml-2 text-amber-600 dark:text-amber-400">
                          · {L.ctxMissing.replace('{n}', String(contextMissing))}
                        </span>
                      )}
                    </span>
                    {contextMissing > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] sm:text-[10px] px-2 shrink-0 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        onClick={() => void runAnalysis()}
                        disabled={contextAnalyzing}
                      >
                        {contextAnalyzing ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Scale className="w-3 h-3 mr-1" />
                        )}
                        {t('kg.ctxAnalyzeRemaining')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
            <svg
              ref={svgRef}
              className={`w-full ${isMobile ? 'h-[300px]' : 'h-[400px]'} bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 touch-none ${viewMode === 'context' && (contextLoading || contextAnalyzing) ? 'opacity-60' : ''}`}
              style={{ cursor: 'grab' }}
              // M2 — role/aria-label moved to the focusable container div
              // (role="application") so keyboard users land on the
              // interactive surface, not just an inert image.
              aria-hidden="true"
            />

            {/* P1-6 — floating “Reset view” button on mobile. The header
                toolbar collapses on small screens, so we surface a
                guaranteed 44px reset affordance as an overlay at the
                bottom-right of the graph. Hidden on desktop (the inline
                toolbar button is used there). */}
            {isMobile && (
              <Button
                variant="outline"
                size="icon"
                onClick={resetView}
                title={L.resetView}
                aria-label={L.resetView}
                className="absolute bottom-2 right-2 z-10 h-11 w-11 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-md border-slate-200 dark:border-slate-700"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}

            {/* Node hover tooltip */}
            {tooltip && (
              <div
                className="pointer-events-none absolute z-20 max-w-[260px] px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-[11px]"
                style={{
                  left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 260) - 260),
                  top: Math.max(tooltip.y - 60, 4),
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: CATEGORY_COLORS[tooltip.node.category] || '#94a3b8',
                    }}
                  />
                  <span className="font-mono text-[11px] font-bold">{tooltip.node.name}</span>
                </div>
                <div className="text-[11px] sm:text-[10px] text-slate-500 capitalize">
                  {categoryLabel(tooltip.node.category)}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[11px] sm:text-[10px]">
                  <span className="text-slate-400">{L.bandgap}:</span>
                  <span className="text-slate-700 dark:text-slate-200 tabular-nums">
                    {tooltip.node.bandgap != null
                      ? `${tooltip.node.bandgap.toFixed(2)} eV`
                      : '—'}
                  </span>
                  <span className="text-slate-400">{L.efficiency}:</span>
                  <span className="text-slate-700 dark:text-slate-200 tabular-nums">
                    {tooltip.node.efficiency != null
                      ? `${tooltip.node.efficiency.toFixed(2)}%`
                      : '—'}
                  </span>
                  <span className="text-slate-400">{L.papers}:</span>
                  <span className="text-slate-700 dark:text-slate-200 tabular-nums">
                    {tooltip.node.paperCount}
                  </span>
                  <span className="text-slate-400">{L.degree}:</span>
                  <span className="text-slate-700 dark:text-slate-200 tabular-nums">
                    {tooltip.degree}
                  </span>
                </div>
                <div className="text-[10px] sm:text-[9px] text-slate-400 mt-1 italic">{L.clickHint}</div>
              </div>
            )}

            {/* E3 — Materials Project-style detail panel.
                Slides in from the right when a node is clicked. Coexists
                with the graph: the SVG stays interactive underneath (we
                only block clicks via a transparent backdrop so users can
                click outside the panel or on another node to switch). */}
            <AnimatePresence>
              {selectedNode && (
                <>
                  {/* Backdrop — clicking outside closes the panel. */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setSelectedNode(null)}
                    className="absolute inset-0 z-20 bg-slate-900/10 dark:bg-slate-950/30"
                    aria-hidden="true"
                  />
                  <motion.div
                    initial={isMobile ? { y: 320, opacity: 0 } : { x: 320, opacity: 0 }}
                    animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
                    exit={isMobile ? { y: 320, opacity: 0 } : { x: 320, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                    className={
                      isMobile
                        ? 'absolute left-0 right-0 bottom-0 z-30 max-h-[78%] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col rounded-t-xl'
                        : 'absolute top-0 right-0 bottom-0 z-30 w-[280px] max-w-[85%] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col'
                    }
                    role="dialog"
                    aria-label={L.panelTitle}
                  >
                    {/* P1-6 — drag handle on mobile bottom sheet, so
                        the affordance reads as “swipe down to dismiss”
                        even though we don’t wire an actual pan gesture
                        (tap backdrop / Close button covers it). */}
                    {isMobile && (
                      <div className="shrink-0 pt-2 pb-1 flex justify-center" aria-hidden="true">
                        <span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                      </div>
                    )}
                    {/* Panel header */}
                    <div className="flex items-start justify-between gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                CATEGORY_COLORS[selectedNode.category] || '#94a3b8',
                            }}
                          />
                          <span className="text-[11px] sm:text-[10px] text-slate-400 uppercase tracking-wide">
                            {L.panelTitle}
                          </span>
                        </div>
                        <div className="font-mono text-sm font-bold break-all leading-tight">
                          {selectedNode.name}
                        </div>
                        {aliasesByMaterial.get(selectedNode.id) && (
                          <div className="text-[11px] sm:text-[10px] text-slate-400 mt-0.5 truncate">
                            {t('kg.aliases')}
                            {aliasesByMaterial.get(selectedNode.id)}
                          </div>
                        )}
                        <Badge
                          variant="outline"
                          className="mt-1 text-[10px] sm:text-[9px] capitalize"
                        >
                          {categoryLabel(selectedNode.category)}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ${isMobile ? 'h-11 w-11 p-0' : 'h-6 w-6 p-0'}`}
                        onClick={() => setSelectedNode(null)}
                        aria-label={L.panelClose}
                      >
                        <X className={isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                      </Button>
                    </div>

                    {/* Panel body — scrollable */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                      {/* Key stats grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-1 text-[10px] sm:text-[9px] uppercase tracking-wide text-slate-400">
                            <Zap className="w-2.5 h-2.5" />
                            {L.bandgap}
                          </div>
                          <div className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                            {selectedNode.bandgap != null
                              ? `${selectedNode.bandgap.toFixed(2)} eV`
                              : '—'}
                          </div>
                        </div>
                        <div className="rounded-md p-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                          <div className="flex items-center gap-1 text-[10px] sm:text-[9px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            <TrendingUp className="w-2.5 h-2.5" />
                            {L.efficiency}
                          </div>
                          <div className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                            {selectedNode.efficiency != null
                              ? `${selectedNode.efficiency.toFixed(2)}%`
                              : '—'}
                          </div>
                        </div>
                        <div className="rounded-md p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-1 text-[10px] sm:text-[9px] uppercase tracking-wide text-slate-400">
                            <FileText className="w-2.5 h-2.5" />
                            {L.papers}
                          </div>
                          <div className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                            {selectedNode.paperCount}
                          </div>
                        </div>
                        <div className="rounded-md p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-1 text-[10px] sm:text-[9px] uppercase tracking-wide text-slate-400">
                            <CircleDot className="w-2.5 h-2.5" />
                            {L.degree}
                          </div>
                          <div className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                            {connections.length}
                          </div>
                        </div>
                      </div>

                      {/* Synthesis method */}
                      <div className="rounded-md p-2 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/70">
                        <div className="flex items-center gap-1 text-[10px] sm:text-[9px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">
                          <FlaskConical className="w-2.5 h-2.5" />
                          {L.synthesisMethod}
                        </div>
                        {synthLoading ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            {L.loading}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-700 dark:text-slate-200 mt-0.5 break-words">
                            {synthByMaterial.get(selectedNode.id) || (
                              <span className="text-slate-400 italic">{L.noSynthMethod}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Connections list */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1 text-[11px] sm:text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                            <NetworkIcon className="w-2.5 h-2.5" />
                            {L.connections}
                          </div>
                          <Badge variant="outline" className="text-[10px] sm:text-[9px]">
                            {connections.length}
                          </Badge>
                        </div>
                        {connections.length === 0 ? (
                          <div className="text-[11px] text-slate-400 italic py-2">
                            {L.noConnections}
                          </div>
                        ) : (
                          <ul className="space-y-1">
                            {connections.map((c) => (
                              <li key={c.node.id}>
                                <button
                                  type="button"
                                  onClick={() => onNavigate('papers', c.node.id)}
                                  className={`w-full text-left rounded-md border border-slate-100 dark:border-slate-800 ${isMobile ? 'p-2.5 min-h-[44px]' : 'p-1.5'} hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors group`}
                                  title={L.clickConnectionHint}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{
                                        backgroundColor:
                                          CATEGORY_COLORS[c.node.category] || '#94a3b8',
                                      }}
                                    />
                                    <span className="font-mono text-[11px] font-semibold truncate flex-1 text-slate-700 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                                      {c.node.name}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] sm:text-[9px] shrink-0 tabular-nums"
                                    >
                                      {L.weight} {c.weight.toFixed(1)}
                                    </Badge>
                                    <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-emerald-500 shrink-0" />
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-1 ml-3.5">
                                    {c.reasons.map((r, i) => (
                                      <span
                                        key={i}
                                        className="text-[10px] sm:text-[9px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                      >
                                        {r}
                                      </span>
                                    ))}
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="text-[10px] sm:text-[9px] text-slate-400 mt-1.5 italic">
                          {L.clickConnectionHint}
                        </div>
                      </div>
                    </div>

                    {/* Panel footer — primary actions */}
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <Button
                        size="sm"
                        className={`flex-1 bg-emerald-600 hover:bg-emerald-700 ${isMobile ? 'h-11' : 'h-8'}`}
                        onClick={() => {
                          onNavigate('papers', selectedNode.id)
                          setSelectedNode(null)
                        }}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" />
                        {L.viewPapers}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={isMobile ? 'h-11' : 'h-8'}
                        onClick={() => setSelectedNode(null)}
                      >
                        {L.panelClose}
                      </Button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// M9 — React.memo: the parent (DashboardTab) re-renders on every stats /
// health query refetch, but KnowledgeGraph's only prop is `onNavigate`,
// which is stable across those re-renders (it comes from page.tsx, not the
// dashboard's own state). Memoising skips the D3 setup / context-fetch
// useEffect chain on those unrelated re-renders.
//
// Note: `onNavigate` itself is a fresh closure inside page.tsx (no
// useCallback), so memo is only effective when page.tsx doesn't re-render.
// That's still a meaningful win — most dashboard re-renders come from
// DashboardTab's own queries, not from page.tsx state changes.
export default memo(KnowledgeGraph)
