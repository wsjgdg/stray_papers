'use client'

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Network,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  X,
  ExternalLink,
  FileText,
  Hash,
  Calendar,
  BookOpen,
  Layers,
  CircleDot,
  LayoutGrid,
  ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/components/i18n/provider'
import { useMediaQuery } from '@/hooks/use-media-query'
import { api, doiUrl } from '@/lib/api-client'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'

// Category palette — per task spec (emerald / amber / sky / slate)
const CATEGORY_COLORS: Record<string, string> = {
  perovskite: '#10b981',
  chalcogenide: '#f59e0b',
  oxide: '#0ea5e9',
  other: '#94a3b8',
}

interface GraphNode {
  id: string
  label: string
  year: number | null
  citations: number
  source: string
  material: string
  category: string
  doi: string
  group: string
}

interface GraphLink {
  source: string
  target: string
  weight: number
}

type LayoutMode = 'force' | 'circular'

function CitationNetwork({ materialId }: { materialId?: string }) {
  const { t } = useI18n()
  // P1-6 — mobile detection. Drives graph height (300 vs 480),
  // panel placement (bottom sheet vs right side), filter collapse,
  // label visibility, and zoom touchable. SSR-safe.
  const isMobile = useMediaQuery('(max-width: 640px)')
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null)
  const [edgeTooltip, setEdgeTooltip] = useState<{
    x: number
    y: number
    source: GraphNode
    target: GraphNode
  } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [simulating, setSimulating] = useState(false)
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set(['perovskite', 'chalcogenide', 'oxide', 'other']),
  )
  const [minCitations, setMinCitations] = useState(0)
  const [selectedMaterial, setSelectedMaterial] = useState<string>('all')
  const [layout, setLayout] = useState<LayoutMode>('force')
  // P1-6 — mobile-only collapse for the Filters + Legend rows.
  // Defaults to closed so the graph fills the viewport.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  // M2 — keyboard navigation state. `focusedNodeIndex` tracks the
  // keyboard-focused node (null = no focus). Separate from
  // `hoveredNodeId` (mouse hover) so the two modalities don't fight.
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number | null>(null)
  // M2 — toggled on container focus/blur to show a one-line keyboard
  // hint overlay (arrow keys / Enter / Escape).
  const [showKeyboardHint, setShowKeyboardHint] = useState(false)

  // i18n — memoized wrapper around t() for the citation namespace
  const L = useMemo(
    () => ({
      title: t('citation.title'),
      description: (p: number, m: number) =>
        t('citation.description', { p, m }),
      nodes: t('citation.nodes'),
      edges: t('citation.edges'),
      zoom: t('citation.zoom'),
      minCitations: t('citation.minCitations'),
      material: t('citation.material'),
      allMaterials: t('citation.allMaterials'),
      layout: t('citation.layout'),
      force: t('citation.force'),
      circular: t('citation.circular'),
      arranging: t('citation.arranging'),
      empty: t('citation.empty'),
      emptyHint: t('citation.emptyHint'),
      resetView: t('citation.resetView'),
      zoomIn: t('citation.zoomIn'),
      zoomOut: t('citation.zoomOut'),
      paperDetails: t('citation.paperDetails'),
      year: t('citation.year'),
      citations: t('citation.citations'),
      source: t('citation.source'),
      openDoi: t('citation.openDoi'),
      abstract: t('citation.abstract'),
      authors: t('citation.authors'),
      venue: t('citation.venue'),
      noAbstract: t('citation.noAbstract'),
      loadingAbstract: t('citation.loadingAbstract'),
      close: t('citation.close'),
      coMaterialLink: t('citation.coMaterialLink'),
      legend: t('citation.legend'),
      filters: t('citation.filters'),
      perovskite: t('citation.cat.perovskite'),
      chalcogenide: t('citation.cat.chalcogenide'),
      oxide: t('citation.cat.oxide'),
      other: t('citation.cat.other'),
      // M2 — keyboard hint shown on container focus
      keyboardHint: t('citation.keyboardHint'),
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

  const { data, isLoading } = useQuery<{
    nodes: GraphNode[]
    links: GraphLink[]
    materialCount: number
    paperCount: number
  }>({
    queryKey: QUERY_KEYS.citationNetwork(materialId),
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' })
      if (materialId) params.set('materialId', materialId)
      return api(`/api/citation-network?${params.toString()}`)
    },
  })

  // Unique materials for the filter dropdown
  const materials = useMemo(() => {
    if (!data) return []
    const map = new Map<string, string>()
    for (const n of data.nodes) {
      if (!map.has(n.group)) map.set(n.group, n.material)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  // Filtered data — apply category + min-citations + material filters
  const filteredData = useMemo(() => {
    if (!data) return null
    const nodes = data.nodes.filter(
      (n) =>
        activeCategories.has(n.category) &&
        (n.citations || 0) >= minCitations &&
        (selectedMaterial === 'all' || n.group === selectedMaterial),
    )
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links = data.links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target))
    return {
      nodes,
      links,
      materialCount: data.materialCount,
      paperCount: data.paperCount,
    }
  }, [data, activeCategories, minCitations, selectedMaterial])

  // Lazy fetch paper detail (abstract / authors / venue) on node click.
  // Searches by a title prefix via the papers API `q` param (contains match),
  // then locates the exact paper by id. Cached per-paper by React Query.
  const { data: paperDetail, isLoading: detailLoading } = useQuery<{
    abstract: string
    authors: string
    venue: string
  } | null>({
    queryKey: QUERY_KEYS.paperDetail(selectedNode?.id ?? ''),
    queryFn: async () => {
      if (!selectedNode) return null
      const titleSlice = selectedNode.label.replace(/…$/, '').slice(0, 40).trim()
      if (!titleSlice) return null
      try {
        const res = await api<{
          papers: Array<{ id: string; abstract: string; authors: string; venue: string }>
        }>(`/api/papers?q=${encodeURIComponent(titleSlice)}&limit=20`)
        const found = res.papers.find((p) => p.id === selectedNode.id)
        if (!found) return null
        return {
          abstract: found.abstract || '',
          authors: found.authors || '',
          venue: found.venue || '',
        }
      } catch {
        return null
      }
    },
    enabled: !!selectedNode,
    staleTime: STALE_TIMES.citationNetwork,
  })

  const resetView = useCallback(() => {
    if (!svgRef.current) return
    import('d3').then((d3) => {
      // Transition + zoom.call type friction — cast through any (D3 limitation)
      ;(d3.select(svgRef.current).transition().duration(500) as unknown as { call: (fn: unknown, ...args: unknown[]) => void }).call(d3.zoom().transform, d3.zoomIdentity)
      setZoom(1)
    })
  }, [])

  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current) return
    import('d3').then((d3) => {
      ;(d3.select(svgRef.current).transition().duration(300) as unknown as { call: (fn: unknown, ...args: unknown[]) => void }).call(d3.zoom().scaleBy, factor)
    })
  }, [])

  // Main D3 render effect — re-runs when filtered data or layout changes
  useEffect(() => {
    if (!filteredData || filteredData.nodes.length === 0 || !svgRef.current) return
    let cancelled = false
    let simulation: { stop: () => void } | null = null

    if (layout === 'force') setSimulating(true)

    import('d3').then((d3) => {
      if (cancelled || !svgRef.current) return
      const svg = d3.select(svgRef.current)
      svg.selectAll('*').remove()
      svg.on('zoom', null)

      const width = svgRef.current.clientWidth || 600
      // P1-6 — shrink graph height on mobile (300 vs 480) so the card
      // doesn't dominate the dashboard on small screens. The force
      // simulation, circular layout, and zoom behavior all key off
      // `height` so they adapt automatically.
      const height = isMobile ? 300 : 480
      const cx = width / 2
      const cy = height / 2

      // Wrapper group — zoom transform applies to this, not individual layers
      const g = svg.append('g').attr('class', 'zoom-layer')

      const color = (d: GraphNode) => CATEGORY_COLORS[d.category] || '#94a3b8'
      const maxCitations = Math.max(...filteredData.nodes.map((n) => n.citations || 0), 1)
      const radius = (d: GraphNode) => 4 + ((d.citations || 0) / maxCitations) * 14

      // nodeData — mutable copies that will receive x/y from the layout engine
      const nodeData: (GraphNode & { x?: number; y?: number })[] = filteredData.nodes.map((n) => ({ ...n }))

      // nodeMap — keyed by id; values carry x/y so the circular layout can read them
      const nodeMap = new Map(nodeData.map((n) => [n.id, n]))

      // Prepare links (filter to those whose endpoints survived filtering)
      const links = filteredData.links
        .filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target))
        .map((l) => ({ source: l.source, target: l.target, weight: l.weight }))

      // Adjacency for hover highlight
      const adjacency = new Map<string, Set<string>>()
      for (const l of links) {
        if (!adjacency.has(l.source)) adjacency.set(l.source, new Set())
        if (!adjacency.has(l.target)) adjacency.set(l.target, new Set())
        adjacency.get(l.source)!.add(l.target)
        adjacency.get(l.target)!.add(l.source)
      }

      // Helper: resolve link endpoint id (force layout mutates source/target into objects)
      const linkSourceId = (l: { source: string | { id?: string } }) =>
        typeof l.source === 'string' ? l.source : (l.source as { id?: string }).id || ''
      const linkTargetId = (l: { target: string | { id?: string } }) =>
        typeof l.target === 'string' ? l.target : (l.target as { id?: string }).id || ''

      // Edges — invisible thick hit-area + visible thin line
      const linkG = g.append('g').attr('class', 'links')
      const linkHit = linkG
        .selectAll<SVGLineElement, typeof links[number]>('line.hit')
        .data(links)
        .join('line')
        .attr('class', 'hit')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 12)
        .style('cursor', 'pointer')
        .on('mouseenter', (event, d) => {
          const sNode = nodeMap.get(linkSourceId(d))
          const tNode = nodeMap.get(linkTargetId(d))
          if (sNode && tNode && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setEdgeTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              source: sNode,
              target: tNode,
            })
          }
        })
        .on('mousemove', (event, d) => {
          const sNode = nodeMap.get(linkSourceId(d))
          const tNode = nodeMap.get(linkTargetId(d))
          if (sNode && tNode && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setEdgeTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              source: sNode,
              target: tNode,
            })
          }
        })
        .on('mouseleave', () => setEdgeTooltip(null))

      const link = linkG
        .selectAll<SVGLineElement, typeof links[number]>('line.vis')
        .data(links)
        .join('line')
        .attr('class', 'vis')
        .attr('stroke', '#cbd5e1')
        .attr('stroke-opacity', 0.18)
        .attr('stroke-width', (d) => Math.max(0.6, d.weight))

      // Nodes
      const nodeG = g.append('g').attr('class', 'nodes')
      const node = nodeG
        .selectAll<SVGCircleElement, (GraphNode & { x?: number; y?: number })>('circle')
        .data(nodeData)
        .join('circle')
        .attr('class', 'node-circle')
        .attr('r', (d) => radius(d))
        .attr('fill', (d) => color(d))
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('click', (_e, d) => setSelectedNode(d as GraphNode))

      // Node hover — tooltip + highlight neighbors
      node
        .on('mouseenter', (event, d) => {
          const n = d as GraphNode
          setHoveredNodeId(n.id)
          highlightNode(n)
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: n })
          }
        })
        .on('mousemove', (event, d) => {
          const n = d as GraphNode
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: n })
          }
        })
        .on('mouseleave', () => {
          setHoveredNodeId(null)
          clearHighlight()
          setTooltip(null)
        })

      // Labels — hidden by default, shown only for hovered/neighbor nodes
      const label = g
        .append('g')
        .attr('class', 'labels')
        .selectAll<SVGTextElement, typeof nodeData[number]>('text')
        .data(nodeData)
        .join('text')
        .text((d) => (d.label.length > 42 ? d.label.slice(0, 39) + '…' : d.label))
        .attr('font-size', 10)
        .attr('font-weight', 500)
        .attr('fill', '#334155')
        .attr('text-anchor', 'middle')
        .attr('pointer-events', 'none')
        .attr('opacity', 0)

      // Highlight a node + its neighbors + connecting edges
      function highlightNode(n: GraphNode) {
        const neighbors = adjacency.get(n.id) || new Set<string>()
        neighbors.add(n.id)
        node
          .attr('stroke-width', (d) => ((d as GraphNode).id === n.id ? 3.5 : neighbors.has((d as GraphNode).id) ? 2 : 1.5))
          .attr('stroke', (d) => ((d as GraphNode).id === n.id ? '#0f172a' : '#fff'))
          .attr('opacity', (d) => (neighbors.has((d as GraphNode).id) ? 1 : 0.2))
        link
          .attr('stroke-opacity', (d) => {
            const s = linkSourceId(d as { source: string | { id?: string } })
            const t = linkTargetId(d as { target: string | { id?: string } })
            return s === n.id || t === n.id ? 0.85 : 0.05
          })
          .attr('stroke', (d) => {
            const s = linkSourceId(d as { source: string | { id?: string } })
            const t = linkTargetId(d as { target: string | { id?: string } })
            return s === n.id || t === n.id ? '#475569' : '#cbd5e1'
          })
          .attr('stroke-width', (d) => {
            const s = linkSourceId(d as { source: string | { id?: string } })
            const t = linkTargetId(d as { target: string | { id?: string } })
            return s === n.id || t === n.id ? 2 : Math.max(0.6, d.weight)
          })
        label.attr('opacity', (d) => (neighbors.has((d as GraphNode).id) ? 1 : 0))
      }

      function clearHighlight() {
        node.attr('stroke-width', 1.5).attr('stroke', '#fff').attr('opacity', 1)
        link
          .attr('stroke-opacity', 0.18)
          .attr('stroke', '#cbd5e1')
          .attr('stroke-width', (d) => Math.max(0.6, d.weight))
        label.attr('opacity', 0)
      }

      // Edge hover highlight — highlight just that edge + its two endpoints
      linkHit
        .on('mouseenter.edge', (_e, d) => {
          const sn = linkSourceId(d as { source: string | { id?: string } })
          const tn = linkTargetId(d as { target: string | { id?: string } })
          link
            .attr('stroke-opacity', (dd) => {
              const s = linkSourceId(dd as { source: string | { id?: string } })
              const t = linkTargetId(dd as { target: string | { id?: string } })
              return s === sn && t === tn ? 0.95 : 0.08
            })
            .attr('stroke', (dd) => {
              const s = linkSourceId(dd as { source: string | { id?: string } })
              const t = linkTargetId(dd as { target: string | { id?: string } })
              return s === sn && t === tn ? '#475569' : '#cbd5e1'
            })
            .attr('stroke-width', (dd) => {
              const s = linkSourceId(dd as { source: string | { id?: string } })
              const t = linkTargetId(dd as { target: string | { id?: string } })
              return s === sn && t === tn ? 2.5 : Math.max(0.6, dd.weight)
            })
          node
            .attr('stroke-width', (dd) =>
              (dd as GraphNode).id === sn || (dd as GraphNode).id === tn ? 3 : 1.5,
            )
            .attr('stroke', (dd) =>
              (dd as GraphNode).id === sn || (dd as GraphNode).id === tn ? '#0f172a' : '#fff',
            )
            .attr('opacity', (dd) =>
              (dd as GraphNode).id === sn || (dd as GraphNode).id === tn ? 1 : 0.4,
            )
          label.attr('opacity', (dd) =>
            (dd as GraphNode).id === sn || (dd as GraphNode).id === tn ? 1 : 0,
          )
        })
        .on('mouseleave.edge', () => {
          clearHighlight()
          setEdgeTooltip(null)
        })

      // ---------- Layout ----------
      if (layout === 'circular') {
        // Sort by year (nulls last), arrange on a circle
        const sorted = [...nodeData].sort((a, b) => {
          if (a.year == null) return 1
          if (b.year == null) return -1
          return a.year - b.year
        })
        const R = Math.min(width, height) / 2 - 36
        sorted.forEach((n, i) => {
          const angle = (2 * Math.PI * i) / sorted.length - Math.PI / 2
          n.x = cx + R * Math.cos(angle)
          n.y = cy + R * Math.sin(angle)
        })
        node.attr('cx', (d) => d.x || 0).attr('cy', (d) => d.y || 0)
        label
          .attr('x', (d) => d.x || 0)
          .attr('y', (d) => (d.y || 0) - radius(d) - 5)
        link
          .attr('x1', (d) => (nodeMap.get(linkSourceId(d))?.x) || 0)
          .attr('y1', (d) => (nodeMap.get(linkSourceId(d))?.y) || 0)
          .attr('x2', (d) => (nodeMap.get(linkTargetId(d))?.x) || 0)
          .attr('y2', (d) => (nodeMap.get(linkTargetId(d))?.y) || 0)
        linkHit
          .attr('x1', (d) => (nodeMap.get(linkSourceId(d))?.x) || 0)
          .attr('y1', (d) => (nodeMap.get(linkSourceId(d))?.y) || 0)
          .attr('x2', (d) => (nodeMap.get(linkTargetId(d))?.x) || 0)
          .attr('y2', (d) => (nodeMap.get(linkTargetId(d))?.y) || 0)
        setSimulating(false)
      } else {
        // Force-directed layout
        const sim = d3
          .forceSimulation(nodeData as unknown as d3.SimulationNodeDatum[])
          .force(
            'link',
            d3
              .forceLink(links as unknown as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
              .id((d: unknown) => (d as GraphNode).id)
              .distance(60)
              .strength(0.3),
          )
          .force('charge', d3.forceManyBody().strength(-80))
          .force('center', d3.forceCenter(cx, cy))
          .force('collision', d3.forceCollide<d3.SimulationNodeDatum>().radius((d) => radius(d as unknown as GraphNode) + 2))
          .alpha(1)
          .alphaDecay(0.045)

        sim.on('tick', () => {
          const tickLink = (d: unknown) => (d as unknown as { source: { x: number; y: number } }).source
          const tickTarget = (d: unknown) => (d as unknown as { target: { x: number; y: number } }).target
          link
            .attr('x1', (d) => tickLink(d).x)
            .attr('y1', (d) => tickLink(d).y)
            .attr('x2', (d) => tickTarget(d).x)
            .attr('y2', (d) => tickTarget(d).y)
          linkHit
            .attr('x1', (d) => tickLink(d).x)
            .attr('y1', (d) => tickLink(d).y)
            .attr('x2', (d) => tickTarget(d).x)
            .attr('y2', (d) => tickTarget(d).y)
          node.attr('cx', (d) => (d as unknown as { x: number }).x).attr('cy', (d) => (d as unknown as { y: number }).y)
          label
            .attr('x', (d) => (d as unknown as { x: number }).x)
            .attr('y', (d) => (d as unknown as { x: number; y: number }).y - radius(d as unknown as GraphNode) - 5)
        })
        sim.on('end', () => setSimulating(false))
        simulation = sim
        // Safety fallback — stop indicator after 2.5s
        window.setTimeout(() => setSimulating(false), 2500)
      }

      // ---------- Zoom & pan ----------
      // P1-6 — `.touchable(true)` ensures D3 binds touch handlers so
      // pinch-to-zoom works on mobile. The SVG element carries
      // `touch-none` so the browser doesn't steal the gesture for
      // page scrolling.
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
  }, [filteredData, layout, isMobile])

  // P1-6 — mobile label-on-tap. On touch devices `mouseenter` never
  // fires, so the default label-on-hover UX is broken. We re-purpose
  // the detail-panel selection as the "show me this node's label"
  // signal: when the user taps a node, its label appears next to the
  // circle (and all other labels stay hidden). Clearing the panel
  // hides it again. On desktop this effect is a no-op so hover
  // behaviour is unchanged.
  useEffect(() => {
    if (!isMobile || !svgRef.current) return
    import('d3').then((d3) => {
      if (!svgRef.current) return
      d3.select(svgRef.current)
        .selectAll<SVGTextElement, GraphNode>('text')
        .attr('opacity', (d) =>
          selectedNode && (d as GraphNode).id === selectedNode.id ? 1 : 0,
        )
    })
  }, [isMobile, selectedNode])

  // Apply selected-node persistent stroke (without re-rendering the whole graph)
  useEffect(() => {
    if (!svgRef.current) return
    import('d3').then((d3) => {
      const svg = d3.select(svgRef.current)
      svg
        .selectAll<SVGCircleElement, GraphNode>('circle.node-circle')
        .attr('stroke-width', (d) => (d.id === selectedNode?.id ? 3.5 : d.id === hoveredNodeId ? 3 : 1.5))
        .attr('stroke', (d) =>
          d.id === selectedNode?.id ? '#0f172a' : d.id === hoveredNodeId ? '#1e293b' : '#fff',
        )
    })
  }, [selectedNode, hoveredNodeId])

  // M2 — keyboard-focus highlight. Thicker stroke + label shown for the
  // focused node only. Re-runs when `hoveredNodeId` changes so the
  // highlight is restored after a mouse-leave clears it (mouse and
  // keyboard use separate React state but share the same SVG).
  useEffect(() => {
    if (!svgRef.current) return
    const liveNodes = filteredData?.nodes ?? []
    const focusedId =
      focusedNodeIndex != null ? liveNodes[focusedNodeIndex]?.id : null
    import('d3').then((d3) => {
      if (!svgRef.current) return
      const svg = d3.select(svgRef.current)
      svg
        .selectAll<SVGCircleElement, GraphNode>('circle.node-circle')
        .attr('stroke-width', (d) => {
          if (focusedId && d.id === focusedId) return 3.5
          if (d.id === selectedNode?.id) return 3.5
          if (d.id === hoveredNodeId) return 3
          return 1.5
        })
        .attr('stroke', (d) => {
          if (focusedId && d.id === focusedId) return '#0f172a'
          if (d.id === selectedNode?.id) return '#0f172a'
          if (d.id === hoveredNodeId) return '#1e293b'
          return '#fff'
        })
      svg
        .selectAll<SVGTextElement, GraphNode>('text')
        .attr('opacity', (d) => {
          if (focusedId && d.id === focusedId) return 1
          if (selectedNode && d.id === selectedNode.id) return 1
          return 0
        })
    })
  }, [focusedNodeIndex, filteredData, hoveredNodeId, selectedNode])

  const nodes = filteredData?.nodes ?? []
  const links = filteredData?.links ?? []
  const hasData = (data?.paperCount ?? 0) > 0
  const hasFiltered = nodes.length > 0

  // M2 — keyboard handler bound to the SVG container div. Cycles through
  // `nodes` (mod len) on arrow keys, Enter opens the same detail panel a
  // click would, Escape clears focus + closes the panel. preventDefault
  // stops the page from scrolling while the user arrow-keys the graph.
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
              <Network className="w-4 h-4 text-emerald-500" /> {L.title}
            </CardTitle>
            <CardDescription className="mt-1">
              {L.description(data?.paperCount ?? 0, data?.materialCount ?? 0)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="outline" className="text-[10px] sm:text-[9px]">
              {nodes.length} {L.nodes}
            </Badge>
            <Badge variant="outline" className="text-[10px] sm:text-[9px]">
              {links.length} {L.edges}
            </Badge>
            <Badge variant="outline" className="text-[10px] sm:text-[9px]">
              {L.zoom} {zoom.toFixed(1)}x
            </Badge>
          </div>
        </div>

        {/* Filter bar
            P1-6 — on mobile, filters + legend collapse behind a
            “Filters” toggle so the graph fills the viewport. */}
        {isMobile ? (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 h-11 px-2 -mx-2 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              aria-expanded={mobileFiltersOpen}
              aria-controls="cn-mobile-filters"
            >
              <span className="inline-flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                {L.filters}
                {/* Active-filter summary so users see state at a glance */}
                {selectedMaterial !== 'all' && (
                  <Badge variant="outline" className="text-[10px] sm:text-[9px] ml-1">
                    {materials.find((m) => m.id === selectedMaterial)?.name ?? selectedMaterial}
                  </Badge>
                )}
                {minCitations > 0 && (
                  <Badge variant="outline" className="text-[10px] sm:text-[9px] ml-1 tabular-nums">
                    ≥{minCitations}
                  </Badge>
                )}
                {layout === 'circular' && (
                  <Badge variant="outline" className="text-[10px] sm:text-[9px] ml-1">
                    {L.circular}
                  </Badge>
                )}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {mobileFiltersOpen && (
              <div id="cn-mobile-filters" className="mt-2 space-y-3">
                {/* Material filter (mobile) */}
                <div className="flex items-center gap-1.5 min-h-[44px]">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] text-slate-500">{L.material}:</span>
                  <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                    <SelectTrigger className="h-9 flex-1 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{L.allMaterials}</SelectItem>
                      {materials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Min citations slider (mobile) */}
                <div className="flex items-center gap-2 min-h-[44px]">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">{L.minCitations}:</span>
                  <Slider
                    value={[minCitations]}
                    min={0}
                    max={Math.max(50, ...nodes.map((n) => n.citations || 0))}
                    step={5}
                    onValueChange={(v) => setMinCitations(v[0] ?? 0)}
                    className="flex-1 [&_[data-slot=slider-thumb]]:size-5"
                  />
                  <span className="text-[11px] tabular-nums text-slate-400 w-8">≥{minCitations}</span>
                </div>
                {/* Layout toggle (mobile) */}
                <div className="flex items-center gap-1.5 min-h-[44px]">
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] text-slate-500">{L.layout}:</span>
                  <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      onClick={() => setLayout('force')}
                      className={`px-3 h-9 text-[11px] transition-colors ${
                        layout === 'force'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {L.force}
                    </button>
                    <button
                      onClick={() => setLayout('circular')}
                      className={`px-3 h-9 text-[11px] transition-colors ${
                        layout === 'circular'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {L.circular}
                    </button>
                  </div>
                </div>
                {/* Legend (mobile) — horizontal scroll */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-nowrap [scrollbar-width:thin]">
                  <span className="text-[11px] sm:text-[10px] text-slate-400 inline-flex items-center gap-1 shrink-0">
                    <CircleDot className="w-3 h-3" /> {L.legend}:
                  </span>
                  {Object.entries(CATEGORY_COLORS).map(([cat, c]) => {
                    const isActive = activeCategories.has(cat)
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          setActiveCategories((prev) => {
                            const next = new Set(prev)
                            if (next.has(cat)) next.delete(cat)
                            else next.add(cat)
                            return next
                          })
                        }}
                        className={`flex items-center gap-1 px-2 h-9 rounded-full text-[11px] sm:text-[10px] border transition-all shrink-0 ${
                          isActive ? '' : 'opacity-30'
                        }`}
                        style={{ borderColor: c }}
                        title={categoryLabel(cat)}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                        <span className="text-slate-500 capitalize">{categoryLabel(cat)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {/* Material filter */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] sm:text-[10px] text-slate-500">{L.material}:</span>
            <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
              <SelectTrigger className="h-6 w-[140px] text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{L.allMaterials}</SelectItem>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Min citations slider */}
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] sm:text-[10px] text-slate-500 whitespace-nowrap">{L.minCitations}:</span>
            <Slider
              value={[minCitations]}
              min={0}
              max={Math.max(50, ...nodes.map((n) => n.citations || 0))}
              step={5}
              onValueChange={(v) => setMinCitations(v[0] ?? 0)}
              className="w-24"
            />
            <span className="text-[11px] sm:text-[10px] tabular-nums text-slate-400 w-6">≥{minCitations}</span>
          </div>

          {/* Layout toggle */}
          <div className="flex items-center gap-1.5">
            <LayoutGrid className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] sm:text-[10px] text-slate-500">{L.layout}:</span>
            <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setLayout('force')}
                className={`px-2 py-0.5 text-[11px] sm:text-[10px] transition-colors ${
                  layout === 'force'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {L.force}
              </button>
              <button
                onClick={() => setLayout('circular')}
                className={`px-2 py-0.5 text-[11px] sm:text-[10px] transition-colors ${
                  layout === 'circular'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {L.circular}
              </button>
            </div>
          </div>
        </div>

        {/* Legend (click to toggle category filter) */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-[11px] sm:text-[10px] text-slate-400 inline-flex items-center gap-1">
            <CircleDot className="w-3 h-3" /> {L.legend}:
          </span>
          {Object.entries(CATEGORY_COLORS).map(([cat, c]) => {
            const isActive = activeCategories.has(cat)
            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategories((prev) => {
                    const next = new Set(prev)
                    if (next.has(cat)) next.delete(cat)
                    else next.add(cat)
                    return next
                  })
                }}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] sm:text-[10px] border transition-all ${
                  isActive ? '' : 'opacity-30'
                }`}
                style={{ borderColor: c }}
                title={categoryLabel(cat)}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-slate-500 capitalize">{categoryLabel(cat)}</span>
              </button>
            )
          })}
        </div>
        </>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className={`${isMobile ? 'h-[300px]' : 'h-[480px]'} flex flex-col items-center justify-center text-slate-400`}>
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <span className="text-xs">{t('common.loading')}</span>
          </div>
        ) : !hasData ? (
          <div className={`${isMobile ? 'h-[300px]' : 'h-[480px]'} flex flex-col items-center justify-center text-slate-400 text-sm px-6 text-center`}>
            <Network className="w-10 h-10 mb-2 opacity-40" />
            <p className="max-w-xs">{L.empty}</p>
            <p className="text-xs text-slate-400 mt-1">{L.emptyHint}</p>
          </div>
        ) : !hasFiltered ? (
          <div className={`${isMobile ? 'h-[300px]' : 'h-[480px]'} flex flex-col items-center justify-center text-slate-400 text-sm px-6 text-center`}>
            <Filter className="w-8 h-8 mb-2 opacity-40" />
            <p className="max-w-xs">
              {t('citation.emptyFiltered')}
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="relative outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 rounded-lg"
            tabIndex={0}
            role="application"
            aria-label={L.title}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowKeyboardHint(true)}
            onBlur={() => setShowKeyboardHint(false)}
          >
            {/* M2 — keyboard hint overlay shown while the container has
                focus. Pointer-events disabled so it never blocks the
                underlying SVG. */}
            {showKeyboardHint && (
              <div
                className="pointer-events-none absolute top-2 left-2 z-30 max-w-[260px] px-2.5 py-1.5 rounded-md bg-slate-900/85 dark:bg-slate-100/90 text-white dark:text-slate-900 text-[11px] leading-relaxed backdrop-blur-sm shadow-md"
                role="note"
              >
                {L.keyboardHint}
              </div>
            )}
            <svg
              ref={svgRef}
              className={`w-full ${isMobile ? 'h-[300px]' : 'h-[480px]'} bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 touch-none`}
              style={{ cursor: 'grab' }}
              // M2 — role/aria-label moved to the focusable container div
              // (role="application") so keyboard users land on the
              // interactive surface, not just an inert image.
              aria-hidden="true"
            />

            {/* Arranging indicator */}
            {simulating && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 shadow-sm text-[11px] sm:text-[10px] text-slate-500 backdrop-blur">
                <Loader2 className="w-3 h-3 animate-spin" />
                {L.arranging}
              </div>
            )}

            {/* Node hover tooltip */}
            {tooltip && (
              <div
                className="pointer-events-none absolute z-20 max-w-[240px] px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-[11px]"
                style={{
                  left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 240) - 240),
                  top: Math.max(tooltip.y - 40, 4),
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[tooltip.node.category] || '#94a3b8' }}
                  />
                  <span className="font-mono text-[11px] sm:text-[10px] font-bold">{tooltip.node.material}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-200 leading-snug line-clamp-2">
                  {tooltip.node.label}
                </p>
                <p className="text-[10px] sm:text-[9px] text-slate-400 mt-0.5">
                  {tooltip.node.year || '—'} · {tooltip.node.citations} {L.citations.toLowerCase()}
                </p>
              </div>
            )}

            {/* Edge hover tooltip */}
            {edgeTooltip && (
              <div
                className="pointer-events-none absolute z-20 max-w-[260px] px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-[11px]"
                style={{
                  left: Math.min(
                    edgeTooltip.x + 12,
                    (containerRef.current?.clientWidth ?? 260) - 260,
                  ),
                  top: Math.max(edgeTooltip.y - 48, 4),
                }}
              >
                <p className="text-[10px] sm:text-[9px] text-slate-400 mb-0.5 uppercase tracking-wide">
                  {L.coMaterialLink}
                </p>
                <p className="text-slate-700 dark:text-slate-200 leading-snug line-clamp-1">
                  <span className="font-mono text-[11px] sm:text-[10px] font-bold">{edgeTooltip.source.material}</span>
                  {' '}
                  ↔{' '}
                  <span className="font-mono text-[11px] sm:text-[10px] font-bold">{edgeTooltip.target.material}</span>
                </p>
                <p className="text-[11px] sm:text-[10px] text-slate-500 leading-snug line-clamp-1">
                  {edgeTooltip.source.label}
                </p>
                <p className="text-[11px] sm:text-[10px] text-slate-500 leading-snug line-clamp-1">
                  {edgeTooltip.target.label}
                </p>
              </div>
            )}

            {/* Zoom controls — P1-6: 44px touch targets on mobile */}
            <div className="absolute top-2 right-2 flex flex-col gap-1">
              <Button
                size="icon"
                variant="outline"
                className={`${isMobile ? 'h-11 w-11' : 'h-7 w-7'} bg-white dark:bg-slate-900`}
                title={L.zoomIn}
                onClick={() => zoomBy(1.3)}
              >
                <ZoomIn className={isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className={`${isMobile ? 'h-11 w-11' : 'h-7 w-7'} bg-white dark:bg-slate-900`}
                title={L.zoomOut}
                onClick={() => zoomBy(0.7)}
              >
                <ZoomOut className={isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className={`${isMobile ? 'h-11 w-11' : 'h-7 w-7'} bg-white dark:bg-slate-900`}
                title={L.resetView}
                onClick={resetView}
              >
                <Maximize2 className={isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
              </Button>
            </div>

            {/* Side panel — paper details.
                P1-6 — on mobile this becomes a bottom sheet (anchored
                to the bottom of the graph container, max 75% height) so
                it doesn't cover the whole graph. On desktop it stays as
                the right-side slide-in. */}
            {selectedNode && (
              <div
                className={
                  isMobile
                    ? 'absolute left-0 right-0 bottom-0 max-h-[78%] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto rounded-t-xl animate-in slide-in-from-bottom duration-200'
                    : 'absolute top-0 right-0 bottom-0 w-[260px] max-w-[70%] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-lg overflow-y-auto animate-in slide-in-from-right duration-200'
                }
              >
                {/* P1-6 — mobile drag handle */}
                {isMobile && (
                  <div className="shrink-0 pt-2 pb-1 flex justify-center" aria-hidden="true">
                    <span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                  </div>
                )}
                <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-semibold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-500" />
                    {L.paperDetails}
                  </span>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className={`${isMobile ? 'h-11 w-11 -mr-2 flex items-center justify-center' : ''} text-slate-400 hover:text-slate-600 transition-colors`}
                    title={L.close}
                    aria-label={L.close}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 space-y-2.5">
                  {/* Material + category */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: CATEGORY_COLORS[selectedNode.category] || '#94a3b8',
                      }}
                    />
                    <span className="font-mono text-xs font-bold">{selectedNode.material}</span>
                    <Badge variant="outline" className="text-[10px] sm:text-[9px] capitalize">
                      {categoryLabel(selectedNode.category)}
                    </Badge>
                  </div>

                  {/* Title */}
                  <p className="text-xs font-medium leading-snug text-slate-800 dark:text-slate-100">
                    {selectedNode.label}
                  </p>

                  {/* Metadata */}
                  <div className="grid grid-cols-1 gap-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Calendar className="w-3 h-3" />
                      <span>{L.year}:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-200">
                        {selectedNode.year || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Hash className="w-3 h-3" />
                      <span>{L.citations}:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-200">
                        {selectedNode.citations}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <FileText className="w-3 h-3" />
                      <span>{L.source}:</span>
                      <span className="font-mono text-[11px] sm:text-[10px] text-slate-700 dark:text-slate-200">
                        {selectedNode.source}
                      </span>
                    </div>
                    {paperDetail?.venue && (
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <BookOpen className="w-3 h-3" />
                        <span>{L.venue}:</span>
                        <span className="text-slate-700 dark:text-slate-200 truncate">
                          {paperDetail.venue}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Authors */}
                  {paperDetail?.authors && (
                    <div className="text-[11px] sm:text-[10px] text-slate-500 leading-snug">
                      <span className="font-medium">{L.authors}: </span>
                      <span>{paperDetail.authors.split(';').slice(0, 3).join(', ')}</span>
                      {paperDetail.authors.split(';').length > 3 && (
                        <span className="text-slate-400">
                          {' '}
                          +{paperDetail.authors.split(';').length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Abstract snippet */}
                  <div>
                    <p className="text-[11px] sm:text-[10px] font-medium text-slate-500 mb-0.5">{L.abstract}</p>
                    {detailLoading ? (
                      <p className="text-[11px] sm:text-[10px] text-slate-400 flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        {L.loadingAbstract}
                      </p>
                    ) : paperDetail?.abstract ? (
                      <p className="text-[11px] sm:text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-6">
                        {paperDetail.abstract}
                      </p>
                    ) : (
                      <p className="text-[11px] sm:text-[10px] text-slate-400 italic">{L.noAbstract}</p>
                    )}
                  </div>

                  {/* DOI link */}
                  {selectedNode.doi && (
                    <a
                      href={doiUrl(selectedNode.doi)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {L.openDoi}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// M9 — React.memo: CitationNetwork takes an optional `materialId` string
// prop. The parent (sources-tab) doesn't pass anything, so the prop is
// `undefined` every render — memoising means re-renders of sources-tab
// (caused by its other queries/state) no longer re-trigger the D3 layout.
export default memo(CitationNetwork)
