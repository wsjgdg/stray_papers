'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Database,
  ExternalLink,
  Search,
  Sparkles,
  FileText,
  BookOpen,
  FlaskConical,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Globe,
  Library,
  Activity,
  Loader2,
  ImageIcon,
  AlertCircle,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/components/i18n/provider'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import CitationNetwork from '@/components/matlit/citation-network'
import { EmptyState } from '@/components/matlit/empty-state'

interface SourceInfo {
  id: string
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  url: string
  apiDocs: string
  free: boolean
  needsKey: boolean
  rateLimit: string
  coverage: string
  available: boolean
  isEnricher?: boolean
  isExternal?: boolean
}

// Response shape of GET /api/sources/status — the observable snapshot of the
// CrossRef circuit breaker. `retryInSec` is computed server-side so the client
// doesn't need to know the breaker's resetTimeoutMs config.
interface CrossrefBreakerStatusResponse {
  crossref: {
    state: 'closed' | 'open' | 'half-open'
    consecutiveFailures: number
    lastFailureAt: number
    retryInSec: number
  }
}

const SOURCE_ICONS: Record<string, React.ElementType> = {
  semantic_scholar: Search,
  crossref: FileText,
  openalex: Globe,
  arxiv: BookOpen,
  europepmc: Library,
  unpaywall: Sparkles,
  nrel: Zap,
  perovskite_db: FlaskConical,
}

const SOURCE_COLORS: Record<string, string> = {
  semantic_scholar: 'from-orange-400 to-orange-600',
  crossref: 'from-rose-400 to-rose-600',
  openalex: 'from-amber-400 to-amber-600',
  arxiv: 'from-red-400 to-red-600',
  europepmc: 'from-teal-400 to-teal-600',
  unpaywall: 'from-emerald-400 to-emerald-600',
  nrel: 'from-violet-400 to-violet-600',
  perovskite_db: 'from-sky-400 to-sky-600',
}

export default function SourcesTab({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const { t, pick } = useI18n()
  const { data, isLoading } = useQuery<{ sources: SourceInfo[] }>({
    queryKey: ['sources'],
    queryFn: () => api('/api/sources'),
  })

  const sources = data?.sources ?? []

  const searchSources = sources.filter((s) => !s.isEnricher && !s.isExternal)
  const enrichers = sources.filter((s) => s.isEnricher)
  const external = sources.filter((s) => s.isExternal)

  return (
    <div className="space-y-4">
      <Card className="border-amber-200/60 dark:border-amber-900/60 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-500" /> {t('sources.title')}
          </CardTitle>
          <CardDescription>{t('sources.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryStat
              value={searchSources.length}
              label={t('sources.searchSources')}
              icon={Search}
              color="text-sky-600 bg-sky-50 dark:bg-sky-950/30"
            />
            <SummaryStat
              value={enrichers.length}
              label={t('sources.enricher')}
              icon={Sparkles}
              color="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
            />
            <SummaryStat
              value={external.length}
              label={t('sources.external')}
              icon={Database}
              color="text-violet-600 bg-violet-50 dark:bg-violet-950/30"
            />
            <SummaryStat
              value={sources.filter((s) => s.free).length}
              label={t('sources.freeOpen')}
              icon={CheckCircle2}
              color="text-amber-600 bg-amber-50 dark:bg-amber-950/30"
            />
          </div>

          {/* Architecture diagram */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 p-4 mb-2">
            <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              {t('sources.dataFlow')}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {searchSources.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1 bg-white dark:bg-slate-900">
                    <span className={`w-2 h-2 rounded-full bg-gradient-to-br ${SOURCE_COLORS[s.id] || 'from-slate-400 to-slate-600'}`} />
                    {pick(s.name, s.nameZh)}
                  </Badge>
                  {i < searchSources.length - 1 && <span className="text-slate-300 dark:text-slate-700">+</span>}
                </div>
              ))}
              <span className="text-slate-400 mx-1">→</span>
              <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                <Sparkles className="w-3 h-3" /> {t('sources.flow.dedupe')}
              </Badge>
              <span className="text-slate-400 mx-1">→</span>
              <Badge variant="outline" className="gap-1 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900">
                <Sparkles className="w-3 h-3" /> LLM
              </Badge>
              <span className="text-slate-400 mx-1">→</span>
              <Badge variant="outline" className="gap-1 bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900">
                <ShieldCheck className="w-3 h-3" /> {t('sources.flow.verify')}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search sources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-sky-500" />
            {t('sources.searchSources')}
            <Badge variant="secondary" className="ml-1">{searchSources.length}</Badge>
          </CardTitle>
          <CardDescription>
            {t('sources.searchSources.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">{t('common.loading')}</div>
          ) : searchSources.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title={t('sources.searchSources.empty.title')}
              description={t('sources.searchSources.empty.desc')}
              action={
                onOpenSettings
                  ? {
                      label: t('sources.searchSources.empty.cta'),
                      onClick: onOpenSettings,
                    }
                  : undefined
              }
              hint={t('sources.searchSources.empty.hint')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {searchSources.map((s) => (
                <SourceCard key={s.id} source={s} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrichers */}
      {enrichers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              {t('sources.enrichers.title')}
              <Badge variant="secondary" className="ml-1">{enrichers.length}</Badge>
            </CardTitle>
            <CardDescription>
              {t('sources.enrichers.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {enrichers.map((s) => (
                <SourceCard key={s.id} source={s} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* External databases */}
      {external.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-500" />
              {t('sources.externalDbs.title')}
              <Badge variant="secondary" className="ml-1">{external.length}</Badge>
            </CardTitle>
            <CardDescription>
              {t('sources.externalDbs.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {external.map((s) => (
                <SourceCard key={s.id} source={s} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Health Check */}
      <SourcesHealthCheck />

      {/* VLM Phase Diagram Recognition */}
      <VlmPhaseDiagram />

      {/* VLM Batch Phase Diagram */}
      <VlmBatchPhaseDiagram />

      {/* Citation Network */}
      <CitationNetwork />
    </div>
  )
}

function SummaryStat({ value, label, icon: Icon, color }: { value: number; label: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-md flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}

function SourceCard({ source }: { source: SourceInfo }) {
  const { t, pick } = useI18n()
  const Icon = SOURCE_ICONS[source.id] || Database
  const colorClass = SOURCE_COLORS[source.id] || 'from-slate-400 to-slate-600'
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center shrink-0 shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold">{pick(source.name, source.nameZh)}</h4>
            {source.isEnricher && (
              <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                <Sparkles className="w-2.5 h-2.5" /> enricher
              </Badge>
            )}
            {source.isExternal && (
              <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900">
                <Database className="w-2.5 h-2.5" /> external
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {pick(source.description, source.descriptionZh)}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500 flex-wrap">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              {source.coverage}
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>{source.rateLimit}</span>
          </div>
          {(source.id === 'crossref' || source.id === 'semantic_scholar' || source.id === 'openalex') && (
            <BreakerBadge sourceId={source.id} />
          )}
          <div className="flex items-center gap-2 mt-3">
            <Button asChild variant="outline" size="sm" className="h-9 sm:h-7 text-xs">
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3 mr-1" />
                {t('sources.viewSite')}
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-9 sm:h-7 text-xs">
              <a href={source.apiDocs} target="_blank" rel="noopener noreferrer">
                API docs
              </a>
            </Button>
            <Badge variant="outline" className={`text-[10px] sm:text-[9px] ml-auto ${source.free ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900' : ''}`}>
              {source.free ? t('sources.free') : t('sources.needsKey')}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * CrossRef circuit-breaker status pill, shown inside the Crossref source card.
 *
 * Polls GET /api/sources/status every 30s and renders one of three states:
 *   - closed    → green "Healthy"  badge + reassurance caption.
 *   - open      → red   "Circuit open" badge + consecutiveFailures count +
 *                       "retry in {n}s" countdown.
 *   - half-open → amber "Testing" badge + spinner + probing caption.
 *
 * The badge is intentionally compact (one row of text + an outline pill) so
 * it fits inside the existing SourceCard layout without disturbing the
 * coverage / rate-limit metadata row above or the action-button row below.
 */
function BreakerBadge({ sourceId }: { sourceId: string }) {
  const { t } = useI18n()
  const { data } = useQuery<CrossrefBreakerStatusResponse>({
    queryKey: ['sources-breaker-status'],
    queryFn: () => api<CrossrefBreakerStatusResponse>('/api/sources/status'),
    staleTime: 25_000,
  })

  // Map sourceId to the breaker key in the API response
  const breakerKey = sourceId === 'semantic_scholar' ? 's2' : sourceId === 'crossref' ? 'crossref' : sourceId === 'openalex' ? 'openalex' : null
  const s = breakerKey ? (data as unknown as Record<string, { state: string; consecutiveFailures: number; retryInSec: number } | undefined>)?.[breakerKey] : undefined
  // On first render (before the query resolves) show nothing — the card stays
  // at its natural height and only grows once we have real status.
  if (!s) return null

  if (s.state === 'closed') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] flex-wrap">
        <Badge
          variant="outline"
          className="text-[11px] sm:text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900"
        >
          <CheckCircle2 className="w-3 h-3" />
          {t('sources.breaker.healthy')}
        </Badge>
        <span className="text-slate-500 dark:text-slate-400">
          {t('sources.breaker.healthyDesc')}
        </span>
      </div>
    )
  }

  if (s.state === 'half-open') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] flex-wrap">
        <Badge
          variant="outline"
          className="text-[11px] sm:text-[10px] gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('sources.breaker.testing')}
        </Badge>
        <span className="text-slate-500 dark:text-slate-400">
          {t('sources.breaker.testingDesc')}
        </span>
      </div>
    )
  }

  // state === 'open'
  return (
    <div className="mt-2 flex items-center gap-1.5 text-[11px] flex-wrap">
      <Badge
        variant="outline"
        className="text-[11px] sm:text-[10px] gap-1 bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900"
      >
        <AlertCircle className="w-3 h-3" />
        {t('sources.breaker.open')}
      </Badge>
      <span className="text-slate-500 dark:text-slate-400">
        {t('sources.breaker.openDesc', { failures: s.consecutiveFailures, retryInSec: s.retryInSec })}
      </span>
    </div>
  )
}

interface HealthResult {
  id: string
  status: 'up' | 'degraded' | 'down'
  statusCode: number
  latency: number
  error?: string
}

function SourcesHealthCheck() {
  const { t } = useI18n()
  const [results, setResults] = useState<HealthResult[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [cached, setCached] = useState(false)

  const checkHealth = async () => {
    setChecking(true)
    try {
      const resp = await fetch('/api/sources/health')
      const data = await resp.json()
      setResults(data.results)
      setCached(data.cached || false)
    } catch (e) {
      toast.error(`${t('sources.health.failed')}: ${(e as Error).message}`)
    } finally {
      setChecking(false)
    }
  }

  const statusColor: Record<string, string> = {
    up: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300',
    degraded: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300',
    down: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-300',
  }

  return (
    <Card className="border-teal-200/60 dark:border-teal-900/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-500" /> {t('sources.health')}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {cached && results && (
              <Badge variant="outline" className="text-[10px] sm:text-[9px] bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400">
                {t('sources.health.cached')}
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={checkHealth} disabled={checking}>
              {checking ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Activity className="w-3.5 h-3.5 mr-1" />}
              {checking ? t('sources.health.checking') : t('sources.health.check')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!results ? (
          <div className="text-center py-6 text-xs text-slate-400">
            {t('sources.health.clickToTest')}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {results.map((r) => (
              <div key={r.id} className={`rounded-lg p-2 border ${statusColor[r.status] || statusColor.down}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium font-mono">{r.id}</span>
                  {r.status === 'up' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : r.status === 'degraded' ? (
                    <AlertCircle className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] sm:text-[10px]">
                    {r.status === 'up' ? t('sources.health.up') : r.status === 'degraded' ? t('sources.health.degraded') : r.error === 'timeout' ? t('sources.health.timeout') : t('sources.health.down')}
                  </span>
                  <span className="text-[11px] sm:text-[10px] tabular-nums opacity-70">
                    {r.status !== 'down' ? t('sources.health.latency', { n: r.latency }) : `HTTP ${r.statusCode}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function VlmPhaseDiagram() {
  const { t } = useI18n()
  const [imageUrl, setImageUrl] = useState('')
  const [materialName, setMaterialName] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [paperSearch, setPaperSearch] = useState('')
  const [foundFigures, setFoundFigures] = useState<Array<{ url: string; source: string; description?: string }>>([])

  const analyzeMut = useMutation({
    mutationFn: () =>
      api('/api/vlm/phase-diagram', {
        method: 'POST',
        body: JSON.stringify({ imageUrl, materialName: materialName || undefined }),
      }),
    onSuccess: (d) => {
      setResult(d as Record<string, unknown>)
      toast.success(t('sources.vlm.analyzeDone'))
    },
    onError: (e) => toast.error(`${t('sources.vlm.analyzeFailed')}: ${(e as Error).message}`),
  })

  // Search for paper by DOI/title and fetch figures
  const findFiguresMut = useMutation({
    mutationFn: async () => {
      // First find the paper in our DB by DOI or title
      const params = new URLSearchParams()
      params.set('limit', '300')
      const resp = await fetch(`/api/papers?${params}`)
      const data = await resp.json()
      const papers = data.papers || []
      const q = paperSearch.toLowerCase().trim()
      const paper = papers.find((p: { doi: string; title: string; id: string }) =>
        p.doi?.toLowerCase() === q ||
        p.doi?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q)
      )
      if (!paper) throw new Error(t('sources.vlm.noPaperFound'))
      // Fetch figures for this paper
      const figResp = await fetch(`/api/papers/${paper.id}/figures`)
      const figData = await figResp.json()
      return { paper, figures: figData.figures || [] }
    },
    onSuccess: (d) => {
      setFoundFigures(d.figures)
      if (d.figures.length === 0) {
        toast.info(t('sources.vlm.noFigures'))
      } else {
        toast.success(t('sources.vlm.figuresFound', { n: d.figures.length }))
      }
    },
    onError: (e) => toast.error(`${t('sources.vlm.findFailed')}: ${(e as Error).message}`),
  })

  return (
    <Card className="border-violet-200/60 dark:border-violet-900/60">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-violet-500" /> {t('sources.vlm.title')}
        </CardTitle>
        <CardDescription>{t('sources.vlm.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Auto-find figures from paper */}
          <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/10 p-2.5">
            <Label className="text-xs font-medium">{t('sources.vlm.findFromPaper')}</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={paperSearch}
                onChange={(e) => setPaperSearch(e.target.value)}
                placeholder={t('sources.vlm.findFromPaperPh')}
                className="text-sm h-8"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => findFiguresMut.mutate()}
                disabled={!paperSearch.trim() || findFiguresMut.isPending}
                className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 shrink-0"
              >
                {findFiguresMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </Button>
            </div>
            {foundFigures.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-[11px] sm:text-[10px] text-slate-500">{t('sources.vlm.selectFigure')}</div>
                {foundFigures.map((fig, i) => (
                  <button
                    key={i}
                    onClick={() => setImageUrl(fig.url)}
                    className={`w-full text-left p-1.5 rounded-md text-xs border transition-all ${imageUrl === fig.url ? 'border-violet-400 bg-violet-100 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-violet-500 shrink-0" />
                      <span className="truncate font-medium">{fig.source}</span>
                      {fig.description && <span className="text-[11px] sm:text-[10px] text-slate-400 truncate">— {fig.description}</span>}
                    </div>
                    <div className="text-[11px] sm:text-[10px] text-slate-400 truncate mt-0.5">{fig.url}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual URL input */}
          <div>
            <Label className="text-xs">{t('sources.vlm.imageUrl')}</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder={t('sources.vlm.imageUrlPh')}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">{t('sources.vlm.material')}</Label>
            <Input
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              placeholder="MAPbI3"
              className="mt-1"
            />
          </div>
          <Button
            onClick={() => analyzeMut.mutate()}
            disabled={!imageUrl.trim() || analyzeMut.isPending}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {analyzeMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-1" />}
            {analyzeMut.isPending ? t('sources.vlm.analyzing') : t('sources.vlm.analyze')}
          </Button>

          {result && (
            <div className="mt-4 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/10 p-3 space-y-2">
              <div className="text-xs font-medium text-violet-700 dark:text-violet-300">{t('sources.vlm.result')}</div>
              {imageUrl && (
                <div className="relative w-full h-40 rounded border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900">
                  {/*
                    T11 — `next/image` replaces a bare `<img>`. The image URL
                    is a remote figure (paper PDF / publisher page) whose host
                    is not whitelisted in `next.config.ts` `images.remotePatterns`,
                    so `unoptimized` is set to bypass the optimizer while still
                    gaining: layout-shift prevention (sized container), lazy
                    loading by default, and a proper `alt` for accessibility.
                  */}
                  <Image
                    src={imageUrl}
                    alt="Analyzed figure"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 480px"
                    className="object-contain"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <VlmField label={t('sources.vlm.isPhaseDiagram')} value={String(result.isPhaseDiagram)} />
                <VlmField label={t('sources.vlm.confidence')} value={`${((result.confidence as number) || 0) * 100}%`} />
                <VlmField label={t('sources.vlm.diagramType')} value={String(result.diagramType || '—')} />
                <VlmField label={t('sources.vlm.tempRange')} value={String(result.temperatureRange || '—')} />
                <VlmField label={t('sources.vlm.compRange')} value={String(result.compositionRange || '—')} />
                <VlmField label={t('sources.vlm.phases')} value={Array.isArray(result.phases) ? (result.phases as string[]).join(', ') : '—'} />
              </div>
              {result.summary ? (
                <div className="text-xs">
                  <span className="text-slate-500">{t('sources.vlm.summary')}: </span>
                  <span className="text-slate-700 dark:text-slate-300">{String(result.summary)}</span>
                </div>
              ) : null}
              {Array.isArray(result.keyFeatures) && (result.keyFeatures as string[]).length > 0 && (
                <div className="text-xs">
                  <span className="text-slate-500">{t('sources.vlm.keyFeatures')}: </span>
                  <span className="text-slate-700 dark:text-slate-300">{(result.keyFeatures as string[]).join('; ')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function VlmField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md p-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
      <div className="text-[10px] sm:text-[9px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words">{value}</div>
    </div>
  )
}

function VlmBatchPhaseDiagram() {
  const { t } = useI18n()
  const [results, setResults] = useState<Array<{
    paperId: string; title: string; material: string; imageUrl: string
    isPhaseDiagram: boolean; confidence: number; diagramType: string; summary: string; error?: string
  }>>([])

  const batchMut = useMutation({
    mutationFn: () => api<{ results: typeof results; total: number }>('/api/vlm/batch-phase-diagram', { method: 'POST', body: JSON.stringify({ limit: 10 }) }),
    onSuccess: (d: { results: typeof results; total: number }) => {
      setResults(d.results)
      toast.success(t('sources.vlm.batch.complete', { total: d.total }))
    },
    onError: (e) => toast.error(`${t('sources.vlm.batch.failed')}: ${(e as Error).message}`),
  })

  const phaseDiagrams = results.filter(r => r.isPhaseDiagram)

  return (
    <Card className="border-purple-200/60 dark:border-purple-900/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-purple-500" /> {t('sources.vlm.batch.title')}
            </CardTitle>
            <CardDescription>{t('sources.vlm.batch.desc')}</CardDescription>
          </div>
          <Button size="sm" onClick={() => batchMut.mutate()} disabled={batchMut.isPending} className="bg-purple-600 hover:bg-purple-700">
            {batchMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-1" />}
            {t('sources.vlm.batch.run')}
          </Button>
        </div>
        {results.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[11px] sm:text-[10px]">{results.length} {t('sources.vlm.batch.analyzed')}</Badge>
            <Badge variant="outline" className="text-[11px] sm:text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300">
              {phaseDiagrams.length} {t('sources.vlm.batch.phaseDiagrams')}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            {t('sources.vlm.batch.empty')}
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className={`rounded-lg p-2.5 border text-xs ${r.isPhaseDiagram ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Badge variant="outline" className="text-[10px] sm:text-[9px] font-mono shrink-0">{r.material}</Badge>
                    <span className="truncate font-medium">{r.title}</span>
                  </div>
                  {r.isPhaseDiagram ? (
                    <Badge variant="outline" className="text-[10px] sm:text-[9px] bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 shrink-0">
                      ✓ {r.diagramType} ({(r.confidence * 100).toFixed(0)}%)
                    </Badge>
                  ) : r.error ? (
                    <Badge variant="outline" className="text-[10px] sm:text-[9px] bg-red-50 text-red-600 border-red-300 dark:bg-red-950/50 dark:text-red-300 shrink-0">error</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] sm:text-[9px] text-slate-400 shrink-0">— not a diagram</Badge>
                  )}
                </div>
                {r.summary && <p className="text-[11px] sm:text-[10px] text-slate-500">{r.summary}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
