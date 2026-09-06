'use client'

import { Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/components/i18n/provider'

// AI literature review returned by /api/materials/[id]/review.
export interface ReviewResponse {
  review: string
  generatedAt: string
  paperCount: number
  source: 'llm' | 'fallback'
}

/**
 * AI literature review dialog (B2).
 *
 * Renders the 3-paragraph review returned by /api/materials/[id]/review.
 * The response text is markdown-ish (## headings + paragraphs); we split it
 * on the headings so each section can be styled independently. While the
 * LLM call is in-flight the body shows a spinner. Errors show a retry
 * button. The dialog also exposes a "Regenerate" action that hits the
 * endpoint with ?refresh=1 to bypass the server cache.
 */
export function ReviewDialog({
  state,
  onClose,
  onRefresh,
}: {
  state: {
    open: boolean
    materialId: string | null
    materialName: string
    loading: boolean
    error: string | null
    data: ReviewResponse | null
  }
  /** Kept for backwards-compat with the parent — no longer used inside. */
  locale?: string
  onClose: () => void
  onRefresh: () => void
}) {
  const { t } = useI18n()
  const sections = parseReviewSections(state.data?.review ?? '')
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            {t('materials.reviewDialog.title')}
            <span className="font-mono text-xs text-slate-500 ml-1">{state.materialName}</span>
          </DialogTitle>
          <DialogDescription>
            {state.data
              ? t('materials.reviewDialog.desc.generated', {
                  paperCount: state.data.paperCount,
                  date: new Date(state.data.generatedAt).toLocaleString(),
                  source: state.data.source === 'llm' ? t('materials.reviewDialog.source.llm') : t('materials.reviewDialog.source.fallback'),
                })
              : t('materials.reviewDialog.desc.loading')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {state.loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
              <span className="text-sm">{t('materials.reviewDialog.loading')}</span>
            </div>
          ) : state.error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-500">
              <AlertCircle className="w-7 h-7" />
              <span className="text-sm text-center">{state.error}</span>
              <Button size="sm" variant="outline" onClick={onRefresh}>
                {t('materials.reviewDialog.retry')}
              </Button>
            </div>
          ) : sections.length > 0 ? (
            <div className="space-y-4">
              {sections.map((s, i) => (
                <section key={i}>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                    <span className="w-1 h-3 rounded-sm bg-violet-400" />
                    {s.heading}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                    {s.body}
                  </p>
                </section>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-sm">
              {t('materials.reviewDialog.noContent')}
            </div>
          )}
        </div>

        {state.data && !state.loading && (
          <DialogFooter className="gap-2">
            <span className="text-xs text-slate-400 mr-auto">
              {t('materials.reviewDialog.cached')}
            </span>
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={state.loading}>
              {t('materials.reviewDialog.regenerate')}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Split a markdown-ish review string into [{heading, body}] sections. */
export function parseReviewSections(text: string): Array<{ heading: string; body: string }> {
  if (!text) return []
  // Match `## Heading` lines and capture everything until the next `## ` or end.
  const parts = text.split(/^##\s+/m)
  const out: Array<{ heading: string; body: string }> = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const nl = trimmed.indexOf('\n')
    if (nl === -1) {
      out.push({ heading: trimmed, body: '' })
    } else {
      out.push({ heading: trimmed.slice(0, nl).trim(), body: trimmed.slice(nl + 1).trim() })
    }
  }
  return out
}
