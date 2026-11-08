'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Hash, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'

/**
 * G1G2: DOI batch import dialog.
 *
 * Accepts a pasted blob of DOIs (newline/comma/semicolon-separated). The
 * server normalizes each DOI (strips URL prefixes, lowercases), fetches
 * metadata from CrossRef with a 5-way concurrency limit, and upserts each
 * into the DB. Material selector mirrors the BibTeX dialog's "Auto-match"
 * sentinel pattern.
 *
 * Extracted from `papers-tab.tsx` (M1b). Smart component — owns its own
 * DOI text / material-id / result state + mutation.
 */
type DoiResult = {
  imported: number
  failed: number
  errors: Array<{ doi: string; error: string }>
  total: number
}

export interface ImportDoisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  materials: Array<{ id: string; name: string }>
}

export function ImportDoisDialog({ open, onOpenChange, materials }: ImportDoisDialogProps) {
  const { t } = useI18n()
  const qc = useQueryClient()

  const [doiText, setDoiText] = useState('')
  const [doiMaterialId, setDoiMaterialId] = useState<string>('__auto__')
  const [doiResult, setDoiResult] = useState<DoiResult | null>(null)

  const importDoisMut = useMutation({
    mutationFn: () =>
      api<DoiResult>('/api/papers/import-dois', {
        method: 'POST',
        body: JSON.stringify({
          dois: doiText,
          materialId: doiMaterialId !== '__auto__' ? doiMaterialId : undefined,
        }),
      }),
    onSuccess: (d) => {
      setDoiResult(d)
      if (d.imported > 0) {
        toast.success(
          t('papers.importDois.toast.imported', {
            imported: d.imported,
            total: d.total,
            failed: d.failed ? t('papers.importDois.toast.importedFailed', { failed: d.failed }) : '',
          }),
        )
      } else {
        toast.warning(
          t('papers.importDois.toast.none'),
        )
      }
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) =>
      toast.error(`${t('papers.importDois.toast.failed')}: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setDoiResult(null) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-cyan-500" />
            {t('papers.importDois.dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('papers.importDois.dialog.desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div>
            <Label htmlFor="doi-mat" className="text-xs">
              {t('papers.importDois.targetMaterial')}
            </Label>
            <Select value={doiMaterialId} onValueChange={setDoiMaterialId}>
              <SelectTrigger id="doi-mat">
                <SelectValue placeholder={t('papers.importDois.autoMatch')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">{t('papers.importDois.autoMatch')}</SelectItem>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="doi-text" className="text-xs">
              {t('papers.importDois.list')}
            </Label>
            <textarea
              id="doi-text"
              value={doiText}
              onChange={(e) => setDoiText(e.target.value)}
              rows={8}
              placeholder={`${t('papers.importDois.placeholder')}\n\n${t('papers.importDois.placeholderHint')}`}
              className="w-full min-h-[160px] max-h-[40vh] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-cyan-300 dark:focus:ring-cyan-700"
            />
            <p className="mt-1 text-[11px] sm:text-[10px] text-slate-400">
              {doiText.trim()
                ? t('papers.importDois.countHint', { count: doiText.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean).length })
                : t('papers.importDois.acceptsFormat')}
            </p>
          </div>
          {importDoisMut.isPending && (
            <div className="flex items-center gap-2 text-sm text-cyan-600 dark:text-cyan-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('papers.importDois.fetching')}
            </div>
          )}
          {doiResult && !importDoisMut.isPending && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-2 border border-emerald-200 dark:border-emerald-900">
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{doiResult.imported}</div>
                  <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.importDois.imported')}</div>
                </div>
                <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 p-2 border border-rose-200 dark:border-rose-900">
                  <div className="text-lg font-bold text-rose-700 dark:text-rose-300 tabular-nums">{doiResult.failed}</div>
                  <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.importDois.failed')}</div>
                </div>
                <div className="rounded-md bg-slate-50 dark:bg-slate-950/30 p-2 border border-slate-200 dark:border-slate-800">
                  <div className="text-lg font-bold text-slate-700 dark:text-slate-300 tabular-nums">{doiResult.total}</div>
                  <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.importDois.total')}</div>
                </div>
              </div>
              {doiResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
                  {doiResult.errors.slice(0, 30).map((e, i) => (
                    <div key={i} className="px-3 py-1 text-[11px] border-b border-rose-100 dark:border-rose-900/50 last:border-0">
                      <span className="font-mono text-rose-800 dark:text-rose-300">{e.doi}</span>
                      <span className="text-slate-500 dark:text-slate-400"> — {e.error}</span>
                    </div>
                  ))}
                  {doiResult.errors.length > 30 && (
                    <div className="px-3 py-1 text-[11px] sm:text-[10px] text-slate-400 italic">
                      {t('papers.importDois.moreErrors', { count: doiResult.errors.length - 30 })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setDoiResult(null) }}>
            {doiResult ? (t('common.close')) : (t('common.cancel'))}
          </Button>
          {!doiResult && (
            <Button
              onClick={() => importDoisMut.mutate()}
              disabled={importDoisMut.isPending || !doiText.trim()}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {importDoisMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Hash className="w-4 h-4 mr-1" />}
              {t('papers.importDois.importBtn')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
