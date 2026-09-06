// Material cost estimator (pure functions, no DB / network access).
//
// Used by /api/materials/[id]/cost to give a rough, rule-of-thumb cost estimate
// for synthesizing 1 gram of a material from its chemical formula. Two-stage:
//
//   1. parseFormula()  — split a formula string into element + count pairs,
//                         handling parenthesised groups, organic cation
//                         abbreviations (MA/FA/GA/BA/PEA), hydrates, and
//                         Ruddlesden-Popper-style "n" notation (treated as n=3).
//   2. estimateCost()  — combine the parsed counts with an embedded per-gram
//                         price table + atomic weights to compute a cost per
//                         gram of finished material, plus human-readable notes.
//
// All prices are approximate USD per gram of the pure element / reagent, sourced
// from common lab-supplier list prices (Sigma-Aldrich / Alfa Aesar ballpark).
// They are intentionally rough — the goal is to flag expensive elements (Cs,
// Ge, Ag, In) and toxic ones (Pb, Cd, Sn), not to give a procurement quote.

export interface ElementCost {
  symbol: string
  name: string
  count: number
  /** USD per gram of this pure element / pseudo-cation. */
  pricePerGram: number
  /** USD contribution to 1 mole of finished material (price × count × atomicWeight). */
  totalCost: number
  /** Mass in grams of this element per 1 mole of finished material. */
  gramsPerMole: number
}

export interface CostEstimate {
  /** Element / pseudo-cation breakdown. */
  elements: ElementCost[]
  /** Total cost in USD to produce 1 mole of finished material. */
  costPerMole: number
  /** Cost in USD to produce 1 gram of finished material. */
  totalCost: number
  /** Alias of totalCost — kept for symmetry with the spec. */
  costPerGram: number
  /** Molar mass of the finished material (g/mol). */
  molarMass: number
  /** Coarse availability bucket derived from the rarest element present. */
  availability: 'common' | 'rare' | 'very-rare'
  /** Human-readable notes (safety warnings, cost-saving suggestions, parse caveats). */
  notes: string[]
  /** True when the parser could not fully resolve the formula (estimate is rough). */
  estimated: boolean
}

// ── Price table (USD per gram of the pure element / pseudo-cation) ──────────
// Pseudo-cations (MA / FA / GA / BA / PEA) are treated as opaque "units" with
// their own per-gram price; their molar mass is included in ATOMIC_WEIGHTS so
// the cost-per-mole calculation stays consistent.
const PRICE_TABLE: Record<string, number> = {
  Pb: 0.02,
  Sn: 0.03,
  I: 0.05,
  Br: 0.04,
  Cl: 0.01,
  F: 0.02,
  Cs: 5.0,
  FA: 0.5,
  MA: 0.3,
  GA: 0.4,
  BA: 0.2,
  PEA: 0.6,
  Bi: 0.06,
  Sb: 0.05,
  Ag: 0.8,
  Cu: 0.01,
  Zn: 0.01,
  Ti: 0.05,
  O: 0.001,
  S: 0.005,
  Se: 0.07,
  Te: 0.3,
  Ge: 2.0,
  Si: 0.02,
  Ga: 0.3,
  In: 0.5,
  Al: 0.01,
  Fe: 0.005,
  Ni: 0.02,
  Co: 0.03,
  Mn: 0.01,
  Cd: 0.05,
  W: 0.05,
  Mo: 0.04,
  V: 0.05,
  Cr: 0.04,
  Nb: 0.2,
  Ta: 0.4,
  Li: 0.05,
  Na: 0.001,
  K: 0.005,
  Rb: 2.0,
  Sr: 0.05,
  Ba: 0.05,
  Ca: 0.005,
  Mg: 0.01,
  Y: 0.3,
  La: 0.1,
  Ce: 0.1,
  Nd: 0.2,
  Eu: 5.0,
  H: 0.001,
  C: 0.001,
  N: 0.001,
  P: 0.02,
  B: 0.05,
  As: 0.1,
}

// Atomic weights (g/mol) for every entry in PRICE_TABLE plus a few extras that
// commonly appear in formulas but don't have a price (we'll fall back to $0).
const ATOMIC_WEIGHT: Record<string, number> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011,
  N: 14.007, O: 15.999, F: 18.998, Ne: 20.18, Na: 22.99, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948,
  K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996,
  Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.96, Br: 79.904, Kr: 83.798,
  Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95,
  Tc: 98, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41,
  In: 114.82, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.9, Xe: 131.29,
  Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24,
  Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.5,
  Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05, Lu: 174.97, Hf: 178.49,
  Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08,
  Au: 196.97, Hg: 200.59, Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209,
  At: 210, Rn: 222, Fr: 223, Ra: 226,
  // Organic pseudo-cations (molar mass of the cation, not the iodide salt).
  MA: 32.06, // CH3NH3+
  FA: 46.06, // HC(NH2)2+
  GA: 76.07, // guanidinium C(NH2)3+
  BA: 88.15, // butylammonium C4H9NH3+
  PEA: 108.18, // phenethylammonium C6H5(CH2)2NH3+
}

// Element display names. Falls back to the symbol when unknown.
const ELEMENT_NAME: Record<string, string> = {
  H: 'Hydrogen', He: 'Helium', Li: 'Lithium', Be: 'Beryllium', B: 'Boron',
  C: 'Carbon', N: 'Nitrogen', O: 'Oxygen', F: 'Fluorine', Ne: 'Neon',
  Na: 'Sodium', Mg: 'Magnesium', Al: 'Aluminium', Si: 'Silicon', P: 'Phosphorus',
  S: 'Sulfur', Cl: 'Chlorine', Ar: 'Argon', K: 'Potassium', Ca: 'Calcium',
  Sc: 'Scandium', Ti: 'Titanium', V: 'Vanadium', Cr: 'Chromium', Mn: 'Manganese',
  Fe: 'Iron', Co: 'Cobalt', Ni: 'Nickel', Cu: 'Copper', Zn: 'Zinc', Ga: 'Gallium',
  Ge: 'Germanium', As: 'Arsenic', Se: 'Selenium', Br: 'Bromine', Kr: 'Krypton',
  Rb: 'Rubidium', Sr: 'Strontium', Y: 'Yttrium', Zr: 'Zirconium', Nb: 'Niobium',
  Mo: 'Molybdenum', Tc: 'Technetium', Ru: 'Ruthenium', Rh: 'Rhodium', Pd: 'Palladium',
  Ag: 'Silver', Cd: 'Cadmium', In: 'Indium', Sn: 'Tin', Sb: 'Antimony',
  Te: 'Tellurium', I: 'Iodine', Xe: 'Xenon', Cs: 'Cesium', Ba: 'Barium',
  La: 'Lanthanum', Ce: 'Cerium', Pr: 'Praseodymium', Nd: 'Neodymium',
  Pm: 'Promethium', Sm: 'Samarium', Eu: 'Europium', Gd: 'Gadolinium',
  Tb: 'Terbium', Dy: 'Dysprosium', Ho: 'Holmium', Er: 'Erbium', Tm: 'Thulium',
  Yb: 'Ytterbium', Lu: 'Lutetium', Hf: 'Hafnium', Ta: 'Tantalum', W: 'Tungsten',
  Re: 'Rhenium', Os: 'Osmium', Ir: 'Iridium', Pt: 'Platinum', Au: 'Gold',
  Hg: 'Mercury', Tl: 'Thallium', Pb: 'Lead', Bi: 'Bismuth', Po: 'Polonium',
  At: 'Astatine', Rn: 'Radon', Fr: 'Francium', Ra: 'Radium',
  MA: 'Methylammonium (CH₃NH₃⁺)',
  FA: 'Formamidinium (HC(NH₂)₂⁺)',
  GA: 'Guanidinium (C(NH₂)₃⁺)',
  BA: 'Butylammonium (C₄H₉NH₃⁺)',
  PEA: 'Phenethylammonium (C₆H₅(CH₂)₂NH₃⁺)',
}

// Elements flagged for safety reasons (toxic / regulated).
const TOXIC_ELEMENTS = new Set(['Pb', 'Cd', 'Hg', 'Tl', 'As', 'Sb', 'Sn', 'Se', 'Te'])

// Price thresholds for the availability bucket.
const RARE_PRICE = 0.5
const VERY_RARE_PRICE = 2.0

// Organic cation abbreviations recognised in formulas. Longest-first matching
// is used so "PEA" wins over "P" + "E" + "A".
const ORGANIC_ABBREVS = ['PEA', 'FA', 'MA', 'GA', 'BA']

/**
 * Token kinds produced by the formula tokenizer.
 * - `group`  — a parenthesised / bracketed sub-formula that was recursively
 *              expanded into a child token stream.
 * - `unit`   — an element symbol or organic cation abbreviation.
 * - `number` — a numeric multiplier.
 * - `sep`    — any other character (dots, commas, hyphens, etc.).
 */
type Token =
  | { kind: 'group'; tokens: Token[] }
  | { kind: 'unit'; symbol: string }
  | { kind: 'number'; value: number }
  | { kind: 'sep'; text: string }

/**
 * Pre-process a formula string before tokenization:
 *  - Strip whitespace.
 *  - Replace "·" / "." hydrate separators with explicit "+" so "CuSO4·5H2O"
 *    becomes "CuSO4+5H2O" (treated as a mixture — both parts counted).
 *  - Replace n-notation: substitute n=3 (a common Ruddlesden-Popper phase).
 *    E.g. "(BA)2(MA)n-1PbnI3n+1" → "(BA)2(MA)2Pb3I10".
 *  - Drop leading/trailing junk.
 *
 * Implementation note: organic cation abbreviations (MA/FA/GA/BA/PEA) contain
 * the letter "A" which would otherwise confuse the n-substitution regex (the
 * `\b` word boundary doesn't fire between `A` and `n`). We sidestep this by
 * first replacing each abbreviation with a non-letter placeholder
 * (`\u0001`…`\u0005`), doing the n-substitution, then restoring the
 * abbreviations.
 */
function preprocess(formula: string): { text: string; substituted: boolean } {
  let t = formula.trim()
  let substituted = false

  // Hydrate / mixture separators: "·", "•", "x" between formulas, "+"
  // Treat them as additive joins so both parts contribute to the element totals.
  // We keep "+" as the canonical join.
  t = t.replace(/[·•]/g, '+')
  // "·5H2O" → "+5H2O" already handled above (the · becomes +)
  // Collapse any "x" used as a multiplier separator (e.g. "5H2O x CuSO4")
  // — only when surrounded by digits / parens to avoid eating "x" in element
  // symbols (there are no lower-case x in element symbols).
  t = t.replace(/(\d|\))\s*[xX]\s*(\d|\()/g, '$1+$2')

  // ── Step 1: hide organic abbreviations behind non-letter placeholders ────
  // Sorted longest-first so PEA wins over P+E+A.
  const abbrPh: Array<{ abbr: string; ph: string }> = [
    { abbr: 'PEA', ph: '\u0005' },
    { abbr: 'FA', ph: '\u0002' },
    { abbr: 'MA', ph: '\u0001' },
    { abbr: 'GA', ph: '\u0003' },
    { abbr: 'BA', ph: '\u0004' },
  ]
  for (const { abbr, ph } of abbrPh) {
    t = t.replace(
      new RegExp(abbr + '(?=$|[0-9A-Z+\\-(){}\\[\\].·])', 'g'),
      ph,
    )
  }

  // ── Step 2: substitute n-notation (n=3) ─────────────────────────────────
  // After step 1, the only letters left in `t` are element symbols (one
  // uppercase + optional lowercase). We want to substitute standalone `n`
  // variables — these appear after a digit, `)`, `+`, `-`, or lowercase
  // letter (the second char of an element symbol like Pb, Sn, In — but NOT
  // the `n` IN `In`/`Sn` because that lowercase n is preceded by an
  // uppercase letter which is itself preceded by a non-letter).
  //
  // Concretely: substitute `n` when it is NOT preceded by an uppercase
  // letter. (Element symbols like `In`, `Sn`, `Nd`, `Np` start with an
  // uppercase letter, so the `n` inside them IS preceded by uppercase —
  // protected. Standalone `n` after digits, `)`, `+`, `-`, or lowercase
  // letters is a variable.)
  if (/n/i.test(t)) {
    substituted = true
    t = t.replace(
      /(?<![A-Z])(\d*)n(\s*([+\-*/])\s*(\d+))?/gi,
      (_m, k, _op2, op, n) => {
        const kn = k ? parseInt(k, 10) * 3 : 3
        if (op && n) {
          const nn = parseInt(n, 10)
          if (op === '+') return String(kn + nn)
          if (op === '-') return String(kn - nn)
          if (op === '*') return String(kn * nn)
          if (op === '/') return String(kn / nn)
        }
        return String(kn)
      },
    )
  }

  // ── Step 3: restore organic abbreviations ──────────────────────────────
  for (const { abbr, ph } of abbrPh) {
    t = t.split(ph).join(abbr)
  }

  // Strip stray characters that aren't element-related (commas, quotes, etc.)
  // but keep +, -, digits, parens, brackets, braces, dots and letters.
  t = t.replace(/[^A-Za-z0-9()+\-\[\]{}.]/g, '')

  return { text: t, substituted }
}

/**
 * Tokenize a (preprocessed) formula string into a flat list of tokens.
 * Recognises parenthesised groups as `group` tokens whose `tokens` field is
 * the recursively-tokenized inner content.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const sortedAbbrs = [...ORGANIC_ABBREVS].sort((a, b) => b.length - a.length)

  while (i < text.length) {
    const ch = text[i]

    // Parenthesised group (also handle [] and {}).
    if (ch === '(' || ch === '[' || ch === '{') {
      const close = ch === '(' ? ')' : ch === '[' ? ']' : '}'
      let depth = 1
      let j = i + 1
      while (j < text.length && depth > 0) {
        if (text[j] === ch) depth++
        else if (text[j] === close) depth--
        if (depth === 0) break
        j++
      }
      const inner = text.slice(i + 1, j)
      tokens.push({ kind: 'group', tokens: tokenize(inner) })
      i = j + 1
      continue
    }

    // Closing paren that escaped the group scan (shouldn't happen, but
    // tolerate gracefully).
    if (ch === ')' || ch === ']' || ch === '}') {
      i++
      continue
    }

    // "+" or "-" at a group boundary is a separator (mixture join or
    // arithmetic leftover). Treat as separator so the next number is parsed
    // cleanly.
    if (ch === '+' || ch === '-') {
      // Peek: if the next non-space chars form a number, attach the sign.
      const rest = text.slice(i)
      const m = rest.match(/^[-+]\d+(?:\.\d+)?/)
      if (m) {
        tokens.push({ kind: 'number', value: parseFloat(m[0]) })
        i += m[0].length
        continue
      }
      tokens.push({ kind: 'sep', text: ch })
      i++
      continue
    }

    // Number (count for the preceding unit/group, or a standalone mole count).
    if (/[0-9]/.test(ch)) {
      const m = text.slice(i).match(/^\d+(?:\.\d+)?/)
      if (m) {
        tokens.push({ kind: 'number', value: parseFloat(m[0]) })
        i += m[0].length
        continue
      }
    }

    // Organic abbreviation — only when followed by end, digit, uppercase
    // letter, or non-letter (so "MA" wins but "Mac" doesn't match).
    const rest = text.slice(i)
    const abbr = sortedAbbrs.find(
      (a) =>
        rest.startsWith(a) &&
        (rest.length === a.length || !/^[a-z]/.test(rest.slice(a.length))),
    )
    if (abbr) {
      tokens.push({ kind: 'unit', symbol: abbr })
      i += abbr.length
      continue
    }

    // Element symbol: one capital + optional lowercase.
    const elem = rest.match(/^([A-Z][a-z]?)/)
    if (elem) {
      tokens.push({ kind: 'unit', symbol: elem[1] })
      i += elem[0].length
      continue
    }

    // Anything else: separator.
    tokens.push({ kind: 'sep', text: ch })
    i++
  }

  return tokens
}

/**
 * Walk a token list and aggregate element counts. When a `group` token is
 * followed by a `number`, every element inside the group is multiplied by
 * that number. When a `unit` is followed by a `number`, the unit's count is
 * multiplied. Standalone numbers (e.g. a leading "5" in "5H2O") become a
 * multiplier for the next unit/group.
 *
 * Returns a Map<symbol, count> plus a `hadUnknown` flag indicating the parser
 * saw an unrecognized element symbol (the cost estimate will then be flagged
 * as `estimated: true`).
 */
function aggregate(
  tokens: Token[],
  multiplier = 1,
): { counts: Map<string, number>; hadUnknown: boolean } {
  const counts = new Map<string, number>()
  let hadUnknown = false

  // A pending multiplier to apply to the next unit/group. Default 1.
  let pendingMul = multiplier

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx]
    if (tok.kind === 'sep') {
      pendingMul = multiplier
      continue
    }
    if (tok.kind === 'number') {
      // If the previous token was a unit/group, this number is the count for
      // THAT token, not a pending multiplier. But since we already consumed
      // the unit/group via the pendingMul mechanism below, a number here is
      // actually a count for the previous unit. We handle that in the
      // unit/group branches by peeking at the next token, so a standalone
      // number here is a multiplier for the NEXT unit/group.
      pendingMul = tok.value * multiplier
      continue
    }
    if (tok.kind === 'unit') {
      // Peek at next token for a count multiplier.
      let mul = pendingMul
      const next = tokens[idx + 1]
      if (next && next.kind === 'number') {
        mul *= next.value
        idx++ // consume the count
      }
      if (!ATOMIC_WEIGHT[tok.symbol]) {
        hadUnknown = true
      }
      counts.set(tok.symbol, (counts.get(tok.symbol) || 0) + mul)
      pendingMul = multiplier
      continue
    }
    if (tok.kind === 'group') {
      let mul = pendingMul
      const next = tokens[idx + 1]
      if (next && next.kind === 'number') {
        mul *= next.value
        idx++
      }
      const inner = aggregate(tok.tokens, mul)
      for (const [sym, c] of inner.counts) {
        counts.set(sym, (counts.get(sym) || 0) + c)
      }
      if (inner.hadUnknown) hadUnknown = true
      pendingMul = multiplier
      continue
    }
  }

  return { counts, hadUnknown }
}

/**
 * Parse a chemical formula into element symbol → count pairs.
 *
 * Handles:
 *  - Simple formulas: "CsPbBr3", "PbI2"
 *  - Organic cation abbreviations: "MAPbI3", "FAPbBr3", "(PEA)2PbI4"
 *  - Parenthesised groups with multipliers: "(BA)2(MA)Pb2I6", "K2(SO4)2"
 *  - Hydrates / mixtures: "CuSO4·5H2O" (counts both parts)
 *  - Ruddlesden-Popper n-notation: "(BA)2(MA)n-1PbnI3n+1" → n=3
 *  - Decimal counts: "Ba0.5Sr0.5TiO3"
 *
 * Returns a map of symbol → total count per formula unit, plus an
 * `estimated` flag set true when (a) the n-notation was substituted, or
 * (b) an unknown element symbol was encountered.
 */
export function parseFormula(
  formula: string,
): { counts: Map<string, number>; estimated: boolean } {
  if (!formula || !formula.trim()) {
    return { counts: new Map(), estimated: false }
  }
  const { text, substituted } = preprocess(formula)
  const tokens = tokenize(text)
  const { counts, hadUnknown } = aggregate(tokens)
  return { counts, estimated: substituted || hadUnknown }
}

/**
 * Estimate the cost of producing 1 gram of a material from its chemical
 * formula. See module docstring for the algorithm.
 *
 * Always returns a result — never throws. If the formula can't be parsed at
 * all (no recognisable elements), `elements` will be empty and `totalCost`
 * will be 0 with a note explaining what happened.
 */
export function estimateCost(formula: string): CostEstimate {
  const notes: string[] = []
  const { counts, estimated } = parseFormula(formula)

  if (counts.size === 0) {
    return {
      elements: [],
      costPerMole: 0,
      totalCost: 0,
      costPerGram: 0,
      molarMass: 0,
      availability: 'common',
      notes: [
        `Could not parse any elements from "${formula}". ` +
          'Check that the formula uses standard chemical notation (e.g. CsPbBr3, MAPbI3).',
      ],
      estimated: true,
    }
  }

  const elements: ElementCost[] = []
  let costPerMole = 0
  let molarMass = 0
  let maxPrice = 0

  for (const [symbol, count] of counts) {
    const atomicWeight = ATOMIC_WEIGHT[symbol] ?? 0
    const pricePerGram = PRICE_TABLE[symbol] ?? 0
    const gramsPerMole = count * atomicWeight
    const totalCost = gramsPerMole * pricePerGram
    elements.push({
      symbol,
      name: ELEMENT_NAME[symbol] || symbol,
      count,
      pricePerGram,
      totalCost,
      gramsPerMole,
    })
    costPerMole += totalCost
    molarMass += gramsPerMole
    if (pricePerGram > maxPrice) maxPrice = pricePerGram
  }

  elements.sort((a, b) => b.totalCost - a.totalCost)

  const costPerGram = molarMass > 0 ? costPerMole / molarMass : 0

  // Availability bucket from the most expensive element present.
  let availability: CostEstimate['availability'] = 'common'
  if (maxPrice >= VERY_RARE_PRICE) availability = 'very-rare'
  else if (maxPrice >= RARE_PRICE) availability = 'rare'

  // Safety notes (toxic elements).
  const toxicPresent = elements.filter((e) => TOXIC_ELEMENTS.has(e.symbol))
  for (const e of toxicPresent) {
    const warnings: Record<string, string> = {
      Pb: 'Contains Pb — handle with care, dispose as hazardous waste',
      Cd: 'Contains Cd — highly toxic, restricted under RoHS',
      Hg: 'Contains Hg — highly toxic volatile metal',
      Tl: 'Contains Tl — extremely toxic, use gloves + fume hood',
      As: 'Contains As — toxic, carcinogenic',
      Sb: 'Contains Sb — toxic in powder form',
      Sn: 'Contains Sn — organotin compounds are toxic',
      Se: 'Contains Se — toxic in large doses, volatile above 200°C',
      Te: 'Contains Te — toxic, garlic-odour breath indicates exposure',
    }
    notes.push(warnings[e.symbol] || `Contains ${e.symbol} — check SDS before handling`)
  }

  // Cost-saving suggestion for expensive elements.
  const expensive = elements.filter((e) => e.pricePerGram >= VERY_RARE_PRICE)
  for (const e of expensive) {
    const suggestions: Record<string, string> = {
      Cs: 'Cs is expensive — consider FA or MA as a cheaper A-site cation',
      Ge: 'Ge is expensive — consider Si or Sn as a group-14 alternative',
      Eu: 'Eu is expensive — rare-earth dopant, omit unless essential',
      Rb: 'Rb is expensive — consider K or Cs partial substitution',
      Ag: 'Ag is expensive — consider Cu as a cheaper noble-metal alternative',
      In: 'In is expensive — consider Zn or Ga as a group-13 alternative',
      Ta: 'Ta is expensive — consider Nb as a group-5 alternative',
    }
    const tip = suggestions[e.symbol]
    if (tip) notes.push(tip)
  }

  // General parse caveats.
  if (estimated) {
    notes.push(
      'Formula contained n-notation or unknown elements — estimate is approximate (n was set to 3).',
    )
  }
  if (molarMass === 0) {
    notes.push('Could not compute molar mass (no recognised atomic weights).')
  }

  // Sanity bounds — if the parser somehow produced NaN / Infinity, zero them.
  const safeCostPerMole = Number.isFinite(costPerMole) ? costPerMole : 0
  const safeMolarMass = Number.isFinite(molarMass) ? molarMass : 0
  const safeCostPerGram = Number.isFinite(costPerGram) ? costPerGram : 0

  return {
    elements,
    costPerMole: safeCostPerMole,
    totalCost: safeCostPerGram,
    costPerGram: safeCostPerGram,
    molarMass: safeMolarMass,
    availability,
    notes,
    estimated,
  }
}
