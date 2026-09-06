'use client'

import { useRef } from 'react'
import {
  Sparkles,
  ChevronDown,
  ShieldCheck,
  Leaf,
  Clock,
  Zap,
  CheckCircle2,
  Filter,
  Download,
  Upload,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n, translate } from '@/components/i18n/provider'
import type { Locale } from '@/components/i18n/provider'

/**
 * A user-saved export filter combo, persisted to localStorage so it can be
 * re-run with one click from the Presets dropdown.
 *
 * `filters` mirrors the query params accepted by /api/export — only the
 * metadata fields (reviewer / project / fromYear / toYear) are populated when
 * saving from the Custom filter dialog, but the type is forward-compatible
 * with the quick-preset flags (verified / synthOnly / hasEfficiency / leadFree
 * / category / recent) so future enhancements can extend the dialog without
 * breaking stored presets.
 */
export interface SavedPreset {
  id: string
  name: string
  filters: {
    verified?: boolean
    synthOnly?: boolean
    hasEfficiency?: boolean
    leadFree?: boolean
    category?: string
    recent?: boolean
    reviewer?: string
    project?: string
    fromYear?: number
    toYear?: number
  }
  createdAt: number
}

/** localStorage key under which saved presets are persisted (JSON array). */
export const SAVED_PRESETS_KEY = 'matlit-export-presets'

/**
 * Build a /api/export query string from a SavedPreset's filters object.
 * Only truthy / non-default fields are emitted so the resulting URL stays
 * short and the API treats missing params as "no filter".
 */
export function presetToQuery(f: SavedPreset['filters']): string {
  const p = new URLSearchParams()
  if (f.verified) p.set('verified', 'true')
  if (f.synthOnly) p.set('synthOnly', 'true')
  if (f.hasEfficiency) p.set('hasEfficiency', 'true')
  if (f.leadFree) p.set('leadFree', 'true')
  if (f.category && f.category !== 'all') p.set('category', f.category)
  if (f.recent) p.set('recent', 'true')
  if (f.reviewer) p.set('reviewer', f.reviewer)
  if (f.project) p.set('project', f.project)
  if (f.fromYear) p.set('fromYear', String(f.fromYear))
  if (f.toYear) p.set('toYear', String(f.toYear))
  return p.toString()
}

/**
 * Localized strings shared by PresetMenu + CustomFilterDialog. Backed by the
 * `results.preset.*` keys in src/components/i18n/provider.tsx. Extracted here
 * (rather than each dialog calling `t()` inline) so both dialogs share one
 * source of truth and the existing CustomFilterDialog call site can stay a
 * plain function invocation (`getPresetStrings(locale)`).
 */
export function getPresetStrings(locale: Locale) {
  return {
    byMetadata: translate(locale, 'results.preset.byMetadata'),
    customFilter: translate(locale, 'results.preset.customFilter'),
    customFilterDesc: translate(locale, 'results.preset.customFilterDesc'),
    reviewer: translate(locale, 'results.preset.reviewer'),
    allReviewers: translate(locale, 'results.preset.allReviewers'),
    noReviewers: translate(locale, 'results.preset.noReviewers'),
    project: translate(locale, 'results.preset.project'),
    allProjects: translate(locale, 'results.preset.allProjects'),
    fromYear: translate(locale, 'results.preset.fromYear'),
    toYear: translate(locale, 'results.preset.toYear'),
    fromYearPh: translate(locale, 'results.preset.fromYearPh'),
    toYearPh: translate(locale, 'results.preset.toYearPh'),
    yearHint: translate(locale, 'results.preset.yearHint'),
    noFilters: translate(locale, 'results.preset.noFilters'),
    filtersApplied: (n: number) =>
      translate(locale, 'results.preset.filtersApplied', { n }),
    exportCsv: translate(locale, 'results.preset.exportCsv'),
    savedPresets: translate(locale, 'results.preset.savedPresets'),
    noSavedPresets: translate(locale, 'results.preset.noSavedPresets'),
    presetName: translate(locale, 'results.preset.presetName'),
    presetNamePh: translate(locale, 'results.preset.presetNamePh'),
    presetNameHint: translate(locale, 'results.preset.presetNameHint'),
    savePreset: translate(locale, 'results.preset.savePreset'),
    deletePreset: translate(locale, 'results.preset.deletePreset'),
    exportPresets: translate(locale, 'results.preset.exportPresets'),
    importPresets: translate(locale, 'results.preset.importPresets'),
  }
}

export type PresetStrings = ReturnType<typeof getPresetStrings>

export interface PresetMenuProps {
  savedPresets: SavedPreset[]
  /** Quick-preset export (verified / leadFree / recent / …). */
  onPresetExport: (params: string, presetName: string) => void
  /** Re-run a saved preset (opens the preview dialog with its filters). */
  onRunSavedPreset: (preset: SavedPreset) => void
  /** Delete a saved preset by id. */
  onDeletePreset: (id: string) => void
  /** Export all saved presets as a JSON file. */
  onExportPresets: () => void
  /** Import presets from a user-selected JSON file. */
  onImportPresets: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Open the custom-filter dialog. */
  onOpenCustomFilter: () => void
}

/**
 * Presets dropdown rendered in the Results tab toolbar. Hosts the quick
 * export presets (verified / leadFree / recent / hasEfficiency / synthOnly),
 * the "Custom filter…" entry that opens the metadata-filter dialog, and the
 * saved-presets section (with import / export / delete controls).
 *
 * The hidden file input used by "Import presets" is rendered as a sibling of
 * the dropdown so closing the dropdown mid-read doesn't tear it down.
 */
export function PresetMenu({
  savedPresets,
  onPresetExport,
  onRunSavedPreset,
  onDeletePreset,
  onExportPresets,
  onImportPresets,
  onOpenCustomFilter,
}: PresetMenuProps) {
  const { t, locale } = useI18n()
  const L = getPresetStrings(locale)
  const presetFileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Sparkles className="w-4 h-4 mr-1 text-violet-500" />
            {t('presets.title')}
            <ChevronDown className="w-3.5 h-3.5 ml-1 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs text-slate-500 uppercase tracking-wide">
            {t('presets.quickExports')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            title={t('presets.verifiedDesc')}
            onClick={() => onPresetExport('verified=true', t('presets.verified'))}
            className="gap-2.5 py-2"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{t('presets.verified')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            title={t('presets.leadFreeDesc')}
            onClick={() => onPresetExport('leadFree=true&category=perovskite', t('presets.leadFree'))}
            className="gap-2.5 py-2"
          >
            <Leaf className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{t('presets.leadFree')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            title={t('presets.recentDesc')}
            onClick={() => onPresetExport('recent=true', t('presets.recent'))}
            className="gap-2.5 py-2"
          >
            <Clock className="w-4 h-4 text-sky-500 shrink-0" />
            <span>{t('presets.recent')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            title={t('presets.hasEfficiencyDesc')}
            onClick={() => onPresetExport('hasEfficiency=true', t('presets.hasEfficiency'))}
            className="gap-2.5 py-2"
          >
            <Zap className="w-4 h-4 text-orange-500 shrink-0" />
            <span>{t('presets.hasEfficiency')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            title={t('presets.synthesizedDesc')}
            onClick={() => onPresetExport('synthOnly=true', t('presets.synthesized'))}
            className="gap-2.5 py-2"
          >
            <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
            <span>{t('presets.synthesized')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-slate-500 uppercase tracking-wide">
            {L.byMetadata}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            title={L.customFilterDesc}
            onClick={onOpenCustomFilter}
            className="gap-2.5 py-2"
          >
            <Filter className="w-4 h-4 text-violet-500 shrink-0" />
            <span>{L.customFilter}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-slate-500 uppercase tracking-wide">
            <span className="flex items-center justify-between gap-2 w-full">
              <span>{L.savedPresets}</span>
              <span className="flex items-center gap-0.5 -mr-1">
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onExportPresets()
                  }}
                  disabled={savedPresets.length === 0}
                  className="text-slate-400 hover:text-emerald-500 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={L.exportPresets}
                  aria-label={L.exportPresets}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    presetFileInputRef.current?.click()
                  }}
                  className="text-slate-400 hover:text-sky-500 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={L.importPresets}
                  aria-label={L.importPresets}
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {savedPresets.length === 0 ? (
            <DropdownMenuItem disabled className="gap-2.5 py-2">
              <Star className="w-4 h-4 shrink-0 opacity-50" />
              <span className="text-slate-400">{L.noSavedPresets}</span>
            </DropdownMenuItem>
          ) : (
            savedPresets.map((p) => (
              <DropdownMenuItem
                key={p.id}
                title={presetToQuery(p.filters) || t('results.preset.noFiltersShort')}
                onClick={() => onRunSavedPreset(p)}
                className="gap-2.5 py-2"
              >
                <Star className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="flex-1 truncate">{p.name}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onDeletePreset(p.id)
                  }}
                  className="text-slate-400 hover:text-red-500 transition-colors p-0.5 -mr-1 shrink-0"
                  title={L.deletePreset}
                  aria-label={L.deletePreset}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file input used by the "Import presets" button inside the
          Saved presets dropdown. Rendered as a sibling of the dropdown (not
          inside DropdownMenuContent) so the dropdown closing on item click
          doesn't tear it down mid-read. */}
      <input
        ref={presetFileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImportPresets}
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  )
}
