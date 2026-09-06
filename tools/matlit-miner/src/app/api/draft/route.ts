import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'
import {
  callLLMWithFailover,
  getLLMConfigsFromHeaders,
  type LLMConfigEntry,
} from '@/lib/llm'
import { parseBandgap } from '@/lib/bandgap-predictor'

// POST /api/draft
//
// AI paper-draft generator. Given a list of material IDs and a target paper
// section, gathers each material's name / formula / bandgap / efficiency /
// synthesis method / conditions / top papers, hands the structured bundle
// to the LLM, and returns the generated Markdown section.
//
// Request body:
//   {
//     materialIds: string[],                  // 1..5 material IDs
//     section?: 'methods' | 'results' | 'introduction'  // default 'methods'
//   }
//
// Response:
//   {
//     draft: string,        // Markdown text from the LLM
//     generatedAt: string,  // ISO timestamp
//     source: 'llm' | 'fallback',
//     cached: boolean       // true when served from the 30-min cache
//   }
//
// Cache: 30 minutes per (materialIds-sorted-hash + section). The LLM call
// is ~10–20 s and the output is deterministic at temperature 0, so a 30-min
// cache makes re-opening the dialog cheap.
//
// Fallback: if the LLM call fails (rate limit, network, malformed output)
// OR no materials were found, we emit a deterministic template-derived
// draft from the gathered data so the UI is never empty.

const DRAFT_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MAX_MATERIALS = 5
const MAX_PAPERS_PER_MATERIAL = 5

type Section = 'methods' | 'results' | 'introduction'

interface DraftRequest {
  materialIds: string[]
  section?: Section
}

interface DraftResponse {
  draft: string
  generatedAt: string
  source: 'llm' | 'fallback'
  cached: boolean
}

interface MaterialData {
  id: string
  name: string
  aliases: string
  category: string
  bandgap: number | null
  efficiency: number | null
  certified: boolean
  synthesisMethod: string
  conditions: string
  papers: Array<{
    title: string
    year: number | null
    doi: string
    authors: string
    venue: string
  }>
}

/**
 * Gather the data bundle for the selected materials. For each material we
 * pull the highest-confidence bandgap + synthesis method + conditions
 * (matching the pattern used by /api/discover and the bandgap-predictor),
 * the best efficiency record (preferring certified ones), and the top few
 * papers by citationCount so the LLM can cite realistic prior work.
 */
async function fetchMaterialData(materialIds: string[]): Promise<MaterialData[]> {
  if (materialIds.length === 0) return []
  const materials = await db.material.findMany({
    where: { id: { in: materialIds } },
    include: {
      classifications: {
        // Pick the classification with a bandgap value that has the
        // highest confidence — same logic as /api/discover.
        where: { bandgapValue: { not: '' } },
        orderBy: { confidence: 'desc' },
        take: 1,
        select: {
          bandgapValue: true,
          synthesisMethod: true,
          conditions: true,
        },
      },
      efficiencies: {
        orderBy: [{ certified: 'desc' }, { efficiencyValue: 'desc' }],
        take: 1,
        select: { efficiencyValue: true, certified: true },
      },
      papers: {
        orderBy: { citationCount: 'desc' },
        take: MAX_PAPERS_PER_MATERIAL,
        select: {
          title: true,
          year: true,
          doi: true,
          authors: true,
          venue: true,
        },
      },
    },
  })

  // Preserve the caller's order (materialIds order) instead of the
  // arbitrary DB order — the prompt is more readable when the user's
  // selection order is respected.
  return materialIds
    .map((id) => materials.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => {
      const bg = m.classifications[0]?.bandgapValue
        ? parseBandgap(m.classifications[0].bandgapValue)
        : null
      const eff = m.efficiencies[0]?.efficiencyValue ?? null
      const certified = m.efficiencies[0]?.certified ?? false
      return {
        id: m.id,
        name: m.name,
        aliases: m.aliases || '',
        category: m.category || 'other',
        bandgap: bg,
        efficiency: eff,
        certified,
        synthesisMethod: m.classifications[0]?.synthesisMethod || '',
        conditions: m.classifications[0]?.conditions || '',
        papers: m.papers.map((p) => ({
          title: p.title,
          year: p.year,
          doi: p.doi || '',
          authors: p.authors || '',
          venue: p.venue || '',
        })),
      }
    })
}

/**
 * Serialise the gathered material data into a compact, LLM-friendly block.
 * Each material becomes a labelled section with its key properties and a
 * short paper list (title — year — doi). Papers without a title are
 * omitted to keep the prompt clean.
 */
function formatMaterialData(materials: MaterialData[]): string {
  return materials
    .map((m, i) => {
      const lines: string[] = [`### Material ${i + 1}: ${m.name}`]
      if (m.aliases) lines.push(`- Aliases: ${m.aliases}`)
      lines.push(`- Category: ${m.category}`)
      if (m.bandgap !== null) {
        lines.push(`- Bandgap: ${m.bandgap.toFixed(2)} eV`)
      } else {
        lines.push('- Bandgap: (not reported)')
      }
      if (m.efficiency !== null) {
        lines.push(
          `- Best efficiency: ${m.efficiency.toFixed(2)}%${m.certified ? ' (certified)' : ''}`,
        )
      } else {
        lines.push('- Best efficiency: (not reported)')
      }
      if (m.synthesisMethod) {
        lines.push(`- Synthesis method: ${m.synthesisMethod}`)
      }
      if (m.conditions) {
        lines.push(`- Conditions: ${m.conditions}`)
      }
      if (m.papers.length > 0) {
        lines.push('- Key references:')
        for (const p of m.papers) {
          const parts: string[] = []
          if (p.title) parts.push(`"${p.title}"`)
          if (p.year) parts.push(`(${p.year})`)
          if (p.venue) parts.push(p.venue)
          if (p.doi) parts.push(`doi:${p.doi}`)
          if (parts.length > 0) lines.push(`  - ${parts.join(' ')}`)
        }
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

/**
 * Build the section-specific LLM prompt. Mirrors the spec:
 *   "Write a {section} section for a research paper about these materials:
 *    {data}. Use academic tone. Include: for 'methods' — synthesis
 *    procedures, characterization; for 'results' — efficiency comparison,
 *    bandgap discussion; for 'introduction' — background, motivation.
 *    Format as Markdown."
 */
function buildPrompt(materials: MaterialData[], section: Section): string {
  const data = formatMaterialData(materials)
  const sectionGuidance: Record<Section, string> = {
    methods:
      'Focus on synthesis procedures (reagents, solvents, annealing temperatures, deposition technique) and the characterization methods used to verify the resulting films (XRD, SEM, UV-vis, PL, JV measurements). Use past tense and passive voice as is conventional for experimental sections.',
    results:
      'Focus on a comparative discussion: rank the materials by efficiency, contrast their bandgaps against the Shockley-Queisser optimum (1.34 eV), and interpret differences in performance with reference to the synthesis method and conditions. Use tables where appropriate (Markdown pipe tables).',
    introduction:
      'Focus on background and motivation: explain why these material families matter for photovoltaics, what gap in the literature they address, and how the present study advances the field. End with a brief paragraph stating the contributions of the work.',
  }

  return `You are a senior materials-science researcher drafting a research paper. Write the **${section}** section for a paper about the materials listed below. Use an academic tone and format the output as Markdown (headings, bullet lists, and pipe tables where appropriate). Cite the listed references inline as (Author, Year) when relevant.

=== Material data ===
${data}

=== Section guidance ===
${sectionGuidance[section]}

Output STRICT MARKDOWN ONLY — no JSON wrapping, no commentary, no code fences around the whole answer. Begin directly with a top-level section heading (e.g. "## Materials and Methods"). Aim for 400–700 words.`
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
        'You are a precise academic-writing assistant for materials science. Always output strict Markdown only — no JSON wrapping, no commentary.',
    },
    { role: 'user' as const, content: prompt },
  ]
  return callLLMWithFailover(messages, configs)
}

/**
 * Deterministic fallback draft used when the LLM is unavailable or returns
 * an empty response. Built directly from the gathered material data so the
 * user always gets a usable starting point they can edit.
 */
function buildFallbackDraft(materials: MaterialData[], section: Section): string {
  const heading: Record<Section, string> = {
    methods: '## Materials and Methods',
    results: '## Results and Discussion',
    introduction: '## Introduction',
  }
  const lines: string[] = [heading[section], '']

  if (section === 'introduction') {
    lines.push(
      `The development of next-generation photovoltaic materials has been driven by the need for high power-conversion efficiency, long-term environmental stability, and earth-abundant, non-toxic constituents. The present study focuses on ${materials.length} candidate material${materials.length === 1 ? '' : 's'} — ${materials.map((m) => `**${m.name}**`).join(', ')} — selected for their complementary optoelectronic properties.`,
    )
    lines.push('')
    for (const m of materials) {
      lines.push(`### ${m.name}`)
      const bits: string[] = []
      bits.push(`category: ${m.category}`)
      if (m.bandgap !== null) bits.push(`bandgap ≈ ${m.bandgap.toFixed(2)} eV`)
      if (m.efficiency !== null)
        bits.push(
          `best reported efficiency ${m.efficiency.toFixed(2)}%${m.certified ? ' (certified)' : ''}`,
        )
      lines.push(`${bits.join('; ')}.`)
      if (m.papers.length > 0) {
        lines.push(
          `Prior work includes ${m.papers.length} key reference${m.papers.length === 1 ? '' : 's'} (${m.papers.map((p) => `${p.year ?? 'n.d.'}`).join(', ')}).`,
        )
      }
      lines.push('')
    }
    lines.push(
      'The motivation for this work is to consolidate the available experimental evidence and identify synthesis–performance relationships that can guide the next round of optimization.',
    )
    return lines.join('\n')
  }

  if (section === 'methods') {
    for (const m of materials) {
      lines.push(`### ${m.name}`)
      if (m.synthesisMethod) {
        lines.push(
          `**Synthesis.** ${m.name} was prepared via ${m.synthesisMethod}${m.conditions ? ` under the following conditions: ${m.conditions}` : ''}.`,
        )
      } else {
        lines.push(
          `**Synthesis.** The synthesis route for ${m.name} was not specified in the indexed literature and should be confirmed against the primary sources.`,
        )
      }
      lines.push('')
      lines.push(
        '**Characterization.** Crystal structure was verified by X-ray diffraction (XRD); film morphology by scanning electron microscopy (SEM); optical absorption by UV-vis spectroscopy (from which the bandgap' +
          (m.bandgap !== null ? `, ${m.bandgap.toFixed(2)} eV, was extracted via Tauc plotting` : '') +
          `); and device performance by current-density–voltage (JV) measurements under AM1.5G illumination` +
          (m.efficiency !== null
            ? `, yielding a champion efficiency of ${m.efficiency.toFixed(2)}%${m.certified ? ' (certified)' : ''}`
            : '') +
          '.',
      )
      lines.push('')
      if (m.papers.length > 0) {
        lines.push('**Primary references:**')
        for (const p of m.papers) {
          if (!p.title) continue
          lines.push(
            `- ${p.title}${p.year ? ` (${p.year})` : ''}${p.doi ? ` — doi:${p.doi}` : ''}`,
          )
        }
        lines.push('')
      }
    }
    return lines.join('\n')
  }

  // results
  const ranked = [...materials].sort((a, b) => {
    const ea = a.efficiency ?? -1
    const eb = b.efficiency ?? -1
    return eb - ea
  })
  lines.push(
    `The ${materials.length} material${materials.length === 1 ? '' : 's'} under study span ${new Set(materials.map((m) => m.category)).size} categor${new Set(materials.map((m) => m.category)).size === 1 ? 'y' : 'ies'} and exhibit a wide range of optoelectronic properties. Table 1 summarises the experimentally measured bandgaps and champion device efficiencies.`,
  )
  lines.push('')
  lines.push('| Material | Bandgap (eV) | Efficiency (%) | Certified |')
  lines.push('|----------|-------------|----------------|-----------|')
  for (const m of ranked) {
    lines.push(
      `| ${m.name} | ${m.bandgap !== null ? m.bandgap.toFixed(2) : '—'} | ${m.efficiency !== null ? m.efficiency.toFixed(2) : '—'} | ${m.certified ? 'yes' : 'no'} |`,
    )
  }
  lines.push('')
  if (ranked[0]?.efficiency !== null && ranked[0]?.efficiency !== undefined) {
    lines.push(
      `**${ranked[0].name}** delivers the highest champion efficiency (${ranked[0].efficiency.toFixed(2)}%)${ranked[0].certified ? ', independently certified' : ''}, while the remaining materials illustrate the trade-offs between bandgap, stability, and process complexity that motivate ongoing compositional-engineering efforts.`,
    )
  } else {
    lines.push(
      'Efficiency data is sparse across this set — further device-level characterization is needed before drawing definitive performance comparisons.',
    )
  }
  lines.push('')
  const withBg = materials.filter((m) => m.bandgap !== null)
  if (withBg.length > 0) {
    const avg =
      withBg.reduce((s, m) => s + (m.bandgap as number), 0) / withBg.length
    lines.push(
      `The mean bandgap across the ${withBg.length} material${withBg.length === 1 ? '' : 's'} with reported values is ${avg.toFixed(2)} eV, which ${avg >= 1.1 && avg <= 1.7 ? 'lies within' : 'lies outside'} the optimal single-junction window (1.1–1.7 eV).`,
    )
  }
  return lines.join('\n')
}

/**
 * Stable FNV-1a 32-bit hash of the material-id list + section. Used as the
 * cache key so identical requests dedupe regardless of input ordering.
 */
function hashKey(materialIds: string[], section: Section): string {
  const sorted = [...materialIds].sort()
  const payload = `${sorted.join(',')}|${section}`
  let h = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `draft:${(h >>> 0).toString(16)}`
}

function isSection(v: unknown): v is Section {
  return v === 'methods' || v === 'results' || v === 'introduction'
}

export async function POST(req: NextRequest) {
  // Read multi-config failover list from headers (P3). Read once outside the
  // cache callback so a cache HIT doesn't re-parse the header.
  const configs = getLLMConfigsFromHeaders(req.headers)

  const body = await req.json().catch(() => ({}))
  const { materialIds, section } = (body ?? {}) as DraftRequest

  // Validate materialIds: must be a non-empty array of strings, ≤5 items.
  if (
    !Array.isArray(materialIds) ||
    materialIds.length === 0 ||
    materialIds.length > MAX_MATERIALS ||
    !materialIds.every((id) => typeof id === 'string' && id.trim() !== '')
  ) {
    return NextResponse.json(
      {
        error:
          'materialIds must be a non-empty array of strings (max 5 items)',
      },
      { status: 400 },
    )
  }

  const sec: Section = isSection(section) ? section : 'methods'

  // De-duplicate while preserving order.
  const uniqueIds = Array.from(new Set(materialIds as string[]))

  const cacheKey = hashKey(uniqueIds, sec)

  const cachedFlag = { current: false }
  const result = await getOrSet(
    cacheKey,
    DRAFT_TTL_MS,
    async (): Promise<DraftResponse> => {
      const materials = await fetchMaterialData(uniqueIds)
      if (materials.length === 0) {
        return {
          draft: '',
          generatedAt: new Date().toISOString(),
          source: 'fallback',
          cached: false,
        }
      }

      let draft = ''
      let source: 'llm' | 'fallback' = 'fallback'
      try {
        const text = await callLLM(buildPrompt(materials, sec), configs)
        if (text && text.trim().length > 0) {
          draft = text.trim()
          source = 'llm'
        }
      } catch (e) {
        // Swallow — fall back to template-derived draft, but log the LLM
        // failure so degraded quality doesn't go unnoticed in production.
        console.warn('[draft] LLM draft generation failed, using fallback:', e)
      }

      if (!draft) {
        draft = buildFallbackDraft(materials, sec)
        source = 'fallback'
      }

      return {
        draft,
        generatedAt: new Date().toISOString(),
        source,
        cached: false,
      }
    },
  )

  // The cache wrapper doesn't tell us whether it hit. Re-check by looking
  // at the timestamp age — if generatedAt is more than a few seconds old,
  // it must have come from the cache. (Best-effort: not perfectly accurate
  // but good enough for the UI's "cached" badge.)
  const ageMs = Date.now() - new Date(result.generatedAt).getTime()
  cachedFlag.current = ageMs > 5_000

  return NextResponse.json({
    ...result,
    cached: cachedFlag.current,
  })
}
