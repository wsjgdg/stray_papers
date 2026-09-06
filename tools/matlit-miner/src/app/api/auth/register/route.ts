import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

/**
 * POST /api/auth/register
 * Body: { email, password, name? }
 *
 * Creates a new user with a bcrypt-hashed password. Does NOT auto-login —
 * the client should call signIn("credentials", ...) afterwards.
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { email, password, name } = (body ?? {}) as {
    email?: unknown
    password?: unknown
    name?: unknown
  }

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    )
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 },
    )
  }

  const trimmedName =
    typeof name === "string" && name.trim().length > 0 ? name.trim() : null

  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
  })
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    )
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: trimmedName,
    },
    select: { id: true, email: true, name: true, createdAt: true },
  })

  return NextResponse.json(
    { ok: true, user: { id: user.id, email: user.email, name: user.name } },
    { status: 201 },
  )
}
