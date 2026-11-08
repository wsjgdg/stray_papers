import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/cache'
import { createExperimentSchema, parseOr400 } from '@/lib/schemas'

// ────────────────────────────────────────────────────────────────────────────
// Unified manual-experiment data entry API (G4).
//
// Lets a user record their own lab data directly (efficiency + bandgap +
// synthesis conditions), bypassing the AI-extraction pipeline. The body
// mirrors the shape of an extraction result so the same UI affordances
// (materials-tab "Add experiment" dialog) can drive both flows.
//
// Post-condition:
//   - Efficiency record created (if `efficiency` provided): source='Manual',
//     sourceType='database'. Voc/Jsc/FF are encoded into `notes` because the
//     Efficiency table has no dedicated columns for them (schema is shared
//     with NREL / literature records).
//   - Classification upserted (if bandgap / method / conditions provided):
//     synthesized='yes', status='extracted'. A "manual entry" Paper record
//     is reused per material (source='manual') so the classification has a
//     valid paperId (which is @unique on Classification).
//   - Both writes are independent — a user can record just an efficiency
//     number, just a bandgap, or both in a single submission.
// ────────────────────────────────────────────────────────────────────────────

// Tag used to identify manual-entry papers and efficiency records. Stored
// as the Efficiency.source string and used as the Paper.title sentinel for
// manual-entry papers so they can be located later.
const MANUAL_TAG = 'Manual'
const MANUAL_PAPER_TITLE = '__manual_entry__'

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function toStr(v: unknown): string {
  if (v === undefined || v === null) return ''
  return String(v).trim()
}

// Find-or-create a "manual entry" Paper for the given material, then upsert
// the Classification on that paper. Extracted as a helper so the main POST
// handler can keep its variable types narrow (no `let x: SomeType | null`).
async function upsertManualClassification(opts: {
  materialId: string
  bandgap: number | null
  method: string
  conditions: string
  doi: string
  year: number | null
}): Promise<{ paper: { id: string; doi: string; year: number | null }; classification: unknown }> {
  const { materialId, bandgap, method, conditions, doi, year } = opts

  const existingPaper = await db.paper.findFirst({
    where: { materialId, title: MANUAL_PAPER_TITLE, source: 'manual' },
  })
  const paper = existingPaper
    ? await db.paper.update({
        where: { id: existingPaper.id },
        data: {
          doi: doi || existingPaper.doi,
          year: typeof year === 'number' ? year : existingPaper.year,
        },
      })
    : await db.paper.create({
        data: {
          materialId,
          title: MANUAL_PAPER_TITLE,
          source: 'manual',
          doi,
          year: typeof year === 'number' ? year : null,
          abstract:
            'Manual experiment entry recorded by the user via the materials-tab "Add experiment" dialog.',
        },
      })

  const bgValue = bandgap !== null ? bandgap.toFixed(3) : ''
  // If a Classification already exists for this paper, update it; otherwise
  // create one. (paperId is @unique on Classification.)
  const classification = await db.classification.upsert({
    where: { paperId: paper.id },
    update: {
      synthesized: 'yes',
      hasBandgap: !!bgValue,
      hasMethod: method !== '',
      bandgapValue: bgValue,
      synthesisMethod: method,
      conditions,
      // Persist a marker so downstream code can tell this classification
      // was user-entered, not LLM-extracted. The schema has no `source`
      // column on Classification, so we use the `evidence` field.
      evidence: '[manual entry]',
      status: 'extracted',
      confidence: 1.0,
      updatedAt: new Date(),
    },
    create: {
      paperId: paper.id,
      materialId,
      synthesized: 'yes',
      hasBandgap: !!bgValue,
      hasMethod: method !== '',
      bandgapValue: bgValue,
      synthesisMethod: method,
      conditions,
      evidence: '[manual entry]',
      confidence: 1.0,
      status: 'extracted',
      model: 'manual',
    },
  })

  return { paper, classification }
}

// POST /api/experiments — create / upsert a manual experiment record.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = parseOr400(createExperimentSchema, body)
  if (!parsed.ok) return parsed.response

  const {
    materialId,
    efficiency,
    bandgap,
    voc,
    jsc,
    ff,
    method,
    conditions,
    testConditions,
    doi,
    year,
    notes,
    certified = false,
  } = parsed.data

  // ── Cross-field validation ───────────────────────────────────────────
  // Zod guarantees the shape; we still need the "at least one measurable"
  // rule because it depends on the coerced numeric value of `efficiency`.
  const effNum = toNum(efficiency)
  const bgNum = toNum(bandgap)
  const methodStr = toStr(method)
  const conditionsStr = toStr(conditions)
  const hasEff = effNum !== null
  const hasBg = bgNum !== null || methodStr !== '' || conditionsStr !== ''
  if (!hasEff && !hasBg) {
    return NextResponse.json(
      { error: 'At least one of efficiency or bandgap is required' },
      { status: 400 },
    )
  }

  // Verify the material exists — prevents 500 from a foreign-key violation
  // and gives a clean 400 instead.
  const material = await db.material.findUnique({ where: { id: materialId } })
  if (!material) {
    return NextResponse.json(
      { error: `Material not found: ${materialId}` },
      { status: 400 },
    )
  }

  // ── Efficiency insert (if efficiency provided) ────────────────────────
  // The Efficiency table allows multiple rows per material (history of
  // records over time), so we always insert a new row here. Voc/Jsc/FF
  // don't have dedicated columns — we encode them into `notes` so the
  // values are preserved and visible in the efficiency table UI.
  let efficiencyRecord: Awaited<ReturnType<typeof db.efficiency.create>> | null = null
  if (hasEff && effNum !== null) {
    const vocStr = toStr(voc)
    const jscStr = toStr(jsc)
    const ffStr = toStr(ff)
    const testParts: string[] = []
    if (vocStr) testParts.push(`Voc=${vocStr}V`)
    if (jscStr) testParts.push(`Jsc=${jscStr}mA/cm²`)
    if (ffStr) testParts.push(`FF=${ffStr}`)
    const testSummary = testParts.join('; ')
    const userNotes = toStr(notes)
    const combinedNotes = [userNotes, testSummary].filter(Boolean).join('\n')

    efficiencyRecord = await db.efficiency.create({
      data: {
        materialId,
        efficiencyValue: effNum,
        certified: !!certified,
        source: MANUAL_TAG,
        sourceType: 'database',
        testConditions: toStr(testConditions),
        doi: toStr(doi),
        year: typeof year === 'number' ? year : null,
        notes: combinedNotes,
      },
    })
  }

  // ── Classification upsert (if bandgap / method / conditions provided) ──
  // Delegated to a helper so the variable types stay narrow.
  let classificationResult: { paper: { id: string; doi: string; year: number | null }; classification: unknown } | null = null
  if (hasBg) {
    classificationResult = await upsertManualClassification({
      materialId,
      bandgap: bgNum,
      method: methodStr,
      conditions: conditionsStr,
      doi: toStr(doi),
      year: typeof year === 'number' ? year : null,
    })
  }

  // Invalidate affected caches so the dashboard / materials list refresh.
  invalidate('stats:')
  invalidate('materials:')
  invalidate('coverage')
  invalidate('efficiency:')
  invalidate('efficiency-trend')

  return NextResponse.json(
    {
      ok: true,
      efficiency: efficiencyRecord,
      classification: classificationResult?.classification ?? null,
      paper: classificationResult?.paper ?? null,
      material: { id: material.id, name: material.name },
    },
    { status: 201 },
  )
}

// GET /api/experiments — list manual experiment records.
// Query params:
//   ?materialId=xxx  — restrict to a single material
//   ?reviewer=xxx    — (forward-compat) filter by reviewer; currently
//                       manual experiments are not reviewer-scoped, so
//                       this is accepted but ignored.
//
// Returns manual entries from two sources, merged into a single response:
//   1. Efficiency rows whose source = 'Manual' (the lab-measured PCE)
//   2. Classification rows whose evidence = '[manual entry]' (bandgap /
//      method / conditions), joined to their material for display.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  // `reviewer` is accepted for forward-compat (Verification tab) but not
  // currently applied — Efficiency has no reviewer column.
  // const reviewer = searchParams.get('reviewer')

  const effWhere: Record<string, unknown> = { source: MANUAL_TAG }
  if (materialId) effWhere.materialId = materialId
  const efficiencies = await db.efficiency.findMany({
    where: effWhere,
    orderBy: { createdAt: 'desc' },
    include: { material: { select: { id: true, name: true } } },
  })

  // Find manual-entry papers for this material (or all), then load their
  // classifications.
  const paperWhere: Record<string, unknown> = {
    source: 'manual',
    title: MANUAL_PAPER_TITLE,
  }
  if (materialId) paperWhere.materialId = materialId
  const papers = await db.paper.findMany({
    where: paperWhere,
    select: { id: true },
  })
  const paperIds = papers.map((p) => p.id)
  const classifications = paperIds.length
    ? await db.classification.findMany({
        where: { paperId: { in: paperIds } },
        include: {
          material: { select: { id: true, name: true } },
          paper: { select: { id: true, doi: true, year: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    : []

  return NextResponse.json({
    efficiencies,
    classifications,
    total: efficiencies.length + classifications.length,
  })
}
