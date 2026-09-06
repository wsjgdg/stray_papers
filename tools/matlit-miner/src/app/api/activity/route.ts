import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/activity
// Returns two views over recent activity:
//   - `activities`  : the 12 most-recent events (used by ActivityTimeline).
//   - `heatmap`     : per-day totals for the last 90 days (used by the dashboard
//                     contribution heatmap). Each entry is
//                     { date: 'YYYY-MM-DD', count: N, types: { papers, classify, extract, verify } }.
//
// Both shapes are returned in a single response so a single network round-trip
// can populate the timeline and the heatmap. The existing ActivityTimeline
// component reads only `data.activities`, so adding `heatmap` is backwards-
// compatible.

// ---------------------------------------------------------------------------
// 90-day heatmap helpers
// ---------------------------------------------------------------------------

const HEATMAP_DAYS = 90

interface HeatmapEntry {
  date: string // YYYY-MM-DD (UTC)
  count: number
  types: { papers: number; classify: number; extract: number; verify: number }
}

/** Format a Date as YYYY-MM-DD using UTC (stable across server / client). */
function utcDateKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Build a 90-entry heatmap (one row per UTC day, oldest → newest). */
async function buildHeatmap(): Promise<HeatmapEntry[]> {
  // Start of the UTC day 89 days ago — inclusive 90-day window ending today.
  const now = new Date()
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const sinceMs = todayUTC - (HEATMAP_DAYS - 1) * 24 * 60 * 60 * 1000
  const since = new Date(sinceMs)

  // Pull only createdAt for every record in the window. SQLite is fast for
  // narrow selects — and we group in JS because Prisma's `groupBy` on a
  // date-truncated field is awkward on SQLite.
  const [papers, classifications, extractions, verifications] = await Promise.all([
    db.paper.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.classification.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.extractionJob.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.verification.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ])

  // Pre-seed all 90 days so the heatmap renders contiguous (no gaps if a day
  // has zero events).
  const map = new Map<string, HeatmapEntry>()
  for (let i = 0; i < HEATMAP_DAYS; i++) {
    const d = new Date(sinceMs + i * 24 * 60 * 60 * 1000)
    const key = utcDateKey(d)
    map.set(key, { date: key, count: 0, types: { papers: 0, classify: 0, extract: 0, verify: 0 } })
  }

  const bump = (record: { createdAt: Date }, field: 'papers' | 'classify' | 'extract' | 'verify') => {
    const key = utcDateKey(record.createdAt)
    const entry = map.get(key)
    if (!entry) return // outside the 90-day window (shouldn't happen given the `gte` filter)
    entry.types[field] += 1
    entry.count += 1
  }

  papers.forEach((p) => bump(p, 'papers'))
  classifications.forEach((c) => bump(c, 'classify'))
  extractions.forEach((e) => bump(e, 'extract'))
  verifications.forEach((v) => bump(v, 'verify'))

  // Return oldest → newest (left → right in the heatmap grid).
  return Array.from(map.values())
}

// ---------------------------------------------------------------------------
// Recent-activity timeline (unchanged from prior implementation)
// ---------------------------------------------------------------------------

export async function GET() {
  const [recentPapers, recentClassifications, recentExtractions, recentEfficiencies, heatmap] = await Promise.all([
    db.paper.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, year: true, createdAt: true, material: { select: { name: true } }, source: true },
    }),
    db.classification.findMany({
      where: { status: 'classified' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, synthesized: true, confidence: true, updatedAt: true, paper: { select: { title: true, material: { select: { name: true } } } } },
    }),
    db.classification.findMany({
      where: { status: 'extracted' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, bandgapValue: true, efficiencyValue: true, updatedAt: true, paper: { select: { title: true, material: { select: { name: true } } } } },
    }),
    db.efficiency.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, efficiencyValue: true, certified: true, source: true, createdAt: true, material: { select: { name: true } } },
    }),
    buildHeatmap(),
  ])

  type Activity = {
    type: 'paper' | 'classification' | 'extraction' | 'efficiency'
    ts: Date
    title: string
    detail: string
    material: string
  }

  const activities: Activity[] = [
    ...recentPapers.map((p) => ({
      type: 'paper' as const,
      ts: p.createdAt,
      title: p.title,
      detail: `via ${p.source}`,
      material: p.material.name,
    })),
    ...recentClassifications.map((c) => ({
      type: 'classification' as const,
      ts: c.updatedAt,
      title: c.paper.title,
      detail: `synth: ${c.synthesized} (${(c.confidence * 100).toFixed(0)}%)`,
      material: c.paper.material.name,
    })),
    ...recentExtractions.map((c) => ({
      type: 'extraction' as const,
      ts: c.updatedAt,
      title: c.paper.title,
      detail: c.bandgapValue ? `Eg=${c.bandgapValue} eV` : c.efficiencyValue ? `η=${c.efficiencyValue}%` : 'extracted',
      material: c.paper.material.name,
    })),
    ...recentEfficiencies.map((e) => ({
      type: 'efficiency' as const,
      ts: e.createdAt,
      title: `${e.efficiencyValue.toFixed(2)}%${e.certified ? ' (certified)' : ''}`,
      detail: e.source,
      material: e.material.name,
    })),
  ]

  // Sort by timestamp desc, take top 12
  activities.sort((a, b) => b.ts.getTime() - a.ts.getTime())
  const top = activities.slice(0, 12)

  return NextResponse.json({
    activities: top.map((a) => ({
      ...a,
      ts: a.ts.toISOString(),
    })),
    heatmap,
  })
}
