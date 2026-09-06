import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Per-material reviewer notes thread.
//
// URL: /api/verify/[id]/notes?project=default
//   - [id] is the *materialId* (consistent with /assign above and the rest
//     of the codebase).
//
// The notes log lives inside the existing `notes` field on the Verification
// record. Each entry is a single line of the form:
//   `[<iso-timestamp>] <reviewer>: <note>`
// Lines that don't match this pattern (e.g. legacy free-text notes saved by
// the original textarea) are returned as a single "legacy" entry so the
// reviewer doesn't lose prior context.

interface NoteEntry {
  timestamp: string // ISO 8601 or '' for legacy entries
  reviewer: string
  note: string
  legacy?: boolean
}

// Parse the notes log into structured entries (newest last — caller decides
// display order). Tolerates mixed legacy free-text and structured lines.
export function parseNotesLog(raw: string): NoteEntry[] {
  if (!raw || raw.trim() === '') return []
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '')
  const entries: NoteEntry[] = []
  const legacyBuffer: string[] = []

  const flushLegacy = () => {
    if (legacyBuffer.length === 0) return
    entries.push({
      timestamp: '',
      reviewer: '',
      note: legacyBuffer.join('\n'),
      legacy: true,
    })
    legacyBuffer.length = 0
  }

  for (const line of lines) {
    // Match `[<iso-timestamp>] <reviewer>: <note>` — reviewer may contain
    // spaces but not a colon, and the note extends to end of line.
    const m = line.match(/^\[(\S+)\]\s+([^:]+):\s?(.*)$/)
    if (m) {
      flushLegacy()
      entries.push({ timestamp: m[1], reviewer: m[2].trim(), note: m[3] })
    } else {
      legacyBuffer.push(line)
    }
  }
  flushLegacy()
  return entries
}

function appendNoteLog(existingNotes: string, reviewer: string, note: string): string {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${reviewer}: ${note}`
  if (!existingNotes || existingNotes.trim() === '') return line
  return existingNotes.endsWith('\n') ? `${existingNotes}${line}` : `${existingNotes}\n${line}`
}

interface NotesBody {
  reviewer?: string
  note?: string
}

// GET /api/verify/[id]/notes?project=default
// Returns: { notes: NoteEntry[], reviewer: string }
// - `notes` is the parsed log (oldest → newest; UI reverses for display).
// - `reviewer` is the current assigned reviewer ('anonymous' if unset).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: materialId } = await params
  if (!materialId) {
    return NextResponse.json({ error: 'material id is required' }, { status: 400 })
  }
  const url = new URL(_req.url)
  const project = url.searchParams.get('project') || 'default'

  const existing = await db.verification.findFirst({
    where: { materialId, project },
    orderBy: { updatedAt: 'desc' },
  })

  const notes = parseNotesLog(existing?.notes ?? '')
  return NextResponse.json({
    notes,
    reviewer: existing?.reviewer ?? 'anonymous',
    updatedAt: existing?.updatedAt ?? null,
  })
}

// POST /api/verify/[id]/notes?project=default
// Body: { reviewer: string, note: string }
// Appends a single note entry to the notes log. Does NOT change the
// assigned reviewer (use /assign for that). Creates the verification
// record if it doesn't yet exist so notes can be left pre-assignment.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: materialId } = await params
  if (!materialId) {
    return NextResponse.json({ error: 'material id is required' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as NotesBody
  const reviewer = (body.reviewer ?? '').trim()
  const note = (body.note ?? '').trim()
  if (!reviewer) {
    return NextResponse.json({ error: 'reviewer is required' }, { status: 400 })
  }
  if (!note) {
    return NextResponse.json({ error: 'note is required' }, { status: 400 })
  }

  const url = new URL(req.url)
  const project = url.searchParams.get('project') || 'default'

  const existing = await db.verification.findFirst({
    where: { materialId, project },
    orderBy: { updatedAt: 'desc' },
  })

  const nextNotes = appendNoteLog(existing?.notes ?? '', reviewer, note)

  let record
  if (existing) {
    record = await db.verification.update({
      where: { id: existing.id },
      data: { notes: nextNotes },
    })
  } else {
    // Create with the supplied reviewer so the notes have a clear owner.
    record = await db.verification.create({
      data: {
        materialId,
        reviewer,
        notes: nextNotes,
        status: 'pending',
        checkedFields: '',
        doiChecked: '',
        project,
      },
    })
  }

  // Q6 — broadcast the new note to subscribers of this material so other
  // reviewers see it appear live. Best-effort: never fail the main response
  // if the emit fails (realtime service down, network blip, etc.). The base
  // URL is configurable via `process.env.REALTIME_HTTP_URL`.
  fetch(`${process.env.REALTIME_HTTP_URL || 'http://localhost:3005'}/emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'comment:new',
      data: {
        targetType: 'material',
        targetId: materialId,
        author: reviewer,
        text: note,
        createdAt: new Date().toISOString(),
      },
      // Restrict broadcast to clients subscribed to this material's room so
      // reviewers on other materials aren't pinged.
      room: `material:${materialId}`,
    }),
  }).catch(() => {})

  return NextResponse.json(
    {
      record,
      notes: parseNotesLog(record.notes),
    },
    { status: 201 },
  )
}
