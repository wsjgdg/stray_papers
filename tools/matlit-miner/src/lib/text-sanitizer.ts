// Text sanitization for paper titles/abstracts from external sources.
//
// Different scholarly APIs return text in inconsistent shapes:
//  - CrossRef: returns clean UTF-8 text (no entities, no tags)
//  - arXiv: returns XML-decoded text (so "<" appears literally)
//  - Europe PMC: returns HTML-entity-encoded text (so "&lt;sub&gt;" appears literally)
//  - Semantic Scholar: returns clean text
//  - OpenAlex: returns clean text but sometimes with residual HTML
//
// This module normalizes all of them to safe, plain-text strings with
// Unicode subscripts/superscripts where appropriate (e.g. PbI3 → PbI₃).

/**
 * Decode HTML entities to their character equivalents.
 * Handles named entities (&lt; &gt; &amp; &quot; &apos;) and numeric (&#123; &#x1F4A9;).
 */
export function decodeHtmlEntities(s: string): string {
  if (!s) return ''
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&times;/g, '×')
    .replace(/&divide;/g, '÷')
    .replace(/&plusmn;/g, '±')
    .replace(/&deg;/g, '°')
    .replace(/&micro;/g, 'µ')
    .replace(/&alpha;/g, 'α')
    .replace(/&beta;/g, 'β')
    .replace(/&gamma;/g, 'γ')
    .replace(/&delta;/g, 'δ')
    .replace(/&epsilon;/g, 'ε')
    .replace(/&theta;/g, 'θ')
    .replace(/&lambda;/g, 'λ')
    .replace(/&mu;/g, 'μ')
    .replace(/&pi;/g, 'π')
    .replace(/&sigma;/g, 'σ')
    .replace(/&omega;/g, 'ω')
    .replace(/&amp;/g, '&')
}

/**
 * Strip all HTML tags from a string (after decoding entities).
 * Preserves the inner text of <sub>/<sup>/<i> tags by converting to Unicode
 * subscripts/superscripts where possible, or just removing the tag otherwise.
 */
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
}
const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
}

function toSubscript(s: string): string {
  return Array.from(s).map(c => SUBSCRIPT_MAP[c] || c).join('')
}
function toSuperscript(s: string): string {
  return Array.from(s).map(c => SUPERSCRIPT_MAP[c] || c).join('')
}

/**
 * Convert simple inline HTML markup to Unicode-styled plain text.
 * - <sub>3</sub> → ₃
 * - <sup>2</sup> → ²
 * - <i>word</i> → word (italics lost, but text preserved)
 * - <b>word</b> → word
 * - All other tags stripped.
 */
function convertInlineMarkup(decoded: string): string {
  let s = decoded
  // Convert <sub>...</sub> to Unicode subscripts
  s = s.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, inner) => toSubscript(inner))
  // Convert <sup>...</sup> to Unicode superscripts
  s = s.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner) => toSuperscript(inner))
  // Strip all other HTML tags (keep inner text)
  s = s.replace(/<[^>]+>/g, '')
  return s
}

/**
 * Sanitize a paper title or abstract for display.
 * 1. Decode HTML entities (so "&lt;sub&gt;3&lt;/sub&gt;" becomes "<sub>3</sub>")
 * 2. Convert inline markup to Unicode (so "<sub>3</sub>" becomes "₃")
 * 3. Collapse whitespace
 *
 * The result is safe to render as plain React text (no dangerouslySetInnerHTML).
 */
export function sanitizePaperText(s: string): string {
  if (!s) return ''
  const decoded = decodeHtmlEntities(s)
  const converted = convertInlineMarkup(decoded)
  return converted
    .replace(/\s+/g, ' ')
    .trim()
}
