'use client'

/**
 * G6 — Device structure visualization (solar cell layer stack).
 *
 * Renders a vertical, color-coded cross-section of a typical solar cell
 * built from the given material. Each layer is a `<div>` whose height
 * approximates the real thickness (compact planar device ~500–700 nm),
 * with a label, a thickness indicator (nm), and a role tag.
 *
 * The component takes `materialName` + `category` + optional `synthesisMethod`
 * and renders the *best-guess* structure for that combination. Common
 * structures covered:
 *   - n-i-p planar perovskite   (FTO | TiO2 | Perovskite | Spiro-OMeTAD | Au)
 *   - p-i-n inverted perovskite (FTO | NiO   | Perovskite | PCBM        | Ag)
 *   - mesoscopic perovskite     (FTO | c-TiO2+m-TiO2 | Perovskite | Spiro | Au)
 *   - chalcogenide CdTe         (FTO | CdS | CdTe | ZnTe:Cu | Au)
 *   - chalcogenide CIGS         (Mo | MoSe2 | CIGS | CdS | i-ZnO | AZO | Ni-Al)
 *   - oxide DSSC                (FTO | TiO2 meso | Dye | Electrolyte | Pt)
 *   - other / unknown           (Glass | TCO | Absorber | HTL/ETL | Metal)
 *
 * Heuristic:
 *   - perovskite + name contains "FA" / "Cs" → n-i-p TiO2/Spiro/Au
 *   - perovskite + "MASn" / "FASn" → still n-i-p but tin-HTL friendly
 *   - perovskite + "inverted" or "p-i-n" hint in name/notes → inverted p-i-n
 *   - perovskite + "meso" hint in name/method → mesoscopic
 *   - chalcogenide + name contains "CIGS" / "CIGSe" → CIGS stack
 *   - chalcogenide + name contains "CdTe" → CdTe stack
 *   - chalcogenide + name contains "CZTS" / "kesterite" → CZTS-like
 *   - oxide + name contains "TiO2" / "dye" / "DSSC" → DSSC stack
 *   - oxide otherwise → generic TiO2 / absorber / metal
 *
 * Colors (per spec):
 *   - substrate   : slate
 *   - ETL         : sky
 *   - absorber    : emerald
 *   - HTL         : violet
 *   - electrode   : amber
 *   - meso / extra: teal (additional layers like mesoporous TiO2)
 *   - dye / sens. : rose (sensitizer-only layer in DSSC)
 *
 * Pure CSS — no SVG / D3. The component is self-contained and importable
 * from materials-tab.tsx (and reusable in compare-dialog.tsx / dashboard).
 */

import { Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/components/i18n/provider'

/** A single layer in the device stack. */
export interface DeviceLayer {
  /** Layer role — drives the color. */
  role: 'substrate' | 'etl' | 'absorber' | 'htl' | 'electrode' | 'meso' | 'sensitizer' | 'buffer' | 'tco'
  /** Human-readable name (e.g. "TiO2", "Spiro-OMeTAD"). */
  name: string
  /** Approximate thickness in nm — used for the bar height + label. */
  thicknessNm: number
  /** Optional one-line role / function caption. */
  function?: string
}

/** A full device stack: ordered list of layers + a label + a note. */
export interface DeviceStructure {
  /** Stable id so React keys stay deterministic. */
  id: string
  /** Display label, e.g. "n-i-p planar perovskite". */
  label: string
  /** Short code shown in the badge, e.g. "n-i-p". */
  code: 'n-i-p' | 'p-i-n' | 'meso' | 'cdte' | 'cigs' | 'dssc' | 'generic'
  /** Layers, listed bottom (substrate) → top (electrode). */
  layers: DeviceLayer[]
  /** Optional one-line caveat shown under the stack. */
  note?: string
}

/** Role → Tailwind background + border color. Centralised so all stacks match. */
const ROLE_COLORS: Record<DeviceLayer['role'], { bg: string; border: string; text: string }> = {
  substrate: {
    bg: 'bg-slate-300 dark:bg-slate-700',
    border: 'border-slate-400 dark:border-slate-600',
    text: 'text-slate-700 dark:text-slate-200',
  },
  tco: {
    bg: 'bg-slate-200 dark:bg-slate-700/70',
    border: 'border-slate-300 dark:border-slate-600',
    text: 'text-slate-700 dark:text-slate-200',
  },
  etl: {
    bg: 'bg-sky-300 dark:bg-sky-800',
    border: 'border-sky-400 dark:border-sky-600',
    text: 'text-sky-900 dark:text-sky-100',
  },
  absorber: {
    bg: 'bg-emerald-400 dark:bg-emerald-700',
    border: 'border-emerald-500 dark:border-emerald-600',
    text: 'text-emerald-950 dark:text-emerald-50',
  },
  htl: {
    bg: 'bg-violet-300 dark:bg-violet-800',
    border: 'border-violet-400 dark:border-violet-600',
    text: 'text-violet-900 dark:text-violet-100',
  },
  electrode: {
    bg: 'bg-amber-400 dark:bg-amber-600',
    border: 'border-amber-500 dark:border-amber-500',
    text: 'text-amber-950 dark:text-amber-50',
  },
  meso: {
    bg: 'bg-teal-300 dark:bg-teal-800',
    border: 'border-teal-400 dark:border-teal-600',
    text: 'text-teal-900 dark:text-teal-50',
  },
  sensitizer: {
    bg: 'bg-rose-300 dark:bg-rose-800',
    border: 'border-rose-400 dark:border-rose-600',
    text: 'text-rose-900 dark:text-rose-50',
  },
  buffer: {
    bg: 'bg-cyan-200 dark:bg-cyan-900',
    border: 'border-cyan-300 dark:border-cyan-700',
    text: 'text-cyan-900 dark:text-cyan-50',
  },
}

/** Friendly role label, also used in the legend. */
const ROLE_LABEL: Record<DeviceLayer['role'], string> = {
  substrate: 'Substrate',
  tco: 'TCO',
  etl: 'ETL',
  absorber: 'Absorber',
  htl: 'HTL',
  electrode: 'Electrode',
  meso: 'Mesoporous',
  sensitizer: 'Sensitizer',
  buffer: 'Buffer',
}

/**
 * Map a thickness (nm) to a rendered bar height (px). We use a log scale
 * (typical device layers span 5 nm HTL → 3 mm glass; linear would render
 * the absorber as a single pixel) capped to [6, 80] px so every layer
 * is readable without one layer dwarfing the others.
 */
function thicknessToHeight(nm: number): number {
  if (!Number.isFinite(nm) || nm <= 0) return 10
  // log10(5)≈0.7 → log10(3_000_000)≈6.5 — clamp into [6, 80].
  const h = 6 + (Math.log10(nm) - 0.5) * 14
  return Math.max(6, Math.min(80, Math.round(h)))
}

/**
 * Pick the best-guess device structure for the given material. Pure
 * function — easy to unit-test in isolation if we ever want to.
 */
export function guessDeviceStructure(
  materialName: string,
  category: string,
  method?: string,
): DeviceStructure {
  const name = (materialName || '').trim()
  const lcName = name.toLowerCase()
  const lcMethod = (method || '').toLowerCase()
  const hints = `${lcName} ${lcMethod}`

  // ── Perovskite variants ───────────────────────────────────────────────
  if (category === 'perovskite') {
    // p-i-n (inverted) — explicit hint in name or method
    if (/\binvert|p-?i-?n|pin\b|pcbm|nio|pedot|ptsr|self.?assembled/i.test(hints)) {
      return {
        id: 'perovskite-pin',
        label: 'p-i-n inverted perovskite',
        code: 'p-i-n',
        layers: [
          { role: 'substrate', name: 'Glass', thicknessNm: 1_000_000, function: 'Mechanical support' },
          { role: 'tco', name: 'FTO / ITO', thicknessNm: 500, function: 'Transparent conductor' },
          { role: 'htl', name: 'NiOx (or PTAA)', thicknessNm: 30, function: 'Hole transport' },
          { role: 'absorber', name: name || 'Perovskite', thicknessNm: 500, function: 'Light absorber' },
          { role: 'etl', name: 'PCBM / C60', thicknessNm: 40, function: 'Electron transport' },
          { role: 'etl', name: 'BCP', thicknessNm: 8, function: 'Hole-blocking interlayer' },
          { role: 'electrode', name: 'Ag (or Au)', thicknessNm: 100, function: 'Back contact' },
        ],
        note: 'Inverted p-i-n stack — typical for high-stability, low-hysteresis devices.',
      }
    }
    // Mesoscopic n-i-p — explicit hint
    if (/\bmeso|mesopor|scaffold|ti.?alpha\b/i.test(hints)) {
      return {
        id: 'perovskite-meso',
        label: 'Mesoscopic n-i-p perovskite',
        code: 'meso',
        layers: [
          { role: 'substrate', name: 'Glass', thicknessNm: 1_000_000, function: 'Mechanical support' },
          { role: 'tco', name: 'FTO', thicknessNm: 500, function: 'Transparent conductor' },
          { role: 'etl', name: 'c-TiO2 (compact)', thicknessNm: 50, function: 'Hole-blocking layer' },
          { role: 'meso', name: 'm-TiO2 (mesoporous)', thicknessNm: 150, function: 'Scaffold + ETL' },
          { role: 'absorber', name: name || 'Perovskite', thicknessNm: 500, function: 'Light absorber (infiltrated)' },
          { role: 'htl', name: 'Spiro-OMeTAD', thicknessNm: 200, function: 'Hole transport' },
          { role: 'electrode', name: 'Au', thicknessNm: 80, function: 'Back contact' },
        ],
        note: 'Mesoscopic scaffold — the historical standard-bearer (≈15% → 25%+ PCE range).',
      }
    }
    // Default n-i-p planar (most common for MAPbI3 / FAPbI3 / CsPbI3…)
    return {
      id: 'perovskite-nip',
      label: 'n-i-p planar perovskite',
      code: 'n-i-p',
      layers: [
        { role: 'substrate', name: 'Glass', thicknessNm: 1_000_000, function: 'Mechanical support' },
        { role: 'tco', name: 'FTO', thicknessNm: 500, function: 'Transparent conductor' },
        { role: 'etl', name: 'TiO2 (compact)', thicknessNm: 50, function: 'Electron transport' },
        { role: 'absorber', name: name || 'Perovskite', thicknessNm: 500, function: 'Light absorber' },
        { role: 'htl', name: 'Spiro-OMeTAD', thicknessNm: 200, function: 'Hole transport' },
        { role: 'electrode', name: 'Au', thicknessNm: 80, function: 'Back contact' },
      ],
      note: 'Classic n-i-p planar stack — best-guess from the perovskite category.',
    }
  }

  // ── Chalcogenide variants ────────────────────────────────────────────
  if (category === 'chalcogenide') {
    if (/cigs|cigse|cu\(in|ci(?=gs)|se\b/i.test(hints) || /in.*ga.*se/i.test(name)) {
      return {
        id: 'cigs',
        label: 'CIGS thin-film',
        code: 'cigs',
        layers: [
          { role: 'substrate', name: 'Soda-lime glass', thicknessNm: 1_500_000, function: 'Na source + support' },
          { role: 'electrode', name: 'Mo', thicknessNm: 800, function: 'Back contact' },
          { role: 'meso', name: 'MoSe2 (interface)', thicknessNm: 20, function: 'Forms during Se overpressure' },
          { role: 'absorber', name: name || 'CIGS', thicknessNm: 2000, function: 'Light absorber (p-type)' },
          { role: 'buffer', name: 'CdS (CBD)', thicknessNm: 50, function: 'Heterojunction buffer' },
          { role: 'etl', name: 'i-ZnO', thicknessNm: 50, function: 'Intrinsic window' },
          { role: 'tco', name: 'AZO (Al:ZnO)', thicknessNm: 200, function: 'Front TCO' },
          { role: 'electrode', name: 'Ni-Al grid', thicknessNm: 3000, function: 'Front grid' },
        ],
        note: 'Substrate-config CIGS stack — light enters through the ZnO side.',
      }
    }
    if (/cdte|cds\b/i.test(hints)) {
      return {
        id: 'cdte',
        label: 'CdTe thin-film',
        code: 'cdte',
        layers: [
          { role: 'substrate', name: 'Glass', thicknessNm: 1_500_000, function: 'Mechanical support' },
          { role: 'tco', name: 'SnO2:F (FTO)', thicknessNm: 500, function: 'Front TCO' },
          { role: 'etl', name: 'CdS', thicknessNm: 100, function: 'n-type window' },
          { role: 'absorber', name: name || 'CdTe', thicknessNm: 4000, function: 'Light absorber (p-type)' },
          { role: 'buffer', name: 'ZnTe:Cu', thicknessNm: 50, function: 'Back-interface passivation' },
          { role: 'electrode', name: 'Au / C paste', thicknessNm: 200, function: 'Back contact' },
        ],
        note: 'Superstrate-config CdTe stack — light enters through the glass.',
      }
    }
    if (/czts|kesterite|cu2zn|sn.*s\b/i.test(hints)) {
      return {
        id: 'czts',
        label: 'CZTS / kesterite thin-film',
        code: 'cigs',
        layers: [
          { role: 'substrate', name: 'Soda-lime glass', thicknessNm: 1_500_000, function: 'Mechanical support' },
          { role: 'electrode', name: 'Mo', thicknessNm: 800, function: 'Back contact' },
          { role: 'absorber', name: name || 'CZTS', thicknessNm: 1500, function: 'Light absorber (p-type)' },
          { role: 'buffer', name: 'CdS (CBD)', thicknessNm: 50, function: 'Heterojunction buffer' },
          { role: 'etl', name: 'i-ZnO', thicknessNm: 50, function: 'Window layer' },
          { role: 'tco', name: 'AZO', thicknessNm: 200, function: 'Front TCO' },
          { role: 'electrode', name: 'Al grid', thicknessNm: 3000, function: 'Front grid' },
        ],
        note: 'Lead-free kesterite stack — analogous to CIGS but uses earth-abundant elements.',
      }
    }
    // generic chalcogenide → assume CdS/window + absorber + metal
    return {
      id: 'chalcogenide-generic',
      label: 'Chalcogenide thin-film',
      code: 'generic',
      layers: [
        { role: 'substrate', name: 'Glass', thicknessNm: 1_500_000, function: 'Mechanical support' },
        { role: 'tco', name: 'FTO / ITO', thicknessNm: 500, function: 'Transparent conductor' },
        { role: 'etl', name: 'CdS (or ZnS)', thicknessNm: 80, function: 'Window / buffer' },
        { role: 'absorber', name: name || 'Chalcogenide', thicknessNm: 2000, function: 'Light absorber' },
        { role: 'electrode', name: 'Au / Mo', thicknessNm: 200, function: 'Back contact' },
      ],
      note: 'Generic chalcogenide stack — set the material name (e.g. CdTe / CIGS) for a precise layout.',
    }
  }

  // ── Oxide / DSSC ─────────────────────────────────────────────────────
  if (category === 'oxide') {
    if (/dye|dssc|n719|rdye|cosens/i.test(hints)) {
      return {
        id: 'dssc',
        label: 'Dye-sensitized solar cell (DSSC)',
        code: 'dssc',
        layers: [
          { role: 'substrate', name: 'Glass', thicknessNm: 1_000_000, function: 'Mechanical support' },
          { role: 'tco', name: 'FTO', thicknessNm: 500, function: 'Transparent conductor' },
          { role: 'meso', name: 'TiO2 (mesoporous)', thicknessNm: 10_000, function: 'Electron transport scaffold' },
          { role: 'sensitizer', name: 'Dye (N719 / D35)', thicknessNm: 2, function: 'Monolayer sensitizer' },
          { role: 'meso', name: 'Electrolyte (I⁻/I₃⁻)', thicknessNm: 20_000, function: 'Redox mediator' },
          { role: 'electrode', name: 'Pt counter-electrode', thicknessNm: 5, function: 'Catalyst for I₃⁻ reduction' },
        ],
        note: 'DSSC stack — light is absorbed by a monolayer of dye anchored on TiO2.',
      }
    }
    // generic oxide photoanode (e.g. Fe2O3, BiVO4 for water splitting, or TiO2 PV)
    return {
      id: 'oxide-generic',
      label: 'Oxide photoanode',
      code: 'generic',
      layers: [
        { role: 'substrate', name: 'Glass', thicknessNm: 1_000_000, function: 'Mechanical support' },
        { role: 'tco', name: 'FTO', thicknessNm: 500, function: 'Transparent conductor' },
        { role: 'etl', name: 'TiO2 (compact)', thicknessNm: 50, function: 'Hole-blocking' },
        { role: 'absorber', name: name || 'Oxide', thicknessNm: 500, function: 'Light absorber' },
        { role: 'htl', name: 'Spiro-OMeTAD (or HTL)', thicknessNm: 200, function: 'Hole transport' },
        { role: 'electrode', name: 'Au', thicknessNm: 80, function: 'Back contact' },
      ],
      note: 'Generic oxide stack — actual architecture depends strongly on the oxide (BiVO4 / Fe2O3 / TiO2…).',
    }
  }

  // ── Other / unknown ───────────────────────────────────────────────────
  return {
    id: 'generic',
    label: 'Generic photovoltaic stack',
    code: 'generic',
    layers: [
      { role: 'substrate', name: 'Glass', thicknessNm: 1_000_000, function: 'Mechanical support' },
      { role: 'tco', name: 'TCO (FTO / ITO)', thicknessNm: 500, function: 'Transparent conductor' },
      { role: 'etl', name: 'ETL', thicknessNm: 50, function: 'Electron transport' },
      { role: 'absorber', name: name || 'Absorber', thicknessNm: 500, function: 'Light absorber' },
      { role: 'htl', name: 'HTL', thicknessNm: 200, function: 'Hole transport' },
      { role: 'electrode', name: 'Metal', thicknessNm: 100, function: 'Back contact' },
    ],
    note: 'No structure guess available — showing a generic photovoltaic stack.',
  }
}

/** Inline SVG-rendered thickness scale (purely decorative — shows 1 nm to 1 mm). */
function ThicknessScale() {
  return (
    <div className="flex items-center gap-2 text-[9px] text-slate-400">
      <span>1 nm</span>
      <div className="h-px flex-1 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700" />
      <span>1 mm</span>
    </div>
  )
}

/**
 * Format a thickness value (nm) as a human-readable string. Sub-micron
 * values keep their unit; µm / mm values switch to the more readable unit.
 */
function formatThickness(nm: number): string {
  if (nm >= 1_000_000) return `${(nm / 1_000_000).toFixed(2)} mm`
  if (nm >= 1000) return `${(nm / 1000).toFixed(2)} µm`
  if (nm >= 1) return `${Math.round(nm)} nm`
  return `${nm.toFixed(1)} nm`
}

/**
 * Compact device-structure card — the visual itself, without any chrome.
 * Reusable: the dialog below wraps it, but a future caller could embed it
 * in the dashboard or compare-dialog directly.
 */
export function DeviceStructureDiagram({
  structure,
}: {
  structure: DeviceStructure
  /** Kept for backwards compatibility — i18n is read directly via useI18n(). */
  locale?: 'en' | 'zh'
}) {
  const { t } = useI18n()
  return (
    <div className="space-y-3">
      {/* Header: code badge + label */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide font-mono"
          >
            {structure.code}
          </Badge>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {structure.label}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 tabular-nums">
          {t('device.layers', { count: structure.layers.length })}
        </span>
      </div>

      {/* Stack itself: rendered bottom (substrate) → top (electrode) so the
          light-entering side is at the bottom of the visual (matches real
          device schematics in the literature where light comes from below). */}
      <div className="flex gap-3">
        {/* Layer bars */}
        <div className="flex-1 space-y-px">
          {structure.layers.map((layer, i) => {
            const c = ROLE_COLORS[layer.role]
            const h = thicknessToHeight(layer.thicknessNm)
            return (
              <div
                key={`${structure.id}-${i}`}
                className={`group relative ${c.bg} ${c.border} border-x transition-colors hover:brightness-105`}
                style={{ height: `${h}px` }}
                title={`${layer.name} · ${formatThickness(layer.thicknessNm)}`}
              >
                {/* Label inside the bar — left aligned, vertically centered.
                    Capped to one line so thin layers stay readable; the full
                    text shows in the side panel on hover. */}
                <div
                  className={`absolute inset-0 flex items-center justify-between px-3 ${c.text} overflow-hidden`}
                >
                  <span className="font-medium text-xs truncate">
                    {layer.name}
                  </span>
                  <span className="text-[10px] tabular-nums opacity-80 ml-2 shrink-0">
                    {formatThickness(layer.thicknessNm)}
                  </span>
                </div>
              </div>
            )
          })}
          {/* Light direction arrow (decorative — light enters through substrate/glass) */}
          <div className="flex justify-center pt-1.5">
            <div className="flex flex-col items-center text-[9px] text-amber-500 dark:text-amber-400">
              <span>☀ {t('device.incidentLight')}</span>
              <span aria-hidden className="text-base leading-none">↑</span>
            </div>
          </div>
        </div>

        {/* Side panel: layer-by-layer breakdown with functions */}
        <div className="hidden sm:block w-48 shrink-0">
          <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              {t('device.layerBreakdown')}
            </div>
            <ol className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto matlit-scrollbar">
              {structure.layers.map((layer, i) => {
                const c = ROLE_COLORS[layer.role]
                return (
                  <li key={i} className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block w-2 h-2 rounded-sm ${c.bg} border ${c.border} shrink-0`}
                        aria-hidden
                      />
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                        {layer.name}
                      </span>
                      <span className="ml-auto text-[9px] text-slate-400 tabular-nums">
                        {formatThickness(layer.thicknessNm)}
                      </span>
                    </div>
                    {layer.function && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 pl-3.5">
                        {layer.function}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>

      {/* Thickness scale legend */}
      <ThicknessScale />

      {/* Optional caveat note */}
      {structure.note && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
          {structure.note}
        </div>
      )}
    </div>
  )
}

/** Color legend for the layer roles (renders below the diagram). */
export function DeviceStructureLegend({ locale: _locale = 'en' }: { locale?: 'en' | 'zh' }) {
  const roles: DeviceLayer['role'][] = [
    'substrate',
    'tco',
    'etl',
    'absorber',
    'htl',
    'electrode',
    'meso',
    'buffer',
    'sensitizer',
  ]
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
      {roles.map((r) => {
        const c = ROLE_COLORS[r]
        return (
          <span key={r} className="inline-flex items-center gap-1">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-sm ${c.bg} border ${c.border}`}
              aria-hidden
            />
            <span className="text-slate-500 dark:text-slate-400">
              {ROLE_LABEL[r]}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * Top-level convenience component — given the material info, picks the
 * best-guess structure and renders the diagram + legend + caveat note.
 * This is what the materials-tab dialog imports directly.
 */
export function DeviceStructureView({
  materialName,
  category,
  method,
  locale: _locale = 'en',
  synthesisMethodCaption,
}: {
  materialName: string
  category: string
  method?: string
  /** Kept for backwards compatibility — i18n is read directly via useI18n(). */
  locale?: 'en' | 'zh'
  /** Optional caption shown under the structure (e.g. classification.synthesisMethod). */
  synthesisMethodCaption?: string
}) {
  const { t } = useI18n()
  const structure = guessDeviceStructure(materialName, category, method)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Layers className="w-3.5 h-3.5 text-teal-500" />
        <span>
          {t('device.caption')}
        </span>
      </div>

      <DeviceStructureDiagram structure={structure} />

      <DeviceStructureLegend />

      {/* If the material has a recorded synthesis method, surface it as a
          caption so the user can correlate the stack with how the absorber
          was deposited. */}
      {synthesisMethodCaption && (
        <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
            {t('device.synthesisMethod')}
          </div>
          <div className="text-slate-700 dark:text-slate-200 font-medium">
            {synthesisMethodCaption}
          </div>
        </div>
      )}
    </div>
  )
}
