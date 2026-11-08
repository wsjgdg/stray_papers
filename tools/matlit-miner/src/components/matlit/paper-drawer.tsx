'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X,
  ExternalLink,
  FileDown,
  RefreshCw,
  Loader2,
  Calendar,
  Users,
  BarChart3,
  BookOpen,
  Database,
  Quote,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileText,
  Send,
  User as UserIcon,
  Network,
  Eye,
  ChevronRight,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/components/i18n/provider'
import { doiUrl } from '@/lib/api-client'
import { PaperNotes } from '@/components/matlit/paper-notes'
import { PdfViewer } from '@/components/matlit/pdf-viewer'
import { PaperTranslation } from '@/components/matlit/paper-translation'

export interface PaperDetail {
  id: string
  title: string
  year: number | null
  doi: string
  abstract: string
  authors: string
  venue: string
  url: string
  citationCount: number
  source: string
  altSources?: string
  oaUrl?: string
  oaStatus?: string
  notes?: string
  originalLanguage?: string
  translatedTitle?: string
  translatedAbstract?: string
  material: { name: string; id: string }
  classification?: {
    synthesized: string
    hasBandgap: boolean
    hasMethod: boolean
    hasEfficiency: boolean
    hasPhaseDiagram: boolean
    status: string
    confidence: number
    evidence: string
    bandgapValue?: string
    synthesisMethod?: string
    conditions?: string
    phaseDiagramInfo?: string
    efficiencyValue?: string
  } | null
}

const SOURCE_META: Record<string, { label: string; short: string; color: string }> = {
  semantic_scholar: { label: 'Semantic Scholar', short: 'S2', color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900' },
  crossref: { label: 'Crossref', short: 'CR', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900' },
  openalex: { label: 'OpenAlex', short: 'OA', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900' },
  arxiv: { label: 'arXiv', short: 'aX', color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900' },
  europepmc: { label: 'Europe PMC', short: 'PMC', color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900' },
}

interface PaperDrawerProps {
  paper: PaperDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReclassify?: (paperId: string) => void
  onReextract?: (paperId: string) => void
  reclassifying?: boolean
  reextracting?: boolean
}

export function PaperDrawer({ paper, open, onOpenChange, onReclassify, onReextract, reclassifying, reextracting }: PaperDrawerProps) {
  const { t } = useI18n()
  const [pdfOpen, setPdfOpen] = useState(false)
  if (!paper) return null

  const authors = paper.authors ? paper.authors.split(';').map(a => a.trim()).filter(Boolean) : []
  const altSources = paper.altSources ? paper.altSources.split(';').filter(Boolean) : []
  const allSources = [paper.source, ...altSources].filter(Boolean)
  const cls = paper.classification

  // Only show the PDF viewer for actual PDF URLs (oaUrl may be a landing page).
  const hasPdfUrl = Boolean(
    paper.oaUrl && (
      paper.oaUrl.toLowerCase().endsWith('.pdf') ||
      paper.oaUrl.toLowerCase().includes('pdf') ||
      paper.oaUrl.toLowerCase().includes('doi.org')
    ),
  )
  const pdfUrl = paper.oaUrl || ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
              {paper.material.name}
            </Badge>
            {allSources.map((src) => {
              const meta = SOURCE_META[src]
              return meta ? (
                <span key={src} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${meta.color}`} title={meta.label}>
                  {meta.short}
                </span>
              ) : null
            })}
            {cls && (
              <Badge variant="outline" className={`text-[10px] ${cls.synthesized === 'yes' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300' : cls.synthesized === 'no' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                synth: {t(`common.${cls.synthesized}`)}
              </Badge>
            )}
          </div>
          <SheetTitle className="text-base leading-snug">{paper.title}</SheetTitle>
          <SheetDescription className="sr-only">{t('papers.detail.title')}</SheetDescription>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MetaItem icon={Calendar} label={t('papers.detail.year')} value={paper.year ? String(paper.year) : '—'} />
            <MetaItem icon={BarChart3} label={t('papers.detail.citations')} value={String(paper.citationCount)} />
            <MetaItem icon={BookOpen} label={t('papers.detail.venue')} value={paper.venue || '—'} />
            <MetaItem icon={Database} label={t('papers.detail.source')} value={paper.source} />
          </div>

          {/* Authors */}
          {authors.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3" /> {t('papers.detail.authors')}
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {authors.join(', ')}
              </div>
            </div>
          )}

          {/* Multilingual translation (#18) */}
          <PaperTranslation
            key={paper.id}
            paper={{
              id: paper.id,
              title: paper.title,
              abstract: paper.abstract,
              originalLanguage: paper.originalLanguage,
              translatedTitle: paper.translatedTitle,
              translatedAbstract: paper.translatedAbstract,
            }}
          />

          {/* Abstract */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
              <Quote className="w-3 h-3" /> {t('papers.detail.abstract')}
            </div>
            {paper.abstract ? (
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-md max-h-60 overflow-y-auto">
                {paper.abstract}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">{t('papers.detail.noAbstract')}</p>
            )}
          </div>

          {/* Classification details */}
          {cls && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> {t('papers.detail.classification')}
                <span className="ml-auto text-[10px] text-slate-400">conf {(cls.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {cls.bandgapValue && <DetailField label={t('extract.field.bandgap')} value={`${cls.bandgapValue} eV`} highlight />}
                {cls.efficiencyValue && <DetailField label={t('extract.field.efficiency')} value={`${cls.efficiencyValue}%`} highlight />}
                {cls.synthesisMethod && <DetailField label={t('extract.field.method')} value={cls.synthesisMethod} />}
                {cls.conditions && <DetailField label={t('extract.field.conditions')} value={cls.conditions} />}
              </div>
              {cls.phaseDiagramInfo && (
                <div className="mt-1.5 text-xs">
                  <span className="text-slate-500">{t('extract.field.phaseDiagram')}: </span>
                  <span className="text-violet-600 dark:text-violet-400">{cls.phaseDiagramInfo}</span>
                </div>
              )}
              {cls.evidence && (
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 bg-violet-50 dark:bg-violet-950/20 p-2 rounded border-l-2 border-violet-400">
                  <span className="text-violet-600 dark:text-violet-400 font-medium">{t('classify.evidence')}: </span>
                  {cls.evidence}
                </div>
              )}
            </div>
          )}

          {/* OA status */}
          {paper.oaStatus && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">{t('papers.detail.oaStatus')}</div>
              <Badge variant="outline" className="text-[10px] capitalize">{paper.oaStatus}</Badge>
            </div>
          )}

          {/* Personal notes (#13) */}
          <PaperNotes
            key={paper.id}
            paperId={paper.id}
            initialNotes={paper.notes ?? ''}
          />

          {/* Embedded PDF viewer (#3) — collapsible, only when an OA PDF URL is available */}
          {hasPdfUrl && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setPdfOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                aria-expanded={pdfOpen}
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                {t('papers.pdfViewer.title')}
                {pdfOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                )}
              </button>
              {pdfOpen && (
                <div className="p-2 border-t border-slate-200 dark:border-slate-800">
                  <PdfViewer url={pdfUrl} paperId={paper.id} />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-2">{t('papers.detail.actions')}</div>
            <div className="flex flex-wrap gap-2">
              {paper.doi && (
                <Button size="sm" variant="outline" asChild>
                  <a href={doiUrl(paper.doi)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> {t('papers.detail.openDoi')}
                  </a>
                </Button>
              )}
              {paper.oaUrl && (
                <Button size="sm" variant="outline" asChild>
                  <a href={paper.oaUrl} target="_blank" rel="noopener noreferrer">
                    <FileDown className="w-3.5 h-3.5 mr-1" /> {t('papers.detail.openPdf')}
                  </a>
                </Button>
              )}
              {onReclassify && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReclassify(paper.id)}
                  disabled={reclassifying}
                  className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300"
                >
                  {reclassifying ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  {t('papers.detail.reclassify')}
                </Button>
              )}
              {onReextract && cls?.synthesized === 'yes' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReextract(paper.id)}
                  disabled={reextracting}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                >
                  {reextracting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  {t('papers.detail.reextract')}
                </Button>
              )}
            </div>
          </div>

          {/* AI Q&A chat (#B5) */}
          <PaperChat key={paper.id} paperId={paper.id} />

          {/* ResearchRabbit-style related papers (#E5) */}
          <RelatedPapers
            key={`related-${paper.id}`}
            paperId={paper.id}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MetaItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-slate-50 dark:bg-slate-800/50">
      <Icon className="w-3 h-3 text-slate-400 shrink-0" />
      <div className="min-w-0">
        <div className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="text-xs font-medium truncate">{value}</div>
      </div>
    </div>
  )
}

function DetailField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md p-1.5 border ${highlight ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900' : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'}`}>
      <div className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-xs font-medium ${highlight ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PaperChat — inline AI Q&A over a single paper's abstract + metadata.
// State is keyed on paper.id by the parent, so switching papers resets it.
// ---------------------------------------------------------------------------

type ChatRole = 'user' | 'assistant'
interface ChatMessage {
  role: ChatRole
  content: string
}

function PaperChat({ paperId }: { paperId: string }) {
  const { t } = useI18n()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the latest message whenever messages or loading change.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  async function send(question: string) {
    const q = question.trim()
    if (!q || loading) return
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setInput('')
    setLoading(true)
    try {
      const resp = await fetch(`/api/papers/${paperId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data: unknown = await resp.json().catch(() => ({}))
      const errMsg =
        data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : `Request failed (${resp.status})`
      if (!resp.ok) throw new Error(errMsg)
      const answer =
        data && typeof data === 'object' && 'answer' in data && typeof (data as { answer: unknown }).answer === 'string'
          ? (data as { answer: string }).answer
          : ''
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: answer || t('drawer.ai.emptyResponse') },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            t('drawer.ai.error', { msg }),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const suggestions: string[] = [
    t('drawer.ai.suggestion.finding'),
    t('drawer.ai.suggestion.synthesis'),
    t('drawer.ai.suggestion.bandgap'),
  ]

  const headerLabel = t('drawer.ai.header')
  const placeholder = t('drawer.ai.placeholder')
  const sendLabel = t('drawer.ai.send')
  const typingLabel = t('drawer.ai.typing')

  return (
    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/10 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <Sparkles className="w-3.5 h-3.5" />
        {headerLabel}
      </div>

      {/* Message list */}
      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto space-y-2 pr-1 [scrollbar-width:thin]"
        >
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role} content={m.content} />
          ))}
          {loading && <TypingIndicator label={typingLabel} />}
        </div>
      )}

      {/* Suggested questions — only before the first message */}
      {messages.length === 0 && !loading && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="text-[10px] px-2 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          aria-label={headerLabel}
          placeholder={placeholder}
          className="flex-1 min-h-[40px] max-h-32 resize-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs leading-snug focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
        />
        <Button
          size="sm"
          type="button"
          aria-label={sendLabel}
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  )
}

function ChatBubble({ role, content }: { role: ChatRole; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
        }`}
        aria-hidden="true"
      >
        {isUser ? <UserIcon className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
      </div>
      <div
        className={`max-w-[80%] px-2.5 py-1.5 rounded-lg text-xs leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-slate-800 dark:text-slate-100'
            : 'bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2" aria-live="polite">
      <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
        <Sparkles className="w-3 h-3" />
      </div>
      <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center gap-1">
        <span className="sr-only">{label}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RelatedPapers (#E5) — ResearchRabbit-style recommendation feed.
//
// Lists up to 8 papers ranked by an additive score computed server-side:
//   same material (+3) | shared ≥3 keywords (+2) | similar year ±3 (+1)
//   | shared authors (+2)
//
// Clicking a related paper dispatches the same `matlit:open-paper` window
// event that the command palette / extraction tab use, so the parent
// papers-tab replaces the drawer's `drawerPaper` state in place (the Sheet
// stays open — only its content swaps).
//
// A "viewed" badge marks related papers the user has already opened (tracked
// in localStorage under `matlit-recent-papers`, capped at 50 ids).
// ---------------------------------------------------------------------------

const RECENT_PAPERS_KEY = 'matlit-recent-papers'
const RECENT_PAPERS_MAX = 50

interface RelatedPaperApi {
  paperId: string
  title: string
  year: number | null
  doi: string
  authors: string
  citationCount: number
  materialId: string
  materialName: string
  score: number
  reasons: string[]
}

function getRecentPaperIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(RECENT_PAPERS_KEY)
    if (!raw) return new Set()
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return new Set()
    return new Set(list.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function markPaperViewed(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(RECENT_PAPERS_KEY)
    let list: string[] = []
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        list = parsed.filter((x): x is string => typeof x === 'string')
      }
    }
    const next = [id, ...list.filter((x) => x !== id)].slice(0, RECENT_PAPERS_MAX)
    window.localStorage.setItem(RECENT_PAPERS_KEY, JSON.stringify(next))
    // Notify any listeners that the recently-viewed set changed so other
    // instances of this component (e.g. in another tab) can refresh badges.
    window.dispatchEvent(new CustomEvent('matlit:recent-papers-changed'))
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}

function RelatedPapers({
  paperId,
}: {
  paperId: string
}) {
  const { t } = useI18n()
  const [related, setRelated] = useState<RelatedPaperApi[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    let cancelled = false

    // Record the current paper as "viewed" before reading the list back —
    // the source paper is excluded by the API so this never produces a
    // self-badge.
    markPaperViewed(paperId)
    setViewedIds(getRecentPaperIds())

    setLoading(true)
    setError(null)
    setRelated(null)

    fetch(`/api/papers/${paperId}/related`)
      .then(async (r) => {
        if (!r.ok) {
          let msg = `Request failed (${r.status})`
          try {
            const body = (await r.json()) as { error?: unknown }
            if (body && typeof body.error === 'string') msg = body.error
          } catch {
            // ignore parse error
          }
          throw new Error(msg)
        }
        return r.json() as Promise<{ paperId: string; related: RelatedPaperApi[] }>
      })
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data?.related) ? data.related : []
        setRelated(list)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Unknown error')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [paperId])

  // Re-read the viewed-ids set when another instance updates localStorage.
  // This keeps the "viewed" badges in sync if the user opens papers in
  // multiple tabs / drawers.
  useEffect(() => {
    const handler = () => setViewedIds(getRecentPaperIds())
    window.addEventListener('matlit:recent-papers-changed', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('matlit:recent-papers-changed', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  const handleOpen = (p: RelatedPaperApi) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('matlit:open-paper', {
        detail: {
          id: p.paperId,
          title: p.title,
          year: p.year,
          doi: p.doi,
          materialId: p.materialId,
          materialName: p.materialName,
        },
      }),
    )
  }

  const headerLabel = t('drawer.related.title')
  const emptyLabel = t('drawer.related.empty')
  const errorLabel = t('drawer.related.error')
  const viewedLabel = t('drawer.related.viewed')
  const citationsLabel = t('drawer.related.citations')

  // Maximum observed score for the score-bar normalization. The theoretical
  // max is 3 (material) + 2 (topic) + 1 (year) + 2 (authors) = 8, but real
  // papers commonly land at 4–6. We use the actual max of the current
  // result set so the bars feel relative rather than always half-empty.
  const maxScore =
    related && related.length > 0
      ? Math.max(...related.map((p) => p.score))
      : 8

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/10 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-400">
        <Network className="w-3.5 h-3.5" />
        {headerLabel}
        {related && related.length > 0 && (
          <span className="ml-auto text-[10px] text-violet-500/70 dark:text-violet-400/70">
            {related.length}
          </span>
        )}
      </div>

      {/* Loading state — 3 skeleton rows */}
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-md border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-slate-900/60 p-2 space-y-1.5"
            >
              <Skeleton className="h-3 w-[85%]" />
              <Skeleton className="h-2 w-[40%]" />
              <div className="flex gap-1">
                <Skeleton className="h-3 w-12 rounded-full" />
                <Skeleton className="h-3 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5 py-1">
          <X className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {errorLabel}: {error}
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && related && related.length === 0 && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic py-1">
          {emptyLabel}
        </div>
      )}

      {/* Results list — max-h-64 with overflow scroll, custom scrollbar */}
      {!loading && !error && related && related.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-2 pr-1 [scrollbar-width:thin] [scrollbar-color:theme(colors.violet.300)_transparent]">
          {related.map((p) => (
            <RelatedPaperCard
              key={p.paperId}
              paper={p}
              maxScore={maxScore}
              viewed={viewedIds.has(p.paperId)}
              viewedLabel={viewedLabel}
              citationsLabel={citationsLabel}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RelatedPaperCard({
  paper,
  maxScore,
  viewed,
  viewedLabel,
  citationsLabel,
  onOpen,
}: {
  paper: RelatedPaperApi
  maxScore: number
  viewed: boolean
  viewedLabel: string
  citationsLabel: string
  onOpen: (p: RelatedPaperApi) => void
}) {
  const pct = maxScore > 0 ? Math.min(100, Math.round((paper.score / maxScore) * 100)) : 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(paper)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(paper)
        }
      }}
      className="group block w-full text-left rounded-md border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-slate-900/60 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm transition-all cursor-pointer p-2 space-y-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
    >
      {/* Title row */}
      <div className="flex items-start gap-1">
        <h4 className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug line-clamp-2 flex-1 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
          {paper.title}
        </h4>
        <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0 group-hover:text-violet-600 dark:group-hover:text-violet-400 group-hover:translate-x-0.5 transition-transform" />
      </div>

      {/* Year + citations */}
      <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
        {paper.year && (
          <span className="inline-flex items-center gap-0.5">
            <Calendar className="w-2.5 h-2.5" /> {paper.year}
          </span>
        )}
        <span className="inline-flex items-center gap-0.5">
          <BarChart3 className="w-2.5 h-2.5" /> {paper.citationCount} {citationsLabel}
        </span>
        {viewed && (
          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <Eye className="w-2.5 h-2.5" /> {viewedLabel}
          </span>
        )}
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all"
            style={{ width: `${pct}%` }}
            aria-hidden="true"
          />
        </div>
        <span className="text-[9px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
          {paper.score}
        </span>
      </div>

      {/* Reason chips */}
      {paper.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {paper.reasons.map((r) => (
            <span
              key={r}
              className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60"
            >
              {r}
            </span>
          ))}
        </div>
      )}

      {/* DOI link */}
      {paper.doi && (
        <a
          href={doiUrl(paper.doi)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-[10px] text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 hover:underline"
        >
          <ExternalLink className="w-2.5 h-2.5" /> DOI
        </a>
      )}
    </div>
  )
}
