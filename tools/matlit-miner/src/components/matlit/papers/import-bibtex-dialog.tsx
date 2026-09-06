'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2 } from 'lucide-react'
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
 * G1G2: BibTeX / RIS import dialog.
 *
 * Accepts pasted text OR an uploaded .bib/.ris/.txt file. The material
 * selector is optional — when left on "Auto-match" the server matches each
 * entry to a material by checking which material name/alias appears in the
 * title. Result summary shows the detected format, imported/skipped counts,
 * and a scrollable list of errors (truncated to the first 30).
 *
 * Extracted from `papers-tab.tsx` (M1b). This is a "smart" component — it
 * owns the bibtex text / material-id / result state and the import mutation.
 * The parent only needs to render `<ImportBibtexDialog open={…}
 * onOpenChange={…} materials={…} />`.
 */
type BibtexResult = {
  imported: number
  skipped: number
  errors: Array<{ entry: string; error: string }>
  format: string
  total: number
}

export interface ImportBibtexDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  materials: Array<{ id: string; name: string }>
}

export function ImportBibtexDialog({ open, onOpenChange, materials }: ImportBibtexDialogProps) {
  const { t } = useI18n()
  const qc = useQueryClient()

  const [bibtexContent, setBibtexContent] = useState('')
  // '__auto__' sentinel → API receives `materialId: undefined` and
  // auto-matches each entry against material names/aliases by title.
  const [bibtexMaterialId, setBibtexMaterialId] = useState<string>('__auto__')
  const [bibtexResult, setBibtexResult] = useState<BibtexResult | null>(null)

  const importBibtexMut = useMutation({
    mutationFn: () =>
      api<BibtexResult>('/api/papers/import-bibtex', {
        method: 'POST',
        body: JSON.stringify({
          content: bibtexContent,
          materialId: bibtexMaterialId !== '__auto__' ? bibtexMaterialId : undefined,
          format: 'auto',
        }),
      }),
    onSuccess: (d) => {
      setBibtexResult(d)
      if (d.imported > 0) {
        toast.success(
          t('papers.importBibtex.toast.imported', { imported: d.imported, format: d.format.toUpperCase(), skipped: d.skipped }),
        )
      } else {
        toast.warning(
          t('papers.importBibtex.toast.none', { skipped: d.skipped }),
        )
      }
      qc.invalidateQueries({ queryKey: ['papers'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) =>
      toast.error(`${t('papers.importBibtex.toast.failed')}: ${(e as Error).message}`),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setBibtexResult(null) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" />
            {t('papers.importBibtex.dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('papers.importBibtex.dialog.desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bib-mat" className="text-xs">
                {t('papers.importBibtex.targetMaterial')}
              </Label>
              <Select value={bibtexMaterialId} onValueChange={setBibtexMaterialId}>
                <SelectTrigger id="bib-mat">
                  <SelectValue placeholder={t('papers.importBibtex.autoMatch')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">{t('papers.importBibtex.autoMatch')}</SelectItem>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="bib-file" className="text-xs">
                {t('papers.importBibtex.uploadFile')}
              </Label>
              <input
                id="bib-file"
                type="file"
                accept=".bib,.ris,.txt,application/x-bibtex,text/x-bibtex,application/x-research-info-systems,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    const text = String(reader.result || '')
                    setBibtexContent((prev) => (prev ? `${prev}\n\n${text}` : text))
                    toast.success(t('papers.importBibtex.fileLoaded', { name: f.name }))
                  }
                  reader.onerror = () => toast.error(t('papers.importBibtex.fileFailed'))
                  reader.readAsText(f)
                  // Reset the input so the same file can be re-added later
                  e.target.value = ''
                }}
                className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-50 file:text-emerald-700 file:cursor-pointer file:dark:bg-emerald-950/50 file:dark:text-emerald-300 hover:file:bg-emerald-100 dark:hover:file:bg-emerald-900 file:font-medium"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bib-content" className="text-xs">
              {t('papers.importBibtex.content')}
            </Label>
            <textarea
              id="bib-content"
              value={bibtexContent}
              onChange={(e) => setBibtexContent(e.target.value)}
              rows={10}
              placeholder={t('papers.importBibtex.placeholder')}
              className="w-full min-h-[200px] max-h-[50vh] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-700"
            />
            <p className="mt-1 text-[11px] sm:text-[10px] text-slate-400">
              {bibtexContent.trim()
                ? t('papers.importBibtex.countHint', { bib: Math.max(0, (bibtexContent.match(/@\w+\s*[\{(]/g) || []).length), ris: Math.max(0, (bibtexContent.match(/TY\s+-/g) || []).length) })
                : t('papers.importBibtex.formatAuto')}
            </p>
          </div>
          {importBibtexMut.isPending && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('papers.importBibtex.processing')}
            </div>
          )}
          {bibtexResult && !importBibtexMut.isPending && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-2 border border-emerald-200 dark:border-emerald-900">
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{bibtexResult.imported}</div>
                  <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.importBibtex.imported')}</div>
                </div>
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 border border-amber-200 dark:border-amber-900">
                  <div className="text-lg font-bold text-amber-700 dark:text-amber-300 tabular-nums">{bibtexResult.skipped}</div>
                  <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.importBibtex.skipped')}</div>
                </div>
                <div className="rounded-md bg-sky-50 dark:bg-sky-950/30 p-2 border border-sky-200 dark:border-sky-900">
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-300 tabular-nums uppercase">{bibtexResult.format}</div>
                  <div className="text-[11px] sm:text-[10px] text-slate-500">{t('papers.importBibtex.format')}</div>
                </div>
              </div>
              {bibtexResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
                  {bibtexResult.errors.slice(0, 30).map((e, i) => (
                    <div key={i} className="px-3 py-1 text-[11px] border-b border-amber-100 dark:border-amber-900/50 last:border-0">
                      <span className="font-mono text-amber-800 dark:text-amber-300">{e.entry.slice(0, 60)}</span>
                      <span className="text-slate-500 dark:text-slate-400"> — {e.error}</span>
                    </div>
                  ))}
                  {bibtexResult.errors.length > 30 && (
                    <div className="px-3 py-1 text-[11px] sm:text-[10px] text-slate-400 italic">
                      {t('papers.importBibtex.moreErrors', { count: bibtexResult.errors.length - 30 })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setBibtexResult(null) }}>
            {bibtexResult ? (t('common.close')) : (t('common.cancel'))}
          </Button>
          {!bibtexResult && (
            <Button
              onClick={() => importBibtexMut.mutate()}
              disabled={importBibtexMut.isPending || !bibtexContent.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {importBibtexMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
              {t('papers.importBibtex.importBtn')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
