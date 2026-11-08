'use client'

import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/components/i18n/provider'

/** Filter values selected in the BibTeX export dialog. */
export interface BibtexExportFilters {
  materialId: string
  /** 'all' or a specific category slug. */
  category: string
  synthOnly: boolean
}

export interface BibtexExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Materials list for the per-material dropdown. */
  materials: Array<{ id: string; name: string }>
  /**
   * Called when the user clicks the Export button. Parent builds the
   * /api/export/bibtex URL from the filters and opens the preview dialog,
   * then closes this dialog.
   */
  onExport: (filters: BibtexExportFilters) => void
}

/**
 * BibTeX filtered export dialog. Lets the user narrow the BibTeX export by
 * material / category / synth-only flag, shows a live count of matching
 * entries (fetched from /api/export/bibtex/count), then delegates to
 * `onExport` which opens the standard export-preview dialog.
 *
 * Owns its filter state so the count-fetch effect is colocated with the
 * inputs that trigger it. State persists across open/close (the component
 * stays mounted — only the `open` prop toggles).
 */
export function BibtexExportDialog({
  open,
  onOpenChange,
  materials,
  onExport,
}: BibtexExportDialogProps) {
  const { t } = useI18n()
  const [material, setMaterial] = useState('')
  const [category, setCategory] = useState('all')
  const [synthOnly, setSynthOnly] = useState(false)
  const [count, setCount] = useState<number | null>(null)

  // Fetch count when filters change (only while the dialog is open).
  useEffect(() => {
    if (!open) return
    fetch('/api/export/bibtex/count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialId: material || undefined,
        category: category !== 'all' ? category : undefined,
        synthOnly,
      }),
    })
      .then((r) => r.json())
      .then((d: { count: number }) => setCount(d.count))
      .catch(() => setCount(null))
  }, [open, material, category, synthOnly])

  const handleExport = () => {
    onExport({ materialId: material, category, synthOnly })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-500" /> {t('bibtex.title')}
          </DialogTitle>
          <DialogDescription>{t('bibtex.desc')}</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div>
            <Label className="text-xs">{t('bibtex.material')}</Label>
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{t('bibtex.allMaterials')}</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">{t('bibtex.category')}</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="all">{t('bibtex.allCategories')}</option>
              <option value="perovskite">{t('materials.cat.perovskite')}</option>
              <option value="chalcogenide">{t('materials.cat.chalcogenide')}</option>
              <option value="oxide">{t('materials.cat.oxide')}</option>
              <option value="other">{t('materials.cat.other')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="bib-synth" checked={synthOnly} onCheckedChange={setSynthOnly} />
            <Label htmlFor="bib-synth" className="text-xs cursor-pointer">{t('bibtex.synthFilter')}</Label>
          </div>
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2 text-xs text-slate-600 dark:text-slate-300 text-center border border-slate-200 dark:border-slate-700">
            {count !== null ? t('bibtex.count', { n: count }) : '…'}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleExport} className="bg-orange-600 hover:bg-orange-700">
            <FileText className="w-4 h-4 mr-1" /> {t('bibtex.export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
