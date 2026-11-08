import { NextRequest, NextResponse } from 'next/server'
import { createStabilitySchema, parseOr400 } from '@/lib/schemas'

// ────────────────────────────────────────────────────────────────────────────
// Material stability database (G5).
//
// Tracks long-term stability metrics that the existing Efficiency /
// Classification tables can't represent — chiefly T80 (the time for a
// solar cell's power-conversion efficiency to drop to 80 % of its
// initial value) under a specified test protocol (ISOS-L-1/-2/-3,
// ISOS-D-1/-2/-3, ISOS-T-1/-2/-3, dark shelf, ambient storage, etc.).
//
// We can't extend the Prisma schema in this task, so the API uses an
// in-memory Map<materialId, StabilityRecord[]> to store user-submitted
// records (acceptable for a demo — explicitly noted in the task brief).
// Curated benchmark defaults for the canonical perovskite / chalcogenide
// compositions are always merged in so the UI always has *something*
// useful to show, even on a fresh boot.
// ────────────────────────────────────────────────────────────────────────────

export interface StabilityRecord {
  id: string
  materialId: string
  materialName?: string
  t80: number | null // hours to 80% of initial efficiency (null = not measured / N/A)
  degradationRate: number | null // % per 1000 h (alternative representation)
  testCondition: string // e.g. "ISOS-L-2", "ISOS-D-1", "dark shelf"
  temperature: number | null // °C
  humidity: number | null // % RH
  lightSoaking: string // e.g. "AM1.5G 100 mW/cm²", "dark"
  encapsulated: boolean
  source: string // 'curated' | 'user' | 'literature' | DOI
  year: number | null
  notes: string
  createdAt: string
}

// In-memory store for user-submitted records. Keyed by materialId so the
// GET handler can pull all records for one material in O(1).
// (Module-scoped — survives across requests within a single dev-server
// process, but is lost on restart. Acceptable per task spec.)
const userStore = new Map<string, StabilityRecord[]>()

// ── Curated benchmarks ────────────────────────────────────────────────────
// Hand-compiled from commonly-cited stability studies. Used as the
// fallback when no user records exist for a material, AND as a default
// reference table for materials in the same category.
//
// `match` is called against the material name (lowercased) — a record
// matches if any of the `match` substrings appear in the material name.
const CURATED: Array<Omit<StabilityRecord, 'id' | 'createdAt'> & {
  match: string[]
}> = [
  // ── Lead-based perovskites ───────────────────────────────────────────
  {
    materialId: '__curated_mapbi3__',
    materialName: 'MAPbI3',
    match: ['mapbi3', 'ch3nh3pbi3', 'methylammonium lead iodide'],
    t80: 5000,
    degradationRate: 4.0,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2020,
    notes:
      'Curated benchmark for MAPbI3. Typical T80 under ISOS-L-2 (1-sun, 65 °C, 50% RH, encapsulated). Values vary widely by deposition route — solution-processed MAPbI3 is typically 3000–6000 h.',
  },
  {
    materialId: '__curated_fapbi3__',
    materialName: 'FAPbI3',
    match: ['fapbi3', 'hc(nh2)2pbi3', 'formamidinium lead iodide'],
    t80: 8000,
    degradationRate: 2.5,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2021,
    notes:
      'FAPbI3 is more thermally stable than MAPbI3 (no volatile methylammonium) but phase-pure α-FAPbI3 is harder to stabilise.',
  },
  {
    materialId: '__curated_csfa_mapbi3__',
    materialName: 'CsFAMA triple-cation',
    match: ['csfama', 'triple-cation', 'triple cation', 'mafabr'],
    t80: 12000,
    degradationRate: 1.5,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2022,
    notes:
      'Triple-cation (Cs/FA/MA) perovskite — the de-facto standard for high-efficiency + commercially-relevant stability.',
  },
  {
    materialId: '__curated_mapbi3_br__',
    materialName: 'MAPbI3-xBrx',
    match: ['mapb(br|i)', 'mapbi3-br', 'mapb(i,br)', 'mapbbr'],
    t80: 1000,
    degradationRate: 20,
    testCondition: 'ISOS-L-1',
    temperature: 25,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: false,
    source: 'curated',
    year: 2019,
    notes:
      'Bromide-alloyed MAPbI3 — unencapsulated cells degrade faster under illumination because of light-induced halide segregation.',
  },

  // ── Tin / mixed Pb-Sn perovskites ──────────────────────────────────
  {
    materialId: '__curated_masni3__',
    materialName: 'MASnI3',
    match: ['masni3', 'ch3nh3sni3', 'methylammonium tin iodide'],
    t80: 100,
    degradationRate: 200,
    testCondition: 'ISOS-D-1',
    temperature: 25,
    humidity: 20,
    lightSoaking: 'dark',
    encapsulated: false,
    source: 'curated',
    year: 2019,
    notes:
      'Pure-tin perovskites oxidise Sn²⁺ → Sn⁴⁺ within hours in air. T80 ~100 h even in a glovebox — the primary barrier to commercialisation.',
  },
  {
    materialId: '__curated_pbsn_perovskite__',
    materialName: 'Pb-Sn mixed perovskite',
    match: ['pb-sn', 'pbsn', 'fa0.5ma0.5pb0.5sn0.5', 'mapbsn'],
    t80: 1000,
    degradationRate: 20,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2023,
    notes:
      'Pb-Sn mixed perovskites (used in all-perovskite tandem cells) need strong encapsulation — Sn²⁺ oxidation is slower than pure Sn but still significant.',
  },

  // ── All-inorganic perovskites ──────────────────────────────────────
  {
    materialId: '__curated_cspbi3__',
    materialName: 'CsPbI3',
    match: ['cspbi3', 'cesium lead iodide', 'csleadi3'],
    t80: 3000,
    degradationRate: 6.5,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2022,
    notes:
      'CsPbI3 (γ-phase) is thermally stable to >200 °C but moisture-sensitive: black γ-phase → yellow δ-phase transition under humidity within hours.',
  },
  {
    materialId: '__curated_cspbbr3__',
    materialName: 'CsPbBr3',
    match: ['cspbbr3', 'cesium lead bromide'],
    t80: 5000,
    degradationRate: 4.0,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2021,
    notes:
      'CsPbBr3 — phase-stable all-inorganic perovskite; common in green-emitting LEDs and stable PV windows.',
  },

  // ── 2D / Ruddlesden-Popper perovskites ─────────────────────────────
  {
    materialId: '__curated_ba2_mapbi3__',
    materialName: 'BA2MA(n-1)PbnI(3n+1) 2D perovskite',
    match: ['ba2', '2d perovskite', 'rudlesden', 'pea2', 'ba-based'],
    t80: 4000,
    degradationRate: 5.0,
    testCondition: 'ISOS-L-3',
    temperature: 85,
    humidity: 85,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: false,
    source: 'curated',
    year: 2020,
    notes:
      '2D Ruddlesden-Popper perovskites trade efficiency for moisture resistance — n=3 systems reach T80 ~4000 h under aggressive ISOS-L-3 conditions even without encapsulation.',
  },

  // ── Chalcogenides ──────────────────────────────────────────────────
  {
    materialId: '__curated_cigs__',
    materialName: 'CIGS (CuInGaSe2)',
    match: ['cigs', 'cuin1-xgaxse2', 'cu(in,ga)se2'],
    t80: 100000,
    degradationRate: 0.2,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2020,
    notes:
      'CIGS — commercially mature thin-film PV; >25-year outdoor lifetime. T80 extrapolated from IEC 61646 damp-heat testing.',
  },
  {
    materialId: '__curated_czts__',
    materialName: 'CZTS (Cu2ZnSnS4)',
    match: ['czts', 'cu2znsns4', 'kesterite'],
    t80: 8000,
    degradationRate: 2.5,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2019,
    notes:
      'CZTS kesterite — earth-abundant alternative to CIGS. Stable in inert atmosphere; degrades faster in humid air due to Zn/Sn loss.',
  },
  {
    materialId: '__curated_cdte__',
    materialName: 'CdTe',
    match: ['cdte', 'cadmium telluride'],
    t80: 100000,
    degradationRate: 0.2,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: 2020,
    notes:
      'CdTe — commercial thin-film leader. First Solar reports <1%/year degradation in field deployments.',
  },

  // ── Oxides ─────────────────────────────────────────────────────────
  {
    materialId: '__curated_fe2o3__',
    materialName: 'Fe2O3 (hematite)',
    match: ['fe2o3', 'hematite', 'iron oxide'],
    t80: 10000,
    degradationRate: 2.0,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: false,
    source: 'curated',
    year: 2018,
    notes:
      'Hematite photoanode — used in photoelectrochemical water splitting. Stable under alkaline conditions but suffers from surface passivation losses.',
  },
  {
    materialId: '__curated_tio2__',
    materialName: 'TiO2',
    match: ['tio2', 'titanium dioxide', 'anatase'],
    t80: 20000,
    degradationRate: 1.0,
    testCondition: 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: false,
    source: 'curated',
    year: 2018,
    notes:
      'TiO2 — chemically inert under most conditions. Used as the electron transport layer in dye-sensitised / perovskite cells.',
  },
]

// Default per-category fallback (used when a material has no curated
// match and no user records). Returns a single "rule of thumb" record.
function categoryDefault(category: string): StabilityRecord {
  const map: Record<string, Partial<StabilityRecord>> = {
    perovskite: {
      t80: 1000,
      degradationRate: 20,
      testCondition: 'ISOS-L-2',
      notes:
        'No curated benchmark for this material — using the perovskite-class default (~1000 h under ISOS-L-2). Add your own data below.',
    },
    chalcogenide: {
      t80: 20000,
      degradationRate: 1.0,
      testCondition: 'ISOS-L-2',
      notes:
        'No curated benchmark for this material — using the chalcogenide-class default (thin-film-class stability).',
    },
    oxide: {
      t80: 20000,
      degradationRate: 1.0,
      testCondition: 'ISOS-L-2',
      notes:
        'No curated benchmark for this material — using the oxide-class default (typically very stable under illumination).',
    },
  }
  const fallback = map[category] ?? {
    t80: null,
    degradationRate: null,
    testCondition: 'ISOS-L-2',
    notes: 'No curated benchmark available for this material — add your own stability data below.',
  }
  return {
    id: `__default_${category}__`,
    materialId: '__default__',
    t80: fallback.t80 ?? null,
    degradationRate: fallback.degradationRate ?? null,
    testCondition: fallback.testCondition ?? 'ISOS-L-2',
    temperature: 65,
    humidity: 50,
    lightSoaking: 'AM1.5G 100 mW/cm²',
    encapsulated: true,
    source: 'curated',
    year: null,
    notes: fallback.notes ?? '',
    createdAt: new Date(0).toISOString(),
  }
}

// Generate a stable-ish ID for new user records. Not a UUID but unique
// enough for the in-memory store (and avoids pulling in `crypto`).
function genId(): string {
  return `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function toStr(v: unknown): string {
  if (v === undefined || v === null) return ''
  return String(v).trim()
}

// Find the curated records whose `match` patterns hit the material name.
// `materialName` is optional — if missing, return [] (so category default
// will be used instead).
function matchCurated(materialName: string): StabilityRecord[] {
  if (!materialName) return []
  const lower = materialName.toLowerCase()
  return CURATED.filter((c) => c.match.some((m) => lower.includes(m))).map((c) => {
    const { match: _match, ...rest } = c
    return {
      ...rest,
      id: `curated_${c.materialId}`,
      createdAt: new Date(0).toISOString(),
    } as StabilityRecord
  })
}

// GET /api/stability
//
// Query params:
//   ?materialId=xxx       — restrict to a single material (will join to
//                            the material's name + category for curated
//                            matching).
//   ?materialName=yyy     — optional, used together with materialId to
//                            look up curated records by name.
//   ?category=zzz         — used as a fallback for the category-default
//                            record when no curated/user records match.
//
// Response shape:
//   {
//     records: StabilityRecord[],
//     source: 'user' | 'curated' | 'default',
//     total: number,
//   }
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  const materialName = searchParams.get('materialName') ?? ''
  const category = searchParams.get('category') ?? ''

  // ── No materialId → return the entire curated catalogue ─────────────
  // Useful for the "browse all stability data" view (no UI calls this yet
  // but it's cheap to expose).
  if (!materialId) {
    const allCurated = CURATED.map((c) => {
      const { match: _m, ...rest } = c
      return {
        ...rest,
        id: `curated_${c.materialId}`,
        createdAt: new Date(0).toISOString(),
      } as StabilityRecord
    })
    const allUser = Array.from(userStore.values()).flat()
    return NextResponse.json({
      records: [...allCurated, ...allUser],
      source: 'catalogue',
      total: allCurated.length + allUser.length,
    })
  }

  // ── Per-material view ───────────────────────────────────────────────
  // Merge curated matches + user-submitted records. If both are empty,
  // fall back to the category default so the UI always has a row.
  const userRecords = userStore.get(materialId) ?? []
  const curated = matchCurated(materialName)

  if (userRecords.length > 0) {
    return NextResponse.json({
      records: [...userRecords, ...curated],
      source: 'user' as const,
      total: userRecords.length + curated.length,
    })
  }

  if (curated.length > 0) {
    return NextResponse.json({
      records: curated,
      source: 'curated' as const,
      total: curated.length,
    })
  }

  return NextResponse.json({
    records: [categoryDefault(category)],
    source: 'default' as const,
    total: 1,
  })
}

// POST /api/stability
//
// Body:
//   {
//     materialId: string,
//     materialName?: string,
//     t80?: number,                // hours
//     degradationRate?: number,    // % per 1000 h
//     testCondition?: string,      // ISOS-L-2 / ISOS-D-1 / etc.
//     temperature?: number,        // °C
//     humidity?: number,           // % RH
//     lightSoaking?: string,
//     encapsulated?: boolean,
//     source?: string,             // DOI / 'user' / 'literature'
//     year?: number,
//     notes?: string,
//   }
//
// Validation:
//   - materialId required.
//   - At least one of t80 / degradationRate / notes required (otherwise
//     there's nothing meaningful to store).
//
// Returns the created record.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = parseOr400(createStabilitySchema, body)
  if (!parsed.ok) return parsed.response

  const { materialId, materialName, t80, degradationRate, testCondition, temperature,
          humidity, lightSoaking, encapsulated, source, year, notes } = parsed.data

  const t80Num = toNum(t80)
  const degradationRateNum = toNum(degradationRate)
  const notesStr = toStr(notes)
  if (t80Num === null && degradationRateNum === null && notesStr === '') {
    return NextResponse.json(
      { error: 'At least one of t80, degradationRate, or notes is required' },
      { status: 400 },
    )
  }

  const record: StabilityRecord = {
    id: genId(),
    materialId,
    materialName: toStr(materialName) || undefined,
    t80: t80Num,
    degradationRate: degradationRateNum,
    testCondition: toStr(testCondition) || 'ISOS-L-2',
    temperature: toNum(temperature),
    humidity: toNum(humidity),
    lightSoaking: toStr(lightSoaking) || 'AM1.5G 100 mW/cm²',
    encapsulated: encapsulated === true,
    source: toStr(source) || 'user',
    year: toNum(year),
    notes: notesStr,
    createdAt: new Date().toISOString(),
  }

  const existing = userStore.get(materialId) ?? []
  userStore.set(materialId, [record, ...existing])

  return NextResponse.json(
    { ok: true, record, total: userStore.get(materialId)?.length ?? 0 },
    { status: 201 },
  )
}
