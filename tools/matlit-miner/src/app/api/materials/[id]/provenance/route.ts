import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/materials/[id]/provenance
//
// Returns the historical provenance chain for a material's bandgap and
// efficiency values: every Classification (linked to a Paper) that reported
// either field, plus every Efficiency-table record (NREL / Perovskite
// Database / literature), all sorted by year ascending so the UI can render
// a vertical timeline showing how the value was reported over time.
//
// Example use case (per task spec G7):
//   "MAPbI3 bandgap was first reported as 1.55 eV by Smith 2014, confirmed
//    by Jones 2019 at 1.56 eV" — the UI walks the entries in order and
//    highlights the first + latest entry, plus a per-paper evidence quote.
//
// Response shape:
//   {
//     materialId: string,
//     materialName: string,
//     fields: {
//       bandgap:    ProvenanceEntry[],
//       efficiency: ProvenanceEntry[]
//     }
//   }
//
// ProvenanceEntry:
//   {
//     value: string,         // raw value as reported ("1.55" or "1.55 eV" or "22.30")
//     paperId: string,       // '' for Efficiency-table rows (no paper FK)
//     paperTitle: string,    // '' for Efficiency-table rows (source is used instead)
//     paperYear: number | null,
//     doi: string,
//     evidence: string,      // the supporting quote (Classification.evidence)
//     source: 'classification' | 'database'
//   }
//
// Status codes:
//   200 — material found (with or without provenance entries)
//   404 — material not found

export interface ProvenanceEntry {
  value: string
  paperId: string
  paperTitle: string
  paperYear: number | null
  doi: string
  evidence: string
  source: 'classification' | 'database'
}

interface ProvenanceResponse {
  materialId: string
  materialName: string
  fields: {
    bandgap: ProvenanceEntry[]
    efficiency: ProvenanceEntry[]
  }
}

/** Year-ascending sort; null/undefined years pushed to the end of the list. */
function byYearAsc(a: ProvenanceEntry, b: ProvenanceEntry): number {
  if (a.paperYear == null && b.paperYear == null) return 0
  if (a.paperYear == null) return 1
  if (b.paperYear == null) return -1
  return a.paperYear - b.paperYear
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Confirm the material exists. Mirrors the parity check in /similar route.
  const material = await db.material.findUnique({
    where: { id },
    select: { id: true, name: true },
  })
  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  // 1. Classification rows that report a bandgap or efficiency, joined to
  //    the paper for title / year / doi. The `evidence` field on the
  //    classification carries the supporting quote from the abstract.
  const classifications = await db.classification.findMany({
    where: {
      materialId: id,
      OR: [{ bandgapValue: { not: '' } }, { efficiencyValue: { not: '' } }],
    },
    select: {
      bandgapValue: true,
      efficiencyValue: true,
      evidence: true,
      paper: {
        select: { id: true, title: true, year: true, doi: true },
      },
    },
  })

  const bandgap: ProvenanceEntry[] = []
  const efficiency: ProvenanceEntry[] = []
  for (const c of classifications) {
    if (c.bandgapValue) {
      bandgap.push({
        value: c.bandgapValue,
        paperId: c.paper?.id ?? '',
        paperTitle: c.paper?.title ?? '',
        paperYear: c.paper?.year ?? null,
        doi: c.paper?.doi ?? '',
        evidence: c.evidence ?? '',
        source: 'classification',
      })
    }
    if (c.efficiencyValue) {
      efficiency.push({
        value: c.efficiencyValue,
        paperId: c.paper?.id ?? '',
        paperTitle: c.paper?.title ?? '',
        paperYear: c.paper?.year ?? null,
        doi: c.paper?.doi ?? '',
        evidence: c.evidence ?? '',
        source: 'classification',
      })
    }
  }

  // 2. Efficiency-table rows (NREL / Perovskite Database / literature).
  //    These have their own doi + year but no paper FK, so paperId and
  //    paperTitle are blank — the UI substitutes `source` for paperTitle
  //    to label the row in the timeline.
  const efficiencies = await db.efficiency.findMany({
    where: { materialId: id, efficiencyValue: { gt: 0 } },
    select: {
      efficiencyValue: true,
      doi: true,
      year: true,
      source: true,
      certified: true,
    },
  })
  for (const e of efficiencies) {
    efficiency.push({
      value: e.efficiencyValue.toFixed(2),
      paperId: '',
      paperTitle: e.source || '',
      paperYear: e.year ?? null,
      doi: e.doi ?? '',
      evidence: e.certified ? 'Certified measurement' : '',
      source: 'database',
    })
  }

  bandgap.sort(byYearAsc)
  efficiency.sort(byYearAsc)

  const body: ProvenanceResponse = {
    materialId: id,
    materialName: material.name,
    fields: { bandgap, efficiency },
  }
  return NextResponse.json(body)
}
