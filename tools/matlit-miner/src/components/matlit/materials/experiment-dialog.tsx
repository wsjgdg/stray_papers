'use client'

import { FlaskConical, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { parseReviewSections } from './review-dialog'
import { useI18n } from '@/components/i18n/provider'

// AI experiment plan returned by /api/materials/[id]/experiment (N5).
export interface ExperimentResponse {
  plan: string
  generatedAt: string
  source: 'llm' | 'fallback'
}

/**
 * AI experiment plan dialog (N5).
 *
 * Renders the Markdown experiment plan returned by /api/materials/[id]/experiment.
 * Reuses `parseReviewSections` (the same helper used by the AI literature
 * review dialog) to split the plan into its `## 1. ... ## 6. ...` sections,
 * each styled independently. Loading / error / regenerate paths mirror the
 * review dialog.
 */
export function ExperimentDialog({
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
    data: ExperimentResponse | null
  }
  /** Kept for backwards-compat with the parent — no longer used inside. */
  locale?: string
  onClose: () => void
  onRefresh: () => void
}) {
  const { t } = useI18n()
  const sections = parseReviewSections(state.data?.plan ?? '')
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-amber-600" />
            {t('materials.experimentDialog.title')}
            <span className="font-mono text-xs text-slate-500 ml-1">{state.materialName}</span>
          </DialogTitle>
          <DialogDescription>
            {state.data
              ? t('materials.experimentDialog.desc.generated', {
                  date: new Date(state.data.generatedAt).toLocaleString(),
                  source: state.data.source === 'llm' ? t('materials.experimentDialog.source.llm') : t('materials.experimentDialog.source.fallback'),
                })
              : t('materials.experimentDialog.desc.loading')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {state.loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-amber-600" />
              <span className="text-sm">{t('materials.experimentDialog.loading')}</span>
            </div>
          ) : state.error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-500">
              <AlertCircle className="w-7 h-7" />
              <span className="text-sm text-center">{state.error}</span>
              <Button size="sm" variant="outline" onClick={onRefresh}>
                {t('materials.experimentDialog.retry')}
              </Button>
            </div>
          ) : sections.length > 0 ? (
            <div className="space-y-4">
              {sections.map((s, i) => (
                <section key={i}>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                    <span className="w-1 h-3 rounded-sm bg-amber-400" />
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
              {t('materials.experimentDialog.noContent')}
            </div>
          )}
        </div>

        {state.data && !state.loading && (
          <DialogFooter className="gap-2">
            <span className="text-xs text-slate-400 mr-auto">
              {t('materials.experimentDialog.cached')}
            </span>
            {state.data.source === 'fallback' && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {t('materials.experimentDialog.fallbackWarn')}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={state.loading}>
              {t('materials.experimentDialog.regenerate')}
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
