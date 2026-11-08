import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Subset of element symbols used in material-science context.
const KNOWN_ELEMENTS: Record<string, string> = {
  H: 'Hydrogen', He: 'Helium', Li: 'Lithium', Be: 'Beryllium', B: 'Boron', C: 'Carbon',
  N: 'Nitrogen', O: 'Oxygen', F: 'Fluorine', Ne: 'Neon', Na: 'Sodium', Mg: 'Magnesium',
  Al: 'Aluminium', Si: 'Silicon', P: 'Phosphorus', S: 'Sulfur', Cl: 'Chlorine', Ar: 'Argon',
  K: 'Potassium', Ca: 'Calcium', Sc: 'Scandium', Ti: 'Titanium', V: 'Vanadium', Cr: 'Chromium',
  Mn: 'Manganese', Fe: 'Iron', Co: 'Cobalt', Ni: 'Nickel', Cu: 'Copper', Zn: 'Zinc',
  Ga: 'Gallium', Ge: 'Germanium', As: 'Arsenic', Se: 'Selenium', Br: 'Bromine', Kr: 'Krypton',
  Rb: 'Rubidium', Sr: 'Strontium', Y: 'Yttrium', Zr: 'Zirconium', Nb: 'Niobium', Mo: 'Molybdenum',
  Tc: 'Technetium', Ru: 'Ruthenium', Rh: 'Rhodium', Pd: 'Palladium', Ag: 'Silver', Cd: 'Cadmium',
  In: 'Indium', Sn: 'Tin', Sb: 'Antimony', Te: 'Tellurium', I: 'Iodine', Xe: 'Xenon',
  Cs: 'Cesium', Ba: 'Barium', La: 'Lanthanum', Ce: 'Cerium', Pr: 'Praseodymium', Nd: 'Neodymium',
  Pm: 'Promethium', Sm: 'Samarium', Eu: 'Europium', Gd: 'Gadolinium', Tb: 'Terbium',
  Dy: 'Dysprosium', Ho: 'Holmium', Er: 'Erbium', Tm: 'Thulium', Yb: 'Ytterbium', Lu: 'Lutetium',
  Hf: 'Hafnium', Ta: 'Tantalum', W: 'Tungsten', Re: 'Rhenium', Os: 'Osmium', Ir: 'Iridium',
  Pt: 'Platinum', Au: 'Gold', Hg: 'Mercury', Tl: 'Thallium', Pb: 'Lead', Bi: 'Bismuth',
  Po: 'Polonium', At: 'Astatine', Rn: 'Radon', Fr: 'Francium', Ra: 'Radium',
}

const METALS = new Set([
  'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni',
  'Cu', 'Zn', 'Ga', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
  'In', 'Sn', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho',
  'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb',
  'Bi', 'Po', 'Fr', 'Ra',
])
const HALOGENS = new Set(['F', 'Cl', 'Br', 'I', 'At'])

// Common organic cation abbreviations used in perovskite formulas.
const ABBREVS = ['MA', 'FA', 'GA', 'BA', 'PEA']

type Token =
  | { kind: 'element'; symbol: string; count: string }
  | { kind: 'organic'; text: string }
  | { kind: 'number'; text: string }
  | { kind: 'sep'; text: string }

function tokenize(formula: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const sorted = [...ABBREVS].sort((a, b) => b.length - a.length)

  while (i < formula.length) {
    const rest = formula.slice(i)
    // Match an organic abbreviation only if followed by end-of-string, digit,
    // uppercase letter, or non-letter — never a lowercase letter (which would
    // indicate the start of a multi-letter element symbol like "Ag" or "Na").
    const abbr = sorted.find(
      (g) =>
        rest.startsWith(g) &&
        (rest.length === g.length || !/^[a-z]/.test(rest.slice(g.length))),
    )
    if (abbr) {
      tokens.push({ kind: 'organic', text: abbr })
      i += abbr.length
      continue
    }
    const elem = rest.match(/^([A-Z][a-z]?)(\d*(?:\.\d+)?)/)
    if (elem) {
      tokens.push({ kind: 'element', symbol: elem[1], count: elem[2] || '' })
      i += elem[0].length
      continue
    }
    const num = rest.match(/^\d+(?:\.\d+)?/)
    if (num) {
      tokens.push({ kind: 'number', text: num[0] })
      i += num[0].length
      continue
    }
    tokens.push({ kind: 'sep', text: rest[0] })
    i++
  }
  return tokens
}

function categoryOf(symbol: string): string {
  if (METALS.has(symbol)) return 'metal'
  if (HALOGENS.has(symbol)) return 'halogen'
  if (symbol === 'C') return 'carbon'
  if (symbol === 'H') return 'hydrogen'
  if (symbol === 'N') return 'nitrogen'
  if (symbol === 'O') return 'oxygen'
  if (symbol === 'S' || symbol === 'Se' || symbol === 'Te' || symbol === 'Po') return 'chalcogen'
  if (symbol === 'P' || symbol === 'As' || symbol === 'Sb') return 'pnictogen'
  if (symbol === 'B') return 'metalloid'
  return 'other'
}

// GET /api/materials/[id]/formula — returns the formula string + parsed structure
// (tokens + aggregated element list with counts/categories). Useful for SVG rendering.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const material = await db.material.findUnique({
    where: { id },
    select: { id: true, name: true, aliases: true },
  })

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const formula = material.name
  const tokens = tokenize(formula)

  // Aggregate element counts (treating organic abbreviations as opaque units)
  const agg = new Map<string, number>()
  for (const tok of tokens) {
    if (tok.kind === 'element' && KNOWN_ELEMENTS[tok.symbol]) {
      const c = parseFloat(tok.count || '1')
      agg.set(tok.symbol, (agg.get(tok.symbol) || 0) + (isNaN(c) ? 1 : c))
    }
  }

  const elements = Array.from(agg.entries())
    .map(([symbol, count]) => ({
      symbol,
      name: KNOWN_ELEMENTS[symbol] || symbol,
      count,
      category: categoryOf(symbol),
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    id: material.id,
    formula,
    aliases: material.aliases,
    tokens,
    elements,
  })
}
