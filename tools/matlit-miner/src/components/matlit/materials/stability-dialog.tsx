'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Loader2, AlertCircle, Clock, ThermometerSun, Droplets, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api-client'
import { FormulaViewer } from '@/components/matlit/formula-viewer'
import { useI18n } from '@/components/i18n/provider'
import { type Material } from './shared'

// G5 — Stability record returned by /api/stability. T80 = hours under the
// specified test protocol for the cell to drop to 80% of its initial
// efficiency. Stored in-memory in the API route (no schema change).
export interface StabilityRecord {
  id: string
  materialId: string
  materialName?: string
  t80: number | null
  degradationRate: number | null
  testCondition: string
  temperature: number | null
  humidity: number | null
  lightSoaking: string
  encapsulated: boolean
  source: string
  year: number | null
  notes: string
  createdAt: string
}
export interface StabilityResponse {
  records: StabilityRecord[]
  source: 'user' | 'curated' | 'default' | 'catalogue'
  total: number
}

// ISOS stability-protocol presets (consensus from Khenkin et al., Nat. Energy
// 2020). Used to populate the test-condition dropdown in the add-record form.
const STABILITY_PROTOCOLS = [
  { value: 'ISOS-L-1' },
  { value: 'ISOS-L-2' },
  { value: 'ISOS-L-3' },
  { value: 'ISOS-D-1' },
  { value: 'ISOS-D-2' },
  { value: 'ISOS-D-3' },
  { value: 'ISOS-T-1' },
  { value: 'ISOS-T-2' },
  { value: 'ISOS-T-3' },
  { value: 'outdoor' },
  { value: 'custom' },
]

// Colour-code a T80 value for the stability table. Green ≥ 10000 h,
// amber 1000–10000 h, red < 1000 h, slate when null.
function t80Color(t80: number | null): string {
  if (t80 === null) return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  if (t80 >= 10000) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
  if (t80 >= 1000) return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
  return 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
}

// Format a T80 (hours) into a compact human string: 100h / 1.0kh / 12.0kh.
function formatT80(t80: number | null): string {
  if (t80 === null) return '—'
  if (t80 < 1000) return `${t80.toFixed(0)}h`
  return `${(t80 / 1000).toFixed(1)}kh`
}

// ────────────────────────────────────────────────────────────────────────────
// G5 — Stability database dialog.
//
// Shows the T80 / degradation-rate / ISOS test-protocol records for a
// single material:
//   1. The "headline" T80 badge — the best (longest) T80 across all
//      records, colour-coded per the project convention (green ≥ 10000 h,
//      amber 1000–10000 h, red < 1000 h).
//   2. A scrollable table of every record (curated + user-submitted),
//      with the test protocol, environmental conditions, encapsulation
//      flag, source citation, year, and notes.
//   3. An inline "Add stability record" form for the user's own
//      measurements. On submit it POSTs to /api/stability; the parent
//      MaterialsTab component owns the mutation and invalidates the
//      ['stability'] query cache so the new row appears immediately.
//
// The dialog loads its own data lazily — the parent passes `target` only
// when the dialog should be open, and the useQuery is `enabled: !!target`
// so opening the dialog for one material doesn't fire requests for every
// other row in the materials table.
// ────────────────────────────────────────────────────────────────────────────
export function StabilityDialog({
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

  // ── Load records for the open material ───────────────────────────────
  // The query key includes materialId + name + category so changing any
  // of them is treated as a new query (and the curated-match logic in
  // the API can match the right benchmarks).
  const targetId = target?.id
  const targetName = target?.name
  const targetCat = target?.category
  const { data, isLoading, error } = useQuery<StabilityResponse>({
    queryKey: ['stability', targetId, targetName, targetCat],
    queryFn: () => {
      const params = new URLSearchParams()
      if (targetId) params.set('materialId', targetId)
      if (targetName) params.set('materialName', targetName)
      if (targetCat) params.set('category', targetCat)
      return api(`/api/stability?${params.toString()}`)
    },
    enabled: !!targetId,
    staleTime: 60_000, // 1 min — stability records don't change often
  })

  // ── Add-record form state ────────────────────────────────────────────
  const [t80, setT80] = useState('')
  const [degradationRate, setDegradationRate] = useState('')
  const [testCondition, setTestCondition] = useState('ISOS-L-2')
  const [temperature, setTemperature] = useState('')
  const [humidity, setHumidity] = useState('')
  const [lightSoaking, setLightSoaking] = useState('AM1.5G 100 mW/cm²')
  const [encapsulated, setEncapsulated] = useState(true)
  const [source, setSource] = useState('')
  const [year, setYear] = useState('')
  const [notes, setNotes] = useState('')

  // Reset form whenever the dialog opens for a new material (mirrors the
  // ExperimentEntryDialog pattern — Radix owns the Dialog, so we can't
  // just key the whole component).
  useEffect(() => {
    if (targetId) {
      setT80('')
      setDegradationRate('')
      setTestCondition('ISOS-L-2')
      setTemperature('')
      setHumidity('')
      setLightSoaking('AM1.5G 100 mW/cm²')
      setEncapsulated(true)
      setSource('')
      setYear('')
      setNotes('')
    }
  }, [targetId])

  const records = data?.records ?? []
  // "Best" T80 = the longest T80 with a numeric value. Used for the
  // headline badge at the top of the dialog.
  const bestT80 = records.reduce<number | null>((best, r) => {
    if (r.t80 === null) return best
    return best === null || r.t80 > best ? r.t80 : best
  }, null)

  const hasInput =
    t80.trim() !== '' ||
    degradationRate.trim() !== '' ||
    notes.trim() !== ''
  const canSave = hasInput && !isPending

  const handleSave = () => {
    if (!target || !canSave) return
    const body: Record<string, unknown> = {
      materialId: target.id,
      materialName: target.name,
    }
    if (t80.trim()) body.t80 = Number(t80)
    if (degradationRate.trim()) body.degradationRate = Number(degradationRate)
    if (testCondition) body.testCondition = testCondition
    if (temperature.trim()) body.temperature = Number(temperature)
    if (humidity.trim()) body.humidity = Number(humidity)
    if (lightSoaking.trim()) body.lightSoaking = lightSoaking
    body.encapsulated = encapsulated
    if (source.trim()) body.source = source
    if (year.trim()) body.year = Number(year)
    if (notes.trim()) body.notes = notes
    onSubmit(body)
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            {t('materials.stabilityDialog.title')}
            {target && (
              <span className="font-mono text-xs text-slate-500 ml-1">
                <FormulaViewer formula={target.name} size="sm" colorful={false} />
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {t('materials.stabilityDialog.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4 py-1">
          {/* ── Headline T80 badge ───────────────────────────────────── */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/40">
            <div className={`px-3 py-2 rounded-md font-mono text-lg font-semibold ${t80Color(bestT80)}`}>
              {formatT80(bestT80)}
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {t('materials.stabilityDialog.bestT80')}
              </div>
              <div className="text-xs text-slate-500">
                {records.length === 0
                  ? (t('materials.stabilityDialog.noData'))
                  : t('materials.stabilityDialog.recordsCount', { count: records.length, source: data?.source ?? '?' })
                }
              </div>
            </div>
            {/* Legend for the colour code */}
            <div className="hidden sm:flex flex-col gap-1 text-[11px] sm:text-[10px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> {t('materials.stabilityDialog.legend.ge')}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> {t('materials.stabilityDialog.legend.mid')}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> {t('materials.stabilityDialog.legend.lt')}
              </div>
            </div>
          </div>

          {/* ── Loading + error states ──────────────────────────────── */}
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('materials.stabilityDialog.loading')}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              {(error as Error).message}
            </div>
          )}

          {/* ── Records table ───────────────────────────────────────── */}
          {!isLoading && !error && records.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
                    <TableRow>
                      <TableHead className="text-xs h-8">{t('materials.stabilityDialog.col.t80')}</TableHead>
                      <TableHead className="text-xs h-8">{t('materials.stabilityDialog.col.protocol')}</TableHead>
                      <TableHead className="text-xs h-8">{t('materials.stabilityDialog.col.conditions')}</TableHead>
                      <TableHead className="text-xs h-8">{t('materials.stabilityDialog.col.encap')}</TableHead>
                      <TableHead className="text-xs h-8">{t('materials.stabilityDialog.col.source')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="py-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-xs ${t80Color(r.t80)}`}>
                            {formatT80(r.t80)}
                          </span>
                          {r.degradationRate !== null && (
                            <div className="text-[11px] sm:text-[10px] text-slate-400 mt-0.5">
                              {r.degradationRate}%/kh
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-xs font-medium">
                          {r.testCondition}
                          {r.year && (
                            <div className="text-[11px] sm:text-[10px] text-slate-400 mt-0.5">{r.year}</div>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-slate-600 dark:text-slate-400">
                          {r.temperature !== null && (
                            <div className="flex items-center gap-1">
                              <ThermometerSun className="w-3 h-3" /> {r.temperature}°C
                            </div>
                          )}
                          {r.humidity !== null && (
                            <div className="flex items-center gap-1">
                              <Droplets className="w-3 h-3" /> {r.humidity}% RH
                            </div>
                          )}
                          <div className="flex items-center gap-1 truncate max-w-[140px]" title={r.lightSoaking}>
                            <Sun className="w-3 h-3" /> {r.lightSoaking}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge
                            variant="outline"
                            className={`text-[11px] sm:text-[10px] px-1 py-0 h-4 ${
                              r.encapsulated
                                ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
                                : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                            }`}
                          >
                            {r.encapsulated ? (t('materials.stabilityDialog.encap.yes')) : (t('materials.stabilityDialog.encap.no'))}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-xs text-slate-600 dark:text-slate-400">
                          <div className="font-medium truncate max-w-[120px]" title={r.source}>
                            {r.source || '—'}
                          </div>
                          {r.notes && (
                            <div className="text-[11px] sm:text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px]" title={r.notes}>
                              {r.notes}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ── Add record form ─────────────────────────────────────── */}
          <section className="rounded-lg border border-teal-200 dark:border-teal-900/50 bg-teal-50/40 dark:bg-teal-950/10 p-3 space-y-3">
            <header className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
              <span className="w-1 h-3 rounded-sm bg-teal-400" />
              {t('materials.stabilityDialog.addRecord')}
            </header>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="stab-t80" className="text-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" /> T80 (h)
                </Label>
                <Input
                  id="stab-t80"
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  placeholder="5000"
                  value={t80}
                  onChange={(e) => setT80(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="stab-deg" className="text-xs">
                  {t('materials.stabilityDialog.degRate')}
                </Label>
                <Input
                  id="stab-deg"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="4.0"
                  value={degradationRate}
                  onChange={(e) => setDegradationRate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor="stab-protocol" className="text-xs">
                  {t('materials.stabilityDialog.testProtocol')}
                </Label>
                <Select value={testCondition} onValueChange={setTestCondition}>
                  <SelectTrigger id="stab-protocol" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STABILITY_PROTOCOLS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {t(`materials.stabilityDialog.protocol.${p.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="stab-temp" className="text-xs flex items-center gap-1">
                  <ThermometerSun className="w-3 h-3" /> {t('materials.stabilityDialog.temp')}
                </Label>
                <Input
                  id="stab-temp"
                  type="number"
                  inputMode="numeric"
                  placeholder="65"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="stab-hum" className="text-xs flex items-center gap-1">
                  <Droplets className="w-3 h-3" /> {t('materials.stabilityDialog.humidity')}
                </Label>
                <Input
                  id="stab-hum"
                  type="number"
                  inputMode="numeric"
                  placeholder="50"
                  value={humidity}
                  onChange={(e) => setHumidity(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="stab-light" className="text-xs flex items-center gap-1">
                  <Sun className="w-3 h-3" /> {t('materials.stabilityDialog.lightSoaking')}
                </Label>
                <Input
                  id="stab-light"
                  placeholder="AM1.5G 100 mW/cm²"
                  value={lightSoaking}
                  onChange={(e) => setLightSoaking(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="stab-src" className="text-xs">
                  {t('materials.stabilityDialog.source.ref')}
                </Label>
                <Input
                  id="stab-src"
                  placeholder="10.1038/xxxxx"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="stab-year" className="text-xs">
                  {t('materials.stabilityDialog.year')}
                </Label>
                <Input
                  id="stab-year"
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
              <div className="flex items-end pb-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="stab-encap"
                    checked={encapsulated}
                    onCheckedChange={(v) => setEncapsulated(v === true)}
                  />
                  <Label htmlFor="stab-encap" className="text-xs cursor-pointer">
                    {t('materials.stabilityDialog.encapsulated')}
                  </Label>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="stab-notes" className="text-xs">
                {t('materials.stabilityDialog.notes')}
              </Label>
              <Textarea
                id="stab-notes"
                rows={2}
                placeholder={t('materials.stabilityDialog.notesPh')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
              />
            </div>

            {!hasInput && (
              <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {t('materials.stabilityDialog.validationHint')}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="gap-2">
          <span className="text-xs text-slate-400 mr-auto">
            {t('materials.stabilityDialog.footer')}
          </span>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('common.close')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('materials.stabilityDialog.addBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
