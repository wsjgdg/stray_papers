'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Save, Trash2, Loader2, KeyRound, Database, Trash,
  Eye, EyeOff, Download, Upload, CheckCircle2, XCircle, ExternalLink, Zap,
  Plus, ChevronUp, ChevronDown, ChevronRight, Server, Search, HardDriveDownload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useI18n } from '@/components/i18n/provider'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import {
  loadConfig,
  saveConfig,
  newLLMConfigEntry,
  newSearchConfigEntry,
  DEFAULT_OPENAI_BASE_URL,
  type MultiConfig,
  type LLMConfigEntry,
  type SearchConfigEntry,
  type LLMProvider,
  type SearchConfigType,
} from '@/lib/config-store'
import { LLMModelFetcher } from '@/components/llm-model-fetcher'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COMMON_LLM_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'] as const

const SEARCH_TYPES: Array<{ value: SearchConfigType; en: string; zh: string }> = [
  { value: 's2', en: 'Semantic Scholar', zh: 'Semantic Scholar' },
  { value: 'crossref', en: 'Crossref', zh: 'Crossref' },
  { value: 'openalex', en: 'OpenAlex', zh: 'OpenAlex' },
  { value: 'unpaywall', en: 'Unpaywall', zh: 'Unpaywall' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Cache stats (kept for the unchanged cache section)
// ─────────────────────────────────────────────────────────────────────────────

interface CacheStats {
  entries: number
  hits: number
  misses: number
  hitRate: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Test-button state
// ─────────────────────────────────────────────────────────────────────────────

type TestStatus = 'idle' | 'testing' | 'ok' | 'error'
type TestStateMap = Record<string, { status: TestStatus; message: string }>

// ─────────────────────────────────────────────────────────────────────────────
// Small inline i18n helper — kept inline per task constraints (do NOT modify
// the i18n provider).
// ─────────────────────────────────────────────────────────────────────────────
function useL() {
  const { locale } = useI18n()
  return (en: string, zh: string) => (locale === 'zh' ? zh : en)
}

export function SettingsDialog({
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  open?: boolean
  onOpenChange?: (o: boolean) => void
} = {}) {
  const { t } = useI18n()
  const L = useL()
  const qc = useQueryClient()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = onOpenChangeProp ?? setInternalOpen
  const [config, setConfig] = useState<MultiConfig>({ llm: [], search: [] })
  const [expandedLLM, setExpandedLLM] = useState<Record<string, boolean>>({})

  // Test-button state, keyed by `${kind}-${id}` (kind = 'llm' | 's2' | ...)
  const [testState, setTestState] = useState<TestStateMap>({})
  // Show/hide password toggles, keyed by entry id
  const [showPwd, setShowPwd] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  // T8: separate ref for the database backup/restore file input — keeps the
  // existing config-import ref untouched so the two flows don't collide.
  const backupFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setConfig(loadConfig())
      setTestState({})
      setShowPwd({})
      setExpandedLLM({})
    }
  }, [open])

  // Cache stats — only fetched when the dialog is open
  const { data: cacheStats, refetch: refetchCache } = useQuery<CacheStats>({
    queryKey: ['cache-stats'],
    queryFn: () => api('/api/cache/clear'),
    enabled: open,
    staleTime: 5_000,
  })

  const clearCacheMut = useMutation({
    mutationFn: () => api<{ cleared: number; remaining: number }>('/api/cache/clear', { method: 'POST' }),
    onSuccess: (d) => {
      toast.success(t('settings.cache.cleared', { n: d.cleared }))
      refetchCache()
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['nav-stats'] })
    },
    onError: (e) => toast.error(`Failed: ${(e as Error).message}`),
  })

  // ── T8: Database backup / restore ──────────────────────────────────────
  //
  // The `/api/backup` GET returns a JSON attachment (Content-Disposition:
  // attachment), so `window.open` triggers the browser's download UI without
  // us having to ferry a multi-MB blob through React state.
  //
  // `/api/restore` POST takes the same JSON shape (an outer `{ data: {...} }`
  // envelope) and idempotently inserts materials + papers that don't already
  // exist. On success we invalidate the global stats / nav-stats queries so
  // the dashboard reflects the newly-restored rows immediately.
  const restoreMut = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      // Parse defensively so we can throw a useful error before hitting the
      // network (the API also validates, but a local pre-check gives the
      // user a clearer message for obviously-bad files).
      const parsed = JSON.parse(text) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(L('Invalid backup file: expected a JSON object', '备份文件无效：应为 JSON 对象'))
      }
      return api<{ ok: true; inserted: { materials: number; papers: number; classifications: number; efficiencies: number; verifications: number } }>('/api/restore', {
        method: 'POST',
        body: JSON.stringify(parsed),
      })
    },
    onSuccess: (d) => {
      const total = d.inserted.materials + d.inserted.papers + d.inserted.classifications + d.inserted.efficiencies + d.inserted.verifications
      toast.success(
        L(
          `Restored ${total} records (M:${d.inserted.materials} P:${d.inserted.papers} C:${d.inserted.classifications} E:${d.inserted.efficiencies} V:${d.inserted.verifications})`,
          `已恢复 ${total} 条记录（材料:${d.inserted.materials} 论文:${d.inserted.papers} 分类:${d.inserted.classifications} 效率:${d.inserted.efficiencies} 验证:${d.inserted.verifications}）`,
        ),
      )
      // Refresh everything that shows counts derived from the DB.
      qc.invalidateQueries()
    },
    onError: (e) => {
      toast.error(`${L('Restore failed', '恢复失败')}: ${(e as Error).message}`)
    },
  })

  const handleExportBackup = () => {
    // `window.open` lets the browser handle the download — no React state,
    // no fetch wrapper, no quota concern for large backups.
    try {
      window.open('/api/backup', '_blank')
      toast.info(L('Backup download started', '备份下载已开始'))
    } catch {
      toast.error(L('Failed to start backup', '启动备份失败'))
    }
  }

  const handleImportBackupClick = () => backupFileRef.current?.click()

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    restoreMut.mutate(file)
    // Reset the input so the same file can be selected again later.
    if (backupFileRef.current) backupFileRef.current.value = ''
  }

  // ── Save / Clear ────────────────────────────────────────────────────────
  const handleSave = () => {
    try {
      saveConfig(config)
      toast.success(t('settings.saved'))
      setOpen(false)
    } catch {
      toast.error('Failed to save settings')
    }
  }

  const handleClear = () => {
    setConfig({ llm: [], search: [] })
    setTestState({})
    setExpandedLLM({})
    try {
      saveConfig({ llm: [], search: [] })
    } catch { /* ignore */ }
    toast.success(t('settings.cleared'))
  }

  // ── Connection test (per-entry) ─────────────────────────────────────────
  async function runTest(
    field: string,
    path: string,
    method: 'GET' | 'POST' = 'GET',
    extraHeaders?: Record<string, string>,
  ) {
    setTestState((p) => ({ ...p, [field]: { status: 'testing', message: '' } }))
    try {
      const result = await api<{ ok: boolean; message: string }>(path, {
        method,
        headers: extraHeaders,
      })
      setTestState((p) => ({
        ...p,
        [field]: { status: result.ok ? 'ok' : 'error', message: result.message },
      }))
    } catch (e) {
      setTestState((p) => ({
        ...p,
        [field]: { status: 'error', message: (e as Error).message || 'Network error' },
      }))
    }
  }

  const testLLM = (entry: LLMConfigEntry) =>
    runTest(
      `llm-${entry.id}`,
      '/api/keys/check/llm',
      'POST',
      {
        'x-llm-provider': entry.provider,
        'x-llm-baseurl': entry.baseURL,
        'x-llm-apikey': entry.apiKey,
        'x-llm-model': entry.model,
      },
    )

  const testSearch = (entry: SearchConfigEntry) => {
    const field = `${entry.type}-${entry.id}`
    const headerKey: Record<SearchConfigType, string> = {
      s2: 'x-s2-key',
      crossref: 'x-crossref-email',
      openalex: 'x-openalex-email',
      unpaywall: 'x-unpaywall-email',
    }
    const path: Record<SearchConfigType, string> = {
      s2: '/api/keys/check/s2',
      crossref: '/api/keys/check/crossref',
      openalex: '/api/keys/check/openalex',
      unpaywall: '/api/keys/check/unpaywall',
    }
    return runTest(field, path[entry.type], 'GET', { [headerKey[entry.type]]: entry.key })
  }

  // ── Password show/hide ─────────────────────────────────────────────────
  const togglePwd = (field: string) =>
    setShowPwd((p) => ({ ...p, [field]: !p[field] }))

  // ── Import / Export ─────────────────────────────────────────────────────
  const handleExport = () => {
    try {
      const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'matlit-multi-config.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(L('Config exported', '配置已导出'))
    } catch {
      toast.error(L('Export failed', '导出失败'))
    }
  }

  const handleImportClick = () => fileInputRef.current?.click()

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Invalid JSON: expected an object')
      }
      const p = parsed as Record<string, unknown>
      // Detect format: new (has `llm` or `search` arrays) vs. legacy.
      const hasNew = Array.isArray(p.llm) || Array.isArray(p.search)
      const hasLegacy =
        typeof p.semanticScholar === 'string' ||
        typeof p.crossref === 'string' ||
        typeof p.openalex === 'string' ||
        typeof p.llmProvider === 'string' ||
        typeof p.llmBaseURL === 'string' ||
        typeof p.llmApiKey === 'string' ||
        typeof p.llmModel === 'string'
      if (hasNew) {
        // Merge: append imported entries to current config (renumbering
        // priority to the end so nothing collides).
        const imported = p as { llm?: unknown[]; search?: unknown[] }
        const maxLLMPrio = config.llm.reduce((m, e) => Math.max(m, e.priority), -1)
        const maxSearchPrio = config.search.reduce((m, e) => Math.max(m, e.priority), -1)
        const newLLM = (Array.isArray(imported.llm) ? imported.llm : [])
          .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
          .map((e, i) => coerceLLMEntry(e, `imported-llm-${i}`, maxLLMPrio + 1 + i))
        const newSearch = (Array.isArray(imported.search) ? imported.search : [])
          .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
          .map((e, i) => coerceSearchEntry(e, `imported-search-${i}`, maxSearchPrio + 1 + i))
        setConfig((prev) => ({
          llm: [...prev.llm, ...newLLM],
          search: [...prev.search, ...newSearch],
        }))
      } else if (hasLegacy) {
        // Legacy import: convert to a single LLM entry + search entries,
        // appended to the current config.
        const maxLLMPrio = config.llm.reduce((m, e) => Math.max(m, e.priority), -1)
        const maxSearchPrio = config.search.reduce((m, e) => Math.max(m, e.priority), -1)
        const additions: MultiConfig = { llm: [], search: [] }
        if (
          typeof p.llmProvider === 'string' ||
          typeof p.llmBaseURL === 'string' ||
          typeof p.llmApiKey === 'string' ||
          typeof p.llmModel === 'string'
        ) {
          const provider: LLMProvider = p.llmProvider === 'openai' ? 'openai' : 'zai'
          additions.llm.push(
            newLLMConfigEntry({
              label: provider === 'openai' ? 'OpenAI (imported)' : 'Z.ai (imported)',
              provider,
              baseURL: typeof p.llmBaseURL === 'string' ? p.llmBaseURL : '',
              apiKey: typeof p.llmApiKey === 'string' ? p.llmApiKey : '',
              model: typeof p.llmModel === 'string' ? p.llmModel : '',
              enabled: true,
              priority: maxLLMPrio + 1,
            }),
          )
        }
        let searchPrio = maxSearchPrio + 1
        const tryAddSearch = (
          type: SearchConfigType,
          val: unknown,
          label: string,
        ) => {
          if (typeof val === 'string' && val) {
            additions.search.push(
              newSearchConfigEntry(type, {
                label: `${label} (imported)`,
                key: val,
                enabled: true,
                priority: searchPrio++,
              }),
            )
          }
        }
        tryAddSearch('s2', p.semanticScholar, 'Semantic Scholar')
        tryAddSearch('crossref', p.crossref, 'Crossref')
        tryAddSearch('openalex', p.openalex, 'OpenAlex')
        setConfig((prev) => ({
          llm: [...prev.llm, ...additions.llm],
          search: [...prev.search, ...additions.search],
        }))
      } else {
        throw new Error('Unrecognized config format')
      }
      toast.success(L('Config imported', '配置已导入'))
    } catch (err) {
      toast.error(`${L('Import failed', '导入失败')}: ${(err as Error).message}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── LLM entry mutators ─────────────────────────────────────────────────
  const sortedLLM = config.llm.slice().sort((a, b) => a.priority - b.priority)

  const addLLM = () => {
    const maxPrio = config.llm.reduce((m, e) => Math.max(m, e.priority), -1)
    const entry = newLLMConfigEntry({ priority: maxPrio + 1 })
    setConfig((prev) => ({ ...prev, llm: [...prev.llm, entry] }))
    setExpandedLLM((p) => ({ ...p, [entry.id]: true }))
  }

  const updateLLM = (id: string, patch: Partial<LLMConfigEntry>) =>
    setConfig((prev) => ({
      ...prev,
      llm: prev.llm.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))

  const removeLLM = (id: string) => {
    setConfig((prev) => ({ ...prev, llm: prev.llm.filter((e) => e.id !== id) }))
    setTestState((p) => {
      const next = { ...p }
      delete next[`llm-${id}`]
      return next
    })
  }

  const moveLLM = (id: string, dir: -1 | 1) => {
    const arr = sortedLLM
    const i = arr.findIndex((e) => e.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    const a = arr[i]
    const b = arr[j]
    const tmp = a.priority
    a.priority = b.priority
    b.priority = tmp
    setConfig((prev) => ({ ...prev, llm: prev.llm.map((e) => (e.id === a.id ? a : e.id === b.id ? b : e)) }))
  }

  // ── Search entry mutators ──────────────────────────────────────────────
  const sortedSearch = config.search.slice().sort((a, b) => a.priority - b.priority)

  const addSearch = () => {
    const maxPrio = config.search.reduce((m, e) => Math.max(m, e.priority), -1)
    const entry = newSearchConfigEntry('s2', { priority: maxPrio + 1 })
    setConfig((prev) => ({ ...prev, search: [...prev.search, entry] }))
  }

  const updateSearch = (id: string, patch: Partial<SearchConfigEntry>) =>
    setConfig((prev) => ({
      ...prev,
      search: prev.search.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))

  const removeSearch = (id: string) => {
    setConfig((prev) => ({ ...prev, search: prev.search.filter((e) => e.id !== id) }))
    setTestState((p) => {
      const next = { ...p }
      for (const k of Object.keys(next)) {
        if (k.endsWith(`-${id}`)) delete next[k]
      }
      return next
    })
  }

  const moveSearch = (id: string, dir: -1 | 1) => {
    const arr = sortedSearch
    const i = arr.findIndex((e) => e.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    const a = arr[i]
    const b = arr[j]
    const tmp = a.priority
    a.priority = b.priority
    b.priority = tmp
    setConfig((prev) => ({ ...prev, search: prev.search.map((e) => (e.id === a.id ? a : e.id === b.id ? b : e)) }))
  }

  // ── Small presentational helpers ───────────────────────────────────────
  const KeyLink = ({ href, text }: { href: string; text: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-violet-600 hover:underline dark:text-violet-400"
    >
      {text} <ExternalLink className="w-2.5 h-2.5" />
    </a>
  )

  const TestButton = ({
    field,
    onClick,
    compact,
  }: {
    field: string
    onClick: () => void
    compact?: boolean
  }) => {
    const s = testState[field] ?? { status: 'idle' as TestStatus, message: '' }
    return (
      <div className={`flex items-center gap-2 ${compact ? '' : 'mt-1.5'} min-h-[24px]`}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onClick}
          disabled={s.status === 'testing'}
          className="h-7 px-2.5 text-xs"
        >
          {s.status === 'testing' ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : s.status === 'ok' ? (
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
          ) : s.status === 'error' ? (
            <XCircle className="w-3 h-3 mr-1 text-red-500" />
          ) : (
            <Zap className="w-3 h-3 mr-1" />
          )}
          {L('Test', '测试')}
        </Button>
        {s.status === 'ok' && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">OK</span>
        )}
        {s.status === 'error' && (
          <span
            className="text-[10px] text-red-500 dark:text-red-400 truncate max-w-[180px]"
            title={s.message}
          >
            {s.message}
          </span>
        )}
      </div>
    )
  }

  const PasswordInput = ({
    field,
    value,
    onChange,
    placeholder,
  }: {
    field: string
    value: string
    onChange: (v: string) => void
    placeholder: string
  }) => (
    <div className="relative mt-1">
      <Input
        type={showPwd[field] ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm pr-9"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => togglePwd(field)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        tabIndex={-1}
        aria-label={showPwd[field] ? L('Hide', '隐藏') : L('Show', '显示')}
      >
        {showPwd[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 w-9 px-0" aria-label={t('settings.title')} title={t('settings.title')}>
          <Settings className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-500" /> {t('settings.title')}
          </DialogTitle>
          <DialogDescription>{t('settings.desc')}</DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* ── LLM Backends ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" /> {L('LLM Backends', 'LLM 后端')}
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addLLM}
                className="h-7 px-2.5 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" /> {L('Add LLM', '添加 LLM')}
              </Button>
            </div>
            {sortedLLM.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic px-1 py-2">
                {L(
                  'No LLM backends configured. The default Z.ai free tier will be used.',
                  '尚未配置 LLM 后端。将使用默认的 Z.ai 免费层。',
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {sortedLLM.map((entry, idx) => {
                  const field = `llm-${entry.id}`
                  const expanded = expandedLLM[entry.id] ?? false
                  return (
                    <Collapsible
                      key={entry.id}
                      open={expanded}
                      onOpenChange={(o) => setExpandedLLM((p) => ({ ...p, [entry.id]: o }))}
                      className="rounded-md border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-1.5 p-2">
                        {/* Priority controls */}
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveLLM(entry.id, -1)}
                            disabled={idx === 0}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                            aria-label={L('Move up', '上移')}
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLLM(entry.id, 1)}
                            disabled={idx === sortedLLM.length - 1}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                            aria-label={L('Move down', '下移')}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono w-6 text-center">
                          #{idx + 1}
                        </span>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-transform"
                            aria-label={expanded ? L('Collapse', '收起') : L('Expand', '展开')}
                          >
                            <ChevronRight
                              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                            />
                          </button>
                        </CollapsibleTrigger>
                        <Input
                          value={entry.label}
                          onChange={(e) => updateLLM(entry.id, { label: e.target.value })}
                          placeholder={L('Label (e.g. OpenAI Production)', '标签（如 OpenAI 生产）')}
                          className="h-7 text-xs flex-1"
                        />
                        <Select
                          value={entry.provider}
                          onValueChange={(v) => updateLLM(entry.id, { provider: v as LLMProvider })}
                        >
                          <SelectTrigger className="w-[110px] h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="zai">Z.ai (free)</SelectItem>
                            <SelectItem value="openai">OpenAI-compatible</SelectItem>
                          </SelectContent>
                        </Select>
                        <Switch
                          checked={entry.enabled}
                          onCheckedChange={(v) => updateLLM(entry.id, { enabled: v })}
                          aria-label={L('Enable', '启用')}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeLLM(entry.id)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          aria-label={L('Delete', '删除')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-100 dark:border-slate-800">
                          {entry.provider === 'openai' && (
                            <>
                              <div>
                                <div className="flex items-center justify-between">
                                  <Label className="text-[10px] text-slate-500">{L('Base URL', '基础 URL')}</Label>
                                  <button
                                    type="button"
                                    onClick={() => updateLLM(entry.id, { baseURL: DEFAULT_OPENAI_BASE_URL })}
                                    className="text-[10px] text-violet-600 hover:underline dark:text-violet-400"
                                  >
                                    {L('Use default', '使用默认')}
                                  </button>
                                </div>
                                <Input
                                  value={entry.baseURL}
                                  onChange={(e) => updateLLM(entry.id, { baseURL: e.target.value })}
                                  placeholder={DEFAULT_OPENAI_BASE_URL}
                                  className="mt-1 text-xs font-mono h-7"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-500">{L('API Key', 'API 密钥')}</Label>
                                <PasswordInput
                                  field={entry.id}
                                  value={entry.apiKey}
                                  onChange={(v) => updateLLM(entry.id, { apiKey: v })}
                                  placeholder="sk-..."
                                />
                                <KeyLink
                                  href="https://platform.openai.com/api-keys"
                                  text={L('Get API key', '获取 API 密钥')}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-500">{L('Model', '模型')}</Label>
                                <div className="mt-1 flex gap-2">
                                  <Input
                                    value={entry.model}
                                    onChange={(e) => updateLLM(entry.id, { model: e.target.value })}
                                    placeholder="gpt-4o-mini"
                                    className="text-xs font-mono h-7 flex-1"
                                  />
                                  <Select
                                    value={
                                      COMMON_LLM_MODELS.includes(entry.model as typeof COMMON_LLM_MODELS[number])
                                        ? entry.model
                                        : 'custom'
                                    }
                                    onValueChange={(v) => {
                                      if (v === 'custom') {
                                        updateLLM(entry.id, { model: '' })
                                      } else {
                                        updateLLM(entry.id, { model: v })
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-[140px] h-7 text-xs">
                                      <SelectValue placeholder={L('Preset', '预设')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {COMMON_LLM_MODELS.map((m) => (
                                        <SelectItem key={m} value={m}>{m}</SelectItem>
                                      ))}
                                      <SelectItem value="custom">{L('(custom)', '(自定义)')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {/* P2: Fetch available models from the provider's /v1/models endpoint */}
                                {entry.provider === 'openai' && entry.baseURL && entry.apiKey && (
                                  <div className="mt-1.5">
                                    <LLMModelFetcher
                                      config={{ provider: entry.provider, baseURL: entry.baseURL, apiKey: entry.apiKey }}
                                      onModelSelect={(modelId) => updateLLM(entry.id, { model: modelId })}
                                    />
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                          {entry.provider === 'zai' && (
                            <p className="text-[10px] text-slate-400 italic">
                              {L(
                                'Z.ai free tier — no configuration needed. The backend uses z-ai-web-dev-sdk directly.',
                                'Z.ai 免费层 — 无需配置。后端直接使用 z-ai-web-dev-sdk。',
                              )}
                            </p>
                          )}
                          <TestButton field={field} onClick={() => testLLM(entry)} compact />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Search APIs ──────────────────────────────────────────────── */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" /> {L('Search APIs', '检索 API')}
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addSearch}
                className="h-7 px-2.5 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" /> {L('Add search', '添加检索')}
              </Button>
            </div>
            {sortedSearch.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic px-1 py-2">
                {L(
                  'No search API keys configured. Free-tier rate limits will apply.',
                  '尚未配置检索 API 密钥。将使用免费层速率限制。',
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {sortedSearch.map((entry, idx) => {
                  const field = `${entry.type}-${entry.id}`
                  const typeInfo = SEARCH_TYPES.find((t) => t.value === entry.type) ?? SEARCH_TYPES[0]
                  const placeholder =
                    entry.type === 's2' ? 'x-api-key' : 'your@email.com'
                  return (
                    <div
                      key={entry.id}
                      className="rounded-md border border-slate-200 dark:border-slate-700 p-2 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveSearch(entry.id, -1)}
                            disabled={idx === 0}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                            aria-label={L('Move up', '上移')}
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSearch(entry.id, 1)}
                            disabled={idx === sortedSearch.length - 1}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                            aria-label={L('Move down', '下移')}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono w-6 text-center">
                          #{idx + 1}
                        </span>
                        <Input
                          value={entry.label}
                          onChange={(e) => updateSearch(entry.id, { label: e.target.value })}
                          placeholder={L('Label', '标签')}
                          className="h-7 text-xs flex-1"
                        />
                        <Select
                          value={entry.type}
                          onValueChange={(v) => updateSearch(entry.id, { type: v as SearchConfigType })}
                        >
                          <SelectTrigger className="w-[140px] h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SEARCH_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {L(t.en, t.zh)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Switch
                          checked={entry.enabled}
                          onCheckedChange={(v) => updateSearch(entry.id, { enabled: v })}
                          aria-label={L('Enable', '启用')}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeSearch(entry.id)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          aria-label={L('Delete', '删除')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 pl-[36px]">
                        {entry.type === 's2' ? (
                          <PasswordInput
                            field={`search-${entry.id}`}
                            value={entry.key}
                            onChange={(v) => updateSearch(entry.id, { key: v })}
                            placeholder={placeholder}
                          />
                        ) : (
                          <Input
                            value={entry.key}
                            onChange={(e) => updateSearch(entry.id, { key: e.target.value })}
                            placeholder={placeholder}
                            className="text-xs h-7"
                            type="email"
                          />
                        )}
                        <TestButton field={field} onClick={() => testSearch(entry)} compact />
                      </div>
                      {entry.type !== 's2' && (
                        <p className="pl-[36px] text-[10px] text-slate-400 italic">
                          {L('Polite-pool email — no key needed.', '礼貌池邮箱 — 无需密钥。')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] text-slate-400 italic mt-2">{t('settings.note')}</p>
          </div>

          {/* ── API Cache status ─────────────────────────────────────────── */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
            <Label className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" /> {t('settings.cache.title')}
            </Label>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{t('settings.cache.entries')}</span>
                <span className="font-mono font-medium tabular-nums">
                  {cacheStats?.entries ?? '—'}
                  {cacheStats && cacheStats.hits + cacheStats.misses > 0 && (
                    <span className="text-slate-400 ml-2 text-[10px]">
                      ({(cacheStats.hitRate * 100).toFixed(0)}% hit · {cacheStats.hits}/{cacheStats.hits + cacheStats.misses})
                    </span>
                  )}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearCacheMut.mutate()}
                disabled={clearCacheMut.isPending}
                className="h-7 text-xs w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
              >
                {clearCacheMut.isPending ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Trash className="w-3 h-3 mr-1" />
                )}
                {t('settings.cache.clear')}
              </Button>
              <p className="text-[10px] text-slate-400 italic">
                {t('settings.cache.note')}
              </p>
            </div>
          </div>

          {/* ── T8: Data Management (database backup / restore) ──────────── */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
            <Label className="text-xs font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
              <HardDriveDownload className="w-3.5 h-3.5" /> {L('Data Management', '数据管理')}
            </Label>
            <p className="text-[10px] text-slate-400 italic mt-1">
              {L(
                'Export the entire database (materials, papers, classifications, efficiencies, verifications) to a JSON file, or restore from a previously-exported backup.',
                '将整个数据库（材料、论文、分类、效率、验证记录）导出为 JSON 文件，或从之前导出的备份中恢复。',
              )}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportBackup}
                className="h-8 text-xs border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                {L('Export backup', '导出备份')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportBackupClick}
                disabled={restoreMut.isPending}
                className="h-8 text-xs border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300"
              >
                {restoreMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 mr-1" />
                )}
                {L('Import backup', '导入备份')}
              </Button>
            </div>
            <p className="text-[10px] text-slate-400 italic mt-1.5">
              {L(
                'Restore is additive — existing records are not overwritten.',
                '恢复为增量操作 — 不会覆盖已有记录。',
              )}
            </p>
          </div>
        </div>

        {/* hidden file input for Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
          aria-hidden="true"
        />

        {/* T8: hidden file input for database backup restore */}
        <input
          ref={backupFileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportBackupFile}
          className="hidden"
          aria-hidden="true"
        />

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex gap-2 w-full">
            <Button variant="outline" size="sm" onClick={handleExport} className="flex-1">
              <Download className="w-3.5 h-3.5 mr-1" /> {L('Export', '导出')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportClick} className="flex-1">
              <Upload className="w-3.5 h-3.5 mr-1" /> {L('Import', '导入')}
            </Button>
          </div>
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={handleClear} className="text-red-500 flex-1">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> {t('settings.clear')}
            </Button>
            <Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-700 flex-1">
              <Save className="w-3.5 h-3.5 mr-1" /> {t('settings.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Import-helpers: coerce an arbitrary parsed JSON object into a typed entry.
// Used by `handleImportFile` for both new-format and legacy-format imports.
// ─────────────────────────────────────────────────────────────────────────────

function coerceLLMEntry(
  e: Record<string, unknown>,
  fallbackId: string,
  fallbackPriority: number,
): LLMConfigEntry {
  const provider: LLMProvider = e.provider === 'openai' ? 'openai' : 'zai'
  return {
    id: typeof e.id === 'string' && e.id ? e.id : fallbackId,
    label: typeof e.label === 'string' ? e.label : '',
    provider,
    baseURL: typeof e.baseURL === 'string' ? e.baseURL : '',
    apiKey: typeof e.apiKey === 'string' ? e.apiKey : '',
    model: typeof e.model === 'string' ? e.model : '',
    enabled: e.enabled !== false,
    priority: typeof e.priority === 'number' && Number.isFinite(e.priority) ? e.priority : fallbackPriority,
  }
}

function coerceSearchEntry(
  e: Record<string, unknown>,
  fallbackId: string,
  fallbackPriority: number,
): SearchConfigEntry {
  const validTypes: SearchConfigType[] = ['s2', 'crossref', 'openalex', 'unpaywall']
  const type: SearchConfigType = validTypes.includes(e.type as SearchConfigType)
    ? (e.type as SearchConfigType)
    : 's2'
  return {
    id: typeof e.id === 'string' && e.id ? e.id : fallbackId,
    label: typeof e.label === 'string' ? e.label : '',
    type,
    key: typeof e.key === 'string' ? e.key : '',
    enabled: e.enabled !== false,
    priority: typeof e.priority === 'number' && Number.isFinite(e.priority) ? e.priority : fallbackPriority,
  }
}
