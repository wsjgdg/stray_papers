'use client'

import { motion } from 'framer-motion'
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
  FileText,
  Loader2,
} from 'lucide-react'
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

/**
 * D4: Batch operation confirmation dialog.
 *
 * Replaces the former `window.confirm()` calls that gated bulk delete /
 * re-classify. Stores the pending operation + the affected paper summaries
 * so the dialog can show a richer preview (titles, material count, undo
 * hint) before executing the mutation.
 *
 * Extracted from `papers-tab.tsx` (M1b). The component is "dumb" — all state
 * (selection, mutation handles) is passed in from the parent.
 */

/** Pending batch payload — built by `prepareBatch` in the parent. */
export type PendingBatch = {
  type: 'delete' | 'classify'
  // Paper previews — the items currently on screen that are about to be
  // affected. Papers selected from other pages aren't included here
  // (the dialog shows a "and N more" count for those).
  previews: Array<{ id: string; title: string; materialName: string }>
  // Total IDs in the selection (may exceed previews.length when the
  // selection spans multiple pages).
  totalCount: number
  // Distinct material IDs derived from previews + (conservatively) the
  // rest of the selection. Since previews only cover on-screen papers,
  // we compute distinctMaterials from previews and surface a "≥" prefix
  // when totalCount > previews.length.
  distinctMaterialIds: Set<string>
}

export interface BatchConfirmDialogProps {
  pendingBatch: PendingBatch | null
  onClose: () => void
  onConfirm: () => void
  isDeletePending: boolean
  isClassifyPending: boolean
}

export function BatchConfirmDialog({
  pendingBatch,
  onClose,
  onConfirm,
  isDeletePending,
  isClassifyPending,
}: BatchConfirmDialogProps) {
  const { t } = useI18n()

  return (
    <Dialog open={pendingBatch !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pendingBatch?.type === 'delete' ? (
              <motion.span
                initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 dark:bg-red-950/60"
              >
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              </motion.span>
            ) : (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-950/60"
              >
                <RefreshCw className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </motion.span>
            )}
            {pendingBatch?.type === 'delete'
              ? (t('papers.batchConfirm.deleteTitle', { count: pendingBatch.totalCount }))
              : (t('papers.batchConfirm.reclassifyTitle', { count: pendingBatch?.totalCount ?? 0 }))}
          </DialogTitle>
          <DialogDescription>
            {pendingBatch?.type === 'delete'
              ? (t('papers.batchConfirm.deleteDesc'))
              : (t('papers.batchConfirm.reclassifyDesc'))}
          </DialogDescription>
        </DialogHeader>

        {pendingBatch && (
          <div className="space-y-3">
            {/* Affected papers summary list */}
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {t('papers.batchConfirm.affectedPapers')}
              </div>
              <motion.ul
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
                }}
                className="max-h-44 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800"
              >
                {pendingBatch.previews.slice(0, 5).map((p) => (
                  <motion.li
                    key={p.id}
                    variants={{
                      hidden: { opacity: 0, x: -8 },
                      visible: { opacity: 1, x: 0 },
                    }}
                    className="px-3 py-1.5 text-xs flex items-start gap-2"
                  >
                    <FileText className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                    <span className="line-clamp-1 flex-1 min-w-0">{p.title}</span>
                    <span className="font-mono text-[11px] sm:text-[10px] text-emerald-700 dark:text-emerald-300 shrink-0">
                      {p.materialName}
                    </span>
                  </motion.li>
                ))}
                {pendingBatch.totalCount > pendingBatch.previews.length && (
                  <li className="px-3 py-1.5 text-[11px] text-slate-500 italic">
                    {t('papers.batchConfirm.moreFromPages', { count: pendingBatch.totalCount - pendingBatch.previews.length })}
                  </li>
                )}
                {pendingBatch.previews.length === 0 && (
                  <li className="px-3 py-2 text-[11px] text-slate-400 italic">
                    {t('papers.batchConfirm.notOnPage')}
                  </li>
                )}
              </motion.ul>
            </div>

            {/* Impact summary */}
            <div className={`rounded-md p-2.5 text-xs border ${
              pendingBatch.type === 'delete'
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
                : 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900 text-violet-800 dark:text-violet-200'
            }`}>
              {pendingBatch.type === 'delete' ? (
                <span className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {t('papers.batchConfirm.deleteImpact', {
                      papers: pendingBatch.totalCount,
                      prefix: pendingBatch.previews.length < pendingBatch.totalCount ? '≥' : '',
                      materials: pendingBatch.distinctMaterialIds.size,
                    })}
                  </span>
                </span>
              ) : (
                <span>
                  {t('papers.batchConfirm.reclassifyImpact', {
                    papers: pendingBatch.totalCount,
                    prefix: pendingBatch.previews.length < pendingBatch.totalCount ? '≥' : '',
                    materials: pendingBatch.distinctMaterialIds.size,
                  })}
                </span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeletePending || isClassifyPending}>
            {t('common.cancel')}
          </Button>
          {pendingBatch?.type === 'delete' ? (
            <Button
              onClick={onConfirm}
              disabled={isDeletePending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeletePending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              {t('papers.batchConfirm.deleteBtn', { count: pendingBatch.totalCount })}
            </Button>
          ) : (
            <Button
              onClick={onConfirm}
              disabled={isClassifyPending}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isClassifyPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1.5" />
              )}
              {t('papers.batchConfirm.reclassifyBtn', { count: pendingBatch?.totalCount ?? 0 })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
