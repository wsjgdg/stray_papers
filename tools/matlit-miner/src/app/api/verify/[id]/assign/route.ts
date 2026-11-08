import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/cache'

// Collaborative reviewer assignment for a Verification record.
//
// URL: /api/verify/[id]/assign?project=default
//   - [id] is the *materialId* (not the verification id) — this matches the
//     rest of the codebase where verifications are looked up by materialId.
//   - `project` query param scopes the verification record (one per
//     material + project, mirroring POST /api/verify).
//
// The notes field is reused as a chronological reviewer-notes log. Each
// assignment (and each /notes POST) appends a single line of the form:
//   `[<iso-timestamp>] <reviewer>: <note>`
// Older free-text notes that don't match this pattern are preserved as-is
// (shown as legacy entries by the GET /notes parser).

interface AssignBody {
  reviewer?: string
  note?: string
}

function appendNoteLog(existingNotes: string, reviewer: string, note: string): string {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${reviewer}: ${note}`
  if (!existingNotes || existingNotes.trim() === '') return line
  // Always append on a new line so the log stays parseable.
  return existingNotes.endsWith('\n') ? `${existingNotes}${line}` : `${existingNotes}\n${line}`
}

// POST /api/verify/[id]/assign
// Body: { reviewer: string, note?: string }
// - Updates the Verification record's `reviewer` field.
// - If `note` is non-empty, also appends it to the notes log.
// - Creates the verification record if one doesn't yet exist for this
//   material + project (so assignment works before the first manual save).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: materialId } = await params
  if (!materialId) {
    return NextResponse.json({ error: 'material id is required' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as AssignBody
  const reviewer = (body.reviewer ?? '').trim()
  const note = (body.note ?? '').trim()
  if (!reviewer) {
    return NextResponse.json({ error: 'reviewer is required' }, { status: 400 })
  }

  const url = new URL(req.url)
  const project = url.searchParams.get('project') || 'default'

  // Look up the existing verification for this material + project.
  const existing = await db.verification.findFirst({
    where: { materialId, project },
    orderBy: { updatedAt: 'desc' },
  })

  const nextNotes = note ? appendNoteLog(existing?.notes ?? '', reviewer, note) : (existing?.notes ?? '')

  let record
  if (existing) {
    record = await db.verification.update({
      where: { id: existing.id },
      data: { reviewer, notes: nextNotes, project },
    })
  } else {
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

  // Reviewer changes affect stats/coverage (assigned != pending).
  invalidate('stats:')
  invalidate('coverage')

  return NextResponse.json({ record }, { status: 201 })
}
