import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// GET /api/export - export aggregated results as CSV or LaTeX.
//
// Query params (all optional, can be combined):
//   ?format=csv              → CSV output (default). Use `latex` for a LaTeX
//                              tabular environment instead.
//   ?preview=true            → instead of returning the file, return a JSON
//                              object { headers, rows[<=5], totalRows, format,
//                              rawPreview } describing what *would* be exported
//                              so the client can show a "first 5 rows" preview
//                              dialog before triggering the real download.
//                              Mutually compatible with every filter below and
//                              with ?format=latex (the rawPreview field then
//                              contains the first 3 lines of the .tex body).
//   ?verified=true           → only materials with verification.status='verified'
//   ?synthOnly=true          → only materials with classifications.synthesized='yes'
//   ?hasEfficiency=true      → only materials with at least one efficiency record
//   ?leadFree=true           → only materials whose name AND aliases do NOT contain 'Pb'
//   ?category=perovskite     → only materials of the given category
//                              (perovskite | chalcogenide | oxide | other)
//   ?recent=true             → only materials with at least one paper from
//                              year >= (currentYear - 1)
//   ?reviewer=Alice          → only materials with at least one verification
//                              whose reviewer === 'Alice' (any status)
//   ?project=MatLit-Demo     → only materials with at least one verification
//                              whose project === 'MatLit-Demo'
//   ?fromYear=2023           → only materials with at least one paper from
//                              year >= 2023 (combine with toYear for a range)
//   ?toYear=2025             → only materials with at least one paper from
//                              year <= 2025
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  // Output format. Anything other than `latex` (case-insensitive) falls back
  // to the default CSV behaviour so existing callers keep working.
  const format = (searchParams.get('format') || 'csv').toLowerCase()
  // Preview mode: when `?preview=true` is present we short-circuit the file
  // response and return a JSON object describing the first 5 rows instead. The
  // client uses this to populate an "Export preview" dialog before triggering
  // the real download. `rawPreview` always carries the first 3 lines of the
  // actual exported file (CSV header + 2 rows, or LaTeX preamble + tabular
  // head) so users can see the exact on-disk format.
  const preview = searchParams.get('preview') === 'true'
  const verified = searchParams.get('verified') === 'true'
  const synthOnly = searchParams.get('synthOnly') === 'true'
  const hasEfficiency = searchParams.get('hasEfficiency') === 'true'
  const leadFree = searchParams.get('leadFree') === 'true'
  const category = searchParams.get('category')
  const recent = searchParams.get('recent') === 'true'
  const reviewer = searchParams.get('reviewer')
  const project = searchParams.get('project')
  // fromYear / toYear accept integers; invalid values are ignored.
  const fromYearRaw = searchParams.get('fromYear')
  const toYearRaw = searchParams.get('toYear')
  const fromYear = fromYearRaw && /^\d+$/.test(fromYearRaw) ? Number(fromYearRaw) : null
  const toYear = toYearRaw && /^\d+$/.test(toYearRaw) ? Number(toYearRaw) : null

  // Compose the top-level Material where clause from each enabled filter.
  // Each preset typically sets only one flag, but combining is supported via AND.
  const andClauses: Prisma.MaterialWhereInput[] = []
  if (verified) {
    andClauses.push({ verifications: { some: { status: 'verified' } } })
  }
  if (synthOnly) {
    andClauses.push({ classifications: { some: { synthesized: 'yes' } } })
  }
  if (hasEfficiency) {
    andClauses.push({ efficiencies: { some: {} } })
  }
  if (category) {
    andClauses.push({ category })
  }
  if (leadFree) {
    // Exclude any material whose name OR aliases contains "Pb".
    // (case-sensitive on purpose — Pb is a chemical symbol, not a substring match)
    andClauses.push({ name: { not: { contains: 'Pb' } } })
    andClauses.push({ aliases: { not: { contains: 'Pb' } } })
  }
  if (recent) {
    // Papers only have a `year`, so "recent" = at least one paper from
    // currentYear - 1 or later (covers last ~2 calendar years).
    const currentYear = new Date().getFullYear()
    andClauses.push({ papers: { some: { year: { gte: currentYear - 1 } } } })
  }
  if (reviewer) {
    // Any verification by this reviewer (any status). Combine with
    // ?verified=true to restrict to verified-only records by that reviewer.
    andClauses.push({ verifications: { some: { reviewer } } })
  }
  if (project) {
    // Filter by the verification.project field (collaboration isolation).
    andClauses.push({ verifications: { some: { project } } })
  }
  if (fromYear !== null || toYear !== null) {
    // At least one paper whose year falls inside [fromYear, toYear].
    // Missing bounds are omitted so callers can pass only one side.
    const yearFilter: { gte?: number; lte?: number } = {}
    if (fromYear !== null) yearFilter.gte = fromYear
    if (toYear !== null) yearFilter.lte = toYear
    andClauses.push({ papers: { some: { year: yearFilter } } })
  }

  const where: Prisma.MaterialWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {}

  const materials = await db.material.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      papers: { select: { doi: true, title: true }, take: 5 },
      classifications: {
        where: { synthesized: 'yes' },
        take: 1,
        orderBy: { confidence: 'desc' },
      },
      efficiencies: { orderBy: { efficiencyValue: 'desc' }, take: 1 },
      verifications: { take: 1, orderBy: { updatedAt: 'desc' } },
    },
  })

  const rows = materials.map(m => {
    const cls = m.classifications[0]
    const eff = m.efficiencies[0]
    const ver = m.verifications[0]
    const primaryDoi = m.papers.find(p => p.doi)?.doi || m.papers[0]?.doi || ''
    return {
      material: m.name,
      aliases: m.aliases,
      category: m.category,
      synthesized: cls?.synthesized || '',
      bandgap_eV: cls?.bandgapValue || '',
      synthesisMethod: cls?.synthesisMethod || '',
      conditions: cls?.conditions || '',
      phaseDiagramInfo: cls?.phaseDiagramInfo || '',
      maxEfficiency_pct: eff?.efficiencyValue || '',
      efficiencySource: eff?.source || '',
      efficiencyCertified: eff?.certified ? 'yes' : 'no',
      verificationStatus: ver?.status || 'pending',
      reviewer: ver?.reviewer || '',
      primaryDOI: primaryDoi,
      evidence: cls?.evidence || '',
      confidence: cls ? (cls.confidence * 100).toFixed(0) + '%' : '',
    }
  })

  const headers = Object.keys(rows[0] ?? { material: '' })

  // Build a descriptive filename so users can tell filtered exports apart.
  const yearRangeDesc = (() => {
    if (fromYear !== null && toYear !== null) return `${fromYear}-${toYear}`
    if (fromYear !== null) return `from-${fromYear}`
    if (toYear !== null) return `to-${toYear}`
    return ''
  })()
  const filterDesc = [
    verified ? 'verified' : '',
    synthOnly ? 'synth-only' : '',
    hasEfficiency ? 'with-efficiency' : '',
    leadFree ? 'lead-free' : '',
    category ? `cat-${category}` : '',
    recent ? 'recent' : '',
    reviewer ? `reviewer-${reviewer}` : '',
    project ? `project-${project}` : '',
    yearRangeDesc,
  ].filter(Boolean).join('-')

  // LaTeX tabular export. Renders a booktabs-styled table (requires
  // \usepackage{booktabs} in the preamble) with one row per material and a
  // curated column set: name, category, bandgap, max efficiency, synthesized
  // flag and verification status. Free-text fields that would blow up the
  // table width (method, conditions, evidence, …) are intentionally omitted —
  // the full dataset is still available via CSV/JSON/Excel exports.
  if (format === 'latex') {
    // Escape the LaTeX-special characters that commonly appear in material
    // names (e.g. MAPbI_3), reviewer strings or values. `%` must be escaped
    // first because it's also the comment character — doing it last would
    // double-escape any `\%` already produced for `&`, `_`, etc. (none of
    // the other chars produce `%`, so order is safe in practice, but we keep
    // the explicit single-pass replace for clarity).
    const escapeLatex = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v)
      return s
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/%/g, '\\%')
        .replace(/&/g, '\\&')
        .replace(/_/g, '\\_')
        .replace(/#/g, '\\#')
        .replace(/\$/g, '\\$')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/~/g, '\\textasciitilde{}')
    }
    // Format an efficiency value: keep two decimals so the column lines up,
    // fall back to an empty cell when no efficiency record is present.
    const effCell = (r: (typeof rows)[number]): string => {
      const v = r.maxEfficiency_pct
      if (v === '' || v === null || v === undefined) return ''
      const n = Number(v)
      return Number.isFinite(n) ? n.toFixed(2) : escapeLatex(v)
    }
    const latexLines: string[] = [
      '\\begin{table}[h]',
      '\\centering',
      '\\caption{Material science results}',
      '\\label{tab:results}',
      '\\begin{tabular}{lccccc}',
      '\\toprule',
      [
        'Material',
        'Category',
        'Bandgap (eV)',
        'Max Eff (\\%)',
        'Synthesized',
        'Verification',
      ].join(' & '),
      '\\midrule',
    ]
    if (rows.length === 0) {
      // Emit a single em-dash row so the table is still valid LaTeX.
      latexLines.push(['—', '—', '—', '—', '—', '—'].join(' & ') + ' \\\\')
    } else {
      for (const r of rows) {
        const cells = [
          escapeLatex(r.material),
          escapeLatex(r.category),
          escapeLatex(r.bandgap_eV),
          effCell(r),
          escapeLatex(r.synthesized || '—'),
          escapeLatex(r.verificationStatus || 'pending'),
        ]
        latexLines.push(cells.join(' & ') + ' \\\\')
      }
    }
    latexLines.push('\\bottomrule', '\\end{tabular}', '\\end{table}')
    const latex = latexLines.join('\n') + '\n'
    const filename = filterDesc
      ? `matlit-results-${filterDesc}.tex`
      : `matlit-results.tex`
    // Preview short-circuit: return a JSON description instead of the file so
    // the client can render an "Export preview" dialog. `rawPreview` carries
    // the first 3 lines of the .tex body (preamble + tabular header) so users
    // can see exactly what they'll paste into their paper.
    if (preview) {
      return NextResponse.json({
        headers,
        rows: rows.slice(0, 5),
        totalRows: rows.length,
        format: 'latex',
        filename,
        rawPreview: latex.split('\n').slice(0, 3).join('\n'),
      })
    }
    return new NextResponse(latex, {
      headers: {
        'Content-Type': 'application/x-tex; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape((r as Record<string, unknown>)[h])).join(',')),
  ].join('\n')

  const filename = filterDesc
    ? `matlit-results-${filterDesc}-${Date.now()}.csv`
    : `matlit-results-${Date.now()}.csv`

  // CSV preview short-circuit — same shape as the LaTeX one above. `rawPreview`
  // is the first 3 lines of the actual CSV (header + first 2 data rows), so
  // the user sees exactly how their spreadsheet will look on disk.
  if (preview) {
    return NextResponse.json({
      headers,
      rows: rows.slice(0, 5),
      totalRows: rows.length,
      format: 'csv',
      filename,
      rawPreview: csv.split('\n').slice(0, 3).join('\n'),
    })
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
