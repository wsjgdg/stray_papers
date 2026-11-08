'use client'

import { DollarSign, Loader2, AlertCircle } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useI18n } from '@/components/i18n/provider'

// Material cost estimate returned by /api/materials/[id]/cost (N6).
interface CostElement {
  symbol: string
  name: string
  count: number
  pricePerGram: number
  totalCost: number
  gramsPerMole: number
}
interface CostEstimatePayload {
  elements: CostElement[]
  costPerMole: number
  totalCost: number
  costPerGram: number
  molarMass: number
  availability: 'common' | 'rare' | 'very-rare'
  notes: string[]
  estimated: boolean
}
export interface CostResponse {
  materialId: string
  formula: string
  estimate: CostEstimatePayload
}

/**
 * Material cost estimate dialog (N6).
 *
 * Renders the per-element cost breakdown returned by /api/materials/[id]/cost.
 * Layout: big "cost per gram" header → molar mass / cost-per-mole row →
 * availability badge → element breakdown table → safety / cost-saving notes.
 */
export function CostDialog({
  state,
  onClose,
}: {
  state: {
    open: boolean
    materialId: string | null
    materialName: string
    loading: boolean
    error: string | null
    data: CostResponse | null
  }
  /** Kept for backwards-compat with the parent (materials-tab.tsx) — no longer used inside. */
  locale?: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const est = state.data?.estimate
  const availabilityColor =
    est?.availability === 'very-rare'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
      : est?.availability === 'rare'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
  const availabilityLabel =
    est?.availability === 'very-rare'
      ? t('materials.costDialog.availability.veryRare')
      : est?.availability === 'rare'
        ? t('materials.costDialog.availability.rare')
        : t('materials.costDialog.availability.common')

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            {t('materials.costDialog.title')}
            <span className="font-mono text-xs text-slate-500 ml-1">{state.materialName}</span>
          </DialogTitle>
          <DialogDescription>
            {t('materials.costDialog.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {state.loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
              <span className="text-sm">{t('materials.costDialog.parsing')}</span>
            </div>
          ) : state.error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-500">
              <AlertCircle className="w-7 h-7" />
              <span className="text-sm text-center">{state.error}</span>
            </div>
          ) : est ? (
            <div className="space-y-4">
              {/* Headline cost-per-gram */}
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
                <div className="text-[11px] sm:text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">
                  {t('materials.costDialog.costPerGram')}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    ${est.costPerGram.toFixed(3)}
                  </span>
                  <span className="text-xs text-slate-500">/ g</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    {t('materials.costDialog.molarMass')}:{' '}
                    <span className="font-mono">{est.molarMass.toFixed(2)} g/mol</span>
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>
                    {t('materials.costDialog.costPerMole')}:{' '}
                    <span className="font-mono">${est.costPerMole.toFixed(2)}</span>
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <Badge variant="outline" className={`text-[11px] sm:text-[10px] ${availabilityColor}`}>
                    {availabilityLabel}
                  </Badge>
                  {est.estimated && (
                    <Badge variant="outline" className="text-[11px] sm:text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      {t('materials.costDialog.estimated')}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Element breakdown table */}
              {est.elements.length > 0 ? (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
                        <TableRow>
                          <TableHead className="text-xs">{t('materials.costDialog.col.element')}</TableHead>
                          <TableHead className="text-xs text-right">{t('materials.costDialog.col.count')}</TableHead>
                          <TableHead className="text-xs text-right">{t('materials.costDialog.col.gramsPerMole')}</TableHead>
                          <TableHead className="text-xs text-right">{t('materials.costDialog.col.price')}</TableHead>
                          <TableHead className="text-xs text-right">{t('materials.costDialog.col.subtotal')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {est.elements.map((e, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-medium text-sm">{e.symbol}</span>
                                <span className="text-[11px] text-slate-500 truncate max-w-[140px]">{e.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">{e.count.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums text-slate-500">{e.gramsPerMole.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">${e.pricePerGram.toFixed(3)}</TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums font-medium">${e.totalCost.toFixed(3)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                  {t('materials.costDialog.noElements')}
                </div>
              )}

              {/* Notes (safety warnings + cost-saving suggestions) */}
              {est.notes.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('materials.costDialog.notes')}
                  </div>
                  <ul className="space-y-1">
                    {est.notes.map((n, i) => {
                      const isWarning = /⚠|toxic|Pb|Cd|Hg|Tl|As|carcinogen|safety|handle with care/i.test(n)
                      return (
                        <li
                          key={i}
                          className={`flex gap-1.5 text-xs rounded-md px-2 py-1.5 ${
                            isWarning
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
                              : 'bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400'
                          }`}
                        >
                          <span className={isWarning ? 'text-rose-500' : 'text-slate-400'}>•</span>
                          <span>{n}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-sm">
              {t('materials.costDialog.noData')}
            </div>
          )}
        </div>

        {state.data && !state.loading && (
          <DialogFooter className="gap-2">
            <span className="text-xs text-slate-400 mr-auto">
              {t('materials.costDialog.footer')}
            </span>
            <Button size="sm" variant="outline" onClick={onClose}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
