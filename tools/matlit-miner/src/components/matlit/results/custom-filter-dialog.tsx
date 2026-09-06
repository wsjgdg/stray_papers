'use client'

import { Download, Filter, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/components/i18n/provider'
import { getPresetStrings } from '@/components/matlit/results/preset-menu'

export interface CustomFilterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preset name input (controlled). */
  presetName: string
  onPresetNameChange: (v: string) => void
  /** Reviewer dropdown value. */
  reviewer: string
  onReviewerChange: (v: string) => void
  /** Project dropdown value. */
  project: string
  onProjectChange: (v: string) => void
  /** From-year input (string — validated as digits on export). */
  fromYear: string
  onFromYearChange: (v: string) => void
  /** To-year input (string — validated as digits on export). */
  toYear: string
  onToYearChange: (v: string) => void
  /** Reviewer list for the dropdown (deduped from /api/verify). */
  reviewers: string[]
  /** Project list for the dropdown (from the project provider). */
  projects: string[]
  /** Save the current filter combo as a named preset. */
  onSavePreset: () => void
  /** Export CSV with the current filters applied. */
  onExport: () => void
}

/**
 * Custom CSV filter dialog — combines reviewer / project / year-range into a
 * single export URL. Each field is optional; empty fields are skipped by the
 * parent's URL builder. Also hosts the "Save preset" flow: the user names
 * the current filter combo and the parent persists it to localStorage.
 *
 * Purely presentational — all state + handlers live in the parent (ResultsTab)
 * so the save/export logic (validation, URL building, preset persistence)
 * stays in one place. Localized strings come from the shared
 * `getPresetStrings(locale)` helper.
 */
export function CustomFilterDialog({
  open,
  onOpenChange,
  presetName,
  onPresetNameChange,
  reviewer,
  onReviewerChange,
  project,
  onProjectChange,
  fromYear,
  onFromYearChange,
  toYear,
  onToYearChange,
  reviewers,
  projects,
  onSavePreset,
  onExport,
}: CustomFilterDialogProps) {
  const { t, locale } = useI18n()
  const L = getPresetStrings(locale)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-violet-500" /> {L.customFilter}
          </DialogTitle>
          <DialogDescription>{L.customFilterDesc}</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div>
            <Label className="text-xs" htmlFor="preset-name">{L.presetName}</Label>
            <Input
              id="preset-name"
              type="text"
              placeholder={L.presetNamePh}
              value={presetName}
              onChange={(e) => onPresetNameChange(e.target.value)}
              className="mt-1"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{L.presetNameHint}</p>
          </div>
          <div>
            <Label className="text-xs">{L.reviewer}</Label>
            <select
              value={reviewer}
              onChange={(e) => onReviewerChange(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{L.allReviewers}</option>
              {reviewers.length === 0 ? (
                <option value="" disabled>
                  {L.noReviewers}
                </option>
              ) : (
                reviewers.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))
              )}
            </select>
          </div>
          <div>
            <Label className="text-xs">{L.project}</Label>
            <select
              value={project}
              onChange={(e) => onProjectChange(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{L.allProjects}</option>
              {projects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs" htmlFor="custom-from-year">{L.fromYear}</Label>
              <Input
                id="custom-from-year"
                type="number"
                inputMode="numeric"
                min={1900}
                max={2100}
                placeholder={L.fromYearPh}
                value={fromYear}
                onChange={(e) => onFromYearChange(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="custom-to-year">{L.toYear}</Label>
              <Input
                id="custom-to-year"
                type="number"
                inputMode="numeric"
                min={1900}
                max={2100}
                placeholder={L.toYearPh}
                value={toYear}
                onChange={(e) => onToYearChange(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{L.yearHint}</p>
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2 text-xs text-slate-600 dark:text-slate-300 text-center border border-slate-200 dark:border-slate-700">
            {(() => {
              const n = [reviewer, project, fromYear, toYear].filter(
                (v) => v.trim() !== '',
              ).length
              return n === 0 ? L.noFilters : L.filtersApplied(n)
            })()}
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">{t('common.cancel')}</Button>
          <Button
            variant="outline"
            onClick={onSavePreset}
            className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-700 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40 dark:hover:text-violet-200"
          >
            <Save className="w-4 h-4 mr-1" /> {L.savePreset}
          </Button>
          <Button onClick={onExport} className="bg-violet-600 hover:bg-violet-700">
            <Download className="w-4 h-4 mr-1" /> {L.exportCsv}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
