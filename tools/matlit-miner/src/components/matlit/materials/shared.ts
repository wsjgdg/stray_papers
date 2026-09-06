/**
 * Shared types + helpers used by both `materials-tab.tsx` (the main table
 * + state management) and the extracted dialog components in this folder.
 *
 * Extracted from materials-tab.tsx as part of M1a so the dialogs can import
 * these without creating a circular dependency back into the parent file.
 */

/** A single material row, as returned by GET /api/materials. */
export interface Material {
  id: string
  name: string
  aliases: string
  category: string
  notes: string
  tags?: string
  createdAt: string
  _count: { papers: number; efficiencies: number; verifications: number }
}

/** Material category → badge colour map. Used by the table and SimilarDialog. */
export const CATEGORIES = [
  { value: 'perovskite', label: 'Perovskite', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  { value: 'chalcogenide', label: 'Chalcogenide', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  { value: 'oxide', label: 'Oxide', color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  { value: 'other', label: 'Other', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
] as const

/** Resolve the badge colour class for a category string. Falls back to "other". */
export function categoryStyle(cat: string): string {
  return CATEGORIES.find((c) => c.value === cat)?.color || CATEGORIES[3].color
}
