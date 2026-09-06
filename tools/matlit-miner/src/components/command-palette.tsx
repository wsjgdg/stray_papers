'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import {
  FlaskConical,
  Layers,
  Download,
  FileText,
  Search,
  ArrowRight,
  Braces,
  FileSpreadsheet,
  SunMoon,
  Languages,
  HelpCircle,
  Trash2,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { useI18n } from '@/components/i18n/provider'
import { api } from '@/lib/api-client'
import { downloadFromAPI } from '@/lib/export-helper'
import type { TabValue } from '@/app/page'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigateTab: (tab: TabValue, materialId?: string) => void
  onSeed: () => void
  onBatchSearch: () => void
  onExportCsv: () => void
  onExportBib: () => void
}

/**
 * Fuzzy (subsequence) match: returns true when every character of `query`
 * appears in `text` in the same order (not necessarily contiguous).
 * Empty query matches everything. Case-insensitive.
 *
 * Example: fuzzyMatch('mpi', 'MAPbI3') -> true  (M, P, I in order)
 *          fuzzyMatch('mli', 'MAPbI3') -> false (no L between M and I)
 */
function fuzzyMatch(q: string, text: string): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  const tl = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) {
    if (tl[ti] === ql[qi]) qi++
  }
  return qi === ql.length
}

/**
 * Ranking score: 2 = contiguous substring, 1 = subsequence only, 0 = no match.
 * Higher is better. Empty query scores 2 (treated as a full match).
 */
function fuzzyScore(q: string, text: string): number {
  if (!q) return 2
  const ql = q.toLowerCase()
  const tl = text.toLowerCase()
  if (tl.includes(ql)) return 2
  return fuzzyMatch(ql, tl) ? 1 : 0
}

/**
 * Returns the indices of `text` characters that the query matches as a
 * subsequence, or null when there is no subsequence match.
 */
function matchIndices(q: string, text: string): number[] | null {
  if (!q) return null
  const ql = q.toLowerCase()
  const tl = text.toLowerCase()
  const indices: number[] = []
  let qi = 0
  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) {
    if (tl[ti] === ql[qi]) {
      indices.push(ti)
      qi++
    }
  }
  return qi === ql.length ? indices : null
}

/**
 * Renders `text` with the matched subsequence characters wrapped in <mark>
 * so the user can see why a result matched the fuzzy query. When there is
 * no match (or no query) the plain text is returned.
 */
function highlightMatch(text: string, q: string): ReactNode {
  const indices = matchIndices(q, text)
  if (!indices || indices.length === 0) return text
  const nodes: ReactNode[] = []
  let last = 0
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]
    if (idx > last) nodes.push(text.slice(last, idx))
    nodes.push(
      <mark
        key={i}
        className="bg-amber-200/60 dark:bg-amber-400/20 text-amber-950 dark:text-amber-100 rounded-sm px-0.5 font-semibold transition-colors"
      >
        {text[idx]}
      </mark>,
    )
    last = idx + 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

/**
 * Filter + sort helper: keep entries whose `label` fuzzy-matches `q`, and
 * sort so contiguous-substring matches (score 2) come before subsequence-only
 * matches (score 1). Stable for entries with equal scores (preserves the
 * original declaration order).
 */
function fuzzyFilterSort<T extends { label: string }>(q: string, entries: T[]): T[] {
  if (!q) return entries
  return entries
    .map((e, i) => ({ e, score: fuzzyScore(q, e.label), i }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.e)
}

/**
 * Dispatch a CustomEvent that the app shell (page.tsx) can listen for.
 * page.tsx is owned by another agent; if no listener is attached yet these
 * events are simply no-ops and won't break anything.
 */
function dispatchAppEvent(name: string, detail?: unknown) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined))
}

interface CmdEntry {
  id: string
  label: string
  onSelect: () => void
  Icon: LucideIcon
  iconClass: string
}

const RECENTS_KEY = 'matlit-cmd-recents'
const RECENTS_MAX = 8

export function CommandPalette({ open, onOpenChange, onNavigateTab, onSeed, onBatchSearch, onExportCsv, onExportBib }: CommandPaletteProps) {
  const { t } = useI18n()
  const { data: matData } = useQuery<{ materials: Array<{ id: string; name: string; aliases: string }> }>({
    queryKey: ['cmd-materials'],
    queryFn: () => api('/api/materials'),
    enabled: open,
  })
  const [query, setQuery] = useState('')
  const [recents, setRecents] = useState<string[]>([])

  // Debounced query for paper search — we don't want to spam the
  // /api/papers/search endpoint on every keystroke. The materials group
  // filters client-side from the already-fetched list, but papers are
  // too numerous to fetch eagerly, so we issue a server search after
  // the user stops typing for 250ms.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(h)
  }, [query])

  // Load recents from localStorage on mount (SSR-safe: only access
  // localStorage inside useEffect, never during render).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
          setRecents(parsed.slice(0, RECENTS_MAX))
        }
      }
    } catch {
      // ignore parse / quota errors — recents just stay empty
    }
  }, [])

  // Reset the query each time the palette is opened so the user starts fresh.
  useEffect(() => {
    if (open) setQuery('')
    else setDebouncedQuery('')
  }, [open])

  // Papers search — only fires when there's a non-empty debounced query
  // and the palette is open. The endpoint returns up to 8 lightweight
  // results [{ id, title, doi, year, materialId, materialName }].
  const { data: papersData, isFetching: isPapersFetching } = useQuery<Array<{
    id: string
    title: string
    doi: string
    year: number | null
    materialId: string
    materialName: string
  }>>({
    queryKey: ['cmd-papers', debouncedQuery],
    queryFn: () => api(`/api/papers/search?q=${encodeURIComponent(debouncedQuery)}&limit=8`),
    enabled: open && debouncedQuery.length > 0,
    // Keep stale results on screen while the next query loads so the
    // list doesn't flicker empty between keystrokes.
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  const materials = matData?.materials ?? []
  const filteredMaterials = useMemo(() => {
    if (!query) return materials.slice(0, 8)
    return materials
      .map((m, i) => ({
        m,
        i,
        score: Math.max(
          fuzzyScore(query, m.name),
          m.aliases ? fuzzyScore(query, m.aliases) : 0,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, 8)
      .map((x) => x.m)
  }, [query, materials])

  const tabs: Array<{ value: TabValue; label: string }> = [
    { value: 'dashboard', label: t('nav.dashboard') },
    { value: 'materials', label: t('nav.materials') },
    { value: 'papers', label: t('nav.papers') },
    { value: 'classification', label: t('nav.classification') },
    { value: 'extraction', label: t('nav.extraction') },
    { value: 'efficiency', label: t('nav.efficiency') },
    { value: 'results', label: t('nav.results') },
    { value: 'verification', label: t('nav.verification') },
    { value: 'sources', label: t('nav.sources') },
  ]
  const filteredTabs = useMemo(() => fuzzyFilterSort(query, tabs), [query, tabs])

  const actionEntries: CmdEntry[] = useMemo(() => [
    { id: 'action-seed', label: t('cmd.action.seed'), onSelect: onSeed, Icon: FlaskConical, iconClass: 'text-amber-500' },
    { id: 'action-batch', label: t('cmd.action.batchSearch'), onSelect: onBatchSearch, Icon: Layers, iconClass: 'text-sky-500' },
  ], [t, onSeed, onBatchSearch])
  const filteredActions = useMemo(() => fuzzyFilterSort(query, actionEntries), [query, actionEntries])

  const exportEntries: CmdEntry[] = useMemo(() => [
    { id: 'export-csv', label: t('cmd.action.exportCsv'), onSelect: onExportCsv, Icon: Download, iconClass: 'text-teal-500' },
    { id: 'export-bib', label: t('cmd.action.exportBib'), onSelect: onExportBib, Icon: FileText, iconClass: 'text-orange-500' },
    { id: 'export-json', label: t('cmd.action.exportJson'), onSelect: () => downloadFromAPI('/api/export/json'), Icon: Braces, iconClass: 'text-violet-500' },
    { id: 'export-xlsx', label: t('cmd.action.exportXlsx'), onSelect: () => downloadFromAPI('/api/export/xlsx'), Icon: FileSpreadsheet, iconClass: 'text-emerald-500' },
  ], [t, onExportCsv, onExportBib])
  const filteredExports = useMemo(() => fuzzyFilterSort(query, exportEntries), [query, exportEntries])

  const settingsEntries: CmdEntry[] = useMemo(() => [
    { id: 'set-theme', label: t('cmd.action.toggleTheme'), onSelect: () => dispatchAppEvent('matlit:toggle-theme'), Icon: SunMoon, iconClass: 'text-amber-500' },
    { id: 'set-lang', label: t('cmd.action.toggleLanguage'), onSelect: () => dispatchAppEvent('matlit:toggle-language'), Icon: Languages, iconClass: 'text-sky-500' },
    { id: 'set-help', label: t('cmd.action.openHelp'), onSelect: () => dispatchAppEvent('matlit:shortcut', { action: 'help' }), Icon: HelpCircle, iconClass: 'text-violet-500' },
  ], [t])
  const filteredSettings = useMemo(() => fuzzyFilterSort(query, settingsEntries), [query, settingsEntries])

  const handleSelectMaterial = useCallback((materialId: string) => {
    onNavigateTab('papers', materialId)
    onOpenChange(false)
  }, [onNavigateTab, onOpenChange])

  // Selecting a paper result dispatches a `matlit:open-paper` window event
  // carrying the paper's id + the full lightweight payload (so the
  // Papers tab can open the drawer without an extra fetch), then
  // navigates to the Papers tab scoped to the paper's material so the
  // surrounding list is consistent with the drawer contents.
  const handleSelectPaper = useCallback((paper: {
    id: string
    title: string
    doi: string
    year: number | null
    materialId: string
    materialName: string
  }) => {
    dispatchAppEvent('matlit:open-paper', paper)
    onNavigateTab('papers', paper.materialId)
    onOpenChange(false)
  }, [onNavigateTab, onOpenChange])

  const handleSelectTab = useCallback((tab: TabValue) => {
    onNavigateTab(tab)
    onOpenChange(false)
  }, [onNavigateTab, onOpenChange])

  const handleAction = useCallback((fn: () => void) => {
    fn()
    onOpenChange(false)
  }, [onOpenChange])

  // Unified lookup of every command by its `value` string. Used both to
  // resolve recent entries back to their original icon/label/onSelect and
  // to provide a single `runCommand(value)` entry point that records the
  // selection into the recents list before dispatching the original action.
  const papers = papersData ?? []
  const allCommandsLookup = useMemo(() => {
    const map = new Map<string, { label: string; Icon: LucideIcon; iconClass: string; onSelect: () => void }>()
    tabs.forEach((tb) => {
      map.set(`tab-${tb.value}`, {
        label: tb.label,
        Icon: Search,
        iconClass: 'text-sky-500',
        onSelect: () => handleSelectTab(tb.value),
      })
    })
    actionEntries.forEach((e) => {
      map.set(e.id, { label: e.label, Icon: e.Icon, iconClass: e.iconClass, onSelect: () => handleAction(e.onSelect) })
    })
    exportEntries.forEach((e) => {
      map.set(e.id, { label: e.label, Icon: e.Icon, iconClass: e.iconClass, onSelect: () => handleAction(e.onSelect) })
    })
    settingsEntries.forEach((e) => {
      map.set(e.id, { label: e.label, Icon: e.Icon, iconClass: e.iconClass, onSelect: () => handleAction(e.onSelect) })
    })
    materials.forEach((m) => {
      map.set(`mat-${m.id}`, {
        label: m.name,
        Icon: FlaskConical,
        iconClass: 'text-emerald-500',
        onSelect: () => handleSelectMaterial(m.id),
      })
    })
    papers.forEach((p) => {
      map.set(`paper-${p.id}`, {
        label: p.title,
        Icon: FileText,
        iconClass: 'text-amber-500',
        onSelect: () => handleSelectPaper(p),
      })
    })
    return map
  }, [tabs, actionEntries, exportEntries, settingsEntries, materials, papers, handleSelectTab, handleAction, handleSelectMaterial, handleSelectPaper])

  // Push a command value to the top of the recents list (dedupe, cap 8)
  // and persist to localStorage. Swallows quota-exceeded errors so a full
  // storage never breaks command dispatch.
  const pushRecent = useCallback((value: string) => {
    setRecents((prev) => {
      const next = [value, ...prev.filter((v) => v !== value)].slice(0, RECENTS_MAX)
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
      } catch {
        // ignore quota-exceeded — recents stay in memory only
      }
      return next
    })
  }, [])

  const clearRecents = useCallback(() => {
    setRecents([])
    try {
      localStorage.removeItem(RECENTS_KEY)
    } catch {
      // ignore
    }
  }, [])

  // Single entry point for any command selection: record into recents,
  // then dispatch the original handler. Used by both the main groups and
  // the Recents group so the recording logic lives in one place.
  const runCommand = useCallback((value: string) => {
    const cmd = allCommandsLookup.get(value)
    if (!cmd) return
    pushRecent(value)
    cmd.onSelect()
  }, [allCommandsLookup, pushRecent])

  // Recents filtered by the current query. Values whose underlying command
  // no longer exists (e.g. a material was deleted) are dropped silently.
  const filteredRecents = useMemo(() => {
    const valid = recents.filter((v) => allCommandsLookup.has(v))
    const entries = valid.map((v) => ({ value: v, label: allCommandsLookup.get(v)!.label }))
    return fuzzyFilterSort(query, entries).map((e) => e.value)
  }, [recents, allCommandsLookup, query])

  // Collect visible groups so we can render separators only between them
  // (no leading/trailing separator when a group is filtered out). When all
  // groups are empty, no children render and <CommandEmpty> shows instead.
  const groups: Array<{ key: string; node: ReactNode }> = []

  if (filteredMaterials.length > 0) {
    groups.push({
      key: 'materials',
      node: (
        <CommandGroup heading={t('cmd.group.materials')}>
          {filteredMaterials.map((m) => (
            <CommandItem
              key={m.id}
              value={`mat-${m.id}`}
              onSelect={() => runCommand(`mat-${m.id}`)}
              className="gap-2"
            >
              <FlaskConical className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="font-mono text-sm">{highlightMatch(m.name, query)}</span>
              {m.aliases && (
                <span className="text-xs text-muted-foreground truncate ml-1">
                  {highlightMatch(m.aliases, query)}
                </span>
              )}
              <ArrowRight className="w-3 h-3 ml-auto text-slate-400" />
            </CommandItem>
          ))}
        </CommandGroup>
      ),
    })
  }

  // Papers group — server-side search via /api/papers/search?q=. Only
  // shown when there is a non-empty debounced query (matches against
  // title / abstract / DOI). While the request is in flight we show
  // a single "Searching…" item so the user knows their keystrokes are
  // being acted on. When the request settles with zero results the
  // group is omitted entirely so <CommandEmpty> can take over.
  if (papers.length > 0 || (isPapersFetching && debouncedQuery.length > 0)) {
    groups.push({
      key: 'papers',
      node: (
        <CommandGroup heading={t('cmd.group.papers')}>
          {papers.length === 0 && isPapersFetching ? (
            <CommandItem value="papers-searching" disabled className="gap-2 opacity-70">
              <FileText className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
              <span className="text-sm">
                {t('cmd.searching', { q: debouncedQuery })}
              </span>
            </CommandItem>
          ) : (
            papers.map((p) => (
              <CommandItem
                key={p.id}
                value={`paper-${p.id}`}
                onSelect={() => runCommand(`paper-${p.id}`)}
                className="gap-2"
              >
                <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-sm font-medium line-clamp-1 min-w-0 flex-1">
                  {highlightMatch(p.title, query)}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {p.year && (
                    <span className="text-[10px] tabular-nums text-slate-400">{p.year}</span>
                  )}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                    {p.materialName}
                  </span>
                  {p.doi && (
                    <a
                      href={`https://doi.org/${p.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center text-[10px] text-sky-600 dark:text-sky-400 hover:underline"
                      title={`DOI: ${p.doi}`}
                    >
                      DOI <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </span>
                <ArrowRight className="w-3 h-3 ml-auto text-slate-400" />
              </CommandItem>
            ))
          )}
        </CommandGroup>
      ),
    })
  }

  if (filteredTabs.length > 0) {
    groups.push({
      key: 'nav',
      node: (
        <CommandGroup heading={t('cmd.group.navigation')}>
          {filteredTabs.map((tb) => (
            <CommandItem
              key={tb.value}
              value={`tab-${tb.value}`}
              onSelect={() => runCommand(`tab-${tb.value}`)}
              className="gap-2"
            >
              <Search className="w-4 h-4 text-sky-500 shrink-0" />
              <span>{highlightMatch(tb.label, query)}</span>
              <ArrowRight className="w-3 h-3 ml-auto text-slate-400" />
            </CommandItem>
          ))}
        </CommandGroup>
      ),
    })
  }

  if (filteredActions.length > 0) {
    groups.push({
      key: 'actions',
      node: (
        <CommandGroup heading={t('cmd.group.actions')}>
          {filteredActions.map(({ id, label, Icon, iconClass }) => (
            <CommandItem
              key={id}
              value={id}
              onSelect={() => runCommand(id)}
              className="gap-2"
            >
              <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
              <span>{highlightMatch(label, query)}</span>
              <ArrowRight className="w-3 h-3 ml-auto text-slate-400" />
            </CommandItem>
          ))}
        </CommandGroup>
      ),
    })
  }

  if (filteredExports.length > 0) {
    groups.push({
      key: 'exports',
      node: (
        <CommandGroup heading={t('cmd.group.export')}>
          {filteredExports.map(({ id, label, Icon, iconClass }) => (
            <CommandItem
              key={id}
              value={id}
              onSelect={() => runCommand(id)}
              className="gap-2"
            >
              <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
              <span>{highlightMatch(label, query)}</span>
              <ArrowRight className="w-3 h-3 ml-auto text-slate-400" />
            </CommandItem>
          ))}
        </CommandGroup>
      ),
    })
  }

  if (filteredSettings.length > 0) {
    groups.push({
      key: 'settings',
      node: (
        <CommandGroup heading={t('cmd.group.settings')}>
          {filteredSettings.map(({ id, label, Icon, iconClass }) => (
            <CommandItem
              key={id}
              value={id}
              onSelect={() => runCommand(id)}
              className="gap-2"
            >
              <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
              <span>{highlightMatch(label, query)}</span>
              <ArrowRight className="w-3 h-3 ml-auto text-slate-400" />
            </CommandItem>
          ))}
        </CommandGroup>
      ),
    })
  }

  // Recents group sits at the very top so the most recently used commands
  // are always one keystroke away. Only render when there is at least one
  // recent that still resolves (and matches the current query). The
  // "Clear recents" item is appended at the end of the group.
  if (filteredRecents.length > 0) {
    groups.unshift({
      key: 'recents',
      node: (
        <CommandGroup heading={t('cmd.group.recents')}>
          {filteredRecents.map((value) => {
            const cmd = allCommandsLookup.get(value)!
            const Icon = cmd.Icon
            return (
              <CommandItem
                key={`recent-${value}`}
                value={`recent-${value}`}
                onSelect={() => runCommand(value)}
                className="gap-2"
              >
                <Icon className={`w-4 h-4 shrink-0 ${cmd.iconClass}`} />
                <span>{highlightMatch(cmd.label, query)}</span>
                <ArrowRight className="w-3 h-3 ml-auto text-slate-400" />
              </CommandItem>
            )
          })}
          <CommandItem
            key="recent-clear"
            value="recent-clear"
            onSelect={() => {
              clearRecents()
              onOpenChange(false)
            }}
            className="gap-2 text-muted-foreground"
          >
            <Trash2 className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{t('cmd.clearRecents')}</span>
          </CommandItem>
        </CommandGroup>
      ),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden sm:max-w-[560px] top-[20%] translate-y-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('cmd.placeholder')}
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>{t('cmd.empty')}</CommandEmpty>
            {groups.map((g, i) => (
              <Fragment key={g.key}>
                {i > 0 && <CommandSeparator />}
                {g.node}
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
