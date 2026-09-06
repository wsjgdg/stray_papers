import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'

// GET /api/knowledge-graph
//
// Returns a material-centric knowledge graph: one node per material and
// weighted edges that connect materials sharing characteristics:
//
//   - Same category                                          (weight 1)
//   - Share ≥2 chemical elements parsed from the formula     (weight 2)
//   - Similar bandgap (within 0.3 eV)                        (weight 1.5)
//   - Same synthesis method                                  (weight 1)
//
// Edges are deduplicated and capped at the top-5 strongest per node
// (an edge survives if EITHER endpoint ranks it in its top 5) so the
// rendered graph stays readable. Each edge carries a human-readable
// `reasons[]` list explaining why the link exists.
//
// Cached in-memory. T4: bumped from 60s → 5min. The query pulls every
// material + nested classifications/efficiencies and runs an O(n²) edge
// construction pass (~110ms cold). The KG layout changes only when
// materials are added/updated; there is no explicit invalidation today
// (materials mutations invalidate 'stats:' / 'coverage' but not the KG
// key), so the TTL is the sole freshness signal — 5min keeps the KG
// snappy on repeat visits while still refreshing regularly enough that
// newly added materials show up without a manual refresh.
//
// (If you ever want stricter freshness, add `invalidate('knowledge-graph')`
// to the materials POST/PATCH/DELETE routes and the TTL can stay at 5min
// without any user-visible staleness.)

export interface KGNode {
  id: string
  name: string
  category: string
  bandgap: number | null
  efficiency: number | null
  paperCount: number
}

export interface KGEdge {
  source: string
  target: string
  weight: number
  reasons: string[]
}

interface KGResponse {
  nodes: KGNode[]
  edges: KGEdge[]
  generatedAt: string
}

// Real periodic-table element symbols (Z=1..118). Used to filter
// candidate tokens extracted by `[A-Z][a-z]?` from a free-form formula
// string. This avoids treating pseudo-organic cation labels like "M"
// (methylammonium) or "A" (cation site in ABX3 perovskites) as if they
// were real chemical elements.
const PERIODIC_TABLE = new Set<string>([
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
  'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
  'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
  'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy',
  'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi',
  'Po', 'At', 'Rn',
  'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf',
  'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc',
  'Lv', 'Ts', 'Og',
])

/**
 * Extract real chemical element symbols from a formula string.
 * Splits on `[A-Z][a-z]?` and keeps only tokens that exist on the
 * periodic table. E.g. "MAPbI3" → {"Pb","I"} (M and A are not real
 * elements), "FAPbI3" → {"F","Pb","I"}, so the two share {Pb, I} = 2.
 */
function extractElements(formula: string): Set<string> {
  if (!formula) return new Set()
  const tokens = formula.match(/[A-Z][a-z]?/g) || []
  const elements = new Set<string>()
  for (const tok of tokens) {
    if (PERIODIC_TABLE.has(tok)) elements.add(tok)
  }
  return elements
}

/**
 * Parse a free-form bandgap string (e.g. "1.55 eV", "~1.5", "1.2-1.4 eV")
 * into a numeric eV value. Takes the first plausible float and validates
 * it falls in the typical semiconductor bandgap range [0, 10].
 */
function parseBandgap(raw: string): number | null {
  if (!raw) return null
  // Strip the "eV" / "eV" suffix so it doesn't get picked up as a number.
  const cleaned = raw.replace(/[eE][Vv]/g, ' ').trim()
  const match = cleaned.match(/-?\d+(\.\d+)?/)
  if (!match) return null
  const v = parseFloat(match[0])
  if (!Number.isFinite(v) || v < 0 || v > 10) return null
  return v
}

/**
 * Normalize a free-form synthesis-method string for equality comparison.
 * Lowercases + trims and collapses internal whitespace; takes only the
 * first comma/slash/semicolon-delimited segment so that
 * "spin-coating, annealed at 100C" and "spin-coating" still match.
 */
function normalizeSynthesis(raw: string): string {
  if (!raw) return ''
  const first = raw.split(/[,;/]/)[0] ?? raw
  return first.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function GET(): Promise<Response> {
  const result = await getOrSet<KGResponse>(
    'knowledge-graph',
    5 * 60_000, // 5 min (T4)
    async () => {
      // Pull every material with paper count, max-efficiency record, and
      // the top-confidence classifications (bandgap + synthesis method).
      // Top-5 classifications per material give us a robust best-guess
      // for the extracted bandgap / synthesis method even when individual
      // extractions disagree.
      const materials = await db.material.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { papers: true } },
          efficiencies: {
            orderBy: { efficiencyValue: 'desc' },
            take: 1,
            select: { efficiencyValue: true },
          },
          classifications: {
            orderBy: { confidence: 'desc' },
            take: 5,
            select: { bandgapValue: true, synthesisMethod: true },
          },
        },
      })

      // Build node records + auxiliary per-material lookups for edges.
      const nodes: KGNode[] = []
      const elementSets = new Map<string, Set<string>>()
      const bandgaps = new Map<string, number>()
      const synths = new Map<string, string>()

      for (const m of materials) {
        const bandgapRaw =
          m.classifications
            .map((c) => c.bandgapValue)
            .find((v) => v && v.trim()) || ''
        const synthRaw =
          m.classifications
            .map((c) => c.synthesisMethod)
            .find((v) => v && v.trim()) || ''
        const bandgap = parseBandgap(bandgapRaw)
        const synth = normalizeSynthesis(synthRaw)

        nodes.push({
          id: m.id,
          name: m.name,
          category: m.category,
          bandgap,
          efficiency: m.efficiencies[0]?.efficiencyValue ?? null,
          paperCount: m._count.papers,
        })
        elementSets.set(m.id, extractElements(m.name))
        if (bandgap != null) bandgaps.set(m.id, bandgap)
        if (synth) synths.set(m.id, synth)
      }

      // Pairwise edge building. O(n²) is fine for n≈60 materials.
      // Edges are keyed by "a|b" (a<b by id) so duplicate reasons from
      // the same pair are merged into a single edge.
      const edgeMap = new Map<string, { weight: number; reasons: string[] }>()
      const keyOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

      const addEdge = (
        a: string,
        b: string,
        weight: number,
        reason: string,
      ) => {
        const k = keyOf(a, b)
        const existing = edgeMap.get(k)
        if (existing) {
          existing.weight += weight
          if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
        } else {
          edgeMap.set(k, { weight, reasons: [reason] })
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]

          // 1. Same category
          if (a.category === b.category) {
            addEdge(a.id, b.id, 1, `same category (${a.category})`)
          }

          // 2. Share ≥2 chemical elements
          const ea = elementSets.get(a.id)!
          const eb = elementSets.get(b.id)!
          if (ea.size > 0 && eb.size > 0) {
            const shared: string[] = []
            for (const e of ea) if (eb.has(e)) shared.push(e)
            if (shared.length >= 2) {
              addEdge(a.id, b.id, 2, `shares ${shared.slice().sort().join(', ')}`)
            }
          }

          // 3. Similar bandgap (within 0.3 eV)
          const ba = bandgaps.get(a.id)
          const bb = bandgaps.get(b.id)
          if (ba != null && bb != null && Math.abs(ba - bb) <= 0.3) {
            addEdge(
              a.id,
              b.id,
              1.5,
              `bandgap Δ=${Math.abs(ba - bb).toFixed(2)} eV`,
            )
          }

          // 4. Same synthesis method
          const sa = synths.get(a.id)
          const sb = synths.get(b.id)
          if (sa && sb && sa === sb) {
            addEdge(a.id, b.id, 1, `synthesis: ${sa}`)
          }
        }
      }

      // Cap edges per node at top-5 by weight. We use a greedy edge-selection
      // pass: sort all candidate edges by weight desc, then add each edge
      // iff BOTH endpoints still have fewer than 5 incident edges. This
      // guarantees every node ends up with ≤5 edges (the strict reading of
      // "limit edges per node to top 5") while preferring the strongest
      // relationships globally. Heaviest edges are considered first so they
      // never get crowded out by lighter ones.
      const candidateEdges = Array.from(edgeMap.entries()).map(([k, v]) => {
        const [a, b] = k.split('|')
        return { a, b, weight: v.weight, reasons: v.reasons }
      })
      candidateEdges.sort((x, y) => y.weight - x.weight)

      const MAX_EDGES_PER_NODE = 5
      const degree = new Map<string, number>()
      const edges: KGEdge[] = []
      for (const e of candidateEdges) {
        const da = degree.get(e.a) ?? 0
        const db = degree.get(e.b) ?? 0
        if (da >= MAX_EDGES_PER_NODE || db >= MAX_EDGES_PER_NODE) continue
        edges.push({
          source: e.a,
          target: e.b,
          weight: Math.round(e.weight * 100) / 100,
          reasons: e.reasons,
        })
        degree.set(e.a, da + 1)
        degree.set(e.b, db + 1)
      }

      // Heaviest edges first — useful for clients that want to layer
      // rendering by weight. (Already sorted, but be defensive.)
      edges.sort((a, b) => b.weight - a.weight)

      return {
        nodes,
        edges,
        generatedAt: new Date().toISOString(),
      }
    },
  )

  return NextResponse.json(result)
}
