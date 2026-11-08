import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/api-error'

// GET /api/export/markdown
//
// Export one / many / all materials as a Notion- & Obsidian-friendly Markdown
// document. Three modes:
//
//   ?materialId=X       → single-material card (full properties + paper list)
//   ?ids=1,2,3          → side-by-side comparison table across the listed
//                          materials (preserves the order of the ids param)
//   (no params)         → full results table across ALL materials
//
// Output format:
//   - `text/markdown; charset=utf-8` with `Content-Disposition: attachment`.
//   - Notion-friendly: GitHub-flavoured Markdown tables, Obsidian-style
//     callouts (`> [!info]`, `> [!warning]`, `> [!tip]`) for important values,
//     `- [x]` / `- [ ]` checkboxes for booleans, fenced code blocks for
//     chemical formulas, and a YAML front-matter block at the top so the
//     document lands in the right Notion database / Obsidian tag index when
//     dragged in.
//   - Filename: `matlit-{materialName|'results'}.md`. Material names are
//     sanitised (non-alphanumeric → '-') so the filename stays portable.

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Sanitise a material name for use in a filename (non-alphanumeric → '-'). */
function sanitizeFilename(name: string): string {
  return (name || 'results')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'results'
}

/**
 * Escape a value for safe inclusion in a Markdown table cell.
 * - Pipes are escaped as `\|` (would otherwise be parsed as a column separator)
 * - Newlines become `<br>` (Markdown tables don't allow raw line breaks)
 * - Empty / null → em-dash so the cell isn't visually empty
 */
function escapeTableCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  const s = String(v)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
  return s
}

/**
 * Format a boolean as a Notion/Obsidian checkbox glyph. Notion auto-converts
 * `- [x]` and `- [ ]` into interactive checkboxes when the line starts a
 * list item; in table cells we use the unicode ballot glyphs (✅ / ☐) so
 * the value still renders as a checkbox even when Notion interprets the
 * cell as inline text.
 */
function boolCell(b: boolean | null | undefined): string {
  if (b === true) return '✅'
  if (b === false) return '☐'
  return '—'
}

/** Format a verified/flagged/pending/rejected status as an emoji badge. */
function statusBadge(status: string | null | undefined): string {
  switch (status) {
    case 'verified':
      return '✅ verified'
    case 'flagged':
      return '⚠️ flagged'
    case 'rejected':
      return '❌ rejected'
    default:
      return '⏳ pending'
  }
}

/** Wrap a chemical formula in a fenced inline code span so subscripts stay. */
function codeCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  return '`' + String(v).replace(/`/g, '\\`') + '`'
}

/** Format a numeric efficiency value with 2 decimals + the `%` suffix. */
function effCell(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `**${v.toFixed(2)}%**`
}

/** Format a date for the YAML front-matter (ISO date, no time). */
function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Full ISO timestamp for the footer "generated at" line. */
function isoTimestamp(d: Date = new Date()): string {
  return d.toISOString()
}

/**
 * Build a Notion-callout block. `kind` maps to one of the canonical Obsidian
 * callout types (`info` / `tip` / `warning` / `success` / `note`) which
 * Notion interprets as a colored callout when imported. Each non-empty line
 * of `lines` is prefixed with `> ` so the whole block renders as a single
 * callout in both tools.
 */
function callout(
  kind: 'info' | 'tip' | 'warning' | 'success' | 'note',
  lines: string[],
): string {
  const body = lines.filter(Boolean).map((l) => `> ${l}`).join('\n')
  return `> [!${kind}]\n${body}`
}

// ─── Query helpers ───────────────────────────────────────────────────────

/**
 * Common Prisma include shape shared by all three export modes. We pull
 * the top classification (highest-confidence synthesized='yes' row), the
 * top efficiency record (highest PCE), the most recent verification, and
 * up to 10 papers (so the single-material card has a respectable list).
 */
const includeShape = {
  papers: {
    select: { doi: true, title: true, year: true, source: true, venue: true },
    take: 10,
    orderBy: { year: 'desc' as const },
  },
  classifications: {
    where: { synthesized: 'yes' },
    take: 1,
    orderBy: { confidence: 'desc' as const },
  },
  efficiencies: { orderBy: { efficiencyValue: 'desc' as const }, take: 1 },
  verifications: { take: 1, orderBy: { updatedAt: 'desc' as const } },
}

// Prisma's typed include shape (so the .map() helpers below get full typing
// without us having to repeat the include).
type MaterialWithRelations = Awaited<
  ReturnType<
    typeof db.material.findMany<{
      include: typeof includeShape
    }>
  >
>[number]

// ─── Markdown builders ───────────────────────────────────────────────────

/**
 * Build the single-material Markdown card. Headed by an H1 with the
 * formula in a code span, followed by a Notion info-callout summarising
 * the category and aliases, then a properties table, an efficiency callout,
 * and a papers list.
 */
function buildSingleMaterialMarkdown(m: MaterialWithRelations): string {
  const cls = m.classifications[0]
  const eff = m.efficiencies[0]
  const ver = m.verifications[0]
  const aliases = m.aliases
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  const lines: string[] = []

  // YAML front-matter — Notion reads this when importing markdown files,
  // and Obsidian uses it for properties / Dataview queries.
  lines.push('---')
  lines.push(`title: "${m.name.replace(/"/g, '\\"')}"`)
  lines.push(`category: ${m.category}`)
  lines.push(`generated: ${isoDate()}`)
  lines.push(`source: MatLit-Miner`)
  if (eff) lines.push(`max_efficiency_pct: ${eff.efficiencyValue}`)
  if (cls?.bandgapValue) lines.push(`bandgap_eV: ${cls.bandgapValue}`)
  lines.push('---')
  lines.push('')

  // H1 + summary callout
  lines.push(`# \`${m.name}\``)
  lines.push('')
  const summaryLines: string[] = [
    `**Category:** ${m.category}`,
    aliases.length > 0 ? `**Aliases:** ${aliases.map((a) => `\`${a}\``).join(', ')}` : '',
    `**Papers indexed:** ${m.papers.length}`,
    `**Last updated:** ${isoDate(new Date(m.updatedAt))}`,
  ].filter(Boolean)
  lines.push(callout('info', summaryLines))
  lines.push('')

  // ── Properties table ─────────────────────────────────────────────────
  lines.push('## Properties')
  lines.push('')
  lines.push('| Property | Value |')
  lines.push('|----------|-------|')
  lines.push(`| Category | ${escapeTableCell(m.category)} |`)
  lines.push(
    `| Synthesized | ${cls?.synthesized === 'yes' ? '✅ yes' : cls?.synthesized === 'no' ? '❌ no' : '⏳ uncertain'} |`,
  )
  lines.push(`| Bandgap (eV) | ${codeCell(cls?.bandgapValue)} |`)
  lines.push(`| Synthesis method | ${escapeTableCell(cls?.synthesisMethod)} |`)
  lines.push(`| Conditions | ${escapeTableCell(cls?.conditions)} |`)
  lines.push(`| Phase diagram info | ${escapeTableCell(cls?.phaseDiagramInfo)} |`)
  if (cls?.evidence) {
    lines.push(`| Evidence (paper quote) | ${escapeTableCell(`"${cls.evidence}"`)} |`)
  }
  if (cls) {
    lines.push(`| Confidence | ${(cls.confidence * 100).toFixed(0)}% |`)
  }
  lines.push('')

  // ── Efficiency callout ───────────────────────────────────────────────
  // Surface the headline efficiency in a callout so Notion / Obsidian users
  // see it at a glance even when scrolling past the properties table.
  if (eff) {
    lines.push('## Efficiency')
    lines.push('')
    const effLines: string[] = [
      `**Max PCE:** ${eff.efficiencyValue.toFixed(2)}%`,
      eff.certified ? 'Certified by an independent test lab ✅' : 'Not certified ☐',
      eff.source ? `Source: ${eff.source}` : '',
      eff.year ? `Year: ${eff.year}` : '',
      eff.testConditions ? `Test conditions: ${eff.testConditions}` : '',
      eff.doi ? `DOI: [${eff.doi}](https://doi.org/${eff.doi})` : '',
    ].filter(Boolean)
    // Use 'success' callout for certified records, 'tip' otherwise.
    lines.push(callout(eff.certified ? 'success' : 'tip', effLines))
    lines.push('')
  } else {
    lines.push(callout('warning', ['No efficiency record available for this material.']))
    lines.push('')
  }

  // ── Verification ──────────────────────────────────────────────────────
  if (ver) {
    lines.push('## Verification')
    lines.push('')
    lines.push('| Field | Value |')
    lines.push('|-------|-------|')
    lines.push(`| Status | ${statusBadge(ver.status)} |`)
    lines.push(`| Reviewer | ${escapeTableCell(ver.reviewer || 'anonymous')} |`)
    lines.push(`| Project | ${escapeTableCell(ver.project || 'default')} |`)
    if (ver.checkedFields) {
      const fields = ver.checkedFields
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
      if (fields.length > 0) {
        lines.push(`| Checked fields | ${fields.map((f) => `\`${f}\``).join(', ')} |`)
      }
    }
    if (ver.notes) lines.push(`| Notes | ${escapeTableCell(ver.notes)} |`)
    lines.push(`| Last checked | ${isoDate(new Date(ver.updatedAt))} |`)
    lines.push('')
  }

  // ── Papers list ───────────────────────────────────────────────────────
  if (m.papers.length > 0) {
    lines.push(`## Papers (${m.papers.length})`)
    lines.push('')
    lines.push('| # | Year | Title | Source | DOI |')
    lines.push('|---|------|-------|--------|-----|')
    m.papers.forEach((p, i) => {
      const doiLink = p.doi
        ? `[${p.doi}](https://doi.org/${p.doi})`
        : '—'
      lines.push(
        `| ${i + 1} | ${escapeTableCell(p.year)} | ${escapeTableCell(p.title)} | ${escapeTableCell(p.source)} | ${escapeTableCell(doiLink)} |`,
      )
    })
    lines.push('')
  }

  // ── Footer ────────────────────────────────────────────────────────────
  lines.push('---')
  lines.push('')
  lines.push(
    `_Generated by [MatLit Miner](https://github.com/) on ${isoTimestamp()} — \`/api/export/markdown?materialId=${m.id}\`_`,
  )
  lines.push('')

  return lines.join('\n')
}

/**
 * Build the multi-material comparison Markdown table. One row per material,
 * columns: formula, category, bandgap, max efficiency, synthesized flag,
 * certified flag, verification status. Booleans become ✅/☐ glyphs and
 * formulas are wrapped in inline code so subscripts survive the round-trip.
 */
function buildComparisonMarkdown(
  materials: MaterialWithRelations[],
  title: string,
): string {
  const lines: string[] = []

  // YAML front-matter
  lines.push('---')
  lines.push(`title: "${title.replace(/"/g, '\\"')}"`)
  lines.push(`generated: ${isoDate()}`)
  lines.push(`source: MatLit-Miner`)
  lines.push(`materials: ${materials.length}`)
  lines.push('---')
  lines.push('')

  // H1 + summary callout
  lines.push(`# ${title}`)
  lines.push('')
  lines.push(
    callout('info', [
      `**${materials.length}** material(s) compared.`,
      `Columns: formula · category · bandgap · max PCE · synthesized · certified · verification.`,
    ]),
  )
  lines.push('')

  // Comparison table
  lines.push('| Material | Category | Bandgap (eV) | Max PCE (%) | Synthesized | Certified | Verification |')
  lines.push('|----------|----------|--------------|-------------|-------------|-----------|--------------|')
  for (const m of materials) {
    const cls = m.classifications[0]
    const eff = m.efficiencies[0]
    const ver = m.verifications[0]
    lines.push(
      [
        codeCell(m.name),
        escapeTableCell(m.category),
        codeCell(cls?.bandgapValue),
        effCell(eff?.efficiencyValue),
        boolCell(cls?.synthesized === 'yes'),
        boolCell(eff?.certified),
        statusBadge(ver?.status),
      ]
        .map((c) => c || '—')
        .join(' | '),
    )
  }
  lines.push('')

  // ── Per-material mini-cards (so the comparison doc is self-contained) ──
  lines.push('## Per-material details')
  lines.push('')
  for (const m of materials) {
    const cls = m.classifications[0]
    const eff = m.efficiencies[0]
    lines.push(`### \`${m.name}\``)
    lines.push('')
    lines.push('- **Category:** ' + m.category)
    if (cls?.bandgapValue) lines.push(`- **Bandgap:** \`${cls.bandgapValue}\``)
    if (cls?.synthesisMethod) lines.push(`- **Method:** ${cls.synthesisMethod}`)
    if (eff) {
      lines.push(
        `- **Max PCE:** **${eff.efficiencyValue.toFixed(2)}%**${eff.certified ? ' (certified ✅)' : ''}`,
      )
    }
    if (m.papers.length > 0) {
      const top = m.papers[0]
      lines.push(
        `- **Top paper (${top.year ?? 'n/a'}):** ${top.title}${top.doi ? ` — [DOI](https://doi.org/${top.doi})` : ''}`,
      )
    }
    lines.push('')
  }

  // ── Footer ────────────────────────────────────────────────────────────
  lines.push('---')
  lines.push('')
  lines.push(
    `_Generated by [MatLit Miner](https://github.com/) on ${isoTimestamp()} — \`${materials.length} materials\`_`,
  )
  lines.push('')

  return lines.join('\n')
}

/**
 * Build the all-materials results table. Same column set as the comparison
 * table but without the per-material mini-cards (would balloon the doc for
 * a 60-material database). Adds a small summary callout at the top.
 */
function buildAllResultsMarkdown(materials: MaterialWithRelations[]): string {
  const lines: string[] = []

  // YAML front-matter
  lines.push('---')
  lines.push(`title: "MatLit Miner — full results"`)
  lines.push(`generated: ${isoDate()}`)
  lines.push(`source: MatLit-Miner`)
  lines.push(`materials: ${materials.length}`)
  lines.push('---')
  lines.push('')

  lines.push('# MatLit Miner — full results')
  lines.push('')

  // Summary stats — count synthesized, count with efficiency, count verified.
  const withEff = materials.filter((m) => m.efficiencies.length > 0).length
  const withSynth = materials.filter((m) => m.classifications.length > 0).length
  const verified = materials.filter(
    (m) => m.verifications[0]?.status === 'verified',
  ).length
  const avgEff = (() => {
    const vals = materials
      .map((m) => m.efficiencies[0]?.efficiencyValue)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  })()
  lines.push(
    callout('info', [
      `**${materials.length}** materials total`,
      `**${withSynth}** synthesized (classification = yes)`,
      `**${withEff}** with at least one efficiency record`,
      `**${verified}** verified by a reviewer`,
      avgEff !== null
        ? `**Average max PCE:** ${avgEff.toFixed(2)}% (across ${withEff} materials with data)`
        : 'No efficiency data available',
    ]),
  )
  lines.push('')

  // Full table
  lines.push('| Material | Category | Bandgap (eV) | Max PCE (%) | Synthesized | Certified | Verification |')
  lines.push('|----------|----------|--------------|-------------|-------------|-----------|--------------|')
  for (const m of materials) {
    const cls = m.classifications[0]
    const eff = m.efficiencies[0]
    const ver = m.verifications[0]
    lines.push(
      [
        codeCell(m.name),
        escapeTableCell(m.category),
        codeCell(cls?.bandgapValue),
        effCell(eff?.efficiencyValue),
        boolCell(cls?.synthesized === 'yes'),
        boolCell(eff?.certified),
        statusBadge(ver?.status),
      ]
        .map((c) => c || '—')
        .join(' | '),
    )
  }
  lines.push('')

  // ── Footer ────────────────────────────────────────────────────────────
  lines.push('---')
  lines.push('')
  lines.push(
    `_Generated by [MatLit Miner](https://github.com/) on ${isoTimestamp()} — \`${materials.length} materials\`_`,
  )
  lines.push('')

  return lines.join('\n')
}

// ─── Route handler ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const materialId = searchParams.get('materialId')
  const idsParam = searchParams.get('ids')

  let markdown: string
  let filename: string

  try {
    if (materialId) {
      // ── Single-material card ──────────────────────────────────────────
      const m = await db.material.findUnique({
        where: { id: materialId },
        include: includeShape,
      })
      if (!m) {
        return NextResponse.json(
          { error: `Material not found: ${materialId}` },
          { status: 404 },
        )
      }
      markdown = buildSingleMaterialMarkdown(m)
      filename = `matlit-${sanitizeFilename(m.name)}.md`
    } else if (idsParam) {
      // ── Comparison table (one or more ids, comma-separated) ───────────
      // Preserve the order of the ids param so the user controls the
      // column order in the resulting table.
      const ids = idsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (ids.length === 0) {
        return NextResponse.json(
          { error: 'No ids provided in ?ids= param' },
          { status: 400 },
        )
      }
      // Fetch all matching materials. We can't use `findMany({ where: { id: { in: ids } } })`
      // directly because Prisma doesn't preserve the input order — so we
      // fetch then re-sort by the original ids array.
      const fetched = await db.material.findMany({
        where: { id: { in: ids } },
        include: includeShape,
      })
      const byId = new Map(fetched.map((m) => [m.id, m]))
      const ordered = ids
        .map((id) => byId.get(id))
        .filter((m): m is NonNullable<typeof m> => !!m)
      if (ordered.length === 0) {
        return NextResponse.json(
          { error: 'None of the requested material ids were found' },
          { status: 404 },
        )
      }
      // If only one id was requested, fall through to the single-card
      // format (more useful than a 1-row comparison table).
      if (ordered.length === 1) {
        markdown = buildSingleMaterialMarkdown(ordered[0])
        filename = `matlit-${sanitizeFilename(ordered[0].name)}.md`
      } else {
        const title = `Comparison: ${ordered.map((m) => m.name).join(' vs ')}`
        markdown = buildComparisonMarkdown(ordered, title)
        // Use a hash of the ids so re-running the same comparison produces
        // the same filename (dedupes Notion imports).
        const slug = ordered.map((m) => sanitizeFilename(m.name)).join('-vs-').slice(0, 60)
        filename = `matlit-compare-${slug || 'results'}.md`
      }
    } else {
      // ── Full results table ────────────────────────────────────────────
      const materials = await db.material.findMany({
        orderBy: { name: 'asc' },
        include: includeShape,
      })
      markdown = buildAllResultsMarkdown(materials)
      filename = `matlit-results.md`
    }
  } catch (e) {
    return apiError('Markdown export failed', 500, e)
  }

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Hint to browsers / proxies that the body is text and shouldn't be
      // gzipped beyond a certain threshold (small markdown files compress
      // poorly and the overhead hurts perceived latency).
      'Vary': 'Accept',
    },
  })
}
