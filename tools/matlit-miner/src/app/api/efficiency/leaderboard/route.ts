import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/efficiency/leaderboard
// Returns the user's best efficiency records alongside curated NREL world
// records for common PV technologies, plus per-material gaps.
// Response shape:
// {
//   userRecords: [{ materialId, name, efficiency, certified, year }],
//   worldRecords: [{ category, technology, efficiency, year, source }],
//   gaps: [{ materialName, userEff, worldRecord, gap, technology }]
// }

export interface UserEffRecord {
  materialId: string
  name: string
  efficiency: number
  certified: boolean
  year: number | null
}

export interface WorldRecord {
  category: string
  technology: string
  efficiency: number
  year: number
  source: string
}

export interface EffGap {
  materialName: string
  userEff: number
  worldRecord: number
  gap: number
  technology: string
  beatsRecord: boolean
}

// Curated NREL best-cell efficiencies (2024 chart, single-junction unless noted).
// Source: NREL Best Research-Cell Efficiency Chart (public domain reference data).
const WORLD_RECORDS: WorldRecord[] = [
  {
    category: 'perovskite',
    technology: 'Perovskite (single junction)',
    efficiency: 26.1,
    year: 2024,
    source: 'NREL Best Research-Cell',
  },
  {
    category: 'perovskite-tandem',
    technology: 'Perovskite–Silicon tandem',
    efficiency: 33.9,
    year: 2024,
    source: 'NREL Best Research-Cell',
  },
  {
    category: 'perovskite-mapi',
    technology: 'Perovskite (MAPbI3 specifically)',
    efficiency: 25.7,
    year: 2024,
    source: 'NREL Best Research-Cell',
  },
  {
    category: 'cigs',
    technology: 'CIGS',
    efficiency: 23.6,
    year: 2019,
    source: 'NREL Best Research-Cell',
  },
  {
    category: 'cdte',
    technology: 'CdTe',
    efficiency: 22.3,
    year: 2022,
    source: 'NREL Best Research-Cell',
  },
  {
    category: 'opv',
    technology: 'Organic PV',
    efficiency: 19.2,
    year: 2024,
    source: 'NREL Best Research-Cell',
  },
  {
    category: 'dssc',
    technology: 'DSSC',
    efficiency: 14.3,
    year: 2014,
    source: 'NREL Best Research-Cell',
  },
]

// Match a material name to a world-record technology category.
// Priority: tandem → MAPbI3 → perovskite → CIGS → CdTe → OPV → DSSC → null.
function matchTechnology(name: string): { category: string; technology: WorldRecord } | null {
  const n = name.toLowerCase()
  // Tandem (perovskite + silicon)
  if (
    (n.includes('perovsk') || n.includes('mapb') || n.includes('csb')) &&
    (n.includes('si') || n.includes('silicon') || n.includes('tandem') || n.includes('monolith'))
  ) {
    const wr = WORLD_RECORDS.find((w) => w.category === 'perovskite-tandem')
    return wr ? { category: 'perovskite-tandem', technology: wr } : null
  }
  // MAPbI3 specifically
  if (n.includes('mapb') || n.includes('ch3nh3pb') || n.includes('methylammonium')) {
    const wr = WORLD_RECORDS.find((w) => w.category === 'perovskite-mapi')
    return wr ? { category: 'perovskite-mapi', technology: wr } : null
  }
  // Generic perovskite
  if (n.includes('perovsk') || n.includes('csb') || n.includes('formamid') || n.includes('fapb')) {
    const wr = WORLD_RECORDS.find((w) => w.category === 'perovskite')
    return wr ? { category: 'perovskite', technology: wr } : null
  }
  // CIGS
  if (
    n.includes('cigs') ||
    n.includes('cuin') ||
    n.includes('copper indium') ||
    n.includes('copper-indium') ||
    n.includes('copper indium gallium') ||
    n.includes('cu(in') ||
    n.includes('cu( in')
  ) {
    const wr = WORLD_RECORDS.find((w) => w.category === 'cigs')
    return wr ? { category: 'cigs', technology: wr } : null
  }
  // CdTe
  if (n.includes('cdte') || n.includes('cadmium telluride') || n.includes('cd-te')) {
    const wr = WORLD_RECORDS.find((w) => w.category === 'cdte')
    return wr ? { category: 'cdte', technology: wr } : null
  }
  // Organic PV
  if (
    n.includes('organic') ||
    n.includes('opv') ||
    n.includes('polymer') ||
    n.includes('ptb7') ||
    n.includes('pcbm') ||
    n.includes('fullerene') ||
    n.includes('non-fullerene') ||
    n.includes('nfa')
  ) {
    const wr = WORLD_RECORDS.find((w) => w.category === 'opv')
    return wr ? { category: 'opv', technology: wr } : null
  }
  // DSSC
  if (
    n.includes('dssc') ||
    n.includes('dye-sensitized') ||
    n.includes('dye sensitized') ||
    n.includes('dye-sensitised') ||
    n.includes('titania dye') ||
    n.includes('ru-bpy') ||
    n.includes('n719')
  ) {
    const wr = WORLD_RECORDS.find((w) => w.category === 'dssc')
    return wr ? { category: 'dssc', technology: wr } : null
  }
  return null
}

// Improvement tips per category (used by the frontend "How to improve" section).
export const IMPROVEMENT_TIPS: Record<string, { en: string; zh: string }> = {
  perovskite: {
    en: 'Reduce non-radiative recombination via interface passivation (e.g. phenethylammonium bromide). Improve crystallinity through anti-solvent quenching and compositional engineering (mixed-cation/mixed-halide). Minimize hysteresis with proper transport layers.',
    zh: '通过界面钝化（如苯乙胺溴）降低非辐射复合；通过反溶剂淬火与组分工程（混合阳离子/混合卤化物）改善结晶度；优化传输层以减小迟滞。',
  },
  'perovskite-tandem': {
    en: 'Optimize the recombination layer (tunnel junction or ITO) between subcells. Match the current densities of top and bottom cells. Improve the transparency of the top cell to boost bottom-cell photocurrent.',
    zh: '优化子电池之间的复合层（隧穿结或 ITO）；匹配顶电池与底电池的电流密度；提升顶电池透明度以增加底电池光电流。',
  },
  'perovskite-mapi': {
    en: 'Stabilize the α-phase at room temperature via Cs/FA doping. Passivate grain boundaries with Lewis bases. Encapsulate against moisture and oxygen to suppress degradation.',
    zh: '通过 Cs/FA 掺杂在室温下稳定 α 相；用路易斯碱钝化晶界；加强封装以抑制水分/氧气降解。',
  },
  cigs: {
    en: 'Apply alkali post-deposition treatment (K, Na PDT). Engineer a double Ga-gradient (back-notch) for V_oc. Reduce interface recombination at the buffer/CdS layer.',
    zh: '采用碱金属后处理（K、Na PDT）；设计双 Ga 梯度（背场凹槽）提升 V_oc；降低 buffer/CdS 界面复合。',
  },
  cdte: {
    en: 'Replace Cu back-contact with a stable hole-selective layer (e.g. ZnTe:Cu or Se-alloyed). Reduce deep-level defects via Cl activation and CdCl2 anneal. Engineer the back interface for higher V_oc.',
    zh: '用稳定空穴选择层（如 ZnTe:Cu 或 Se 合金）替代 Cu 背接触；通过 Cl 激活与 CdCl2 退火减少深能级缺陷；优化背界面以提升 V_oc。',
  },
  opv: {
    en: 'Adopt state-of-the-art Y-series non-fullerene acceptors (Y6, L8-BO). Optimize donor:acceptor morphology via solvent additives. Reduce energetic disorder and triplet formation.',
    zh: '采用最新 Y 系列非富勒烯受体（Y6、L8-BO）；通过溶剂添加剂优化 donor:acceptor 形貌；降低能量无序与三线态形成。',
  },
  dssc: {
    en: 'Replace the iodide/triiodide electrolyte with a cobalt(bpy)3 redox couple for higher V_oc. Broaden spectral absorption with cosensitizers (porphyrin + organic). Reduce TiO2/electrolyte recombination via TiCl4 treatment.',
    zh: '以钴联吡啶氧化还原对替代碘/三碘化物电解质以提升 V_oc；用共敏化剂（卟啉+有机染料）拓宽光谱吸收；通过 TiCl4 处理降低 TiO2/电解质复合。',
  },
}

export async function GET() {
  // Fetch all efficiency records with their material name.
  const records = await db.efficiency.findMany({
    include: { material: { select: { name: true, id: true } } },
    orderBy: { efficiencyValue: 'desc' },
  })

  // Collapse to the best efficiency per material.
  const bestPerMaterial = new Map<string, UserEffRecord>()
  for (const r of records) {
    const existing = bestPerMaterial.get(r.materialId)
    if (!existing || r.efficiencyValue > existing.efficiency) {
      bestPerMaterial.set(r.materialId, {
        materialId: r.materialId,
        name: r.material.name,
        efficiency: r.efficiencyValue,
        certified: r.certified,
        year: r.year,
      })
    }
  }
  const userRecords = Array.from(bestPerMaterial.values()).sort(
    (a, b) => b.efficiency - a.efficiency,
  )

  // Compute gaps: for each user material, match to a world record category.
  const gaps: EffGap[] = []
  for (const rec of userRecords) {
    const match = matchTechnology(rec.name)
    if (!match) continue
    const worldRecord = match.technology.efficiency
    const gap = worldRecord - rec.efficiency
    gaps.push({
      materialName: rec.name,
      userEff: rec.efficiency,
      worldRecord,
      gap,
      technology: match.technology.technology,
      beatsRecord: rec.efficiency > worldRecord,
    })
  }

  return NextResponse.json({
    userRecords,
    worldRecords: WORLD_RECORDS,
    gaps,
  })
}
