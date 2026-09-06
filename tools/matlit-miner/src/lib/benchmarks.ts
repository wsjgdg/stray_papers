// Industry benchmark solar-cell efficiencies used to compare user-extracted
// values against the state of the art in the Results tab.
//
// Sources:
//   - NREL Best Research-Cell Efficiency Chart (2024 revision)
//     https://www.nrel.gov/pv/cell-efficiency.html
//   - Shockley-Queisser detailed-balance limit (single-junction, AM1.5G).
//     The canonical SQ limit is ~33.5% at Eg ≈ 1.34 eV; we use category-tuned
//     variants (e.g. 30.5% for perovskite-tuned Eg ≈ 1.55 eV) so the
//     "gap to theoretical ceiling" stays meaningful for each family.
//   - Perovskite Database Project (open dataset of perovskite device records)
//     https://www.perovskitedatabase.com/
//
// `getBenchmark(category, materialName?)` returns the most-specific match:
// if a material-specific benchmark exists (matched case-insensitively
// against the canonical material name), it wins over the generic category
// benchmark.

export interface Benchmark {
  /** Material category — matches Material.category in the Prisma schema. */
  category: string
  /** Optional material-specific benchmark (canonical formula, e.g. 'MAPbI3'). */
  material?: string
  /** Reference bandgap in eV (only when known / relevant). */
  bandgap?: number
  /** Best reported efficiency (%) for this category / material. */
  efficiency: number
  /** Human-readable source label, e.g. 'NREL 2024'. */
  source: string
  /** Year the benchmark was last revised. */
  year: number
}

/**
 * Curated benchmark table. ~17 entries covering the four material
 * categories plus theoretical SQ limits for the three main families.
 */
export const BENCHMARKS: Benchmark[] = [
  // ── Perovskite (NREL Best Research-Cell, 2024 revision) ────────────────
  { category: 'perovskite', efficiency: 26.1, source: 'NREL 2024', year: 2024 },
  { category: 'perovskite', material: 'MAPbI3', efficiency: 25.7, source: 'NREL 2024', year: 2024 },
  { category: 'perovskite', material: 'FAPbI3', efficiency: 25.8, source: 'NREL 2024', year: 2024 },
  { category: 'perovskite', material: 'CsPbBr3', efficiency: 11.5, source: 'Perovskite DB', year: 2024 },
  { category: 'perovskite', material: 'MAPbBr3', efficiency: 8.6, source: 'Perovskite DB', year: 2023 },
  { category: 'perovskite', material: 'MASnI3', efficiency: 6.5, source: 'Perovskite DB', year: 2023 },

  // ── Chalcogenide (CIGS / CdTe / CZTS family) ───────────────────────────
  { category: 'chalcogenide', efficiency: 23.6, source: 'NREL 2024 (CIGS)', year: 2024 },
  { category: 'chalcogenide', material: 'CIGS', efficiency: 23.6, source: 'NREL 2024', year: 2024 },
  { category: 'chalcogenide', material: 'CIGSe', efficiency: 23.6, source: 'NREL 2024', year: 2024 },
  { category: 'chalcogenide', material: 'CdTe', efficiency: 22.3, source: 'NREL 2024', year: 2024 },
  { category: 'chalcogenide', material: 'CZTS', efficiency: 13.6, source: 'NREL 2024', year: 2024 },
  { category: 'chalcogenide', material: 'CZTSe', efficiency: 12.4, source: 'NREL 2024', year: 2024 },

  // ── Oxide (mostly DSSC / photoelectrochemical) ─────────────────────────
  { category: 'oxide', efficiency: 8.1, source: 'NREL DSSC', year: 2024 },
  { category: 'oxide', material: 'TiO2', efficiency: 8.1, source: 'NREL DSSC', year: 2024 },
  { category: 'oxide', material: 'ZnO', efficiency: 7.5, source: 'DSSC literature', year: 2023 },
  { category: 'oxide', material: 'Fe2O3', efficiency: 1.2, source: 'Hematite literature', year: 2023 },
  { category: 'oxide', material: 'BiVO4', efficiency: 4.5, source: 'PEC literature', year: 2023 },

  // ── Other (organic / emerging) ─────────────────────────────────────────
  { category: 'other', efficiency: 14.2, source: 'Emerging PV (organic)', year: 2024 },
  { category: 'other', material: 'organic', efficiency: 19.2, source: 'NREL 2024 (OPV)', year: 2024 },

  // ── Theoretical limits (Shockley-Queisser detailed balance) ────────────
  {
    category: 'perovskite',
    efficiency: 30.5,
    source: 'SQ limit (Shockley-Queisser)',
    year: 2024,
    bandgap: 1.55,
  },
  {
    category: 'chalcogenide',
    efficiency: 33.0,
    source: 'SQ limit (Shockley-Queisser)',
    year: 2024,
    bandgap: 1.34,
  },
  {
    category: 'oxide',
    efficiency: 28.0,
    source: 'SQ limit (Shockley-Queisser)',
    year: 2024,
    bandgap: 1.6,
  },
]

/**
 * Resolve the most-specific benchmark for a material.
 *
 * Lookup order:
 *   1. Material-specific entry (matched case-insensitively against the
 *      canonical `materialName`). e.g. `getBenchmark('perovskite', 'MAPbI3')`
 *      returns the 25.7% NREL 2024 row, not the generic 26.1% perovskite row.
 *   2. Generic category entry (no `material` field set).
 *
 * Returns `null` when no benchmark exists for the category at all (e.g. an
 * unknown category string).
 */
export function getBenchmark(category: string, materialName?: string): Benchmark | null {
  if (!category) return null

  // 1. Material-specific match (case-insensitive).
  if (materialName) {
    const needle = materialName.trim().toLowerCase()
    if (needle) {
      const matMatch = BENCHMARKS.find(
        (b) =>
          b.category === category &&
          !!b.material &&
          b.material.toLowerCase() === needle,
      )
      if (matMatch) return matMatch
    }
  }

  // 2. Generic category match (no `material` field).
  const catMatch = BENCHMARKS.find((b) => b.category === category && !b.material)
  return catMatch ?? null
}

/**
 * Shorten a benchmark `source` label for compact badge display.
 *
 * Strips parenthetical annotations and trailing 4-digit years so the badge
 * stays narrow in the table:
 *   'NREL 2024 (CIGS)'             → 'NREL'
 *   'SQ limit (Shockley-Queisser)' → 'SQ limit'
 *   'Perovskite DB'                → 'Perovskite DB'
 */
export function shortSource(source: string): string {
  return (
    source
      .replace(/\s*\(.*?\)\s*/g, '')
      .replace(/\s+\d{4}$/, '')
      .trim() || source
  )
}
