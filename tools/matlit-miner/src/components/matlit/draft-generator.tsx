'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText,
  Loader2,
  Sparkles,
  Copy,
  Check,
  Search,
  AlertTriangle,
  Wand2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import { toast } from 'sonner'

// DraftGeneratorDialog
//
// G12 — AI paper-draft generator. The user picks 1–5 materials, chooses
// which paper section to draft (Methods / Results / Introduction), and
// clicks "Generate draft". The backend /api/draft endpoint gathers each
// material's name / formula / bandgap / efficiency / synthesis method /
// conditions / top papers, hands the bundle to the LLM, and returns the
// Markdown. The dialog renders the Markdown (with GFM pipe tables) in a
// scrollable card and exposes a Copy button.
//
// Results are cached server-side for 30 min per (materialIds-sorted-hash +
// section) so re-opening the dialog with the same selection is instant.

type Section = 'methods' | 'results' | 'introduction'

interface MaterialListItem {
  id: string
  name: string
  aliases: string
  category: string
}

interface DraftResponse {
  draft: string
  generatedAt: string
  source: 'llm' | 'fallback'
  cached: boolean
}

const SECTION_OPTIONS: Array<{ value: Section }> = [
  { value: 'methods' },
  { value: 'results' },
  { value: 'introduction' },
]

function categoryColor(cat: string): string {
  switch (cat) {
    case 'perovskite':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
    case 'chalcogenide':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
    case 'oxide':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

export default function DraftGeneratorDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t, locale } = useI18n()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [section, setSection] = useState<Section>('methods')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  // i18n — draft.* keys live in src/components/i18n/provider.tsx
  const L = useMemo(
    () => ({
      title: t('draft.title'),
      desc: t('draft.desc'),
      pickMaterials: t('draft.pickMaterials'),
      pickHint: (n: number) => t('draft.pickHint', { n }),
      searchPlaceholder: t('draft.searchPlaceholder'),
      noMaterials: t('draft.noMaterials'),
      sectionLabel: t('draft.sectionLabel'),
      generateBtn: t('draft.generateBtn'),
      generating: t('draft.generating'),
      copy: t('draft.copy'),
      copied: t('draft.copied'),
      emptyDraft: t('draft.emptyDraft'),
      mustSelect: t('draft.mustSelect'),
      generatedAt: (iso: string) =>
        t('draft.generatedAt', { date: new Date(iso).toLocaleString(locale) }),
      sourceLLM: t('draft.sourceLLM'),
      sourceFallback: t('draft.sourceFallback'),
      cached: t('draft.cached'),
      error: (msg: string) => t('draft.error', { msg }),
      close: t('draft.close'),
      needMore: t('draft.needMore'),
    }),
    [t, locale],
  )

  // Fetch the material list once per dialog open. Cheap DB query, kept
  // fresh by the ['materials'] cache key (also used by Materials tab).
  const { data: materialsData, isLoading: materialsLoading } = useQuery<{
    materials: MaterialListItem[]
  }>({
    queryKey: ['materials', 'draft-list'],
    queryFn: () => api<{ materials: MaterialListItem[] }>('/api/materials'),
    enabled: open,
    staleTime: 60_000,
  })

  const materials = useMemo(() => {
    const list = materialsData?.materials ?? []
    if (!query.trim()) return list
    const q = query.trim().toLowerCase()
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.aliases || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q),
    )
  }, [materialsData, query])

  function toggleMaterial(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= 5) return prev // cap at 5
        next.add(id)
      }
      return next
    })
  }

  const generateMutation = useMutation({
    mutationFn: async (): Promise<DraftResponse> => {
      const ids = Array.from(selectedIds)
      return api<DraftResponse>('/api/draft', {
        method: 'POST',
        body: JSON.stringify({ materialIds: ids, section }),
      })
    },
    onError: (err: Error) => {
      toast.error(L.error(err.message))
    },
  })

  const draft = generateMutation.data?.draft ?? ''
  const source = generateMutation.data?.source
  const isCached = generateMutation.data?.cached ?? false

  async function handleCopy() {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      toast.success(L.copied)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('draft.copyFailed'))
    }
  }

  const selectedCount = selectedIds.size
  const canGenerate = selectedCount >= 1 && selectedCount <= 5

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="w-5 h-5 text-emerald-500" aria-hidden />
            {L.title}
          </DialogTitle>
          <DialogDescription>{L.desc}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1">
          {/* Left: material multi-select + section selector */}
          <div className="flex flex-col gap-3 min-h-0">
            {/* Section selector */}
            <div>
              <Label className="text-xs font-medium mb-1.5 block">{L.sectionLabel}</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {SECTION_OPTIONS.map((opt) => {
                  const active = section === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSection(opt.value)}
                      className={`text-left rounded-md border p-2 transition-all ${
                        active
                          ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700'
                      }`}
                      aria-pressed={active}
                    >
                      <div
                        className={`text-xs font-semibold ${active ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}
                      >
                        {t(`draft.section.${opt.value}.label`)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {t(`draft.section.${opt.value}.desc`)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Material multi-select with search */}
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-medium">{L.pickMaterials}</Label>
                <span className="text-[10px] tabular-nums text-slate-500">
                  {L.pickHint(selectedCount)}
                </span>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={L.searchPlaceholder}
                  className="h-8 pl-7 text-xs"
                  aria-label={L.searchPlaceholder}
                />
              </div>
              <ScrollArea className="flex-1 min-h-0 max-h-[35vh] rounded-md border border-slate-200 dark:border-slate-800">
                {materialsLoading ? (
                  <div className="p-3 text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('draft.loading')}
                  </div>
                ) : materials.length === 0 ? (
                  <div className="p-3 text-xs text-slate-400 text-center">{L.noMaterials}</div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {materials.map((m) => {
                      const checked = selectedIds.has(m.id)
                      const disabled = !checked && selectedCount >= 5
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => toggleMaterial(m.id)}
                            disabled={disabled}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                              checked
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                            aria-pressed={checked}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                                {m.name}
                              </div>
                              {m.aliases && (
                                <div className="text-[10px] text-slate-500 truncate">
                                  {m.aliases}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1.5 py-0 ${categoryColor(m.category)}`}
                              >
                                {m.category}
                              </Badge>
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center ${
                                  checked
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}
                                aria-hidden
                              >
                                {checked && <Check className="w-3 h-3" />}
                              </span>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>

            {/* Generate button */}
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!canGenerate || generateMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 w-full"
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1.5" />
              )}
              {generateMutation.isPending ? L.generating : L.generateBtn}
            </Button>
            {!canGenerate && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center -mt-1">
                {L.needMore}
              </p>
            )}
          </div>

          {/* Right: draft output */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-sky-500" aria-hidden />
                {t('draft.draftLabel')}
              </Label>
              <div className="flex items-center gap-1.5">
                {source && (
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${
                      source === 'llm'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-700'
                    }`}
                  >
                    {source === 'llm' ? L.sourceLLM : L.sourceFallback}
                  </Badge>
                )}
                {isCached && (
                  <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800">
                    {L.cached}
                  </Badge>
                )}
                {draft && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] px-2"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <Check className="w-3 h-3 mr-1 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3 mr-1" />
                    )}
                    {copied ? L.copied : L.copy}
                  </Button>
                )}
              </div>
            </div>

            <Card className="flex-1 min-h-0 flex flex-col">
              <CardContent className="p-3 flex-1 min-h-0 flex flex-col">
                {generateMutation.isPending ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <p className="text-sm text-slate-500">{L.generating}</p>
                    <p className="text-[10px] text-slate-400 max-w-xs">
                      {t('draft.generatingHint')}
                    </p>
                  </div>
                ) : !draft ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-8">
                    <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" aria-hidden />
                    <p className="text-sm text-slate-500 max-w-xs">{L.emptyDraft}</p>
                  </div>
                ) : (
                  <ScrollArea className="flex-1 min-h-0 max-h-[55vh]">
                    {/* Tailwind typography isn't installed, so we style the
                        markdown output with a small wrapper class. */}
                    <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 text-sm leading-relaxed
                      [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:text-slate-900 dark:[&_h1]:text-slate-100
                      [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100
                      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-slate-800 dark:[&_h3]:text-slate-200
                      [&_p]:my-2
                      [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:text-sm
                      [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:text-sm
                      [&_li]:my-0.5
                      [&_strong]:font-semibold [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100
                      [&_em]:italic
                      [&_code]:bg-slate-100 dark:[&_code]:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px] [&_code]:font-mono
                      [&_pre]:bg-slate-900 dark:[&_pre]:bg-slate-950 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2
                      [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px] [&_pre_code]:text-slate-100
                      [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-400 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 dark:[&_blockquote]:text-slate-400 [&_blockquote]:italic [&_blockquote]:my-2
                      [&_table]:w-full [&_table]:my-2 [&_table]:border-collapse
                      [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold
                      [&_td]:border [&_td]:border-slate-200 dark:[&_td]:border-slate-700 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs
                      [&_a]:text-emerald-600 dark:[&_a]:text-emerald-400 [&_a]:underline
                    ">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {generateMutation.data?.generatedAt && (
              <div className="mt-1 text-[10px] text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" aria-hidden />
                {L.generatedAt(generateMutation.data.generatedAt)}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {L.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
