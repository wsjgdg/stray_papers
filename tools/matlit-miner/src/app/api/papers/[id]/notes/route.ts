import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/papers/[id]/notes
// Returns the paper's user notes (empty string if none).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const paper = await db.paper.findUnique({
    where: { id },
    select: { notes: true },
  })
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
  }
  return NextResponse.json({ notes: paper.notes ?? '' })
}

// PUT /api/papers/[id]/notes
// Body: { notes: string }
// Updates the paper's notes field and returns the updated paper.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let body: { notes?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const notes = typeof body.notes === 'string' ? body.notes : ''
  // Cap note length to keep the column tidy (schema uses TEXT, but be defensive).
  const safeNotes = notes.slice(0, 50_000)

  try {
    const updated = await db.paper.update({
      where: { id },
      data: { notes: safeNotes },
      select: { id: true, notes: true },
    })
    return NextResponse.json({ ok: true, paperId: updated.id, notes: updated.notes })
  } catch {
    // update throws P2025 if the record does not exist
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
  }
}
