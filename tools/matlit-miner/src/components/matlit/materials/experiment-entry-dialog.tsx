'use client'

import { useState, useEffect } from 'react'
import { TestTube2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
import { FormulaViewer } from '@/components/matlit/formula-viewer'
import { useI18n } from '@/components/i18n/provider'
import { type Material } from './shared'

// ────────────────────────────────────────────────────────────────────────────
// G4 — Manual experiment entry dialog.
//
// Lets the user record their own lab measurements (PCE, Voc, Jsc, FF,
// bandgap, synthesis method, conditions) directly into the database,
// bypassing the AI-extraction pipeline. The form is split into three
// sections (Efficiency / Properties / Source) so the visual hierarchy
// matches the data model:
//   - Efficiency section → goes into the `Efficiency` table
//     (Voc/Jsc/FF don't have dedicated columns, so they're encoded into
//      `notes` by the /api/experiments handler).
//   - Properties section → goes into the `Classification` table
//     (synthesized='yes', status='extracted', evidence='[manual entry]').
//   - Source section → DOI / year apply to both records.
//
// Validation mirrors the API: `materialId` is always present (the dialog
// is opened from a row action), and at least one of PCE / bandgap / method
// / conditions is required before the Save button is enabled.
// ────────────────────────────────────────────────────────────────────────────

const SYNTHESIS_METHODS = [
  { value: '' },
  { value: 'solution-processing' },
  { value: 'spin-coating' },
  { value: 'thermal-evaporation' },
  { value: 'sputtering' },
  { value: 'cvd' },
  { value: 'pld' },
  { value: 'solid-state' },
  { value: 'hydrothermal' },
  { value: 'sol-gel' },
  { value: 'ball-milling' },
  { value: 'single-crystal' },
  { value: 'other' },
]

export function ExperimentEntryDialog({
  target,
  isPending,
  onClose,
  onSubmit,
}: {
  target: Material | null
  /** Kept for backwards-compat with the parent — no longer used inside. */
  locale?: string
  isPending: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const { t } = useI18n()

  // Form state. Reset whenever the target changes (i.e. when the dialog
  // opens for a different material) by keying the inputs off `target?.id`.
  const [efficiency, setEfficiency] = useState('')
  const [voc, setVoc] = useState('')
  const [jsc, setJsc] = useState('')
  const [ff, setFf] = useState('')
  const [certified, setCertified] = useState(false)
  const [bandgap, setBandgap] = useState('')
  const [method, setMethod] = useState('')
  const [conditions, setConditions] = useState('')
  const [testConditions, setTestConditions] = useState('')
  const [doi, setDoi] = useState('')
  const [year, setYear] = useState('')
  const [notes, setNotes] = useState('')

  // Reset all fields whenever the dialog opens for a new material. We
  // can't use a `key` prop on the dialog itself (Radix owns it), so we
  // hook into the `target` change instead.
  const targetId = target?.id
  useEffect(() => {
    if (targetId) {
      setEfficiency('')
      setVoc('')
      setJsc('')
      setFf('')
      setCertified(false)
      setBandgap('')
      setMethod('')
      setConditions('')
      setTestConditions('')
      setDoi('')
      setYear('')
      setNotes('')
    }
  }, [targetId])

  const hasEff = efficiency.trim() !== ''
  const hasBg = bandgap.trim() !== '' || method.trim() !== '' || conditions.trim() !== ''
  const canSave = (hasEff || hasBg) && !isPending

  const handleSave = () => {
    if (!target || !canSave) return
    // Build the payload — empty strings are omitted so the API doesn't
    // have to distinguish "0" from "not provided".
    const body: Record<string, unknown> = { materialId: target.id }
    if (efficiency.trim()) body.efficiency = Number(efficiency)
    if (voc.trim()) body.voc = Number(voc)
    if (jsc.trim()) body.jsc = Number(jsc)
    if (ff.trim()) body.ff = Number(ff)
    if (certified) body.certified = true
    if (bandgap.trim()) body.bandgap = Number(bandgap)
    if (method) body.method = method
    if (conditions.trim()) body.conditions = conditions
    if (testConditions.trim()) body.testConditions = testConditions
    if (doi.trim()) body.doi = doi
    if (year.trim()) body.year = Number(year)
    if (notes.trim()) body.notes = notes
    onSubmit(body)
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TestTube2 className="w-4 h-4 text-rose-500" />
            {t('materials.experimentEntry.title')}
            {target && (
              <span className="font-mono text-xs text-slate-500 ml-1">
                <FormulaViewer formula={target.name} size="sm" colorful={false} />
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {t('materials.experimentEntry.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-5 py-1">
          {/* ── Material name (read-only) ─────────────────────────────── */}
          <div>
            <Label htmlFor="exp-material" className="text-xs text-slate-500">
              {t('materials.experimentEntry.material')}
            </Label>
            <Input
              id="exp-material"
              value={target?.name ?? ''}
              readOnly
              disabled
              className="mt-1 font-mono bg-slate-50 dark:bg-slate-900"
            />
          </div>

          {/* ── Section: Efficiency ───────────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-3">
            <header className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <span className="w-1 h-3 rounded-sm bg-emerald-400" />
              {t('materials.experimentEntry.section.efficiency')}
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label htmlFor="exp-pce" className="text-xs">PCE (%)</Label>
                <Input
                  id="exp-pce"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="22.5"
                  value={efficiency}
                  onChange={(e) => setEfficiency(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="exp-voc" className="text-xs">Voc (V)</Label>
                <Input
                  id="exp-voc"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  placeholder="1.12"
                  value={voc}
                  onChange={(e) => setVoc(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="exp-jsc" className="text-xs">
                  Jsc (mA/cm²)
                </Label>
                <Input
                  id="exp-jsc"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="24.8"
                  value={jsc}
                  onChange={(e) => setJsc(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="exp-ff" className="text-xs">
                  {t('materials.experimentEntry.fillFactor')}
                </Label>
                <Input
                  id="exp-ff"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  max="1"
                  placeholder="0.81"
                  value={ff}
                  onChange={(e) => setFf(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="exp-certified"
                checked={certified}
                onCheckedChange={(v) => setCertified(v === true)}
              />
              <Label htmlFor="exp-certified" className="text-xs cursor-pointer">
                {t('materials.experimentEntry.certified')}
              </Label>
            </div>
          </section>

          {/* ── Section: Properties ──────────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-3">
            <header className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <span className="w-1 h-3 rounded-sm bg-amber-400" />
              {t('materials.experimentEntry.section.properties')}
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="exp-bg" className="text-xs">
                  {t('materials.experimentEntry.bandgap')}
                </Label>
                <Input
                  id="exp-bg"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  placeholder="1.55"
                  value={bandgap}
                  onChange={(e) => setBandgap(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="exp-method" className="text-xs">
                  {t('materials.experimentEntry.synthesisMethod')}
                </Label>
                <Select
                  value={method || '__none__'}
                  onValueChange={(v) => setMethod(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger id="exp-method" className="mt-1">
                    <SelectValue placeholder={t('materials.experimentEntry.selectMethod')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNTHESIS_METHODS.map((m) => (
                      <SelectItem key={m.value || '__none__'} value={m.value || '__none__'}>
                        {t(`materials.experimentEntry.method.${m.value || 'none'}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="exp-conditions" className="text-xs">
                {t('materials.experimentEntry.synthesisConditions')}
              </Label>
              <Textarea
                id="exp-conditions"
                rows={2}
                placeholder={t('materials.experimentEntry.conditionsPh')}
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="exp-test" className="text-xs">
                {t('materials.experimentEntry.testConditions')}
              </Label>
              <Input
                id="exp-test"
                placeholder="AM1.5G, 100 mW/cm², 25°C"
                value={testConditions}
                onChange={(e) => setTestConditions(e.target.value)}
                className="mt-1"
              />
            </div>
          </section>

          {/* ── Section: Source ──────────────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-3">
            <header className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <span className="w-1 h-3 rounded-sm bg-sky-400" />
              {t('materials.experimentEntry.section.source')}
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="exp-doi" className="text-xs">
                  {t('materials.experimentEntry.doiOptional', { optional: t('materials.experimentEntry.optional') })}
                </Label>
                <Input
                  id="exp-doi"
                  placeholder="10.1038/xxxxx"
                  value={doi}
                  onChange={(e) => setDoi(e.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="exp-year" className="text-xs">
                  {t('materials.experimentEntry.year')}
                </Label>
                <Input
                  id="exp-year"
                  type="number"
                  inputMode="numeric"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  placeholder={String(new Date().getFullYear())}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="exp-notes" className="text-xs">
                {t('materials.experimentEntry.notes')}
              </Label>
              <Textarea
                id="exp-notes"
                rows={2}
                placeholder={t('materials.experimentEntry.notesPh')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
              />
            </div>
          </section>

          {/* Validation hint */}
          {!canSave && (
            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {t('materials.experimentEntry.validationHint')}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <span className="text-xs text-slate-400 mr-auto">
            {t('materials.experimentEntry.footer')}
          </span>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
