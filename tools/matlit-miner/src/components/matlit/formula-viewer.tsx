'use client'

import { cn } from '@/lib/utils'

// Common organic cation abbreviations used in perovskite formulas (rendered
// as a single token without subscripts — the abbreviation is opaque).
const ABBREVS = ['MA', 'FA', 'GA', 'BA', 'PEA']

const METALS = new Set([
  'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni',
  'Cu', 'Zn', 'Ga', 'Ge', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag',
  'Cd', 'In', 'Sn', 'Sb', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb',
  'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'Fr', 'Ra',
])
const HALOGENS = new Set(['F', 'Cl', 'Br', 'I', 'At'])

function elementColor(symbol: string, colorful: boolean): string {
  if (!colorful) return ''
  if (METALS.has(symbol)) return 'text-rose-600 dark:text-rose-400'
  if (HALOGENS.has(symbol)) return 'text-emerald-600 dark:text-emerald-400'
  if (symbol === 'C') return 'text-slate-700 dark:text-slate-300'
  if (symbol === 'H') return 'text-amber-600 dark:text-amber-400'
  if (symbol === 'N') return 'text-purple-600 dark:text-purple-400'
  if (symbol === 'O') return 'text-red-600 dark:text-red-400'
  if (symbol === 'S' || symbol === 'Se' || symbol === 'Te' || symbol === 'Po')
    return 'text-teal-600 dark:text-teal-400'
  if (symbol === 'P' || symbol === 'As')
    return 'text-pink-600 dark:text-pink-400'
  if (symbol === 'B') return 'text-orange-600 dark:text-orange-400'
  if (symbol === 'Si') return 'text-stone-600 dark:text-stone-400'
  return ''
}

type Token =
  | { kind: 'element'; symbol: string; count: string }
  | { kind: 'organic'; text: string }
  | { kind: 'number'; text: string }
  | { kind: 'sep'; text: string }

export function tokenizeFormula(formula: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const sorted = [...ABBREVS].sort((a, b) => b.length - a.length)

  while (i < formula.length) {
    const rest = formula.slice(i)
    // Match an abbreviation only if not followed by a lowercase letter
    // (avoids mis-parsing "Mg", "Na" etc as abbreviations).
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

const SIZE_CLASS: Record<string, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl font-bold',
}

export interface FormulaViewerProps {
  formula: string
  size?: 'sm' | 'md' | 'lg'
  colorful?: boolean
  className?: string
}

export function FormulaViewer({
  formula,
  size = 'md',
  colorful = true,
  className,
}: FormulaViewerProps) {
  const tokens = tokenizeFormula(formula || '')

  return (
    <span
      className={cn(
        'font-mono tabular-nums leading-none inline-flex items-baseline flex-wrap',
        SIZE_CLASS[size],
        className,
      )}
    >
      {tokens.length === 0 ? (
        <span className="text-slate-400">—</span>
      ) : (
        tokens.map((tok, idx) => {
          if (tok.kind === 'element') {
            return (
              <span key={idx}>
                <span className={elementColor(tok.symbol, colorful)}>
                  {tok.symbol}
                </span>
                {tok.count && (
                  <sub className="text-[0.65em] opacity-90 ml-[-0.1em]">
                    {tok.count}
                  </sub>
                )}
              </span>
            )
          }
          if (tok.kind === 'organic') {
            return (
              <span
                key={idx}
                className={
                  colorful
                    ? 'text-slate-700 dark:text-slate-300 font-semibold'
                    : ''
                }
              >
                {tok.text}
              </span>
            )
          }
          if (tok.kind === 'number') {
            return (
              <sub key={idx} className="text-[0.65em] opacity-90 ml-[-0.1em]">
                {tok.text}
              </sub>
            )
          }
          return <span key={idx}>{tok.text}</span>
        })
      )}
    </span>
  )
}

export default FormulaViewer
