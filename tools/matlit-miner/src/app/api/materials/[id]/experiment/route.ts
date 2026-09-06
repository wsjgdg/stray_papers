import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrSet } from '@/lib/cache'
import {
  callLLMWithFailover,
  getLLMConfigsFromHeaders,
  type LLMConfigEntry,
} from '@/lib/llm'
import { estimateCost } from '@/lib/cost-estimator'

// GET /api/materials/[id]/experiment
//
// Generates a detailed experiment plan for synthesizing the material by
// feeding its chemical formula, known synthesis method (from the
// classifications table), conditions, bandgap, and a few papers into the
// LLM. The plan is returned as Markdown.
//
// The result is cached in memory for 1 hour per material id. If the LLM call
// fails (rate-limit, network, etc.) a deterministic rule-based fallback plan
// is compiled from the material's formula + method so the UI always has
// something to show.
//
// Query params:
//   ?refresh=1  — bypass the cache and force a fresh LLM call.
//
// Response:
//   {
//     plan: string,             // Markdown experiment plan
//     generatedAt: string,      // ISO timestamp
//     source: 'llm' | 'fallback'
//   }

const EXPERIMENT_TTL_MS = 60 * 60 * 1000 // 1 hour

interface ExperimentData {
  materialName: string
  category: string
  method: string
  conditions: string
  bandgap: string
  efficiency: string
  papers: Array<{ title: string; year: number | null; abstract: string }>
}

/**
 * Fetch everything we need to write an experiment plan for `materialId`.
 * Picks the single highest-confidence classification that has at least one
 * useful field (method/conditions/bandgap/efficiency) to keep the prompt
 * bounded. Per-paper abstracts are also capped.
 */
async function fetchExperimentData(materialId: string): Promise<ExperimentData | null> {
  const material = await db.material.findUnique({
    where: { id: materialId },
    include: {
      papers: {
        orderBy: { year: 'desc' },
        take: 5,
        select: {
          title: true,
          year: true,
          abstract: true,
        },
      },
      classifications: {
        orderBy: { confidence: 'desc' },
        select: {
          synthesisMethod: true,
          conditions: true,
          bandgapValue: true,
          efficiencyValue: true,
          confidence: true,
        },
      },
    },
  })
  if (!material) return null

  // Pick the best classification with a method, fall back to the first one.
  const withMethod = material.classifications.find((c) => c.synthesisMethod)
  const best = withMethod || material.classifications[0]

  return {
    materialName: material.name,
    category: material.category,
    method: best?.synthesisMethod ?? '',
    conditions: best?.conditions ?? '',
    bandgap: best?.bandgapValue ?? '',
    efficiency: best?.efficiencyValue ?? '',
    papers: material.papers.map((p) => ({
      title: p.title,
      year: p.year,
      abstract: (p.abstract || '').slice(0, 600),
    })),
  }
}

/**
 * Build the LLM prompt and call the configured OpenAI-compatible backend via
 * `callLLMWithFailover` (which handles retry + multi-config failover).
 */
async function generateLLMPlan(
  data: ExperimentData,
  configs: LLMConfigEntry[],
): Promise<string> {
  const paperLines = data.papers
    .slice(0, 5)
    .map((p, i) => {
      const yr = p.year ? ` (${p.year})` : ''
      const abs = p.abstract ? ` — ${p.abstract}` : ''
      return `${i + 1}. ${p.title}${yr}${abs}`
    })
    .join('\n')

  const methodLine = data.method || 'not specified — pick the most common route from the literature above'
  const conditionsLine = data.conditions || 'not specified'
  const bandgapLine = data.bandgap || 'not reported'
  const efficiencyLine = data.efficiency || 'not reported'

  const prompt = `Generate a detailed experiment plan for synthesizing ${data.materialName}. Include: 1) Precursor materials and quantities (based on stoichiometry from the formula), 2) Step-by-step synthesis procedure (based on the known method: ${methodLine}), 3) Required equipment, 4) Safety precautions (especially for Pb/Sn/Cd containing materials), 5) Expected characterization results (XRD, UV-vis, etc.), 6) Estimated timeline. Format as Markdown.

Context:
- Formula: ${data.materialName}
- Category: ${data.category}
- Known synthesis method: ${methodLine}
- Known conditions: ${conditionsLine}
- Reported bandgap: ${bandgapLine} eV
- Reported device efficiency: ${efficiencyLine}%

Reference papers (title, year, abstract):
${paperLines || '(no papers indexed yet)'}

Use the formula to compute stoichiometric precursor ratios. Use the method to drive the procedure. Flag every toxic element in the formula with explicit safety guidance. Output ONLY the Markdown plan — no preamble, no closing remarks. Use these exact section headings in this order:

## 1. Precursor materials & quantities
## 2. Synthesis procedure
## 3. Required equipment
## 4. Safety precautions
## 5. Expected characterization results
## 6. Estimated timeline

Keep the whole plan under 800 words.`

  return callLLMWithFailover(
    [
      {
        role: 'system',
        content:
          'You are a meticulous materials-science synthesis planner. Always answer in Markdown with the exact section headings requested.',
      },
      { role: 'user', content: prompt },
    ],
    configs,
    { retries: 3, timeoutMs: 120_000 },
  )
}

/**
 * Compile a deterministic non-LLM experiment plan from the material's formula
 * + known method. Used when the LLM call fails or returns nothing useful.
 *
 * The plan covers the same six sections the LLM is asked for, but each section
 * is filled from rule-based heuristics: stoichiometric precursor ratios from
 * the parsed formula, equipment lists keyed off the synthesis method, safety
 * notes from the element list (Pb/Sn/Cd/etc.), characterization expectations
 * from the bandgap + category, and a timeline estimate from the method.
 */
function buildFallbackPlan(data: ExperimentData): string {
  const { materialName: formula, category, method, conditions, bandgap, efficiency } = data
  const cost = estimateCost(formula)

  // ── Section 1: precursors ──────────────────────────────────────────────
  const precursorLines = cost.elements
    .map((e) => {
      const grams = (e.gramsPerMole / (cost.molarMass || 1)) * 1.0 // 1 g target
      return `- ${e.name} (${e.symbol}): ${e.count.toFixed(2)} equiv. — ~${grams.toFixed(3)} g per 1 g of ${formula}`
    })
    .join('\n')

  // ── Section 2: procedure ───────────────────────────────────────────────
  const methodKey = (method || '').toLowerCase()
  let procedure: string
  if (methodKey.includes('spin') || methodKey.includes('solution') || methodKey.includes('sol-gel')) {
    procedure = [
      `1. Dry all precursors under vacuum at 80 °C for 12 h to remove residual moisture.`,
      `2. In a N₂-filled glovebox, dissolve the stoichiometric precursors above in DMF / DMSO (1:1 v/v, 1 mL total per 1 g target).`,
      `3. Stir at 60 °C for 30 min until a clear solution is obtained.`,
      `4. Filter the solution through a 0.45 µm PTFE syringe filter.`,
      `5. Spin-coat onto a cleaned substrate: 1000 rpm / 10 s (spread) + 4000 rpm / 30 s (thin).`,
      `6. Anneal on a hotplate at 100 °C for 10 min, then 150 °C for 20 min.`,
      ...(methodKey.includes('anti') || methodKey.includes('solvent')
        ? [`7. (Anti-solvent variant) Drop 200 µL chlorobenzene during the second spin step.`]
        : []),
    ].join('\n')
  } else if (methodKey.includes('solid') || methodKey.includes('ball') || methodKey.includes('milling')) {
    procedure = [
      `1. Weigh stoichiometric amounts of each precursor (see section 1).`,
      `2. Load into a zirconia milling jar with 5 mm balls (ball:powder ratio 10:1).`,
      `3. Mill under Ar for 4 h at 400 rpm (cycle: 30 min on / 5 min off).`,
      `4. Transfer the powder to an alumina crucible.`,
      `5. Cold-press at 5 MPa into a pellet (diameter 13 mm).`,
      `6. Sinter at 500–700 °C for 6–12 h (ramp 5 °C/min, air or Ar atmosphere).`,
    ].join('\n')
  } else if (methodKey.includes('cvd') || methodKey.includes('vapor') || methodKey.includes('sputter')) {
    procedure = [
      `1. Load precursor targets into the deposition chamber (sputtering / evaporation source).`,
      `2. Pump the chamber down to < 1×10⁻⁶ Torr.`,
      `3. (CVD) Heat precursors to their vapour-pressure temperature and transport with Ar / N₂ carrier gas at 50–200 sccm.`,
      `4. Deposit on a heated substrate (200–500 °C) for 30–90 min.`,
      `5. Cool to room temperature under vacuum before venting.`,
    ].join('\n')
  } else {
    procedure = [
      `1. Weigh stoichiometric amounts of each precursor (see section 1).`,
      `2. Combine in an appropriate solvent (water / ethanol / DMF depending on solubility) or as dry powders.`,
      `3. React under the conditions reported in the literature: ${conditions || 'heat at 100–200 °C for 2–4 h under inert atmosphere'}.`,
      `4. Isolate the product by filtration / centrifugation and wash with the reaction solvent.`,
      `5. Dry under vacuum at 60 °C for 12 h.`,
      `6. (Optional) Anneal at 150–300 °C under N₂ to improve crystallinity.`,
      `Note: no synthesis method was extracted from the indexed papers for ${formula} — the steps above are a generic route. Update the classifications table to refine.`,
    ].join('\n')
  }

  // ── Section 3: equipment ───────────────────────────────────────────────
  const equipment: string[] = [
    'Analytical balance (0.1 mg precision)',
    'N₂-filled glovebox (O₂ / H₂O < 1 ppm) — required for moisture-sensitive precursors',
    'Magnetic hotplate stirrer with temperature probe',
    '0.45 µm PTFE syringe filters',
    'Spin coater (for thin-film variants)',
    'Tube / muffle furnace (for sintering / annealing steps)',
    'XRD sample holder and powder diffraction instrument',
    'UV-vis spectrophotometer (for bandgap measurement)',
  ]
  if (methodKey.includes('ball') || methodKey.includes('milling')) {
    equipment.push('Planetary ball mill with zirconia jars and balls')
  }
  if (methodKey.includes('cvd') || methodKey.includes('vapor') || methodKey.includes('sputter')) {
    equipment.push('Vacuum deposition system with mass-flow controllers')
  }

  // ── Section 4: safety ──────────────────────────────────────────────────
  const safetyNotes: string[] = []
  if (cost.elements.some((e) => e.symbol === 'Pb')) {
    safetyNotes.push(
      '⚠️ Lead (Pb) is present — work in a fume hood, wear nitrile gloves and a lab coat at all times. Dispose of all Pb-containing waste in the dedicated heavy-metal waste stream; never pour down the drain.',
    )
  }
  if (cost.elements.some((e) => e.symbol === 'Sn')) {
    safetyNotes.push(
      '⚠️ Tin (Sn) compounds — especially organotins — are toxic. Avoid skin contact; SnI₂ is light-sensitive, store in the dark.',
    )
  }
  if (cost.elements.some((e) => e.symbol === 'Cd')) {
    safetyNotes.push(
      '⚠️ Cadmium (Cd) is highly toxic and carcinogenic. Use a closed system; Cd waste must be collected separately as hazardous.',
    )
  }
  if (cost.elements.some((e) => e.symbol === 'Cs')) {
    safetyNotes.push(
      '⚠️ Caesium (Cs) metal is pyrophoric; use only Cs salts (CsI, CsBr, Cs₂CO₃) and keep dry — Cs salts are hygroscopic.',
    )
  }
  if (cost.elements.some((e) => ['I', 'Br', 'Cl', 'F'].includes(e.symbol))) {
    safetyNotes.push(
      '⚠️ Halogen precursors (I₂, Br₂, HBr, HI) are corrosive and volatile. Handle in a fume hood; keep a reducing agent (sodium thiosulfate) nearby for spill neutralisation.',
    )
  }
  if (cost.elements.some((e) => e.symbol === 'Se' || e.symbol === 'Te')) {
    safetyNotes.push(
      '⚠️ Se / Te compounds are toxic and produce volatile hydrides; selenization / tellurization steps require a sealed tube or furnace with scrubber.',
    )
  }
  if (safetyNotes.length === 0) {
    safetyNotes.push(
      'No high-toxicity elements detected in the formula. Standard lab PPE (gloves, lab coat, safety glasses) is sufficient; consult the SDS of each precursor before starting.',
    )
  }
  safetyNotes.push(
    'Organic solvents (DMF, DMSO, chlorobenzene) are reproductive hazards — work in a fume hood and dispose of as halogenated / non-halogenated organic waste accordingly.',
  )

  // ── Section 5: characterization ────────────────────────────────────────
  const charLines: string[] = [
    `**XRD**: expect a ${category === 'perovskite' ? 'cubic / tetragonal perovskite' : category === 'chalcogenide' ? 'sphalerite / stannite' : category === 'oxide' ? 'rutile / perovskite-like oxide' : 'phase-pure crystalline'} pattern. Confirm against ICDD reference cards; absence of secondary peaks (> 2 %) indicates phase purity.`,
    `**UV-vis**: measure diffuse reflectance on a powder sample or transmittance on a thin film. Convert via the Kubelka-Munk or Tauc plot to extract the bandgap${bandgap ? ` (literature value: ${bandgap} eV)` : ''}.`,
  ]
  if (category === 'perovskite' || efficiency) {
    charLines.push(
      `**Photovoltaic performance**: if building a device stack (ITO / PTAA / perovskite / C60 / BCP / Ag), measure J-V curves under AM1.5G 100 mW/cm². Target PCE ${efficiency ? `≥ ${efficiency} % (literature)` : 'in line with literature for this composition'}.`,
    )
  }
  charLines.push(
    `**SEM / EDS**: verify film morphology (grain size, pinhole density) and confirm the elemental ratio matches the nominal stoichiometry within ±5 at%.`,
    `**PL / TRPL**: photoluminescence peak should match the bandgap-derived emission; long TRPL lifetimes (> 100 ns) indicate low non-radiative recombination.`,
  )

  // ── Section 6: timeline ────────────────────────────────────────────────
  const timeline: string[] = []
  if (methodKey.includes('spin') || methodKey.includes('solution')) {
    timeline.push('Day 1: precursor preparation and solution mixing (2 h)')
    timeline.push('Day 1: spin-coating + annealing (3 h)')
    timeline.push('Day 2: XRD + UV-vis characterization (3 h)')
    timeline.push('Day 3: device fabrication + J-V measurement (full day)')
  } else if (methodKey.includes('solid') || methodKey.includes('ball')) {
    timeline.push('Day 1: weighing + ball milling (5 h)')
    timeline.push('Day 2: pressing + sintering (8–12 h incl. ramp)')
    timeline.push('Day 3: powder XRD + density measurement (3 h)')
    timeline.push('Day 4: pellet polishing + property measurements (full day)')
  } else {
    timeline.push('Day 1: precursor preparation (2–4 h)')
    timeline.push('Day 2: synthesis reaction (4–8 h)')
    timeline.push('Day 3: product isolation + drying (full day)')
    timeline.push('Day 4: characterization (XRD, UV-vis, SEM)')
  }
  timeline.push('Buffer: +1–2 days for repeat runs if phase purity is insufficient on the first attempt.')

  return [
    `## 1. Precursor materials & quantities\n\nTo produce ~1 g of ${formula} (molar mass ${cost.molarMass.toFixed(2)} g/mol), use:\n\n${precursorLines}\n\n_Cost estimate: ~$${cost.costPerGram.toFixed(2)} / g of finished material (precursors only, ignoring solvent / labour). Availability: ${cost.availability}._`,
    `## 2. Synthesis procedure\n\n${procedure}`,
    `## 3. Required equipment\n\n${equipment.map((e) => `- ${e}`).join('\n')}`,
    `## 4. Safety precautions\n\n${safetyNotes.map((s) => `- ${s}`).join('\n')}`,
    `## 5. Expected characterization results\n\n${charLines.map((s) => `- ${s}`).join('\n')}`,
    `## 6. Estimated timeline\n\n${timeline.map((s) => `- ${s}`).join('\n')}`,
  ].join('\n\n')
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const configs = getLLMConfigsFromHeaders(req.headers)
  const refresh = new URL(req.url).searchParams.get('refresh') === '1'
  const cacheKey = `experiment:${id}`

  const result = await getOrSet(
    refresh ? `experiment:${id}:${Date.now()}` : cacheKey,
    EXPERIMENT_TTL_MS,
    async () => {
      const data = await fetchExperimentData(id)
      if (!data) {
        return { notFound: true } as const
      }

      let plan = ''
      let source: 'llm' | 'fallback' = 'fallback'
      try {
        const text = await generateLLMPlan(data, configs)
        if (text && /##\s*\d/.test(text)) {
          plan = text.trim()
          source = 'llm'
        }
      } catch (e) {
        // Swallow — we'll use the fallback below, but log the LLM failure
        // so degraded quality doesn't go unnoticed in production.
        console.warn('[experiment/plan] LLM plan generation failed, using fallback:', e)
      }

      if (!plan) {
        plan = buildFallbackPlan(data)
        source = 'fallback'
      }

      return {
        plan,
        generatedAt: new Date().toISOString(),
        source,
      }
    },
  )

  if ('notFound' in result && result.notFound) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  return NextResponse.json(result)
}
