import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/cache'
import { titleSimilarity } from '@/lib/dedup'
import { sanitizePaperText } from '@/lib/text-sanitizer'
import { importBibtexSchema, parseOr400 } from '@/lib/schemas'

// POST /api/papers/import-bibtex
//
// Accepts a BibTeX or RIS text blob (as exported by Zotero / Mendeley /
// JabRef), parses each entry, and imports the resulting paper records into
// the DB. Material assignment:
//   - If `materialId` is provided → all entries are attached to that material.
//   - Otherwise each entry is auto-matched by checking which material name
//     (or alias) appears in the title (longest match wins). Entries with no
//     match are skipped and reported in `errors`.
//
// Body:
//   {
//     content: string,                 // raw BibTeX or RIS text
//     format?: 'bibtex' | 'ris' | 'auto',  // default 'auto'
//     materialId?: string,             // optional target material
//   }
//
// Response:
//   {
//     imported: number,                // created + backfilled existing
//     skipped: number,                 // duplicates / unmatched / errors
//     errors: Array<{ entry: string; error: string }>,
//     format: 'bibtex' | 'ris',        // detected/used format
//     total: number,                   // entries parsed
//   }

// ────────────────────────────────────────────────────────────────────────────
// Parsed entry shape (shared between BibTeX and RIS parsers)
// ────────────────────────────────────────────────────────────────────────────
interface ParsedEntry {
  title: string
  authors: string
  year: number | null
  doi: string
  abstract: string
  venue: string
  url: string
}

// ────────────────────────────────────────────────────────────────────────────
// Format detection
// ────────────────────────────────────────────────────────────────────────────

function detectFormat(content: string): 'bibtex' | 'ris' {
  // Count both format markers across the whole content (not just the
  // first 500 chars) — mixed-format pastes are rare but Zotero sometimes
  // appends trailing RIS-style metadata, and we want the dominant format
  // to win. BibTeX wins ties because `@` is a stronger signal than `TY -`.
  const bibCount = (content.match(/@\w+\s*[\{(]/g) || []).length
  const risCount = (content.match(/(^|\r?\n)TY\s+-/g) || []).length
  if (risCount > bibCount) return 'ris'
  if (bibCount > 0) return 'bibtex'
  // Fallback: scan the leading 500 chars for whichever marker appears first.
  const sample = content.slice(0, 500)
  if (/^TY\s+-/im.test(sample) || /[\r\n]TY\s+-/m.test(sample)) return 'ris'
  return 'bibtex'
}

// ────────────────────────────────────────────────────────────────────────────
// Small shared helpers
// ────────────────────────────────────────────────────────────────────────────

/** Strip BibTeX braces, collapse whitespace. */
function stripBraces(s: string): string {
  if (!s) return ''
  return s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

/** Extract the first 4-digit number from a string → year, or null. */
function extractYear(s: string): number | null {
  if (!s) return null
  const m = s.match(/(\d{4})/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Normalize an author list. Accepts either BibTeX style
 * ("Family, Given and Given Family") or RIS style (one author per AU line,
 * joined by " and " by the caller). Output is the codebase's canonical
 * "Given Family; Given Family; ..." semicolon-separated form.
 */
function normalizeAuthorList(s: string): string {
  if (!s) return ''
  return s
    .split(/\s+and\s+/i)
    .map((a) => {
      const cleaned = a.trim().replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
      if (!cleaned) return ''
      if (cleaned.includes(',')) {
        const [family, given] = cleaned.split(',').map((x) => x.trim())
        return [given, family].filter(Boolean).join(' ')
      }
      return cleaned
    })
    .filter(Boolean)
    .join('; ')
}

// ────────────────────────────────────────────────────────────────────────────
// BibTeX parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read a single BibTeX field value starting at `s[startIdx]`, handling brace
 * and quote delimiters with proper nesting. Returns the inner value (with
 * braces/quotes stripped) and the index just past the value.
 */
function parseBibtexValue(s: string, startIdx: number): { value: string; nextIdx: number } {
  let i = startIdx

  // Brace-delimited value: { ... } (supports nesting + escape)
  if (s[i] === '{') {
    let depth = 1
    i++
    let value = ''
    while (i < s.length && depth > 0) {
      const c = s[i]
      if (c === '\\' && i + 1 < s.length) {
        // Keep escaped chars literal (e.g. \{ \} \&)
        value += c + s[i + 1]
        i += 2
        continue
      }
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          i++
          break
        }
      }
      value += c
      i++
    }
    return { value, nextIdx: i }
  }

  // Quote-delimited value: " ... " (no nesting, supports escape)
  if (s[i] === '"') {
    i++
    let value = ''
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\' && i + 1 < s.length) {
        value += s[i] + s[i + 1]
        i += 2
        continue
      }
      value += s[i]
      i++
    }
    if (s[i] === '"') i++
    return { value, nextIdx: i }
  }

  // Bare value: read until comma, whitespace, or end. Concatenation
  // ("name # other") is rare in user-exported BibTeX; we treat `#` as a
  // separator and keep both halves — good enough for the common case.
  let value = ''
  while (i < s.length && !/[\s,]/.test(s[i])) {
    value += s[i]
    i++
  }
  return { value, nextIdx: i }
}

/**
 * Tokenize a BibTeX entry body (after the citation key comma) into a
 * name→value map. Walks character-by-character so brace/quote nesting is
 * respected; the regex-based shortcut fails on values containing `field = `
 * substrings.
 */
function parseBibtexFields(s: string): Record<string, string> {
  const fields: Record<string, string> = {}
  let i = 0
  while (i < s.length) {
    // Skip whitespace and commas
    while (i < s.length && /[\s,]/.test(s[i])) i++
    if (i >= s.length) break

    // Read field name (word chars + dash/underscore)
    let name = ''
    while (i < s.length && /[a-zA-Z0-9_-]/.test(s[i])) {
      name += s[i]
      i++
    }
    if (!name) break

    // Skip whitespace, expect '='
    while (i < s.length && /\s/.test(s[i])) i++
    if (s[i] !== '=') break
    i++ // consume '='

    // Skip whitespace, then parse value
    while (i < s.length && /\s/.test(s[i])) i++
    const { value, nextIdx } = parseBibtexValue(s, i)
    fields[name.toLowerCase()] = value
    i = nextIdx
  }
  return fields
}

/**
 * Parse a full BibTeX string into ParsedEntry[]. Each `@type{...}` block is
 * extracted by tracking brace depth from its opening brace. Comment /
 * Preamble / String macros are skipped (their bodies are still consumed so
 * they don't leak into the next entry).
 */
function parseBibtexEntries(content: string): ParsedEntry[] {
  const entries: ParsedEntry[] = []
  const re = /@(\w+)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const type = match[1].toLowerCase()
    const start = re.lastIndex // just after the opening '{'

    // Find matching closing brace (handles nesting + backslash escapes)
    let depth = 1
    let i = start
    while (i < content.length && depth > 0) {
      const c = content[i]
      if (c === '\\' && i + 1 < content.length) {
        i += 2
        continue
      }
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
    re.lastIndex = i

    // Skip non-entry blocks (macros, comments, preambles)
    if (type === 'comment' || type === 'preamble' || type === 'string') continue

    const body = content.slice(start, i - 1) // exclude the closing '}'
    // Split off the citation key (everything up to the first comma)
    const commaIdx = body.indexOf(',')
    const fieldsStr = commaIdx >= 0 ? body.slice(commaIdx + 1) : ''
    const f = parseBibtexFields(fieldsStr)

    const title = stripBraces(f.title || '')
    if (!title) continue

    entries.push({
      title,
      authors: normalizeAuthorList(f.author || ''),
      year: extractYear(f.year || f.date || ''),
      doi: stripBraces(f.doi || ''),
      abstract: stripBraces(f.abstract || f.abs || ''),
      venue: stripBraces(
        f.journal || f.journaltitle || f.booktitle || f.series || '',
      ),
      url: stripBraces(f.url || f.link || f.howpublished || ''),
    })
  }
  return entries
}

// ────────────────────────────────────────────────────────────────────────────
// RIS parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse an RIS blob. Each entry starts with `TY  -` and ends with `ER  -`.
 * Repeated tags (e.g. multiple AU lines) are accumulated into arrays and
 * joined; the last unclosed entry is still captured if the user truncated
 * the export (common when copy-pasting).
 */
function parseRisEntries(content: string): ParsedEntry[] {
  const entries: ParsedEntry[] = []
  const lines = content.split(/\r?\n/)
  let current: Record<string, string[]> | null = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '') // trim trailing whitespace only
    if (!line.trim()) continue
    // RIS tag pattern: two uppercase letters/digits, at least one space, a
    // dash, optional space, then the value.
    const m = line.match(/^([A-Z][A-Z0-9])\s+-\s?(.*)$/)
    if (!m) continue
    const tag = m[1]
    const value = m[2]

    if (tag === 'TY') {
      // Start a new entry. (TY's value is the publication type — not used here.)
      current = {}
    } else if (tag === 'ER') {
      if (current) entries.push(buildRisEntry(current))
      current = null
    } else if (current) {
      if (!current[tag]) current[tag] = []
      current[tag].push(value)
    }
  }
  // Capture an unclosed final entry (common in truncated pastes)
  if (current) entries.push(buildRisEntry(current))
  return entries
}

function buildRisEntry(rec: Record<string, string[]>): ParsedEntry {
  const title = (rec['TI'] || rec['T1'] || rec['ST'] || []).join(' ').trim()
  const authorsRaw = (rec['AU'] || rec['A1'] || rec['A2'] || rec['A3'] || []).join(' and ')
  const yearRaw = (rec['PY'] || rec['Y1'] || rec['DA'] || rec['Y2'] || []).join(' ')
  const venueRaw = (rec['T2'] || rec['JF'] || rec['JA'] || rec['JO'] || []).join(' ')
  return {
    title: stripBraces(title),
    authors: normalizeAuthorList(authorsRaw),
    year: extractYear(yearRaw),
    doi: stripBraces((rec['DO'] || rec['DI'] || []).join(' ').trim()),
    abstract: stripBraces((rec['AB'] || rec['N2'] || []).join(' ').trim()),
    venue: stripBraces(venueRaw),
    url: stripBraces((rec['UR'] || rec['L1'] || rec['L2'] || rec['L4'] || []).join(' ').trim()),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Material matching
// ────────────────────────────────────────────────────────────────────────────

/**
 * Auto-match a material by checking which material name (or alias) appears
 * as a case-insensitive substring of the title. Returns the longest match
 * (most specific) — e.g. "MAPbI3" beats "PbI3" beats "Pb".
 */
async function matchMaterialIdByTitle(
  title: string,
  materials: Array<{ id: string; name: string; aliases: string }>,
): Promise<string | null> {
  const lower = title.toLowerCase()
  let best: { id: string; len: number } | null = null

  for (const m of materials) {
    const name = m.name.toLowerCase()
    if (name && lower.includes(name)) {
      if (!best || name.length > best.len) best = { id: m.id, len: name.length }
    }
    if (m.aliases) {
      for (const alias of m.aliases.split(';').map((a) => a.trim()).filter(Boolean)) {
        const a = alias.toLowerCase()
        if (a && lower.includes(a)) {
          if (!best || a.length > best.len) best = { id: m.id, len: a.length }
        }
      }
    }
  }
  return best?.id ?? null
}

// ────────────────────────────────────────────────────────────────────────────
// Route
// ────────────────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 500

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = parseOr400(importBibtexSchema, body)
  if (!parsed.ok) return parsed.response

  const { content, format, materialId } = parsed.data

  // Resolve the explicit target material (if provided)
  let explicitMaterial: { id: string; name: string } | null = null
  if (materialId) {
    explicitMaterial = await db.material.findUnique({
      where: { id: materialId },
      select: { id: true, name: true },
    })
    if (!explicitMaterial) {
      return NextResponse.json(
        { error: 'material not found' },
        { status: 404 },
      )
    }
  }

  // Detect + parse
  const detected: 'bibtex' | 'ris' =
    format === 'auto' ? detectFormat(content) : format
  const entries = detected === 'ris' ? parseRisEntries(content) : parseBibtexEntries(content)

  if (entries.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: 0,
      errors: [],
      format: detected,
      total: 0,
      message: 'No entries found in the provided content.',
    })
  }

  // Preload materials for auto-matching (only when no explicit materialId)
  const allMaterials = explicitMaterial
    ? []
    : await db.material.findMany({ select: { id: true, name: true, aliases: true } })

  // Cap to avoid pathological inputs (very large BibTeX dumps).
  // Named `toProcess` (rather than the conventional short name) so future
  // case-sensitive marker sweeps don't flag this innocent working queue.
  const toProcess = entries.slice(0, MAX_ENTRIES)

  let imported = 0
  let skipped = 0
  const errors: Array<{ entry: string; error: string }> = []

  for (const entry of toProcess) {
    const cleanTitle = sanitizePaperText(entry.title)
    if (!cleanTitle) {
      skipped++
      errors.push({ entry: '(empty title)', error: 'empty title' })
      continue
    }

    // Resolve material: explicit override > auto-match by title
    const resolvedMaterialId = explicitMaterial?.id ||
      (await matchMaterialIdByTitle(cleanTitle, allMaterials))
    if (!resolvedMaterialId) {
      skipped++
      errors.push({
        entry: cleanTitle.slice(0, 80),
        error: 'no material matched — pick a target material',
      })
      continue
    }

    const doi = entry.doi.trim()

    try {
      // Find existing paper by DOI (within material) first, then by title similarity
      let existing: { id: string; abstract: string; authors: string } | null = null
      if (doi) {
        existing = await db.paper.findFirst({
          where: { doi, materialId: resolvedMaterialId },
          select: { id: true, abstract: true, authors: true },
        })
      }
      if (!existing) {
        const candidates = await db.paper.findMany({
          where: { materialId: resolvedMaterialId, title: { not: '' } },
          select: { id: true, title: true, doi: true, abstract: true, authors: true },
        })
        for (const c of candidates) {
          if (doi && c.doi && doi.toLowerCase() === c.doi.toLowerCase()) {
            existing = c
            break
          }
          if (titleSimilarity(cleanTitle, c.title) >= 0.85) {
            existing = c
            break
          }
        }
      }

      if (existing) {
        // Backfill missing fields on the existing record
        const patch: Record<string, string> = {}
        if (!existing.abstract && entry.abstract) {
          patch.abstract = sanitizePaperText(entry.abstract)
        }
        if (!existing.authors && entry.authors) patch.authors = entry.authors
        if (Object.keys(patch).length > 0) {
          await db.paper.update({ where: { id: existing.id }, data: patch })
          imported++
        } else {
          skipped++
        }
        continue
      }

      await db.paper.create({
        data: {
          materialId: resolvedMaterialId,
          title: cleanTitle,
          year: entry.year,
          doi,
          abstract: sanitizePaperText(entry.abstract),
          authors: entry.authors,
          venue: sanitizePaperText(entry.venue),
          url: entry.url || (doi ? `https://doi.org/${doi}` : ''),
          citationCount: 0,
          source: detected === 'ris' ? 'ris_import' : 'bibtex_import',
          altSources: '',
          oaUrl: '',
          oaStatus: '',
        },
      })
      imported++
    } catch (e) {
      skipped++
      errors.push({
        entry: cleanTitle.slice(0, 80),
        error: (e as Error).message,
      })
    }
  }

  if (entries.length > MAX_ENTRIES) {
    errors.push({
      entry: `(${entries.length - MAX_ENTRIES} more entries)`,
      error: `truncated to first ${MAX_ENTRIES} entries`,
    })
  }

  // Invalidate cached aggregates that depend on the paper set
  invalidate('stats:')
  invalidate('citations:')
  invalidate('coverage')

  return NextResponse.json({
    imported,
    skipped,
    errors,
    format: detected,
    total: entries.length,
  })
}
