import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'
import {
  callLLMWithFailover,
  getLLMConfigsFromHeaders,
  type LLMConfigEntry,
} from '@/lib/llm'
import { parseElements, parseBandgap } from '@/lib/bandgap-predictor'

// GET /api/discover
//
// AI-powered "Research Opportunities" discovery endpoint. Gathers every
// material in the database along with its parsed elements, bandgap (eV),
// best efficiency (%), paper count, and most common synthesis method,
// then runs a 4-axis gap analysis:
//
//   1. Unexplored element combinations — cation/anion pairs that are
//      individually present in the DB but never combined in a single
//      material (e.g. "Cs+Pb+I exists but Cs+Ge+I doesn't").
//   2. Categories with low efficiency but high paper count — well-studied
//      but underperforming areas worth re-engineering.
//   3. Categories with high efficiency but low paper count — emerging
//      high-potential areas with sparse literature.
//   4. Materials with bandgap in the optimal single-junction range
//      (1.1–1.7 eV) but no efficiency record — synthesis-known but
//      device-untested candidates.
//
// The gap summary + material corpus are then handed to the LLM with a
// prompt asking for 5 specific new research directions (each with title,
// rationale, suggested composition, expected bandgap range, difficulty,
// and "promising because"). The LLM call goes through `callLLMWithFailover`
// (P3), so multi-config failover + exponential backoff + Retry-After
// honoring apply automatically when the request carries `x-llm-configs`
// (P1's api-client).
//
// The result is cached in memory for 10 minutes per cache key. If the
// LLM call fails (rate-limit, network, malformed JSON) or returns no
// parseable opportunities, a deterministic rule-based fallback is
// computed from the gap summary so the UI always has 5 cards to render.
//
// Query params:
//   ?refresh=1  — bypass the cache and force a fresh LLM call.
//
// Response:
//   {
//     opportunities: Array<{
//       title: string,
//       rationale: string,
//       suggestedComposition: string,
//       expectedBandgap: string,        // e.g. "1.2-1.5 eV"
//       difficulty: 'low' | 'medium' | 'high',
//       promisingBecause: string
//     }>,
//     generatedAt: string,              // ISO timestamp
//     source: 'llm' | 'fallback',       // whether the LLM produced it
//     gapSummary: {                     // the gap analysis fed to the LLM
//       unexploredCombinations: string[],
//       lowEfficiencyHighPapers: Array<{ category, avgEff, paperCount }>,
//       highEfficiencyLowPapers: Array<{ category, avgEff, paperCount }>,
//       optimalBandgapNoEfficiency: Array<{ name, bandgap }>
//     }
//   }

const DISCOVERY_TTL_MS = 10 * 60 * 1000 // 10 minutes
const OPTIMAL_BG_MIN = 1.1 // eV — single-junction Shockley-Queisser optimum lower bound
const OPTIMAL_BG_MAX = 1.7 // eV — upper bound

// Anion / halogen / chalcogen tokens — anything else parsed from the
// formula is treated as a cation. Used by the unexplored-combination
// detector to split a material's element set into cations + anions.
const ANION_TOKENS = new Set(['I', 'Br', 'Cl', 'F', 'O', 'S', 'Se', 'Te', 'N'])

type Difficulty = 'low' | 'medium' | 'high'

interface MaterialSummary {
  id: string
  name: string
  category: string
  elements: string[]
  bandgap: number | null
  efficiency: number | null
  paperCount: number
  synthesisMethod: string
}

interface CategoryStat {
  category: string
  avgEff: number
  paperCount: number
  materials: number
}

interface GapAnalysis {
  unexploredCombinations: string[]
  lowEfficiencyHighPapers: CategoryStat[]
  highEfficiencyLowPapers: CategoryStat[]
  optimalBandgapNoEfficiency: Array<{ name: string; bandgap: number }>
}

interface Opportunity {
  title: string
  rationale: string
  suggestedComposition: string
  expectedBandgap: string
  difficulty: Difficulty
  promisingBecause: string
}

interface DiscoveryResponse {
  opportunities: Opportunity[]
  generatedAt: string
  source: 'llm' | 'fallback'
  gapSummary: GapAnalysis
}

/**
 * Fetch every material along with the highest-confidence classification
 * (bandgap + synthesis method), the best efficiency record, and a paper
 * count. Mirrors the join pattern used by /api/materials/[id]/similar so
 * the two endpoints agree on what "the material's bandgap / efficiency"
 * means.
 */
async function fetchMaterialSummaries(): Promise<MaterialSummary[]> {
  const materials = await db.material.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { papers: true } },
      classifications: {
        // Pick the classification with a bandgap value that has the
        // highest confidence — same logic as the bandgap-predictor joins.
        where: { bandgapValue: { not: '' } },
        orderBy: { confidence: 'desc' },
        take: 1,
        select: { bandgapValue: true, synthesisMethod: true },
      },
      efficiencies: {
        orderBy: { efficiencyValue: 'desc' },
        take: 1,
        select: { efficiencyValue: true },
      },
    },
  })

  return materials.map((m) => {
    const elements = Array.from(parseElements(m.name))
    const bg = m.classifications[0]?.bandgapValue
      ? parseBandgap(m.classifications[0].bandgapValue)
      : null
    const eff = m.efficiencies[0]?.efficiencyValue ?? null
    return {
      id: m.id,
      name: m.name,
      category: m.category || 'other',
      elements,
      bandgap: bg,
      efficiency: eff,
      paperCount: m._count.papers,
      synthesisMethod: m.classifications[0]?.synthesisMethod || '',
    }
  })
}

/**
 * Compute the median of a numeric array. Returns 0 for empty input
 * (callers guard against empty arrays upstream).
 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Run the 4-axis gap analysis over the material corpus.
 *
 * The unexplored-combinations detector is intentionally conservative: it
 * only suggests combinations where every individual element already
 * appears somewhere in the DB, and only the specific cation+anion pairing
 * is missing. This avoids suggesting exotic chemistry that has no
 * precedent in the corpus.
 */
function analyzeGaps(materials: MaterialSummary[]): GapAnalysis {
  // ── Axis 1: Unexplored cation+anion combinations ──────────────────────
  const existingCombos = new Set<string>() // "cations|anion"
  const cationSets = new Set<string>() // sorted cation tuples
  const anionsSeen = new Set<string>()

  for (const m of materials) {
    const cations = m.elements.filter((e) => !ANION_TOKENS.has(e)).sort()
    const anions = m.elements.filter((e) => ANION_TOKENS.has(e))
    if (cations.length === 0) continue
    cationSets.add(cations.join(','))
    anions.forEach((a) => anionsSeen.add(a))
    for (const a of anions) {
      existingCombos.add(`${cations.join(',')}|${a}`)
    }
  }

  const unexploredCombinations: string[] = []
  // Cap the search so we don't enumerate the cartesian product on large
  // corpora — 8 candidates is plenty for the prompt + fallback.
  for (const cationSet of Array.from(cationSets)) {
    const cations = cationSet.split(',')
    for (const anion of Array.from(anionsSeen)) {
      const key = `${cationSet}|${anion}`
      if (!existingCombos.has(key)) {
        unexploredCombinations.push(`${cations.join('+')}+${anion}`)
        if (unexploredCombinations.length >= 8) break
      }
    }
    if (unexploredCombinations.length >= 8) break
  }

  // ── Axes 2 & 3: Category efficiency / paper-count imbalances ─────────
  const byCategory = new Map<
    string,
    { effs: number[]; paperCount: number; materials: number }
  >()
  for (const m of materials) {
    const cat = m.category || 'other'
    if (!byCategory.has(cat)) {
      byCategory.set(cat, { effs: [], paperCount: 0, materials: 0 })
    }
    const entry = byCategory.get(cat)!
    if (m.efficiency !== null && m.efficiency > 0) entry.effs.push(m.efficiency)
    entry.paperCount += m.paperCount
    entry.materials += 1
  }

  const catStats: CategoryStat[] = Array.from(byCategory.entries()).map(
    ([category, s]) => ({
      category,
      avgEff:
        s.effs.length > 0
          ? s.effs.reduce((a, b) => a + b, 0) / s.effs.length
          : 0,
      paperCount: s.paperCount,
      materials: s.materials,
    }),
  )

  const medPapers = median(catStats.map((s) => s.paperCount))
  const medEff = median(catStats.map((s) => s.avgEff))

  const lowEfficiencyHighPapers = catStats
    .filter(
      (s) => s.paperCount >= medPapers && s.avgEff > 0 && s.avgEff <= medEff,
    )
    .sort((a, b) => b.paperCount - a.paperCount)
    .slice(0, 3)

  const highEfficiencyLowPapers = catStats
    .filter(
      (s) => s.paperCount <= medPapers && s.avgEff >= medEff && s.avgEff > 0,
    )
    .sort((a, b) => b.avgEff - a.avgEff)
    .slice(0, 3)

  // ── Axis 4: Optimal bandgap, no efficiency record ────────────────────
  const optimalBandgapNoEfficiency = materials
    .filter(
      (m) =>
        m.bandgap !== null &&
        m.bandgap >= OPTIMAL_BG_MIN &&
        m.bandgap <= OPTIMAL_BG_MAX &&
        (m.efficiency === null || m.efficiency === 0),
    )
    .map((m) => ({ name: m.name, bandgap: m.bandgap as number }))
    .slice(0, 8)

  return {
    unexploredCombinations,
    lowEfficiencyHighPapers,
    highEfficiencyLowPapers,
    optimalBandgapNoEfficiency,
  }
}

/**
 * Build the LLM prompt. Includes a compact dump of every material (capped
 * at 60 to keep the prompt bounded) plus the structured gap summary. The
 * response format is a strict JSON object with an `opportunities` array.
 */
function buildPrompt(materials: MaterialSummary[], gaps: GapAnalysis): string {
  const materialLines = materials
    .slice(0, 60)
    .map((m, i) => {
      const parts: string[] = [`#${i + 1} ${m.name}`]
      parts.push(`cat=${m.category}`)
      if (m.elements.length > 0) parts.push(`els=${m.elements.join('+')}`)
      if (m.bandgap !== null) parts.push(`Eg=${m.bandgap.toFixed(2)}eV`)
      if (m.efficiency !== null) parts.push(`η=${m.efficiency.toFixed(2)}%`)
      parts.push(`papers=${m.paperCount}`)
      if (m.synthesisMethod) parts.push(`method=${m.synthesisMethod}`)
      return parts.join(' | ')
    })
    .join('\n')

  const gapLines = [
    `Unexplored element combinations: ${gaps.unexploredCombinations.length > 0 ? gaps.unexploredCombinations.join('; ') : 'none detected'}`,
    `Categories with LOW efficiency but HIGH paper count (well-studied, underperforming): ${gaps.lowEfficiencyHighPapers.length > 0 ? gaps.lowEfficiencyHighPapers.map((c) => `${c.category} (η_avg=${c.avgEff.toFixed(1)}%, papers=${c.paperCount})`).join('; ') : 'none'}`,
    `Categories with HIGH efficiency but LOW paper count (emerging high-potential): ${gaps.highEfficiencyLowPapers.length > 0 ? gaps.highEfficiencyLowPapers.map((c) => `${c.category} (η_avg=${c.avgEff.toFixed(1)}%, papers=${c.paperCount})`).join('; ') : 'none'}`,
    `Materials with optimal bandgap (1.1-1.7 eV) but NO efficiency record: ${gaps.optimalBandgapNoEfficiency.length > 0 ? gaps.optimalBandgapNoEfficiency.map((m) => `${m.name} (Eg=${m.bandgap.toFixed(2)}eV)`).join('; ') : 'none'}`,
  ].join('\n')

  return `You are a senior materials-science researcher specializing in photovoltaic and semiconductor materials (perovskites, chalcogenides, oxides). Below is the corpus of materials currently indexed in MatLit Miner, along with their category, parsed element tokens, experimental bandgap (eV), best reported solar-cell efficiency (η, %), paper count, and most common synthesis method.

=== Existing materials (n=${materials.length}) ===
${materialLines || '(no materials indexed yet)'}

=== Identified gaps ===
${gapLines}

Given these existing materials and the gap analysis above, suggest 5 SPECIFIC new research directions — each a concrete composition NOT already in the database. Diversify across categories and difficulties (low/medium/high). For each direction, provide:

- title: a short descriptive title (max 80 chars)
- rationale: 2-3 sentences explaining the scientific basis (which gap it addresses, why the chemistry is feasible, what comparable material suggests it will work)
- suggestedComposition: a concrete chemical formula or descriptor (e.g. "CsGeI3", "FA0.5MA0.5SnBr3", "Sb2(S,Se)3 alloy")
- expectedBandgap: a range string in eV, e.g. "1.2-1.5 eV"
- difficulty: "low" (well-established chemistry, close analog exists) | "medium" (some new step but precedent nearby) | "high" (novel/risky synthesis)
- promisingBecause: one short sentence on the upside

Output STRICT JSON ONLY, no other text, no markdown fences:
{
  "opportunities": [
    {
      "title": "...",
      "rationale": "...",
      "suggestedComposition": "...",
      "expectedBandgap": "1.2-1.5 eV",
      "difficulty": "medium",
      "promisingBecause": "..."
    }
  ]
}`
}

/**
 * Parse the LLM response into an Opportunity[]. Returns null on any
 * structural issue so the caller can fall back to rule-based output.
 */
function parseOpportunities(text: string): Opportunity[] | null {
  if (!text) return null
  let t = text.trim()
  // Strip ```json ... ``` fences if present.
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  }
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(t)
  } catch {
    return null
  }

  const arr = (parsed as { opportunities?: unknown })?.opportunities
  if (!Array.isArray(arr)) return null

  const out: Opportunity[] = []
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const difficultyRaw = String(o.difficulty ?? 'medium').toLowerCase()
    const difficulty: Difficulty = ['low', 'medium', 'high'].includes(
      difficultyRaw,
    )
      ? (difficultyRaw as Difficulty)
      : 'medium'
    const title = String(o.title ?? '').trim()
    const suggestedComposition = String(o.suggestedComposition ?? '').trim()
    if (!title || !suggestedComposition) continue
    out.push({
      title: title.slice(0, 200),
      rationale: String(o.rationale ?? '').slice(0, 800),
      suggestedComposition: suggestedComposition.slice(0, 120),
      expectedBandgap:
        String(o.expectedBandgap ?? '').slice(0, 60) || '1.1-1.7 eV',
      difficulty,
      promisingBecause: String(o.promisingBecause ?? '').slice(0, 500),
    })
    if (out.length >= 5) break
  }
  return out.length > 0 ? out : null
}

/**
 * Build a deterministic, rule-based fallback when the LLM call fails or
 * returns nothing parseable. Always produces exactly 5 opportunities,
 * each derived directly from the gap analysis so the UI is never empty.
 */
function buildFallbackOpportunities(
  gaps: GapAnalysis,
): Opportunity[] {
  const opportunities: Opportunity[] = []

  // 1. Top unexplored element combination
  if (gaps.unexploredCombinations.length > 0) {
    const combo = gaps.unexploredCombinations[0]
    const compact = combo.replace(/\+/g, '')
    opportunities.push({
      title: `Explore ${combo} chemistry`,
      rationale: `The element combination ${combo} has not yet been indexed in the corpus. Each constituent element appears in adjacent compositions, suggesting the chemistry is feasible but the specific combination has been overlooked by the literature so far.`,
      suggestedComposition: `${compact}3`,
      expectedBandgap: '1.2-1.8 eV',
      difficulty: 'medium',
      promisingBecause:
        'Closely related compositions already show useful photovoltaic properties; this swap may yield similar or improved performance.',
    })
  }

  // 2. Emerging high-potential category (high eff, low papers)
  if (gaps.highEfficiencyLowPapers.length > 0) {
    const cat = gaps.highEfficiencyLowPapers[0]
    opportunities.push({
      title: `Expand ${cat.category} research`,
      rationale: `The ${cat.category} category achieves ${cat.avgEff.toFixed(1)}% average efficiency across only ${cat.paperCount} indexed papers — an emerging high-potential area with low publication density. New compositions in this family are likely under-explored.`,
      suggestedComposition: `${cat.category}-novel-alloy`,
      expectedBandgap: '1.0-1.6 eV',
      difficulty: 'medium',
      promisingBecause:
        'High demonstrated efficiency with sparse literature suggests rapid improvement is possible with modest effort.',
    })
  }

  // 3. Underperforming well-studied category (low eff, high papers)
  if (gaps.lowEfficiencyHighPapers.length > 0) {
    const cat = gaps.lowEfficiencyHighPapers[0]
    opportunities.push({
      title: `Re-engineer ${cat.category} via doping`,
      rationale: `The ${cat.category} category has ${cat.paperCount} indexed papers but only ${cat.avgEff.toFixed(1)}% average efficiency — well-studied yet underperforming. Targeted doping, interlayers, or compositional engineering may unlock gains.`,
      suggestedComposition: `${cat.category}-doped-variant`,
      expectedBandgap: '1.3-1.7 eV',
      difficulty: 'high',
      promisingBecause:
        'The large existing literature base makes iteration cheap; even small gains would be impactful at scale.',
    })
  }

  // 4 & 5. Top optimal-bandgap materials with no device efficiency
  const optimal = gaps.optimalBandgapNoEfficiency.slice(0, 2)
  for (const m of optimal) {
    opportunities.push({
      title: `Device characterization of ${m.name}`,
      rationale: `${m.name} has a measured bandgap of ${m.bandgap.toFixed(2)} eV — squarely inside the optimal single-junction range (${OPTIMAL_BG_MIN}-${OPTIMAL_BG_MAX} eV) — but no solar-cell efficiency has been recorded. Building and testing a device could fill this gap.`,
      suggestedComposition: m.name,
      expectedBandgap: `${m.bandgap.toFixed(2)} eV`,
      difficulty: 'low',
      promisingBecause:
        'The material already exists and has a favorable bandgap; only device integration is needed to demonstrate potential.',
    })
  }

  // Pad to 5 with a generic computational-screen suggestion.
  while (opportunities.length < 5) {
    opportunities.push({
      title: 'High-throughput DFT screen of unexplored composition space',
      rationale:
        'Several unexplored corners of the composition space remain. A high-throughput density-functional-theory screen over candidate chemistries could prioritize the next synthesis target.',
      suggestedComposition: 'high-throughput-DFT-screen',
      expectedBandgap: '1.1-1.7 eV',
      difficulty: 'medium',
      promisingBecause:
        'Computational screening is cheap and can rank candidates before committing lab time.',
    })
  }

  return opportunities.slice(0, 5)
}

/**
 * Call the LLM via `callLLMWithFailover` (P3), which transparently handles
 * multi-config failover + exponential backoff + Retry-After honoring.
 * Returns the raw text response.
 */
async function callLLM(
  prompt: string,
  configs: LLMConfigEntry[],
): Promise<string> {
  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a precise materials-science research strategist. Always output strict JSON only, no markdown fences, no commentary.',
    },
    { role: 'user' as const, content: prompt },
  ]
  return callLLMWithFailover(messages, configs)
}

export async function GET(req: NextRequest) {
  // Read multi-config failover list from headers (P3). Read once outside the
  // cache callback so a cache HIT doesn't re-parse the header.
  const configs = getLLMConfigsFromHeaders(req.headers)

  const refresh = new URL(req.url).searchParams.get('refresh') === '1'
  const cacheKey = 'discover:opportunities'

  const result = await getOrSet(
    refresh ? `${cacheKey}:${Date.now()}` : cacheKey,
    DISCOVERY_TTL_MS,
    async (): Promise<DiscoveryResponse> => {
      const materials = await fetchMaterialSummaries()
      const gaps = analyzeGaps(materials)

      // Empty corpus — return an empty opportunity list with a fallback
      // source marker so the UI can render the "no data yet" state.
      if (materials.length === 0) {
        return {
          opportunities: [],
          generatedAt: new Date().toISOString(),
          source: 'fallback',
          gapSummary: gaps,
        }
      }

      let opportunities: Opportunity[] | null = null
      let source: 'llm' | 'fallback' = 'fallback'
      try {
        const text = await callLLM(buildPrompt(materials, gaps), configs)
        opportunities = parseOpportunities(text)
        if (opportunities && opportunities.length > 0) {
          source = 'llm'
        }
      } catch (e) {
        // Swallow — fall back to rule-based output, but log the LLM
        // failure so degraded quality doesn't go unnoticed.
        console.warn('[discover] LLM opportunity generation failed, using fallback:', e)
      }

      if (!opportunities || opportunities.length === 0) {
        opportunities = buildFallbackOpportunities(gaps)
        source = 'fallback'
      }

      return {
        opportunities,
        generatedAt: new Date().toISOString(),
        source,
        gapSummary: gaps,
      }
    },
  )

  return NextResponse.json(result)
}
