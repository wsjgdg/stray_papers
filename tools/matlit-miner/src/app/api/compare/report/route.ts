import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/compare/report?ids=id1,id2,id3
// Returns a self-contained, print-friendly HTML report with a
// "Print / Save as PDF" button (window.print()). The report includes:
// - MatLit Miner header with date
// - Winner summary pills
// - Side-by-side comparison table (same fields as the dialog)
// - CSS-based horizontal bar chart (efficiency, papers, citations)
// - Per-field normalized "best" highlighting
// This avoids requiring any PDF dependency — the user's browser prints to PDF.

interface Row {
  id: string
  name: string
  category: string
  paperCount: number
  yearRange: string
  maxCitations: number
  synthesized: string
  bandgap: string
  method: string
  conditions: string
  maxEfficiency: number | null
  efficiencyCertified: boolean
  efficiencySource: string
}

function esc(s: unknown): string {
  const str = String(s ?? '')
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s || s === '—') return null
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('ids') || ''
  const ids = idsParam.split(',').filter(Boolean).slice(0, 4)

  if (ids.length < 2) {
    return new NextResponse(
      '<!doctype html><html><body style="font-family:sans-serif;padding:2rem"><h2>At least 2 material IDs required.</h2><p>Usage: /api/compare/report?ids=1,2,3</p></body></html>',
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const materials = await db.material.findMany({
    where: { id: { in: ids } },
    include: {
      classifications: {
        where: { synthesized: 'yes' },
        take: 1,
        orderBy: { confidence: 'desc' },
      },
      efficiencies: { orderBy: { efficiencyValue: 'desc' }, take: 1 },
      papers: { select: { id: true, year: true, citationCount: true } },
    },
  })

  const rows: Row[] = materials.map((m) => {
    const cls = m.classifications[0]
    const eff = m.efficiencies[0]
    const years = m.papers.map((p) => p.year).filter(Boolean).sort() as number[]
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      paperCount: m.papers.length,
      yearRange: years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : '—',
      maxCitations:
        m.papers.length > 0 ? Math.max(...m.papers.map((p) => p.citationCount || 0)) : 0,
      synthesized: cls?.synthesized || '—',
      bandgap: cls?.bandgapValue || '—',
      method: cls?.synthesisMethod || '—',
      conditions: cls?.conditions || '—',
      maxEfficiency: eff?.efficiencyValue ?? null,
      efficiencyCertified: eff?.certified || false,
      efficiencySource: eff?.source || '—',
    }
  })

  // ---- compute winners ----
  interface Winner {
    label: string
    name: string
    value: string
    color: string
  }
  const winners: Winner[] = []
  if (rows.length >= 2) {
    const eff = rows
      .map((c) => ({ c, n: c.maxEfficiency }))
      .filter((x) => x.n !== null && x.n !== undefined)
    if (eff.length >= 2) {
      const max = Math.max(...eff.map((x) => x.n as number))
      const top = eff.filter((x) => x.n === max)
      if (top.length === 1) {
        winners.push({
          label: 'Highest efficiency',
          name: top[0].c.name,
          value: `${(top[0].n as number).toFixed(2)}%`,
          color: '#10b981',
        })
      }
    }
    const papers = rows.map((c) => ({ c, n: c.paperCount }))
    if (papers.length >= 2) {
      const max = Math.max(...papers.map((x) => x.n))
      const top = papers.filter((x) => x.n === max)
      if (top.length === 1) {
        winners.push({
          label: 'Most papers',
          name: top[0].c.name,
          value: String(top[0].n),
          color: '#0ea5e9',
        })
      }
    }
    const cited = rows.map((c) => ({ c, n: c.maxCitations }))
    if (cited.length >= 2) {
      const max = Math.max(...cited.map((x) => x.n))
      const top = cited.filter((x) => x.n === max)
      if (top.length === 1) {
        winners.push({
          label: 'Most cited',
          name: top[0].c.name,
          value: String(top[0].n),
          color: '#f59e0b',
        })
      }
    }
    const bg = rows
      .map((c) => ({ c, n: parseNum(c.bandgap) }))
      .filter((x) => x.n !== null && x.n > 0)
    if (bg.length >= 2) {
      const min = Math.min(...bg.map((x) => x.n as number))
      const top = bg.filter((x) => x.n === min)
      if (top.length === 1) {
        winners.push({
          label: 'Narrowest bandgap',
          name: top[0].c.name,
          value: `${(top[0].n as number).toFixed(2)} eV`,
          color: '#8b5cf6',
        })
      }
    }
  }

  // ---- field meta: diff + best ----
  const NUMERIC_KEYS = ['paperCount', 'maxCitations', 'maxEfficiency', 'bandgap']
  const BEST_KEYS = ['paperCount', 'maxCitations', 'maxEfficiency']

  function isDiffRow(key: string, items: Row[]): boolean {
    if (NUMERIC_KEYS.includes(key)) {
      const nums = items
        .map((c) => parseNum((c as never)[key]))
        .filter((v): v is number => v !== null)
      if (nums.length < 2) return false
      return !nums.every((v) => v === nums[0])
    }
    const strs = items
      .map((c) => String((c as never)[key] ?? '').trim())
      .filter((s) => s !== '' && s !== '—')
    if (strs.length < 2) return false
    return !strs.every((v) => v === strs[0])
  }

  function bestIdForKey(key: string, items: Row[]): string | null {
    if (!BEST_KEYS.includes(key)) return null
    const nums = items
      .map((c) => ({ id: c.id, n: parseNum((c as never)[key]) }))
      .filter((x): x is { id: string; n: number } => x.n !== null)
    if (nums.length < 2) return null
    const max = Math.max(...nums.map((x) => x.n))
    const top = nums.filter((x) => x.n === max)
    return top.length === 1 ? top[0].id : null
  }

  const fields: Array<{ key: keyof Row; label: string }> = [
    { key: 'category', label: 'Category' },
    { key: 'paperCount', label: 'Papers' },
    { key: 'yearRange', label: 'Year range' },
    { key: 'maxCitations', label: 'Max citations' },
    { key: 'synthesized', label: 'Synthesized' },
    { key: 'bandgap', label: 'Bandgap (eV)' },
    { key: 'method', label: 'Method' },
    { key: 'conditions', label: 'Conditions' },
    { key: 'maxEfficiency', label: 'Max eff (%)' },
    { key: 'efficiencySource', label: 'Eff source' },
  ]

  const fieldMeta = fields.map((f) => {
    const diff = isDiffRow(f.key, rows)
    const bestId = diff ? bestIdForKey(f.key, rows) : null
    return { ...f, diff, bestId }
  })

  // ---- CSS bar chart data ----
  // Normalize each metric to 0-100% of max across rows.
  const chartMetrics: Array<{
    label: string
    key: keyof Row
    unit?: string
  }> = [
    { label: 'Efficiency', key: 'maxEfficiency', unit: '%' },
    { label: 'Papers', key: 'paperCount' },
    { label: 'Citations', key: 'maxCitations' },
  ]
  const COLORS = ['#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6']
  const barRows = chartMetrics.map((m) => {
    const nums = rows.map((c) => ({ c, n: parseNum((c as never)[m.key]) ?? 0 }))
    const max = Math.max(...nums.map((x) => x.n), 0)
    return {
      metric: m.label,
      unit: m.unit,
      items: nums.map((x, i) => ({
        name: x.c.name,
        value: x.n,
        pct: max > 0 ? (x.n / max) * 100 : 0,
        color: COLORS[i % COLORS.length],
      })),
    }
  })

  // ---- HTML render ----
  const dateStr = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const winnerHtml = winners.length
    ? `<div class="winners">${winners
        .map(
          (w) =>
            `<span class="winner" style="border-color:${w.color};color:${w.color}"><strong>${esc(w.label)}:</strong> ${esc(w.name)} (${esc(w.value)})</span>`,
        )
        .join('')}</div>`
    : ''

  const tableHead = `<tr><th class="sticky">Field</th>${rows
    .map((c) => `<th>${esc(c.name)}</th>`)
    .join('')}</tr>`

  const tableBody = fieldMeta
    .map((f) => {
      const cells = rows
        .map((c) => {
          const val = (c as never)[f.key]
          const isBest = f.bestId === c.id
          let display: string
          if (f.key === 'maxEfficiency') {
            if (val === null || val === undefined) {
              display = '<span class="muted">—</span>'
            } else {
              display = `${Number(val).toFixed(2)}%${c.efficiencyCertified ? ' ✓' : ''}${
                isBest ? ' ★ best' : ''
              }`
            }
          } else if (typeof val === 'number') {
            display = `${val}${isBest ? ' ★' : ''}`
          } else {
            const s = String(val ?? '').trim()
            display = s && s !== '—' ? esc(s) : '<span class="muted">—</span>'
          }
          const cls = isBest ? 'cell best' : 'cell'
          return `<td class="${cls}">${display}</td>`
        })
        .join('')
      const rowCls = f.diff ? 'row-diff' : ''
      const label = f.key === 'maxEfficiency' && f.bestId ? `${f.label} ★` : f.label
      return `<tr class="${rowCls}"><td class="sticky">${esc(label)}</td>${cells}</tr>`
    })
    .join('')

  // CSS bar chart: for each metric, a row of horizontal bars (one per material)
  const chartHtml = barRows
    .map(
      (m) => `
      <div class="metric-block">
        <div class="metric-label">${esc(m.metric)}${m.unit ? ` <span class="unit">(${esc(m.unit)})</span>` : ''}</div>
        <div class="bars">
          ${m.items
            .map(
              (it) => `
            <div class="bar-row">
              <div class="bar-name">${esc(it.name)}</div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${it.pct}%;background:${it.color}"></div>
              </div>
              <div class="bar-val">${it.value}${m.unit ? m.unit : ''}</div>
            </div>
          `,
            )
            .join('')}
        </div>
      </div>
    `,
    )
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MatLit Miner — Material Comparison Report</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1e293b;
    background: #fff;
    margin: 0;
    padding: 2rem 2.5rem;
    max-width: 1100px;
    margin: 0 auto;
    line-height: 1.5;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 3px solid #10b981;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
    gap: 1rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .brand-logo {
    width: 36px; height: 36px;
    border-radius: 8px;
    background: linear-gradient(135deg, #10b981, #059669);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 18px;
  }
  .brand-name { font-size: 1.25rem; font-weight: 700; color: #0f172a; }
  .brand-sub { font-size: 0.75rem; color: #64748b; }
  .meta { text-align: right; font-size: 0.78rem; color: #64748b; }
  .meta .date { font-weight: 600; color: #0f172a; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem 0; color: #0f172a; }
  .subtitle { color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; }

  .toolbar {
    display: flex; gap: 0.5rem; margin-bottom: 1.5rem;
    padding: 0.75rem 1rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .toolbar .info { font-size: 0.78rem; color: #64748b; flex: 1; min-width: 200px; }
  .btn {
    background: #10b981; color: #fff; border: none;
    padding: 0.5rem 1rem; border-radius: 6px;
    font-size: 0.85rem; font-weight: 600;
    cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;
  }
  .btn:hover { background: #059669; }
  .btn-secondary { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
  .btn-secondary:hover { background: #f1f5f9; }

  .winners { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.5rem; }
  .winner {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.3rem 0.7rem; border-radius: 999px;
    border: 1.5px solid; background: #fff;
    font-size: 0.8rem;
  }
  .winner strong { font-weight: 600; }

  .legend {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.75rem; color: #64748b; margin-bottom: 0.75rem;
  }
  .legend-swatch {
    width: 14px; height: 14px; border-radius: 3px;
    background: #fef3c7; border: 1px solid #f59e0b;
  }

  table {
    width: 100%; border-collapse: collapse;
    font-size: 0.8rem;
    border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;
  }
  th, td {
    padding: 0.5rem 0.6rem; text-align: left;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  thead th {
    background: #f1f5f9; font-weight: 700; color: #0f172a;
    border-bottom: 2px solid #cbd5e1;
    position: sticky; top: 0;
  }
  th.sticky, td.sticky {
    position: sticky; left: 0; z-index: 1;
    background: #f1f5f9; font-weight: 600; color: #475569;
    border-right: 1px solid #e2e8f0; min-width: 110px;
  }
  thead th.sticky { z-index: 2; }
  tbody tr.row-diff { background: #fef3c7; }
  tbody tr.row-diff td.sticky { background: #fde68a; }
  td.cell { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  td.best { color: #10b981; font-weight: 700; }
  .muted { color: #94a3b8; }

  .chart-section {
    margin-top: 2rem; padding-top: 1.5rem;
    border-top: 2px dashed #e2e8f0;
  }
  .chart-section h2 {
    font-size: 1.05rem; margin: 0 0 0.75rem 0; color: #0f172a;
  }
  .metric-block { margin-bottom: 1.25rem; }
  .metric-label {
    font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 0.4rem;
  }
  .metric-label .unit { color: #94a3b8; font-weight: 400; font-size: 0.7rem; }
  .bars { display: flex; flex-direction: column; gap: 0.3rem; }
  .bar-row {
    display: grid; grid-template-columns: 140px 1fr 60px;
    align-items: center; gap: 0.5rem; font-size: 0.75rem;
  }
  .bar-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #334155; text-align: right; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .bar-track {
    height: 14px; background: #f1f5f9; border-radius: 3px;
    border: 1px solid #e2e8f0; overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 2px 0 0 2px; }
  .bar-val {
    font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums;
    font-size: 0.72rem;
  }

  .footer {
    margin-top: 2.5rem; padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
    font-size: 0.7rem; color: #94a3b8;
    display: flex; justify-content: space-between;
  }

  @media print {
    body { padding: 0; max-width: none; }
    .toolbar, .btn { display: none !important; }
    .header { page-break-after: avoid; }
    table, .chart-section { page-break-inside: avoid; }
    th.sticky, td.sticky { position: static; }
    thead th { position: static; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-logo">M</div>
      <div>
        <div class="brand-name">MatLit Miner</div>
        <div class="brand-sub">Material Literature Mining Assistant</div>
      </div>
    </div>
    <div class="meta">
      <div class="date">${esc(dateStr)}</div>
      <div>Report · Material Comparison</div>
    </div>
  </div>

  <h1>Material Comparison Report</h1>
  <div class="subtitle">
    Side-by-side comparison of ${rows.length} materials, generated from the MatLit Miner database.
  </div>

  <div class="toolbar">
    <div class="info">
      Tip: use your browser's "Save as PDF" option in the print dialog to export this report.
    </div>
    <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">Close</button>
  </div>

  ${winnerHtml}

  <div class="legend">
    <span class="legend-swatch"></span>
    Highlighted rows have different values across materials. ★ marks the best material per metric.
  </div>

  <table>
    <thead>${tableHead}</thead>
    <tbody>${tableBody}</tbody>
  </table>

  <div class="chart-section">
    <h2>Normalized Bar Chart Comparison</h2>
    <p style="font-size:0.75rem;color:#64748b;margin:0 0 0.75rem 0">
      Bars scaled to the maximum value across the compared materials (per metric).
    </p>
    ${chartHtml}
  </div>

  <div class="footer">
    <span>Generated by MatLit Miner · All AI-extracted data must be cross-verified against the linked DOI.</span>
    <span>${rows.length} materials · ${fields.length} fields</span>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
