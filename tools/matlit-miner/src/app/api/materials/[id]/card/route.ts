import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/materials/[id]/card
//
// G11 — Material share card image.
//
// Fetches the material's key stats (name, category, best bandgap,
// best PCE, paper count, latest verification status) and renders a
// self-contained, print-friendly HTML "material card" with a teal/emerald
// gradient background, MatLit Miner branding, and large stat blocks.
//
// Returns Content-Type: text/html so the browser renders it directly.
// The user can:
//   - screenshot it,
//   - use the browser's "Save as image" / "Print to PDF",
//   - or just share the URL.
//
// Status codes:
//   200 — HTML page rendered (even if some stats are missing — the card
//         gracefully shows "—" placeholders).
//   404 — material id not found in DB.
//
// Design notes:
//   - Inline CSS so the page is fully self-contained (no external
//     stylesheet / font fetches) — works in screenshot tools, prints
//     cleanly, and survives being opened from any host.
//   - The card is a fixed 1080×1350 portrait (Instagram / WeChat
//     share-card friendly aspect ratio) centered on a soft slate
//     backdrop. A small action bar floats top-right with a "Print /
//     Save as PDF" button that triggers `window.print()` — print CSS
//     hides everything except the card.
//   - Verification status drives the accent color of the status pill:
//     verified → emerald, flagged → amber, rejected → rose, pending →
//     slate. The card's gradient stays consistent so branding reads
//     through regardless of status.

interface CardData {
  name: string
  category: string
  aliases: string
  bandgap: string
  efficiency: string
  efficiencySource: string
  paperCount: number
  verificationStatus: string
  notes: string
}

async function loadCardData(id: string): Promise<CardData | null> {
  const material = await db.material.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      category: true,
      aliases: true,
      notes: true,
      _count: { select: { papers: true } },
    },
  })
  if (!material) return null

  // Best bandgap = highest-confidence "synthesized=yes" classification
  // that reported a bandgap. Fall back to the highest-confidence row
  // with a bandgap value regardless of synthesized flag.
  const bandgapRows = await db.classification.findMany({
    where: { materialId: id, bandgapValue: { not: '' } },
    orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
    take: 1,
    select: { bandgapValue: true },
  })

  // Best efficiency = highest PCE from the Efficiency table (NREL /
  // Perovskite Database / literature). Prefer certified rows on ties.
  const efficiencyRows = await db.efficiency.findMany({
    where: { materialId: id, efficiencyValue: { gt: 0 } },
    orderBy: [{ efficiencyValue: 'desc' }, { certified: 'desc' }],
    take: 1,
    select: { efficiencyValue: true, source: true, certified: true },
  })

  // Latest verification record (any status) — pending if none exists.
  const verificationRows = await db.verification.findMany({
    where: { materialId: id },
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: { status: true },
  })

  return {
    name: material.name,
    category: material.category,
    aliases: material.aliases,
    bandgap: bandgapRows[0]?.bandgapValue ?? '',
    efficiency: efficiencyRows[0]
      ? efficiencyRows[0].efficiencyValue.toFixed(2)
      : '',
    efficiencySource: efficiencyRows[0]?.source ?? '',
    paperCount: material._count.papers,
    verificationStatus: verificationRows[0]?.status ?? 'pending',
    notes: material.notes,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function statusPill(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'verified':
      return { label: 'Verified', bg: 'rgba(16,185,129,0.18)', fg: '#a7f3d0' }
    case 'flagged':
      return { label: 'Flagged', bg: 'rgba(245,158,11,0.18)', fg: '#fcd34d' }
    case 'rejected':
      return { label: 'Rejected', bg: 'rgba(244,63,94,0.18)', fg: '#fda4af' }
    default:
      return { label: 'Pending', bg: 'rgba(148,163,184,0.18)', fg: '#cbd5e1' }
  }
}

function categoryColor(category: string): string {
  switch (category.toLowerCase()) {
    case 'perovskite':
      return '#34d399'
    case 'chalcogenide':
      return '#fbbf24'
    case 'oxide':
      return '#f472b6'
    default:
      return '#60a5fa'
  }
}

function renderCardHtml(d: CardData): string {
  const pill = statusPill(d.verificationStatus)
  const catColor = categoryColor(d.category)
  // bandgapValue is stored as raw text (often "1.55 eV" or "1.55"); strip
  // any trailing unit so the card template can append its own "eV".
  const bandgapNum = d.bandgap
    ? d.bandgap.replace(/\s*eV\s*$/i, '').trim()
    : ''
  const bandgapDisplay = bandgapNum || (d.bandgap ? escapeHtml(d.bandgap) : '—')
  const effDisplay = d.efficiency ? escapeHtml(d.efficiency) : '—'
  const effUnit = d.efficiency ? '<span class="unit">%</span>' : ''
  const aliases = d.aliases
    ? d.aliases
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map(escapeHtml)
        .join(' · ')
    : ''
  const generatedAt = new Date().toISOString().slice(0, 10)
  const notes =
    d.notes && d.notes.trim()
      ? escapeHtml(d.notes.trim().slice(0, 220))
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MatLit Miner — ${escapeHtml(d.name)} share card</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    min-height: 100%;
    background: #0f172a;
    color: #e2e8f0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
      "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 32px 16px;
    background:
      radial-gradient(900px 600px at 10% 10%, rgba(16,185,129,0.12), transparent 60%),
      radial-gradient(900px 600px at 90% 90%, rgba(20,184,166,0.12), transparent 60%),
      #0f172a;
  }
  .stage {
    position: relative;
    width: 1080px;
    max-width: 100%;
  }
  .toolbar {
    position: absolute;
    top: -44px;
    right: 0;
    display: flex;
    gap: 8px;
  }
  .toolbar a, .toolbar button {
    font: 600 12px/1 inherit;
    color: #cbd5e1;
    background: rgba(30,41,59,0.85);
    border: 1px solid rgba(148,163,184,0.25);
    border-radius: 8px;
    padding: 8px 12px;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .toolbar a:hover, .toolbar button:hover {
    background: rgba(51,65,85,0.95);
    color: #f1f5f9;
  }
  .card {
    width: 1080px;
    max-width: 100%;
    aspect-ratio: 1080 / 1350;
    border-radius: 28px;
    overflow: hidden;
    position: relative;
    box-shadow:
      0 30px 80px -20px rgba(0,0,0,0.6),
      0 0 0 1px rgba(255,255,255,0.06) inset;
    background:
      radial-gradient(700px 500px at 85% -10%, rgba(45,212,191,0.45), transparent 60%),
      radial-gradient(700px 500px at -10% 110%, rgba(16,185,129,0.45), transparent 60%),
      linear-gradient(135deg, #042f2e 0%, #064e3b 45%, #0f766e 100%);
    color: #ecfeff;
    padding: 56px 56px 48px;
    display: flex;
    flex-direction: column;
  }
  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
    mask-image: radial-gradient(ellipse at 50% 40%, black 30%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse at 50% 40%, black 30%, transparent 80%);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
    z-index: 1;
  }
  .brand .logo {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: linear-gradient(135deg, #34d399, #14b8a6 60%, #06b6d4);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    color: #042f2e;
    font-size: 22px;
    box-shadow: 0 8px 24px -4px rgba(20,184,166,0.55);
  }
  .brand .name {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #99f6e4;
  }
  .brand .sub {
    font-size: 11px;
    color: rgba(204,251,241,0.65);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .pill {
    margin-left: auto;
    align-self: flex-start;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: ${pill.bg};
    color: ${pill.fg};
    border: 1px solid rgba(255,255,255,0.08);
  }
  .hero {
    position: relative;
    z-index: 1;
    margin-top: 56px;
  }
  .category {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 6px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${catColor};
  }
  .material-name {
    margin-top: 18px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
      "Liberation Mono", monospace;
    font-size: 84px;
    font-weight: 800;
    line-height: 1.02;
    letter-spacing: -0.02em;
    color: #ffffff;
    word-break: break-word;
    text-shadow: 0 4px 24px rgba(0,0,0,0.35);
  }
  .aliases {
    margin-top: 14px;
    font-size: 14px;
    color: rgba(204,251,241,0.75);
    letter-spacing: 0.02em;
  }
  .stats {
    position: relative;
    z-index: 1;
    margin-top: auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .stat {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 22px 24px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .stat .label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(153,246,228,0.85);
  }
  .stat .value {
    margin-top: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 52px;
    font-weight: 800;
    line-height: 1;
    color: #ffffff;
    letter-spacing: -0.02em;
  }
  .stat .value .unit {
    font-size: 24px;
    font-weight: 600;
    color: rgba(204,251,241,0.7);
    margin-left: 4px;
  }
  .stat .hint {
    margin-top: 6px;
    font-size: 11px;
    color: rgba(204,251,241,0.55);
  }
  .row {
    position: relative;
    z-index: 1;
    margin-top: 16px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
  }
  .mini {
    background: rgba(0,0,0,0.18);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 14px 16px;
  }
  .mini .label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(153,246,228,0.7);
  }
  .mini .value {
    margin-top: 4px;
    font-size: 22px;
    font-weight: 700;
    color: #f0fdfa;
  }
  .footer {
    position: relative;
    z-index: 1;
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid rgba(255,255,255,0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: rgba(204,251,241,0.6);
    letter-spacing: 0.04em;
  }
  .footer .url {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: rgba(153,246,228,0.85);
  }
  .notes {
    position: relative;
    z-index: 1;
    margin-top: 18px;
    font-size: 13px;
    line-height: 1.5;
    color: rgba(236,254,255,0.78);
    border-left: 3px solid rgba(45,212,191,0.55);
    padding: 6px 0 6px 14px;
    max-height: 5em;
    overflow: hidden;
  }
  @media print {
    body { background: #042f2e; padding: 0; }
    .toolbar { display: none; }
    .card { box-shadow: none; border-radius: 0; }
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print / Save as PDF</button>
    </div>
    <div class="card">
      <div class="grid-overlay" aria-hidden="true"></div>
      <div class="brand">
        <div class="logo" aria-hidden="true">M</div>
        <div>
          <div class="name">MatLit Miner</div>
          <div class="sub">Material Literature Mining</div>
        </div>
        <span class="pill" title="Verification status">${pill.label}</span>
      </div>
      <div class="hero">
        <span class="category">${escapeHtml(d.category)}</span>
        <h1 class="material-name">${escapeHtml(d.name)}</h1>
        ${aliases ? `<div class="aliases">${aliases}</div>` : ''}
        ${
          notes
            ? `<div class="notes" title="Material notes">${notes}${
                d.notes.length > 220 ? '…' : ''
              }</div>`
            : ''
        }
      </div>
      <div class="stats">
        <div class="stat">
          <div class="label">Bandgap</div>
          <div class="value">${bandgapDisplay}${
            d.bandgap ? '<span class="unit">eV</span>' : ''
          }</div>
          <div class="hint">Best reported (high-confidence)</div>
        </div>
        <div class="stat">
          <div class="label">Champion PCE</div>
          <div class="value">${effDisplay}${effUnit}</div>
          <div class="hint">${
            d.efficiencySource ? escapeHtml(d.efficiencySource) : 'No record yet'
          }</div>
        </div>
      </div>
      <div class="row">
        <div class="mini">
          <div class="label">Papers</div>
          <div class="value">${d.paperCount}</div>
        </div>
        <div class="mini">
          <div class="label">Verification</div>
          <div class="value" style="text-transform: capitalize;">${escapeHtml(
            d.verificationStatus,
          )}</div>
        </div>
        <div class="mini">
          <div class="label">Category</div>
          <div class="value">${escapeHtml(d.category)}</div>
        </div>
      </div>
      <div class="footer">
        <span>Generated ${escapeHtml(generatedAt)} · MatLit Miner</span>
        <span class="url">/api/materials/&lt;id&gt;/card</span>
      </div>
    </div>
  </div>
</body>
</html>`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const data = await loadCardData(id)
  if (!data) {
    return new NextResponse('Material not found', { status: 404 })
  }
  const html = renderCardHtml(data)
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // Allow rendering inside <iframe> previews (the Share Card dialog
      // could embed this URL in an iframe in the future). Mirrors the
      // open-in-new-tab default.
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
