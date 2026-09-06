'use client'

import { GitCompare, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormulaViewer } from '@/components/matlit/formula-viewer'
import { useI18n } from '@/components/i18n/provider'
import { categoryStyle } from './shared'

// Similar material recommendation returned by /api/materials/[id]/similar.
export interface SimilarMaterial {
  materialId: string
  name: string
  category: string
  score: number
  reasons: string[]
}
export interface SimilarResponse {
  materialId: string
  similar: SimilarMaterial[]
}

/**
 * Similar materials dialog (B4). Lists up to 5 materials ranked by similarity
 * score, with the human-readable reasons explaining each score. Clicking a
 * row dispatches a navigation event so the app shell (if listening) can jump
 * to the Papers tab focused on that material.
 */
export function SimilarDialog({
  state,
  onClose,
  onPick,
}: {
  state: {
    open: boolean
    materialId: string | null
    materialName: string
    loading: boolean
    error: string | null
    data: SimilarResponse | null
  }
  /** Kept for backwards-compat with the parent — no longer used inside. */
  locale?: string
  onClose: () => void
  onPick: (m: SimilarMaterial) => void
}) {
  const { t } = useI18n()
  const items = state.data?.similar ?? []
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-sky-500" />
            {t('materials.similarDialog.title')}
            <span className="font-mono text-xs text-slate-500 ml-1">{state.materialName}</span>
          </DialogTitle>
          <DialogDescription>
            {t('materials.similarDialog.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-2">
          {state.loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
              <span className="text-sm">{t('materials.similarDialog.loading')}</span>
            </div>
          ) : state.error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-500">
              <AlertCircle className="w-7 h-7" />
              <span className="text-sm text-center">{state.error}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              {t('materials.similarDialog.empty')}
            </div>
          ) : (
            items.map((m, i) => (
              <button
                key={m.materialId}
                type="button"
                onClick={() => onPick(m)}
                className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 p-3 hover:border-sky-400 hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400"
                title={t('materials.similarDialog.pickHint', { name: m.name })}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-slate-400 tabular-nums">#{i + 1}</span>
                  <FormulaViewer formula={m.name} size="sm" className="font-medium" />
                  <Badge variant="outline" className={`text-[11px] sm:text-[10px] capitalize ml-auto ${categoryStyle(m.category)}`}>
                    {m.category}
                  </Badge>
                  <span className="text-xs font-mono text-sky-600 dark:text-sky-400 tabular-nums">
                    {(m.score * 100).toFixed(0)}%
                  </span>
                </div>
                <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5 pl-6">
                  {m.reasons.map((r, j) => (
                    <li key={j} className="flex gap-1">
                      <span className="text-sky-400 shrink-0">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </button>
            ))
          )}
        </div>

        {state.data && !state.loading && (
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={onClose}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
